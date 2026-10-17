import { deepFreeze } from '../../core/utils/Guard.js'

/**
 * Les personnages de la Chronique (sans leurs pixels, pour rester léger).
 * `facing` : côté vers lequel regarde le dessin d'origine ; la scène retourne
 * le portrait pour qu'il regarde toujours vers le centre.
 * `cut` : le dessin est coupé par le bas (personnage à mi-corps) ; la scène le
 * pose contre son bord inférieur au lieu de le faire tenir debout sur le sol.
 */
export const CHARACTERS = deepFreeze({
  ysolde: { role: 'princess', facing: 'right' },
  aubert: { role: 'king', facing: 'right', cut: true },
  gontran: { role: 'engineer', facing: 'left' },
  mordrac: { role: 'usurper', facing: 'front' },
  // Les généraux de Mordrac (v6.0), un par chapitre, d'après leurs illustrations.
  rufus: { role: 'general', facing: 'left' },
  galeran: { role: 'general', facing: 'left' },
  bertille: { role: 'general', facing: 'left', cut: true },
  morgane: { role: 'general', facing: 'left' },
  anselme: { role: 'general', facing: 'left' },
  ilsa: { role: 'general', facing: 'left' },
  hugues: { role: 'general', facing: 'left', cut: true },
  ulric: { role: 'general', facing: 'left' },
  baudouin: { role: 'general', facing: 'left' },
})
