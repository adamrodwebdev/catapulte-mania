import Matter from 'matter-js'

const { Sleeping, Body } = Matter

/**
 * Intégrité structurelle : qui porte quoi dans les constructions.
 *
 * Au premier tir, on relève les appuis réels de la structure stabilisée
 * (contacts quasi horizontaux entre deux blocs : celui du dessus repose sur
 * celui du dessous). On obtient un graphe « porte → est porté par ».
 *
 * Règles appliquées ensuite, comme dans un vrai bâtiment :
 *  1. Un bloc qui disparaît réveille tout ce qu'il portait : rien ne reste
 *     suspendu dans le vide (le moteur met en veille les corps immobiles).
 *  2. Un projectile qui frappe assez fort un MUR PORTEUR le fragilise
 *     (fissure, poussée) et ébranle les toits et planchers qu'il soutient :
 *     ils glissent et s'effondrent. La pierre et le fer demandent un choc plus
 *     fort que le bois, car le seuil dépend de la résistance du matériau.
 */
export class StructuralIntegrity {
  /** bloc → blocs posés dessus */
  #carries = new Map()
  /** bloc → blocs sur lesquels il repose */
  #restsOn = new Map()
  #mapped = false

  /** Part de la résistance du mur à atteindre pour le fissurer. */
  static FAILURE_RATIO = 0.18
  /** Dégâts infligés au mur porteur fissuré (part de sa résistance max). */
  static WALL_DAMAGE = 0.45
  /** Dégâts infligés aux toits / planchers directement soutenus. */
  static LOAD_DAMAGE = 0.3

  get mapped() {
    return this.#mapped
  }

  /**
   * Relève les appuis à partir des contacts actifs du moteur.
   * @param {Matter.Engine} engine
   * @param {(body: Matter.Body) => any} entityOf
   */
  map(engine, entityOf) {
    this.#carries.clear()
    this.#restsOn.clear()
    for (const pair of engine.pairs.list) {
      if (!pair.isActive) continue
      const a = entityOf(pair.bodyA)
      const b = entityOf(pair.bodyB)
      if (!a || !b || a.kind !== 'block' || b.kind !== 'block') continue
      // Contact « posé sur » : normale presque verticale.
      if (Math.abs(pair.collision.normal.y) < 0.7) continue
      const [upper, lower] = a.y < b.y ? [a, b] : [b, a]
      this.#link(lower, upper)
    }
    this.#mapped = true
  }

  #link(lower, upper) {
    if (!this.#carries.has(lower)) this.#carries.set(lower, new Set())
    if (!this.#restsOn.has(upper)) this.#restsOn.set(upper, new Set())
    this.#carries.get(lower).add(upper)
    this.#restsOn.get(upper).add(lower)
  }

  /** Le bloc soutient-il quelque chose ? */
  isLoadBearing(block) {
    return (this.#carries.get(block)?.size ?? 0) > 0
  }

  /** Tout ce qui repose (directement ou non) sur ce bloc. */
  loadsOf(block, depth = 6) {
    const out = new Set()
    const walk = (b, d) => {
      if (d <= 0) return
      for (const up of this.#carries.get(b) || []) {
        if (out.has(up)) continue
        out.add(up)
        walk(up, d - 1)
      }
    }
    walk(block, depth)
    return [...out]
  }

  /**
   * Un bloc a disparu : réveille tout ce qu'il portait et retire ses liens.
   * @param {any} block
   */
  onRemoved(block) {
    for (const up of this.loadsOf(block)) Sleeping.set(up.body, false)
    for (const up of this.#carries.get(block) || []) this.#restsOn.get(up)?.delete(block)
    for (const low of this.#restsOn.get(block) || []) this.#carries.get(low)?.delete(block)
    this.#carries.delete(block)
    this.#restsOn.delete(block)
  }

  /**
   * Un projectile frappe un bloc. Si c'est un mur porteur et que le choc
   * dépasse son seuil, le mur cède et ses charges s'effondrent.
   * @param {any} block
   * @param {number} energy énergie du choc
   * @param {{x:number,y:number}} push direction du projectile (vitesse)
   * @returns {any[]} charges ébranlées (vide si rien ne cède)
   */
  onProjectileHit(block, energy, push) {
    if (!block?.alive || block.kind !== 'block' || !this.isLoadBearing(block)) return []
    if (!(energy >= block.maxHp * StructuralIntegrity.FAILURE_RATIO)) return []

    // Le mur se fissure et bascule dans le sens du tir.
    Sleeping.set(block.body, false)
    const len = Math.hypot(push.x, push.y) || 1
    const dir = { x: push.x / len, y: push.y / len }
    const v = Body.getVelocity(block.body)
    Body.setVelocity(block.body, { x: v.x + dir.x * 2.2, y: v.y })
    Body.setAngularVelocity(block.body, block.body.angularVelocity + 0.035 * Math.sign(dir.x || 1))
    block.damage(block.maxHp * StructuralIntegrity.WALL_DAMAGE, 'impact')

    // Les toits et planchers soutenus perdent leur assise.
    const loads = this.loadsOf(block)
    const direct = this.#carries.get(block) || new Set()
    for (const up of loads) {
      Sleeping.set(up.body, false)
      if (!direct.has(up)) continue
      const uv = Body.getVelocity(up.body)
      Body.setVelocity(up.body, { x: uv.x + dir.x * 1.2, y: uv.y + 0.8 })
      // Le côté privé d'appui s'affaisse : appui à gauche → rotation antihoraire.
      Body.setAngularVelocity(up.body, up.body.angularVelocity + 0.03 * (block.x < up.x ? -1 : 1))
      up.damage(up.maxHp * StructuralIntegrity.LOAD_DAMAGE, 'impact')
    }
    return loads
  }

  clear() {
    this.#carries.clear()
    this.#restsOn.clear()
    this.#mapped = false
  }
}
