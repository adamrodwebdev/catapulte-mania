import { WORLD } from './physics/constants.js'
import { CATAPULT_GEOMETRY } from './assets/procedural/painters.js'
import { clamp, toRad } from '../core/utils/math.js'
import { Guard } from '../core/utils/Guard.js'

/** Bornes de visée. */
export const AIM = Object.freeze({
  MIN_ANGLE: 5,
  MAX_ANGLE: 80,
  MIN_SPEED: 8,
  MAX_SPEED: 27,
})

const REST_ANGLE = Math.PI - 0.25
const RELEASE_ANGLE = 2 * Math.PI - 1.1
const SWING_MS = 170
const RECOIL_MS = 900

/**
 * Catapulte du joueur : réglage de l'angle et de la puissance, animation du bras.
 * Le point de lâcher est calculé à partir de la géométrie du bras, si bien que
 * le projectile part exactement du godet dessiné.
 */
export class Catapult {
  x
  y = WORLD.GROUND_Y
  /** Angle de tir en degrés (0 = horizontal, 90 = vertical). */
  angle = 45
  /** Puissance de 0 à 1. */
  power = 0.55
  #phase = 'idle'
  #phaseT = 0
  #onRelease = null
  armAngle = REST_ANGLE

  constructor(x = 170) {
    this.x = Guard.number(x, 'catapult x', { min: 0, max: WORLD.WIDTH })
  }

  /** @param {number} angle degrés @param {number} power 0..1 */
  setAim(angle, power) {
    this.angle = clamp(Guard.number(angle, 'angle'), AIM.MIN_ANGLE, AIM.MAX_ANGLE)
    this.power = clamp(Guard.number(power, 'power'), 0, 1)
  }

  get speed() {
    return AIM.MIN_SPEED + (AIM.MAX_SPEED - AIM.MIN_SPEED) * this.power
  }

  /** Vitesse initiale (unités Matter normalisées, Y vers le bas). */
  get velocity() {
    const a = toRad(this.angle)
    return { x: Math.cos(a) * this.speed, y: -Math.sin(a) * this.speed }
  }

  /** Position du godet au moment du lâcher. */
  get launchPoint() {
    const { pivotX, pivotY, armLength } = CATAPULT_GEOMETRY
    const c = Math.cos(RELEASE_ANGLE)
    const s = Math.sin(RELEASE_ANGLE)
    return { x: this.x + pivotX + c * armLength + s * 14, y: this.y + pivotY + s * armLength - c * 14 }
  }

  get busy() {
    return this.#phase === 'swing'
  }

  /** Lance l'animation ; `onRelease` est appelé quand le bras atteint le point de lâcher. */
  fire(onRelease) {
    if (this.#phase === 'swing') return false
    this.#phase = 'swing'
    this.#phaseT = 0
    this.#onRelease = onRelease
    return true
  }

  update(dtMs) {
    this.#phaseT += dtMs
    const rest = REST_ANGLE + this.power * 0.28
    if (this.#phase === 'swing') {
      const t = Math.min(1, this.#phaseT / SWING_MS)
      this.armAngle = rest + (RELEASE_ANGLE - rest) * (t * t)
      if (t >= 1) {
        this.#phase = 'recoil'
        this.#phaseT = 0
        const cb = this.#onRelease
        this.#onRelease = null
        cb?.()
      }
    } else if (this.#phase === 'recoil') {
      const t = Math.min(1, this.#phaseT / RECOIL_MS)
      const ease = 1 - Math.pow(1 - t, 3)
      this.armAngle = RELEASE_ANGLE + (rest - RELEASE_ANGLE) * ease + Math.sin(t * 10) * 0.05 * (1 - t)
      if (t >= 1) this.#phase = 'idle'
    } else {
      this.armAngle += (rest - this.armAngle) * Math.min(1, dtMs / 80)
    }
  }
}
