import { deepFreeze } from '../../core/utils/Guard.js'

/**
 * Constantes physiques et dimensions du monde (en unités monde ≈ pixels à zoom 1).
 * L'axe Y est orienté vers le bas, comme le canvas.
 */
export const WORLD = deepFreeze({
  WIDTH: 2600,
  TOP: -700,
  GROUND_Y: 900,
  BOTTOM: 1040,
  /** Pas fixe de simulation : 120 Hz (2 sous-pas par image) contre l'effet tunnel. */
  STEP_MS: 1000 / 120,
  MAX_STEPS_PER_FRAME: 8,
  /** Gravité Matter.js (y = 1 ⇒ ≈ 0,278 px/pas² à 60 Hz). */
  GRAVITY: 1,
  GRAVITY_SCALE: 0.001,
  /** Accélération max du vent, en fraction de la gravité. */
  WIND_RATIO: 0.07,
  /** Vitesse de choc (px/pas à 60 Hz) sous laquelle un contact ne fait pas de dégâts. */
  IMPACT_THRESHOLD: 1.6,
  /**
   * Personnages fragiles (v3) : après le premier tir, la MOINDRE collision avec
   * un objet en mouvement (bloc, projectile, baril) tue. Seuils très bas : seul
   * un frôlement quasi immobile est ignoré. Ce sont les châteaux qui protègent.
   */
  CONTACT_KILL_SPEED: 0.5,
  CONTACT_KILL_REL: 0.5,
  /**
   * Coincement : une cible sur laquelle repose un bloc (mur, plancher, toit),
   * ou prise en étau entre deux blocs, meurt écrasée. Distance (px) des points
   * de contrôle autour de la cible et intervalle de contrôle (pas de simulation).
   */
  PIN_PROBE: 3,
  PIN_CHECK_EVERY: 12,
  /**
   * Appuis : toutes les 30 étapes (0,25 s), un corps « endormi » qui n'a plus
   * rien sous lui est réveillé et retombe. Rien ne flotte jamais dans le vide.
   */
  SUPPORT_CHECK_EVERY: 30,
  /** Une cible qui retombe à cette vitesse (ou plus) sur un obstacle meurt de sa chute. */
  TARGET_FALL_SPEED: 3,
  /** Une cible renversée (inclinaison > 70°) pendant ce délai est mise hors de combat. */
  KNOCKOUT_ANGLE: 1.2,
  KNOCKOUT_MS: 1500,
  /** Délai pendant lequel la structure se stabilise sans subir de dégâts (ms). */
  SETTLE_MS: 900,
  /** Hors de ces limites, un corps est considéré comme sorti du monde. */
  KILL_MARGIN: 400,
})

/** Catégories de collision (masques Matter.js). */
export const CATEGORY = deepFreeze({
  STATIC: 0x0001,
  BLOCK: 0x0002,
  TARGET: 0x0004,
  PROJECTILE: 0x0008,
  DEBRIS: 0x0010,
  /** Créatures volantes (capteurs : elles arrêtent les projectiles sans les faire rebondir). */
  FLYER: 0x0020,
  /** Roche du décor (v5.1) : les carreaux de baliste la traversent (masque de collision). */
  TERRAIN: 0x0040,
})
