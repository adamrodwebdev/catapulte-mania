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

/** Garde de la porte (v5.8) : dès ce niveau, un pavoisier tient la porte et les barils passent derrière le château. */
export const GATE_GUARD_FROM = 19
/**
 * Exceptions : niveaux dont le baril de devant est la pièce maîtresse (il lance
 * les dominos de fer du 85). Relevé par check:levels : sans lui, le niveau
 * n'était plus faisable en Difficile.
 */
const KEG_AT_GATE = new Set([85])

/** Rondes (v5.1) : les gardes au sol patrouillent dès ce niveau, ceux du château à partir du second. */
export const PATROL_FROM = 6
export const PATROL_INSIDE_FROM = 12

/** Ogres (v5.1) : un niveau sur trois à partir du 35, tous les niveaux à partir du 85. */
export function ogresFor(rank) {
  if (rank >= 85) return 1
  return rank >= 35 && rank % 3 === 2 ? 1 : 0
}

/**
 * Défenseurs spéciaux (v5.8), introduits un par un selon le principe
 * « présenter, développer, retourner » :
 *  - éclaireur : seul au sol au niveau 9 (il esquive un tir direct : il faut
 *    viser large ou faire tomber le château), puis un niveau sur trois ; à
 *    partir du 27, certains sont postés DANS le château, où l'esquive ne les
 *    sauve plus (le retournement) ;
 *  - pavoisier : devant les murs au niveau 19 (il apprend le tir en cloche),
 *    puis un niveau sur quatre, deux à partir du 61 ;
 *  - sapeur : derrière le château au niveau 26 (il apprend à finir le travail
 *    d'un coup), puis un niveau sur cinq ; à l'intérieur à partir du 71 ;
 *  - porte-étendard : sur le toit au niveau 33 (abattre le chef d'abord), puis
 *    un niveau sur six et chaque fin de chapitre à partir du 40 ;
 *  - veilleurs : la nuit (chapitres 4 et 10), rondes et sentinelles portent une torche.
 */
export function rosterFor(rank) {
  const chapter = Math.ceil(rank / 10)
  return {
    scouts: rank === 9 || (rank >= 12 && rank % 3 === 0) ? (rank >= 45 ? 2 : 1) : 0,
    scoutInside: rank >= 27 && rank % 4 === 3,
    shields: rank === 19 || (rank >= 21 && rank % 4 === 1) ? (rank >= 61 ? 2 : 1) : 0,
    engineers: rank === 26 || (rank >= 31 && rank % 5 === 1) ? 1 : 0,
    engineerInside: rank >= 71 && rank % 5 === 1,
    banner: rank === 33 || (rank >= 39 && rank % 6 === 3) || (rank >= 40 && rank % 10 === 0),
    torches: chapter === 4 || chapter === 10,
  }
}

/**
 * Pillards (v5.8) : des défenseurs qui, dès le premier tir, courent attaquer
 * l'engin du joueur (pendant le vol des tirs seulement). Abattez-les en
 * chemin, ou éteignez le feu avec un seau d'eau. Quand le terrain leur barre
 * la route, ils jettent un pont (lac, lave, glace) ou dressent une échelle
 * (montagne, plateau, douves au pied d'un plateau) : abattez l'ouvrage, et
 * ceux qui sont dessus tombent. Niveaux choisis à la main (une idée à la fois) :
 *
 *  présenter   17  une torche, seule, avec les premiers seaux d'eau
 *              32  l'échelle par-dessus une montagne
 *              34  le pont sur un lac
 *              36  le saboteur au marteau
 *              71  le pot de givre (hiver)   95  l'ogre qui charge
 *  développer  22, 28, 37 (descente d'un plateau), 42, 45 (pont sur la lave),
 *              51, 55, 63, 69, 72 (pont sur la glace), 77, 82, 84, 85…
 *  retourner   38  pont sur la lave ET échelle sur la montagne
 *              46  torche et saboteur ensemble ; 98 l'ogre par-dessus la montagne
 *  finales     40, 50, 60, 90 : deux torches à la fois ; 100 : deux torches et l'ogre
 */
export const RAIDS = Object.freeze({
  17: ['fire'],
  22: ['fire'],
  28: ['fire'],
  32: ['fire'],
  34: ['fire'],
  36: ['blow'],
  37: ['fire'],
  38: ['fire'],
  40: ['fire', 'fire'],
  42: ['fire'],
  45: ['fire'],
  46: ['fire', 'blow'],
  50: ['fire', 'fire'],
  51: ['fire'],
  55: ['fire'],
  57: ['blow'],
  60: ['fire', 'fire'],
  63: ['fire'],
  69: ['fire'],
  71: ['frost'],
  72: ['frost'],
  76: ['blow'],
  77: ['frost'],
  81: ['blow'],
  82: ['fire'],
  84: ['fire'],
  85: ['fire'],
  90: ['fire', 'fire'],
  95: ['smash'],
  98: ['smash'],
  100: ['fire', 'fire', 'smash'],
})

/** @returns {('fire' | 'frost' | 'blow' | 'smash')[]} */
export function raidFor(rank) {
  return RAIDS[rank] ?? []
}

/** Type du pillard selon ce qu'il porte. */
const RAIDER_TYPE = Object.freeze({ fire: 'scout', frost: 'scout', blow: 'engineer', smash: 'ogre' })

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
  const roster = rosterFor(rank)
  // Garde de la porte (v5.8) : dès le niveau 19, le premier garde posté devant
  // les murs est un pavoisier (son pavois arrête les tirs tendus).
  const special = (type, side, patrol, more = {}) => {
    const t = TARGET_TYPES[type]
    extra.push({ kind: 'target', type, x: slot(side, t.w), y: surface - t.h / 2 - 1, patrol, ...more })
  }
  const gateGuard = rank >= GATE_GUARD_FROM && roster.shields === 0
  for (let i = 0; i < roster.shields + (gateGuard ? 1 : 0); i++) special('shieldbearer', -1, 0)
  let replaced = gateGuard ? 1 : 0
  // Gardes : d'abord à l'abri derrière les murs, puis devant.
  const ogres = ogresFor(rank)
  for (let i = 0; i < guards; i++) {
    // Chevaliers en armure parmi les gardes dès le niveau 15 (un sur deux) ;
    // ogres (v5.1) devant les murs, à la place des premiers gardes postés devant.
    let type = (rank >= 40 && i === guards - 1) || (rank >= 15 && i % 2 === 1) ? 'knight' : 'soldier'
    if (i % 2 === 1 && Math.floor(i / 2) < ogres) type = 'ogre'
    if (i % 2 === 1 && type !== 'ogre' && replaced > 0) {
      replaced--
      continue
    }
    const t = TARGET_TYPES[type]
    const x = slot(i % 2 === 0 ? 1 : -1, t.w)
    extra.push({ kind: 'target', type, x, y: surface - t.h / 2 - 1, patrol: rank >= PATROL_FROM ? (type === 'ogre' ? 40 : 60) : 0 })
  }
  // Défenseurs spéciaux (v5.8) : éclaireurs et sapeurs derrière (le second éclaireur devant).
  // Le premier éclaireur sur le terrain dégagé derrière le château (on le voit courir), le second devant.
  for (let i = 0; i < roster.scouts; i++) special('scout', i % 2 ? -1 : 1, 70)
  if (roster.engineers && !roster.engineerInside) special('engineer', 1, 30)
  // Retournements : l'éclaireur enfermé en haut du château, le sapeur au rez-de-chaussée.
  const inside = b.targets.filter((t) => t.type === 'soldier').sort((p, q) => p.y - q.y)
  if (roster.scoutInside && inside.length) Object.assign(inside[0], { type: 'scout', y: inside[0].y + (TARGET_TYPES.soldier.h - TARGET_TYPES.scout.h) / 2, patrol: 30 })
  if (roster.engineerInside && inside.length > 1) {
    const low = inside[inside.length - 1]
    Object.assign(low, { type: 'engineer', y: low.y + (TARGET_TYPES.soldier.h - TARGET_TYPES.engineer.h) / 2, patrol: 30 })
  }
  // Barils (v5.8). Posés devant la porte, ils faisaient tout sauter au moindre
  // tir proche : relevé par check:levels, la plupart des tirs gagnants
  // commençaient par l'explosion d'un baril, et chaque niveau se résolvait de
  // la même façon. Les premiers chapitres gardent leur baril devant (il
  // apprend que la poudre fait tout sauter) ; ensuite, les barils sont rangés
  // derrière le château, au plus loin : il faut un long tir en cloche, précis,
  // pour les atteindre. Les poudrières dessinées par les niveaux, elles, restent.
  for (let i = 0; i < barrels; i++) {
    const side = rank >= GATE_GUARD_FROM && !KEG_AT_GATE.has(rank) ? 1 : i % 2 === 0 ? -1 : 1
    let x = slot(side, BARREL.w)
    // Hors de portée du trébuchet derrière le château : devant, alors.
    if (side > 0 && x + BARREL.w / 2 > REACH_RIGHT) {
      occupied.pop()
      x = slot(-1, BARREL.w)
    }
    extra.push({ kind: 'barrel', x, y: surface - BARREL.h / 2 - 1 })
  }
  // Pillards (v5.8) : postés devant, au plus loin, après les barils (rien ne leur
  // barre la route ; le terrain, eux, le franchissent : ponts et échelles).
  for (const raid of raidFor(rank)) special(RAIDER_TYPE[raid], -1, 0, { raid, torch: raid === 'fire' })
  // Sentinelles : sur les dalles les plus hautes et assez larges (rien au-dessus).
  const roofs = b.blocks
    .filter((k) => k.shape === 'rect' && k.w >= 60 && k.w > k.h * 2 && k.material !== 'rock')
    .filter((k) => !b.blocks.some((o) => o !== k && o.y < k.y && Math.abs(o.x - k.x) < (o.w + k.w) / 2 && o.y + o.h / 2 > k.y - k.h / 2 - 70))
    .filter((k) => !b.targets.some((t) => Math.abs(t.x - k.x) < k.w / 2 + 10 && t.y < k.y && t.y > k.y - 90))
    .sort((p, q) => p.y - q.y)
  const posts = SENTRY_SKIP.has(rank) ? 0 : Math.min(Math.max(sentries, roster.banner ? 1 : 0), roofs.length)
  for (let i = 0; i < posts; i++) {
    const k = roofs[i]
    // Le porte-étendard prend le plus haut toit : sa bannière se voit de loin.
    const type = roster.banner && i === 0 ? 'bannerman' : 'soldier'
    const t = TARGET_TYPES[type]
    const patrol = type === 'bannerman' || rank < 30 ? 0 : Math.max(0, Math.min(30, Math.floor(k.w / 2 - t.w / 2 - 8)))
    extra.push({ kind: 'target', type, x: k.x, y: k.y - k.h / 2 - t.h / 2 - 1, patrol, sentry: true })
  }
  // Pas de toit libre : le porte-étendard remplace le défenseur le plus haut du château.
  if (roster.banner && !posts) {
    const top = b.targets.filter((t) => t.type === 'soldier').sort((p, q) => p.y - q.y)[0]
    if (top) Object.assign(top, { type: 'bannerman', y: top.y + (TARGET_TYPES.soldier.h - TARGET_TYPES.bannerman.h) / 2, patrol: 0 })
  }
  // Rondes dans le château (v5.1) : un défenseur sur trois va et vient dans sa pièce.
  if (rank >= PATROL_INSIDE_FROM) {
    b.targets.forEach((t, i) => {
      if (t.type !== 'king' && (i + rank) % 3 === 0) t.patrol = 30
    })
  }
  for (const e of extra) {
    if (e.kind === 'target') {
      // La nuit, sentinelles et rondes portent une torche (veilleurs).
      const torch = roster.torches && (e.type === 'soldier' || e.type === 'scout') && (e.sentry || e.patrol > 0)
      b.targets.push({ type: e.type, x: Math.round(e.x), y: Math.round(e.y), patrol: e.patrol ?? 0, ...(torch || e.torch ? { torch: true } : {}), ...(e.raid ? { raid: e.raid } : {}) })
    } else b.barrels.push({ x: Math.round(e.x), y: Math.round(e.y) })
  }
  // Veilleurs : au moins un par nuit, et les rondes du château aussi.
  if (roster.torches) {
    for (const t of b.targets) if ((t.type === 'soldier' || t.type === 'scout') && t.patrol > 0) t.torch = true
    if (!b.targets.some((t) => t.torch)) {
      const first = b.targets.find((t) => t.type === 'soldier')
      if (first) first.torch = true
    }
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
