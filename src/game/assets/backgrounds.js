/**
 * Fonds peints des chapitres (v6.2, voir rendering/BackgroundArt.js).
 *
 * Une entrée par chapitre qui a sa peinture :
 *  - `url` : l'image (WebP, 2560 px de large, voir scripts/backgrounds/encode.mjs),
 *    chargée à la demande, seulement pour le chapitre en cours ;
 *  - `ground` : hauteur de la ligne de sol peinte (0 = haut, 1 = bas), posée
 *    sur le sol du monde ;
 *  - `peaks` : sommets d'où le vent arrache des panaches, en part de la largeur
 *    et de la hauteur de l'image, avec leur matière (`snow`, `sand`, `dust`, `ash`).
 *
 * Seulement sur notre site : la démo (un seul fichier) et les portails (tout
 * intégré au script, dans un cadre isolé) gardent le décor dessiné, plus léger.
 * Un chapitre sans entrée garde lui aussi son décor dessiné (montagnes procédurales).
 */
export const PAINTED = (typeof __TARGET__ === 'undefined' || __TARGET__ === 'web') && (typeof __DEMO__ === 'undefined' || __DEMO__ !== true)

const SNOW = 'snow'

/** @type {Readonly<Record<number, { url: string, ground?: number, horizon?: number, peaks?: Array<{ x: number, y: number, kind?: string }> }>>} */
export const BACKGROUND_ART = PAINTED
  ? Object.freeze({
      // La Palissade : alpages au soleil, grands sommets enneigés.
      1: { url: new URL('./backgrounds/chapter-1.webp', import.meta.url).href, ground: 0.955, peaks: [{ x: 0.205, y: 0.22, kind: SNOW }, { x: 0.485, y: 0.41, kind: SNOW }, { x: 0.845, y: 0.42, kind: SNOW }] },
      // Le Fort de pierre : hautes terres de granit après l'averse, bruyère, chaos de rochers,
      // cascade et vieux pont de pierre ; aucun sommet assez sec pour un panache.
      2: { url: new URL('./backgrounds/chapter-2.webp', import.meta.url).href, ground: 0.975 },
      // La Forteresse : soleil couchant, ruines dressées sur l'horizon.
      3: { url: new URL('./backgrounds/chapter-3.webp', import.meta.url).href, ground: 0.96, peaks: [{ x: 0.08, y: 0.3, kind: SNOW }] },
      // La Citadelle : nuit de lune, collines violettes.
      4: { url: new URL('./backgrounds/chapter-4.webp', import.meta.url).href, ground: 0.972 },
      // Les Marais : brume verte, eaux dormantes, arbres morts.
      5: { url: new URL('./backgrounds/chapter-5.webp', import.meta.url).href, ground: 0.975 },
      // Le Désert : dunes et mesas ; le vent arrache le sable aux crêtes.
      6: { url: new URL('./backgrounds/chapter-6.webp', import.meta.url).href, ground: 0.975, peaks: [{ x: 0.61, y: 0.58, kind: 'sand' }, { x: 0.29, y: 0.68, kind: 'sand' }, { x: 0.75, y: 0.67, kind: 'sand' }] },
      // La Montagne : sommets enneigés au soleil.
      7: { url: new URL('./backgrounds/chapter-7.webp', import.meta.url).href, ground: 0.95, peaks: [{ x: 0.19, y: 0.23, kind: SNOW }, { x: 0.48, y: 0.42, kind: SNOW }, { x: 0.93, y: 0.47, kind: SNOW }] },
      // L'Hiver : plaine de neige, soleil blanc.
      8: { url: new URL('./backgrounds/chapter-8.webp', import.meta.url).href, ground: 0.94, peaks: [{ x: 0.15, y: 0.36, kind: SNOW }, { x: 0.27, y: 0.43, kind: SNOW }, { x: 0.6, y: 0.6, kind: SNOW }] },
      // L'Orage : nuit d'orage, pluie, éclairs.
      9: { url: new URL('./backgrounds/chapter-9.webp', import.meta.url).href, ground: 0.95 },
      // Le Trône : coulées de lave, volcan qui fume, château noir.
      10: { url: new URL('./backgrounds/chapter-10.webp', import.meta.url).href, ground: 0.958, peaks: [{ x: 0.55, y: 0.62, kind: 'ash' }] },
    })
  : Object.freeze({})
