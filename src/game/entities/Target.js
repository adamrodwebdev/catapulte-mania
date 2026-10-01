import Matter from 'matter-js'
import { Entity } from './Entity.js'
import { CATEGORY } from '../physics/constants.js'
import { Guard, deepFreeze } from '../../core/utils/Guard.js'

/** Types de cibles : le soldat, le chevalier en armure et le roi. */
export const TARGET_TYPES = deepFreeze({
  soldier: { w: 26, h: 50, hp: 30, density: 0.0012, score: 500 },
  knight: { w: 30, h: 54, hp: 75, density: 0.0018, score: 800 },
  king: { w: 32, h: 58, hp: 55, density: 0.0014, score: 1500 },
})

/** Personnage à éliminer, caché dans la structure. */
export class Target extends Entity {
  /**
   * @param {{ type: string, x: number, y: number }} def
   * @param {number} hpFactor multiplicateur de difficulté
   */
  constructor(def, hpFactor = 1) {
    const type = Guard.oneOf(def.type, Object.keys(TARGET_TYPES), 'target type')
    const t = TARGET_TYPES[type]
    const body = Matter.Bodies.rectangle(def.x, def.y, t.w, t.h, {
      density: t.density,
      friction: 0.9,
      frictionStatic: 1.5,
      restitution: 0.05,
      chamfer: { radius: 8 },
      collisionFilter: { category: CATEGORY.TARGET },
    })
    super({ kind: 'target', body, assetKey: `target.${type}`, hp: t.hp * hpFactor, width: t.w, height: t.h, flammable: true })
    this.type = type
    this.scoreValue = t.score
    this.burnDps = 25
    /** Instant (ms de jeu) du dernier coup encaissé, pour l'animation. */
    this.hurtAt = -Infinity
  }

  damage(amount, cause) {
    const died = super.damage(amount, cause)
    if (amount > 1) this.hurtAt = performance.now()
    return died
  }

  /** Une cible prend feu brièvement mais ne brûle pas aussi longtemps que le bois. */
  ignite(durationMs = 2500) {
    return super.ignite(Math.min(durationMs, 2500))
  }
}
