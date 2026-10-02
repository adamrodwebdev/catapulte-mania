import Matter from 'matter-js'
import { Entity } from './Entity.js'
import { MATERIALS } from './materials.js'
import { CATEGORY } from '../physics/constants.js'
import { Guard } from '../../core/utils/Guard.js'

const SHAPES = ['rect', 'triangle']

/**
 * Bloc de construction (bois, pierre, fer, verre, paille).
 * Formes : rectangle (murs, poutres, piliers) ou triangle (toits).
 */
export class Block extends Entity {
  /**
   * @param {{ material: string, x: number, y: number, w: number, h: number,
   *   shape?: 'rect'|'triangle', angle?: number }} def
   */
  constructor(def) {
    const material = Guard.oneOf(def.material, Object.keys(MATERIALS), 'material')
    const shape = Guard.oneOf(def.shape ?? 'rect', SHAPES, 'shape')
    const w = Guard.number(def.w, 'w', { min: 6, max: 600 })
    const h = Guard.number(def.h, 'h', { min: 6, max: 600 })
    const m = MATERIALS[material]
    const options = {
      density: m.density,
      friction: m.friction,
      frictionStatic: material === 'iron' ? 2.2 : 1.6,
      restitution: m.restitution,
      slop: 0.03,
      angle: def.angle ?? 0,
      collisionFilter: { category: CATEGORY.BLOCK },
    }
    const body =
      shape === 'triangle'
        ? Matter.Bodies.fromVertices(def.x, def.y, [[{ x: -w / 2, y: h / 2 }, { x: 0, y: -h / 2 }, { x: w / 2, y: h / 2 }]], options)
        : Matter.Bodies.rectangle(def.x, def.y, w, h, { ...options, chamfer: { radius: Math.min(3, w / 6, h / 6) } })
    super({ kind: 'block', body, assetKey: `block.${material}`, hp: m.hp, width: w, height: h, flammable: m.flammable })
    this.material = material
    this.shape = shape
    this.scoreValue = m.score
    this.sound = m.sound
    this.burnDps = m.burn?.dps ?? 20
    /** Durée de combustion et facilité à prendre feu (propagation). */
    this.burnMs = m.burn?.ms ?? 6000
    this.catchChance = m.burn?.spread ?? 0.3
    /** Blindage : part des dégâts de choc subis (le fer encaisse mieux). */
    this.armor = m.armor ?? 1
  }

  /** La durée de combustion dépend du matériau, pas de la source du feu. */
  ignite() {
    return super.ignite(this.burnMs)
  }

  /** Choc reçu : réduit par le blindage du matériau (explosions et feu passent par damage()). */
  receiveImpact(energy, other) {
    return this.damage(energy * this.armor, 'impact')
  }
}
