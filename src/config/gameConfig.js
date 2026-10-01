import { deepFreeze } from '../core/utils/Guard.js'

/**
 * Constantes globales du jeu. Gelées : impossible de les modifier à l'exécution.
 */
export const GAME = deepFreeze({
  LEVEL_COUNT: 40,
  LEVELS_PER_CHAPTER: 10,
  SAVE_SLOTS: 3,
  SAVE_VERSION: 1,
  LANGUAGES: ['fr', 'en', 'id'],
  DEFAULT_LANGUAGE: 'fr',
  DIFFICULTIES: ['easy', 'normal', 'hard'],
  /** Score maximum théorique d'un niveau (garde-fou contre les valeurs absurdes). */
  MAX_LEVEL_SCORE: 200000,
  /** Mode démo : seuls les premiers niveaux sont jouables. */
  DEMO_LEVEL_COUNT: 8,
})

/**
 * Réglages par difficulté.
 * - shotDelta    : tirs en plus / en moins par rapport au niveau de base
 * - windFactor   : intensité du vent
 * - targetHp     : multiplicateur de résistance des soldats
 * - scoreFactor  : multiplicateur de score final
 */
export const DIFFICULTY = deepFreeze({
  easy: { shotDelta: 2, windFactor: 0.4, targetHp: 0.75, scoreFactor: 0.75 },
  normal: { shotDelta: 0, windFactor: 1, targetHp: 1, scoreFactor: 1 },
  hard: { shotDelta: -1, windFactor: 1.5, targetHp: 1.35, scoreFactor: 1.5 },
})

/** Est-on dans la build de démonstration ? (constante remplacée au build par Vite) */
export const IS_DEMO = typeof __DEMO__ !== 'undefined' && __DEMO__ === true
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'
export const PLAYABLE_LEVELS = IS_DEMO ? GAME.DEMO_LEVEL_COUNT : GAME.LEVEL_COUNT
