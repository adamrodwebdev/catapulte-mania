import { Guard } from '../core/utils/Guard.js'
import { EventBus } from '../core/utils/EventBus.js'

const PARAM = /\{(\w+)\}/g
const INTL_LOCALES = Object.freeze({ fr: 'fr-FR', en: 'en-GB', id: 'id-ID' })

/**
 * Service de traduction.
 *
 * - Dictionnaires imbriqués : `t('menu.play')`.
 * - Paramètres : `t('hud.shots', { count: 3 })` avec « {count} » dans le texte.
 * - Pluriels via Intl.PluralRules : une entrée peut être `{ one: '…', other: '…' }`.
 * - Repli : langue courante → langue de secours → clé brute (jamais d'écran vide).
 *
 * - Chargement à la demande (v3.5) : avec un `loader`, seuls les dictionnaires
 *   utiles sont téléchargés ; `use(locale)` charge puis active une langue.
 *
 * Les textes sont toujours insérés comme texte (jamais comme HTML) : pas de risque XSS.
 * Événement émis : `change` avec le code de langue.
 */
export class I18nService extends EventBus {
  #dictionaries
  #locale
  #fallback
  #plural = new Map()
  #numberFormat = new Map()
  #available
  #loader
  #pending = new Map()

  /**
   * @param {Record<string, object>} dictionaries dictionnaires déjà chargés (ex. { fr: {...} })
   * @param {string} locale langue initiale (doit être chargée)
   * @param {string} fallback langue de secours (peut être chargée plus tard)
   * @param {{ available?: readonly string[], loader?: (locale: string) => Promise<object> }} [opts]
   */
  constructor(dictionaries, locale, fallback = 'en', { available, loader } = {}) {
    super()
    this.#dictionaries = { ...dictionaries }
    this.#available = Object.freeze([...(available ?? Object.keys(dictionaries))])
    this.#loader = typeof loader === 'function' ? loader : null
    this.#fallback = Guard.oneOf(fallback, this.#available, 'fallback')
    Guard.oneOf(locale, Object.keys(this.#dictionaries), 'locale')
    this.#locale = Guard.oneOf(locale, this.#available, 'locale')
  }

  /** La langue est-elle déjà téléchargée ? */
  isLoaded(locale) {
    return Object.hasOwn(this.#dictionaries, locale)
  }

  /**
   * Télécharge un dictionnaire (une seule fois, même si on le demande plusieurs fois).
   * @param {string} locale
   * @returns {Promise<void>}
   */
  load(locale) {
    try {
      Guard.oneOf(locale, this.#available, 'locale')
    } catch (err) {
      return Promise.reject(err)
    }
    if (this.isLoaded(locale)) return Promise.resolve()
    if (!this.#loader) return Promise.reject(new Error(`no loader for "${locale}"`))
    if (!this.#pending.has(locale)) {
      const p = Promise.resolve(this.#loader(locale)).then((dict) => {
        if (!dict || typeof dict !== 'object' || Array.isArray(dict)) throw new TypeError(`invalid dictionary "${locale}"`)
        this.#dictionaries[locale] = dict
      })
      p.catch(() => this.#pending.delete(locale)) // nouvel essai possible (réseau coupé)
      this.#pending.set(locale, p)
    }
    return this.#pending.get(locale)
  }

  /** Charge (si besoin) puis active une langue. */
  async use(locale) {
    await this.load(locale)
    this.setLocale(locale)
  }

  get locale() {
    return this.#locale
  }

  get available() {
    return this.#available
  }

  /** Code BCP 47 complet (ex. « fr-FR ») pour les API Intl. */
  get intlLocale() {
    return INTL_LOCALES[this.#locale] || this.#locale
  }

  setLocale(locale) {
    Guard.oneOf(locale, this.available, 'locale')
    if (!this.isLoaded(locale)) throw new Error(`locale "${locale}" not loaded`)
    if (locale === this.#locale) return
    this.#locale = locale
    this.emit('change', locale)
  }

  /**
   * Choisit la langue initiale : paramètre d'URL ?lang=, puis langue du navigateur.
   * @param {string} search ex. location.search
   * @param {readonly string[]} browserLanguages ex. navigator.languages
   * @param {string} defaultLocale
   */
  static detect(search, browserLanguages, available, defaultLocale) {
    try {
      const fromUrl = new URLSearchParams(search).get('lang')
      if (fromUrl && available.includes(fromUrl)) return fromUrl
    } catch {
      /* URL invalide : on ignore */
    }
    for (const lang of browserLanguages || []) {
      const short = String(lang).slice(0, 2).toLowerCase()
      if (available.includes(short)) return short
      if (short === 'ms' && available.includes('id')) return 'id' // malais → indonésien
    }
    return defaultLocale
  }

  #lookup(locale, key) {
    if (!this.isLoaded(locale)) return undefined
    let node = this.#dictionaries[locale]
    for (const part of key.split('.')) {
      if (node === null || typeof node !== 'object' || !Object.hasOwn(node, part)) return undefined
      node = node[part]
    }
    return node
  }

  #pluralRules(locale) {
    if (!this.#plural.has(locale)) this.#plural.set(locale, new Intl.PluralRules(INTL_LOCALES[locale] || locale))
    return this.#plural.get(locale)
  }

  /**
   * Traduit une clé.
   * @param {string} key
   * @param {Record<string, string | number>} [params]
   * @returns {string}
   */
  t(key, params = {}) {
    let locale = this.#locale
    let entry = this.#lookup(locale, key)
    if (entry === undefined) {
      locale = this.#fallback
      entry = this.#lookup(locale, key)
    }
    if (entry === undefined) return key
    if (entry && typeof entry === 'object') {
      const count = typeof params.count === 'number' ? params.count : 0
      const form = this.#pluralRules(locale).select(count)
      // Forme « zero » facultative (« Victoire sans tirer ! »), sinon règles de la langue.
      entry = (count === 0 && entry.zero) || entry[form] || entry.other
    }
    if (typeof entry !== 'string') return key
    return entry.replace(PARAM, (match, name) => {
      if (!Object.hasOwn(params, name)) return match
      const v = params[name]
      return typeof v === 'number' ? this.formatNumber(v) : String(v)
    })
  }

  /** La clé existe-t-elle dans la langue donnée ? */
  has(key, locale = this.#locale) {
    return this.#lookup(locale, key) !== undefined
  }

  formatNumber(n) {
    if (!this.#numberFormat.has(this.#locale)) {
      this.#numberFormat.set(this.#locale, new Intl.NumberFormat(this.intlLocale))
    }
    return this.#numberFormat.get(this.#locale).format(n)
  }
}
