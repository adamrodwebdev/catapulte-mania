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
   * Écrasement : une cible touchée par un bloc en mouvement meurt sur le coup.
   * Vitesse minimale du bloc et vitesse de rapprochement (mêmes unités que
   * IMPACT_THRESHOLD) ; en dessous, c'est un simple frôlement.
   */
  CRUSH_BLOCK_SPEED: 2.6,
  CRUSH_REL_SPEED: 1.6,
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
})
