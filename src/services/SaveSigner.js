import { Guard } from '../core/utils/Guard.js'

/**
 * Signature des sauvegardes (anti-modification).
 *
 * Chaque sauvegarde est accompagnée d'une signature HMAC-SHA256 calculée avec
 * une clé propre à l'appareil. Modifier la sauvegarde à la main (outils de
 * développement, extension…) invalide la signature : la sauvegarde est rejetée.
 *
 * Limite assumée : sans serveur, la clé réside forcément dans le navigateur.
 * La signature décourage la triche « facile » ; elle est complétée par la
 * validation de schéma et les contrôles de cohérence de SaveManager.
 */

// Poivre applicatif découpé pour ne pas apparaître en clair dans le bundle.
const PEPPER = ['c7f1', 'ca57', 'le', '-9e2b', 'trebuchet', '-41d0'].join('')
const SALT_KEY = 'device-salt'

const b64url = (bytes) => {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Comparaison en temps constant (évite les attaques par mesure de durée). */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Hachage de repli (contexte non sécurisé sans WebCrypto, ex. http sur réseau local). */
function fallbackHash(key, text) {
  const input = `${key}|${text}|${key}`
  let h1 = 0xdeadbeef ^ input.length
  let h2 = 0x41c6ce57 ^ input.length
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36)
}

export class SaveSigner {
  /** @type {import('./StorageService.js').StorageService} */
  #storage
  /** @type {Promise<CryptoKey | null> | null} */
  #keyPromise = null
  #rawKey = ''

  /** @param {import('./StorageService.js').StorageService} storage */
  constructor(storage) {
    this.#storage = storage
  }

  #salt() {
    let salt = this.#storage.read(SALT_KEY)
    if (!salt || !/^[A-Za-z0-9_-]{22}$/.test(salt)) {
      const bytes = new Uint8Array(16)
      globalThis.crypto.getRandomValues(bytes)
      salt = b64url(bytes)
      this.#storage.write(SALT_KEY, salt)
    }
    return salt
  }

  #subtle() {
    return globalThis.crypto && globalThis.crypto.subtle ? globalThis.crypto.subtle : null
  }

  async #key() {
    if (!this.#keyPromise) {
      this.#rawKey = `${PEPPER}:${this.#salt()}`
      const subtle = this.#subtle()
      this.#keyPromise = subtle
        ? subtle.importKey('raw', new TextEncoder().encode(this.#rawKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
        : Promise.resolve(null)
    }
    return this.#keyPromise
  }

  /**
   * @param {string} text données sérialisées
   * @returns {Promise<string>} signature préfixée par l'algorithme
   */
  async sign(text) {
    Guard.string(text, 'payload', { maxLength: 64 * 1024 })
    const key = await this.#key()
    if (key) {
      const sig = await this.#subtle().sign('HMAC', key, new TextEncoder().encode(text))
      return `h1.${b64url(new Uint8Array(sig))}`
    }
    return `f1.${fallbackHash(this.#rawKey, text)}`
  }

  /** @returns {Promise<boolean>} */
  async verify(text, signature) {
    if (typeof text !== 'string' || typeof signature !== 'string') return false
    const expected = await this.sign(text)
    return safeEqual(expected, signature)
  }
}
