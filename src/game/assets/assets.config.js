/**
 * MANIFESTE DES VISUELS — le seul fichier à modifier pour changer les graphismes.
 *
 * Chaque élément visuel du jeu est désigné par une clé. Pour chaque clé :
 *   { type: 'procedural' }
 *       → dessiné en vectoriel par le code (src/game/assets/procedural/painters.js)
 *   { type: 'image', src: <url>, fallback: 'procedural' }
 *       → image (PNG, WebP, SVG, AVIF…) étirée à la taille de l'objet ;
 *         si elle ne se charge pas, le dessin vectoriel prend le relais.
 *         Option `damagedSrc` : image affichée quand l'objet est abîmé (> 50 %).
 *
 * Exemple pour remplacer le soldat par une image :
 *   'target.soldier': {
 *     type: 'image',
 *     src: new URL('./images/soldier.webp', import.meta.url).href,
 *     fallback: 'procedural',
 *   },
 * (Vite copie et optimise automatiquement le fichier référencé avec `new URL`.)
 */
export const ASSET_MANIFEST = Object.freeze({
  // Matériaux de construction
  'block.straw': { type: 'procedural' },
  'block.wood': { type: 'procedural' },
  'block.glass': { type: 'procedural' },
  'block.stone': { type: 'procedural' },
  'block.iron': { type: 'procedural' },
  'block.brick': { type: 'procedural' },
  'block.sandstone': { type: 'procedural' },
  'block.ice': { type: 'procedural' },
  'block.marble': { type: 'procedural' },
  // Personnages
  'target.soldier': { type: 'procedural' },
  'target.knight': { type: 'procedural' },
  'target.king': { type: 'procedural' },
  // Éléments de gameplay
  barrel: { type: 'procedural' },
  'projectile.stone': { type: 'procedural' },
  'projectile.boulder': { type: 'procedural' },
  'projectile.fire': { type: 'procedural' },
  'projectile.bomb': { type: 'procedural' },
  'projectile.split': { type: 'procedural' },
  catapult: { type: 'procedural' },
  trebuchet: { type: 'procedural' },
  // Décor de saison (événements)
  'deco.pumpkin': { type: 'procedural' },
  'deco.snow': { type: 'procedural' },
  // Décor (paramétré par le thème du chapitre)
  'scene.sky': { type: 'procedural' },
  'scene.far': { type: 'procedural' },
  'scene.ground': { type: 'procedural' },
})
