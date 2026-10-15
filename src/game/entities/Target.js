import Matter from 'matter-js'
import { Entity } from './Entity.js'
import { CATEGORY } from '../physics/constants.js'
import { Guard } from '../../core/utils/Guard.js'
import { TARGET_TYPES } from './catalog.js'

export { TARGET_TYPES }

/** Personnage à éliminer, caché dans la structure. */
export class Target extends Entity {
  /**
   * @param {{ type: string, x: number, y: number, team?: number, patrol?: number, torch?: boolean, raid?: string }} def
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
    /** Résistance propre aux chocs et aux chutes (armure du chevalier). */
    this.baseToughness = t.toughness ?? 1
    /** Bonus de l'étendard (v5.8) : 1, ou plus près d'un porte-étendard debout. */
    this.aura = 1
    /** Veilleur de nuit (v5.8) : il porte une torche qui met le feu là où il tombe. */
    this.torch = Guard.boolean(def.torch ?? false, 'torch')
    this.torchDropped = false
    /** Pavoisier (v5.8) : son pavois arrête les tirs tendus de face (PhysicsWorld#shieldReacts). */
    this.shield = type === 'shieldbearer'
    /** En pleine course (esquive, panique) : pour l'animation. */
    this.sprinting = false
    /**
     * Pillard (v5.8) : dès le premier tir, il court attaquer l'engin du joueur.
     * Ce qu'il porte : 'fire' (torche), 'frost' (pot de givre), 'blow' (marteau
     * du saboteur), 'smash' (massue de l'ogre). Null : il garde son poste.
     */
    this.raid = def.raid ? Guard.oneOf(def.raid, ['fire', 'frost', 'blow', 'smash'], 'raid') : null
    /** En route vers l'engin ou à l'assaut (rendu, interface). */
    this.raiding = false
    /** À l'échelle (v5.8) : itinéraire suivi par l'UnitDirector, ou null. */
    this.climbing = null
    /**
     * Ronde (v5.1) : le défenseur va et vient autour de sa position de départ
     * (demi-longueur `patrol`), fait demi-tour devant un mur, un vide ou un
     * terrain dangereux. Depuis la v5.8, sa marche est pilotée par l'UnitDirector
     * (navigation, haltes, esquives : voir ../ai/).
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

  /**
   * Bout de la torche d'un veilleur, en coordonnées du monde (dessin : voir
   * TORCH_TIP dans characters.js ; le personnage regarde à gauche, il est
   * retourné quand il regarde à droite).
   */
  get torchTip() {
    return { x: this.x + (this.facing > 0 ? -14.6 : 14.6), y: this.y - 36 }
  }

  /** Résistance effective : armure, et galvanisée par l'étendard. */
  get toughness() {
    return this.baseToughness * this.aura
  }

  damage(amount, cause) {
    // L'étendard galvanise aussi contre les coups directs (pas contre le feu).
    const died = super.damage(cause === 'fire' ? amount : amount / this.aura, cause)
    if (amount > 1) this.hurtAt = performance.now()
    return died
  }

  /** Une cible prend feu brièvement mais ne brûle pas aussi longtemps que le bois. */
  ignite(durationMs = 2500) {
    return super.ignite(Math.min(durationMs, 2500))
  }
}
