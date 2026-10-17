import Matter from 'matter-js'
import { BONDS, JOINT, contactBetween, bondBetween } from './castleRules.js'

const { Constraint, Composite, Sleeping } = Matter

/**
 * Assemblage des châteaux (v6.2) : le château est un tout.
 *
 * Inspiré des jeux de destruction (Red Faction Guerrilla, Teardown, Crush the
 * Castle) et des « joints cassables » des moteurs physiques (Unity, Box2D) :
 *
 * - JONCTIONS : au premier tir, chaque bloc est soudé à ses voisins (appui
 *   dessus/dessous, contact de côté) par deux épingles Matter aux deux bouts du
 *   contact, et les fondations au sol. Le liant dépend des matériaux : mortier
 *   (pierre, brique, grès, marbre), chevilles (bois), liens (paille), rivets
 *   (fer), glace, plomb (verre) ; entre deux matériaux, le plus faible l'emporte.
 * - RUPTURE : un bloc frappé use ses jonctions selon l'énergie du coup et la
 *   force du liant ; le choc se propage, atténué, à ses voisins soudés. Matter
 *   ne donnant pas la force d'une contrainte, on mesure aussi son allongement
 *   (l'écart entre les deux points soudés) : une charge qui dure (porte-à-faux,
 *   bascule) l'use à son tour. Usée, elle se lézarde (on la voit, elle craque),
 *   puis cède. Le château encaisse, fléchit, puis s'effondre par morceaux :
 *   réactions en chaîne.
 * - POINTS SENSIBLES : les clés de voûte, les blocs qui portent le plus sans
 *   relais, ont des jonctions déjà fragiles ; touchées, elles lâchent tout ce
 *   qu'elles tiennent. On les reconnaît à leur lézarde (voir le rendu).
 * - Le feu ronge chevilles et liens, fait fondre la glace ; le gel rend les
 *   jonctions cassantes ; une explosion les arrache dans son rayon.
 *
 * Tout se décide au pas de simulation : les relectures restent identiques.
 */
export { BONDS, BOND_OF, JOINT, KEYSTONE, findKeystones, bondBetween, contactBetween } from './castleRules.js'

export class CastleJoints {
  #world
  #events
  /** @type {Array<object>} */
  #joints = []
  #seq = 0
  #toughness = 1

  /**
   * @param {object} matterWorld composite du moteur
   * @param {import('../../core/utils/EventBus.js').EventBus} events
   */
  constructor(matterWorld, events) {
    this.#world = matterWorld
    this.#events = events
  }

  /** Jonctions encore debout (pour le rendu et les tests). */
  get list() {
    return this.#joints.filter((j) => !j.broken)
  }

  get size() {
    return this.list.length
  }

  /**
   * Soude le château (au premier tir, quand la structure est posée).
   * @param {Iterable<any>} entities
   * @param {{ groundY: number, keystones?: Set<any> }} opts
   */
  build(entities, { groundY, keystones = new Set(), toughness = 1 }) {
    this.clear()
    // Châteaux renforcés (v6.2, Campagne héroïque) : l'usure compte moins, l'étirement tient plus.
    this.#toughness = Math.max(1, Number(toughness) || 1)
    const blocks = [...entities].filter((e) => e.kind === 'block' && e.alive && !e.construct && !e.tethered && !e.hinged && !e.body.isStatic)
    const terrain = [...entities].filter((e) => e.kind === 'block' && e.alive && e.terrain)
    for (let i = 0; i < blocks.length; i++) {
      const a = blocks[i]
      if (a.terrain) continue
      for (let k = i + 1; k < blocks.length; k++) {
        const b = blocks[k]
        if (b.terrain) continue
        const upper = a.y < b.y ? a : b
        const lower = upper === a ? b : a
        const contact = contactBetween(upper.body.bounds, lower.body.bounds)
        if (contact) this.#weld(upper, lower, contact, bondBetween(upper.material, lower.material), keystones)
      }
      // Fondations : posé sur le sol, ou sur la roche (plateau, montagne).
      const bb = a.body.bounds
      if (Math.abs(bb.max.y - groundY) <= JOINT.GAP) this.#weld(a, null, { dir: 'v', points: [{ x: bb.min.x + JOINT.INSET, y: groundY }, { x: bb.max.x - JOINT.INSET, y: groundY }] }, 'footing', keystones)
      else {
        for (const t of terrain) {
          const contact = contactBetween(bb, t.body.bounds)
          if (contact?.dir === 'v') this.#weld(a, null, contact, 'footing', keystones)
        }
      }
    }
  }

  #weld(a, b, contact, bond, keystones) {
    const spec = BONDS[bond]
    const cs = contact.points.map((p) =>
      Constraint.create({
        bodyA: a.body,
        pointA: { x: p.x - a.body.position.x, y: p.y - a.body.position.y },
        ...(b ? { bodyB: b.body, pointB: { x: p.x - b.body.position.x, y: p.y - b.body.position.y } } : { pointB: { x: p.x, y: p.y } }),
        length: 0,
        stiffness: spec.stiffness,
        damping: 0.08,
      }),
    )
    for (const c of cs) Composite.add(this.#world, c)
    const keystone = keystones.has(a) || (b && keystones.has(b))
    const j = { id: ++this.#seq, a, b, cs, bond, dir: contact.dir, keystone, damage: 0, cracked: false, broken: false, x: (contact.points[0].x + contact.points[1].x) / 2, y: (contact.points[0].y + contact.points[1].y) / 2, span: Math.hypot(contact.points[1].x - contact.points[0].x, contact.points[1].y - contact.points[0].y) }
    a.joints = (a.joints ?? 0) + 1
    if (b) b.joints = (b.joints ?? 0) + 1
    this.#joints.push(j)
    return j
  }

  /** Allongement actuel d'une jonction (px) : le plus grand écart de ses deux épingles. */
  static strain(j) {
    let s = 0
    for (const c of j.cs) s = Math.max(s, Constraint.currentLength(c))
    return s
  }

  /**
   * Un pas : usure, fissures, ruptures, et réveil des blocs soudés à un bloc qui bouge.
   * @param {number} dtMs
   */
  step(dtMs) {
    for (const j of this.#joints) {
      if (j.broken) continue
      if (!j.a.alive || (j.b && !j.b.alive)) {
        this.#break(j, 'gone')
        continue
      }
      const spec = BONDS[j.bond]
      let snap = spec.snap
      let crack = spec.crack
      if (j.keystone) {
        snap *= JOINT.KEYSTONE_WEAK
        crack *= JOINT.KEYSTONE_WEAK
      }
      // Le gel rend cassant ; le feu ronge le bois et la paille, fait fondre la glace.
      const frozen = j.a.frozenMs > 0 || j.b?.frozenMs > 0
      if (frozen) snap *= JOINT.FROZEN_SNAP
      // Châteaux renforcés : l'étirement tient davantage (racine de la solidité).
      if (this.#toughness > 1) {
        const k = Math.sqrt(this.#toughness)
        snap *= k
        crack *= k
      }
      const burning = j.a.burning > 0 || j.b?.burning > 0
      if (burning && (j.bond === 'peg' || j.bond === 'lashing')) j.damage += dtMs / JOINT.FIRE_MS
      if (burning && j.bond === 'frost') j.damage = 1
      const strain = CastleJoints.strain(j)
      if (strain >= snap) {
        this.#break(j, 'strain')
        continue
      }
      if (strain > crack) j.damage += ((strain - crack) / Math.max(0.1, snap - crack)) * dtMs * JOINT.WEAR_PER_MS
      if (j.damage >= 1) {
        this.#break(j, 'wear')
        continue
      }
      if (!j.cracked && j.damage >= JOINT.CRACKED) {
        j.cracked = true
        this.#events.emit('joint:crack', { x: j.x, y: j.y, bond: j.bond, keystone: j.keystone })
      }
      // Un bloc qui bouge réveille ses voisins soudés (Matter ne le fait que par les chocs).
      const a = j.a.body
      const b = j.b?.body
      if (b) {
        if (a.isSleeping && !b.isSleeping && b.speed > JOINT.WAKE_SPEED) Sleeping.set(a, false)
        else if (b.isSleeping && !a.isSleeping && a.speed > JOINT.WAKE_SPEED) Sleeping.set(b, false)
      }
    }
  }

  /**
   * Un bloc encaisse un choc : ses jonctions s'usent selon l'énergie et la force
   * de leur liant ; celles de ses voisins soudés, moins (le choc se propage).
   * @param {any} block
   * @param {number} energy
   */
  hit(block, energy) {
    if (!(energy > 0)) return
    const own = this.of(block)
    for (const j of own) this.#wear(j, energy, 1)
    for (const j of own) {
      const other = j.a === block ? j.b : j.a
      if (!other) continue
      for (const n of this.of(other)) if (n.a !== block && n.b !== block) this.#wear(n, energy, JOINT.SPREAD)
    }
  }

  #wear(j, energy, share) {
    if (j.broken) return
    const strength = BONDS[j.bond].strength * (j.keystone ? JOINT.KEYSTONE_WEAK : 1) * this.#toughness
    j.damage += (energy * share) / strength
    if (j.damage >= 1) this.#break(j, 'impact')
    else if (!j.cracked && j.damage >= JOINT.CRACKED) {
      j.cracked = true
      this.#events.emit('joint:crack', { x: j.x, y: j.y, bond: j.bond, keystone: j.keystone })
    }
  }

  /**
   * Explosion : les jonctions dans le rayon s'usent d'autant plus qu'elles sont proches.
   * @returns {number} jonctions rompues
   */
  blast(x, y, radius) {
    let n = 0
    for (const j of this.#joints) {
      if (j.broken) continue
      const d = Math.hypot(j.x - x, j.y - y)
      if (d >= radius) continue
      j.damage += (1 - d / radius) * JOINT.BLAST
      if (j.damage >= 1) {
        this.#break(j, 'blast')
        n++
      }
    }
    return n
  }

  /** Une clé de voûte a cédé : elle lâche tout ce qu'elle tient. */
  release(block, cause = 'keystone') {
    let n = 0
    for (const j of this.#joints) {
      if (j.broken || (j.a !== block && j.b !== block)) continue
      this.#break(j, cause)
      n++
    }
    return n
  }

  /** Jonctions d'un bloc (pour les règles et les tests). */
  of(block) {
    return this.#joints.filter((j) => !j.broken && (j.a === block || j.b === block))
  }

  #break(j, cause) {
    j.broken = true
    for (const c of j.cs) Composite.remove(this.#world, c)
    j.a.joints = Math.max(0, (j.a.joints ?? 1) - 1)
    if (j.b) j.b.joints = Math.max(0, (j.b.joints ?? 1) - 1)
    if (j.a.alive) Sleeping.set(j.a.body, false)
    if (j.b?.alive) Sleeping.set(j.b.body, false)
    if (cause !== 'gone') this.#events.emit('joint:break', { x: j.x, y: j.y, bond: j.bond, keystone: j.keystone, cause, span: j.span })
  }

  clear() {
    for (const j of this.#joints) {
      if (j.broken) continue
      for (const c of j.cs) Composite.remove(this.#world, c)
      j.a.joints = 0
      if (j.b) j.b.joints = 0
    }
    this.#joints = []
  }
}
