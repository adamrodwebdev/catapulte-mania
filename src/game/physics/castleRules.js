/**
 * Règles de l'assemblage des châteaux (v6.2) : liants et réglages, clés de voûte,
 * contacts entre blocs. Sans moteur physique (pas de Matter) : la carte des
 * niveaux et les menus s'en servent sans charger le moteur. Le soudage
 * lui-même est dans CastleJoints.js.
 */
import { deepFreeze } from '../../core/utils/Guard.js'

/**
 * Liants : raideur, allongement de fissure et de rupture (px), et force (énergie
 * de choc que la jonction encaisse avant de céder).
 */
export const BONDS = deepFreeze({
  mortar: { stiffness: 0.15, crack: 1.2, snap: 3.2, strength: 80 },
  peg: { stiffness: 0.12, crack: 1.6, snap: 4, strength: 55 },
  lashing: { stiffness: 0.08, crack: 2, snap: 3.6, strength: 20 },
  rivet: { stiffness: 0.22, crack: 2.2, snap: 6, strength: 200 },
  frost: { stiffness: 0.15, crack: 0.8, snap: 2, strength: 35 },
  lead: { stiffness: 0.14, crack: 0.8, snap: 1.8, strength: 25 },
  footing: { stiffness: 0.15, crack: 1.6, snap: 4.5, strength: 130 },
})

/** Liant de chaque matériau. */
export const BOND_OF = deepFreeze({ stone: 'mortar', brick: 'mortar', sandstone: 'mortar', marble: 'mortar', rock: 'mortar', wood: 'peg', straw: 'lashing', iron: 'rivet', ice: 'frost', glass: 'lead' })

/**
 * Réglages : détection des contacts (px), usure (part par ms d'allongement
 * au-delà de la fissure), seuil de fissure visible, clés de voûte (fragilité,
 * part de vie perdue qui les fait lâcher), explosions et feu.
 */
export const JOINT = deepFreeze({
  GAP: 4,
  MIN_OVERLAP: 6,
  INSET: 3,
  WEAR_PER_MS: 1 / 220,
  CRACKED: 0.3,
  KEYSTONE_WEAK: 0.55,
  BLAST: 2.5,
  FIRE_MS: 2600,
  FROZEN_SNAP: 0.6,
  WAKE_SPEED: 0.25,
  SPREAD: 0.5,
})

/**
 * Clés de voûte (v6.2) : un bloc par tranche de PER_BLOCKS blocs (MAX au plus),
 * parmi ceux qui portent au moins MIN_LOAD blocs ; abîmées de GIVE de leur vie,
 * elles se désagrègent et lâchent tout. Présentées à partir du niveau FROM.
 */
export const KEYSTONE = deepFreeze({ FROM: 5, MIN_LOAD: 4, PER_BLOCKS: 30, MAX: 3, GIVE: 0.4 })

/**
 * Trouve les clés de voûte d'un château d'après sa seule géométrie (définitions
 * de blocs : x, y, w, h au centre) : qui repose sur qui (comme
 * StructuralIntegrity), puis la charge portée par chaque bloc. Les plus chargés
 * l'emportent (à égalité, le plus proche de l'engin). Ni roche, ni fer, ni
 * ouvrage, ni charge suspendue.
 * @param {Array<{material:string,x:number,y:number,w:number,h:number,prop?:string|null}>} blocks
 * @param {Set<number>} [skip] indices à écarter (blocs des mécanismes)
 * @returns {number[]} indices des clés de voûte
 */
export function findKeystones(blocks, skip = new Set()) {
  const box = blocks.map((b) => ({ minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minY: b.y - b.h / 2, maxY: b.y + b.h / 2 }))
  const carries = blocks.map(() => [])
  for (let u = 0; u < blocks.length; u++) {
    for (let l = 0; l < blocks.length; l++) {
      if (u === l) continue
      const a = box[u]
      const b = box[l]
      const overlap = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)
      if (Math.abs(a.maxY - b.minY) <= JOINT.GAP && overlap >= 4 && blocks[u].y < blocks[l].y) carries[l].push(u)
    }
  }
  const loadOf = (i) => {
    const seen = new Set()
    const walk = (k) => {
      for (const up of carries[k]) {
        if (seen.has(up)) continue
        seen.add(up)
        walk(up)
      }
    }
    walk(i)
    return seen
  }
  const castle = blocks.filter((b) => b.material !== 'rock').length
  const n = Math.min(KEYSTONE.MAX, Math.floor(castle / KEYSTONE.PER_BLOCKS) + 1)
  const scored = []
  blocks.forEach((b, i) => {
    if (skip.has(i) || b.material === 'rock' || b.material === 'iron' || b.prop) return
    const loads = loadOf(i)
    if (loads.size >= KEYSTONE.MIN_LOAD) scored.push({ i, loads, x: b.x })
  })
  scored.sort((a, b) => b.loads.size - a.loads.size || a.x - b.x)
  // Une clé par ouvrage : on écarte un bloc qui porte surtout la même charge qu'une clé choisie.
  const picked = []
  for (const s of scored) {
    if (picked.length >= n) break
    const shared = picked.some((p) => [...s.loads].filter((k) => p.loads.has(k)).length > s.loads.size * 0.5)
    if (!shared) picked.push(s)
  }
  return picked.map((s) => s.i)
}

/** Le plus faible de deux liants (celui qui cède le plus tôt sous un choc). */
export function bondBetween(matA, matB) {
  const a = BOND_OF[matA] ?? 'mortar'
  const b = BOND_OF[matB] ?? 'mortar'
  return BONDS[a].strength <= BONDS[b].strength ? a : b
}

/**
 * Contacts entre deux boîtes englobantes : appui (A posé sur B), contact de côté, ou rien.
 * @returns {{ dir: 'v'|'h', points: Array<{x:number,y:number}> } | null}
 */
export function contactBetween(a, b) {
  const g = JOINT.GAP
  // A posé sur B : le bas de A touche le haut de B, et ils se chevauchent en largeur.
  if (Math.abs(a.max.y - b.min.y) <= g) {
    const l = Math.max(a.min.x, b.min.x)
    const r = Math.min(a.max.x, b.max.x)
    if (r - l >= JOINT.MIN_OVERLAP) {
      const y = (a.max.y + b.min.y) / 2
      const i = Math.min(JOINT.INSET, (r - l) / 4)
      return { dir: 'v', points: [{ x: l + i, y }, { x: r - i, y }] }
    }
  }
  // Côte à côte : le bord droit de A touche le bord gauche de B (ou l'inverse).
  for (const [p, q] of [[a, b], [b, a]]) {
    if (Math.abs(p.max.x - q.min.x) <= g) {
      const t = Math.max(p.min.y, q.min.y)
      const bt = Math.min(p.max.y, q.max.y)
      if (bt - t >= JOINT.MIN_OVERLAP * 1.5) {
        const x = (p.max.x + q.min.x) / 2
        const i = Math.min(JOINT.INSET, (bt - t) / 4)
        return { dir: 'h', points: [{ x, y: t + i }, { x, y: bt - i }] }
      }
    }
  }
  return null
}
