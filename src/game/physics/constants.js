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
  /**
   * Points de vie des défenseurs (v6.1, voir FallingObjects.js) : un contact
   * plus lent que SAFE ne fait rien ; au-delà, le coup vaut
   * K × dureté × ½·min(masse, MASS_CAP)·(vitesse − SAFE)².
   */
  HIT: { SAFE: 0.7, K: 4, MASS_CAP: 60 },
  /**
   * Repousser (v6.1) : ce qui arrive plus lentement que SPEED, et dont la
   * quantité de mouvement ne dépasse pas la force du défenseur, est renvoyé
   * (SHOVE : vitesse donnée à un objet de masse 8, moins pour plus lourd).
   * Un défenseur ne repousse qu'une fois par COOLDOWN_MS.
   */
  PUSH: { SPEED: 1.8, COOLDOWN_MS: 500, SHOVE: 5.5 },
  /** Chute (v6.1) : sans dommage jusqu'à SAFE ; mortelle à SAFE + LETHAL_DV (× √résistance). */
  FALL: { SAFE: 4, LETHAL_DV: 4.5 },
  /**
   * Coup encaissé (v6.1) : le défenseur est repoussé (KNOCK × part de ses
   * points de vie perdue, au plus KNOCK_MAX) et sonné STAGGER_MS (il ne
   * repousse plus rien).
   */
  STAGGER_MS: 600,
  KNOCK: 7,
  KNOCK_MAX: 4.5,
  /** Une cible renversée (inclinaison > 70°) pendant ce délai est mise hors de combat. */
  KNOCKOUT_ANGLE: 1.2,
  KNOCKOUT_MS: 1500,
  /** Délai pendant lequel la structure se stabilise sans subir de dégâts (ms). */
  SETTLE_MS: 900,
  /** Hors de ces limites, un corps est considéré comme sorti du monde. */
  KILL_MARGIN: 400,
  /**
   * Un défenseur projeté à plus de FIELD_MARGIN au-delà du bord droit du monde
   * quitte le champ de bataille (v6.2) : il compte comme tombé. Il y restait
   * hors champ et hors d'atteinte (relevé par scripts/check-levels.mjs).
   * Les rondes s'arrêtent avant : un garde posté au plus loin ne s'en approche pas.
   */
  FIELD_MARGIN: 80,
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
