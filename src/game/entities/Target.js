import Matter from 'matter-js'
import { Entity } from './Entity.js'
import { CATEGORY } from '../physics/constants.js'
import { Guard } from '../../core/utils/Guard.js'
import { TARGET_TYPES } from './catalog.js'

/** Grimace d'un défenseur touché (ms, dessin seulement). */
const HURT_MS = 600

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
    /** Cri de guerre d'un général (v6.0) : résistance accrue jusqu'à son prochain ordre. */
    this.buff = 1
    /** Veilleur de nuit (v5.8) : il porte une torche qui met le feu là où il tombe. */
    this.torch = Guard.boolean(def.torch ?? false, 'torch')
    this.torchDropped = false
    /** Pavoisier (v5.8) : son pavois arrête les tirs tendus de face (DefenderContacts#shieldReacts). */
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
    /** Hauteur de départ (v6.2) et instant où il est retombé de haut (succès « Chute libre »). */
    this.homeY = def.y
    this.fallenAt = -Infinity
    this.facing = -1
    this.walking = false
    /** Ogre : instant du dernier revers (animation) et prochain revers possible (ms de monde). */
    this.swatAt = -Infinity
    this.swatReady = 0
    // Le feu est mortel : une cible qui s'enflamme succombe en 1,5 s environ.
    this.burnDps = (this.maxHp / 1.5) * 1.05
    /**
     * Il grimace encore (ms, dessin seulement) après un vrai coup : compte à
     * rebours au pas de simulation (v6.2 : l'horloge du navigateur, comparée au
     * temps de la partie, le figeait des minutes dans sa grimace).
     */
    this.hurtMs = 0
    /**
     * Force (v6.1) : quantité de mouvement de ce qu'il repousse quand cela
     * arrive lentement (voir physics/FallingObjects.js). Prochain instant (ms
     * de monde) où il le peut, et dernier geste (animation).
     */
    this.pushCapacity = t.push ?? 0
    this.pushReady = 0
    this.pushAt = -Infinity
    /** Bras levés : quelque chose de lent lui arrive dessus (animation, voir UnitDirector). */
    this.bracing = false
    /** Sonné jusqu'à (ms de monde) : coup encaissé ('hit') ou décharge de l'orbe d'orage ('shock'). */
    this.stunUntil = 0
    this.stunKind = null
    /** Empoisonné jusqu'à (ms de monde) : il tousse et perd des points de vie (voir PhysicsWorld). */
    this.poisonUntil = 0
    /** Dégâts encaissés pas encore montrés en chiffres, et leur cause (affichage seulement). */
    this.shownDamage = 0
    this.shownCause = null
  }

  /**
   * Peut-il agir (repousser, réagir) à cet instant ? Ni gelé, ni en feu, ni
   * sonné, ni à l'échelle, ni renversé.
   * @param {number} time ms de monde
   */
  ableAt(time) {
    if (!this.alive || this.frozenMs > 0 || this.burning > 0 || this.climbing) return false
    if (time < this.stunUntil || time < this.pushReady) return false
    return Math.abs(Math.atan2(Math.sin(this.angle), Math.cos(this.angle))) < 0.6
  }

  /** Sonné (coup ou décharge) à cet instant ? */
  stunnedAt(time) {
    return time < this.stunUntil
  }

  /** Ce qui le sonne à cet instant (v6.2, lu par le dessin) : 'hit', 'shock', ou null. */
  stunAt(time) {
    return time < (this.stunUntil ?? 0) ? this.stunKind : null
  }

  /** Empoisonné à cet instant (v6.2) : il tousse et perd des points de vie. */
  poisonedAt(time) {
    return time < (this.poisonUntil ?? 0)
  }

  /** En armure (v6.2) : assez résistant pour que sa barre de vie porte un liseré d'acier. */
  get armored() {
    return (this.baseToughness ?? 1) >= 1.8
  }

  /** Sa torche brûle (v6.2) : un veilleur debout et pas gelé ; elle éclaire alentour. */
  get torchLit() {
    return this.torch && this.alive !== false && !(this.frozenMs > 0)
  }

  /**
   * Bout de la torche d'un veilleur, en coordonnées du monde (dessin : voir
   * TORCH_TIP dans characters.js ; le personnage regarde à gauche, il est
   * retourné quand il regarde à droite).
   */
  get torchTip() {
    return { x: this.x + (this.facing > 0 ? -14.6 : 14.6), y: this.y - 36 }
  }

  /** Résistance effective : armure, galvanisée par l'étendard et par le cri de guerre. */
  get toughness() {
    return this.baseToughness * this.aura * this.buff
  }

  damage(amount, cause) {
    const before = this.hp
    // L'étendard et le cri de guerre galvanisent aussi contre les coups directs (pas contre le feu).
    const died = super.damage(cause === 'fire' || cause === 'poison' ? amount : amount / (this.aura * this.buff), cause)
    const lost = before - Math.max(0, this.hp)
    if (lost > 0 && Number.isFinite(lost)) {
      this.shownDamage += lost
      this.shownCause = cause
    }
    if (amount > 1) this.hurtMs = HURT_MS
    return died
  }

  /** Une cible prend feu brièvement mais ne brûle pas aussi longtemps que le bois. Trempée (v6.1), jamais. */
  ignite(durationMs = 2500) {
    if (this.wetMs > 0) return false
    return super.ignite(Math.min(durationMs, 2500))
  }

  update(dtMs) {
    // Trempé par une citerne (v6.1) : il sèche peu à peu.
    if (this.wetMs > 0) this.wetMs = Math.max(0, this.wetMs - dtMs)
    if (this.hurtMs > 0) this.hurtMs = Math.max(0, this.hurtMs - dtMs)
    super.update(dtMs)
  }
}
