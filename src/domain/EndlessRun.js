import { Guard, ValidationError } from '../core/utils/Guard.js'
import { GAME } from '../config/gameConfig.js'
import { SeededRandom } from '../core/utils/SeededRandom.js'
import { LevelResult } from './LevelResult.js'
import { CARDS, handFor } from './EndlessDeck.js'

/**
 * Siège sans fin (v4.0) : une suite de châteaux de plus en plus durs.
 *
 * On commence avec quelques tirs ; chaque château abattu rapporte ses points
 * et des tirs supplémentaires (un de plus s'il tombe du premier coup). Les
 * tirs restants passent au château suivant. Le siège s'arrête quand un
 * château résiste à tous les tirs.
 *
 * v6.0 : après chaque château pris, une main de trois cartes (voir
 * EndlessDeck) ; on en garde une : munitions, pierres, intendant, fortune.
 *
 * Anti-triche : la partie ne progresse qu'avec des résultats AUTHENTIQUES
 * (LevelResult émis par le moteur), chacun une seule fois et pour le bon
 * château. Seules les parties créées par `EndlessRun.start` sont
 * enregistrables (WeakSet privé, comme pour LevelResult).
 */
export const ENDLESS = Object.freeze({
  START_SHOTS: 6,
  BONUS_SHOTS: 3,
  /** Château tombé du premier tir : un tir de plus. */
  PERFECT_BONUS: 1,
  MAX_SHOTS: 12,
  /** Il faut avoir terminé le premier chapitre pour lancer un siège. */
  UNLOCK: 10,
})

const issued = new WeakSet()

export class EndlessRun {
  #seed
  #wave = 1
  #score = 0
  #shots = ENDLESS.START_SHOTS
  #over = false
  #seen = new WeakSet()
  #last = null
  /** Main offerte après le dernier château pris (null : rien à choisir). */
  #hand = null
  /** Munitions spéciales en plus pour le prochain château, intendants, multiplicateur de fortune. */
  #nextAmmo = {}
  #supply = 0
  #fortune = 1

  /** @param {number} seed graine 32 bits (un siège différent à chaque partie) */
  constructor(seed) {
    this.#seed = Guard.int(seed, 'endless seed', { min: 0, max: 0xffffffff })
  }

  /** Nouveau siège (seul moyen d'obtenir une partie enregistrable). */
  static start(seed = EndlessRun.randomSeed()) {
    const run = new EndlessRun(seed)
    issued.add(run)
    return run
  }

  static randomSeed() {
    try {
      return crypto.getRandomValues(new Uint32Array(1))[0]
    } catch {
      return Math.floor(Math.random() * 0xffffffff)
    }
  }

  static isAuthentic(run) {
    return run instanceof EndlessRun && issued.has(run)
  }

  get wave() {
    return this.#wave
  }
  /** Châteaux abattus. */
  get cleared() {
    return this.#wave - 1
  }
  get score() {
    return this.#score
  }
  get shots() {
    return this.#shots
  }
  get over() {
    return this.#over
  }
  /** Bilan du dernier château (pour l'écran d'intermède). */
  get last() {
    return this.#last
  }

  /** Cartes offertes avant le prochain château (copie), ou null. */
  get hand() {
    return this.#hand ? [...this.#hand] : null
  }

  /** Ce que le prochain château reçoit : munitions en plus, intendants, fortune. */
  get loadout() {
    return { ammo: { ...this.#nextAmmo }, supply: this.#supply, fortune: this.#fortune }
  }

  /**
   * Garde une carte de la main offerte.
   * @param {string} id
   */
  pick(id) {
    if (!this.#hand) throw new ValidationError('card', 'no hand to pick from')
    if (!this.#hand.includes(id)) throw new ValidationError('card', 'not in hand')
    const card = CARDS[id]
    if (card.kind === 'ammo') this.#nextAmmo[card.ammo] = (this.#nextAmmo[card.ammo] ?? 0) + card.count
    else if (card.kind === 'shots') this.#shots = Math.min(ENDLESS.MAX_SHOTS, this.#shots + card.count)
    else if (card.kind === 'supply') this.#supply = Math.min(card.max, this.#supply + card.count)
    else if (card.kind === 'fortune') this.#fortune = card.factor
    this.#hand = null
    return card
  }

  /**
   * Niveau de la campagne joué au château `wave` : de plus en plus loin dans
   * la campagne (donc de plus en plus dur), tiré au sort dans une fenêtre.
   */
  levelFor(wave = this.#wave) {
    Guard.int(wave, 'wave', { min: 1, max: 10000 })
    const lo = Math.min(1 + (wave - 1) * 4, GAME.LEVEL_COUNT - 12)
    const hi = Math.min(GAME.LEVEL_COUNT, lo + 12)
    return new SeededRandom((this.#seed + wave * 7919) >>> 0).int(lo, hi)
  }

  /**
   * Enregistre le résultat du château en cours.
   * @param {LevelResult} result résultat authentique du moteur
   * @param {number} shotsLeft tirs restants à la fin du château
   * @returns {'next' | 'over'}
   */
  record(result, shotsLeft) {
    if (this.#over) throw new ValidationError('endless', 'siege already over')
    if (!LevelResult.isAuthentic(result) || this.#seen.has(result)) throw new ValidationError('result', 'not issued by the game engine')
    if (result.levelId !== this.levelFor()) throw new ValidationError('result.levelId', 'wrong castle')
    Guard.int(shotsLeft, 'shotsLeft', { min: 0, max: ENDLESS.MAX_SHOTS })
    this.#seen.add(result)
    if (!result.won) {
      this.#over = true
      this.#last = { won: false, score: 0, bonus: 0 }
      return 'over'
    }
    const bonus = ENDLESS.BONUS_SHOTS + (result.shotsUsed === 1 ? ENDLESS.PERFECT_BONUS : 0)
    // Fortune (v6.0) : les points de ce château comptent davantage.
    const score = Math.round(result.score * this.#fortune)
    this.#score += score
    this.#shots = Math.min(ENDLESS.MAX_SHOTS, shotsLeft + bonus)
    this.#wave += 1
    this.#last = { won: true, score, bonus, levelId: result.levelId }
    // Les cartes du château pris sont jouées ; une nouvelle main est offerte.
    this.#nextAmmo = {}
    this.#fortune = 1
    this.#hand = handFor(this.#seed, this.#wave, { supply: this.#supply })
    return 'next'
  }
}
