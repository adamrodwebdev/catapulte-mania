import { createMode } from '../game/modes/modes.js'
import { Tracks } from '../game/levels/Tracks.js'
import { LevelRepository } from '../game/levels/LevelRepository.js'
import { ArenaRepository } from '../game/levels/ArenaRepository.js'
import { DuelRepository } from '../game/levels/DuelRepository.js'
import { GENERALS, livesFor } from '../game/bosses/generals.js'
import { TREBUCHET_UNLOCK } from '../game/Trebuchet.js'
import { ballistaUnlocked, BALLISTA_AIM } from '../game/Ballista.js'
import { AIM } from '../game/aim.js'

/**
 * Préparation d'une partie (v6.2, sortie de l'écran de jeu) : les règles qui
 * décident, avant le premier tir, du niveau, de la difficulté, de l'accès,
 * des règles du mode et de l'engin. Fonctions pures : elles lisent le mode,
 * le profil (copie d'affichage) et la partie demandée (`state.match`) ;
 * l'écran ne fait qu'appliquer leur réponse.
 */

/** Modes à deux sur le même appareil. */
export const MULTI_MODES = Object.freeze(['duel', 'hotseat', 'versus', 'coop'])
/** Défis : défi du jour, défi reçu par lien, coupe de la semaine (mêmes règles pour tous). */
export const DEFI_MODES = Object.freeze(['daily', 'challenge', 'cup'])

export const isMultiMode = (mode) => MULTI_MODES.includes(mode)
export const isDefiMode = (mode) => DEFI_MODES.includes(mode)
/** Modes qui suivent la campagne (récit, répliques) : seul ou à deux. */
export const isCampaignMode = (mode) => mode === 'story' || mode === 'coop'
/** Parcours à médailles de la maîtrise (v6.2) : Campagne héroïque et Terres du Duc. */
export const isMedalMode = (mode) => mode === 'heroic' || mode === 'duke'

/** Le parcours d'un mode (records, nombre de niveaux), voir Tracks. */
export const trackFor = (mode) => Tracks.forMode(mode)

/**
 * Le niveau de la partie : château de l'atelier, arène du face-à-face,
 * château de duel, ou niveau du parcours du mode.
 * @param {string} mode
 * @param {{ levelId: number, arenaId?: number, duelId?: number, customLevel?: object | null }} where
 */
export function levelFor(mode, { levelId, arenaId, duelId, customLevel = null }) {
  if (mode === 'custom' && customLevel) return customLevel
  if (mode === 'versus') return ArenaRepository.get(arenaId)
  if (mode === 'duel') return DuelRepository.get(duelId)
  return trackFor(mode).level(levelId)
}

/**
 * Difficulté de la partie (comme pour la session) : à deux, tout se joue en
 * Difficile (deux humains, des châteaux à leur mesure) ; défis et atelier en
 * Normal pour tout le monde (et sans profil) ; sinon celle du profil.
 */
export function matchDifficulty(mode, profile) {
  if (isMultiMode(mode)) return 'hard'
  return isDefiMode(mode) || mode === 'custom' || !profile ? 'normal' : profile.difficulty
}

/** Niveaux réussis par le profil (campagne solo, ou à deux si plus avancée) : pouvoirs et engins. */
export function completedLevels(mode, profile) {
  return Math.max(profile?.completed ?? 0, mode === 'coop' ? (profile?.coop?.completed ?? 0) : 0)
}

/** Noms des deux joueurs (modes à deux) : ceux donnés, sinon « Joueur 1 » et « Joueur 2 ». */
export function playerNames(players, defaultName) {
  return players.length === 2 ? players : [defaultName(1), defaultName(2)]
}

/**
 * Défis : le défi du jour et la coupe exigent un profil (la série, la
 * médaille), le défi par lien un code validé.
 * @returns {boolean} vrai si la partie ne peut pas avoir lieu (retour à l'accueil)
 */
export function defiMissing(mode, profile, match) {
  if (mode === 'daily') return !profile || !match.daily
  if (mode === 'cup') return !profile || !match.cup
  if (mode === 'challenge') return !match.challenge
  return false
}

/**
 * Contrôle d'accès : la campagne (seul ou à deux) et les parcours à médailles
 * suivent la progression ; le mode libre exige un niveau terminé.
 * @param {object | null} rec record du niveau sur le parcours du mode (copie d'affichage)
 * @returns {string | null} écran où renvoyer le joueur, ou null si la partie peut commencer
 */
export function accessDenied(mode, profile, rec) {
  const locked = ((isCampaignMode(mode) || isMedalMode(mode)) && !rec?.unlocked) || (mode === 'free' && !rec?.completed)
  if (!locked) return null
  return profile ? (mode === 'coop' ? 'multiplayer' : 'levels') : 'profiles'
}

/*
 * Règles de chaque mode (patron Stratégie, voir modes.js) : ce que la fabrique
 * reçoit, selon le mode. Les défis et l'atelier ignorent les améliorations du
 * profil ; le siège sans fin reprend la main du siège en cours ; « chacun sa
 * partie » ne joue que le joueur dont c'est le tour.
 */
const ruleOptions = {
  personal: ({ effects, completedLevels }) => ({ effects, completedLevels }),
  plain: ({ completedLevels }) => ({ completedLevels }),
  duo: ({ players, completedLevels }) => ({ players, completedLevels }),
  endless: ({ effects, completedLevels, endless }) => ({ effects, completedLevels, shots: endless.shots, bonusAmmo: endless.loadout.ammo, supply: endless.loadout.supply }),
  hotseat: ({ players, hotseatPlayer, completedLevels }) => ({ players: [players[hotseatPlayer]], completedLevels }),
}
const RULE_OPTIONS = Object.freeze({
  story: ruleOptions.personal,
  free: ruleOptions.personal,
  heroic: ruleOptions.personal,
  duke: ruleOptions.personal,
  daily: ruleOptions.plain,
  challenge: ruleOptions.plain,
  cup: ruleOptions.plain,
  custom: ruleOptions.plain,
  endless: ruleOptions.endless,
  hotseat: ruleOptions.hotseat,
  duel: ruleOptions.duo,
  versus: ruleOptions.duo,
  coop: ruleOptions.duo,
})

/**
 * Règles de la partie.
 * @param {string} mode
 * @param {{ completedLevels: number, effects?: object, players: string[], hotseatPlayer?: number, endless?: { shots: number, loadout: { ammo: object, supply: number } } | null }} ctx
 */
export function matchRules(mode, ctx) {
  const options = RULE_OPTIONS[mode]
  if (!options) throw new TypeError(`unknown mode ${mode}`)
  return createMode(mode, options(ctx))
}

/** Coup de pouce discret (v6.0) : campagne seule, premier chapitre, après des défaites (voir Frontier). */
export function matchLuck(mode, profile, slot, levelId) {
  return mode === 'story' && profile ? (slot?.luckFor(levelId, profile.difficulty) ?? 0) : 0
}

/* ---------- Engin : catapulte, trébuchet ou baliste ---------- */

/** Niveau d'apprentissage du trébuchet, au premier passage : le trébuchet est imposé. */
export function isTrebuchetLesson({ mode, level, record, settings }) {
  if (mode !== 'story' || level?.tutorial !== 'engine:trebuchet') return false
  return !record?.completed && settings.tutorials !== false
}

/** Le joueur choisit-il son engin ? Débloqué après le niveau 3 ; jamais au face-à-face (il tire depuis l'arrière) ni aux défis. */
export function canChooseEngine({ mode, lesson, completed }) {
  return mode !== 'versus' && !isDefiMode(mode) && !lesson && completed >= TREBUCHET_UNLOCK
}

/** Baliste (v5.1) : réservée aux profils qui ont presque tout gagné (BALLISTA_UNLOCK). */
export function ballistaReady(completed, stars) {
  return ballistaUnlocked(completed, stars)
}

/**
 * Engin de la partie. Défis : imposé, le même pour tous ; apprentissage du
 * trébuchet : le trébuchet ; sinon le choix du joueur, s'il en a un.
 * @param {{ mode: string, match: object, lesson: boolean, choice: boolean, preferred: string, ballista: boolean }} opts
 *   preferred : engin des réglages ; ballista : baliste débloquée
 */
export function engineFor({ mode, match, lesson, choice, preferred, ballista }) {
  if (mode === 'daily') return match.daily?.engine ?? 'catapult'
  if (mode === 'cup') return 'catapult'
  if (mode === 'challenge') return match.challenge?.engine ?? 'catapult'
  if (lesson) return 'trebuchet'
  if (choice && preferred === 'ballista' && ballista) return 'ballista'
  return choice && preferred === 'trebuchet' ? 'trebuchet' : 'catapult'
}

/** Bornes de l'angle des curseurs de visée : la baliste vise de 0 à 60°, la catapulte de 5 à 80°. */
export function aimRange(engine) {
  const aim = engine === 'ballista' ? BALLISTA_AIM : AIM
  return { min: aim.MIN_ANGLE, max: aim.MAX_ANGLE }
}

/* ---------- Grands sièges (v6.0) ---------- */

/**
 * Introduction d'un grand siège : le général qui attend à la dernière étape,
 * ses vies et ses ordres. Campagne (seul ou à deux), Campagne héroïque et
 * Terres du Duc (v6.2 : la Citadelle de Mordrac).
 */
export function introGeneral(mode, level, difficulty) {
  const id = level?.general
  if (!id || !(isCampaignMode(mode) || isMedalMode(mode)) || (level.stageCount ?? 1) < 2) return null
  return { id, stages: level.stageCount, lives: livesFor(id, difficulty), skills: GENERALS[id].skills }
}

/** Musique de boss : un grand siège de la campagne ou d'un parcours à médailles (la tension reste élevée). */
export function isBossLevel(mode, levelId, level) {
  if (!(isCampaignMode(mode) || isMedalMode(mode))) return false
  return trackFor(mode).isBoss(levelId, level)
}

/** Écran où revenir en quittant la partie. */
export function exitScreen(mode, match) {
  if (mode === 'custom') return match.custom?.fromEditor ? 'editor' : 'home'
  if (isMultiMode(mode)) return 'multiplayer'
  if (isDefiMode(mode)) return 'home'
  return mode === 'endless' ? 'modes' : 'levels'
}

/**
 * Défi par lien : le score à battre, recalculé par le moteur en rejouant le
 * tir de l'ami (jamais lu dans le lien). Le moteur est chargé à la demande.
 * @param {{ levelId: number, engine: string, actions: Array<object> }} run
 * @returns {Promise<number>}
 */
export async function challengeTarget(run) {
  const [{ GameSession }, { ReplayPlayer }] = await Promise.all([import('../game/GameSession.js'), import('../game/replay/ReplayPlayer.js')])
  const session = new GameSession(LevelRepository.get(run.levelId), { difficulty: 'normal', completedLevels: 0, reducedMotion: true, engine: run.engine, replay: true }, createMode('challenge', {}))
  let ended = null
  session.on('end', (e) => (ended = e))
  new ReplayPlayer(session, run.actions).runToEnd()
  const score = ended ? ended.scores[0] : session.score.current
  session.destroy()
  return score
}
