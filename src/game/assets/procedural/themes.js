/**
 * Palettes et jetons de décor par chapitre (v6.2, sortis de painters.js).
 *
 * Couleurs du ciel, du lointain, du sol et du château ; climat (`night`,
 * `weather`, `arid`, `peaks`). Jetons propres à certains chapitres (v6.2, hier
 * des numéros de chapitre dans le code de dessin) :
 *  - `sunAt` : place de l'astre à l'écran, en part de la vue (défaut : SUN_AT) ;
 *  - `motes` : poussières d'ambiance imposées (braises du Trône) ;
 *  - `rock` : habit de la roche du décor ('snow', 'sand' ; herbe sinon), et
 *    `rockSnowLine` : hauteur de sa ligne de neige (part de la hauteur, défaut 0,3).
 */

/** Palettes de décor par chapitre : la progression se lit aussi dans le ciel. */
export const THEMES = Object.freeze({
  1: { skyTop: '#7fb2dc', skyBottom: '#f5dcae', sun: '#fff1c4', far: '#86a873', farDark: '#6b8c5c', grass: '#5c8a3b', dirt: '#7a5636', castle: '#8fa58a', night: false },
  2: { skyTop: '#93acc4', skyBottom: '#e3e6e2', sun: '#fffdf0', far: '#8e97a6', farDark: '#727c8d', grass: '#5f7d45', dirt: '#6d5a48', castle: '#9097a4', night: false },
  3: { skyTop: '#3f2c5c', skyBottom: '#ef9653', sun: '#ffd27a', far: '#5b3a5a', farDark: '#432a47', grass: '#4d5e32', dirt: '#5a3f2c', castle: '#4b2f4c', night: false, sunAt: [0.78, 0.42] },
  4: { skyTop: '#0d1430', skyBottom: '#3c3c6e', sun: '#e9edf7', far: '#1f2446', farDark: '#161a36', grass: '#2f4a30', dirt: '#3b2e28', castle: '#262b52', night: true },
  // v3 : chapitres 5 à 10, chacun avec son climat (brume, sable, neige, pluie…).
  5: { skyTop: '#7f9a8f', skyBottom: '#d9e0c8', sun: '#f4f1d0', far: '#5f7a5a', farDark: '#4b6347', grass: '#4e6b3a', dirt: '#4a3d2e', castle: '#6f7f6a', night: false, weather: 'fog' },
  6: { skyTop: '#4f93cf', skyBottom: '#f7e3b0', sun: '#fff5d6', far: '#d8b47a', farDark: '#c09a62', grass: '#c9ad6a', dirt: '#a9824f', castle: '#c9a36b', night: false, arid: true, rock: 'sand' },
  7: { skyTop: '#5f86b5', skyBottom: '#dfe8f0', sun: '#ffffff', far: '#8a96a8', farDark: '#5f6a7c', grass: '#6f8a5a', dirt: '#5d5248', castle: '#7c8597', night: false, peaks: true, rock: 'snow' },
  8: { skyTop: '#9db8d4', skyBottom: '#eef3f8', sun: '#ffffff', far: '#dfe7ef', farDark: '#c3cfdc', grass: '#f4f7fb', dirt: '#8a8f99', castle: '#aab6c6', night: false, arid: true, weather: 'snow', rock: 'snow', rockSnowLine: 0.42 },
  9: { skyTop: '#2f3646', skyBottom: '#7f8898', sun: '#c9cfda', far: '#4a5262', farDark: '#353c4a', grass: '#3f5a3a', dirt: '#3a312a', castle: '#2f3542', night: false, weather: 'rain' },
  10: { skyTop: '#22132f', skyBottom: '#b8464f', sun: '#ffcc66', far: '#4a2440', farDark: '#331a30', grass: '#3d4a2c', dirt: '#3b2a22', castle: '#2b1a2e', night: true, motes: 'ember' },
})

/** Place de l'astre à l'écran (part de la largeur, de la hauteur), sauf jeton `sunAt` du chapitre. */
export const SUN_AT = Object.freeze([0.82, 0.18])
