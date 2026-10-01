import Matter from 'matter-js'
import { MATERIALS } from '../entities/materials.js'

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
 *     ils glissent et s'effondrent. Il faut un tir PRÉCIS :
 *       - frapper le mur de face (pas en tombant sur son sommet) ;
 *       - avec assez d'énergie : seuil propre à chaque matériau
 *         (`bearing` dans materials.js) : le bois cède vite, la pierre
 *         demande un tir appuyé, le fer un tir lourd ou explosif.
 */
export class StructuralIntegrity {
  /** bloc → blocs posés dessus */
  #carries = new Map()
  /** bloc → blocs sur lesquels il repose */
  #restsOn = new Map()
  #mapped = false

  /** Seuil par défaut si le matériau n'en précise pas (part de la résistance max). */
  static FAILURE_RATIO = 0.25
  /** Tolérance verticale (px) pour considérer deux blocs en appui. */
  static CONTACT_GAP = 4
  /** Chevauchement horizontal minimal (px) d'un appui. */
  static MIN_OVERLAP = 4
  /** Le choc doit arriver de face : composante horizontale minimale de la normale. */
  static MIN_FRONTAL = 0.6
  /** Dégâts infligés au mur porteur fissuré (part de sa résistance max). */
  static WALL_DAMAGE = 0.45
  /** Dégâts infligés aux toits / planchers directement soutenus. */
  static LOAD_DAMAGE = 0.3

  get mapped() {
    return this.#mapped
  }

  /**
   * Relève les appuis par la géométrie : A repose sur B si le bas de A touche
   * le haut de B (à quelques pixels près) et qu'ils se chevauchent en largeur.
   * (Les contacts du moteur ne suffisent pas : les corps immobiles « dorment »
   * et leurs contacts ne sont plus suivis.)
   * @param {Iterable<any>} entities
   */
  map(entities) {
    this.#carries.clear()
    this.#restsOn.clear()
    const blocks = [...entities].filter((e) => e.kind === 'block' && e.alive)
    for (const upper of blocks) {
      const u = upper.body.bounds
      for (const lower of blocks) {
        if (lower === upper) continue
        const l = lower.body.bounds
        const gap = Math.abs(u.max.y - l.min.y)
        const overlap = Math.min(u.max.x, l.max.x) - Math.max(u.min.x, l.min.x)
        if (gap <= StructuralIntegrity.CONTACT_GAP && overlap >= StructuralIntegrity.MIN_OVERLAP && upper.y < lower.y) {
          this.#link(lower, upper)
        }
      }
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
   * @param {{x:number,y:number}} [normal] normale du contact (impact de face si horizontale)
   * @returns {any[]} charges ébranlées (vide si rien ne cède)
   */
  onProjectileHit(block, energy, push, normal = { x: 1, y: 0 }) {
    if (!block?.alive || block.kind !== 'block' || !this.isLoadBearing(block)) return []
    if (Math.abs(normal.x) < StructuralIntegrity.MIN_FRONTAL) return []
    const ratio = MATERIALS[block.material]?.bearing ?? StructuralIntegrity.FAILURE_RATIO
    if (!(energy >= block.maxHp * ratio)) return []

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
