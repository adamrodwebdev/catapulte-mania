/**
 * Le front de la campagne (v6.0) : les défaites d'affilée au premier niveau
 * pas encore réussi (champ `frontier` de la sauvegarde). Elles ouvrent un coup
 * de pouce discret (premier chapitre), puis le droit de passer le niveau.
 * Règles seules : SaveSlot compte les défaites, ce module dit ce qu'elles valent.
 */

/** Défaites d'affilée après lesquelles on peut passer un niveau (v6.0). */
export const SKIP_AFTER = 3

/** Coup de pouce discret du premier chapitre : à partir de 2 défaites, +10 % par défaite, au plus 30 %. */
export const LUCK = Object.freeze({ CHAPTER_MAX_LEVEL: 10, FROM_FAILS: 2, STEP: 0.1, MAX: 0.3 })

/**
 * Coup de pouce discret du premier chapitre (Facile et Normal) : après deux
 * défaites d'affilée, les défenseurs encaissent un peu moins et le vent
 * faiblit (10 % par défaite, 30 % au plus). Rien ne l'annonce.
 * @param {number} levelId
 * @param {string} difficulty
 * @param {number} fails défaites d'affilée sur ce niveau
 * @returns {number} de 0 à LUCK.MAX
 */
export function luckFor(levelId, difficulty, fails) {
  if (levelId > LUCK.CHAPTER_MAX_LEVEL || difficulty === 'hard') return 0
  return fails >= LUCK.FROM_FAILS ? Math.min(LUCK.MAX, LUCK.STEP * (fails - LUCK.FROM_FAILS + 1)) : 0
}
