import { Schema } from '../core/utils/Guard.js'
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
  engine: { validate: Schema.enum(['catapult', 'trebuchet']), fallback: 'catapult' },
  // Accessibilité : balancier du trébuchet encore plus lent (lâcher plus facile).
  slowSwing: { validate: Schema.boolean(), fallback: false },
  // Balancier infini du trébuchet (sauf en Difficile) : tout le temps de choisir son tir.
  infiniteSwing: { validate: Schema.boolean(), fallback: false },
  // Portails : sous-titres de bruitages proposés dans les options, pas imposés (image dégagée).
  captions: { validate: Schema.boolean(), fallback: !IS_PORTAL },
  announcements: { validate: Schema.boolean(), fallback: true },
  haptics: { validate: Schema.boolean(), fallback: true },
  screenShake: { validate: Schema.boolean(), fallback: true },
  // Portails (public familial) : sang désactivé par défaut, remplacé par de la poussière.
  blood: { validate: Schema.boolean(), fallback: !IS_PORTAL },
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

  /** @param {import('./StorageService.js').StorageService} storage */
  constructor(storage) {
    super()
    this.#storage = storage
    const stored = storage.readJson(STORAGE_KEY)
    this.#values = {}
    for (const [key, def] of Object.entries(DEFINITIONS)) {
      try {
        this.#values[key] = stored && Object.hasOwn(stored, key) ? def.validate(stored[key], key) : def.fallback
      } catch {
        this.#values[key] = def.fallback
      }
    }
  }

  static get keys() {
    return Object.keys(DEFINITIONS)
  }

  /** Le joueur a-t-il déjà choisi une langue ? (sinon on détecte celle du navigateur) */
  get hasStoredLanguage() {
    const stored = this.#storage.readJson(STORAGE_KEY)
    return Boolean(stored && typeof stored.language === 'string')
  }

  get(key) {
    if (!Object.hasOwn(DEFINITIONS, key)) throw new Error(`Unknown setting "${key}"`)
    return this.#values[key]
  }

  /** Valide puis enregistre un réglage. Lève une erreur si la valeur est invalide. */
  set(key, value) {
    if (!Object.hasOwn(DEFINITIONS, key)) throw new Error(`Unknown setting "${key}"`)
    const valid = DEFINITIONS[key].validate(value, key)
    if (this.#values[key] === valid) return
    this.#values[key] = valid
    this.#storage.writeJson(STORAGE_KEY, this.#values)
    this.emit('change', { key, value: valid })
  }

  /** Copie de tous les réglages. */
  snapshot() {
    return { ...this.#values }
  }

  reset() {
    for (const [key, def] of Object.entries(DEFINITIONS)) this.set(key, def.fallback)
  }
}
