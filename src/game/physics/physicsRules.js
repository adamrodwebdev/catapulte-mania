/**
 * Règles physiques du jeu (v6.2) : les délais, seuils et parts qui décident de
 * ce que fait un choc (boulet brûlant, percée, puissance d'un tir, défenseurs).
 * Sans moteur physique (pas de Matter), comme castleRules.js. PhysicsWorld.js
 * les réexporte sous les mêmes noms.
 */

/** Durée pendant laquelle un boulet enflammé reste brûlant après son premier choc (ms). */
export const HOT_BALL_MS = 4500

/**
 * Percée (v5.0) : un projectile dont le choc suffit à détruire le bloc qu'il
 * frappe le traverse au lieu de s'y arrêter, en gardant l'énergie qui reste
 * (vitesse × √(1 − résistance / choc), un peu amortie). Un boulet lourd perce
 * ainsi plusieurs murs d'affilée ; une pierre légère s'arrête au premier.
 */
export const BREACH_DAMPING = 0.9
/** Matériaux légers (résistance ≤ ce seuil) : n'importe quel projectile peut les percer. */
export const BREACH_LIGHT_HP = 300
/** Masse à partir de laquelle un projectile perce aussi la pierre (rocher : ≈ 29, pierre : ≈ 8). */
export const BREACH_HEAVY_MASS = 20

/** Délai entre deux revers de l'ogre (ms). La marche des défenseurs : voir ../ai/. */
export const OGRE_SWAT_MS = 900

/** Un objet repoussé par un défenseur ne blesse personne pendant ce délai (ms, v6.1). */
export const PUSHED_SAFE_MS = 700
/** Même objet, même défenseur : un seul coup par contact prolongé dans ce délai (ms). */
export const RESTRIKE_MS = 250
/** Renversé (v6.1) : part de ses points de vie qu'il perd en tombant, avant de se relever. */
export const KNOCKDOWN_SHARE = 0.35
/**
 * Puissance d'un tir (v6.1) : au-delà de MIN_ENERGY, le bloc frappé reçoit en
 * plus SHARE de la quantité de mouvement du projectile, dans le sens du tir (les
 * murs encaissent le coup, les blocs volent). Jamais vers le bas : un tir en
 * cloche n'enfonce pas le bloc dans le sol.
 */
export const POWER = Object.freeze({ MIN_ENERGY: 150, SHARE: 0.3 })
