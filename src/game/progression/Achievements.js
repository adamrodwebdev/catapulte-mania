import { deepFreeze, Guard } from '../../core/utils/Guard.js'

/**
 * Succès (façon Steam) : trois défis par niveau, en plus des étoiles.
 *
 * Chaque niveau reçoit trois succès choisis selon son contenu (munitions
 * spéciales, barils, roi, feu…), toujours dans le même ordre : leur position
 * (0, 1, 2) correspond au bit enregistré dans la sauvegarde (masque 0..7).
 * Les succès se cumulent d'une partie à l'autre : on peut décrocher « Puriste »
 * en ne tirant que des pierres, puis « Pyromane » lors d'une autre partie.
 *
 * Ils sont évalués par le moteur de score à la fin d'une partie GAGNÉE, à partir
 * de statistiques qu'il a lui-même comptées : rien n'est déclaré par l'interface.
 */

/** Seuil de destructions en un seul tir pour « Réaction en chaîne ». */
export const CHAIN_GOAL = 8
/** Tirs maximum pour « Économe » : la moitié des tirs du niveau. */
const frugalShots = (l) => Math.max(1, Math.floor(l.shots / 2))
/** Part des blocs à détruire pour « Démolisseur ». */
export const DEMOLISH_SHARE = 0.5

/**
 * Définition des succès. `test(run, level)` reçoit les statistiques de la partie.
 * @type {Record<string, { icon: string, test: (run: RunStats, level: object) => boolean, params?: (level: object) => object }>}
 */
export const ACHIEVEMENTS = deepFreeze({
  // Aucun boulet spécial tiré (pierres seulement).
  pure: { icon: 'target', test: (r) => r.specialsUsed === 0 },
  // Gagner en utilisant au plus la moitié des tirs du niveau.
  frugal: { icon: 'map', test: (r, l) => r.shotsUsed <= frugalShots(l), params: (l) => ({ n: frugalShots(l) }) },
  // Tous les barils explosent.
  powder: { icon: 'flame', test: (r, l) => r.barrelsExploded >= l.barrels.length },
  // Le roi tombe avant tous ses gardes.
  regicide: { icon: 'crown', test: (r) => r.firstKill === 'king' },
  // Au moins N destructions pendant un même tir.
  chain: { icon: 'volley', test: (r) => r.maxChain >= CHAIN_GOAL, params: () => ({ n: CHAIN_GOAL }) },
  // Une cible au moins succombe au feu.
  pyro: { icon: 'flame', test: (r) => r.fireKills > 0 },
  // Détruire au moins la moitié des blocs du château.
  demolisher: { icon: 'fist', test: (r, l) => r.blocksDestroyed >= Math.ceil(l.blocks.length * DEMOLISH_SHARE), params: () => ({ n: Math.round(DEMOLISH_SHARE * 100) }) },
  // Aucun pouvoir spécial utilisé.
  humble: { icon: 'users', test: (r) => r.powersUsed === 0 },
})

/**
 * @typedef {{ shotsUsed: number, specialsUsed: number, powersUsed: number, barrelsExploded: number,
 *   blocksDestroyed: number, maxChain: number, fireKills: number, firstKill: string | null }} RunStats
 */

/**
 * Les trois succès d'un niveau, selon son contenu.
 * @param {{ ammo: object, barrels: any[], targets: { type: string }[], shots: number }} level
 * @returns {string[]}
 */
export function achievementsFor(level) {
  const ammo = Object.keys(level.ammo || {})
  const a = ammo.length ? 'pure' : 'frugal'
  const hasKing = level.targets.some((t) => t.type === 'king') && level.targets.length > 1
  const b = level.barrels.length ? 'powder' : hasKing ? 'regicide' : 'chain'
  const c = ammo.includes('fire') ? 'pyro' : a === 'frugal' ? 'demolisher' : level.targets.length >= 4 ? 'demolisher' : 'humble'
  return [a, b, c]
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
