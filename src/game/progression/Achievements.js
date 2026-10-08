import { deepFreeze, Guard } from '../../core/utils/Guard.js'

/**
 * Succès (façon Steam) : trois défis par niveau, en plus des étoiles.
 *
 * v3.2 : 18 défis répartis en trois familles, et chaque niveau en reçoit un
 * de chaque famille :
 *  - STYLE   : une contrainte sur la façon de jouer (sans boulet spécial,
 *              sans pouvoir, en peu de tirs, au tout dernier tir…) ;
 *  - EXPLOIT : un geste d'adresse (plusieurs cibles d'un coup, réaction en
 *              chaîne, tout raser ou au contraire presque tout épargner…) ;
 *  - THÈME   : une idée propre au niveau (barils, roi, feu, chutes,
 *              éboulements, explosions…).
 * Le choix tourne d'un niveau à l'autre pour varier les trios, et les seuils
 * montent avec la progression : la chaîne demandée passe de 6 à 14
 * destructions, le « Carton » de 2 à 4 cibles d'un même tir, etc.
 *
 * Leur position (0, 1, 2) correspond au bit enregistré dans la sauvegarde
 * (masque 0..7). Ils sont évalués par le moteur de score à la fin d'une partie
 * GAGNÉE, à partir de statistiques qu'il a lui-même comptées : rien n'est
 * déclaré par l'interface.
 */

/** Sol du décor (voir physics/constants.js) : sert à repérer les cibles perchées. */
const GROUND_Y = 900

const specials = (l) => Object.values(l.ammo || {}).reduce((a, b) => a + b, 0)
const perched = (l) => l.targets.filter((t) => t.y < GROUND_Y - 140).length
const hasKing = (l) => l.targets.some((t) => t.type === 'king') && l.targets.length > 1
/** Blocs du château (la roche du décor ne compte pas). */
const built = (l) => l.blocks.filter((b) => b.material !== 'rock')
const flammable = (l) => built(l).filter((b) => b.material === 'wood' || b.material === 'straw').length / Math.max(1, built(l).length)

/** Seuils qui montent avec la progression (id de 1 à 100). */
export const SCALE = Object.freeze({
  chain: (l) => 6 + Math.floor(l.id / 12),
  carton: (l) => Math.min(l.targets.length - 1, l.id < 35 ? 2 : l.id < 70 ? 3 : 4),
  frugal: (l) => Math.max(1, Math.floor(l.shots / 2)),
  demolish: (l) => Math.round(40 + (20 * l.id) / 100),
  surgeon: (l) => Math.round(25 - (10 * l.id) / 100),
  opening: (l) => Math.ceil(l.targets.length / 2),
})

/**
 * Définition des succès.
 *  - family   : 'style' | 'feat' | 'theme'
 *  - eligible : le défi a-t-il un sens dans ce niveau ?
 *  - test     : réussi ? (statistiques de la partie, niveau)
 *  - params   : valeurs affichées dans la description
 */
export const ACHIEVEMENTS = deepFreeze({
  // --- Style ---
  pure: { family: 'style', icon: 'target', eligible: (l) => specials(l) > 0, test: (r) => r.specialsUsed === 0 },
  humble: { family: 'style', icon: 'users', eligible: (l) => l.id >= 6, test: (r) => r.powersUsed === 0 },
  frugal: { family: 'style', icon: 'map', eligible: (l) => l.shots >= 3, test: (r, l) => r.shotsUsed <= SCALE.frugal(l), params: (l) => ({ n: SCALE.frugal(l) }) },
  sparing: { family: 'style', icon: 'volley', eligible: (l) => specials(l) >= 3, test: (r) => r.specialsUsed <= 1 },
  lastStand: { family: 'style', icon: 'shot', eligible: (l) => l.shots >= 3, test: (r) => r.shotsLeft === 0 && r.shotsUsed > 0 },
  stoic: { family: 'style', icon: 'wind', eligible: (l) => l.wind >= 0.4 && l.id >= 6, test: (r) => r.powersUsed === 0 && r.specialsUsed === 0 },

  // --- Exploit ---
  chain: { family: 'feat', icon: 'volley', eligible: () => true, test: (r, l) => r.maxChain >= SCALE.chain(l), params: (l) => ({ n: SCALE.chain(l) }) },
  carton: { family: 'feat', icon: 'target', eligible: (l) => l.targets.length >= 3, test: (r, l) => r.maxShotKills >= SCALE.carton(l), params: (l) => ({ n: SCALE.carton(l) }) },
  opening: { family: 'feat', icon: 'flame', eligible: (l) => l.targets.length >= 4, test: (r, l) => r.firstShotKills >= SCALE.opening(l), params: (l) => ({ n: SCALE.opening(l) }) },
  clean: { family: 'feat', icon: 'crown', eligible: (l) => l.par >= 2, test: (r, l) => r.maxShotKills >= l.targets.length },
  demolisher: { family: 'feat', icon: 'fist', eligible: (l) => built(l).length >= 8, test: (r, l) => r.blocksDestroyed * 100 >= built(l).length * SCALE.demolish(l), params: (l) => ({ n: SCALE.demolish(l) }) },
  surgeon: { family: 'feat', icon: 'help', eligible: (l) => built(l).length >= 14, test: (r, l) => r.blocksDestroyed * 100 <= built(l).length * SCALE.surgeon(l), params: (l) => ({ n: SCALE.surgeon(l) }) },

  // --- Thème ---
  powder: { family: 'theme', icon: 'bomb', eligible: (l) => l.barrels.length > 0, test: (r, l) => r.barrelsExploded >= l.barrels.length },
  regicide: { family: 'theme', icon: 'crown', eligible: hasKing, test: (r) => r.firstKill === 'king' },
  // Le feu est disponible presque partout depuis la v5.0 : le défi vise les niveaux pensés pour lui.
  pyro: { family: 'theme', icon: 'flame', eligible: (l) => (l.ammo?.fire ?? 0) >= 2 || (l.id > 16 && flammable(l) >= 0.4), test: (r) => r.kills.fire >= 2 },
  artificer: { family: 'theme', icon: 'bomb', eligible: (l) => Boolean(l.ammo?.bomb) || l.barrels.length > 0, test: (r) => r.kills.explosion >= 2 },
  landslide: { family: 'theme', icon: 'quake', eligible: (l) => l.targets.length >= 3, test: (r) => r.kills.crush >= 2 },
  freefall: { family: 'theme', icon: 'star', eligible: (l) => perched(l) >= 2, test: (r) => r.kills.fall >= 1 },
  // v5.0 : créatures volantes, vapeur, terrains.
  skyhunter: { family: 'theme', icon: 'meteor', eligible: (l) => (l.flyers?.length ?? 0) > 0, test: (r, l) => r.flyersDown >= l.flyers.length },
  thermal: { family: 'theme', icon: 'snowflake', eligible: (l) => (l.ammo?.frost ?? 0) >= 2, test: (r) => r.kills.steam >= 1 },
  drowned: { family: 'theme', icon: 'map', eligible: (l) => Boolean(l.zones?.some((z) => z.kind === 'lake' || z.kind === 'lava')), test: (r) => r.kills.terrain >= 1 },
})

/** Les trois familles, dans l'ordre des trois succès d'un niveau. */
const FAMILIES = Object.freeze(['style', 'feat', 'theme'])
/** Défis de thème propres au niveau (roi, feu) : prioritaires. Les barils, désormais fréquents (v4.6), entrent dans le tirage commun. */
const SPECIFIC = Object.freeze(['regicide', 'pyro', 'skyhunter', 'thermal'])

/**
 * @typedef {{ shotsUsed: number, shotsLeft: number, specialsUsed: number, powersUsed: number,
 *   barrelsExploded: number, blocksDestroyed: number, maxChain: number, maxShotKills: number,
 *   firstShotKills: number, firstKill: string | null,
 *   kills: { fire: number, explosion: number, crush: number, fall: number } }} RunStats
 */

/** Statistiques vides (début de partie). */
export function emptyRun() {
  return { specialsUsed: 0, maxChain: 0, maxShotKills: 0, firstShotKills: 0, firstKill: null, flyersDown: 0, kills: { fire: 0, explosion: 0, crush: 0, fall: 0, steam: 0, terrain: 0 } }
}

/** Regroupe les causes de mort du moteur physique en familles de succès. */
export function killFamily(cause) {
  if (cause === 'fire') return 'fire'
  if (cause === 'explosion' || cause === 'lightning') return 'explosion'
  if (cause === 'scald') return 'steam'
  if (cause === 'drown' || cause === 'burn') return 'terrain'
  if (cause === 'crush' || cause === 'pinned' || cause === 'squeezed') return 'crush'
  if (cause === 'fall' || cause === 'knockout') return 'fall'
  return null
}

/**
 * Les trois succès d'un niveau : un par famille, choisis parmi ceux qui ont un
 * sens ici, en tournant d'un niveau à l'autre pour varier les défis.
 * @param {{ id: number, ammo: object, barrels: any[], targets: { type: string, y: number }[], blocks: any[], shots: number, par: number, wind: number }} level
 * @returns {string[]}
 */
export function achievementsFor(level) {
  const picked = []
  const ids = Object.keys(ACHIEVEMENTS)
  FAMILIES.forEach((family, f) => {
    const usable = (fam) => ids.filter((id) => (!fam || ACHIEVEMENTS[id].family === fam) && !picked.includes(id) && ACHIEVEMENTS[id].eligible(level))
    let pool = usable(family)
    // Thème : ce qui est propre au niveau (barils, roi, feu) passe avant le générique.
    if (family === 'theme' && pool.some((id) => SPECIFIC.includes(id))) pool = pool.filter((id) => SPECIFIC.includes(id))
    // Repli : n'importe quel défi encore libre qui s'applique ici.
    if (!pool.length) pool = usable(null)
    // Choix pseudo-aléatoire mais fixe (hachage du numéro de niveau) : les défis
    // varient d'un niveau à l'autre et restent les mêmes d'une partie à l'autre.
    const h = (Math.imul(level.id * 31 + f * 101 + 7, 2654435761) >>> 0) >>> 8
    picked.push(pool[h % pool.length])
  })
  return picked
}

/**
 * Masque des succès obtenus (bit i = i-ème succès du niveau).
 * @param {object} level niveau (avec `achievements`)
 * @param {RunStats} run
 */
export function evaluateAchievements(level, run) {
  return level.achievements.reduce((mask, id, i) => (ACHIEVEMENTS[id].test(run, level) ? mask | (1 << i) : mask), 0)
}

/** Nombre de bits à 1 d'un masque de succès (0..3). */
export function countAchievements(mask) {
  Guard.int(mask, 'achievements', { min: 0, max: 7 })
  return (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1)
}

/** Paramètres d'affichage d'un succès (seuil…) pour la traduction. */
export function achievementParams(id, level) {
  return ACHIEVEMENTS[id].params?.(level) ?? {}
}
