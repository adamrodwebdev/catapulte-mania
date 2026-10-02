import { Guard, deepFreeze } from '../core/utils/Guard.js'
import { GAME } from '../config/gameConfig.js'

/**
 * Résultat d'un niveau terminé.
 *
 * Anti-triche : seuls les résultats émis par le moteur de score (ScoreKeeper)
 * sont enregistrables. Ils sont référencés dans un WeakSet privé à ce module :
 * un objet fabriqué à la main — même identique — est refusé par SaveSlot.
 */
const issued = new WeakSet()

export class LevelResult {
  /**
   * @param {{ levelId: number, score: number, stars: number, won: boolean,
   *   targetsKilled: number, blocksDestroyed: number, barrelsExploded: number,
   *   shotsUsed: number, powersUsed: number, difficulty: string, achievements?: number }} data
   */
  constructor(data) {
    this.levelId = Guard.int(data.levelId, 'levelId', { min: 1, max: GAME.LEVEL_COUNT })
    this.score = Guard.int(data.score, 'score', { min: 0, max: GAME.MAX_LEVEL_SCORE })
    this.stars = Guard.int(data.stars, 'stars', { min: 0, max: 3 })
    this.won = Guard.boolean(data.won, 'won')
    this.targetsKilled = Guard.int(data.targetsKilled, 'targetsKilled', { min: 0, max: 1000 })
    this.blocksDestroyed = Guard.int(data.blocksDestroyed, 'blocksDestroyed', { min: 0, max: 5000 })
    this.barrelsExploded = Guard.int(data.barrelsExploded, 'barrelsExploded', { min: 0, max: 1000 })
    this.shotsUsed = Guard.int(data.shotsUsed, 'shotsUsed', { min: 0, max: 100 })
    this.powersUsed = Guard.int(data.powersUsed, 'powersUsed', { min: 0, max: 100 })
    /** Masque des succès du niveau obtenus pendant cette partie (bit i = i-ème succès). */
    this.achievements = Guard.int(data.achievements ?? 0, 'achievements', { min: 0, max: 7 })
    this.difficulty = Guard.oneOf(data.difficulty, GAME.DIFFICULTIES, 'difficulty')
    deepFreeze(this)
  }

  /** Réservé au moteur de score. */
  static issue(data) {
    const result = new LevelResult(data)
    issued.add(result)
    return result
  }

  /** @param {unknown} result */
  static isAuthentic(result) {
    return result instanceof LevelResult && issued.has(result)
  }
}
