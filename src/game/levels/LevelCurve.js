/**
 * Courbe de difficulté de la campagne (v4.6).
 *
 * Appliquée à chaque niveau de la campagne APRÈS sa construction, selon son
 * rang dans la partie (1 à 100) :
 *  - DISTANCE : les dix premiers niveaux restent proches ; ensuite le château
 *    recule progressivement (jusqu'à ~520 unités au niveau 100) ;
 *  - DÉCOR : à partir du chapitre 3, des châteaux se dressent sur un plateau
 *    rocheux (indestructible, talus de chaque côté) ; un défenseur qui en
 *    tombe ne se relève pas. À partir du niveau 57, une aiguille de roche
 *    derrière certains châteaux porte un baril : le faire tomber écrase le donjon ;
 *  - GARNISON : davantage de barils et de défenseurs, devant et derrière les
 *    murs, à mesure que l'on avance.
 *
 * Tout est déterministe (même niveau ⇒ même château) et validé ensuite par le
 * schéma du niveau, puis par scripts/check-levels.mjs (stabilité, faisabilité).
 */
import { WORLD } from '../physics/constants.js'
import { TARGET_TYPES } from '../entities/catalog.js'

const G = WORLD.GROUND_Y
/** Le château ne recule jamais au-delà (la catapulte doit pouvoir l'atteindre). */
const MAX_RIGHT = WORLD.WIDTH - 40
const BARREL = { w: 34, h: 42 }
/** Largeur maximale d'un bloc de roche (au-delà, le plateau est découpé). */
const ROCK_MAX_W = 560

/** Recul du château selon le rang du niveau. */
export function distanceFor(rank) {
  return rank <= 10 ? 0 : Math.round(Math.min(520, ((rank - 10) * 520) / 90))
}

/** Hauteur du plateau rocheux (0 = château au sol). */
export function plateauFor(rank) {
  if (rank <= 20) return 0
  if (rank <= 40) return rank % 2 ? 60 + ((rank * 7) % 31) : 0
  if (rank <= 70) return rank % 3 === 0 ? 0 : 80 + ((rank * 11) % 61)
  return 110 + ((rank * 13) % 71)
}

/** Barils et défenseurs supplémentaires. */
export function garrisonFor(rank) {
  return {
    barrels: rank < 12 ? 0 : Math.min(4, 1 + Math.floor((rank - 12) / 22)),
    guards: rank < 8 ? 0 : Math.min(4, 1 + Math.floor((rank - 8) / 23)),
    spire: rank >= 57 && rank % 3 === 0,
  }
}

function extentOf(items) {
  let left = Infinity
  let right = -Infinity
  for (const it of items) {
    const half = (it.w ?? TARGET_TYPES[it.type]?.w ?? BARREL.w) / 2
    left = Math.min(left, it.x - half)
    right = Math.max(right, it.x + half)
  }
  return { left, right }
}

/**
 * @param {{ blocks: object[], targets: object[], barrels: object[] }} b sortie du StructureBuilder (modifiée sur place)
 * @param {number} rank rang du niveau dans la campagne (1 à 100)
 */
export function applyCurve(b, rank) {
  const all = () => [...b.blocks, ...b.targets.map((t) => ({ ...t, w: TARGET_TYPES[t.type].w })), ...b.barrels.map((x) => ({ ...x, w: BARREL.w }))]
  // 1. Distance (bornée pour rester à portée).
  const ext0 = extentOf(all())
  const dx = Math.max(0, Math.min(distanceFor(rank), MAX_RIGHT - 120 - ext0.right))
  // 2. Plateau : tout le château est surélevé.
  const ph = plateauFor(rank)
  for (const list of [b.blocks, b.targets, b.barrels]) {
    for (const it of list) {
      it.x += dx
      it.y -= ph
    }
  }
  const surface = G - ph
  const castle = extentOf(all())
  const { barrels, guards, spire } = garrisonFor(rank)

  // 3. Emplacements libres au niveau du sol du château, devant puis derrière.
  const occupied = all()
    .filter((it) => it.y + (it.h ?? 50) / 2 >= surface - 70)
    .map((it) => ({ l: it.x - (it.w ?? 30) / 2, r: it.x + (it.w ?? 30) / 2 }))
  const take = (x, w) => occupied.push({ l: x - w / 2, r: x + w / 2 })
  const free = (x, w) => occupied.every((o) => x + w / 2 + 6 <= o.l || x - w / 2 - 6 >= o.r)
  const slot = (side, w) => {
    let x = side < 0 ? castle.left - w / 2 - 10 : castle.right + w / 2 + 10
    for (let i = 0; i < 40 && !free(x, w); i++) x += side * 12
    take(x, w)
    return x
  }
  const extra = []
  // Aiguille rocheuse derrière le château, un baril en équilibre au sommet.
  let spireRock = null
  if (spire) {
    const castleTop = Math.min(...b.blocks.map((k) => k.y - k.h / 2))
    const h = Math.max(120, Math.min(320, Math.round((surface - castleTop) * 0.6)))
    // Au plus près des murs : le baril qui tombe (ou explose) atteint le donjon.
    const x = slot(1, 48)
    spireRock = { material: 'rock', x, y: surface - h / 2, w: 48, h, shape: 'rect' }
    extra.push({ kind: 'barrel', x, y: surface - h - BARREL.h / 2 - 1 })
  }
  // Gardes : d'abord à l'abri derrière les murs, puis devant.
  for (let i = 0; i < guards; i++) {
    const type = rank >= 40 && i === guards - 1 ? 'knight' : 'soldier'
    const t = TARGET_TYPES[type]
    const x = slot(i % 2 === 0 ? 1 : -1, t.w)
    extra.push({ kind: 'target', type, x, y: surface - t.h / 2 - 1 })
  }
  // Barils : devant les murs (un tir bien placé ouvre la brèche), puis derrière.
  for (let i = 0; i < barrels; i++) {
    const x = slot(i % 2 === 0 ? -1 : 1, BARREL.w)
    extra.push({ kind: 'barrel', x, y: surface - BARREL.h / 2 - 1 })
  }
  for (const e of extra) {
    if (e.kind === 'target') b.targets.push({ type: e.type, x: Math.round(e.x), y: Math.round(e.y) })
    else b.barrels.push({ x: Math.round(e.x), y: Math.round(e.y) })
  }

  // 4. Roche : plateau (découpé en blocs ≤ ROCK_MAX_W) et talus de chaque côté.
  const rocks = []
  if (ph > 0) {
    const ext = extentOf(all())
    const left = ext.left - 30
    const right = ext.right + 30
    const n = Math.ceil((right - left) / ROCK_MAX_W)
    const w = (right - left) / n
    for (let i = 0; i < n; i++) rocks.push({ material: 'rock', x: Math.round(left + w * (i + 0.5)), y: G - ph / 2, w: Math.round(w) + 1, h: ph, shape: 'rect' })
    const tw = Math.min(ROCK_MAX_W, Math.round(ph * 2.4))
    rocks.push({ material: 'rock', x: Math.round(left), y: G - ph / 2, w: tw, h: ph, shape: 'triangle' })
    rocks.push({ material: 'rock', x: Math.round(right), y: G - ph / 2, w: tw, h: ph, shape: 'triangle' })
  }
  if (spireRock) rocks.push({ ...spireRock, x: Math.round(spireRock.x), y: Math.round(spireRock.y) })
  // La roche passe en premier : elle est posée avant le château.
  b.blocks.unshift(...rocks)
  for (const k of b.blocks) {
    k.x = Math.round(k.x * 10) / 10
    k.y = Math.round(k.y * 10) / 10
  }
  return { dx, plateau: ph }
}
