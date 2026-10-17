/**
 * Règles de la campagne (v4.6 ; v6.2 : séparées de l'algorithme de placement,
 * LevelCurve.js) : ce que contient chaque niveau selon son rang (1 à 100) —
 * recul et plateau, garnison et défenseurs spéciaux, pillards, ailes, munitions,
 * terrains — et les bornes du placement. Données et fonctions pures, sans dessin.
 */
import { WORLD } from '../physics/constants.js'
import { HEROIC } from '../progression/Mastery.js'

/** Le château ne recule jamais au-delà (la catapulte doit pouvoir l'atteindre). */
export const MAX_RIGHT = WORLD.WIDTH - 40
export const BARREL = Object.freeze({ w: 34, h: 42 })
/**
 * Aiguille de roche derrière le château (un niveau sur trois à partir du 57) :
 * largeur, et ombre (part de sa hauteur, v6.2). Une pierre qui la frôle ne
 * retombe qu'à cette distance derrière elle (descente de 55° environ, la plus
 * raide qui porte jusque-là depuis l'engin) : un défenseur posté plus près
 * restait hors d'atteinte (relevé par scripts/check-levels.mjs --ammo stone).
 */
export const SPIRE = Object.freeze({ W: 48, SHADOW: 0.65 })
/** Largeur maximale d'un bloc de roche (au-delà, le plateau est découpé). */
export const ROCK_MAX_W = 560
/**
 * Niveaux sans sentinelle sur le toit : leur toit oscille en se mettant en place
 * et la sentinelle tomberait seule (relevé par scripts/check-levels.mjs).
 */
export const SENTRY_SKIP = new Set([28, 68])
/**
 * Niveaux où un garde posé derrière le château serait hors de portée du
 * trébuchet (au-delà de REACH_RIGHT) : il se poste devant (relevé par
 * scripts/check-levels.mjs --engine trebuchet).
 */
export const GUARDS_FRONT = new Set([66, 99])
export const REACH_RIGHT = WORLD.WIDTH - 340
/**
 * Niveaux en escalier (v6.1) : le dernier gradin, le plus haut, abrite la place
 * derrière le château, qu'aucun tir n'atteint. Un garde posté là ne mourait que
 * de l'effondrement ; avec ses points de vie, il y survit : il se poste devant
 * (relevé par scripts/check-levels.mjs). v6.2 : l'escalier d'honneur (96) aussi.
 */
export const REAR_SHELTERED = new Set([78, 96])
/**
 * Niveaux sans aiguille de roche (v6.2) : l'escalier d'honneur (96). Collée à sa
 * plus haute tour, posée sur le plateau, l'aiguille la calait : la pierre ne la
 * renversait plus, et le roi, à son sommet, est hors de portée d'un tir direct.
 */
export const SPIRE_SKIP = new Set([96])
/**
 * Ailes (v6.2) : l'annexe, le niveau où elle apparaît (avec la munition qui la
 * défait), et le matériau qu'elle évite (un château déjà de ce matériau en
 * reçoit une autre). Largeur réservée au sol (px).
 */
export const WINGS = Object.freeze([
  Object.freeze({ id: 'straw', from: 6, avoid: ['straw', 'wood'], w: 86 }),
  Object.freeze({ id: 'ice', from: 8, avoid: ['ice'], w: 78 }),
  Object.freeze({ id: 'powder', from: 11, avoid: [], w: 96 }),
  Object.freeze({ id: 'glass', from: 15, avoid: ['glass'], w: 96 }),
  Object.freeze({ id: 'iron', from: 23, avoid: ['iron'], w: 64 }),
  Object.freeze({ id: 'perch', from: 30, avoid: [], w: 86 }),
])
/** Niveaux de tutoriel (munitions, pouvoirs, trébuchet) : une seule idée à la fois, pas d'aile. */
export const QUIET = new Set([1, 2, 3, 4, 5, 6, 7, 9, 10, 12, 14, 16, 20, 22, 25, 29, 31, 37])
/** Une seconde aile à partir de ce niveau. */
export const TWO_WINGS_FROM = 40

/**
 * Ailes du niveau (v6.2) : celles déjà présentées, qui contrastent avec le
 * matériau dominant du château, choisies selon le rang (déterministe).
 * @param {number} rank
 * @param {string} dominant matériau dominant du château
 * @returns {Array<typeof WINGS[number]>}
 */
export function wingsFor(rank, dominant) {
  if (QUIET.has(rank)) return []
  const open = WINGS.filter((w) => rank >= w.from && !w.avoid.includes(dominant))
  if (!open.length) return []
  const n = rank >= TWO_WINGS_FROM ? 2 : 1
  const out = []
  for (let k = 0; k < n && k < open.length; k++) out.push(open[(rank * 5 + k * 3) % open.length])
  return out[1] === out[0] ? out.slice(0, 1) : out
}

/** Les terrains commencent au-delà de cette abscisse (la catapulte reste sur la terre ferme). */
export const FIELD_LEFT = 480
/** Pied gauche minimal d'une montagne. */
export const MOUNTAIN_LEFT = 380

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

/**
 * Jauge de destruction (v6.0) : chaque bloc abattu la remplit de sa valeur ;
 * à la moitié du château (SHARE), une pierre de plus, une par étape, à partir
 * du niveau FROM_LEVEL. Elle évite une défaite, mais ne compte jamais pour les étoiles.
 */
export const GAUGE = Object.freeze({ SHARE: 0.5, FROM_LEVEL: 6 })

/**
 * La jauge est-elle déjà présentée ? Dès le niveau FROM_LEVEL de la campagne
 * (et de la Campagne héroïque), toujours dans les Terres du Duc (v6.2 : leurs
 * numéros, 1 à 5, la coupaient).
 */
export function gaugeTaught(level) {
  return level.track === 'duke' || (level.id ?? 0) >= GAUGE.FROM_LEVEL
}

/** Garde de la porte (v5.8) : dès ce niveau, un pavoisier tient la porte et les barils passent derrière le château. */
export const GATE_GUARD_FROM = 19
/**
 * Exceptions : niveaux dont le baril de devant est la pièce maîtresse (il lance
 * les dominos de fer du 85). Relevé par check:levels : sans lui, le niveau
 * n'était plus faisable en Difficile.
 */
export const KEG_AT_GATE = new Set([85])

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
 * ceux qui sont dessus tombent.
 *
 * v6.2 : la marche sur chaque général. Les trois niveaux qui mènent à un
 * boss, boss compris (8 à 10, 18 à 20… 98 à 100), ont toujours leurs
 * pillards : la pression monte jusqu'au grand siège.
 *
 *  présenter   8   une torche, embusquée dans le champ (voir AMBUSH), avec les premiers seaux d'eau
 *              9   le pont sur un lac        20  l'échelle par-dessus une montagne
 *              36  le saboteur au marteau
 *              71  le pot de givre (hiver)   95  l'ogre qui charge
 *  développer  17, 18, 19, 22, 28, 29, 30, 32, 34, 37 (descente d'un plateau), 39,
 *              42, 45 (pont sur la lave), 48, 49, 51, 55, 58, 59, 63, 68, 69,
 *              72 (pont sur la glace), 77, 78, 79, 82, 84, 85, 88, 89…
 *  retourner   38  pont sur la lave ET échelle sur la montagne
 *              46  torche et saboteur ensemble ; 98 l'ogre par-dessus la montagne
 *  finales     40, 50, 60, 90 : deux torches à la fois ; 70 : torche et saboteur ;
 *              80 : deux pots de givre ; 99 : torche et saboteur ; 100 : deux torches et l'ogre
 */
export const RAIDS = Object.freeze({
  8: ['fire'],
  9: ['fire'],
  10: ['fire'],
  17: ['fire'],
  18: ['fire'],
  19: ['fire'],
  20: ['fire'],
  22: ['fire'],
  28: ['fire'],
  29: ['fire'],
  30: ['fire'],
  32: ['fire'],
  34: ['fire'],
  36: ['blow'],
  37: ['fire'],
  38: ['fire'],
  39: ['blow'],
  40: ['fire', 'fire'],
  42: ['fire'],
  45: ['fire'],
  46: ['fire', 'blow'],
  48: ['fire'],
  49: ['blow'],
  50: ['fire', 'fire'],
  51: ['fire'],
  55: ['fire'],
  57: ['blow'],
  58: ['fire'],
  59: ['fire'],
  60: ['fire', 'fire'],
  63: ['fire'],
  68: ['blow'],
  69: ['fire'],
  70: ['fire', 'blow'],
  71: ['frost'],
  72: ['frost'],
  76: ['blow'],
  77: ['frost'],
  78: ['frost'],
  79: ['fire'],
  80: ['frost', 'frost'],
  81: ['blow'],
  82: ['fire'],
  84: ['fire'],
  85: ['fire'],
  88: ['blow'],
  89: ['fire'],
  90: ['fire', 'fire'],
  95: ['smash'],
  98: ['smash'],
  99: ['fire', 'blow'],
  100: ['fire', 'fire', 'smash'],
})

/**
 * Premier pillard de la campagne (v6.2) : il n'attend pas au pied du château
 * mais embusqué dans le champ, de ce côté-ci de la montagne et des douves. Il
 * jaillit au premier tir et court droit sur l'engin : une seule idée (le
 * pillard et le seau d'eau), sans pont ni échelle à comprendre en même temps.
 */
export const AMBUSH = Object.freeze(new Set([8]))

/**
 * Pillards du niveau. Campagne héroïque (v6.2) : un de plus dès HEROIC.RAID_FROM
 * (de givre en hiver), trois au plus.
 * @returns {('fire' | 'frost' | 'blow' | 'smash')[]}
 */
export function raidFor(rank, { heroic = false } = {}) {
  const base = RAIDS[rank] ?? []
  if (!heroic || rank < HEROIC.RAID_FROM) return base
  return [...base, Math.ceil(rank / 10) === 8 ? 'frost' : 'fire'].slice(0, HEROIC.MAX_RAIDERS)
}

/** Type du pillard selon ce qu'il porte. */
export const RAIDER_TYPE = Object.freeze({ fire: 'scout', frost: 'scout', blow: 'engineer', smash: 'ogre' })

/**
 * Le pillard qui porte le feu brandit une torche (elle met le feu là où il
 * tombe) : niveaux, Terres du Duc et renforts des généraux (v6.2 : une seule
 * règle ; les renforts n'en avaient pas).
 */
export function raiderTorch(raid) {
  return raid === 'fire'
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
    spire: rank >= 57 && rank % 3 === 0 && !SPIRE_SKIP.has(rank),
  }
}

/**
 * Munitions (v5.0) : chaque munition se débloque tôt dans la campagne (rang du
 * niveau) et reste ensuite disponible au moins en un exemplaire.
 */
// v6.1 : orbe d'orage (chevaliers et fer, niveau 22), botte de paille (barils perchés, 29), pot de poison (37).
export const AMMO_UNLOCK = Object.freeze({ fire: 3, boulder: 5, frost: 7, bomb: 10, split: 14, thunder: 22, bale: 29, poison: 37 })

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
