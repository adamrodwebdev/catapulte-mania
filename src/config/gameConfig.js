import { deepFreeze } from '../core/utils/Guard.js'

/**
 * Constantes globales du jeu. Gelées : impossible de les modifier à l'exécution.
 */
export const GAME = deepFreeze({
  LEVEL_COUNT: 100,
  LEVELS_PER_CHAPTER: 10,
  SAVE_SLOTS: 3,
  SAVE_VERSION: 9,
  LANGUAGES: ['fr', 'en', 'id'],
  DEFAULT_LANGUAGE: 'fr',
  DIFFICULTIES: ['easy', 'normal', 'hard'],
  /** Score maximum théorique d'un niveau (garde-fou contre les valeurs absurdes). */
  MAX_LEVEL_SCORE: 200000,
  /** Mode démo : seuls les premiers niveaux sont jouables. */
  DEMO_LEVEL_COUNT: 10,
})

/**
 * Réglages par difficulté.
 * - shotDelta    : tirs en plus / en moins par rapport au niveau de base
 * - windFactor   : vent tiré au sort (part du vent max du niveau). En Difficile,
 *                  sa puissance vient surtout du profil de vent (WindField : ×2,4,
 *                  altitude, rafales), d'où un facteur plus modéré qu'avant la v3.6.
 * - targetHp     : multiplicateur de résistance des soldats
 * - scoreFactor  : multiplicateur de score final
 * - ammoFactor   : part des munitions spéciales du niveau (arrondi inférieur)
 */
export const DIFFICULTY = deepFreeze({
  easy: { shotDelta: 2, windFactor: 0.4, targetHp: 0.75, scoreFactor: 0.75, ammoFactor: 1 },
  normal: { shotDelta: 0, windFactor: 1, targetHp: 1, scoreFactor: 1, ammoFactor: 1 },
  hard: { shotDelta: -1, windFactor: 1.2, targetHp: 1.35, scoreFactor: 1.5, ammoFactor: 0.5 },
})

/**
 * Éditeur du jeu (page « Confidentialité et mentions »). Le contact est
 * facultatif : laissé vide, la ligne n'est pas affichée.
 */
export const LEGAL = deepFreeze({
  publisher: 'AdamRodWebDev',
  contact: 'adamrodwebdev@gmail.com',
})

/** Est-on dans la build de démonstration ? (constante remplacée au build par Vite) */
export const IS_DEMO = typeof __DEMO__ !== 'undefined' && __DEMO__ === true

/**
 * Publicités autorisées dans ce build ? Non pour la période de test d'un portail
 * (CrazyGames « Basic launch » : aucune pub, aucun bouton vidéo affiché).
 * Constante remplacée au build (variable CTC_ADS=off).
 */
export const ADS_ENABLED = typeof __ADS__ === 'undefined' || __ADS__ !== false
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'
/**
 * Plateforme visée par ce build (v3.5) : 'web' (notre site, sans publicité),
 * 'crazygames' ou 'poki' (portails, avec leur SDK). Constante remplacée au build.
 */
export const TARGET = typeof __TARGET__ !== 'undefined' && ['web', 'crazygames', 'poki'].includes(__TARGET__) ? __TARGET__ : 'web'
export const IS_PORTAL = TARGET !== 'web' && !IS_DEMO
export const PLAYABLE_LEVELS = IS_DEMO ? GAME.DEMO_LEVEL_COUNT : GAME.LEVEL_COUNT
