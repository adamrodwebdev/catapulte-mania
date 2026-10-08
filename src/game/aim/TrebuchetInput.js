import { Guard, deepFreeze } from '../../core/utils/Guard.js'

/**
 * Commande du trébuchet (v5.3) : geste, cible et chronométrage du lâcher.
 *
 * Module pur (aucun accès au DOM ni au moteur) : le point d'impact d'un lâcher
 * lui est fourni par une fonction (`landingAt`), ce qui le rend testable seul.
 *
 * Inspirations : la jauge de swing des jeux de golf (un geste, un instant
 * juste, une note), le cercle d'approche des jeux de rythme (il se referme
 * exactement au bon moment), les repères sonores qui comptent les temps.
 *
 * Principes :
 *  - PRÉCIS : on vise un POINT (la cible au sol) ; le module calcule,
 *    pas de simulation par pas de simulation, l'instant de lâcher qui y mène,
 *    et note chaque lâcher d'après l'écart à l'impact idéal ;
 *  - CONCIS : appuyer libère le contrepoids, relâcher lâche la fronde (un seul
 *    geste) ; les deux clics d'avant restent possibles ;
 *  - FLUIDE et RAPIDE : la cible se place d'un glissé, l'instant idéal est
 *    calculé une fois par tour (table des lâchers, construite par morceaux
 *    pour ne jamais figer l'image), puis lu à chaque image ;
 *  - AGRÉABLE : trois tics réguliers puis une note claire au moment parfait,
 *    une note après chaque tir ; en Facile, un lâcher à quelques ms près se
 *    cale sur l'instant parfait.
 */
export const TREB_TUNING = deepFreeze({
  /** Lâchers étudiés (ms simulées depuis le contrepoids), pas de la table. */
  FROM_MS: 480,
  TO_MS: 1000,
  /** Maintien au-delà duquel l'appui devient « geste unique » (relâcher = lâcher la fronde). */
  HOLD_MS: 180,
  /** Au-delà, l'appui est un glissé : on déplace la cible au lieu d'armer. */
  DRAG_PX: 12,
  /** Notes d'après l'écart entre l'impact et l'impact idéal (unités du monde). */
  GRADES: [
    { id: 'perfect', within: 22 },
    { id: 'great', within: 50 },
    { id: 'good', within: 100 },
  ],
  /** Cible trop loin de tout lâcher possible : hors de portée. */
  UNREACHABLE: 140,
  /** Repères sonores avant l'instant parfait (ms simulées). */
  CUES_MS: [-180, -120, -60],
  /** Durée simulée du cercle d'approche (il se referme en autant de ms avant l'instant parfait). */
  APPROACH_MS: 240,
  /** Pas de la cible au clavier (unités du monde ; Maj : pas fin). */
  NUDGE: 20,
  NUDGE_FINE: 4,
  /** Aide au lâcher (ms simulées) selon la difficulté. */
  ASSIST_MS: deepFreeze({ easy: 26, normal: 0, hard: 0 }),
})

const T = TREB_TUNING

export class TrebuchetInput {
  /** Cible au sol (unités du monde), ou null. */
  target = null
  /** Plan pour la cible : { release, landing, error } ou null. */
  plan = null
  #landingAt
  #step
  /** Table des lâchers, construite par morceaux (voir warm). */
  #rows = []
  #nextK = 0
  #done = false
  /** Geste en cours. */
  #press = null

  /**
   * @param {{ landingAt: (releaseMs: number) => ({ x: number, y: number } | null), step: number }} opts
   *   landingAt : point d'impact d'un lâcher à cet instant ; step : pas de simulation du balancier (ms)
   */
  constructor({ landingAt, step }) {
    this.#landingAt = Guard.func(landingAt, 'landingAt')
    this.#step = Guard.number(step, 'step', { min: 1, max: 50 })
    this.invalidate()
  }

  /* ---------- Cible et instant idéal ---------- */

  /**
   * Le décor a changé (vent du tour, château abîmé) : la table sera recalculée,
   * par morceaux (warm) ou d'un coup à la première lecture.
   */
  invalidate() {
    this.#rows = []
    this.#nextK = Math.ceil(T.FROM_MS / this.#step)
    this.#done = false
    this.plan = null
  }

  /** La table est-elle complète (et le plan à jour) ? */
  get ready() {
    return this.#done
  }

  /**
   * Avance le calcul de la table de quelques lignes (une image à la fois, pour
   * ne jamais figer l'écran en début de tour).
   * @param {number} rows lignes à calculer au plus
   * @returns {boolean} vrai si la table est complète
   */
  warm(rows) {
    if (this.#done) return true
    const k1 = Math.floor(T.TO_MS / this.#step)
    for (let n = 0; n < rows && this.#nextK <= k1; n++, this.#nextK++) {
      const t = this.#nextK * this.#step
      const p = this.#landingAt(t)
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) this.#rows.push({ t, x: p.x, y: p.y })
    }
    if (this.#nextK > k1) {
      this.#done = true
      if (this.target) this.plan = this.#bestFor(this.target)
    }
    return this.#done
  }

  /** Table des lâchers : un impact par pas de simulation de la fenêtre utile (complétée si besoin). */
  get table() {
    if (!this.#done) this.warm(Infinity)
    return this.#rows
  }

  /**
   * Place la cible et calcule l'instant de lâcher qui y mène.
   * @param {{ lazy?: boolean }} [opts] lazy : ne pas forcer le calcul de la table (le plan viendra avec warm)
   * @returns {{ release: number, landing: { x: number, y: number }, error: number, reachable: boolean } | null}
   */
  setTarget(x, y, { lazy = false } = {}) {
    Guard.number(x, 'target x')
    Guard.number(y, 'target y')
    this.target = { x, y }
    this.plan = lazy && !this.#done ? null : this.#bestFor(this.target)
    return this.plan
  }

  clearTarget() {
    this.target = null
    this.plan = null
  }

  #bestFor(target) {
    let best = null
    for (const r of this.table) {
      // L'écart horizontal pèse double : c'est lui que l'œil juge au sol.
      const err = Math.hypot((r.x - target.x) * 1, (r.y - target.y) * 0.5)
      if (!best || err < best.error) best = { release: r.t, landing: { x: r.x, y: r.y }, error: err }
    }
    if (!best) return null
    return { ...best, reachable: best.error <= T.UNREACHABLE }
  }

  /* ---------- Pendant le balancier ---------- */

  /**
   * Où en est-on par rapport à l'instant parfait ?
   * @param {number} simMs temps de balancier
   * @returns {{ ms: number, approach: number, window: boolean } | null}
   *   ms : temps restant avant l'instant parfait (négatif s'il est passé) ;
   *   approach : 1 → 0, rayon relatif du cercle d'approche ; window : dans la note « Bien »
   */
  timing(simMs) {
    if (!this.plan) return null
    const ms = this.plan.release - simMs
    const approach = Math.max(0, Math.min(1, ms / T.APPROACH_MS))
    return { ms, approach, window: this.gradeAt(simMs).id !== 'miss' }
  }

  /**
   * Repères sonores franchis entre deux instants : 'cue' (tic) ou 'now' (instant parfait).
   * @returns {('cue'|'now')[]}
   */
  cues(prevSim, simMs) {
    if (!this.plan || !(simMs > prevSim)) return []
    const out = []
    for (const c of T.CUES_MS) {
      const at = this.plan.release + c
      if (prevSim < at && simMs >= at) out.push('cue')
    }
    if (prevSim < this.plan.release && simMs >= this.plan.release) out.push('now')
    return out
  }

  /**
   * Note d'un lâcher : d'après l'écart entre son impact et l'impact IDÉAL (le
   * meilleur possible pour cette cible). Une cible derrière un mur reste donc
   * notable « Parfait » : on juge le geste, pas la position de la cible.
   * @returns {{ id: 'perfect'|'great'|'good'|'miss', error: number }}
   */
  gradeAt(releaseMs) {
    const ideal = this.plan?.landing
    if (!this.target || !ideal) return { id: 'miss', error: Infinity }
    // Instant le plus proche de la table (même pas que la simulation).
    let row = null
    for (const r of this.table) if (!row || Math.abs(r.t - releaseMs) < Math.abs(row.t - releaseMs)) row = r
    if (!row || Math.abs(row.t - releaseMs) > this.#step) return { id: 'miss', error: Infinity }
    const error = Math.hypot(row.x - ideal.x, (row.y - ideal.y) * 0.5)
    const g = T.GRADES.find((x) => error <= x.within)
    return { id: g ? g.id : 'miss', error }
  }

  /**
   * Aide au lâcher (Facile) : un lâcher à quelques ms de l'instant parfait s'y cale.
   * @param {number} releaseMs instant demandé
   * @param {string} difficulty
   * @returns {number | null} instant à utiliser, ou null s'il n'y a rien à corriger
   */
  assisted(releaseMs, difficulty) {
    const w = T.ASSIST_MS[difficulty] ?? 0
    if (!w || !this.plan?.reachable) return null
    return Math.abs(releaseMs - this.plan.release) <= w ? this.plan.release : null
  }

  /* ---------- Geste ---------- */

  /**
   * Appui (doigt, souris, Espace).
   * @param {{ armed: boolean, aiming: boolean }} state
   * @returns {'release' | null} 'release' : lâcher tout de suite (second clic)
   */
  press(x, y, t, { armed, aiming }) {
    if (armed) {
      this.#press = null
      return 'release'
    }
    this.#press = aiming ? { x, y, t, moved: false, held: false } : null
    return null
  }

  /**
   * Le pointeur bouge pendant l'appui : au-delà de DRAG_PX, on déplace la cible.
   * @returns {boolean} vrai si l'appui est devenu un glissé de cible
   */
  drag(x, y) {
    const p = this.#press
    if (!p || p.held) return false
    if (!p.moved && Math.hypot(x - p.x, y - p.y) >= T.DRAG_PX) p.moved = true
    return p.moved
  }

  /**
   * Image par image pendant l'appui : maintenu assez longtemps sans bouger,
   * l'appui libère le contrepoids (geste unique).
   * @returns {'arm' | null}
   */
  hold(t) {
    const p = this.#press
    if (!p || p.moved || p.held || t - p.t < T.HOLD_MS) return null
    p.held = true
    return 'arm'
  }

  /**
   * Fin d'appui.
   * @param {{ armed: boolean }} state
   * @returns {'arm' | 'release' | null}
   *   'release' : geste unique, la fronde part au relâcher ; 'arm' : appui bref (premier clic)
   */
  unpress(t, { armed }) {
    const p = this.#press
    this.#press = null
    if (!p || p.moved) return null
    if (p.held) return armed ? 'release' : null
    return armed ? null : 'arm'
  }

  get pressing() {
    return this.#press !== null
  }
}
