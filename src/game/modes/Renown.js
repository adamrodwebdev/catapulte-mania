import { deepFreeze } from '../../core/utils/Guard.js'

/**
 * Renommée : la valeur d'un défenseur dans les modes à deux joueurs.
 * Un soldat vaut 1, un chevalier 2, un roi 4. Celui qui abat le dernier
 * défenseur d'un château reçoit en plus le « coup de grâce ».
 *
 * La renommée départage le duel, désigne le meilleur joueur de la campagne à
 * deux et, au face-à-face, mesure ce qui reste de chaque château.
 */
export const RENOWN = deepFreeze({ soldier: 1, knight: 2, king: 4 })
export const COUP_DE_GRACE = 2

/** Renommée d'un défenseur (0 pour tout le reste). */
export function renownOf(entity) {
  return entity?.kind === 'target' ? (RENOWN[entity.type] ?? 1) : 0
}

/** Renommée totale d'une liste de défenseurs. */
export function renownSum(targets) {
  return targets.reduce((sum, t) => sum + renownOf(t), 0)
}
