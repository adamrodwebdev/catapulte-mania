/**
 * Recherche de chemin sur le graphe de navigation (v5.8) : A* sur les
 * corniches, où l'on entre par un point précis (le bout par lequel on arrive).
 *
 * Le coût d'un chemin est la distance marchée, plus le prix de chaque marche
 * franchie, plus une pénalité facultative par corniche (danger, exposition).
 * L'heuristique (distance horizontale + écart de hauteur) ne surestime jamais
 * ce coût : le chemin trouvé est le plus court.
 *
 * `reachable` explore tout ce qu'on peut atteindre sous un budget (Dijkstra) :
 * c'est avec lui qu'un défenseur choisit où fuir, où patrouiller, où aller
 * réparer.
 *
 * v5.8 : les ouvrages (ponts et échelles, voir NavGraph) ne sont empruntés
 * qu'avec l'option `build` (les pillards) ; un point de passage qui en exige
 * un porte sa liaison (`link`) : le défenseur sait qu'il doit bâtir ou grimper.
 */

/** Petit tas binaire (file de priorité) : extraction du plus petit en O(log n). */
export class MinHeap {
  #items = []

  get size() {
    return this.#items.length
  }

  /** @param {number} priority @param {*} value */
  push(priority, value) {
    const a = this.#items
    a.push({ priority, value })
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (a[p].priority <= a[i].priority) break
      swap(a, p, i)
      i = p
    }
  }

  pop() {
    const a = this.#items
    if (!a.length) return undefined
    const top = a[0]
    const last = a.pop()
    if (a.length) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let m = i
        if (l < a.length && a[l].priority < a[m].priority) m = l
        if (r < a.length && a[r].priority < a[m].priority) m = r
        if (m === i) break
        swap(a, m, i)
        i = m
      }
    }
    return top.value
  }
}

/**
 * @typedef {{ x: number, y: number, ledge: number, link?: import('./NavGraph.js').Link }} Waypoint
 * @typedef {{ penalty?: (ledge: import('./NavGraph.js').Ledge) => number, build?: boolean }} PathOptions
 */

/**
 * Chemin le plus court de `from` à `to` (A*).
 * @param {import('./NavGraph.js').NavGraph} nav
 * @param {{ x: number, ledge: number }} from
 * @param {{ x: number, ledge: number }} to
 * @param {PathOptions} [opts]
 * @returns {{ cost: number, waypoints: Waypoint[] } | null} points de passage (bouts de corniche, puis l'arrivée)
 */
export function findPath(nav, from, to, { penalty, build = false } = {}) {
  const start = nav.ledge(from.ledge)
  const goal = nav.ledge(to.ledge)
  if (!start || !goal) return null
  const gx = clampTo(goal, to.x)
  if (start.id === goal.id) {
    const x = clampTo(start, from.x)
    return { cost: Math.abs(gx - x), waypoints: [{ x: gx, y: goal.y, ledge: goal.id }] }
  }
  const h = (ledge, x) => Math.abs(x - gx) + Math.abs(ledge.y - goal.y)
  /** Meilleur coût connu pour entrer sur une corniche (une entrée par corniche suffit : les corniches sont des segments). */
  const best = new Map()
  const came = new Map()
  const open = new MinHeap()
  const x0 = clampTo(start, from.x)
  best.set(start.id, 0)
  open.push(h(start, x0), { id: start.id, x: x0, g: 0 })
  while (open.size) {
    const cur = open.pop()
    if (cur.g > (best.get(cur.id) ?? Infinity)) continue
    if (cur.id === goal.id) {
      const total = cur.g + Math.abs(gx - cur.x)
      const waypoints = [{ x: gx, y: goal.y, ledge: goal.id }]
      let k = cur.id
      while (came.has(k)) {
        const c = came.get(k)
        waypoints.unshift(c.link.kind ? { x: c.x, y: nav.ledge(k).y, ledge: k, link: c.link } : { x: c.x, y: nav.ledge(k).y, ledge: k })
        k = c.from
      }
      return { cost: total, waypoints }
    }
    for (const link of nav.neighbours(cur.id)) {
      if (link.kind && !build) continue
      const next = nav.ledge(link.to)
      const g = cur.g + Math.abs(link.x - cur.x) + link.cost + (penalty ? penalty(next) : 0)
      if (g >= (best.get(next.id) ?? Infinity)) continue
      best.set(next.id, g)
      came.set(next.id, { from: cur.id, x: link.x, link })
      const entry = link.exitX ?? link.x
      open.push(g + h(next, entry), { id: next.id, x: entry, g })
    }
  }
  return null
}

/**
 * Tout ce qui est atteignable depuis `from` sans dépasser `budget` (Dijkstra) :
 * pour chaque corniche, le coût et le point d'entrée.
 * @returns {Map<number, { cost: number, x: number }>}
 */
export function reachable(nav, from, budget, { penalty, build = false } = {}) {
  const out = new Map()
  const start = nav.ledge(from.ledge)
  if (!start) return out
  const open = new MinHeap()
  const x0 = clampTo(start, from.x)
  open.push(0, { id: start.id, x: x0, g: 0 })
  out.set(start.id, { cost: 0, x: x0 })
  while (open.size) {
    const cur = open.pop()
    if (cur.g > out.get(cur.id).cost) continue
    for (const link of nav.neighbours(cur.id)) {
      if (link.kind && !build) continue
      const next = nav.ledge(link.to)
      const g = cur.g + Math.abs(link.x - cur.x) + link.cost + (penalty ? penalty(next) : 0)
      if (g > budget || g >= (out.get(next.id)?.cost ?? Infinity)) continue
      const entry = link.exitX ?? link.x
      out.set(next.id, { cost: g, x: entry })
      open.push(g, { id: next.id, x: entry, g })
    }
  }
  return out
}

function swap(a, i, j) {
  const t = a[i]
  a[i] = a[j]
  a[j] = t
}

/** Abscisse ramenée dans la corniche. */
function clampTo(ledge, x) {
  return Math.max(ledge.x0, Math.min(ledge.x1, x))
}
