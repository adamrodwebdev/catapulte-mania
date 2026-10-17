import { GAME, IS_DEMO, PLAYABLE_LEVELS } from '../config/gameConfig.js'
import { CUP } from '../game/daily/WeeklyCup.js'
import { medalFor } from '../game/progression/Mastery.js'
import { Tracks } from '../game/levels/Tracks.js'

/**
 * Fin de partie (v6.2, sortie de l'écran de jeu) : une petite stratégie par
 * mode ou parcours. Chacune :
 *  - `record(e, ctx)` : enregistre le résultat par les ports du contexte
 *    (`ctx.app.recordResult`…, le tournoi, le siège) et renvoie son bilan ;
 *  - `view(e, outcome, ctx)` : construit le modèle d'affichage du panneau ;
 *  - `announce(view, ctx)` : le texte lu aux lecteurs d'écran ;
 *  - `delay(e, outcome, celebrateMs)` : l'attente avant le bilan (la fin du spectacle).
 * Le module ne connaît ni Vue ni l'application : l'écran fournit le contexte,
 * garde les minuteries et l'état réactif.
 *
 * Contexte (`ctx`) : { mode, t, n, state, app, session, tourney, endlessRun,
 * refreshTourney, refreshEndless, challengeTarget } — `state` : état de
 * l'application (profil, partie, niveau) ; `app` : actions d'enregistrement et
 * `activeSlot` ; `n` : nombres dans la langue courante.
 */

/**
 * Enregistrement d'un résultat : une sauvegarde refusée (profil incohérent,
 * stockage plein) ne doit jamais bloquer la fin de partie ; le bilan s'affiche
 * alors avec l'avis « non enregistré ».
 */
export async function safely(record, fallback) {
  try {
    return await record()
  } catch (err) {
    console.warn('[save]', err)
    return { ...fallback, saved: false }
  }
}

/** Attente avant le bilan : la victoire laisse place au décompte des tirs restants (v6.0). */
const afterVictory = (e, outcome, celebrateMs) => (e.won ? 1400 + celebrateMs : 900)
/** Modes sans victoire ni défaite propres (libre, à deux) : une seule attente. */
const afterRound = (e, outcome, celebrateMs) => 1200 + celebrateMs
const victoryOrDefeat = (extra) => (view, ctx) => (view.won ? `${ctx.t('end.victory')} ${extra(view, ctx)}` : ctx.t('end.defeat'))
const starsSaid = (view, { t }) => t('a11y.stars', { count: view.stars })

/** Campagne : étoiles, or, succès, pouvoir débloqué, maîtrise (v6.2). */
const story = {
  /** L'or de la victoire peut être doublé contre une vidéo (portails). */
  doublesGold: true,
  async record({ result }, { app, state }) {
    const maskBefore = state.profile?.levels[result.levelId]?.ach ?? 0
    const outcome = await safely(() => app.recordResult(result), { newBest: false, unlockedPower: null, gold: 0, newAchievements: 0 })
    return { ...outcome, maskBefore, best: state.profile?.levels[result.levelId]?.best ?? 0 }
  },
  view({ won, result, reason }, outcome, { app }) {
    return {
      kind: 'story',
      won,
      reason: reason ?? null,
      score: result.score,
      stars: result.stars,
      best: outcome.best,
      newBest: won && outcome.newBest,
      unlockedPower: outcome.unlockedPower,
      gold: outcome.gold || 0,
      achMask: outcome.maskBefore,
      achFresh: outcome.newAchievements || 0,
      shotsUsed: result.shotsUsed,
      saved: outcome.saved,
      hasNext: won && result.levelId < PLAYABLE_LEVELS,
      campaignDone: won && result.levelId === GAME.LEVEL_COUNT,
      demoDone: won && IS_DEMO && result.levelId === PLAYABLE_LEVELS,
      // Trois défaites d'affilée (v6.0) : on peut passer au niveau suivant.
      canSkip: !won && Boolean(app.activeSlot?.canSkip(result.levelId)),
      // Toutes les étoiles, tous les succès : Grand Ingénieur du Royaume (v6.2).
      mastery: Boolean(outcome.mastery),
    }
  },
  announce: victoryOrDefeat((view, { t, n }) => `${t('end.score')} ${n(view.score)}. ${starsSaid(view, { t })}`),
  delay: afterVictory,
}

/** Titres des parcours à médailles (bandeau du bilan, parcours achevé). */
const MEDAL_TEXTS = Object.freeze({
  heroic: Object.freeze({ titleKey: 'heroic.title', doneKey: 'heroic.done' }),
  duke: Object.freeze({ titleKey: 'duke.tab', doneKey: 'duke.done' }),
})

/** Campagne héroïque et Terres du Duc (v6.2) : une médaille (bronze, argent, or), ni or ni succès. */
const medal = {
  async record({ result }, { app, state, mode }) {
    const outcome = await safely(() => app.recordMedal(result, mode), { newBest: false, firstClear: false, stars: 0, before: 0 })
    return { ...outcome, best: Tracks.get(mode).record(state.profile, result.levelId)?.best ?? 0 }
  },
  view({ won, result, reason }, outcome, { mode }) {
    const last = Tracks.get(mode).count
    return {
      kind: 'medal',
      track: mode,
      ...MEDAL_TEXTS[mode],
      won,
      reason: reason ?? null,
      score: result.score,
      medal: won ? medalFor(Math.max(1, result.stars)) : null,
      best: outcome.best,
      newBest: won && outcome.newBest,
      shotsUsed: result.shotsUsed,
      saved: outcome.saved !== false,
      hasNext: won && result.levelId < last,
      trackDone: won && result.levelId === last,
    }
  },
  announce: victoryOrDefeat((view, { t }) => t(`heroic.medal.${view.medal}`)),
  delay: afterVictory,
}

/** Campagne à deux : progression commune, meilleur joueur. */
const coop = {
  async record({ result }, { app }) {
    return result ? safely(() => app.recordCoop(result), { newBest: false, firstClear: false }) : { saved: true }
  },
  view({ won, result, renown }, outcome, { session, state }) {
    const [a, b] = renown ?? [0, 0]
    return {
      kind: 'coop',
      won,
      score: result?.score ?? 0,
      stars: result?.stars ?? 0,
      shotsUsed: result?.shotsUsed ?? 0,
      names: session?.players.map((p) => p.name) ?? [],
      renown: [a, b],
      mvp: a === b ? null : a > b ? 0 : 1,
      newBest: won && outcome.newBest,
      saved: outcome.saved !== false,
      hasNext: won && state.levelId < PLAYABLE_LEVELS,
    }
  },
  announce: victoryOrDefeat(starsSaid),
  delay: afterVictory,
}

/** Défi du jour : série, record du jour, récompense de saison, partage. */
const daily = {
  async record({ result }, { app, state }) {
    return result ? safely(() => app.recordDaily(result, state.match.daily.key), { newBest: false, extended: false, reward: null }) : { saved: true }
  },
  view({ won, result, scores }, outcome, { state }) {
    return {
      kind: 'daily',
      won,
      score: result?.score ?? scores?.[0] ?? 0,
      newBest: won && outcome.newBest,
      reward: outcome.reward ?? null,
      streak: outcome.streak ?? state.profile?.daily?.streak ?? 0,
      extended: Boolean(outcome.extended),
      todayBest: state.profile?.daily?.todayBest ?? null,
      saved: outcome.saved !== false,
    }
  },
  announce: victoryOrDefeat((view, { t, n }) => `${t('end.score')} ${n(view.score)}. ${t('daily.streak', { count: view.streak })}`),
  delay: afterVictory,
}

/** Un château de la coupe de la semaine (v6.0) : étoiles, médaille, château suivant. */
const cup = {
  async record({ result }, { app, state }) {
    const { week, index } = state.match.cup
    const outcome = result ? await safely(() => app.recordCup(result, week, index), { newBest: false, medal: null, medalUp: false }) : { saved: true }
    return { ...outcome, index, cupView: state.profile?.cup }
  },
  view({ won, result, scores }, outcome) {
    const c = outcome.cupView
    return {
      kind: 'cup',
      won,
      score: result?.score ?? scores?.[0] ?? 0,
      stars: result?.stars ?? 0,
      index: outcome.index,
      newBest: won && outcome.newBest,
      cupStars: outcome.stars ?? c?.stars ?? 0,
      maxStars: c?.maxStars ?? CUP.CASTLES * 3,
      medal: outcome.medal ?? c?.medal ?? null,
      medalUp: Boolean(outcome.medalUp),
      next: outcome.index < (c?.castles.length ?? CUP.CASTLES) ? outcome.index + 1 : null,
      saved: outcome.saved !== false,
    }
  },
  announce: victoryOrDefeat(starsSaid),
  delay: afterVictory,
}

/** Siège sans fin : château suivant (avec la main du siège), ou fin du siège. */
const endless = {
  async record({ result }, { app, session, endlessRun, refreshEndless }) {
    const left = session?.player.shotsLeft ?? 0
    const step = endlessRun.record(result, Math.max(0, left))
    refreshEndless()
    const outcome = step === 'over' ? await safely(() => app.recordEndless(endlessRun), { newBest: false, newWave: false }) : null
    return { step, outcome }
  },
  view(e, { step, outcome }, { endlessRun, state }) {
    if (step === 'next') return { kind: 'endlessNext', ...endlessRun.last, wave: endlessRun.wave, shots: endlessRun.shots, total: endlessRun.score, hand: endlessRun.hand, picked: null }
    return { kind: 'endlessOver', cleared: endlessRun.cleared, total: endlessRun.score, newBest: outcome?.newBest, newWave: outcome?.newWave, best: state.profile?.endless?.best ?? 0, saved: outcome?.saved !== false }
  },
  announce(view, { t, endlessRun }) {
    return view.kind === 'endlessNext' ? t('endless.castleDown', { n: endlessRun.cleared }) : t('endless.over', { count: endlessRun.cleared })
  },
  delay: (e, { step }, celebrateMs) => (step === 'next' ? 1400 + celebrateMs : 900),
}

/** Château de l'atelier : le prendre soi-même prouve qu'il est faisable (on peut alors le partager). */
const custom = {
  record({ won }, { app, state }) {
    const fromEditor = state.match.custom?.fromEditor
    if (won && fromEditor) app.verifyCastle(state.match.custom.code)
    return { fromEditor }
  },
  view({ won, scores }, { fromEditor }) {
    return { kind: 'custom', won, score: scores?.[0] ?? 0, fromEditor }
  },
  announce: (view, { t }) => (view.won ? t('editor.taken') : t('end.defeat')),
  delay: afterVictory,
}

/** Défi reçu par lien : a-t-on battu le score de l'ami ? (rien n'est enregistré) */
const challenge = {
  record(e, { challengeTarget }) {
    return { target: challengeTarget ?? 0 }
  },
  view({ won, scores }, { target }, { state }) {
    const score = scores?.[0] ?? 0
    return { kind: 'challenge', won, score, target, beaten: won && score > target, name: state.match.challenge?.name || '' }
  },
  announce: (view, { t }) => (view.beaten ? t('daily.beaten') : t('daily.notBeaten', { score: view.target })),
  delay: afterVictory,
}

/** Mode libre : rien n'est enregistré. */
const free = {
  record: () => null,
  view: () => ({ kind: 'free' }),
  announce: (view, { t }) => t('end.cleared'),
  delay: afterRound,
}

/** Chacun sa partie : au joueur suivant, fin de manche ou fin du tournoi. */
const hotseat = {
  record({ won, scores }, { session, tourney, refreshTourney, state }) {
    const names = session?.players.map((p) => p.name) ?? []
    const p = session.players[0]
    const shots = p.shotsTotal - p.shotsLeft
    const kills = session.level.targets.length - session.targetsLeft
    const who = tourney.player
    const step = tourney.record({ cleared: won, shots, kills, score: scores[0] })
    refreshTourney()
    return { step, who, result: { name: state.match.players[who] || names[0], cleared: won, shots, kills, score: scores[0] } }
  },
  view(e, { step, who, result }, { tourney }) {
    if (step === 'next-player') return { kind: 'round', who, result, next: tourney.player, nextName: tourney.players[tourney.player] }
    if (step === 'round-over') return { kind: 'roundEnd', round: tourney.round - 1, winner: tourney.roundWinner(tourney.round - 1) }
    return { kind: 'tourney', winner: tourney.winner, names: [...tourney.players] }
  },
  announce(view, { t, tourney }) {
    if (view.kind === 'round') return t('end.roundDone', { name: view.result.name })
    if (view.kind === 'roundEnd') return view.winner === null ? t('end.roundDraw') : t('end.roundWon', { name: tourney.players[view.winner] })
    return view.winner === null ? t('end.draw') : t('end.winner', { name: view.names[view.winner] })
  },
  delay: afterRound,
}

/** Duel et face-à-face : le vainqueur, la raison, les scores (ou les défenseurs debout). */
const compare = {
  record({ winner, reason, scores, renown }, { session, mode }) {
    // Lus à l'instant de la fin : la scène continue de vivre pendant le décompte.
    return { names: session?.players.map((p) => p.name) ?? [], defenders: mode === 'versus' ? session?.hud.players.map((p) => p.defenders) : null, winner, reason, scores, renown }
  },
  view(e, { names, defenders, winner, reason, scores, renown }) {
    return { kind: 'compare', winner, reason, names, scores, renown, defenders }
  },
  announce: (view, { t }) => (view.winner === null ? t('end.draw') : t('end.winner', { name: view.names[view.winner] })),
  delay: afterRound,
}

const STRATEGIES = Object.freeze({ story, heroic: medal, duke: medal, coop, daily, cup, endless, custom, challenge, free, hotseat, duel: compare, versus: compare })

/** Registre des fins de partie. */
export class EndOfMatch {
  /** Stratégie de fin d'un mode (duel et face-à-face par défaut). */
  static for(mode) {
    return STRATEGIES[mode] ?? compare
  }
}
