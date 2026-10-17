import Matter from 'matter-js'
import { Entity } from './Entity.js'
import { MATERIALS } from './materials.js'
import { PROP_TYPES } from './props.js'
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
   *   shape?: 'rect'|'triangle', angle?: number, prop?: string | null }} def
   *   prop (v6.1) : ouvrage (moulin, forge, citerne, ruche, farine ; voir props.js)
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
      collisionFilter: { category: m.static ? CATEGORY.TERRAIN : CATEGORY.BLOCK },
      // Roche du décor : immobile.
      isStatic: Boolean(m.static),
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
    /** Élément du décor (roche) : fixe, indestructible, ne rapporte rien. */
    this.terrain = Boolean(m.static)
    /** Ouvrage (v6.1) : son dessin, sa résistance et ses points ; son comportement : physics/Props.js. */
    this.prop = def.prop ? Guard.oneOf(def.prop, Object.keys(PROP_TYPES), 'prop') : null
    /** Clé de voûte (v6.2) : point sensible du château (voir CastleJoints.js). */
    this.keystone = Boolean(def.keystone)
    if (this.prop) {
      const p = PROP_TYPES[this.prop]
      this.assetKey = `prop.${this.prop}`
      this.maxHp = this.hp = p.hp
      this.scoreValue = p.score
    }
  }

  /** Ouvrage trempé par une citerne (v6.2) à cet instant : la forge ne crache plus de feu. */
  quenchedAt(time) {
    return (this.quenchedUntil ?? 0) > time
  }

  /** Fer rougi (v6.2, voir ElementCombos) à cet instant ? */
  redHotAt(time) {
    return this.hotUntil > time
  }

  /** Temps de fer rougi qu'il reste à cet instant (ms). */
  redHotLeft(time) {
    return this.hotUntil - time
  }

  /** Fer électrisé (v6.2, voir ElementCombos) à cet instant ? */
  chargedAt(time) {
    return this.chargedUntil > time
  }

  /** Grande montagne du décor (v6.2) : un triangle de roche d'au moins 180 de haut ; le vent arrache des panaches à son sommet. */
  get mountainPeak() {
    return this.material === 'rock' && this.shape === 'triangle' && this.height >= 180
  }

  /** La durée de combustion dépend du matériau, pas de la source du feu. */
  ignite() {
    return super.ignite(this.burnMs)
  }

  /** Choc reçu : réduit par le blindage du matériau (explosions et feu passent par damage()). */
  receiveImpact(energy, _other) {
    // Gelé, même le fer perd son blindage.
    return this.damage(energy * (this.frozenMs > 0 ? 1 : this.armor), 'impact')
  }
}
