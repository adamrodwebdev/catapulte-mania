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
/**
 * Niveaux sans sentinelle sur le toit : leur toit oscille en se mettant en place
 * et la sentinelle tomberait seule (relevé par scripts/check-levels.mjs).
 */
const SENTRY_SKIP = new Set([28, 68])
/**
 * Niveaux où un garde posé derrière le château serait hors de portée du
 * trébuchet (au-delà de REACH_RIGHT) : il se poste devant (relevé par
 * scripts/check-levels.mjs --engine trebuchet).
 */
const GUARDS_FRONT = new Set([66, 99])
const REACH_RIGHT = WORLD.WIDTH - 340
/** Les terrains commencent au-delà de cette abscisse (la catapulte reste sur la terre ferme). */
const FIELD_LEFT = 480
/** Pied gauche minimal d'une montagne. */
const MOUNTAIN_LEFT = 380

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

/** Rondes (v5.1) : les gardes au sol patrouillent dès ce niveau, ceux du château à partir du second. */
export const PATROL_FROM = 6
export const PATROL_INSIDE_FROM = 12

/** Ogres (v5.1) : un niveau sur trois à partir du 35, tous les niveaux à partir du 85. */
export function ogresFor(rank) {
  if (rank >= 85) return 1
  return rank >= 35 && rank % 3 === 2 ? 1 : 0
}

/**
 * Barils et défenseurs supplémentaires (v5.0 : plus tôt et plus nombreux).
 * Des sentinelles montent aussi sur le toit plat le plus haut à partir du niveau 18.
 */
export function garrisonFor(rank) {
  return {
    barrels: rank < 6 ? 0 : Math.min(4, 1 + Math.floor((rank - 6) / 20)),
    guards: rank < 3 ? 0 : Math.min(5, 1 + Math.floor((rank - 3) / 12)),
    sentries: rank < 18 ? 0 : Math.min(2, 1 + Math.floor((rank - 18) / 40)),
    spire: rank >= 57 && rank % 3 === 0,
  }
}

/**
 * Munitions (v5.0) : chaque munition se débloque tôt dans la campagne (rang du
 * niveau) et reste ensuite disponible au moins en un exemplaire.
 */
export const AMMO_UNLOCK = Object.freeze({ fire: 3, boulder: 5, frost: 7, bomb: 10, split: 14 })

/**
 * @param {number} rank
 * @param {Record<string, number>} ammo munitions prévues par le niveau
 * @param {{ cold?: boolean }} [terrain] terrain gelé ou brûlant : un givre de plus
 */
export function ammoFor(rank, ammo, { cold = false } = {}) {
  const out = { ...ammo }
  for (const [type, at] of Object.entries(AMMO_UNLOCK)) {
    if (rank < at) continue
    let base = 1
    if (type === 'boulder' && rank >= 20) base = 2
    if (type === 'frost' && cold) base = 2
    out[type] = Math.min(10, Math.max(out[type] ?? 0, base))
  }
  return out
}

/**
 * Terrains du niveau (v5.0), selon son rang et son chapitre :
 * lac (douves) dès le niveau 4, montagne dès le 8, corbeaux dès le 12, neige dès
 * le 16, lave dès le 24, vouivre dès le 27 ; chaque chapitre a ensuite sa
 * dominante (Marais : lacs, Désert : lave, Montagne : montagnes et lave,
 * Hiver : neige et lacs gelés, Tempête : corbeaux, Trône : un peu de tout).
 */
export function terrainFor(rank) {
  const c = Math.ceil(rank / 10)
  const lava = (rank >= 24 && rank % 7 === 3) || (c === 6 && rank % 2 === 0) || (c === 7 && rank % 3 === 1) || (c === 10 && rank % 3 === 0)
  const lake = !lava && ((rank >= 4 && rank % 5 === 4) || (c === 5 && rank % 2 === 1) || (c === 8 && rank % 3 === 0) || (c === 10 && rank % 4 === 1))
  const snow = c === 8 || (rank >= 16 && rank % 9 === 7)
  return {
    lava,
    lake,
    frozenLake: lake && c === 8,
    snow,
    mountain: (rank >= 8 && rank % 6 === 2) || (c === 7 && rank % 2 === 0) || (c >= 9 && rank % 5 === 3),
    crows: (rank >= 12 && rank % 4 === 0) || c === 9 ? Math.min(3, 1 + Math.floor(rank / 35)) : 0,
    wyvern: (rank >= 27 && rank % 6 === 3) || (c === 10 && rank % 2 === 0),
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
  const { barrels, guards, sentries, spire } = garrisonFor(rank)

  // 3. Emplacements libres au niveau du sol du château, devant puis derrière.
  const occupied = all()
    .filter((it) => it.y + (it.h ?? 50) / 2 >= surface - 70)
    .map((it) => ({ l: it.x - (it.w ?? 30) / 2, r: it.x + (it.w ?? 30) / 2 }))
  const take = (x, w) => occupied.push({ l: x - w / 2, r: x + w / 2 })
  const free = (x, w) => occupied.every((o) => x + w / 2 + 6 <= o.l || x - w / 2 - 6 >= o.r)
  const slot = (side, w) => {
    let x = side < 0 ? castle.left - w / 2 - 10 : castle.right + w / 2 + 10
    for (let i = 0; i < 40 && !free(x, w); i++) x += side * 12
    // Trop loin derrière le château (hors de portée du trébuchet) : devant, alors.
    if (side > 0 && GUARDS_FRONT.has(rank) && x + w / 2 > REACH_RIGHT) return slot(-1, w)
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
  const ogres = ogresFor(rank)
  for (let i = 0; i < guards; i++) {
    // Chevaliers en armure parmi les gardes dès le niveau 15 (un sur deux) ;
    // ogres (v5.1) devant les murs, à la place des premiers gardes postés devant.
    let type = (rank >= 40 && i === guards - 1) || (rank >= 15 && i % 2 === 1) ? 'knight' : 'soldier'
    if (i % 2 === 1 && Math.floor(i / 2) < ogres) type = 'ogre'
    const t = TARGET_TYPES[type]
    const x = slot(i % 2 === 0 ? 1 : -1, t.w)
    extra.push({ kind: 'target', type, x, y: surface - t.h / 2 - 1, patrol: rank >= PATROL_FROM ? (type === 'ogre' ? 40 : 60) : 0 })
  }
  // Barils : devant les murs (un tir bien placé ouvre la brèche), puis derrière.
  for (let i = 0; i < barrels; i++) {
    const x = slot(i % 2 === 0 ? -1 : 1, BARREL.w)
    extra.push({ kind: 'barrel', x, y: surface - BARREL.h / 2 - 1 })
  }
  // Sentinelles : sur les dalles les plus hautes et assez larges (rien au-dessus).
  const roofs = b.blocks
    .filter((k) => k.shape === 'rect' && k.w >= 60 && k.w > k.h * 2 && k.material !== 'rock')
    .filter((k) => !b.blocks.some((o) => o !== k && o.y < k.y && Math.abs(o.x - k.x) < (o.w + k.w) / 2 && o.y + o.h / 2 > k.y - k.h / 2 - 70))
    .filter((k) => !b.targets.some((t) => Math.abs(t.x - k.x) < k.w / 2 + 10 && t.y < k.y && t.y > k.y - 90))
    .sort((p, q) => p.y - q.y)
  for (let i = 0; i < (SENTRY_SKIP.has(rank) ? 0 : Math.min(sentries, roofs.length)); i++) {
    const k = roofs[i]
    const t = TARGET_TYPES.soldier
    extra.push({ kind: 'target', type: 'soldier', x: k.x, y: k.y - k.h / 2 - t.h / 2 - 1, patrol: rank >= 30 ? Math.max(0, Math.min(30, Math.floor(k.w / 2 - t.w / 2 - 8))) : 0 })
  }
  // Rondes dans le château (v5.1) : un défenseur sur trois va et vient dans sa pièce.
  if (rank >= PATROL_INSIDE_FROM) {
    b.targets.forEach((t, i) => {
      if (t.type !== 'king' && (i + rank) % 3 === 0) t.patrol = 30
    })
  }
  for (const e of extra) {
    if (e.kind === 'target') b.targets.push({ type: e.type, x: Math.round(e.x), y: Math.round(e.y), patrol: e.patrol ?? 0 })
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

  // 5. Terrains : douves (lac, lave ou neige) devant le château, montagne et
  //    champ au milieu, créatures dans le ciel.
  const t = terrainFor(rank)
  const front = Math.min(extentOf(all()).left, ...rocks.map((r) => r.x - r.w / 2))
  const zones = []
  const moatW = 160 + ((rank * 37) % 140)
  const moat = { x1: Math.round(front - 14), x0: Math.round(Math.max(FIELD_LEFT, front - 14 - moatW)) }
  const moatKind = t.lava ? 'lava' : t.lake ? (t.frozenLake ? 'ice' : 'lake') : t.snow ? 'snow' : null
  if (moatKind && moat.x1 - moat.x0 >= 100) zones.push({ kind: moatKind, ...moat })
  const fieldRight = zones.length ? moat.x0 - 30 : front - 20
  let fieldLeft = FIELD_LEFT
  if (t.mountain) {
    const h = Math.round(160 + Math.min(320, rank * 3.2))
    const w = Math.min(ROCK_MAX_W, Math.round(h * 1.5))
    let mx = 560 + ((rank * 53) % 260)
    // La montagne ne déborde jamais sur les douves.
    mx = Math.min(mx, fieldRight - w / 2 - 10)
    if (mx - w / 2 >= MOUNTAIN_LEFT) {
      // Un triangle est centré sur son centre de gravité (au tiers de sa hauteur) : base légèrement enterrée.
      rocks.push({ material: 'rock', x: Math.round(mx), y: Math.round(G + 12 - h / 3), w, h, shape: 'triangle' })
      const h2 = Math.round(h * 0.62)
      const w2 = Math.min(ROCK_MAX_W, Math.round(h2 * 1.7))
      rocks.push({ material: 'rock', x: Math.round(mx + w * 0.28), y: Math.round(G + 12 - h2 / 3), w: w2, h: h2, shape: 'triangle' })
      fieldLeft = Math.round(mx + w * 0.28 + w2 / 2 + 20)
    }
  }
  // Champ de neige au milieu (en plus des douves) en hiver.
  if (t.snow && moatKind !== 'snow' && fieldRight - fieldLeft >= 140) zones.push({ kind: 'snow', x0: fieldLeft, x1: Math.round(fieldRight) })
  const flyers = []
  for (let i = 0; i < t.crows; i++) {
    flyers.push({
      type: 'crow',
      x: Math.round(Math.min(front - 120, 720 + i * 240 + ((rank * 31) % 120))),
      y: Math.round(G - 330 - ((rank * 17 + i * 90) % 220)),
      range: 110 + ((rank * 13 + i * 40) % 110),
      period: 3000 + ((rank * 211 + i * 700) % 3000),
      phase: Math.round((((rank * 7 + i * 3) % 10) / 10) * 100) / 100,
    })
  }
  if (t.wyvern) {
    const blocks = b.blocks.filter((k) => k.material !== 'rock')
    const top = Math.min(...blocks.map((k) => k.y - k.h / 2))
    const ext = extentOf(blocks)
    flyers.push({ type: 'wyvern', x: Math.round((ext.left + ext.right) / 2), y: Math.round(Math.max(WORLD.TOP + 140, top - 150)), range: 150, period: 7000, phase: (rank % 4) / 4 })
  }
  b.zones.push(...zones)
  b.flyers.push(...flyers)
  // La roche passe en premier : elle est posée avant le château.
  b.blocks.unshift(...rocks)
  for (const k of b.blocks) {
    k.x = Math.round(k.x * 10) / 10
    k.y = Math.round(k.y * 10) / 10
  }
  return { dx, plateau: ph, terrain: t }
}
