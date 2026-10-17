/**
 * Repères des défenseurs (v6.2) : où poser les marques qui aident le joueur à
 * trouver une cible des yeux. Module pur, sans dessin (voir BeaconPainter.js) :
 *
 * - DERNIER DÉFENSEUR : quand il n'en reste qu'un, un chevron d'or le désigne,
 *   où qu'il soit (la partie dit lequel : voir GameSession#scene).
 * - AU BORD : un défenseur qui atteint la marge droite de l'écran, ou passe
 *   au-delà, est signalé par une pastille au bord, à sa hauteur, qui pointe vers
 *   lui (d'or si c'est le dernier). Des défenseurs proches les uns des autres
 *   partagent une pastille.
 *
 * Tout est en pixels d'écran, calculé à chaque image depuis la caméra.
 */
export const BEACON = Object.freeze({
  /**
   * Marge droite de l'écran (px) : au-delà, un défenseur est « au bord » (il
   * touche le bord, à moitié coupé, ou il est sorti du champ). Plus large, les
   * pastilles couvraient des défenseurs encore bien visibles.
   */
  EDGE_MARGIN: 20,
  /** Centre des pastilles, depuis le bord droit (px). */
  EDGE_INSET: 26,
  /** Rayon d'une pastille (px). */
  BADGE_R: 15,
  /** Écart vertical (px) sous lequel deux défenseurs partagent une pastille. */
  MERGE: 34,
  /** Garde (px) sous le bandeau du haut et au-dessus des commandes du bas. */
  PAD: 30,
})

/**
 * Pastilles du bord droit.
 * @param {Iterable<{ id: number, x: number, y: number, kind: string, alive?: boolean }>} entities
 * @param {{ viewW: number, viewH: number, insetTop?: number, insetBottom?: number, worldToScreen: (x: number, y: number) => { x: number, y: number } }} camera
 * @param {{ lastId?: number | null }} [opts] identifiant du dernier défenseur, s'il n'en reste qu'un
 * @returns {Array<{ y: number, count: number, last: boolean, offscreen: boolean }>} du haut vers le bas
 */
export function edgeBeacons(entities, camera, { lastId = null } = {}) {
  const edge = camera.viewW - BEACON.EDGE_MARGIN
  const top = (camera.insetTop ?? 0) + BEACON.PAD
  const bottom = camera.viewH - (camera.insetBottom ?? 0) - BEACON.PAD
  const hits = []
  for (const e of entities) {
    if (e.kind !== 'target' || e.alive === false) continue
    const s = camera.worldToScreen(e.x, e.y)
    if (s.x < edge) continue
    hits.push({ y: Math.max(top, Math.min(bottom, s.y)), last: e.id === lastId, offscreen: s.x > camera.viewW })
  }
  hits.sort((a, b) => a.y - b.y)
  const out = []
  for (const h of hits) {
    const prev = out[out.length - 1]
    if (prev && h.y - prev.y < BEACON.MERGE) {
      prev.y = (prev.y * prev.count + h.y) / (prev.count + 1)
      prev.count++
      prev.last ||= h.last
      prev.offscreen ||= h.offscreen
    } else out.push({ y: h.y, count: 1, last: h.last, offscreen: h.offscreen })
  }
  return out
}
