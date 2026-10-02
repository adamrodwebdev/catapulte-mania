import { deepFreeze, Guard } from '../../core/utils/Guard.js'

/**
 * Barème de l'or (monnaie gagnée uniquement en jouant le mode histoire).
 *
 * - victoire : BASE + PER_STAR × étoiles
 * - première victoire sur un niveau : + FIRST_CLEAR
 * - défaite : rien (pas d'or « farmé » en perdant exprès)
 *
 * Les plafonds servent au contrôle de cohérence des sauvegardes : l'or total
 * gagné ne peut pas dépasser ce que les parties enregistrées permettent.
 */
export const GOLD = deepFreeze({
  BASE: 15,
  PER_STAR: 10,
  FIRST_CLEAR: 50,
  /** Or maximal d'une victoire hors bonus de première victoire. */
  MAX_PER_WIN: 15 + 10 * 3,
  /** Plafond absolu du solde (garde-fou). */
  MAX_BALANCE: 1_000_000,
})

/**
 * Or gagné pour un résultat.
 * @param {{ won: boolean, stars: number }} result
 * @param {boolean} firstClear
 */
export function goldFor(result, firstClear) {
  if (!result.won) return 0
  const stars = Guard.int(result.stars, 'stars', { min: 0, max: 3 })
  return GOLD.BASE + GOLD.PER_STAR * stars + (firstClear ? GOLD.FIRST_CLEAR : 0)
}

/**
 * Or maximal qu'un historique de parties peut avoir rapporté.
 * @param {Record<string, { attempts: number }>} levels niveaux réussis
 */
export function maxGoldFor(levels) {
  return Object.values(levels).reduce((sum, r) => sum + GOLD.FIRST_CLEAR + r.attempts * GOLD.MAX_PER_WIN, 0)
}
