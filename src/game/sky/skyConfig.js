/**
 * Ciels vivants (v6.3) : ce que chaque fond peint anime, chapitre par chapitre.
 * Données seulement ; les effets sont dans effects.js, la lecture des peintures
 * dans paintingAnalysis.js. Réglages de la maquette « Ciels vivants » validée.
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
    sun: { at: [0.82, 0.2], glow: 0.18, halo: 6, pulse: 0.3, rays: 0.42, stream: true, flare: 0.75, tint: [255, 248, 222] },
    shadows: { count: 4, from: 0.68, to: 0.88, alpha: 0.24 },
    gusts: { from: 0.6, alpha: 0.34, every: [4, 8], tint: [242, 255, 200], kinds: ['grass'] },
    leaves: { from: 0.34, to: 0.92, colors: ['#7fa64a', '#9cbc55', '#c3d478', '#e6dfa0', '#f6f3e4'] },
    fx: ['sun', 'rays', 'flare', 'shadows', 'gusts', 'leaves'],
  },
  // Le Fort de pierre : la lumière coule de la trouée, la cascade coule, la lande ondule.
  2: {
    wind: 1,
    replaces: [],
    sun: { at: [0.265, 0.13], glow: 0.2, halo: 6, pulse: 0.25, rays: 0.36, stream: true, side: 14, spread: 0.025, reach: 0.3, cone: [15, 100], tint: [255, 246, 216] },
    shadows: { count: 5, from: 0.62, to: 0.9, alpha: 0.26 },
    gusts: { from: 0.62, alpha: 0.26, every: [5, 9], tint: [255, 246, 220], kinds: ['heather', 'gold', 'grass'] },
    mist: [[0.62, 5, 0.22, 1.2], [0.85, 9, 0.3, 1.6]],
    falls: { box: [0.232, 0.7, 0.29, 0.89], foot: [0.262, 0.875] },
    fx: ['sun', 'rays', 'veil', 'shadows', 'gusts', 'falls', 'mist'],
  },
  // La Forteresse : le couchant palpite, une poussière dorée flotte, les lucioles s'allument.
  3: {
    wind: 1,
    replaces: ['motes'],
    sun: { at: [0.685, 0.655], glow: 0.24, halo: 6, rays: 0.16, tint: [255, 226, 170], warm: true },
    hill: { maxU: 0.44, from: 0.6, to: 0.94, maxLum: 82 },
    fireflies: 16,
    fx: ['sun', 'rays', 'dust', 'fireflies'],
  },
  // La Citadelle : étoiles, étoiles filantes, halo de la lune, brume des vallées.
  4: {
    wind: -1,
    replaces: ['motes'],
    moon: [0.82, 0.196, 0.075],
    mist: [[0.7, 9, 0.16, 1.4], [0.8, 17, 0.22, 1.9]],
    fx: ['moon', 'stars', 'meteors', 'mist', 'motes'],
  },
  // Les Marais : la brume roule, des ronds sur l'eau, des feux follets.
  5: {
    wind: -1,
    replaces: ['weather'],
    mist: [[0.6, 10, 0.4, 2], [0.72, 16, 0.46, 1.7], [0.86, 24, 0.36, 1.4]],
    banks: true,
    fogroll: { count: 18, from: 0.56, to: 0.9, alpha: 0.5 },
    water: { from: 0.76, to: 0.975, areas: [[0.12, 0.75, 0.66, 0.99], [0, 0.88, 0.12, 0.99]] },
    wisps: { max: 5, from: 0.64, to: 0.86 },
    fx: ['mist', 'fogroll', 'ripples', 'wisps'],
  },
  // Le Désert : l'air chaud tremble, des voiles de sable, un tourbillon au loin.
  6: {
    wind: 1,
    replaces: [],
    haze: [0.47, 0.66],
    veils: { kind: 'sand', layers: [[0.74, 60, 0.42, 1.3], [0.87, 95, 0.5, 1.7]] },
    devil: { from: 0.6, to: 0.7 },
    fx: ['haze', 'veils', 'devil'],
  },
  // La Montagne : le soleil, la neige qui scintille, les ombres des nuages sur les névés.
  7: {
    wind: -1,
    replaces: [],
    sun: { at: [0.885, 0.18], glow: 0.18, halo: 6, rays: 0.14, tint: [255, 252, 240] },
    shadows: { count: 4, from: 0.64, to: 0.88, alpha: 0.2 },
    snow: { from: 0.47, to: 0.95 },
    glints: 4.5,
    fx: ['sun', 'rays', 'shadows', 'glints'],
  },
  // L'Hiver : la neige tombe, des cristaux de givre étincellent, la poudreuse vole au ras du sol.
  8: {
    wind: 1,
    replaces: ['weather'],
    sun: { at: [0.82, 0.2], glow: 0.18, halo: 7, rays: 0.14, tint: [250, 252, 255] },
    veils: { kind: 'snow', layers: [[0.9, 80, 0.5, 1.2]] },
    fx: ['sun', 'rays', 'diamond', 'veils', 'snow'],
  },
  // L'Orage : pluie en deux nappes, lambeaux de nuages, éclairs et tonnerre.
  9: {
    wind: -1,
    replaces: ['weather'],
    moon: [0.515, 0.245, 0.06],
    fx: ['moon', 'scud', 'lightning', 'rain'],
  },
  // Le Trône : la lave rougeoie, les braises montent, la fumée roule, la cendre retombe.
  10: {
    wind: -1,
    replaces: ['motes'],
    moon: [0.81, 0.2, 0.055],
    crater: [0.49, 0.64],
    fx: ['moon', 'lava', 'smoke', 'embers', 'ash'],
  },
})

/** Ordre de dessin : du plus lointain au plus proche (tout reste derrière le château). */
export const SKY_ORDER = /* @__PURE__ */ Object.freeze([
  'haze', 'sun', 'rays', 'flare', 'moon', 'stars', 'meteors', 'veil', 'shadows', 'gusts', 'scud', 'lava', 'smoke',
  'falls', 'mist', 'fogroll', 'ripples', 'veils', 'devil', 'dust', 'glints', 'diamond', 'wisps', 'fireflies', 'leaves',
  'lightning', 'rain', 'snow', 'embers', 'ash', 'motes',
])

/** Lit continu du chapitre (avec le son) : la cascade du Fort de pierre. La pluie de l'Orage est celle de l'ambiance. */
export const SKY_BEDS = Object.freeze({ 2: 'falls' })
