import { Guard } from '../../core/utils/Guard.js'
import { GAME } from '../../config/gameConfig.js'

/**
 * « Chacun sa partie » devient un TOURNOI en trois manches.
 *
 * Chaque manche se joue sur un niveau différent ; les deux joueurs le jouent
 * l'un après l'autre (celui qui commence alterne d'une manche à l'autre).
 *
 * Manche gagnée par :
 *  1. celui qui a pris le château (si un seul y parvient) ;
 *  2. sinon, s'ils l'ont pris tous les deux : celui qui a utilisé le moins de tirs ;
 *     s'ils ont échoué tous les deux : celui qui a abattu le plus de défenseurs ;
 *  3. puis le meilleur score ; sinon manche nulle.
 * Le match va au premier à deux manches ; s'il reste à égalité après trois
 * manches, le total des scores départage.
 *
 * Objet sans interface (testable seul) : l'écran de jeu lui transmet le
 * résultat de chaque partie et affiche son état.
 */
export class HotSeatMatch {
  /** @type {{ levelId: number, results: Array<RoundResult | null> }[]} */
  #rounds
  #index = 0
  #turn = 0

  /**
   * @typedef {{ cleared: boolean, shots: number, kills: number, score: number }} RoundResult
   * @param {number[]} levels trois niveaux
   * @param {string[]} players deux noms
   */
  constructor(levels, players) {
    if (!Array.isArray(levels) || levels.length !== 3) throw new TypeError('three levels expected')
    levels.forEach((id) => Guard.int(id, 'level id', { min: 1, max: GAME.LEVEL_COUNT }))
    if (!Array.isArray(players) || players.length !== 2) throw new TypeError('two players expected')
    this.players = Object.freeze([...players])
    this.#rounds = levels.map((levelId) => ({ levelId, results: [null, null] }))
  }

  /** Les trois niveaux d'un tournoi commençant à `first`, sans dépasser `max`. */
  static levelsFrom(first, max) {
    const start = Math.max(1, Math.min(first, max - 2))
    return [start, start + 1, start + 2].map((id) => Math.min(id, max))
  }

  /** Numéro de la manche en cours (0 à 2). */
  get round() {
    return this.#index
  }

  /** Niveau de la manche en cours. */
  get levelId() {
    return this.#rounds[Math.min(this.#index, 2)].levelId
  }

  /** Joueur qui commence la manche `r` : le joueur 1 aux manches 1 et 3. */
  starter(r = this.#index) {
    return r % 2
  }

  /** Joueur qui doit jouer maintenant (0 ou 1), ou null si le match est fini. */
  get player() {
    if (this.finished) return null
    return (this.starter() + this.#turn) % 2
  }

  /**
   * Enregistre la partie que vient de jouer `player`.
   * @param {RoundResult} result
   * @returns {'next-player' | 'round-over' | 'match-over'}
   */
  record(result) {
    if (this.finished) throw new Error('match already over')
    const r = {
      cleared: Boolean(result.cleared),
      shots: Guard.int(result.shots, 'shots', { min: 0, max: 100 }),
      kills: Guard.int(result.kills, 'kills', { min: 0, max: 100 }),
      score: Guard.int(result.score, 'score', { min: 0, max: 10_000_000 }),
    }
    this.#rounds[this.#index].results[this.player] = r
    if (this.#turn === 0) {
      this.#turn = 1
      return 'next-player'
    }
    this.#turn = 0
    this.#index++
    return this.finished ? 'match-over' : 'round-over'
  }

  /** Vainqueur d'une manche jouée (0, 1, ou null pour une manche nulle). */
  roundWinner(r) {
    const [a, b] = this.#rounds[r].results
    if (!a || !b) return undefined
    if (a.cleared !== b.cleared) return a.cleared ? 0 : 1
    if (a.cleared) {
      if (a.shots !== b.shots) return a.shots < b.shots ? 0 : 1
    } else if (a.kills !== b.kills) return a.kills > b.kills ? 0 : 1
    if (a.score !== b.score) return a.score > b.score ? 0 : 1
    return null
  }

  /** Manches gagnées par chaque joueur. */
  get wins() {
    const w = [0, 0]
    for (let r = 0; r < this.#index; r++) {
      const x = this.roundWinner(r)
      if (x === 0 || x === 1) w[x]++
    }
    return w
  }

  get finished() {
    const [a, b] = this.wins
    return a >= 2 || b >= 2 || this.#index >= 3
  }

  /** Vainqueur du match (null : égalité parfaite), undefined tant qu'il n'est pas fini. */
  get winner() {
    if (!this.finished) return undefined
    const [a, b] = this.wins
    if (a !== b) return a > b ? 0 : 1
    const totals = this.totals
    return totals[0] === totals[1] ? null : totals[0] > totals[1] ? 0 : 1
  }

  /** Score cumulé de chaque joueur sur les manches jouées. */
  get totals() {
    const t = [0, 0]
    for (const round of this.#rounds) round.results.forEach((x, i) => (t[i] += x?.score ?? 0))
    return t
  }

  /** Tableau des manches (copie) pour l'affichage. */
  get table() {
    return this.#rounds.map((round, r) => ({
      levelId: round.levelId,
      results: round.results.map((x) => (x ? { ...x } : null)),
      winner: this.roundWinner(r),
      played: r < this.#index,
    }))
  }
}
