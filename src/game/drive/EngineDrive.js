import { WORLD } from '../physics/constants.js'
import { clamp } from '../../core/utils/math.js'
import { DRIVE, extentOf } from './driveRules.js'

/** Pas sans mouvement. */
const IDLE = Object.freeze({ dx: 0, settled: false, hit: null, side: 0 })
/** Pas où l'engin vient de s'immobiliser. */
const SETTLED = Object.freeze({ dx: 0, settled: true, hit: null, side: 0 })

/**
 * Déplacement de l'engin (v6.2 ; règles : driveRules.js). Sens demandé,
 * vitesse, cabrage, entrée du journal en cours, bornes (portée des archers,
 * terrain, obstacles) et chemin parcouru. Logique seule, au pas de simulation :
 * la partie applique le déplacement à ses engins et en tire les effets
 * (poussière, sons, sous-titres) ; DriveView.js en fait l'affichage.
 */
export class EngineDrive {
  /** Sens demandé : -1 (recule), 0, 1 (avance). */
  dir = 0
  /** Cabrage (dessin seulement) : l'engin se cabre en accélérant, pique du nez en freinant. */
  tilt = 0
  /** Vitesse (px par pas). */
  #v = 0
  /** Entrée du journal du déplacement en cours (début et durée, en pas). */
  #entry = null
  #home
  /** Portée des archers : l'engin ne va pas plus loin. */
  #line = Infinity
  #rolled = 0
  /** Dernier obstacle rencontré (une annonce par poussée). */
  #blocked = null
  #movedAt = -Infinity

  /** @param {number} home place de départ de l'engin */
  constructor(home) {
    this.#home = home
  }

  /** Place de départ. */
  get home() {
    return this.#home
  }

  /** Instant (temps du monde) du dernier mouvement. */
  get movedAt() {
    return this.#movedAt
  }

  /** Portée des archers : l'engin n'approche pas le front du château à moins de STANDOFF. */
  limitTo(castleLeft) {
    this.#line = castleLeft - DRIVE.STANDOFF
  }

  /**
   * Avancer (1), reculer (-1) ou s'arrêter (0).
   * @param {number} dir
   * @param {number} steps pas de simulation en cours
   * @returns {{ entry: object | null } | null} null si le sens ne change pas ;
   *   sinon l'entrée ouverte au journal (null à l'arrêt)
   */
  request(dir, steps) {
    const d = dir > 0 ? 1 : dir < 0 ? -1 : 0
    if (d === this.dir) return null
    this.close(steps)
    this.dir = d
    this.#blocked = null
    if (d !== 0) this.#entry = { k: 'm', d: steps, v: d, n: 0 }
    return { entry: this.#entry }
  }

  /** Clôt l'entrée du journal en cours (sa durée, en pas). */
  close(steps) {
    const e = this.#entry
    if (e) e.n = steps - e.d
    this.#entry = null
  }

  /** Arrêt net (tir, fin de partie). */
  stop(steps) {
    this.close(steps)
    this.dir = 0
    this.#v = 0
  }

  /**
   * Un pas : l'engin accélère, roule, freine, et s'arrête devant ce qui lui barre la route.
   * @param {{ x: number, kind: string }} engine
   * @param {object} world
   * @param {boolean} open l'engin peut-il bouger maintenant ?
   * @returns {{ dx: number, settled: boolean, hit: string | null, side: number }}
   *   dx : chemin du pas ; settled : il vient de s'immobiliser ; hit : ce qui vient
   *   de l'arrêter (une fois par poussée), side : de quel côté
   */
  step(engine, world, open) {
    const target = open ? this.dir * DRIVE.SPEED : 0
    if (target === 0 && this.#v === 0) {
      this.tilt *= 0.9
      return IDLE
    }
    const rate = target !== 0 && this.#v * target >= 0 ? DRIVE.ACCEL : DRIVE.BRAKE
    const before = this.#v
    this.#v += clamp(target - this.#v, -rate, rate)
    // Poids : l'engin se cabre quand il prend de la vitesse, pique du nez quand il freine.
    this.tilt += (clamp(-(this.#v - before) * 0.9, -0.035, 0.035) - this.tilt) * 0.15
    if (target === 0 && Math.abs(this.#v) < 1e-3) {
      this.#v = 0
      return SETTLED
    }
    const b = this.bounds(engine, world)
    let x = engine.x + this.#v
    let hit = null
    if (this.#v > 0 && x > b.max) {
      x = Math.max(engine.x, b.max)
      hit = b.ahead
    } else if (this.#v < 0 && x < b.min) {
      x = Math.min(engine.x, b.min)
      hit = b.behind
    }
    const dx = x - engine.x
    if (!hit) return { dx, settled: false, hit: null, side: 0 }
    const side = Math.sign(this.#v)
    this.#v = 0
    if (this.#blocked === hit) return { dx, settled: false, hit: null, side }
    this.#blocked = hit
    return { dx, settled: false, hit, side }
  }

  /**
   * Chemin parcouru : note l'instant du mouvement et dit quels seuils il
   * franchit (poussière, roulement, grincement), pour les effets.
   * @returns {{ dust: boolean, roll: boolean, creak: boolean }}
   */
  travel(dx, worldTime) {
    const before = this.#rolled
    this.#rolled += Math.abs(dx)
    this.#movedAt = worldTime
    const crossed = (every) => Math.floor(this.#rolled / every) !== Math.floor(before / every)
    return { dust: crossed(DRIVE.DUST_EVERY), roll: crossed(DRIVE.ROLL_EVERY), creak: crossed(DRIVE.CREAK_EVERY) }
  }

  /**
   * Jusqu'où l'engin peut rouler, et ce qui l'arrête de chaque côté : devant, la
   * portée des archers (ou l'avance la plus longue), la roche, l'eau, la glace,
   * la lave, un débris, un défenseur ; derrière, le bord du camp.
   */
  bounds(engine, world) {
    const ext = extentOf(engine.kind)
    let max = Math.min(this.#home + DRIVE.AHEAD, this.#line)
    let ahead = 'range'
    let min = DRIVE.BACK
    let behind = 'camp'
    const front = engine.x + ext.front
    const rear = engine.x - ext.rear
    const wall = (left, right, kind) => {
      if (left >= front - 1) {
        const m = left - DRIVE.GAP - ext.front
        if (m < max) {
          max = m
          ahead = kind
        }
      } else if (right <= rear + 1) {
        const m = right + DRIVE.GAP + ext.rear
        if (m > min) {
          min = m
          behind = kind
        }
      }
    }
    for (const z of world.terrain.list) if (z.kind !== 'snow') wall(z.x0, z.x1, z.kind === 'lake' ? 'water' : z.kind)
    for (const e of world.entities()) {
      if (!e.alive || e.kind === 'projectile' || e.kind === 'flyer' || e.y + e.height / 2 < WORLD.GROUND_Y - 30) continue
      wall(e.x - e.width / 2, e.x + e.width / 2, e.kind === 'target' ? 'unit' : e.terrain ? 'rock' : 'debris')
    }
    return { min, max, ahead, behind }
  }
}
