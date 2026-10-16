import Matter from 'matter-js'

const { Constraint, Composite, Sleeping } = Matter

/** Raideur des liens : la corde tendue sous sa charge, la chaîne un peu plus raide. */
const STIFFNESS = Object.freeze({ rope: 0.9, chain: 0.96 })
/** Un projectile dont le bord passe à moins de cette distance d'un lien le tranche (px). */
export const CUT_MARGIN = 5
/** Une explosion rompt les liens dans cette part de son rayon. */
export const BLAST_CUT = 0.6

/** Distance d'un point au segment [A, B]. */
export function segmentDistance(px, py, A, B) {
  const dx = B.x - A.x
  const dy = B.y - A.y
  const len2 = dx * dx + dy * dy
  const u = len2 ? Math.max(0, Math.min(1, ((px - A.x) * dx + (py - A.y) * dy) / len2)) : 0
  return Math.hypot(px - (A.x + u * dx), py - (A.y + u * dy))
}

/**
 * Mécanismes des châteaux (v6.0) : cordes, chaînes et charnières.
 *
 * - Un LIEN (corde ou chaîne) relie un point d'un bloc (l'attache) à un point
 *   d'un autre (la charge). Un tir qui passe dessus le tranche, une explosion
 *   proche aussi ; si l'attache ou la charge disparaît, il se rompt.
 * - Une CHARNIÈRE épingle un bloc à un point fixe du monde : il pivote autour.
 *
 * Ce sont des contraintes Matter.js, testées à chaque pas sur la position des
 * projectiles : tout reste déterministe (relectures identiques).
 */
export class Tethers {
  #world
  #events
  #links = []
  #hinges = []
  #seq = 0

  /**
   * @param {object} matterWorld composite du moteur
   * @param {import('../../core/utils/EventBus.js').EventBus} events
   */
  constructor(matterWorld, events) {
    this.#world = matterWorld
    this.#events = events
  }

  /**
   * Noue un lien. Les points sont dans le repère des blocs (centre, avant rotation).
   * @param {{ kind?: 'rope'|'chain', a: object, pointA: {x:number,y:number}, b: object, pointB: {x:number,y:number} }} spec
   */
  tie({ kind = 'rope', a, pointA, b, pointB }) {
    // Matter attend des décalages dans le repère du monde, à l'angle actuel du corps.
    const turn = (p, angle) => ({ x: p.x * Math.cos(angle) - p.y * Math.sin(angle), y: p.x * Math.sin(angle) + p.y * Math.cos(angle) })
    const c = Constraint.create({ bodyA: a.body, pointA: turn(pointA, a.body.angle), bodyB: b.body, pointB: turn(pointB, b.body.angle), stiffness: STIFFNESS[kind], damping: 0.06 })
    Composite.add(this.#world, c)
    const link = { id: ++this.#seq, kind, a, b, c, cut: false, cutAt: 0, cause: null, stub: null }
    b.tethered = (b.tethered ?? 0) + 1
    this.#links.push(link)
    return link
  }

  /** Épingle un bloc à un point fixe du monde (il pivote autour). */
  hinge(entity, at) {
    const p = entity.body.position
    const c = Constraint.create({ pointA: { x: at.x, y: at.y }, bodyB: entity.body, pointB: { x: at.x - p.x, y: at.y - p.y }, length: 0, stiffness: 1, damping: 0.1 })
    Composite.add(this.#world, c)
    entity.hinged = true
    this.#hinges.push({ entity, c, x: at.x, y: at.y, gone: false })
  }

  get links() {
    return this.#links
  }

  /** Liens encore noués. */
  get intact() {
    return this.#links.filter((l) => !l.cut).length
  }

  /**
   * Un pas : un lien dont l'attache ou la charge a disparu se rompt ; un
   * projectile qui passe dessus le tranche.
   * @param {Iterable<object>} entities
   * @param {number} time ms de monde
   */
  step(entities, time) {
    if (!this.#links.length && !this.#hinges.length) return
    const shots = []
    for (const e of entities) if (e.kind === 'projectile' && e.alive && !e.spent) shots.push(e)
    for (const l of this.#links) {
      if (l.cut) continue
      if (!l.a.alive || !l.b.alive) {
        this.#cut(l, 'anchor', time)
        continue
      }
      if (!shots.length) continue
      const A = Constraint.pointAWorld(l.c)
      const B = Constraint.pointBWorld(l.c)
      for (const p of shots) {
        if (segmentDistance(p.x, p.y, A, B) <= p.width / 2 + CUT_MARGIN) {
          this.#cut(l, 'shot', time)
          break
        }
      }
    }
    for (const h of this.#hinges) {
      if (h.gone || h.entity.alive) continue
      Composite.remove(this.#world, h.c)
      h.gone = true
    }
  }

  /** Explosion : les liens qui passent dans le souffle se rompent. */
  blast(x, y, radius, time) {
    for (const l of this.#links) {
      if (l.cut) continue
      if (segmentDistance(x, y, Constraint.pointAWorld(l.c), Constraint.pointBWorld(l.c)) <= radius * BLAST_CUT) this.#cut(l, 'blast', time)
    }
  }

  #cut(l, cause, time) {
    const A = Constraint.pointAWorld(l.c)
    const B = Constraint.pointBWorld(l.c)
    l.cut = true
    l.cutAt = time
    l.cause = cause
    // Le bout qui reste accroché à l'attache (dessiné pendant, voir view()).
    l.stub = { x: A.x, y: A.y, len: Math.min(40, Math.hypot(B.x - A.x, B.y - A.y) * 0.35) }
    Composite.remove(this.#world, l.c)
    l.b.tethered = Math.max(0, (l.b.tethered ?? 1) - 1)
    Sleeping.set(l.b.body, false)
    if (l.a.alive) Sleeping.set(l.a.body, false)
    this.#events.emit('tether:cut', { kind: l.kind, cause, x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, load: l.b })
  }

  /** Nouvelle étape d'un grand siège : plus aucun mécanisme. */
  clear() {
    for (const l of this.#links) if (!l.cut) Composite.remove(this.#world, l.c)
    for (const h of this.#hinges) if (!h.gone) Composite.remove(this.#world, h.c)
    this.#links = []
    this.#hinges = []
  }

  /**
   * Pour le rendu : chaque lien (ses deux bouts, ou le bout pendant à
   * l'attache une fois tranché) et chaque charnière.
   */
  view() {
    const links = []
    for (const l of this.#links) {
      if (!l.cut) {
        const A = Constraint.pointAWorld(l.c)
        const B = Constraint.pointBWorld(l.c)
        links.push({ kind: l.kind, ax: A.x, ay: A.y, bx: B.x, by: B.y, slack: Math.max(0, l.c.length - Math.hypot(B.x - A.x, B.y - A.y)) })
      } else if (l.a.alive && l.stub) {
        // Le bout tranché pend sous l'attache (qui a pu bouger depuis).
        const p = l.a.body.position
        const anchor = { x: l.stub.x, y: l.stub.y }
        if (l.anchorLocal === undefined) l.anchorLocal = { x: anchor.x - p.x, y: anchor.y - p.y, angle: l.a.body.angle }
        const da = l.a.body.angle - l.anchorLocal.angle
        const cos = Math.cos(da)
        const sin = Math.sin(da)
        const ax = p.x + l.anchorLocal.x * cos - l.anchorLocal.y * sin
        const ay = p.y + l.anchorLocal.x * sin + l.anchorLocal.y * cos
        links.push({ kind: l.kind, ax, ay, bx: ax, by: ay + l.stub.len, slack: 0, stub: true })
      }
    }
    return { links, hinges: this.#hinges.filter((h) => !h.gone).map((h) => ({ x: h.x, y: h.y })) }
  }
}
