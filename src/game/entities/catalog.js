import { deepFreeze } from '../../core/utils/Guard.js'

/**
 * Catalogue des cibles et des projectiles (données pures, sans moteur physique).
 * Séparé des classes pour que les menus puissent l'utiliser sans charger Matter.js
 * (le moteur n'est téléchargé qu'à l'ouverture d'un niveau).
 */

/** Types de cibles : le soldat, le chevalier en armure et le roi. */
export const TARGET_TYPES = deepFreeze({
  // toughness (v5.0) : multiplie les seuils de choc et de chute mortels.
  // Le chevalier en armure encaisse les petits chocs : il faut le frapper franchement.
  soldier: { w: 26, h: 50, hp: 16, density: 0.0012, score: 500, toughness: 1 },
  knight: { w: 30, h: 54, hp: 45, density: 0.0018, score: 800, toughness: 2.2 },
  king: { w: 32, h: 58, hp: 30, density: 0.0014, score: 1500, toughness: 1.4 },
})

/**
 * Types de projectiles, débloqués au fil des chapitres.
 * La pierre de base garde sa densité d'origine (v2.1) : trop lourde, elle rendait
 * les munitions spéciales inutiles. Rocher, feu et poudre restent ~25 % plus
 * lourds qu'en v1 pour mériter leur rareté.
 * - impact   : multiplicateur d'énergie de choc
 * - ignites  : enflamme ce qu'il touche (pot de feu grégeois)
 * - explodes : explose au premier contact (boulet de poudre)
 * - splits   : se divise en 3 sur action du joueur pendant le vol (mitraille)
 */
export const PROJECTILE_TYPES = deepFreeze({
  stone: { radius: 17, density: 0.009, impact: 1, ignites: false, explodes: false, splits: false },
  boulder: { radius: 25, density: 0.015, impact: 1.4, ignites: false, explodes: false, splits: false },
  fire: { radius: 16, density: 0.009, impact: 0.8, ignites: true, explodes: false, splits: false },
  bomb: { radius: 18, density: 0.010, impact: 0.8, ignites: false, explodes: true, splits: false },
  split: { radius: 15, density: 0.009, impact: 1, ignites: false, explodes: false, splits: true },
  // v5.0 : boulet de givre. Il gèle tout ce qui l'entoure à l'impact (voir FROST).
  frost: { radius: 17, density: 0.010, impact: 0.9, ignites: false, explodes: false, splits: false, frost: true },
})

/**
 * Givre (v5.0) : rayon de gel à l'impact, durée du gel et fragilité des objets
 * gelés (multiplicateur des dégâts de choc et d'explosion). Le feu au contact
 * d'un objet gelé le fait éclater en vapeur : l'eau bouillante ébouillante les
 * défenseurs proches (STEAM_RADIUS) et le choc thermique fend le bloc (SHOCK,
 * part de ses points de vie).
 */
export const FROST = deepFreeze({ RADIUS: 120, MS: 16000, BRITTLE: 3, STEAM_RADIUS: 95, SHOCK: 0.6 })

export const PROJECTILE_NAMES = Object.freeze(Object.keys(PROJECTILE_TYPES))
