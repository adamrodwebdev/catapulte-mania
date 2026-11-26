/**
 * Fonds peints des chapitres (v6.2, voir rendering/BackgroundArt.js).
 *
 * Une entrée par chapitre qui a sa peinture :
 *  - `url` : l'image (WebP, 2048 px de large, voir scripts/backgrounds/encode.mjs),
 *    chargée à la demande, seulement pour le chapitre en cours ; `lite` : la même,
 *    allégée (1600 px, v6.4) ;
 *  - `ground` : hauteur de la ligne de sol peinte (0 = haut, 1 = bas), posée
 *    sur le sol du monde ;
 *  - `peaks` : sommets d'où le vent arrache des panaches, en part de la largeur
 *    et de la hauteur de l'image, avec leur matière (`snow`, `sand`, `dust`, `ash`) ;
 *  - `focus` : centre d'intérêt (part de la largeur, 0,5 par défaut) sur lequel la
 *    peinture se cadre quand la vue est étroite (téléphone en portrait, v6.4).
 *
 * Sur notre site et sur Playgama (v6.4 : photographies FLUX.1 [schnell], licence
 * Apache 2.0, voir docs/PEINTURES.md ; `__PAINTED__` fixé au build, voir
 * vite.config.js) ; la démo (un seul fichier) et les autres portails gardent le décor
 * dessiné, plus léger. Un chapitre sans entrée garde lui aussi son décor dessiné
 * (montagnes procédurales).
 */
export const PAINTED = typeof __PAINTED__ === 'undefined' ? true : __PAINTED__

const SNOW = 'snow'

/**
 * Portails (format iife, v6.4) : pas d'import.meta ; les peintures sont copiées dans
 * `backgrounds/` à côté d'index.html (voir vite.config.js) et lues depuis la page.
 */
const IIFE = typeof __IIFE__ !== 'undefined' && __IIFE__
const fromPage = (n, lite) => new URL(`backgrounds/chapter-${n}${lite ? '-lite' : ''}.webp`, document.baseURI).href

/**
 * Chaque peinture (2048 px de large depuis v6.4) et sa version allégée (1600 px, v6.4) pour les
 * vues où elle suffit et les appareils à peu de mémoire (voir BackgroundArt.liteFor).
 */
const PAINTINGS = !PAINTED
  ? {}
  : IIFE
    ? Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, { url: fromPage(i + 1, false), lite: fromPage(i + 1, true) }]))
    : {
        1: { url: new URL('./backgrounds/chapter-1.webp', import.meta.url).href, lite: new URL('./backgrounds/chapter-1-lite.webp', import.meta.url).href },
        2: { url: new URL('./backgrounds/chapter-2.webp', import.meta.url).href, lite: new URL('./backgrounds/chapter-2-lite.webp', import.meta.url).href },
        3: { url: new URL('./backgrounds/chapter-3.webp', import.meta.url).href, lite: new URL('./backgrounds/chapter-3-lite.webp', import.meta.url).href },
        4: { url: new URL('./backgrounds/chapter-4.webp', import.meta.url).href, lite: new URL('./backgrounds/chapter-4-lite.webp', import.meta.url).href },
        5: { url: new URL('./backgrounds/chapter-5.webp', import.meta.url).href, lite: new URL('./backgrounds/chapter-5-lite.webp', import.meta.url).href },
        6: { url: new URL('./backgrounds/chapter-6.webp', import.meta.url).href, lite: new URL('./backgrounds/chapter-6-lite.webp', import.meta.url).href },
        7: { url: new URL('./backgrounds/chapter-7.webp', import.meta.url).href, lite: new URL('./backgrounds/chapter-7-lite.webp', import.meta.url).href },
        8: { url: new URL('./backgrounds/chapter-8.webp', import.meta.url).href, lite: new URL('./backgrounds/chapter-8-lite.webp', import.meta.url).href },
        9: { url: new URL('./backgrounds/chapter-9.webp', import.meta.url).href, lite: new URL('./backgrounds/chapter-9-lite.webp', import.meta.url).href },
        10: { url: new URL('./backgrounds/chapter-10.webp', import.meta.url).href, lite: new URL('./backgrounds/chapter-10-lite.webp', import.meta.url).href },
      }

/** @type {Readonly<Record<number, { url: string, lite?: string, ground?: number, horizon?: number, focus?: number, peaks?: Array<{ x: number, y: number, kind?: string }> }>>} */
export const BACKGROUND_ART = PAINTED
  ? Object.freeze({
      // La Palissade : alpages au soleil, grand sommet enneigé.
      1: { ...PAINTINGS[1], ground: 0.96, focus: 0.4, peaks: [{ x: 0.302, y: 0.33, kind: SNOW }, { x: 0.425, y: 0.445, kind: SNOW }] },
      // Le Fort de pierre : lande de bruyère après l'averse, rochers, cascade sous un vieux
      // pont de pierre ; aucun sommet assez sec pour un panache.
      2: { ...PAINTINGS[2], ground: 0.96, focus: 0.45 },
      // La Forteresse : soleil couchant, tours en ruine sur la crête (le pic, noyé dans le couchant, ne fume pas).
      3: { ...PAINTINGS[3], ground: 0.96 },
      // La Citadelle : nuit de lune, collines violettes.
      4: { ...PAINTINGS[4], ground: 0.96 },
      // Les Marais : brume verte, eaux dormantes, arbres morts.
      5: { ...PAINTINGS[5], ground: 0.96 },
      // Le Désert : dunes, mesas et arche ; le vent arrache le sable aux crêtes.
      6: { ...PAINTINGS[6], ground: 0.96, peaks: [{ x: 0.12, y: 0.44, kind: 'sand' }, { x: 0.675, y: 0.68, kind: 'sand' }, { x: 0.825, y: 0.56, kind: 'sand' }] },
      // La Montagne : sommets enneigés au soleil.
      7: { ...PAINTINGS[7], ground: 0.96, peaks: [{ x: 0.115, y: 0.245, kind: SNOW }, { x: 0.24, y: 0.49, kind: SNOW }, { x: 0.453, y: 0.525, kind: SNOW }] },
      // L'Hiver : plaine de neige, sapins givrés, soleil blanc.
      8: { ...PAINTINGS[8], ground: 0.96, peaks: [{ x: 0.272, y: 0.36, kind: SNOW }, { x: 0.93, y: 0.43, kind: SNOW }] },
      // L'Orage : nuit d'orage, lune dans les nuages.
      9: { ...PAINTINGS[9], ground: 0.96 },
      // Le Trône : volcan en éruption, coulées de lave, château noir au loin.
      10: { ...PAINTINGS[10], ground: 0.96, focus: 0.33, peaks: [{ x: 0.265, y: 0.43, kind: 'ash' }] },
    })
  : Object.freeze({})
