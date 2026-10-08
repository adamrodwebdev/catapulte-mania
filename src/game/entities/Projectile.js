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
   * @param {{ massFactor?: number, ignites?: boolean, explodes?: boolean, radius?: number, blastFactor?: number, fireFactor?: number }} [mods]
   */
  constructor(type, x, y, mods = {}) {
    Guard.oneOf(type, PROJECTILE_NAMES, 'projectile type')
    const t = PROJECTILE_TYPES[type]
    const massFactor = Guard.number(mods.massFactor ?? 1, 'massFactor', { min: 0.1, max: 5 })
    const radiusFactor = Guard.number(mods.radiusFactor ?? 1, 'radiusFactor', { min: 0.5, max: 2 })
    const radius = (mods.radius ?? t.radius) * radiusFactor
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
    /** Boulet de givre : gèle ce qui l'entoure à l'impact (v5.0). */
    this.frost = Boolean(t.frost)
    /** Pouvoirs (v5.0) : Pierre d'aimant (attiré par les défenseurs), Météore (piqué au toucher). */
    this.homing = Boolean(mods.homing)
    this.diveable = Boolean(mods.dive)
    this.diving = false
    /** Ricochets sur l'eau (un seul permis) ; boule de neige : facteur de grossissement. */
    this.skips = 0
    this.snowScale = 1
    this.onSnow = false
    /** Améliorations de l'atelier : rayon d'explosion (Poudre fine) et de mise à feu (Poix). */
    this.blastFactor = Guard.number(mods.blastFactor ?? 1, 'blastFactor', { min: 0.5, max: 3 })
    this.fireFactor = Guard.number(mods.fireFactor ?? 1, 'fireFactor', { min: 0.5, max: 3 })
    this.empowered = massFactor > 1 || radiusFactor > 1 || Boolean(mods.ignites) || Boolean(mods.explodes) || this.homing || this.diveable
    this.hasImpacted = false
    this.hasSplit = false
    this.ageMs = 0
    this.restMs = 0
    this.spent = false
    /**
     * Chaleur restante après le premier choc (ms). Un boulet enflammé continue de
     * brûler un moment : il met le feu à ce qu'il touche en rebondissant, en
     * roulant ou en s'immobilisant contre un matériau inflammable.
     */
    this.heatMs = 0
    if (this.ignites) this.burning = Infinity
  }

  /** Le joueur peut-il déclencher l'action spéciale en vol ? */
  get canActivate() {
    if (!this.alive || this.hasImpacted) return false
    return (this.splittable && !this.hasSplit) || (this.diveable && !this.diving)
  }

  /** Les projectiles ne subissent pas de dégâts. */
  receiveImpact() {
    return false
  }

  /** Le boulet est-il encore assez chaud pour enflammer ce qu'il touche ? */
  get hot() {
    return this.ignites && this.alive && !this.spent && (!this.hasImpacted || this.heatMs > 0)
  }

  update(dtMs) {
    this.ageMs += dtMs
    if (this.speed < 0.45) this.restMs += dtMs
    else this.restMs = 0
    if (this.hasImpacted && this.heatMs > 0) {
      this.heatMs = Math.max(0, this.heatMs - dtMs)
      if (this.heatMs === 0) this.burning = 0
    }
    // Encore brûlant, il reste un peu plus longtemps là où il s'est arrêté.
    const restLimit = this.heatMs > 0 ? 1800 : 650
    if (this.restMs > restLimit || this.ageMs > 12000) this.spent = true
  }
}
