import { deepFreeze } from '../../core/utils/Guard.js'

/**
 * Les personnages de la Chronique (sans leurs pixels, pour rester léger).
 * `facing` : côté vers lequel regarde le dessin d'origine ; la scène retourne
 * le portrait pour qu'il regarde toujours vers le centre.
 */
export const CHARACTERS = deepFreeze({
  ysolde: { role: 'princess', facing: 'right' },
  aubert: { role: 'king', facing: 'right' },
  gontran: { role: 'engineer', facing: 'left' },
  mordrac: { role: 'usurper', facing: 'front' },
})
