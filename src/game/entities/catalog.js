import { deepFreeze } from '../../core/utils/Guard.js'

/**
 * Catalogue des cibles et des projectiles (données pures, sans moteur physique).
 * Séparé des classes pour que les menus puissent l'utiliser sans charger Matter.js
 * (le moteur n'est téléchargé qu'à l'ouverture d'un niveau).
 */

/**
 * Types de cibles : le soldat, le chevalier en armure, le roi…
 *
 * v6.1 : fin des personnages « fragiles » (v3, la moindre collision tuait).
 * Chacun a ses points de vie (`hp`, ×0,75 en Facile, ×1,35 en Difficile) et
 * sa force (`push`) : la quantité de mouvement (masse × vitesse) de ce qu'il
 * peut repousser quand cela arrive lentement (voir physics/FallingObjects.js).
 * `toughness` (v5.0) protège encore des chutes et ralentit la marche.
 */
export const TARGET_TYPES = deepFreeze({
  soldier: { w: 26, h: 50, hp: 30, push: 14, density: 0.0012, score: 500, toughness: 1 },
  // Le chevalier en armure encaisse les petits chocs : il faut le frapper franchement.
  knight: { w: 30, h: 54, hp: 70, push: 24, density: 0.0018, score: 800, toughness: 2.2 },
  king: { w: 32, h: 58, hp: 40, push: 10, density: 0.0014, score: 1500, toughness: 1.4 },
  // v5.1 : l'ogre, unité lourde. Il renvoie d'un revers les projectiles légers
  // et repousse les blocs qui lui tombent dessus (voir DefenderContacts#ogreReacts) :
  // il faut l'explosion, le feu, le givre ou un boulet lourd pour l'abattre.
  ogre: { w: 46, h: 76, hp: 420, push: 200, density: 0.0032, score: 2000, toughness: 4 },
  // v5.8 : quatre défenseurs aux capacités propres (voir ../ai/UnitBrain.js).
  // L'éclaireur voit venir le tir et court se mettre à l'abri : visez large
  // (poudre, feu, mitraille) ou piégez-le dans une pièce fermée.
  scout: { w: 24, h: 46, hp: 20, push: 8, density: 0.0011, score: 700, toughness: 0.9 },
  // Le pavoisier arrête de son pavois les tirs tendus qui le frappent de face :
  // prenez-le par le haut (tir en cloche, trébuchet), ou faites-lui tomber le toit dessus.
  shieldbearer: { w: 32, h: 52, hp: 50, push: 22, density: 0.0016, score: 900, toughness: 1.6 },
  // Le porte-étendard galvanise ses voisins (ils encaissent bien mieux) : abattez-le d'abord.
  bannerman: { w: 28, h: 54, hp: 30, push: 14, density: 0.0013, score: 1000, toughness: 1.2 },
  // Le sapeur répare entre deux tirs le bloc le plus abîmé qu'il peut atteindre.
  engineer: { w: 28, h: 48, hp: 30, push: 14, density: 0.0013, score: 800, toughness: 1.1 },
  // v6.0 : un général de Mordrac (voir General.js) — plusieurs vies, des ordres entre les tirs.
  general: { w: 34, h: 62, hp: 90, push: 28, density: 0.002, score: 5000, toughness: 2.4 },
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
 * - element  : tir élémentaire (v6.1) : feu, givre, orage, poison. Il frappe
 *              mou (impact faible, et jamais plus de ELEMENT_HIT_CAP des points
 *              de vie d'un défenseur) : c'est l'élément qui agit, et on le voit.
 */
export const PROJECTILE_TYPES = deepFreeze({
  stone: { radius: 17, density: 0.009, impact: 1, ignites: false, explodes: false, splits: false },
  boulder: { radius: 25, density: 0.015, impact: 1.4, ignites: false, explodes: false, splits: false },
  fire: { radius: 16, density: 0.009, impact: 0.2, ignites: true, explodes: false, splits: false, element: 'fire' },
  bomb: { radius: 18, density: 0.010, impact: 0.8, ignites: false, explodes: true, splits: false },
  split: { radius: 15, density: 0.009, impact: 1, ignites: false, explodes: false, splits: true },
  // v5.0 : boulet de givre. Il gèle tout ce qui l'entoure à l'impact (voir FROST).
  frost: { radius: 17, density: 0.010, impact: 0.2, ignites: false, explodes: false, splits: false, frost: true, element: 'frost' },
  // v5.1 : carreau de baliste. Fin, très dense (masse ≈ 20 : il perce la pierre),
  // peu sensible au vent ; il traverse la roche des montagnes (`bolt`).
  bolt: { radius: 9, density: 0.08, impact: 2.2, ignites: false, explodes: false, splits: false, bolt: true },
  // v6.1 : botte de paille. Grosse et légère, elle ne casse rien, ne tue
  // personne et ne fait jamais sauter un baril : elle pousse (`soft`).
  // Très prise par le vent ; elle s'enflamme au contact du feu.
  bale: { radius: 21, density: 0.0028, impact: 0, ignites: false, explodes: false, splits: false, soft: true },
  // v6.1 : orbe d'orage. Le choc électrique saute de défenseur en défenseur
  // (le fer le relaie, l'armure le conduit) et les sonne (voir THUNDER).
  thunder: { radius: 16, density: 0.009, impact: 0.2, ignites: false, explodes: false, splits: false, thunder: true, element: 'thunder' },
  // v6.1 : pot de poison. Il éclate en un nuage qui dérive avec le vent et
  // ronge les défenseurs qui y restent (voir POISON).
  poison: { radius: 16, density: 0.008, impact: 0.05, ignites: false, explodes: false, splits: false, poison: true, element: 'poison' },
})

/** Un tir élémentaire n'ôte jamais plus que cette part des points de vie d'un défenseur (v6.1). */
export const ELEMENT_HIT_CAP = 0.25

/**
 * Orbe d'orage (v6.1) : sauts (HOPS) d'au plus REACH px de défenseur en
 * défenseur, dégâts dégressifs (part des points de vie d'un soldat : le
 * premier frappé y laisse presque tout, les suivants de moins en moins), sonné
 * STUN_MS ; l'armure de métal conduit (×CONDUCT), un bloc de fer relaie le
 * choc (il ne compte pas comme un saut). Sous la pluie (Tempête) : un saut et
 * une portée de plus.
 */
export const THUNDER = deepFreeze({ HOPS: 4, REACH: 150, DAMAGE: [0.85, 0.65, 0.5, 0.4, 0.3], STUN_MS: 1500, CONDUCT: { knight: 1.5, shieldbearer: 1.3, general: 1.3 }, RAIN_HOPS: 1, RAIN_REACH: 1.4 })

/**
 * Pot de poison (v6.1) : nuage de rayon RADIUS qui dure MS, dérive avec le
 * vent (DRIFT × le vent local, en px par image), ronge DPS points de vie par
 * seconde aux défenseurs dedans, et encore LINGER_MS après qu'ils en sont sortis.
 */
export const POISON = deepFreeze({ RADIUS: 110, MS: 7000, DRIFT: 1.1, DPS: 14, LINGER_MS: 1500 })

/**
 * Givre (v5.0) : rayon de gel à l'impact, durée du gel et fragilité des objets
 * gelés (multiplicateur des dégâts de choc et d'explosion). Le feu au contact
 * d'un objet gelé le fait éclater en vapeur : l'eau bouillante ébouillante les
 * défenseurs proches (STEAM_RADIUS) et le choc thermique fend le bloc (SHOCK,
 * part de ses points de vie).
 */
export const FROST = deepFreeze({ RADIUS: 120, MS: 16000, BRITTLE: 3, STEAM_RADIUS: 95, SHOCK: 0.6 })

export const PROJECTILE_NAMES = Object.freeze(Object.keys(PROJECTILE_TYPES))

/**
 * Créatures volantes (v5.0 ; v6.2 : au catalogue, sans moteur physique).
 *  - corbeau : une nuée qui patrouille devant le château. Un projectile qui la
 *    traverse est stoppé net (il retombe), le corbeau y laisse des plumes ;
 *  - vouivre : un petit dragon qui porte un pot de feu grégeois. Abattue, elle
 *    lâche son pot, qui s'écrase en flammes sur ce qui se trouve dessous :
 *    un tir d'adresse qui peut incendier tout un château.
 *
 * - radius : rayon de collision ; brake : part de la vitesse que garde le
 *   projectile qui la heurte ; score : points accordés.
 */
export const FLYER_TYPES = deepFreeze({
  crow: { radius: 20, brake: 0.12, score: 150, w: 54, h: 40 },
  wyvern: { radius: 32, brake: 0.25, score: 400, w: 110, h: 76 },
})
export const FLYER_NAMES = Object.freeze(Object.keys(FLYER_TYPES))
