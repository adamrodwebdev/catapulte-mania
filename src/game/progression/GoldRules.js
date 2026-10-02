import { deepFreeze, Guard } from '../../core/utils/Guard.js'

/**
 * Barème de l'or (monnaie gagnée uniquement en jouant le mode histoire).
 *
 * v3.1 : l'or récompense la MAÎTRISE, plus la répétition.
 * - première victoire sur un niveau : FIRST_CLEAR
 * - chaque nouvelle étoile obtenue sur un niveau : PER_STAR (une seule fois)
 * - chaque nouveau succès décroché : PER_ACHIEVEMENT (une seule fois)
 * - victoire rejouée : REPLAY (petite somme)
 * - défaite : rien (pas d'or « farmé » en perdant exprès)
 *
 * Les plafonds servent au contrôle de cohérence des sauvegardes : l'or total
 * gagné ne peut pas dépasser ce que les parties enregistrées permettent.
 */
export const GOLD = deepFreeze({
  FIRST_CLEAR: 30,
  PER_STAR: 15,
  PER_ACHIEVEMENT: 25,
  REPLAY: 5,
  /** Plafond absolu du solde (garde-fou). */
  MAX_BALANCE: 1_000_000,
  /** Ancien barème (v2) : sert uniquement à contrôler l'or hérité des anciennes sauvegardes. */
  LEGACY_FIRST_CLEAR: 50,
  LEGACY_MAX_PER_WIN: 45,
})

/**
 * Or gagné pour une victoire.
 * @param {{ won: boolean }} result
 * @param {{ firstClear: boolean, newStars: number, newAchievements: number }} gains
 */
export function goldFor(result, { firstClear, newStars, newAchievements }) {
  if (!result.won) return 0
  Guard.int(newStars, 'newStars', { min: 0, max: 3 })
  Guard.int(newAchievements, 'newAchievements', { min: 0, max: 3 })
  return (firstClear ? GOLD.FIRST_CLEAR : GOLD.REPLAY) + newStars * GOLD.PER_STAR + newAchievements * GOLD.PER_ACHIEVEMENT
}

/**
 * Or maximal qu'un historique de parties peut avoir rapporté (barème actuel).
 * @param {Record<string, { attempts: number }>} levels niveaux réussis
 */
export function maxGoldFor(levels) {
  return Object.values(levels).reduce((sum, r) => sum + GOLD.FIRST_CLEAR + 3 * GOLD.PER_STAR + 3 * GOLD.PER_ACHIEVEMENT + r.attempts * GOLD.REPLAY, 0)
}

/** Or maximal selon l'ancien barème (sauvegardes v2 migrées). */
export function legacyMaxGoldFor(levels) {
  return Object.values(levels).reduce((sum, r) => sum + GOLD.LEGACY_FIRST_CLEAR + r.attempts * GOLD.LEGACY_MAX_PER_WIN, 0)
}
