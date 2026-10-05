/**
 * Verrou d'accès du site Netlify (v4.0.1) : la version publiée sur notre site
 * n'est ouverte qu'à un nombre limité d'appareils (deux par défaut).
 *
 * Principe (aucun mot de passe partagé, aucune donnée personnelle) :
 *  - le propriétaire définit des clés d'invitation secrètes (une par appareil)
 *    dans les variables d'environnement Netlify (ACCESS_KEYS) ;
 *  - la première fois qu'une clé est saisie, elle est LIÉE à l'appareil (au
 *    navigateur) qui l'a utilisée : un identifiant aléatoire est mémorisé côté
 *    Netlify (Blobs) et dans un cookie signé (HMAC-SHA-256, HttpOnly, Secure) ;
 *  - la même clé saisie ensuite sur un autre appareil est refusée ;
 *  - sans cookie valide, le site répond 401 (page de saisie de la clé) : ni le
 *    jeu, ni ses fichiers ne sont servis, et rien n'est indexé.
 *
 * Retirer un appareil : remplacer sa clé dans ACCESS_KEYS puis redéployer
 * (l'ancien cookie ne correspond plus à aucune clé).
 *
 * Ce module ne dépend ni de Netlify ni de Deno : la fonction edge lui fournit
 * l'environnement, le stockage et l'horloge, et les tests (Node) des doubles.
 */

export const COOKIE = 'cm_pass'
export const CLAIM_PATH = '/__acces'
/** Durée du cookie : 400 jours (maximum accepté par les navigateurs). */
export const COOKIE_MAX_AGE = 400 * 24 * 3600
/** Une clé doit être longue et aléatoire : impossible à deviner par essais. */
const KEY_PATTERN = /^[A-Za-z0-9_-]{20,128}$/
const DEVICE_PATTERN = /^[0-9a-f]{32}$/
const KID_PATTERN = /^[0-9a-f]{16}$/
const SIG_PATTERN = /^[0-9a-f]{64}$/
/** Les liaisons lues sont gardées en mémoire quelques minutes (moins de lectures). */
const CACHE_MS = 5 * 60 * 1000

const enc = new TextEncoder()
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')

/** Comparaison en temps constant (ne révèle pas, par sa durée, où deux textes diffèrent). */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Lit et vérifie la configuration ; renvoie null si elle est absente ou invalide. */
export function readConfig(env) {
  const keys = String(env.ACCESS_KEYS ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
  const secret = String(env.GATE_SECRET ?? '')
  if (!keys.length || keys.length > 10 || !keys.every((k) => KEY_PATTERN.test(k)) || new Set(keys).size !== keys.length) return null
  if (secret.length < 32) return null
  return { keys, secret }
}

export class AccessGate {
  /**
   * @param {{ keys: string[], secret: string }} config
   * @param {{ get(key: string): Promise<string|null>, set(key: string, value: string): Promise<void> }} store
   * @param {{ crypto?: Crypto, now?: () => number }} [deps]
   */
  constructor(config, store, { crypto = globalThis.crypto, now = () => Date.now() } = {}) {
    this.config = config
    this.store = store
    this.crypto = crypto
    this.now = now
    this.cache = new Map()
    this.hmacKey = null
  }

  /** Identifiant public d'une clé (empreinte courte) : la clé elle-même n'est jamais stockée. */
  async kid(key) {
    return hex(await this.crypto.subtle.digest('SHA-256', enc.encode(`kid:${key}`))).slice(0, 16)
  }

  async sign(text) {
    this.hmacKey ??= await this.crypto.subtle.importKey('raw', enc.encode(this.config.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    return hex(await this.crypto.subtle.sign('HMAC', this.hmacKey, enc.encode(text)))
  }

  async kids() {
    this.kidList ??= await Promise.all(this.config.keys.map((k) => this.kid(k)))
    return this.kidList
  }

  async boundDevice(kid) {
    const hit = this.cache.get(kid)
    if (hit && this.now() - hit.at < CACHE_MS) return hit.device
    const device = await this.store.get(`device-${kid}`)
    const value = typeof device === 'string' && DEVICE_PATTERN.test(device) ? device : null
    this.cache.set(kid, { device: value, at: this.now() })
    return value
  }

  /** Le cookie reçu ouvre-t-il l'accès ? (signature, clé toujours valide, appareil lié) */
  async allows(cookie) {
    if (typeof cookie !== 'string' || cookie.length > 120) return false
    const [kid, device, sig, extra] = cookie.split('.')
    if (extra !== undefined || !KID_PATTERN.test(kid ?? '') || !DEVICE_PATTERN.test(device ?? '') || !SIG_PATTERN.test(sig ?? '')) return false
    if (!safeEqual(sig, await this.sign(`${kid}.${device}`))) return false
    if (!(await this.kids()).includes(kid)) return false
    return safeEqual(device, (await this.boundDevice(kid)) ?? '')
  }

  /**
   * Saisie d'une clé. Renvoie :
   *  - { status: 'granted', cookie } : clé libre, désormais liée à cet appareil ;
   *  - { status: 'granted', cookie } : clé déjà liée à CET appareil (cookie restauré) ;
   *  - { status: 'taken' } : clé déjà liée à un autre appareil ;
   *  - { status: 'invalid' } : clé inconnue ou mal formée.
   */
  async claim(rawKey, currentCookie = '') {
    const key = typeof rawKey === 'string' ? rawKey.trim() : ''
    if (!KEY_PATTERN.test(key)) return { status: 'invalid' }
    let match = null
    for (const k of this.config.keys) if (safeEqual(k, key)) match = k // on parcourt toujours toutes les clés
    if (!match) return { status: 'invalid' }
    const kid = await this.kid(match)
    this.cache.delete(kid)
    const bound = await this.boundDevice(kid)
    if (bound) {
      const [ckid, cdevice] = String(currentCookie).split('.')
      if (ckid === kid && cdevice === bound && (await this.allows(currentCookie))) return { status: 'granted', cookie: currentCookie }
      return { status: 'taken' }
    }
    const device = hex(this.crypto.getRandomValues(new Uint8Array(16)))
    await this.store.set(`device-${kid}`, device)
    this.cache.set(kid, { device, at: this.now() })
    return { status: 'granted', cookie: `${kid}.${device}.${await this.sign(`${kid}.${device}`)}` }
  }
}

/* ---------- Pages (trois langues, sans script, sans ressource externe) ---------- */

const TEXT = {
  fr: {
    title: 'Accès réservé',
    intro: 'Cette version de Catapulte Mania est réservée à des appareils autorisés.',
    label: 'Clé d’accès',
    submit: 'Entrer',
    invalid: 'Clé inconnue.',
    taken: 'Cette clé est déjà utilisée sur un autre appareil.',
    config: 'Le verrou d’accès n’est pas configuré.',
    storage: 'Le verrou d’accès est momentanément indisponible. Réessayez dans un instant.',
  },
  en: {
    title: 'Restricted access',
    intro: 'This version of Catapulte Mania is for authorised devices only.',
    label: 'Access key',
    submit: 'Enter',
    invalid: 'Unknown key.',
    taken: 'This key is already in use on another device.',
    config: 'The access lock is not configured.',
    storage: 'The access lock is temporarily unavailable. Please try again shortly.',
  },
  id: {
    title: 'Akses terbatas',
    intro: 'Versi Catapulte Mania ini hanya untuk perangkat yang diizinkan.',
    label: 'Kunci akses',
    submit: 'Masuk',
    invalid: 'Kunci tidak dikenal.',
    taken: 'Kunci ini sudah dipakai di perangkat lain.',
    config: 'Kunci akses belum dikonfigurasi.',
    storage: 'Kunci akses sedang tidak tersedia. Coba lagi sebentar lagi.',
  },
}

export function pickLang(acceptLanguage) {
  const first = String(acceptLanguage ?? '').toLowerCase().slice(0, 2)
  return first === 'en' || first === 'id' ? first : 'fr'
}

/** Page de saisie (message facultatif : 'invalid' | 'taken' | 'config' | 'storage'). */
export function gatePage(lang, message = null) {
  const t = TEXT[lang] ?? TEXT.fr
  const note = message ? `<p class="m" role="alert">${t[message]}</p>` : ''
  const form =
    message === 'config' || message === 'storage'
      ? ''
      : `<form method="post" action="${CLAIM_PATH}"><label for="k">${t.label}</label><input id="k" name="cle" type="password" autocomplete="off" required minlength="20" maxlength="128" pattern="[A-Za-z0-9_\\-]+"><button>${t.submit}</button></form>`
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${t.title} – Catapulte Mania</title><style>
:root{color-scheme:light dark;--bg:#f4ecd8;--fg:#2b2118;--accent:#8a3b12}
@media (prefers-color-scheme:dark){:root{--bg:#1c1712;--fg:#f1e6cf;--accent:#e0a35a}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif;padding:16px;box-sizing:border-box}
main{max-width:26rem;width:100%}h1{font-size:1.6rem;margin:0 0 .5rem}label{display:block;font-weight:600;margin:1rem 0 .3rem}
input{width:100%;box-sizing:border-box;font:inherit;padding:.7rem;border:2px solid var(--fg);border-radius:8px;background:transparent;color:inherit}
button{margin-top:.8rem;font:inherit;font-weight:700;padding:.7rem 1.4rem;border:0;border-radius:8px;background:var(--accent);color:var(--bg);cursor:pointer}
input:focus-visible,button:focus-visible{outline:3px solid var(--accent);outline-offset:2px}.m{font-weight:600;color:var(--accent)}
</style></head><body><main><h1>${t.title}</h1><p>${t.intro}</p>${note}${form}</main></body></html>`
}
