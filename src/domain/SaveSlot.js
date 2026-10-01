import { Schema, Guard, ValidationError } from '../core/utils/Guard.js'
import { GAME } from '../config/gameConfig.js'
import { LevelResult } from './LevelResult.js'

/** Nom de profil : lettres (toutes langues), chiffres, espaces, tirets. */
export const PROFILE_NAME = /^[\p{L}\p{N}][\p{L}\p{N} _'-]{0,15}$/u
const LEVEL_KEY = /^(?:[1-9]|[1-3][0-9]|40)$/
const COUNTER = Schema.int({ min: 0, max: 1e9 })

/** Schéma de la sauvegarde (version 1). Toute clé inconnue est refusée. */
export const saveSchema = Schema.object({
  version: Schema.enum([GAME.SAVE_VERSION]),
  name: Schema.string({ minLength: 1, maxLength: 16, pattern: PROFILE_NAME }),
  difficulty: Schema.enum(GAME.DIFFICULTIES),
  createdAt: Schema.int({ min: 0, max: 8.64e15 }),
  updatedAt: Schema.int({ min: 0, max: 8.64e15 }),
  levels: Schema.record(
    LEVEL_KEY,
    Schema.object({
      stars: Schema.int({ min: 0, max: 3 }),
      best: Schema.int({ min: 0, max: GAME.MAX_LEVEL_SCORE }),
      attempts: Schema.int({ min: 0, max: 1e6 }),
    }),
    { maxKeys: GAME.LEVEL_COUNT },
  ),
  stats: Schema.object({
    shots: COUNTER,
    targets: COUNTER,
    blocks: COUNTER,
    barrels: COUNTER,
    powers: COUNTER,
  }),
})

/**
 * Profil de joueur : progression, meilleurs scores et statistiques.
 * Les valeurs dérivées (score total, étoiles, pouvoirs débloqués) ne sont
 * jamais stockées : elles sont recalculées à partir des niveaux réussis.
 */
export class SaveSlot {
  #index
  #data

  /**
   * @param {number} index numéro d'emplacement (0..2)
   * @param {object} data données déjà validées par `saveSchema`
   */
  constructor(index, data) {
    this.#index = Guard.int(index, 'slot index', { min: 0, max: GAME.SAVE_SLOTS - 1 })
    this.#data = data
  }

  /** Crée un profil vierge. */
  static create(index, name, difficulty, now = Date.now()) {
    const data = saveSchema({
      version: GAME.SAVE_VERSION,
      name: String(name).trim(),
      difficulty,
      createdAt: now,
      updatedAt: now,
      levels: {},
      stats: { shots: 0, targets: 0, blocks: 0, barrels: 0, powers: 0 },
    })
    return new SaveSlot(index, data)
  }

  /**
   * Reconstruit un profil depuis des données non fiables et vérifie leur cohérence.
   * @param {number} index
   * @param {unknown} raw
   * @param {(levelId: number, best: number, stars: number) => void} [checkRecord]
   *   contrôle métier optionnel (score possible, étoiles cohérentes)
   */
  static fromJSON(index, raw, checkRecord) {
    const data = saveSchema(raw, 'save')
    // Progression continue : on ne peut pas avoir réussi le niveau N sans le niveau N-1.
    const done = Object.keys(data.levels).map(Number).sort((a, b) => a - b)
    done.forEach((id, i) => {
      if (id !== i + 1) throw new ValidationError(`save.levels.${id}`, 'progression gap')
      const rec = data.levels[id]
      if (rec.attempts < 1) throw new ValidationError(`save.levels.${id}`, 'no attempt recorded')
      if (checkRecord) checkRecord(id, rec.best, rec.stars)
    })
    if (data.updatedAt < data.createdAt) throw new ValidationError('save.updatedAt', 'before creation')
    return new SaveSlot(index, data)
  }

  get index() {
    return this.#index
  }
  get name() {
    return this.#data.name
  }
  get difficulty() {
    return this.#data.difficulty
  }
  set difficulty(value) {
    this.#data.difficulty = Guard.oneOf(value, GAME.DIFFICULTIES, 'difficulty')
  }
  get updatedAt() {
    return this.#data.updatedAt
  }
  get stats() {
    return { ...this.#data.stats }
  }

  /** @returns {{ stars: number, best: number, attempts: number } | null} */
  levelRecord(levelId) {
    const rec = this.#data.levels[levelId]
    return rec ? { ...rec } : null
  }

  isCompleted(levelId) {
    return Boolean(this.#data.levels[levelId])
  }

  isUnlocked(levelId) {
    Guard.int(levelId, 'levelId', { min: 1, max: GAME.LEVEL_COUNT })
    return levelId === 1 || this.isCompleted(levelId - 1)
  }

  get completedCount() {
    return Object.keys(this.#data.levels).length
  }

  get totalScore() {
    return Object.values(this.#data.levels).reduce((sum, r) => sum + r.best, 0)
  }

  get starCount() {
    return Object.values(this.#data.levels).reduce((sum, r) => sum + r.stars, 0)
  }

  /** Prochain niveau à jouer (le premier non réussi). */
  get nextLevel() {
    return Math.min(this.completedCount + 1, GAME.LEVEL_COUNT)
  }

  /**
   * Enregistre le résultat d'une partie. N'accepte que les résultats authentiques
   * émis par le moteur de score et n'améliore que le meilleur score.
   * @param {LevelResult} result
   * @returns {{ newBest: boolean, firstClear: boolean }}
   */
  recordResult(result, now = Date.now()) {
    if (!LevelResult.isAuthentic(result)) throw new ValidationError('result', 'untrusted result rejected')
    if (!this.isUnlocked(result.levelId)) throw new ValidationError('result', 'level is locked')
    const s = this.#data.stats
    s.shots += result.shotsUsed
    s.targets += result.targetsKilled
    s.blocks += result.blocksDestroyed
    s.barrels += result.barrelsExploded
    s.powers += result.powersUsed
    this.#data.updatedAt = Math.max(now, this.#data.updatedAt)

    const prev = this.#data.levels[result.levelId]
    if (!result.won) {
      if (prev) prev.attempts += 1
      return { newBest: false, firstClear: false }
    }
    if (!prev) {
      this.#data.levels[result.levelId] = { stars: result.stars, best: result.score, attempts: 1 }
      return { newBest: true, firstClear: true }
    }
    prev.attempts += 1
    const newBest = result.score > prev.best
    if (newBest) prev.best = result.score
    prev.stars = Math.max(prev.stars, result.stars)
    return { newBest, firstClear: false }
  }

  /** Copie sérialisable (validée à nouveau avant écriture). */
  toJSON() {
    return structuredClone({ ...this.#data, levels: { ...this.#data.levels } })
  }
}
