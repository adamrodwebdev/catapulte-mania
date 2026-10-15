/**
 * Graphe de navigation des défenseurs (v5.8).
 *
 * Un défenseur ne vole pas et ne saute pas : il marche sur des « corniches »,
 * des segments horizontaux où il tient debout — le sol entre deux obstacles,
 * le plancher d'une pièce entre deux murs, le chemin de ronde d'un rempart,
 * le dessus d'une dalle. Le graphe est calculé à partir de la géométrie du
 * moment (boîtes englobantes des blocs) :
 *
 *  1. chaque bloc posé à plat offre sa face supérieure ; le sol offre la sienne ;
 *  2. on retire de chaque face ce qui est occupé juste au-dessus (un mur posé
 *     sur un plancher coupe la pièce en deux) et, au sol, les lacs et la lave ;
 *  3. on ne garde que les segments assez larges pour un défenseur, et on
 *     fusionne ceux qui se touchent à la même hauteur (planches bout à bout) ;
 *  4. deux corniches dont les bouts se rejoignent avec une marche franchissable
 *     (≤ STEP) sont reliées dans les deux sens ; une descente un peu plus haute
 *     (≤ DROP) ne se fait que vers le bas. Au-delà, la chute serait mortelle.
 *
 * Module pur (aucune dépendance au moteur physique) : testé seul, et
 * reconstruit par l'UnitDirector quand la structure bouge.
 *
 * v5.8 — ouvrages : là où le terrain coupe la route (lac, lave, glace, roche
 * d'une montagne ou d'un plateau), le graphe propose aussi des liaisons « à
 * construire » entre deux corniches du TERRAIN (sol, dessus de roche ; jamais
 * à travers un château) :
 *  - PONT : deux berges au niveau du sol, et seulement un lac, de la lave ou
 *    de la glace entre elles (portée ≤ BRIDGE_MAX). Une fois bâti, c'est une
 *    vraie planche (le graphe la voit comme une corniche ordinaire) ;
 *  - ÉCHELLE : de la roche entre les deux (montagne, talus d'un plateau), ou
 *    des douves au pied d'un plateau (échelle de siège). L'itinéraire suit
 *    les échelles (en A par-dessus une montagne), hauteur ≤ CLIMB_MAX.
 * Seuls les pillards s'en servent (voir Pathfinder, option `build`).
 */

/** Hauteur de marche franchissable dans les deux sens. */
export const STEP = 6
/** Descente sans danger (la vitesse de chute reste sous le seuil mortel). */
export const DROP = 14
/** Hauteur libre nécessaire au-dessus d'une corniche pour y tenir debout. */
export const HEADROOM = 46
/** Largeur minimale d'une corniche (un défenseur de profil, avec une marge). */
export const MIN_WIDTH = 30
/** Écart horizontal toléré entre deux corniches reliées. */
const GAP = 5
/** Ouvrages (v5.8) : portée d'un pont, hauteur et portée d'une échelle, coût de construction. */
export const WORKS = Object.freeze({
  BRIDGE_MAX: 420,
  CLIMB_MAX: 520,
  LADDER_SPAN: 700,
  /** Un objet bas (gravats, tonneau) se franchit à l'échelle ; au-delà, c'est un château. */
  LOW_OBSTACLE: 60,
  COST: { bridge: 260, ladder: 300 },
  /** Où se tient le bâtisseur, à partir du bord de la corniche (px). */
  STAND: 18,
})

/**
 * @typedef {{ minX: number, maxX: number, minY: number, maxY: number, flat: boolean, terrain?: boolean,
 *   tri?: { ax: number, ay: number, bx0: number, bx1: number, by: number } }} Solid
 *   (`tri` : triangle à pointe en haut — talus, montagne : sa vraie emprise à chaque hauteur)
 * @typedef {{ id: number, x0: number, x1: number, y: number, ground: boolean, terrain: boolean }} Ledge
 * @typedef {{ x: number, y: number }} Point
 * @typedef {{ to: number, x: number, cost: number, kind?: 'bridge' | 'ladder', built?: boolean,
 *   exitX?: number, stand?: number, route?: Point[], span?: { x0: number, x1: number } }} Link
 */

/**
 * Ce qu'un solide occupe dans la bande de hauteur [top, bottom] (intervalle en x,
 * ou null). Un triangle n'occupe que sa largeur réelle à cette hauteur : la
 * pointe d'un talus ne masque pas tout le plateau qu'il borde.
 * @param {Solid} s
 */
export function occupied(s, top, bottom) {
  if (s.maxY <= top || s.minY >= bottom) return null
  const t = s.tri
  if (!t) return [s.minX, s.maxX]
  const y = Math.min(t.by, bottom)
  if (y < t.ay) return null
  const k = (y - t.ay) / Math.max(1, t.by - t.ay)
  return [t.ax - k * (t.ax - t.bx0), t.ax + k * (t.bx1 - t.ax)]
}

/** Garde (px) entre l'échelle et la roche qu'elle enjambe. */
const LADDER_CLEARANCE = 6

/**
 * Itinéraire d'une échelle de S à E : l'enveloppe supérieure du relief (sommets
 * des rochers, coins des blocs) avec une garde, pour qu'aucun échelon ne
 * traverse la roche — une échelle en A par-dessus une montagne, en plusieurs
 * pans quand la crête a plusieurs pointes.
 * @param {Point} S départ (pied de l'échelle)
 * @param {Point} E arrivée
 * @param {Point[]} [profile] relief entre les deux
 * @returns {Point[]}
 */
export function ladderRoute(S, E, profile = []) {
  const left = Math.min(S.x, E.x)
  const right = Math.max(S.x, E.x)
  const pts = [S, E]
  for (const p of profile) if (p.x > left + 1 && p.x < right - 1) pts.push({ x: p.x, y: p.y - LADDER_CLEARANCE })
  pts.sort((p, q) => p.x - q.x)
  // Chaîne monotone : on ne garde que les points qui dépassent la corde (y vers le bas).
  const hull = []
  for (const p of pts) {
    while (hull.length >= 2) {
      const a = hull[hull.length - 2]
      const b = hull[hull.length - 1]
      if ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) > 0) break
      hull.pop()
    }
    hull.push(p)
  }
  return S.x <= E.x ? hull : hull.reverse()
}

/** Retire les intervalles `cuts` de [x0, x1] ; renvoie les morceaux restants. */
export function subtract(x0, x1, cuts) {
  let parts = [[x0, x1]]
  for (const [c0, c1] of cuts) {
    const next = []
    for (const [a, b] of parts) {
      if (c1 <= a || c0 >= b) next.push([a, b])
      else {
        if (c0 > a) next.push([a, c0])
        if (c1 < b) next.push([c1, b])
      }
    }
    parts = next
    if (!parts.length) break
  }
  return parts
}

export class NavGraph {
  /** @type {Ledge[]} */
  ledges = []
  /** @type {Map<number, Link[]>} */
  links = new Map()

  /**
   * @param {object} opts
   * @param {Solid[]} opts.solids obstacles et appuis (blocs, barils)
   * @param {number} opts.groundY hauteur du sol
   * @param {{ x0: number, x1: number }[]} [opts.hazards] zones du sol où l'on ne marche pas
   * @param {number} [opts.left] bord gauche du terrain
   * @param {number} [opts.right] bord droit du terrain
   * @param {boolean} [opts.works] proposer ponts et échelles (v5.8)
   * @param {{ x0: number, y0: number, x1: number, y1: number }[]} [opts.ladders] échelles déjà dressées
   */
  static build({ solids, groundY, hazards = [], left = -300, right = 3000, works = false, ladders = [] }) {
    const g = new NavGraph()
    const raw = []
    const blockersAbove = (y, self) => {
      const cuts = []
      for (const s of solids) {
        if (s === self) continue
        const span = occupied(s, y - HEADROOM, y - 1)
        if (span) cuts.push([span[0] - 1, span[1] + 1])
      }
      return cuts
    }
    // Faces supérieures des blocs posés à plat.
    for (const s of solids) {
      if (!s.flat || s.maxX - s.minX < MIN_WIDTH * 0.5) continue
      for (const [a, b] of subtract(s.minX, s.maxX, blockersAbove(s.minY, s))) raw.push({ x0: a, x1: b, y: s.minY, ground: false, terrain: Boolean(s.terrain) })
    }
    // Le sol, moins les obstacles posés dessus et les zones dangereuses.
    const groundCuts = [...blockersAbove(groundY, null), ...hazards.map((h) => [h.x0, h.x1])]
    for (const [a, b] of subtract(left, right, groundCuts)) raw.push({ x0: a, x1: b, y: groundY, ground: true, terrain: true })

    // Fusion des segments bout à bout à la même hauteur, puis tri.
    raw.sort((p, q) => p.y - q.y || p.x0 - q.x0)
    const merged = []
    for (const r of raw) {
      const last = merged[merged.length - 1]
      if (last && Math.abs(last.y - r.y) <= 2 && r.x0 - last.x1 <= 3 && r.x1 >= last.x0) {
        last.x1 = Math.max(last.x1, r.x1)
        last.ground = last.ground || r.ground
        last.terrain = last.terrain && r.terrain
      } else merged.push({ ...r })
    }
    g.ledges = merged
      .filter((l) => l.x1 - l.x0 >= MIN_WIDTH)
      .map((l, id) => ({ id, x0: Math.round(l.x0 * 10) / 10, x1: Math.round(l.x1 * 10) / 10, y: Math.round(l.y * 10) / 10, ground: l.ground, terrain: Boolean(l.terrain) }))
    for (const l of g.ledges) g.links.set(l.id, [])

    // Liaisons : bouts qui se rejoignent, marche ou petite descente.
    for (const a of g.ledges) {
      for (const b of g.ledges) {
        if (a === b) continue
        // Bout droit de a contre bout gauche de b.
        if (Math.abs(b.x0 - a.x1) > GAP) continue
        const x = (a.x1 + b.x0) / 2
        const dy = b.y - a.y // > 0 : b est plus bas
        const step = Math.abs(dy)
        if (step <= STEP) {
          g.links.get(a.id).push({ to: b.id, x, cost: 6 + step })
          g.links.get(b.id).push({ to: a.id, x, cost: 6 + step })
        } else if (dy > 0 && dy <= DROP) {
          g.links.get(a.id).push({ to: b.id, x, cost: 12 })
        } else if (dy < 0 && -dy <= DROP) {
          g.links.get(b.id).push({ to: a.id, x, cost: 12 })
        }
      }
    }
    if (works) g.#works(solids, hazards, groundY, ladders)
    return g
  }

  /**
   * Ouvrages possibles (v5.8) : pour chaque corniche du terrain, la plus
   * proche corniche du terrain à sa droite, si un pont ou une échelle peut
   * les relier. Liaisons dans les deux sens.
   */
  #works(solids, hazards, groundY, ladders) {
    const terrain = this.ledges.filter((l) => l.terrain)
    for (const a of terrain) {
      let b = null
      for (const c of terrain) {
        if (c === a || c.x0 <= a.x1 + GAP || c.x0 - a.x1 > WORKS.LADDER_SPAN || Math.abs(c.y - a.y) > WORKS.CLIMB_MAX) continue
        if (!b || c.x0 < b.x0 || (c.x0 === b.x0 && Math.abs(c.y - a.y) < Math.abs(b.y - a.y))) b = c
      }
      if (!b) continue
      const work = this.#corridor(a, b, solids, hazards, groundY)
      if (!work) continue
      const fwd = this.#workLink(a, b, work, 1, ladders)
      const back = this.#workLink(b, a, work, -1, ladders)
      if (fwd && back) {
        this.links.get(a.id).push(fwd)
        this.links.get(b.id).push(back)
      }
    }
  }

  /** Ce qui sépare deux corniches : roche (et son sommet), danger au sol, obstacle infranchissable. */
  #corridor(a, b, solids, hazards, groundY) {
    const lo = a.x1
    const hi = b.x0
    const top = Math.min(a.y, b.y) - WORKS.CLIMB_MAX
    const bottom = Math.max(a.y, b.y)
    let rock = false
    let apex = { x: (lo + hi) / 2, y: Infinity }
    /** Relief à enjamber : sommets des rochers et coins des blocs (voir #workLink). */
    const profile = []
    for (const s of solids) {
      if (s.maxX <= lo + 1 || s.minX >= hi - 1 || s.maxY <= top || s.minY >= bottom) continue
      if (s.terrain) {
        rock = true
        if (s.minY < apex.y) apex = { x: (s.minX + s.maxX) / 2, y: s.minY }
      } else if (s.minY < bottom - WORKS.LOW_OBSTACLE) return null // un château, un mur : on ne passe pas par là
      // Triangle : la pointe, et les coins de la base (un talus posé au-dessus du
      // sol déborde de la ligne droite) ; bloc : les coins du dessus.
      if (s.tri) profile.push({ x: s.tri.ax, y: s.tri.ay }, { x: s.tri.bx0 - 2, y: s.tri.by }, { x: s.tri.bx1 + 2, y: s.tri.by })
      else profile.push({ x: s.minX - 2, y: s.minY }, { x: s.maxX + 2, y: s.minY })
    }
    const hazard = hazards.some((h) => h.x1 > lo && h.x0 < hi)
    const level = Math.abs(a.y - b.y) <= STEP
    if (!rock && hazard && level && a.ground && b.ground && hi - lo <= WORKS.BRIDGE_MAX) return { kind: 'bridge', lo, hi, groundY }
    if (!rock && !hazard && Math.abs(a.y - b.y) <= DROP) return null // liaison ordinaire (marche ou descente)
    if (bottom - Math.min(apex.y, Math.min(a.y, b.y)) > WORKS.CLIMB_MAX) return null
    return { kind: 'ladder', lo, hi, apex: rock ? apex : null, profile }
  }

  /** Liaison d'ouvrage de `from` vers `to` (dir : 1 vers la droite, -1 vers la gauche). */
  #workLink(from, to, work, dir, ladders) {
    const startX = dir > 0 ? from.x1 : from.x0
    const exitX = dir > 0 ? to.x0 : to.x1
    const stand = startX - dir * WORKS.STAND
    if (work.kind === 'bridge') {
      return { to: to.id, x: startX, exitX, stand, kind: 'bridge', built: false, cost: Math.abs(exitX - startX) + WORKS.COST.bridge, span: { x0: work.lo, x1: work.hi } }
    }
    const S = { x: stand, y: from.y }
    const E = { x: exitX + dir * WORKS.STAND, y: to.y }
    const route = ladderRoute(S, E, work.profile)
    let length = 0
    for (let i = 1; i < route.length; i++) length += Math.hypot(route[i].x - route[i - 1].x, route[i].y - route[i - 1].y)
    const lo = Math.min(S.x, E.x)
    const hi = Math.max(S.x, E.x)
    const built = ladders.some((l) => Math.abs(Math.min(l.x0, l.x1) - lo) < 16 && Math.abs(Math.max(l.x0, l.x1) - hi) < 16)
    return { to: to.id, x: startX, exitX, stand, kind: 'ladder', built, route, cost: length * 1.2 + (built ? 0 : WORKS.COST.ladder) }
  }

  /**
   * Corniche sous des pieds en (x, feetY), ou null (en l'air, sur un bloc penché…).
   * @param {number} x
   * @param {number} feetY
   * @param {number} [tolerance]
   */
  ledgeAt(x, feetY, tolerance = 7) {
    let best = null
    for (const l of this.ledges) {
      if (x < l.x0 - 2 || x > l.x1 + 2 || Math.abs(l.y - feetY) > tolerance) continue
      if (!best || Math.abs(l.y - feetY) < Math.abs(best.y - feetY)) best = l
    }
    return best
  }

  /** @param {number} id */
  ledge(id) {
    return this.ledges[id] ?? null
  }

  /** @param {number} id */
  neighbours(id) {
    return this.links.get(id) ?? []
  }
}
