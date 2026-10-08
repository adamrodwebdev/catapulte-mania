import Matter from 'matter-js'
import { Entity } from './Entity.js'
import { CATEGORY } from '../physics/constants.js'
import { Guard, deepFreeze } from '../../core/utils/Guard.js'

/**
 * Créatures volantes (v5.0).
 *  - corbeau : une nuée qui patrouille devant le château. Un projectile qui la
 *    traverse est stoppé net (il retombe), le corbeau y laisse des plumes ;
 *  - vouivre : un petit dragon qui porte un pot de feu grégeois. Abattue, elle
 *    lâche son pot, qui s'écrase en flammes sur ce qui se trouve dessous :
 *    un tir d'adresse qui peut incendier tout un château.
 *
 * - radius : rayon de collision ; brake : part de la vitesse que garde le
 *   projectile qui la heurte ; score : points accordés.
 */
export const FLYER_TYPES = deepFreeze({
  crow: { radius: 20, brake: 0.12, score: 150, w: 54, h: 40 },
  wyvern: { radius: 32, brake: 0.25, score: 400, w: 110, h: 76 },
})
export const FLYER_NAMES = Object.freeze(Object.keys(FLYER_TYPES))

/**
 * Trajectoire de patrouille : aller-retour horizontal (sinus) et ondulation
 * verticale. Entièrement déterminée par le temps écoulé : deux parties
 * identiques voient les créatures aux mêmes endroits (relectures, solveur).
 */
export class Flyer extends Entity {
  #t = 0

  /**
   * @param {{ type: string, x: number, y: number, range: number, period: number, phase?: number }} def
   */
  constructor(def) {
    const type = Guard.oneOf(def.type, FLYER_NAMES, 'flyer type')
    const spec = FLYER_TYPES[type]
    const x = Guard.number(def.x, 'flyer x', { min: -500, max: 4000 })
    const y = Guard.number(def.y, 'flyer y', { min: -800, max: 1000 })
    const body = Matter.Bodies.circle(x, y, spec.radius, {
      isStatic: true,
      isSensor: true,
      collisionFilter: { category: CATEGORY.FLYER, mask: CATEGORY.PROJECTILE },
    })
    super({ kind: 'flyer', body, assetKey: `flyer.${type}`, hp: 1, width: spec.w, height: spec.h })
    this.type = type
    this.radius = spec.radius
    this.brake = spec.brake
    this.scoreValue = spec.score
    this.home = Object.freeze({ x, y })
    this.range = Guard.number(def.range, 'flyer range', { min: 0, max: 900 })
    this.period = Guard.number(def.period, 'flyer period', { min: 1500, max: 20000 })
    this.phase = Guard.number(def.phase ?? 0, 'flyer phase', { min: 0, max: 1 })
    /** Sens du vol (pour le dessin) : 1 vers la droite, -1 vers la gauche. */
    this.facing = 1
    /** Battement d'ailes (dessin). */
    this.flap = 0
    /** La vouivre porte encore son pot de feu. */
    this.carrying = type === 'wyvern'
    this.#move()
  }

  /** Les créatures volantes ne tombent pas sous les chocs ordinaires (voir PhysicsWorld). */
  receiveImpact() {
    return false
  }

  #move() {
    const u = (this.#t / this.period + this.phase) * Math.PI * 2
    const x = this.home.x + Math.sin(u) * this.range
    const y = this.home.y + Math.sin(u * 2) * 18
    this.facing = Math.cos(u) >= 0 ? 1 : -1
    Matter.Body.setPosition(this.body, { x, y })
  }

  update(dtMs) {
    if (!this.alive) return
    this.#t += dtMs
    this.flap = (this.#t / (this.type === 'crow' ? 140 : 260)) % 1
    this.#move()
  }

  /** Les créatures ne brûlent pas et ne gèlent pas : on les abat. */
  ignite() {
    return false
  }
  freeze() {
    return false
  }
}
