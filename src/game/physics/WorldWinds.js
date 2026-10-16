import { deepFreeze, Guard } from '../../core/utils/Guard.js'

/**
 * Souffle du monde (v6.1) : chaque chapitre a son vent, et ce vent fait
 * quelque chose. La règle est la même partout : un projectile accumule son
 * exposition (force du vent qu'il traverse × temps de vol ; trois fois plus
 * dans la rafale d'un moulin) ; passé un seuil, l'élément du monde le marque,
 * une fois. L'aide à la visée montre où (repère sur la courbe), le projectile
 * le montre en vol (givre, flammes, étincelles, sable). Les éléments se
 * combinent comme ailleurs dans le jeu : le feu et le givre s'annulent en
 * vapeur, le feu embrase le gaz, l'eau conduit la foudre.
 *
 * - breeze  (Palissade, Citadelle) : un vent simple.
 * - gusts   (Fort de pierre) : des rafales même en Facile et en Normal.
 * - embers  (Forteresse) : le vent porte les braises : le feu gagne plus loin
 *            sous le vent, la poudre y compris.
 * - miasma  (Marais) : des poches de gaz dérivent sur le château ; une flamme,
 *            et elles explosent. Les défenseurs dedans toussent.
 * - sand    (Désert) : le sable étouffe le feu des tirs et les freine.
 * - thermal (Montagne) : des colonnes d'air chaud montent le long de la roche
 *            et portent les tirs en cloche.
 * - frost   (Hiver) : la bise givre le tir : il cogne moins les murs et éclate
 *            à l'impact (le feu, lui, s'y éteint).
 * - charge  (Tempête) : le tir se charge d'électricité et se décharge à
 *            l'impact sur les défenseurs proches (la pluie conduit).
 * - fire    (Trône) : le vent de braises enflamme le tir : feu grégeois offert
 *            (le givre, lui, y fond).
 */
export const WORLD_WINDS = deepFreeze({
  breeze: { element: null, rgb: '245,248,255' },
  gusts: { element: null, rgb: '235,242,252', gust: 0.3 },
  embers: { element: 'embers', rgb: '255,170,90', fireReach: 1.8 },
  miasma: { element: 'miasma', rgb: '170,190,110', pockets: 2 },
  sand: { element: 'sand', rgb: '226,196,140', exposure: 1, slow: 0.82 },
  thermal: { element: 'thermal', rgb: '255,250,240', columns: 2 },
  frost: { element: 'frost', rgb: '205,232,255', exposure: 1, wall: 0.5 },
  charge: { element: 'charge', rgb: '190,220,255', exposure: 1, hops: 2 },
  fire: { element: 'fire', rgb: '255,150,80', exposure: 1 },
})

/** Vent de chaque chapitre (1 à 10). */
const BY_CHAPTER = Object.freeze({ 1: 'breeze', 2: 'gusts', 3: 'embers', 4: 'breeze', 5: 'miasma', 6: 'sand', 7: 'thermal', 8: 'frost', 9: 'charge', 10: 'fire' })

/** @param {number} chapter */
export function worldWindFor(chapter) {
  return BY_CHAPTER[chapter] ?? 'breeze'
}

/** Éléments qui marquent un projectile en vol (exposition). */
export const EXPOSURE_ELEMENTS = Object.freeze(['sand', 'frost', 'charge', 'fire'])

/**
 * Exposition gagnée par pas : 1 en ~1,2 s dans le vent de base le plus fort ;
 * trois fois plus vite dans la rafale d'un moulin.
 */
export const EXPOSURE = deepFreeze({ PER_MS: 1 / 1200, GUST: 3 })

/**
 * Colonnes d'air chaud (Montagne) : demi-largeur, poussée vers le haut (en
 * part de la gravité) et hauteur au-dessus du sol où elles s'éteignent.
 */
export const THERMAL = deepFreeze({ HALF_W: 70, LIFT: 0.55, TOP: 900 })

/**
 * Exposition d'un pas pour un vent `w` (sans unité, 1 = vent de base maximal)
 * et une rafale de moulin `g` (idem).
 */
export function exposureStep(w, g, dtMs) {
  return (Math.abs(w) + Math.abs(g) * EXPOSURE.GUST) * EXPOSURE.PER_MS * dtMs
}

/**
 * Ce que l'élément fait au projectile au moment où il le marque (règles de
 * combinaison : le feu et le givre s'annulent ; le sable étouffe le feu).
 * @param {string} element
 * @param {object} p Projectile
 * @returns {string | null} ce qui s'est passé (pour l'affichage), ou null
 */
export function applyElement(element, p) {
  Guard.oneOf(element, EXPOSURE_ELEMENTS, 'element')
  if (element === 'frost') {
    // Le feu s'éteint dans la bise (vapeur) ; le givre n'a rien à givrer.
    if (p.ignites) {
      p.ignites = false
      p.burning = 0
      return 'quench'
    }
    if (p.frost) return null
    p.rimed = true
    return 'rime'
  }
  if (element === 'fire') {
    // Le givre fond (vapeur) ; tout le reste prend feu.
    if (p.frost) {
      p.frost = false
      return 'thaw'
    }
    return p.kindle() ? 'kindle' : null
  }
  if (element === 'sand') {
    const smothered = p.ignites
    p.ignites = false
    p.burning = 0
    p.sanded = true
    return smothered ? 'smother' : 'sand'
  }
  if (element === 'charge') {
    p.charged = true
    return 'charge'
  }
  return null
}
