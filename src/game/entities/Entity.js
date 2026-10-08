import Matter from 'matter-js'
import { FROST } from './catalog.js'

let nextId = 1

/**
 * Classe de base de tout objet physique du jeu (bloc, cible, baril, projectile).
 *
 * Une entité possède un corps Matter.js, des points de vie et un état visuel
 * (dégâts, feu). Elle ne dessine rien elle-même : le Renderer lit `assetKey`
 * et délègue le dessin à l'AssetRegistry, ce qui permet de changer les visuels
 * sans toucher à la logique.
 */
export class Entity {
  /**
   * @param {object} opts
   * @param {'block'|'target'|'barrel'|'projectile'} opts.kind
   * @param {Matter.Body} opts.body
   * @param {string} opts.assetKey clé visuelle (voir assets.config.js)
   * @param {number} [opts.hp]
   * @param {number} opts.width largeur de rendu
   * @param {number} opts.height hauteur de rendu
   * @param {boolean} [opts.flammable]
   */
  constructor({ kind, body, assetKey, hp = Infinity, width, height, flammable = false }) {
    this.id = nextId++
    this.kind = kind
    this.body = body
    this.assetKey = assetKey
    this.maxHp = hp
    this.hp = hp
    this.width = width
    this.height = height
    this.flammable = flammable
    this.alive = true
    /** Durée de combustion restante (ms). */
    this.burning = 0
    /**
     * Gel restant (ms), posé par un boulet de givre (v5.0) : l'objet devient
     * cassant (voir FROST.BRITTLE) et ne peut plus brûler. Le feu qui le touche
     * le fait fondre d'un coup : vapeur et eau bouillante (PhysicsWorld#steam).
     */
    this.frozenMs = 0
    /** Cause de la destruction, connue une fois l'entité morte. */
    this.deathCause = null
    /** Sommets locaux (forme non tournée) pour dessiner les polygones. */
    this.localVertices = body.vertices.map((v) => ({ x: v.x - body.position.x, y: v.y - body.position.y }))
    body.plugin = { entity: this }
  }

  get x() {
    return this.body.position.x
  }
  get y() {
    return this.body.position.y
  }
  get angle() {
    return this.body.angle
  }
  get mass() {
    return this.body.mass
  }
  get speed() {
    return Matter.Body.getSpeed(this.body)
  }

  /** Proportion de dégâts subis, de 0 (intact) à 1 (détruit). */
  get damageRatio() {
    return Number.isFinite(this.maxHp) ? 1 - Math.max(0, this.hp) / this.maxHp : 0
  }

  /**
   * Inflige des dégâts.
   * @param {number} amount
   * @param {string} cause 'impact' | 'explosion' | 'fire' | 'fall'
   * @returns {boolean} vrai si l'entité vient d'être détruite
   */
  damage(amount, cause = 'impact') {
    if (!this.alive || !(amount > 0) || !Number.isFinite(this.maxHp)) return false
    // Gelé, l'objet est cassant : les chocs et les explosions portent bien plus.
    this.hp -= this.frozenMs > 0 && cause !== 'fire' ? amount * FROST.BRITTLE : amount
    if (this.hp <= 0) {
      this.kill(cause)
      return true
    }
    return false
  }

  kill(cause) {
    if (!this.alive) return
    this.alive = false
    this.hp = 0
    this.deathCause = cause
  }

  /** L'entité est-elle gelée ? */
  get frozen() {
    return this.frozenMs > 0
  }

  /**
   * Gèle l'entité (boulet de givre). Un objet en feu s'éteint.
   * @param {number} ms
   * @returns {boolean} vrai si l'entité vient d'être gelée
   */
  freeze(ms) {
    if (!this.alive || !(ms > 0)) return false
    const was = this.frozenMs > 0
    this.frozenMs = Math.max(this.frozenMs, Math.min(60000, ms))
    this.burning = 0
    return !was
  }

  /** Enflamme l'entité si elle est inflammable (jamais un objet gelé). */
  ignite(durationMs = 6000) {
    if (!this.flammable || !this.alive || this.frozenMs > 0) return false
    const wasBurning = this.burning > 0
    this.burning = Math.max(this.burning, durationMs)
    return !wasBurning
  }

  /**
   * Choc reçu (énergie déjà calculée par le monde physique).
   * @param {number} energy
   * @param {Entity | null} _other
   */
  receiveImpact(energy, _other) {
    return this.damage(energy, 'impact')
  }

  /** Mise à jour par image : combustion. */
  update(dtMs) {
    if (this.frozenMs > 0) this.frozenMs = Math.max(0, this.frozenMs - dtMs)
    if (this.burning > 0 && this.alive) {
      this.burning = Math.max(0, this.burning - dtMs)
      this.damage((this.burnDps ?? 22) * (dtMs / 1000), 'fire')
    }
  }
}
