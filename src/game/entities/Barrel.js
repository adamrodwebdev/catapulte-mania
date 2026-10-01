import Matter from 'matter-js'
import { Entity } from './Entity.js'
import { CATEGORY } from '../physics/constants.js'
import { Guard } from '../../core/utils/Guard.js'

/**
 * Baril de poudre : explose quand il est détruit (choc, feu ou autre explosion),
 * ce qui permet des réactions en chaîne.
 */
export class Barrel extends Entity {
  /** @param {{ x: number, y: number }} def */
  constructor(def) {
    Guard.number(def.x, 'barrel x')
    Guard.number(def.y, 'barrel y')
    const w = 34
    const h = 42
    const body = Matter.Bodies.rectangle(def.x, def.y, w, h, {
      density: 0.0014,
      friction: 0.8,
      restitution: 0.05,
      chamfer: { radius: 10 },
      collisionFilter: { category: CATEGORY.BLOCK },
    })
    super({ kind: 'barrel', body, assetKey: 'barrel', hp: 45, width: w, height: h, flammable: true })
    this.scoreValue = 100
    this.burnDps = 30
    this.explosion = { radius: 170, power: 13, damage: 900 }
  }
}
