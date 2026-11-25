/**
 * Ciels vivants (v6.3) : ce que chaque fond peint anime, chapitre par chapitre.
 * Données seulement ; les effets sont dans effects.js, la lecture des peintures
 * dans paintingAnalysis.js. Réglages de la maquette « Ciels vivants » validée,
 * replacés en v6.4 sur les photographies des chapitres (voir docs/PEINTURES.md).
 *
 * Repères :
 *  - u, v (`at`, `box`, `from`, `to`…) : part de la largeur et de la hauteur de la peinture ;
 *  - `wind` : sens de la dérive quand le niveau est sans vent (1 vers la droite,
 *    -1 vers la gauche) ; sinon les effets suivent le vent du niveau ;
 *  - tailles et vitesses en « px » : pour une peinture de 1440 px de large (unité u) ;
 *  - `replaces` : ce que le ciel vivant remplace dans le jeu, pour ne rien
 *    doubler : `weather` (pluie, neige ou brume dessinées), `motes` (poussières
 *    d'ambiance devant la scène) ;
 *  - `fx` : les effets du chapitre (voir SKY_ORDER pour l'ordre de dessin).
 */
export const SKY_CHAPTERS = /* @__PURE__ */ Object.freeze({
  // La Palissade : le soleil rayonne, le vent emporte feuilles et pétales, les rafales couchent l'herbe.
  1: {
    wind: 1,
    replaces: [],
    sun: { at: [0.615, 0.07], glow: 0.12, halo: 5, pulse: 0.3, flare: 0.75, tint: [255, 248, 222], shafts: { count: 7, spread: [35, 150], width: [0.04, 0.1], reach: 0.8, alpha: 0.2 } },
    shadows: { count: 4, from: 0.66, to: 0.92, alpha: 0.24 },
    gusts: { from: 0.62, alpha: 0.34, every: [4, 8], tint: [242, 255, 200], kinds: ['grass'] },
    leaves: { from: 0.34, to: 0.92, colors: ['#7fa64a', '#9cbc55', '#c3d478', '#e6dfa0', '#f6f3e4'] },
    fx: ['sun', 'shafts', 'flare', 'shadows', 'gusts', 'leaves'],
  },
  // Le Fort de pierre : la lumière coule de la trouée, la cascade coule, la lande ondule.
  2: {
    wind: 1,
    replaces: [],
    sun: { at: [0.37, 0.03], glow: 0.2, halo: 6, pulse: 0.25, tint: [255, 246, 216], shafts: { count: 4, spread: [75, 130], width: [0.03, 0.07], reach: 0.5, alpha: 0.18 } },
    shadows: { count: 5, from: 0.56, to: 0.92, alpha: 0.26 },
    gusts: { from: 0.56, alpha: 0.26, every: [5, 9], tint: [255, 246, 220], kinds: ['heather', 'gold', 'grass'] },
    mist: [[0.6, 5, 0.18, 1.2], [0.8, 9, 0.26, 1.6]],
    falls: { box: [0.37, 0.49, 0.46, 0.8], foot: [0.41, 0.78] },
    fx: ['sun', 'shafts', 'veil', 'shadows', 'gusts', 'falls', 'mist'],
  },
  // La Forteresse : le couchant palpite, une poussière dorée flotte, les lucioles s'allument.
  3: {
    wind: 1,
    replaces: ['motes'],
    sun: { at: [0.504, 0.472], glow: 0.24, halo: 6, tint: [255, 214, 150], warm: true, shafts: { count: 9, spread: [195, 345], width: [0.03, 0.07], reach: 0.6, alpha: 0.12 } },
    hill: { maxU: 0.5, from: 0.6, to: 0.95, maxLum: 70 },
    fireflies: 16,
    fx: ['sun', 'shafts', 'dust', 'fireflies'],
  },
  // La Citadelle : étoiles, étoiles filantes, halo de la lune, brume des vallées.
  4: {
    wind: -1,
    replaces: ['motes'],
    moon: [0.5875, 0.36, 0.05],
    stars: { min: 48, contrast: 22, top: 0.44, avoid: [[0.5875, 0.36, 0.04]] },
    mist: [[0.69, 9, 0.16, 1.4], [0.81, 17, 0.22, 1.9]],
    fx: ['moon', 'stars', 'meteors', 'mist', 'motes'],
  },
  // Les Marais : la brume roule, des ronds sur l'eau, des feux follets.
  5: {
    wind: -1,
    replaces: ['weather'],
    mist: [[0.58, 10, 0.3, 2], [0.7, 16, 0.36, 1.7], [0.84, 24, 0.28, 1.4]],
    banks: true,
    fogroll: { count: 18, from: 0.55, to: 0.88, alpha: 0.45 },
    water: { from: 0.785, to: 0.83, areas: [[0, 0.79, 0.14, 0.825], [0.3, 0.785, 0.45, 0.83]], min: 125, sat: 120, flat: 40 },
    wisps: { max: 5, from: 0.62, to: 0.84 },
    fx: ['mist', 'fogroll', 'ripples', 'wisps'],
  },
  // Le Désert : l'air chaud tremble, des voiles de sable, un tourbillon au loin.
  6: {
    wind: 1,
    replaces: [],
    haze: [0.42, 0.56],
    veils: { kind: 'sand', layers: [[0.72, 60, 0.42, 1.3], [0.86, 95, 0.5, 1.7]] },
    devil: { from: 0.5, to: 0.6 },
    fx: ['haze', 'veils', 'devil'],
  },
  // La Montagne : le soleil, la neige qui scintille, les ombres des nuages sur les névés.
  7: {
    wind: -1,
    replaces: [],
    sun: { at: [0.975, 0.03], glow: 0.18, halo: 6, tint: [255, 252, 240], shafts: { count: 6, spread: [100, 170], width: [0.03, 0.08], reach: 0.7, alpha: 0.14 } },
    shadows: { count: 4, from: 0.5, to: 0.8, alpha: 0.2 },
    snow: { from: 0.3, to: 0.82, maxU: 0.52 },
    glints: 4.5,
    fx: ['sun', 'shafts', 'shadows', 'glints'],
  },
  // L'Hiver : la neige tombe, des cristaux de givre étincellent, la poudreuse vole au ras du sol.
  8: {
    wind: 1,
    replaces: ['weather'],
    sun: { at: [0.76, 0.24], glow: 0.18, halo: 7, tint: [250, 252, 255], shafts: { count: 7, spread: [30, 160], width: [0.03, 0.08], reach: 0.6, alpha: 0.14 } },
    veils: { kind: 'snow', layers: [[0.88, 80, 0.5, 1.2]] },
    fx: ['sun', 'shafts', 'diamond', 'veils', 'snow'],
  },
  // L'Orage : pluie en deux nappes, lambeaux de nuages, éclairs et tonnerre.
  9: {
    wind: -1,
    replaces: ['weather'],
    moon: [0.74, 0.318, 0.06],
    fx: ['moon', 'scud', 'lightning', 'rain'],
  },
  // Le Trône : la lave rougeoie, les braises montent, la fumée roule, la cendre retombe.
  10: {
    wind: -1,
    replaces: ['motes'],
    moon: [0.805, 0.24, 0.03],
    // La fumée roule depuis le pied de la colonne peinte, au-dessus de la fontaine de lave.
    crater: [0.27, 0.31],
    lava: { areas: [[0.17, 0.36, 0.45, 0.66], [0, 0.6, 1, 1]] },
    fx: ['moon', 'lava', 'smoke', 'embers', 'ash'],
  },
})

/** Ordre de dessin : du plus lointain au plus proche (tout reste derrière le château). */
export const SKY_ORDER = /* @__PURE__ */ Object.freeze([
  'haze', 'sun', 'shafts', 'rays', 'flare', 'moon', 'stars', 'meteors', 'veil', 'shadows', 'gusts', 'scud', 'lava', 'smoke',
  'falls', 'mist', 'fogroll', 'ripples', 'veils', 'devil', 'dust', 'glints', 'diamond', 'wisps', 'fireflies', 'leaves',
  'lightning', 'rain', 'snow', 'embers', 'ash', 'motes',
])

/** Lit continu du chapitre (avec le son) : la cascade du Fort de pierre. La pluie de l'Orage est celle de l'ambiance. */
export const SKY_BEDS = Object.freeze({ 2: 'falls' })
