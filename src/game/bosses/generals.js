import { deepFreeze } from '../../core/utils/Guard.js'

/**
 * Les généraux de Mordrac (v6.0) : un par fin de chapitre, chacun dans son
 * donjon (deuxième étape du grand siège). Mordrac lui-même tient le Trône.
 *
 * Données pures (aucune dépendance au moteur) : le catalogue sert au jeu, au
 * HUD, à la Chronique et aux tests.
 *
 *  - `level`   : niveau de campagne (fin de chapitre) où il se bat ;
 *  - `lives`   : vies en Normal (une de moins en Facile, au moins une) ;
 *  - `skills`  : ses ordres, joués à tour de rôle entre deux tirs du joueur
 *                (annoncés à l'avance : voir WarCouncil) ;
 *  - `look`    : son apparence en jeu (dessin procédural, voir
 *                assets/procedural/warlords.js) : arme (et main gauche),
 *                tenue (`garb`), casque, barbe, couleurs (peau, cheveux,
 *                armure, cape, ornement, métal, fourrure), emblème, carrure ;
 *  - `raid`    : ce que portent les pillards qu'il envoie (s'il en envoie).
 *
 * Textes : `generals.<id>.*` (nom, titre, devise, répliques) et
 * `characters.<id>` pour la Chronique.
 */

/** @typedef {'rebuild'|'warcry'|'shieldWall'|'saboteur'|'bomb'|'firePot'|'curfew'|'fireArrows'|'flee'|'hireRaider'|'sandstorm'|'falcons'|'boulders'|'frostBreath'|'iceRampart'|'lightning'|'hurricane'} SkillId */

export const GENERALS = deepFreeze({
  rufus: {
    chapter: 1,
    level: 10,
    lives: 2,
    skills: ['rebuild', 'warcry'],
    look: { weapon: 'axe', garb: 'leather', fur: '#7a5a3e', helm: 'cap', beard: 'full', skin: '#e2b48c', hair: '#a2552a', armor: '#7a5a3a', cape: '#56743a', trim: '#c9a25a', bulk: 1.12 },
  },
  galeran: {
    chapter: 2,
    level: 20,
    lives: 2,
    skills: ['shieldWall', 'saboteur'],
    raid: 'blow',
    look: { weapon: 'sword', offhand: 'shield', garb: 'plate', helm: 'great', beard: 'none', skin: '#e7bf9a', hair: '#3b2a20', armor: '#9aa3ad', cape: '#2f4b7c', trim: '#d4a537', bulk: 1.05 },
  },
  bertille: {
    chapter: 3,
    level: 30,
    lives: 2,
    skills: ['bomb', 'firePot'],
    look: { weapon: 'bomb', garb: 'apron', helm: 'goggles', beard: 'none', skin: '#f0c7a4', hair: '#c4462c', armor: '#5b4636', cape: '#8a2f24', trim: '#e9b04a', bulk: 0.94 },
  },
  morgane: {
    chapter: 4,
    level: 40,
    lives: 3,
    skills: ['curfew', 'fireArrows'],
    look: { weapon: 'staff', garb: 'robe', helm: 'circlet', beard: 'none', skin: '#e9d2c4', hair: '#1c1726', armor: '#2a2638', cape: '#4b2a5c', trim: '#b8b4c8', bulk: 0.92 },
  },
  anselme: {
    chapter: 5,
    level: 50,
    lives: 3,
    skills: ['flee', 'rebuild'],
    look: { weapon: 'dagger', offhand: 'dagger', garb: 'leather', helm: 'hood', beard: 'short', skin: '#c9b28a', hair: '#4a4a2a', armor: '#4f5b3a', cape: '#3d4a2c', trim: '#a9a26a', bulk: 1.0 },
  },
  ilsa: {
    chapter: 6,
    level: 60,
    lives: 3,
    skills: ['hireRaider', 'sandstorm'],
    raid: 'fire',
    look: { weapon: 'saber', garb: 'scale', helm: 'veil', beard: 'none', skin: '#c08a5e', hair: '#241a12', armor: '#b48a4a', cape: '#a3322b', trim: '#e2c36b', bulk: 0.95 },
  },
  hugues: {
    chapter: 7,
    level: 70,
    lives: 3,
    skills: ['falcons', 'boulders'],
    look: { weapon: 'falcon', garb: 'mail', helm: 'feathered', beard: 'short', skin: '#e0b896', hair: '#6b5a44', armor: '#6f7680', cape: '#4a5d77', trim: '#dfe3e8', bulk: 1.0 },
  },
  ulric: {
    chapter: 8,
    level: 80,
    lives: 3,
    skills: ['frostBreath', 'iceRampart'],
    look: { weapon: 'axe', garb: 'plate', fur: '#eef2f6', metal: '#a9c4dc', emblem: 'flake', old: true, helm: 'fur', beard: 'braided', skin: '#ead9cf', hair: '#dfe6ee', armor: '#8fa7bd', cape: '#dfe8f0', trim: '#7fb3d9', bulk: 1.08 },
  },
  baudouin: {
    chapter: 9,
    level: 90,
    lives: 3,
    skills: ['lightning', 'hurricane'],
    look: { weapon: 'hammer', garb: 'plate', emblem: 'bolt', helm: 'horned', beard: 'full', skin: '#dcae8a', hair: '#2b2b33', armor: '#3f4654', cape: '#2a3550', trim: '#f1cf6e', bulk: 1.1 },
  },
  mordrac: {
    chapter: 10,
    level: 100,
    lives: 4,
    skills: ['shieldWall', 'hireRaider', 'warcry', 'flee'],
    raid: 'smash',
    look: { weapon: 'blackblade', garb: 'plate', metal: '#4a4458', emblem: 'eye', helm: 'crown', beard: 'short', skin: '#d8b7a0', hair: '#14111c', armor: '#1f1a2b', cape: '#5a1622', trim: '#d4a537', bulk: 1.06 },
  },
})

export const GENERAL_IDS = Object.freeze(Object.keys(GENERALS))

/**
 * Icône de chaque ordre (barre du général, introduction du niveau,
 * bannières). Données pures : l'interface les lit sans charger le moteur.
 */
export const SKILL_ICONS = Object.freeze({
  rebuild: 'hammer',
  warcry: 'crown',
  shieldWall: 'shield',
  saboteur: 'fist',
  hireRaider: 'swords',
  bomb: 'bomb',
  firePot: 'flame',
  curfew: 'moon',
  fireArrows: 'volley',
  flee: 'arrow',
  sandstorm: 'wind',
  falcons: 'feather',
  boulders: 'boulder',
  frostBreath: 'snowflake',
  iceRampart: 'wall',
  lightning: 'bolt',
  hurricane: 'wind',
})

/** Toutes les compétences existantes (une stratégie chacune, voir skills.js). */
export const SKILL_IDS = Object.freeze([
  'rebuild',
  'warcry',
  'shieldWall',
  'saboteur',
  'bomb',
  'firePot',
  'curfew',
  'fireArrows',
  'flee',
  'hireRaider',
  'sandstorm',
  'falcons',
  'boulders',
  'frostBreath',
  'iceRampart',
  'lightning',
  'hurricane',
])

/**
 * Vies d'un général selon la difficulté : une de moins en Facile (au moins
 * une), autant en Normal et en Difficile (le Difficile ôte déjà un tir).
 * @param {string} id
 * @param {string} difficulty
 */
export function livesFor(id, difficulty) {
  const base = GENERALS[id].lives
  return difficulty === 'easy' ? Math.max(1, base - 1) : base
}

/** Général qui se bat dans ce niveau (ou null). */
export function generalOfLevel(levelId) {
  return GENERAL_IDS.find((id) => GENERALS[id].level === levelId) ?? null
}
