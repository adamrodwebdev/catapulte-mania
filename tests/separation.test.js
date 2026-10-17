import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MemoryStorage } from './helpers.js'
import { DICTIONARIES } from '../src/i18n/index.js'
import { I18nService } from '../src/services/I18nService.js'
import { StorageService } from '../src/services/StorageService.js'
import { ShareService } from '../src/services/ShareService.js'
import { GAME } from '../src/config/gameConfig.js'
import { SaveSlot } from '../src/domain/SaveSlot.js'
import { LevelResult } from '../src/domain/LevelResult.js'
import { LevelRepository } from '../src/game/levels/LevelRepository.js'
import { DukeRepository } from '../src/game/levels/DukeRepository.js'
import { ArenaRepository } from '../src/game/levels/ArenaRepository.js'
import { DuelRepository } from '../src/game/levels/DuelRepository.js'
import { Tracks } from '../src/game/levels/Tracks.js'
import { starsFor } from '../src/game/score/ScoreRules.js'
import { UpgradeCatalog } from '../src/game/progression/UpgradeCatalog.js'
import { DUKE_COUNT, MASTERY_TOTAL } from '../src/game/progression/Mastery.js'
import { SKIP_AFTER, LUCK, luckFor } from '../src/game/progression/Frontier.js'
import { DAILY_HISTORY } from '../src/game/progression/DailyRecords.js'
import { HotSeatMatch } from '../src/game/modes/HotSeatMatch.js'
import { StoryMode, HeroicMode, DukeMode, DailyMode, CustomMode, EndlessMode, HotSeatMode, DuelMode } from '../src/game/modes/modes.js'
import { AIM } from '../src/game/aim.js'
import { BALLISTA_AIM } from '../src/game/Ballista.js'
import { PowerRegistry } from '../src/game/powers/PowerRegistry.js'
import { ICON_PATHS } from '../src/components/ui/icons.js'
import * as Setup from '../src/app/MatchSetup.js'
import { EndOfMatch, safely } from '../src/app/EndOfMatch.js'
import { ProfilePresenter } from '../src/app/ProfilePresenter.js'
import { unlockCampaign, masterCampaign, perfectRecords, openTestCampaign, TEST_PROFILE } from '../src/app/devUnlock.js'
import { windKmh, windText, formatKmh, formatDegrees, formatPercent, formatDayKey, KMH_PER_WIND } from '../src/app/Formats.js'
import { GAME_KEYS, ARROW_KEYS } from '../src/composables/useGameKeyboard.js'

/** Traductions réelles, dans une langue donnée. */
function i18nFor(lang) {
  const i18n = new I18nService({ [lang]: DICTIONARIES[lang] }, lang, lang, { available: [lang] })
  return { i18n, t: (k, p) => i18n.t(k, p), n: (v) => i18n.formatNumber(v), d: (date, o) => i18n.formatDate(date, o) }
}
const fr = i18nFor('fr')

/** Victoire authentique sur un niveau d'un parcours. */
const win = (levelId, track, extra = {}) =>
  LevelResult.issue({ levelId, score: 5000, stars: 3, won: true, targetsKilled: 3, blocksDestroyed: 4, barrelsExploded: 0, shotsUsed: 2, powersUsed: 0, achievements: 0, difficulty: 'normal', track, ...extra })

/** Un profil maîtrisé (toutes les étoiles, tous les succès), comme le profil de test « complet ». */
const mastered = () => masterCampaign(SaveSlot.create(0, 'Maître', 'normal'), perfectRecords())

/** Contrôle des records de l'application (AppContext), avec un barème qui a changé pour le niveau `retuned`. */
const checkWithRetune = (retuned) => (id, rec, track = 'campaign') => {
  const level = Tracks.get(track).level(id)
  if (rec.skipped) return 0
  const stars = rec.shots > 0 ? starsFor(level, rec.shots) : Math.max(1, rec.stars)
  return track === 'campaign' && id === retuned ? Math.min(stars, 2) : stars
}

/* ---------- Parcours (Tracks) ---------- */

test('v6.2 : parcours : campagne, à deux, héroïque et Terres du Duc, un seul registre', () => {
  assert.deepEqual([...Tracks.ids()].sort(), ['campaign', 'coop', 'duke', 'heroic'])
  assert.equal(DUKE_COUNT, DukeRepository.count, 'un seul nombre de châteaux du Duc')
  assert.equal(Tracks.get('duke').count, DUKE_COUNT)
  assert.equal(Tracks.get('campaign').count, GAME.LEVEL_COUNT)
  assert.equal(Tracks.get('heroic').count, GAME.LEVEL_COUNT)
  assert.equal(Tracks.get('campaign').level(5), LevelRepository.get(5))
  assert.equal(Tracks.get('coop').level(5), LevelRepository.get(5))
  assert.equal(Tracks.get('heroic').level(64), LevelRepository.heroic(64))
  assert.equal(Tracks.get('duke').level(5), DukeRepository.get(5))
  assert.equal(Tracks.get('heroic').medals && Tracks.get('duke').medals, true)
  assert.equal(Tracks.get('campaign').medals || Tracks.get('coop').medals, false)
  for (const mode of ['story', 'free', 'daily', 'cup', 'challenge', 'endless', 'custom', 'hotseat']) assert.equal(Tracks.forMode(mode).id, 'campaign', mode)
  for (const mode of ['coop', 'heroic', 'duke']) assert.equal(Tracks.forMode(mode).id, mode)
  assert.throws(() => Tracks.get('ogre'))
  // Grands sièges : fins de chapitre (campagne, héroïque) et la citadelle du Duc.
  assert.equal(Tracks.get('campaign').isBoss(10), true)
  assert.equal(Tracks.get('campaign').isBoss(11), false)
  assert.equal(Tracks.get('heroic').isBoss(20), true)
  assert.equal(Tracks.get('duke').isBoss(5, DukeRepository.get(5)), true)
  assert.equal(Tracks.get('duke').isBoss(4, DukeRepository.get(4)), false)
})

test('v6.2 : parcours : records et prochain niveau lus dans la copie d’affichage du profil', () => {
  const slot = SaveSlot.create(0, 'Aube', 'normal')
  slot.recordResult(win(1, 'campaign', { stars: 2 }))
  const view = ProfilePresenter.view(slot)
  assert.equal(Tracks.get('campaign').record(view, 1), view.levels[1])
  assert.equal(Tracks.get('campaign').record(view, 1).stars, 2)
  assert.equal(Tracks.get('coop').record(view, 1), view.coop.levels[1])
  assert.equal(Tracks.get('heroic').record(view, 1), view.heroic.levels[1])
  assert.equal(Tracks.get('duke').record(view, 1), view.duke.levels[1])
  assert.equal(Tracks.get('campaign').next(view), 2)
  assert.equal(Tracks.get('heroic').next(view), 1)
  assert.equal(Tracks.get('duke').next(view), 1)
  assert.equal(Tracks.get('campaign').record(null, 1), null)
})

/* ---------- Préparation de la partie (MatchSetup) ---------- */

test('v6.2 : préparation : difficulté, accès, défis et écran de sortie', () => {
  const easy = { difficulty: 'easy' }
  assert.equal(Setup.matchDifficulty('duel', easy), 'hard', 'à deux : Difficile')
  assert.equal(Setup.matchDifficulty('coop', easy), 'hard')
  assert.equal(Setup.matchDifficulty('daily', easy), 'normal', 'défis : Normal')
  assert.equal(Setup.matchDifficulty('custom', easy), 'normal')
  assert.equal(Setup.matchDifficulty('story', null), 'normal', 'sans profil')
  assert.equal(Setup.matchDifficulty('heroic', easy), 'easy')
  const profile = { completed: 4 }
  assert.equal(Setup.accessDenied('story', profile, { unlocked: true }), null)
  assert.equal(Setup.accessDenied('story', profile, { unlocked: false }), 'levels')
  assert.equal(Setup.accessDenied('heroic', profile, { unlocked: false }), 'levels')
  assert.equal(Setup.accessDenied('duke', profile, null), 'levels')
  assert.equal(Setup.accessDenied('coop', profile, { unlocked: false }), 'multiplayer')
  assert.equal(Setup.accessDenied('story', null, null), 'profiles')
  assert.equal(Setup.accessDenied('free', profile, { unlocked: true, completed: false }), 'levels')
  assert.equal(Setup.accessDenied('free', profile, { completed: true }), null)
  assert.equal(Setup.accessDenied('duel', null, null), null)
  assert.equal(Setup.defiMissing('daily', null, { daily: {} }), true)
  assert.equal(Setup.defiMissing('daily', profile, { daily: {} }), false)
  assert.equal(Setup.defiMissing('cup', profile, { cup: null }), true)
  assert.equal(Setup.defiMissing('challenge', null, { challenge: null }), true)
  assert.equal(Setup.defiMissing('challenge', null, { challenge: {} }), false)
  assert.equal(Setup.defiMissing('story', null, {}), false)
  assert.equal(Setup.exitScreen('custom', { custom: { fromEditor: true } }), 'editor')
  assert.equal(Setup.exitScreen('custom', { custom: {} }), 'home')
  assert.equal(Setup.exitScreen('versus', {}), 'multiplayer')
  assert.equal(Setup.exitScreen('cup', {}), 'home')
  assert.equal(Setup.exitScreen('endless', {}), 'modes')
  assert.equal(Setup.exitScreen('heroic', {}), 'levels')
  assert.deepEqual(Setup.playerNames(['Ana', 'Bo'], (i) => `J${i}`), ['Ana', 'Bo'])
  assert.deepEqual(Setup.playerNames([], (i) => `J${i}`), ['J1', 'J2'])
  assert.equal(Setup.completedLevels('coop', { completed: 3, coop: { completed: 7 } }), 7)
  assert.equal(Setup.completedLevels('story', { completed: 3, coop: { completed: 7 } }), 3)
  assert.equal(Setup.matchLuck('story', { difficulty: 'normal' }, { luckFor: () => 0.2 }, 1), 0.2)
  assert.equal(Setup.matchLuck('free', { difficulty: 'normal' }, { luckFor: () => 0.2 }, 1), 0)
  assert.equal(Setup.matchLuck('story', null, { luckFor: () => 0.2 }, 1), 0)
})

test('v6.2 : préparation : le niveau de chaque mode, et les règles de la fabrique', () => {
  assert.equal(Setup.levelFor('versus', { levelId: 3, arenaId: 2 }), ArenaRepository.get(2))
  assert.equal(Setup.levelFor('duel', { levelId: 3, duelId: 2 }), DuelRepository.get(2))
  assert.equal(Setup.levelFor('heroic', { levelId: 12 }), LevelRepository.heroic(12))
  assert.equal(Setup.levelFor('duke', { levelId: 3 }), DukeRepository.get(3))
  assert.equal(Setup.levelFor('story', { levelId: 7 }), LevelRepository.get(7))
  const custom = { id: 1 }
  assert.equal(Setup.levelFor('custom', { levelId: 1, customLevel: custom }), custom)
  assert.equal(Setup.levelFor('custom', { levelId: 1, customLevel: null }), LevelRepository.get(1))
  const ctx = { completedLevels: 20, effects: { extraShots: 1 }, players: ['Ana', 'Bo'], hotseatPlayer: 1, endless: { shots: 9, loadout: { ammo: { bomb: 1 }, supply: 2 } } }
  assert.ok(Setup.matchRules('story', ctx) instanceof StoryMode)
  assert.ok(Setup.matchRules('heroic', ctx) instanceof HeroicMode)
  assert.ok(Setup.matchRules('duke', ctx) instanceof DukeMode)
  assert.ok(Setup.matchRules('daily', ctx) instanceof DailyMode)
  assert.ok(Setup.matchRules('custom', ctx) instanceof CustomMode)
  assert.ok(Setup.matchRules('endless', ctx) instanceof EndlessMode)
  assert.ok(Setup.matchRules('hotseat', ctx) instanceof HotSeatMode)
  assert.ok(Setup.matchRules('duel', ctx) instanceof DuelMode)
  assert.throws(() => Setup.matchRules('ogre', ctx), /unknown mode/)
})

test('v6.2 : préparation : engin imposé, choisi ou appris, et bornes des curseurs', () => {
  const lesson = LevelRepository.all().find((l) => l.tutorial === 'engine:trebuchet')
  const settings = { tutorials: true }
  assert.equal(Setup.isTrebuchetLesson({ mode: 'story', level: lesson, record: { completed: false }, settings }), true)
  assert.equal(Setup.isTrebuchetLesson({ mode: 'story', level: lesson, record: { completed: true }, settings }), false)
  assert.equal(Setup.isTrebuchetLesson({ mode: 'story', level: lesson, record: null, settings: { tutorials: false } }), false)
  assert.equal(Setup.isTrebuchetLesson({ mode: 'free', level: lesson, record: null, settings }), false)
  assert.equal(Setup.canChooseEngine({ mode: 'story', lesson: false, completed: 3 }), true)
  assert.equal(Setup.canChooseEngine({ mode: 'story', lesson: false, completed: 2 }), false)
  assert.equal(Setup.canChooseEngine({ mode: 'versus', lesson: false, completed: 50 }), false)
  assert.equal(Setup.canChooseEngine({ mode: 'daily', lesson: false, completed: 50 }), false)
  assert.equal(Setup.canChooseEngine({ mode: 'story', lesson: true, completed: 50 }), false)
  assert.equal(Setup.ballistaReady(70, 180), true)
  assert.equal(Setup.ballistaReady(70, 179), false)
  const pick = (mode, extra = {}) => Setup.engineFor({ mode, match: { daily: { engine: 'trebuchet' }, challenge: { engine: 'trebuchet' } }, lesson: false, choice: true, preferred: 'ballista', ballista: true, ...extra })
  assert.equal(pick('daily'), 'trebuchet')
  assert.equal(pick('cup'), 'catapult')
  assert.equal(pick('challenge'), 'trebuchet')
  assert.equal(pick('story', { lesson: true }), 'trebuchet')
  assert.equal(pick('story'), 'ballista')
  assert.equal(pick('story', { ballista: false }), 'catapult')
  assert.equal(pick('story', { preferred: 'trebuchet' }), 'trebuchet')
  assert.equal(pick('story', { choice: false, preferred: 'trebuchet' }), 'catapult')
  // Bornes des curseurs : celles de l'engin (plus de valeurs recopiées dans l'écran).
  assert.deepEqual(Setup.aimRange('ballista'), { min: BALLISTA_AIM.MIN_ANGLE, max: BALLISTA_AIM.MAX_ANGLE })
  assert.deepEqual(Setup.aimRange('catapult'), { min: AIM.MIN_ANGLE, max: AIM.MAX_ANGLE })
  assert.deepEqual(Setup.aimRange(undefined), { min: 5, max: 80 })
  assert.deepEqual(Setup.aimRange('ballista'), { min: 0, max: 60 })
})

test('v6.2 : grands sièges : le général se présente et la musique monte aussi en héroïque et chez le Duc', () => {
  const ten = LevelRepository.get(10)
  assert.equal(Setup.introGeneral('story', ten, 'normal').id, ten.general)
  assert.equal(Setup.introGeneral('coop', ten, 'hard').id, ten.general)
  assert.equal(Setup.introGeneral('heroic', LevelRepository.heroic(10), 'normal').id, ten.general, 'Campagne héroïque')
  const citadel = Setup.introGeneral('duke', DukeRepository.get(5), 'normal')
  assert.equal(citadel.id, 'mordrac', 'citadelle du Duc')
  assert.equal(citadel.stages, 2)
  assert.ok(citadel.lives > 0 && citadel.skills.length > 0)
  assert.equal(Setup.introGeneral('free', ten, 'normal'), null)
  assert.equal(Setup.introGeneral('story', LevelRepository.get(9), 'normal'), null)
  assert.equal(Setup.introGeneral('duke', DukeRepository.get(4), 'normal'), null)
  assert.equal(Setup.isBossLevel('story', 10, ten), true)
  assert.equal(Setup.isBossLevel('coop', 20, LevelRepository.get(20)), true)
  assert.equal(Setup.isBossLevel('heroic', 10, LevelRepository.heroic(10)), true)
  assert.equal(Setup.isBossLevel('duke', 5, DukeRepository.get(5)), true)
  assert.equal(Setup.isBossLevel('duke', 1, DukeRepository.get(1)), false)
  assert.equal(Setup.isBossLevel('free', 10, ten), false)
  assert.equal(Setup.isBossLevel('story', 11, LevelRepository.get(11)), false)
})

/* ---------- Fin de partie (EndOfMatch) ---------- */

/** Contexte d'une fin de partie, avec des ports factices (l'état est partagé, comme celui de l'application). */
function endCtx(mode, { state = {}, app = {}, ...rest } = {}) {
  for (const [key, value] of Object.entries({ profile: null, match: {}, levelId: 1 })) if (!(key in state)) state[key] = value
  return { mode, t: fr.t, n: fr.n, state, app, session: null, tourney: null, endlessRun: null, refreshTourney() {}, refreshEndless() {}, challengeTarget: null, ...rest }
}
const result = (extra = {}) => ({ levelId: 3, score: 12345, stars: 2, shotsUsed: 3, ...extra })

test('v6.2 : fin de partie : campagne (bilan, attente, annonce chiffrée dans la langue)', async () => {
  const state = { profile: { levels: { 3: { ach: 1, best: 9000 } } }, match: {}, levelId: 3 }
  const app = {
    async recordResult() {
      state.profile = { levels: { 3: { ach: 3, best: 12345 } } }
      return { newBest: true, firstClear: false, gold: 120, newAchievements: 2, unlockedPower: 'falcon', saved: true, mastery: false }
    },
    activeSlot: { canSkip: () => false },
  }
  const ending = EndOfMatch.for('story')
  assert.equal(ending.doublesGold, true)
  const ctx = endCtx('story', { state, app })
  const e = { won: true, result: result(), reason: null, celebrateMs: 500 }
  const outcome = await ending.record(e, ctx)
  const view = ending.view(e, outcome, ctx)
  assert.deepEqual(view, {
    kind: 'story', won: true, reason: null, score: 12345, stars: 2, best: 12345, newBest: true, unlockedPower: 'falcon', gold: 120,
    achMask: 1, achFresh: 2, shotsUsed: 3, saved: true, hasNext: true, campaignDone: false, demoDone: false, canSkip: false, mastery: false,
  })
  assert.equal(ending.delay(e, outcome, 500), 1900)
  assert.equal(ending.delay({ won: false }, outcome, 500), 900)
  const said = ending.announce(view, ctx)
  assert.ok(said.startsWith(fr.t('end.victory')))
  assert.ok(said.includes('12 345'), 'score mis en forme (Intl), plus de chiffres bruts')
  assert.equal(ending.announce({ ...view, won: false }, ctx), fr.t('end.defeat'))
  // Défaite au front : on peut passer le niveau.
  const lost = ending.view({ won: false, result: result({ stars: 0 }) }, { ...outcome, newBest: false }, endCtx('story', { app: { activeSlot: { canSkip: () => true } } }))
  assert.equal(lost.canSkip, true)
  assert.equal(lost.hasNext, false)
})

test('v6.2 : fin de partie : sauvegarde refusée, le bilan s’affiche quand même (aussi à deux et au siège)', async () => {
  const fail = async () => {
    throw new Error('stockage plein')
  }
  const warn = console.warn
  console.warn = () => {}
  try {
    assert.deepEqual(await safely(fail, { newBest: false }), { newBest: false, saved: false })
    // Campagne à deux (B7).
    const coop = EndOfMatch.for('coop')
    const session = { players: [{ name: 'Ana' }, { name: 'Bo' }] }
    const ctx = endCtx('coop', { app: { recordCoop: fail }, session, state: { levelId: 3 } })
    const e = { won: true, result: result(), renown: [4, 2] }
    const outcome = await coop.record(e, ctx)
    assert.equal(outcome.saved, false)
    const view = coop.view(e, outcome, ctx)
    assert.deepEqual(view, { kind: 'coop', won: true, score: 12345, stars: 2, shotsUsed: 3, names: ['Ana', 'Bo'], renown: [4, 2], mvp: 0, newBest: false, saved: false, hasNext: true })
    // Siège sans fin (B7) : le siège se termine, son enregistrement échoue.
    const run = { record: () => 'over', cleared: 4, score: 9000, wave: 5, shots: 0, last: {}, hand: [] }
    const endless = EndOfMatch.for('endless')
    const ectx = endCtx('endless', { app: { recordEndless: fail }, endlessRun: run, state: { profile: { endless: { best: 12000 } } } })
    const eo = await endless.record({ result: result() }, ectx)
    assert.equal(eo.step, 'over')
    const over = endless.view({}, eo, ectx)
    assert.deepEqual(over, { kind: 'endlessOver', cleared: 4, total: 9000, newBest: false, newWave: false, best: 12000, saved: false })
    assert.equal(endless.delay({ won: true }, eo, 300), 900)
    assert.equal(endless.delay({ won: true }, { step: 'next' }, 300), 1700)
  } finally {
    console.warn = warn
  }
})

test('v6.2 : fin de partie : médailles (héroïque, Duc), défi du jour, coupe, atelier, défi par lien', async () => {
  // Campagne héroïque : la médaille, le titre du parcours ; plus de « medalUp » jamais affiché.
  const heroic = EndOfMatch.for('heroic')
  const state = { profile: { heroic: { levels: { 100: { best: 7000 } } } }, match: {} }
  const ctx = endCtx('heroic', { state, app: { recordMedal: async (r, track) => ({ newBest: true, firstClear: true, stars: 3, before: 0, saved: true, track }) } })
  const e = { won: true, result: result({ levelId: 100, stars: 3 }) }
  const view = heroic.view(e, await heroic.record(e, ctx), ctx)
  assert.equal(view.medal, 'gold')
  assert.equal(view.titleKey, 'heroic.title')
  assert.equal(view.doneKey, 'heroic.done')
  assert.equal(view.trackDone, true)
  assert.equal(view.hasNext, false)
  assert.equal(view.best, 7000)
  assert.equal('medalUp' in view, false)
  assert.equal(heroic.announce(view, ctx), `${fr.t('end.victory')} ${fr.t('heroic.medal.gold')}`)
  const duke = EndOfMatch.for('duke')
  const dctx = endCtx('duke', { state: { profile: { duke: { levels: {} } }, match: {} }, app: { recordMedal: async () => ({ newBest: true, saved: true }) } })
  const dv = duke.view({ won: true, result: result({ levelId: 4, stars: 1 }) }, await duke.record({ result: result({ levelId: 4 }) }, dctx), dctx)
  assert.equal(dv.titleKey, 'duke.tab')
  assert.equal(dv.medal, 'bronze')
  assert.equal(dv.hasNext, true, `${DUKE_COUNT} châteaux`)
  // Défi du jour.
  const daily = EndOfMatch.for('daily')
  const dayCtx = endCtx('daily', { state: { profile: { daily: { streak: 3, todayBest: 800 } }, match: { daily: { key: '2026-10-16' } } }, app: { recordDaily: async (r, day) => ({ newBest: true, streak: 4, extended: true, reward: null, saved: true, day }) } })
  const de = { won: true, result: result() }
  const dayView = daily.view(de, await daily.record(de, dayCtx), dayCtx)
  assert.deepEqual(dayView, { kind: 'daily', won: true, score: 12345, newBest: true, reward: null, streak: 4, extended: true, todayBest: 800, saved: true })
  assert.ok(daily.announce(dayView, dayCtx).includes('12 345'))
  // Coupe de la semaine.
  const cup = EndOfMatch.for('cup')
  const cupCtx = endCtx('cup', { state: { profile: { cup: { stars: 7, maxStars: 15, medal: 'bronze', castles: [1, 2, 3, 4, 5] } }, match: { cup: { week: '2026-W42', index: 2 } } }, app: { recordCup: async () => ({ newBest: true, stars: 8, medal: 'bronze', medalUp: false, saved: true }) } })
  const cupView = cup.view({ won: true, result: result() }, await cup.record({ result: result() }, cupCtx), cupCtx)
  assert.deepEqual(cupView, { kind: 'cup', won: true, score: 12345, stars: 2, index: 2, newBest: true, cupStars: 8, maxStars: 15, medal: 'bronze', medalUp: false, next: 3, saved: true })
  // Atelier : prendre son propre château le vérifie (action du contexte, plus d'écriture dans l'écran).
  const verified = []
  const custom = EndOfMatch.for('custom')
  const cctx = endCtx('custom', { state: { match: { custom: { fromEditor: true, code: 'ABC' } } }, app: { verifyCastle: (code) => verified.push(code) } })
  const cv = custom.view({ won: true, scores: [4200] }, custom.record({ won: true }, cctx), cctx)
  assert.deepEqual(cv, { kind: 'custom', won: true, score: 4200, fromEditor: true })
  assert.deepEqual(verified, ['ABC'])
  custom.record({ won: false }, cctx)
  assert.deepEqual(verified, ['ABC'], 'une défaite ne prouve rien')
  // Défi par lien.
  const challenge = EndOfMatch.for('challenge')
  const chCtx = endCtx('challenge', { challengeTarget: 3000, state: { match: { challenge: { name: 'Ana' } } } })
  const chView = challenge.view({ won: true, scores: [3100] }, challenge.record({}, chCtx), chCtx)
  assert.deepEqual(chView, { kind: 'challenge', won: true, score: 3100, target: 3000, beaten: true, name: 'Ana' })
  assert.equal(challenge.announce(chView, chCtx), fr.t('daily.beaten'))
})

test('v6.2 : fin de partie : mode libre, tournoi et face-à-face', async () => {
  const free = EndOfMatch.for('free')
  assert.deepEqual(free.view({}, free.record({}, endCtx('free')), endCtx('free')), { kind: 'free' })
  assert.equal(free.delay({ won: true }, null, 400), 1600)
  // Chacun sa partie : un vrai tournoi.
  const tourney = new HotSeatMatch([1, 2, 3], ['Ana', 'Bo'])
  const hotseat = EndOfMatch.for('hotseat')
  const session = { players: [{ name: 'Ana', shotsTotal: 5, shotsLeft: 2 }], level: { targets: [1, 2, 3] }, targetsLeft: 0 }
  let refreshed = 0
  const hctx = endCtx('hotseat', { session, tourney, refreshTourney: () => refreshed++, state: { match: { players: ['Ana', 'Bo'] } } })
  const ho = hotseat.record({ won: true, scores: [3000] }, hctx)
  assert.equal(refreshed, 1)
  const round = hotseat.view({}, ho, hctx)
  assert.deepEqual(round, { kind: 'round', who: 0, result: { name: 'Ana', cleared: true, shots: 3, kills: 3, score: 3000 }, next: 1, nextName: 'Bo' })
  assert.equal(hotseat.announce(round, hctx), fr.t('end.roundDone', { name: 'Ana' }))
  // Face-à-face : défenseurs debout, lus à l'instant de la fin.
  const versus = EndOfMatch.for('versus')
  const vs = { players: [{ name: 'Ana' }, { name: 'Bo' }], hud: { players: [{ defenders: 2 }, { defenders: 0 }] } }
  const vctx = endCtx('versus', { session: vs })
  const ve = { winner: 0, reason: 'king', scores: [100, 50], renown: [3, 1] }
  const vv = versus.view(ve, versus.record(ve, vctx), vctx)
  assert.deepEqual(vv, { kind: 'compare', winner: 0, reason: 'king', names: ['Ana', 'Bo'], scores: [100, 50], renown: [3, 1], defenders: [2, 0] })
  assert.equal(versus.announce(vv, vctx), fr.t('end.winner', { name: 'Ana' }))
  assert.equal(EndOfMatch.for('duel').view(ve, EndOfMatch.for('duel').record(ve, endCtx('duel', { session: vs })), {}).defenders, null)
  assert.equal(EndOfMatch.for('ogre'), EndOfMatch.for('duel'))
})

/* ---------- Atelier : une seule règle d'achat ---------- */

test('v6.2 : atelier : SaveSlot.upgradeOffer est la seule règle (achat, atelier, rappel)', () => {
  const plain = SaveSlot.create(0, 'Aube', 'normal')
  const offer = plain.upgradeOffer('arm')
  assert.deepEqual(offer, { id: 'arm', level: 0, cost: 300, stars: 0, starsOk: true, heroic: false, heroicLocked: false, maxed: false, affordable: false })
  assert.equal(plain.buyUpgrade('arm'), false, 'pas d’or')
  const view = ProfilePresenter.view(plain)
  assert.equal(view.workshop.length, UpgradeCatalog.upgrades().length)
  assert.deepEqual(view.workshop[0], { ...offer, icon: 'fist', base: 4, max: 5 })
  assert.equal(view.affordable, null)
  assert.ok(view.powers.every((p) => ICON_PATHS[p.icon]), 'icônes des pouvoirs : celles de leur définition')
  assert.deepEqual(view.powers.map((p) => p.icon), PowerRegistry.all().map((p) => p.icon))
})

test('v6.2 : atelier : le rappel « votre or suffit » ne propose jamais un palier héroïque fermé (correctif)', () => {
  const slot = mastered()
  // Tous les paliers ordinaires de toutes les améliorations : il ne reste que des paliers héroïques.
  for (const u of UpgradeCatalog.upgrades()) for (let i = 0; i < u.base; i++) assert.equal(slot.buyUpgrade(u.id), true, `${u.id} ${i + 1}`)
  const locked = slot.upgradeOffer('tactics')
  assert.equal(locked.heroic, true)
  assert.equal(locked.heroicLocked, true)
  assert.equal(locked.affordable, false)
  assert.ok(slot.gold >= locked.cost, 'l’or suffirait')
  assert.equal(ProfilePresenter.view(slot).affordable, null, 'avant : « Stratège (1 200) » proposé à tort')
  assert.equal(slot.buyUpgrade('tactics'), false)
  assert.equal(slot.startHeroic(), true)
  assert.deepEqual(ProfilePresenter.view(slot).affordable, { id: 'tactics', cost: locked.cost })
  assert.equal(slot.buyUpgrade('tactics'), true)
  assert.equal(slot.upgradeOffer('tactics').maxed, true)
})

/* ---------- Sauvegarde : règles sorties du domaine, maîtrise robuste ---------- */

test('v6.2 : règles du front et du défi du jour (valeurs inchangées)', () => {
  assert.equal(SKIP_AFTER, 3)
  assert.deepEqual({ ...LUCK }, { CHAPTER_MAX_LEVEL: 10, FROM_FAILS: 2, STEP: 0.1, MAX: 0.3 })
  assert.equal(luckFor(1, 'normal', 1), 0)
  assert.equal(luckFor(1, 'normal', 2), LUCK.STEP)
  assert.equal(luckFor(1, 'normal', 9), LUCK.MAX)
  assert.equal(luckFor(1, 'hard', 9), 0)
  assert.equal(luckFor(11, 'easy', 9), 0)
  assert.equal(DAILY_HISTORY, 14)
})

test('v6.2 : un Grand Ingénieur reste chargeable après un nouveau barème d’étoiles (correctif)', () => {
  const slot = mastered()
  assert.deepEqual(slot.grantMastery(), ['gold', 'comet'])
  assert.equal(slot.startHeroic(), true)
  while (slot.buyUpgrade('arm'));
  assert.equal(slot.upgrades.arm, UpgradeCatalog.upgrade('arm').maxLevel, 'palier héroïque acheté')
  slot.recordHeroic(win(1, 'heroic'))
  slot.recordDuke(win(1, 'duke'))
  const saved = JSON.parse(JSON.stringify(slot.toJSON()))
  // Le niveau 50 devient plus dur : ses trois étoiles n'en valent plus que deux (299 au total).
  const retuned = checkWithRetune(50)
  const loaded = SaveSlot.fromJSON(0, saved, retuned)
  assert.equal(loaded.starCount, MASTERY_TOTAL - 1)
  assert.equal(loaded.achievementCount, MASTERY_TOTAL)
  assert.equal(loaded.mastered, false, 'le titre suit les étoiles du moment')
  assert.equal(loaded.heroic.started, true)
  assert.equal(loaded.upgrades.arm, UpgradeCatalog.upgrade('arm').maxLevel)
  assert.ok(loaded.cosmetics.owned.includes('gold') && loaded.cosmetics.owned.includes('comet'))
  assert.equal(Object.keys(loaded.duke).length, 1)
  // La sauvegarde suivante enregistre les 299 étoiles : elle se relit aussi (et la suivante).
  const again = SaveSlot.fromJSON(0, JSON.parse(JSON.stringify(loaded.toJSON())), retuned)
  assert.equal(again.starCount, MASTERY_TOTAL - 1)
  assert.equal(again.heroic.started, true)
  // Une étoile regagnée : le titre revient.
  again.recordResult(win(50, 'campaign', { stars: 3, achievements: 7 }))
  assert.equal(again.mastered, true)
})

test('v6.2 : la maîtrise reste exigée : sans tous les succès, ni Campagne héroïque ni Engin d’or', () => {
  const slot = mastered()
  slot.grantMastery()
  slot.startHeroic()
  const forged = JSON.parse(JSON.stringify(slot.toJSON()))
  forged.levels[7].ach = 3
  assert.throws(() => SaveSlot.fromJSON(0, forged), /mastery required/)
  const plain = JSON.parse(JSON.stringify(SaveSlot.create(1, 'Apprenti', 'normal').toJSON()))
  plain.duke = { 1: { stars: 3, best: 1000, shots: 2, attempts: 1 } }
  assert.throws(() => SaveSlot.fromJSON(1, plain), /mastery required/)
})

/* ---------- Profils de test (serveur de développement) ---------- */

test('v6.2 : profils de test : hors du domaine, par une copie relue comme une sauvegarde', async () => {
  const slot = SaveSlot.create(0, 'Test', 'normal')
  assert.equal(typeof slot.unlockCampaign, 'undefined', 'plus dans les versions publiées')
  assert.equal(typeof slot.masterCampaignForTesting, 'undefined')
  slot.recordResult(win(1, 'campaign', { stars: 2 }))
  const { slot: opened, passed } = unlockCampaign(slot, 10)
  assert.equal(passed, 8)
  assert.notEqual(opened, slot)
  assert.equal(slot.completedCount, 1, 'le profil d’origine n’est pas touché')
  assert.equal(opened.completedCount, 9)
  assert.equal(opened.isUnlocked(10), true)
  const master = masterCampaign(opened, perfectRecords())
  assert.equal(master.mastered, true)
  assert.equal(master.starCount, MASTERY_TOTAL)
  // Seulement sous import.meta.env.DEV, et à la demande : jamais dans le paquet publié.
  const src = readFileSync(new URL('../src/app/AppContext.js', import.meta.url), 'utf8')
  assert.ok(!/^import .*devUnlock/m.test(src), 'aucun import statique')
  assert.ok(/if \(import\.meta\.env\?\.DEV\) \{\s+try \{\s+const \{ openTestCampaign \} = await import\('\.\/devUnlock\.js'\)/.test(src))
})

test('v6.2 : profil de test : ?unlock=complete ouvre « Test » (créé), maîtrisé, et la carte des niveaux', async () => {
  const state = { slots: [{ index: 0, status: 'ok', name: 'Aliénor' }, { index: 1, status: 'empty' }] }
  let active = null
  const saved = []
  const screens = []
  const app = {
    state,
    saves: { save: async (s) => saved.push(s) },
    refreshSlots: async () => {},
    openProfile: async () => false,
    createProfile: async (index, name, difficulty) => (active = SaveSlot.create(index, name, difficulty)),
    go: (screen) => screens.push(screen),
    activeSlot: () => active,
    adopt: (s) => (active = s),
  }
  await openTestCampaign(app, '?unlock=complete&difficulty=hard')
  assert.equal(active.name, TEST_PROFILE)
  assert.equal(active.index, 1, 'premier emplacement libre')
  assert.equal(active.difficulty, 'hard')
  assert.equal(active.mastered, true)
  assert.ok(active.cosmetics.owned.includes('gold'))
  assert.deepEqual(saved, [active])
  assert.deepEqual(screens, ['levels'])
  // Sans paramètre : rien.
  await openTestCampaign({ ...app, refreshSlots: () => assert.fail('rien à faire') }, '')
})

/* ---------- Mises en forme : unités, vent, dates ---------- */

test('v6.2 : unités et vent : une seule mise en forme, la typographie de chaque langue', () => {
  const en = i18nFor('en')
  const id = i18nFor('id')
  assert.equal(KMH_PER_WIND, 30)
  assert.equal(windKmh({ windKmh: 17 }, 2), 17)
  assert.equal(windKmh({}, -0.5), 15)
  assert.equal(windKmh(null, 0.4), 12)
  // Français : espaces ordinaires comme avant ; les nombres passent par Intl (virgule décimale).
  assert.equal(formatKmh(fr.t, 12), '12 km/h')
  assert.equal(formatDegrees(fr.t, 45), '45°')
  assert.equal(formatDegrees(fr.t, 45.5), '45,5°')
  assert.equal(formatPercent(fr.t, 75), '75 %')
  assert.equal(formatPercent(fr.t, 75.5), '75,5 %')
  assert.equal(formatDegrees(en.t, 45.5), '45.5°')
  assert.equal(formatPercent(en.t, 75), '75%')
  assert.equal(formatPercent(id.t, 75.5), '75,5%')
  assert.equal(formatKmh(id.t, 12), '12 km/jam')
  assert.equal(windText(fr.t, { windKmh: 0 }, 0), fr.t('game.windCalm'))
  assert.equal(windText(fr.t, { windKmh: 12 }, -0.4), `12 km/h ${fr.t('a11y.windLeft')}`)
  assert.equal(windText(fr.t, { windKmh: 12, windDynamic: true }, 0.4), `12 km/h ${fr.t('a11y.windRight')}, ${fr.t('a11y.windGusty')}`)
  // Dates : le code complet de la langue (en-GB : le jour avant le mois).
  assert.equal(formatDayKey(fr.d, '2026-10-16'), 'vendredi 16 octobre')
  assert.equal(formatDayKey(en.d, '2026-10-16'), 'Friday 16 October')
  assert.equal(formatDayKey(fr.d, 'pas-une-date'), 'pas-une-date')
  // Nombres : identiques aux anciens toLocaleString('fr' | 'en' | 'id').
  for (const [lang, f] of [['fr', fr], ['en', en], ['id', id]]) for (const v of [0, 7, 1234, 98765, 1234567]) assert.equal(f.n(v), v.toLocaleString(lang), `${lang} ${v}`)
})

test('v6.2 : clavier : les touches de la partie, en données gelées', () => {
  assert.ok(Object.isFrozen(GAME_KEYS) && Object.isFrozen(ARROW_KEYS))
  assert.equal(GAME_KEYS.KeyA.dir, -1)
  assert.equal(GAME_KEYS.KeyD.dir, 1)
  assert.equal(GAME_KEYS.Space.command, 'fire')
  assert.equal(GAME_KEYS.Space.once && GAME_KEYS.Enter.once && GAME_KEYS.KeyA.once, true)
  assert.equal(GAME_KEYS.KeyP.once, undefined, 'la pause répond même à la touche tenue')
  assert.equal(GAME_KEYS.Escape, undefined, 'Échap reste au navigateur (portails)')
  assert.deepEqual(Object.values(ARROW_KEYS), ['left', 'right', 'up', 'down'])
})

/* ---------- Partage ---------- */

test('v6.2 : partage : lien du portail ou de notre site, partage natif, copie, à la main', async () => {
  const title = () => 'Catapulte Mania'
  const location = { origin: 'https://example.test', pathname: '/jeu/' }
  const noInvite = { inviteLink: async () => null }
  const shared = []
  const native = new ShareService(noInvite, { title, location, navigator: { share: async (d) => shared.push(d) } })
  assert.deepEqual(await native.share({ defi: 'XYZ' }, 'Bats mon tir'), { url: 'https://example.test/jeu/#defi=XYZ', method: 'shared' })
  assert.deepEqual(shared, [{ title: 'Catapulte Mania', text: 'Bats mon tir', url: 'https://example.test/jeu/#defi=XYZ' }])
  const portal = new ShareService({ inviteLink: async (p) => `https://portal.test/?coupe=${p.coupe}` }, { title, location, navigator: { share: async () => {} } })
  assert.equal((await portal.share({ coupe: '2026-W42' }, 'Coupe')).url, 'https://portal.test/?coupe=2026-W42')
  const abort = Object.assign(new Error('annulé'), { name: 'AbortError' })
  const cancelled = new ShareService(noInvite, { title, location, navigator: { share: async () => Promise.reject(abort) } })
  assert.equal((await cancelled.share({ chateau: 'C1' }, 'Château')).method, 'manual')
  const copied = []
  const clip = new ShareService(noInvite, { title, location, navigator: { clipboard: { writeText: async (s) => copied.push(s) } } })
  assert.deepEqual(await clip.share({ chateau: 'C1' }, 'Château'), { url: 'https://example.test/jeu/#chateau=C1', method: 'copied' })
  assert.deepEqual(copied, ['Château https://example.test/jeu/#chateau=C1'])
  const none = new ShareService(noInvite, { title, location, navigator: { clipboard: { writeText: async () => Promise.reject(new Error('refusé')) } } })
  assert.equal((await none.share({ defi: 'XYZ' }, 'x')).method, 'manual')
})

test('v6.2 : textes : unités dans les trois langues, nom du jeu traduit', () => {
  for (const lang of GAME.LANGUAGES) {
    const d = DICTIONARIES[lang]
    assert.ok(d.units.kmh.includes('{value}') && d.units.degrees.includes('{value}') && d.units.percent.includes('{value}'), lang)
    assert.equal(d.app.title, 'Catapulte Mania', lang)
    assert.ok(d.help.modesTitle && d.heroic.locked, lang)
  }
})

test('v6.2 : atelier de châteaux : brouillon et château vérifié gardés par un service', async () => {
  const { CastleDraftService } = await import('../src/services/CastleDraftService.js')
  const { emptyDesign, placePart } = await import('../src/game/editor/CastleDesign.js')
  const drafts = new CastleDraftService(new StorageService(new MemoryStorage()))
  assert.deepEqual(drafts.loadDraft(), emptyDesign(), 'rien d’enregistré : un château vide')
  const design = emptyDesign()
  assert.ok(placePart(design, 'room', 1500, 'wood'))
  drafts.saveDraft(design)
  assert.equal(drafts.loadDraft().parts.length, 1)
  assert.equal(drafts.verifiedCode(), null)
  drafts.rememberVerified('CODE')
  assert.equal(drafts.verifiedCode(), 'CODE')
  drafts.rememberVerified('x'.repeat(5000))
  assert.equal(drafts.verifiedCode(), null, 'un code démesuré est ignoré')
})
