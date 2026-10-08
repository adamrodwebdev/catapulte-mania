import { MATERIALS } from '../entities/materials.js'
import { TARGET_TYPES } from '../entities/catalog.js'
import { deepFreeze } from '../../core/utils/Guard.js'

/** Barème des points. */
export const SCORE = deepFreeze({
  /** Bonus par tir non utilisé en fin de niveau. */
  SHOT_BONUS: 1000,
  /** Chaque destruction supplémentaire pendant le même tir augmente le multiplicateur. */
  CHAIN_STEP: 0.1,
  CHAIN_MAX: 2,
  BARREL: 100,
  /** Prime maximale d'une créature volante (voir Flyer.js). */
  FLYER_MAX: 400,
})

/** Points « bruts » de tout ce qui peut être détruit dans le niveau. */
export function destructibleValue(level) {
  const blocks = level.blocks.reduce((s, b) => s + MATERIALS[b.material].score, 0)
  const targets = level.targets.reduce((s, t) => s + TARGET_TYPES[t.type].score, 0)
  // Créatures volantes (v5.0) : comptées au maximum dans les blocs (garde-fou anti-triche).
  const flyers = (level.flyers?.length ?? 0) * SCORE.FLYER_MAX
  return { blocks: blocks + flyers, targets, barrels: level.barrels.length * SCORE.BARREL }
}

/** Score de référence : toutes les cibles + la moitié des blocs, en un seul tir. */
export function referenceScore(level) {
  const v = destructibleValue(level)
  return Math.round(v.targets + v.blocks * 0.5 + v.barrels + SCORE.SHOT_BONUS * (level.shots - 1))
}

/** Score maximal théoriquement atteignable (garde-fou anti-triche, volontairement large). */
export function maxScore(level) {
  const v = destructibleValue(level)
  return Math.ceil(((v.targets + v.blocks + v.barrels) * SCORE.CHAIN_MAX + SCORE.SHOT_BONUS * (level.shots + 2)) * 1.5)
}

/**
 * Nombre d'étoiles d'un niveau GAGNÉ selon le nombre de tirs utilisés (v3.1) :
 *  - 3 étoiles : victoire en `level.par` tirs (1, ou 2 pour les grands châteaux) ;
 *  - 2 étoiles : victoire en `level.star2` tirs au plus ;
 *  - 1 étoile  : victoire.
 * Fonction décroissante du nombre de tirs : le meilleur résultat (le moins de
 * tirs) donne toujours la meilleure note.
 * @param {{ par: number, star2: number }} level
 * @param {number} shotsUsed
 */
export function starsFor(level, shotsUsed) {
  if (shotsUsed <= level.par) return 3
  return shotsUsed <= level.star2 ? 2 : 1
}
