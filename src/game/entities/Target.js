import Matter from 'matter-js'
import { Entity } from './Entity.js'
import { CATEGORY } from '../physics/constants.js'
import { Guard } from '../../core/utils/Guard.js'
import { TARGET_TYPES } from './catalog.js'

export { TARGET_TYPES }

/** Personnage à éliminer, caché dans la structure. */
export class Target extends Entity {
  /**
   * @param {{ type: string, x: number, y: number, team?: number }} def
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
    /** Équipe (face-à-face) : 1 ou 2 ; 0 hors face-à-face. */
    this.team = def.team === 1 || def.team === 2 ? def.team : 0
    this.scoreValue = t.score
    /** Résistance aux chocs et aux chutes (armure du chevalier). */
    this.toughness = t.toughness ?? 1
    /**
     * Ronde (v5.1) : le défenseur va et vient autour de sa position de départ
     * (demi-longueur `patrol`), fait demi-tour devant un mur, un vide ou un
     * terrain dangereux. Le monde physique le fait marcher (PhysicsWorld#patrol).
     */
    this.patrol = Guard.int(def.patrol ?? 0, 'patrol', { min: 0, max: 200 })
    this.home = def.x
    this.facing = -1
    this.walking = false
    /** Ogre : instant du dernier revers (animation) et prochain revers possible (ms de monde). */
    this.swatAt = -Infinity
    this.swatReady = 0
    // Le feu est mortel : une cible qui s'enflamme succombe en 1,5 s environ.
    this.burnDps = (this.maxHp / 1.5) * 1.05
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
