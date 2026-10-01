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
 * Les textes sont toujours insérés comme texte (jamais comme HTML) : pas de risque XSS.
 * Événement émis : `change` avec le code de langue.
 */
export class I18nService extends EventBus {
  #dictionaries
  #locale
  #fallback
  #plural = new Map()
  #numberFormat = new Map()

  /**
   * @param {Record<string, object>} dictionaries ex. { fr: {...}, en: {...} }
   * @param {string} locale langue initiale
   * @param {string} fallback langue de secours
   */
  constructor(dictionaries, locale, fallback = 'en') {
    super()
    this.#dictionaries = dictionaries
    this.#fallback = Guard.oneOf(fallback, Object.keys(dictionaries), 'fallback')
    this.#locale = Guard.oneOf(locale, Object.keys(dictionaries), 'locale')
  }

  get locale() {
    return this.#locale
  }

  get available() {
    return Object.keys(this.#dictionaries)
  }

  /** Code BCP 47 complet (ex. « fr-FR ») pour les API Intl. */
  get intlLocale() {
    return INTL_LOCALES[this.#locale] || this.#locale
  }

  setLocale(locale) {
    Guard.oneOf(locale, this.available, 'locale')
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
      entry = entry[form] ?? entry.other
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
