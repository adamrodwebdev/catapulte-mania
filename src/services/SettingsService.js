import { Schema, isPlainObject } from '../core/utils/Guard.js'
import { orElse } from '../core/utils/input.js'
import { GAME, IS_PORTAL } from '../config/gameConfig.js'
import { EventBus } from '../core/utils/EventBus.js'

/** Définition de chaque réglage : validateur + valeur par défaut. */
const DEFINITIONS = Object.freeze({
  language: { validate: Schema.enum(GAME.LANGUAGES), fallback: GAME.DEFAULT_LANGUAGE },
  theme: { validate: Schema.enum(['system', 'light', 'dark']), fallback: 'system' },
  contrast: { validate: Schema.enum(['normal', 'high']), fallback: 'normal' },
  motion: { validate: Schema.enum(['system', 'reduced', 'full']), fallback: 'system' },
  uiScale: { validate: Schema.enum([1, 1.15, 1.3]), fallback: 1 },
  trajectoryAid: { validate: Schema.boolean(), fallback: false },
  /** Visée précise : curseurs d'angle et de puissance + bouton Tirer (sinon : tirer, relâcher). */
  preciseAim: { validate: Schema.boolean(), fallback: false },
  // Tutoriels guidés au premier passage des niveaux qui présentent un outil.
  tutorials: { validate: Schema.boolean(), fallback: true },
  // Récit (la Chronique) avant les niveaux qui ouvrent un chapitre.
  story: { validate: Schema.boolean(), fallback: true },
  // Puissance réglée au début de chaque tour ('keep' : garder la dernière visée).
  startPower: { validate: Schema.enum(['keep', 100, 75, 50]), fallback: 100 },
  // Engin préféré (v3.7) : le trébuchet n'est proposé qu'une fois débloqué.
  engine: { validate: Schema.enum(['catapult', 'trebuchet', 'ballista']), fallback: 'catapult' },
  // Accessibilité : balancier du trébuchet encore plus lent (lâcher plus facile).
  slowSwing: { validate: Schema.boolean(), fallback: false },
  // Balancier infini du trébuchet (sauf en Difficile) : tout le temps de choisir son tir.
  // Balancier infini : sans objet depuis la v5.4 (lâcher programmé) ; gardé pour relire les anciens réglages.
  infiniteSwing: { validate: Schema.boolean(), fallback: false },
  // Portails : sous-titres de bruitages proposés dans les options, pas imposés (image dégagée).
  captions: { validate: Schema.boolean(), fallback: !IS_PORTAL },
  announcements: { validate: Schema.boolean(), fallback: true },
  haptics: { validate: Schema.boolean(), fallback: true },
  screenShake: { validate: Schema.boolean(), fallback: true },
  // Portails (public familial) : sang désactivé par défaut, remplacé par de la poussière.
  blood: { validate: Schema.boolean(), fallback: !IS_PORTAL },
  // v5.0 : cris synthétisés des défenseurs qui tombent (désactivables).
  screams: { validate: Schema.boolean(), fallback: true },
  // v6.0 : filmer le plus beau tir de la partie (rien n'est envoyé). Pas sur les portails.
  highlights: { validate: Schema.boolean(), fallback: !IS_PORTAL },
  // v6.1 : barres de vie au-dessus des défenseurs blessés et des généraux.
  healthBars: { validate: Schema.boolean(), fallback: true },
  // Carte « l'aide à la visée est désactivée » déjà montrée (v5.0).
  assistTipSeen: { validate: Schema.boolean(), fallback: false },
  volume: { validate: Schema.number({ min: 0, max: 1 }), fallback: 0.7 },
  // Volume de la musique (0 = coupée), séparé des effets sonores.
  music: { validate: Schema.number({ min: 0, max: 1 }), fallback: 0.5 },
  muted: { validate: Schema.boolean(), fallback: false },
})

const STORAGE_KEY = 'settings'

/**
 * Préférences du joueur (langue, thème, accessibilité, son…).
 * Chaque champ est validé individuellement : un champ altéré retombe sur sa
 * valeur par défaut sans affecter les autres.
 *
 * Événement émis : `change` avec `{ key, value }`.
 */
export class SettingsService extends EventBus {
  #storage
  #values
  /**
   * Réglages que le joueur a choisis, ou relus de son stockage (v6.3.1) : les seuls
   * enregistrés. Une valeur par défaut n'est pas un choix : avant, régler le volume
   * enregistrait aussi la langue par défaut (le français), et un joueur anglais ou
   * indonésien revenait en français.
   */
  #chosen = new Set()

  /** @param {import('./StorageService.js').StorageService} storage */
  constructor(storage) {
    super()
    this.#storage = storage
    const stored = SettingsService.#stored(storage)
    this.#values = {}
    for (const [key, def] of Object.entries(DEFINITIONS)) {
      const value = stored && Object.hasOwn(stored, key) ? orElse(() => def.validate(stored[key], key), undefined) : undefined
      this.#values[key] = value === undefined ? def.fallback : value
      if (value !== undefined) this.#chosen.add(key)
    }
  }

  /** Les réglages enregistrés (un objet lu champ par champ), ou null. */
  static #stored(storage) {
    const stored = storage.readJson(STORAGE_KEY)
    return isPlainObject(stored) ? stored : null
  }

  static get keys() {
    return Object.keys(DEFINITIONS)
  }

  /**
   * Le joueur a-t-il déjà choisi une langue ? (sinon on détecte celle du portail
   * ou du navigateur). Seule une langue du jeu choisie par le joueur compte
   * (v6.3.1) : la langue par défaut, celle d'une autre version ou une valeur
   * abîmée laissent chercher la sienne.
   */
  get hasStoredLanguage() {
    return this.#chosen.has('language')
  }

  get(key) {
    if (!Object.hasOwn(DEFINITIONS, key)) throw new Error(`Unknown setting "${key}"`)
    return this.#values[key]
  }

  /**
   * Valide puis enregistre un choix du joueur. Lève une erreur si la valeur est
   * invalide. Choisir la valeur par défaut l'enregistre aussi (le français choisi
   * reste le français, même si le navigateur parle anglais).
   */
  set(key, value) {
    if (!Object.hasOwn(DEFINITIONS, key)) throw new Error(`Unknown setting "${key}"`)
    const valid = DEFINITIONS[key].validate(value, key)
    const changed = this.#values[key] !== valid
    if (!changed && this.#chosen.has(key)) return
    this.#values[key] = valid
    this.#chosen.add(key)
    this.#write()
    if (changed) this.emit('change', { key, value: valid })
  }

  /** Copie de tous les réglages. */
  snapshot() {
    return { ...this.#values }
  }

  /** Remise à zéro (v6.3.1) : les valeurs par défaut, et plus aucun choix enregistré. */
  reset() {
    this.#chosen.clear()
    this.#storage.remove(STORAGE_KEY)
    for (const [key, def] of Object.entries(DEFINITIONS)) {
      if (this.#values[key] === def.fallback) continue
      this.#values[key] = def.fallback
      this.emit('change', { key, value: def.fallback })
    }
  }

  /** N'enregistre que les réglages choisis (ou relus). */
  #write() {
    const chosen = {}
    for (const key of this.#chosen) chosen[key] = this.#values[key]
    this.#storage.writeJson(STORAGE_KEY, chosen)
  }
}
