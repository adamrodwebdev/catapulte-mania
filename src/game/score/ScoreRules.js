import { MATERIALS } from '../entities/materials.js'
import { TARGET_TYPES } from '../entities/Target.js'
import { deepFreeze } from '../../core/utils/Guard.js'

/** Barème des points. */
export const SCORE = deepFreeze({
  /** Bonus par tir non utilisé en fin de niveau. */
  SHOT_BONUS: 1000,
  /** Chaque destruction supplémentaire pendant le même tir augmente le multiplicateur. */
  CHAIN_STEP: 0.1,
  CHAIN_MAX: 2,
  BARREL: 100,
  /** Seuils d'étoiles (fraction du score de référence). */
  STAR_2: 0.55,
  STAR_3: 0.85,
})

/** Points « bruts » de tout ce qui peut être détruit dans le niveau. */
export function destructibleValue(level) {
  const blocks = level.blocks.reduce((s, b) => s + MATERIALS[b.material].score, 0)
  const targets = level.targets.reduce((s, t) => s + TARGET_TYPES[t.type].score, 0)
  return { blocks, targets, barrels: level.barrels.length * SCORE.BARREL }
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
 * Nombre d'étoiles d'un niveau GAGNÉ selon le score.
 * Fonction croissante du score : la meilleure note correspond toujours au meilleur score.
 */
export function starsFor(level, score) {
  const ref = referenceScore(level)
  return 1 + (score >= ref * SCORE.STAR_2 ? 1 : 0) + (score >= ref * SCORE.STAR_3 ? 1 : 0)
}
