import { WORLD } from './physics/constants.js'
import { clamp, toRad } from '../core/utils/math.js'
import { Guard, deepFreeze } from '../core/utils/Guard.js'

/**
 * Baliste (v5.1) : l'arme ultime, la plus difficile à obtenir.
 *
 * Une arbalète géante sur affût : elle tire des CARREAUX de fer, très rapides
 * et lourds, sur une trajectoire tendue.
 *  - plus PRÉCISE que la catapulte : visée angle + puissance, carreau peu
 *    sensible au vent, et une ligne de mire (le début de la trajectoire) qui
 *    reste affichée même sans aide à la visée ;
 *  - plus PUISSANTE que le trébuchet : le carreau perce tous les murs qu'il
 *    brise (même la pierre), et traverse la roche des montagnes ;
 *  - extrêmement difficile à débloquer (BALLISTA_UNLOCK).
 * Les munitions spéciales deviennent des carreaux spéciaux (feu, givre,
 * poudre…), voir GameSession#fire.
 *
 * Même interface que Catapult (setAim, fire, update, launchPoint, velocity).
 */
export const BALLISTA_UNLOCK = deepFreeze({ levels: 70, stars: 180 })

/** Bornes de visée et vitesses du carreau (unités Matter normalisées). */
export const BALLISTA_AIM = deepFreeze({ MIN_ANGLE: 0, MAX_ANGLE: 60, MIN_SPEED: 14, MAX_SPEED: 31 })

/** Géométrie : axe de l'affût, longueur de l'arbrier (bout = point de départ du carreau). */
export const BALLISTA_GEOMETRY = deepFreeze({ pivotY: -62, stock: 74 })

const DRAW_MS = 260
const RECOIL_MS = 700

/** La baliste est-elle débloquée pour ce profil ? */
export function ballistaUnlocked(completed, stars) {
  return Number(completed) >= BALLISTA_UNLOCK.levels && Number(stars) >= BALLISTA_UNLOCK.stars
}

export class Ballista {
  kind = 'ballista'
  x
  y = WORLD.GROUND_Y
  dir = 1
  speedFactor = 1
  angle = 20
  power = 1
  /** Tension de la corde (0 = détendue, 1 = armée), pour le dessin. */
  tension = 1
  #phase = 'idle'
  #phaseT = 0
  #onRelease = null

  constructor(x = 170, { dir = 1, speedFactor = 1 } = {}) {
    this.x = Guard.number(x, 'ballista x', { min: 0, max: WORLD.WIDTH })
    this.dir = dir === -1 ? -1 : 1
    this.speedFactor = Guard.number(speedFactor, 'speedFactor', { min: 0.5, max: 1.6 })
  }

  setAim(angle, power) {
    this.angle = clamp(Guard.number(angle, 'angle'), BALLISTA_AIM.MIN_ANGLE, BALLISTA_AIM.MAX_ANGLE)
    this.power = clamp(Guard.number(power, 'power'), 0, 1)
  }

  get speed() {
    return (BALLISTA_AIM.MIN_SPEED + (BALLISTA_AIM.MAX_SPEED - BALLISTA_AIM.MIN_SPEED) * this.power) * this.speedFactor
  }

  get velocity() {
    const a = toRad(this.angle)
    return { x: Math.cos(a) * this.speed * this.dir, y: -Math.sin(a) * this.speed }
  }

  /** Bout de l'arbrier, orienté selon l'angle de tir. */
  get launchPoint() {
    const a = toRad(this.angle)
    const { pivotY, stock } = BALLISTA_GEOMETRY
    return { x: this.x + this.dir * Math.cos(a) * stock, y: this.y + pivotY - Math.sin(a) * stock }
  }

  /** Inclinaison de l'arbrier (radians, sens trigonométrique), pour le dessin. */
  get armAngle() {
    return toRad(this.angle)
  }

  get busy() {
    return this.#phase === 'draw'
  }

  fire(onRelease) {
    if (this.#phase === 'draw') return false
    this.#phase = 'draw'
    this.#phaseT = 0
    this.#onRelease = onRelease
    return true
  }

  update(dtMs) {
    this.#phaseT += dtMs
    if (this.#phase === 'draw') {
      // Le treuil tend encore un peu la corde, puis elle claque.
      const t = Math.min(1, this.#phaseT / DRAW_MS)
      this.tension = 1 + 0.08 * Math.sin(t * Math.PI)
      if (t >= 1) {
        this.#phase = 'recoil'
        this.#phaseT = 0
        this.tension = 0
        const cb = this.#onRelease
        this.#onRelease = null
        cb?.()
      }
    } else if (this.#phase === 'recoil') {
      const t = Math.min(1, this.#phaseT / RECOIL_MS)
      this.tension = t < 0.25 ? 0 : (t - 0.25) / 0.75
      if (t >= 1) this.#phase = 'idle'
    } else {
      this.tension = 1
    }
  }
}
