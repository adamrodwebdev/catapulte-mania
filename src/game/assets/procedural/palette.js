/**
 * Jetons de couleur partagés (v6.2) : hier recopiés dans plusieurs fichiers de
 * dessin, aujourd'hui en un seul endroit. Valeurs inchangées.
 */

/** Panaches au sommet des grandes montagnes du niveau (roche du décor), selon l'habit de la roche du chapitre. */
export const PEAK_PLUMES = Object.freeze({
  snow: Object.freeze({ rgb: '250,252,255', alpha: 0.85 }),
  sand: Object.freeze({ rgb: '236,212,168', alpha: 0.45 }),
  dust: Object.freeze({ rgb: '214,206,190', alpha: 0.45 }),
})

/** Panaches des fonds peints, par matière (voir assets/backgrounds.js) ; opacité avant le fondu de la peinture. */
export const PAINTED_PLUMES = Object.freeze({
  snow: Object.freeze({ rgb: '252,253,255', alpha: 0.75 }),
  sand: Object.freeze({ rgb: '238,216,176', alpha: 0.45 }),
  dust: Object.freeze({ rgb: '220,212,196', alpha: 0.45 }),
  ash: Object.freeze({ rgb: '120,110,110', alpha: 0.45 }),
})

/** Engin d'or (v6.2, maîtrise du royaume) : voile doré du bois, ferrures d'or, éclats qui scintillent. */
export const ENGINE_GOLD = Object.freeze({ tint: 'rgba(222,176,58,0.44)', metal: '#f2c94c', glint: '#fff6c9' })
