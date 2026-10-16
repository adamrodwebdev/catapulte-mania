import { deepFreeze } from '../../core/utils/Guard.js'

/**
 * Ouvrages des châteaux (v6.1) : des blocs à part, avec un comportement à eux
 * (voir physics/Props.js). Ce sont des blocs comme les autres (ils s'empilent,
 * s'effondrent, brûlent selon leur matériau, rapportent des points) ; leur
 * dessin et leurs effets changent.
 *
 * - windmill : moulin à vent. Ses ailes s'emballent (préavis d'une seconde),
 *              puis une rafale souffle devant lui, vers l'engin : elle dévie
 *              les tirs, pousse les nuages et attise le feu. Elle porte
 *              l'élément du monde (givre, braises…). Brisé ou gelé, il se tait.
 * - forge    : foyer de forge. Sa colonne de flammes enflamme ce qui la
 *              traverse (tirs, botte de paille, nuages de gaz : ils explosent).
 *              Prise dans la rafale d'un moulin, elle crache un jet de feu.
 *              Brisée, elle répand ses braises.
 * - cistern  : citerne. Brisée, elle inonde ce qui est dessous : le feu
 *              s'éteint, les défenseurs sont trempés (l'orbe d'orage les
 *              frappe plus fort) ; en Hiver, l'eau gèle sur eux.
 * - hive     : ruche. Brisée, l'essaim fond sur le défenseur le plus proche,
 *              le pique et le fait fuir (il peut tomber) ; le feu le disperse.
 * - flour    : sacs de farine. Crevés, un nuage blanc dérive au vent… et
 *              explose à la première flamme.
 */
export const PROP_TYPES = deepFreeze({
  windmill: { material: 'wood', w: 64, h: 58, hp: 320, score: 300 },
  forge: { material: 'stone', w: 64, h: 40, hp: 650, score: 250 },
  cistern: { material: 'wood', w: 70, h: 56, hp: 170, score: 150 },
  hive: { material: 'straw', w: 28, h: 32, hp: 35, score: 120 },
  flour: { material: 'straw', w: 36, h: 30, hp: 40, score: 80 },
})

export const PROP_NAMES = Object.freeze(Object.keys(PROP_TYPES))

/**
 * Moulin à vent : cycle calme → préavis (les ailes s'emballent) → rafale, tiré
 * au sort par la graine du niveau. La rafale souffle devant le moulin, vers
 * l'engin, sur REACH px et ±HALF_H autour du moyeu ; ACCEL : sa force, en
 * multiple du vent de base le plus fort (elle faiblit avec la distance).
 */
export const MILL = deepFreeze({ CALM_MS: [2200, 4200], WARN_MS: 1000, GUST_MS: [1300, 2300], REACH: 560, HALF_H: 95, ACCEL: 2.6, HUB_DY: -8 })

/** Forge : colonne de flammes (demi-largeur, hauteur) et jet dans une rafale (longueur). */
export const FORGE = deepFreeze({ HALF_W: 24, HEIGHT: 120, JET: 260, EMBERS: 95 })

/** Citerne : portée de l'inondation (rayon), durée où les défenseurs restent trempés (ms). */
export const CISTERN = deepFreeze({ RADIUS: 170, WET_MS: 9000 })
