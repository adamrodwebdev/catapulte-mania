import Matter from 'matter-js'
import { Entity } from './Entity.js'
import { CATEGORY } from '../physics/constants.js'
import { Guard } from '../../core/utils/Guard.js'
import { PROJECTILE_TYPES, PROJECTILE_NAMES } from './catalog.js'

export { PROJECTILE_TYPES, PROJECTILE_NAMES }

/**
 * Projectile tiré par la catapulte.
 * Les pouvoirs spéciaux s'appliquent comme des modificateurs (composition) :
 * `{ massFactor, ignites, explodes }`.
 */
export class Projectile extends Entity {
  /**
   * @param {string} type
   * @param {number} x
   * @param {number} y
   * @param {{ massFactor?: number, ignites?: boolean, explodes?: boolean, radius?: number }} [mods]
   */
  constructor(type, x, y, mods = {}) {
    Guard.oneOf(type, PROJECTILE_NAMES, 'projectile type')
    const t = PROJECTILE_TYPES[type]
    const massFactor = Guard.number(mods.massFactor ?? 1, 'massFactor', { min: 0.1, max: 5 })
    const radius = mods.radius ?? t.radius
    const body = Matter.Bodies.circle(x, y, radius, {
      density: t.density * massFactor,
      friction: 0.4,
      frictionAir: 0.0006,
      restitution: 0.15,
      collisionFilter: { category: CATEGORY.PROJECTILE },
    })
    super({ kind: 'projectile', body, assetKey: `projectile.${type}`, width: radius * 2, height: radius * 2 })
    this.type = type
    this.radius = radius
    this.impactFactor = t.impact * (massFactor > 1 ? 1 + (massFactor - 1) * 0.35 : 1)
    this.ignites = Boolean(mods.ignites || t.ignites)
    this.explodes = Boolean(mods.explodes || t.explodes)
    this.splittable = t.splits
    this.empowered = massFactor > 1 || Boolean(mods.ignites) || Boolean(mods.explodes)
    this.hasImpacted = false
    this.hasSplit = false
    this.ageMs = 0
    this.restMs = 0
    this.spent = false
    if (this.ignites) this.burning = Infinity
  }

  /** Le joueur peut-il déclencher l'action spéciale en vol ? */
  get canActivate() {
    return this.splittable && !this.hasSplit && !this.hasImpacted && this.alive
  }

  /** Les projectiles ne subissent pas de dégâts. */
  receiveImpact() {
    return false
  }

  update(dtMs) {
    this.ageMs += dtMs
    if (this.speed < 0.45) this.restMs += dtMs
    else this.restMs = 0
    if (this.restMs > 650 || this.ageMs > 12000) this.spent = true
  }
}
