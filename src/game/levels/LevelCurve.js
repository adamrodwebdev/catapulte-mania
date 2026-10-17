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
 *    murs, à mesure que l'on avance ;
 *  - AILES (v6.2) : une annexe de caractère accolée au château, deux à partir
 *    du niveau 40 (remise de paille, bastion de glace, poudrière, galerie de
 *    verre, casemate de fer, baril perché). Chacune appelle son outil : le
 *    château n'est plus symétrique, tout l'arsenal sert. Elle abrite un des
 *    gardes (autant de défenseurs qu'avant) et se prend aussi à la pierre.
 *
 * Tout est déterministe (même niveau ⇒ même château) et validé ensuite par le
 * schéma du niveau, puis par scripts/check-levels.mjs (stabilité, faisabilité).
 *
 * v6.2 : ce module ne garde que l'algorithme de placement ; les règles de la
 * courbe (selon le rang) sont dans campaignRules.js, les plans des ailes dans
 * wingBlueprints.js.
 */
import { WORLD } from '../physics/constants.js'
import { TARGET_TYPES } from '../entities/catalog.js'
import {
  MAX_RIGHT, BARREL, SPIRE, ROCK_MAX_W, SENTRY_SKIP, GUARDS_FRONT, REACH_RIGHT, REAR_SHELTERED, FIELD_LEFT, MOUNTAIN_LEFT, GATE_GUARD_FROM, KEG_AT_GATE, PATROL_FROM, PATROL_INSIDE_FROM, AMBUSH, RAIDER_TYPE, raiderTorch,
  wingsFor, distanceFor, plateauFor, ogresFor, rosterFor, raidFor, garrisonFor, terrainFor,
} from './campaignRules.js'
import { WING_BUILDERS } from './wingBlueprints.js'

// Règles de la courbe, toujours publiées ici (v6.2 : définies dans campaignRules.js).
export {
  SPIRE, WINGS, GATE_GUARD_FROM, PATROL_FROM, PATROL_INSIDE_FROM, RAIDS, AMBUSH, RAIDER_TYPE, AMMO_UNLOCK,
  wingsFor, distanceFor, plateauFor, ogresFor, rosterFor, raidFor, garrisonFor, ammoFor, terrainFor,
} from './campaignRules.js'

const G = WORLD.GROUND_Y

/** Matériau qui occupe le plus de surface dans le château (hors roche). */
function dominantMaterial(blocks) {
  const area = {}
  for (const k of blocks) if (k.material !== 'rock') area[k.material] = (area[k.material] ?? 0) + k.w * k.h
  return Object.entries(area).sort((p, q) => q[1] - p[1])[0]?.[0] ?? 'wood'
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
export function applyCurve(b, rank, { heroic = false } = {}) {
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
  // Aiguille de roche derrière le château (v6.2) : voir plus bas.
  let rearSpire = false
  // Emplacement libre au niveau du château, au plus près ; null s'il n'y en a plus
  // (v6.2 : on renonçait au bout de 480 px en rendant une place déjà prise).
  const slot = (side, w, { guard = false } = {}) => {
    let x = side < 0 ? castle.left - w / 2 - 10 : castle.right + w / 2 + 10
    for (let i = 0; i < 120 && !free(x, w); i++) x += side * 12
    // Trop loin derrière le château (hors de portée du trébuchet), ou à l'abri de
    // tout tir (un défenseur, v6.1) : devant, alors.
    if (side > 0 && ((GUARDS_FRONT.has(rank) && x + w / 2 > REACH_RIGHT) || (guard && REAR_SHELTERED.has(rank)))) return slot(-1, w, { guard })
    // Derrière l'aiguille de roche (v6.2), un défenseur s'abriterait de toute pierre :
    // la roche tient l'arrière, personne ne s'y poste.
    if (side > 0 && guard && rearSpire) return null
    // Jamais sur le camp de l'engin, ni hors du monde.
    if (!free(x, w) || x - w / 2 < FIELD_LEFT + 60 || x + w / 2 > MAX_RIGHT) return null
    take(x, w)
    return x
  }
  const extra = []
  // Le tablier d'un pont-levis s'abat vers l'engin : aucune aile là où il tombe
  // (les gardes, eux, peuvent s'y tenir : c'est tout l'intérêt du pont-levis).
  const landing = (b.hinges ?? []).map((h) => {
    const hx = h.b.x + h.dx
    return { l: hx - h.b.h - 16, r: hx }
  })
  occupied.push(...landing)
  // Aiguille de roche, au plus près des murs : le baril qui tombe (ou explose)
  // atteint le donjon. v6.2 : posée avant les ailes (l'aile arrière l'éloignait du
  // donjon). La roche ne tombe jamais : un défenseur derrière elle s'y mettait à
  // l'abri de toute pierre (il s'y réfugie même quand un tir arrive sur lui).
  // Elle tient donc l'arrière : personne ne s'y poste (l'aile arrière, dont le
  // garde la quitterait, passe devant), et rien dans son ombre : des barils, au-delà.
  let spireRock = null
  if (spire) {
    const castleTop = Math.min(...b.blocks.map((k) => k.y - k.h / 2))
    const h = Math.max(120, Math.min(320, Math.round((surface - castleTop) * 0.6)))
    const x = slot(1, SPIRE.W)
    if (x !== null) {
      spireRock = { material: 'rock', x, y: surface - h / 2, w: SPIRE.W, h, shape: 'rect' }
      extra.push({ kind: 'barrel', x, y: surface - h - BARREL.h / 2 - 1 })
      occupied.push({ l: x + SPIRE.W / 2, r: x + SPIRE.W / 2 + Math.round(h * SPIRE.SHADOW) })
      rearSpire = x > castle.right
    }
  }
  // Ailes (v6.2) : accolées au château, devant (la seconde derrière, si on l'atteint).
  // Chacune abrite un des gardes : autant de défenseurs qu'avant.
  const wings = wingsFor(rank, dominantMaterial(b.blocks))
  let wingGuards = 0
  wings.forEach((wing, k) => {
    let side = k === 0 ? -1 : 1
    let x = side > 0 && !REAR_SHELTERED.has(rank) && !rearSpire ? slot(side, wing.w) : null
    if (side > 0 && x !== null && x + wing.w / 2 > REACH_RIGHT) {
      occupied.pop()
      x = null
    }
    if (x === null) {
      side = -1
      x = slot(side, wing.w)
    }
    if (x === null) return
    const type = rank >= 40 && k === 1 ? 'knight' : 'soldier'
    // Baril perché : son garde se tient au pied du mur, côté château.
    const guard = WING_BUILDERS[wing.id](b, x, surface, type, side)
    if (guard) extra.push({ kind: 'target', type, ...guard })
    wingGuards++
  })
  for (const zone of landing) occupied.splice(occupied.indexOf(zone), 1)
  const roster = rosterFor(rank)
  // Garde de la porte (v5.8) : dès le niveau 19, le premier garde posté devant
  // les murs est un pavoisier (son pavois arrête les tirs tendus).
  const special = (type, side, patrol, more = {}) => {
    const t = TARGET_TYPES[type]
    const x = slot(side, t.w, { guard: true })
    if (x !== null) extra.push({ kind: 'target', type, x, y: surface - t.h / 2 - 1, patrol, ...more })
  }
  const gateGuard = rank >= GATE_GUARD_FROM && roster.shields === 0
  for (let i = 0; i < roster.shields + (gateGuard ? 1 : 0); i++) special('shieldbearer', -1, 0)
  let replaced = gateGuard ? 1 : 0
  // Gardes : d'abord à l'abri derrière les murs, puis devant.
  const ogres = ogresFor(rank)
  for (let i = 0; i < guards - wingGuards; i++) {
    // Chevaliers en armure parmi les gardes dès le niveau 15 (un sur deux) ;
    // ogres (v5.1) devant les murs, à la place des premiers gardes postés devant.
    let type = (rank >= 40 && i === guards - 1) || (rank >= 15 && i % 2 === 1) ? 'knight' : 'soldier'
    if (i % 2 === 1 && Math.floor(i / 2) < ogres) type = 'ogre'
    if (i % 2 === 1 && type !== 'ogre' && replaced > 0) {
      replaced--
      continue
    }
    const t = TARGET_TYPES[type]
    const x = slot(i % 2 === 0 ? 1 : -1, t.w, { guard: true })
    if (x === null) continue
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
    if (side > 0 && (x === null || x + BARREL.w / 2 > REACH_RIGHT)) {
      if (x !== null) occupied.pop()
      x = slot(-1, BARREL.w)
    }
    if (x === null) continue
    extra.push({ kind: 'barrel', x, y: surface - BARREL.h / 2 - 1 })
  }
  // Pillards (v5.8) : postés devant, au plus loin, après les barils (rien ne leur
  // barre la route ; le terrain, eux, le franchissent : ponts et échelles).
  // Embusqués (v6.2) : placés dans le champ une fois le terrain connu (étape 5).
  const ambush = []
  for (const raid of raidFor(rank, { heroic })) {
    if (AMBUSH.has(rank)) ambush.push(raid)
    else special(RAIDER_TYPE[raid], -1, 0, { raid, torch: raiderTorch(raid) })
  }
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
  // Embuscade (v6.2) : dans le champ, devant la montagne et les douves, à bonne distance de l'engin.
  ambush.forEach((raid, i) => {
    const type = RAIDER_TYPE[raid]
    const t = TARGET_TYPES[type]
    const stop = Math.min(front, ...zones.map((z) => z.x0), ...rocks.filter((r) => r.shape === 'triangle' && r.x < front).map((r) => r.x - r.w / 2))
    const x = Math.max(FIELD_LEFT, stop - 90 - i * 40)
    b.targets.push({ type, x: Math.round(x), y: Math.round(G - t.h / 2 - 1), patrol: 0, raid, ...(raiderTorch(raid) ? { torch: true } : {}) })
  })
  // La roche passe en premier : elle est posée avant le château.
  b.blocks.unshift(...rocks)
  for (const k of b.blocks) {
    k.x = Math.round(k.x * 10) / 10
    k.y = Math.round(k.y * 10) / 10
  }
  return { dx, plateau: ph, terrain: t }
}
