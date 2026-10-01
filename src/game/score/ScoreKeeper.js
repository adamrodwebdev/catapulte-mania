import { SCORE, starsFor } from './ScoreRules.js'
import { DIFFICULTY, GAME } from '../../config/gameConfig.js'
import { LevelResult } from '../../domain/LevelResult.js'
import { Guard } from '../../core/utils/Guard.js'

/**
 * Comptabilité des points pendant un niveau.
 * Le score n'est JAMAIS modifiable de l'extérieur : il ne bouge qu'en réaction
 * aux événements du moteur physique (destructions) et aux pouvoirs utilisés.
 * Le résultat final est émis sous forme de LevelResult authentifié.
 */
export class ScoreKeeper {
  #level
  #difficulty
  #points = 0
  #penalty = 0
  #chain = 0
  #stats = { targetsKilled: 0, blocksDestroyed: 0, barrelsExploded: 0, powersUsed: 0 }
  #finalized = false

  constructor(level, difficulty) {
    this.#level = level
    this.#difficulty = Guard.oneOf(difficulty, GAME.DIFFICULTIES, 'difficulty')
  }

  get factor() {
    return DIFFICULTY[this.#difficulty].scoreFactor
  }

  /** Score affiché (difficulté incluse, jamais négatif). */
  get current() {
    return Math.max(0, Math.round((this.#points - this.#penalty) * this.factor))
  }

  get stats() {
    return { ...this.#stats }
  }

  /** Début d'un tir : la chaîne de destructions repart de zéro. */
  startShot() {
    this.#chain = 0
  }

  /**
   * Une entité vient d'être détruite.
   * @returns {number} points gagnés (avant multiplicateur de difficulté)
   */
  registerDestroyed(entity) {
    if (this.#finalized) return 0
    let base = 0
    if (entity.kind === 'target') {
      base = entity.scoreValue
      this.#stats.targetsKilled++
    } else if (entity.kind === 'block') {
      base = entity.scoreValue
      this.#stats.blocksDestroyed++
    } else if (entity.kind === 'barrel') {
      base = SCORE.BARREL
      this.#stats.barrelsExploded++
    }
    if (!base) return 0
    const mult = Math.min(SCORE.CHAIN_MAX, 1 + this.#chain * SCORE.CHAIN_STEP)
    this.#chain++
    const gained = Math.round(base * mult)
    this.#points += gained
    return Math.round(gained * this.factor)
  }

  /** Coût d'un pouvoir spécial. */
  spend(cost) {
    Guard.int(cost, 'cost', { min: 0, max: 5000 })
    this.#penalty += cost
    this.#stats.powersUsed++
  }

  /**
   * Clôt le niveau et produit le résultat authentifié.
   * @param {{ won: boolean, shotsLeft: number, shotsUsed: number }} end
   */
  finalize({ won, shotsLeft, shotsUsed }) {
    if (this.#finalized) throw new Error('already finalized')
    this.#finalized = true
    const bonus = won ? shotsLeft * SCORE.SHOT_BONUS : 0
    const raw = Math.max(0, Math.round((this.#points + bonus - this.#penalty) * this.factor))
    const score = Math.min(raw, this.#level.maxScore)
    return LevelResult.issue({
      levelId: this.#level.id,
      score: won ? score : 0,
      stars: won ? starsFor(this.#level, score) : 0,
      won,
      shotsUsed,
      difficulty: this.#difficulty,
      ...this.#stats,
    })
  }
}
