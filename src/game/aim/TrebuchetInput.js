import { Guard, deepFreeze } from '../../core/utils/Guard.js'
import { clamp } from '../../core/utils/math.js'

/**
 * Commande du trébuchet (v5.4) : deux clics, aucun chronométrage.
 *
 *  1er clic : le joueur touche EXACTEMENT le point où le projectile doit
 *             percuter (un fanion s'y plante) ;
 *  2e clic  : une jauge oscille entre « tir en cloche » et « tir tendu » ; le
 *             clic la fige. La courbe du tir s'affiche en direct pendant
 *             l'oscillation : on voit si l'arc passe au-dessus du rempart.
 *
 * Le trébuchet tire alors tout seul : le balancier part et la fronde s'ouvre
 * à l'instant où elle a l'angle choisi ; la vitesse est celle qui mène
 * exactement au point visé (contrepoids « ajusté »), sans dépasser ce que
 * l'engin peut donner sous cet angle. Seules les rafales à venir (Difficile)
 * peuvent encore dévier le tir.
 *
 * Module pur (aucun accès au DOM ni au moteur) : la prédiction de vol lui est
 * fournie par une fonction, ce qui le rend testable seul.
 *
 * Inspirations : la visée en deux temps des jeux de golf (direction, puis
 * jauge de puissance), le choix de l'arc des jeux d'artillerie (Worms,
 * Angry Birds Space pour la courbe en direct).
 */
export const TREB_TUNING = deepFreeze({
  /** Angles de départ aux deux bouts de la jauge (degrés). */
  LOB_ANGLE: 66,
  FLAT_ANGLE: 10,
  /** Durée d'un aller de la jauge (ms réelles) selon la difficulté. */
  SWEEP_MS: deepFreeze({ easy: 1700, normal: 1350, hard: 1000 }),
  /** Option « Jauge lente » : allers plus longs. */
  SLOW_FACTOR: 1.5,
  /** Au-delà, l'appui est un glissé : on déplace la cible au lieu de valider. */
  DRAG_PX: 12,
  /** Pas de la cible au clavier (unités du monde ; Maj : pas fin). */
  NUDGE: 20,
  NUDGE_FINE: 4,
  /** Vitesse minimale d'un tir (unités Matter). */
  MIN_SPEED: 3,
  /** Itérations de la recherche de vitesse (précision bien inférieure au pixel). */
  SOLVE_STEPS: 22,
})

const T = TREB_TUNING

export class TrebuchetInput {
  /** Cible au sol (unités du monde), ou null. */
  target = null
  /** 'target' : on choisit le point d'impact ; 'power' : la jauge oscille. */
  phase = 'target'
  #sweep
  #t = 0
  /** Geste en cours. */
  #press = null

  /** @param {{ sweepMs?: number }} [opts] durée d'un aller de la jauge */
  constructor({ sweepMs = T.SWEEP_MS.normal } = {}) {
    this.setSweep(sweepMs)
  }

  /** Durée d'un aller de la jauge (difficulté, option « Jauge lente »). */
  setSweep(ms) {
    this.#sweep = Guard.number(ms, 'sweep', { min: 200, max: 10000 })
  }

  /** Durée d'un aller selon la difficulté et l'option d'accessibilité. */
  static sweepFor(difficulty, slow = false) {
    const base = T.SWEEP_MS[difficulty] ?? T.SWEEP_MS.normal
    return slow ? base * T.SLOW_FACTOR : base
  }

  /* ---------- Cible ---------- */

  /** 1er clic : plante la cible et lance la jauge (elle part du tir en cloche). */
  place(x, y) {
    this.move(x, y)
    this.phase = 'power'
    this.#t = 0
  }

  /** Déplace la cible sans toucher à la jauge (glissé, flèches). */
  move(x, y) {
    Guard.number(x, 'target x')
    Guard.number(y, 'target y')
    this.target = { x, y }
  }

  /** Nouveau tour : on revient au choix de la cible (la dernière reste proposée). */
  reset() {
    this.phase = 'target'
    this.#t = 0
    this.#press = null
  }

  clear() {
    this.target = null
    this.reset()
  }

  /* ---------- Jauge ---------- */

  /** Fait osciller la jauge (ms réelles). */
  tick(dtMs) {
    if (this.phase !== 'power') return
    this.#t = (this.#t + Math.max(0, Math.min(dtMs, 100))) % (2 * this.#sweep)
  }

  /** Position de la jauge : 0 = cloche, 1 = tendu (aller-retour régulier). */
  get gauge() {
    const u = this.#t / this.#sweep
    return Math.round((u <= 1 ? u : 2 - u) * 1000) / 1000
  }

  /** Angle de départ pour une position de jauge (degrés). */
  static angleFor(g) {
    const k = clamp(Guard.number(g, 'gauge'), 0, 1)
    return T.LOB_ANGLE + (T.FLAT_ANGLE - T.LOB_ANGLE) * k
  }

  /**
   * Vitesse de départ qui mène exactement à la cible, sous un angle donné.
   * La courbe est obtenue par `predict` (même intégration que la physique,
   * vent du moment compris) ; la vitesse est cherchée par dichotomie.
   *
   * @param {{ start: {x:number,y:number}, target: {x:number,y:number}, angle: number, dir?: 1|-1, vmax: number,
   *   predict: (start: {x:number,y:number}, velocity: {x:number,y:number}) => {x:number,y:number}[] }} q
   * @returns {{ velocity: {x:number,y:number}, speed: number, reachable: boolean }}
   */
  static solve({ start, target, angle, dir = 1, vmax, predict }) {
    Guard.func(predict, 'predict')
    Guard.number(vmax, 'vmax', { min: T.MIN_SPEED, max: 200 })
    const a = (Guard.number(angle, 'angle', { min: 0, max: 89 }) * Math.PI) / 180
    const vel = (v) => ({ x: Math.cos(a) * v * dir, y: -Math.sin(a) * v })
    // Hauteur de la trajectoire à l'aplomb de la cible : sous un angle donné,
    // plus on lance vite, plus la courbe passe haut (à la montée comme à la
    // descente). On cherche la vitesse qui la fait passer par la cible.
    const want = (target.x - start.x) * dir
    const heightAt = (v) => {
      const pts = predict(start, vel(v))
      let prev = start
      for (const p of pts) {
        const a0 = (prev.x - start.x) * dir
        const a1 = (p.x - start.x) * dir
        if (a0 <= want && a1 >= want) {
          const k = a1 === a0 ? 1 : (want - a0) / (a1 - a0)
          return prev.y + (p.y - prev.y) * k
        }
        prev = p
      }
      // Retombé avant d'arriver à la cible : trop faible.
      return Infinity
    }
    if (heightAt(vmax) > target.y) return { velocity: vel(vmax), speed: vmax, reachable: false }
    let lo = T.MIN_SPEED
    let hi = vmax
    for (let i = 0; i < T.SOLVE_STEPS; i++) {
      const mid = (lo + hi) / 2
      if (heightAt(mid) > target.y) lo = mid
      else hi = mid
    }
    const speed = Math.round(((lo + hi) / 2) * 1e6) / 1e6
    return { velocity: vel(speed), speed, reachable: true }
  }

  /* ---------- Geste ---------- */

  /** Appui (doigt, souris). */
  press(x, y) {
    this.#press = { x, y, moved: false }
  }

  /**
   * Le pointeur bouge pendant l'appui : au-delà de DRAG_PX, on déplace la cible.
   * @returns {boolean} vrai si l'appui est devenu un glissé de cible
   */
  drag(x, y) {
    const p = this.#press
    if (!p) return false
    if (!p.moved && Math.hypot(x - p.x, y - p.y) >= T.DRAG_PX) p.moved = true
    return p.moved
  }

  /**
   * Fin d'appui.
   * @returns {'tap' | 'drag' | null} tap : un clic (cible, puis jauge) ; drag : glissé terminé
   */
  unpress() {
    const p = this.#press
    this.#press = null
    if (!p) return null
    return p.moved ? 'drag' : 'tap'
  }

  get pressing() {
    return this.#press !== null
  }
}
