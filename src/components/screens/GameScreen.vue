<script setup>
import { ref, shallowRef, computed, onMounted, onBeforeUnmount, watch, markRaw, nextTick } from 'vue'
import { useApp } from '../../app/AppContext.js'
import { LevelRepository } from '../../game/levels/LevelRepository.js'
import { ArenaRepository } from '../../game/levels/ArenaRepository.js'
import { DuelRepository } from '../../game/levels/DuelRepository.js'
import { createMode } from '../../game/modes/modes.js'
import { GAME, IS_DEMO, PLAYABLE_LEVELS } from '../../config/gameConfig.js'
import GameHud from '../game/GameHud.vue'
import AimPanel from '../game/AimPanel.vue'
import AmmoBar from '../game/AmmoBar.vue'
import PowersMenu from '../game/PowersMenu.vue'
import CaptionFeed from '../game/CaptionFeed.vue'
import ModalPanel from '../ui/ModalPanel.vue'
import StarRow from '../ui/StarRow.vue'
import AchievementList from '../ui/AchievementList.vue'
import AppIcon from '../ui/AppIcon.vue'
import CoachBubble from '../game/CoachBubble.vue'
import StoryPanel from '../ui/StoryPanel.vue'
import PixelPortrait from '../ui/PixelPortrait.vue'
import { StoryRepository } from '../../game/story/StoryRepository.js'
import { TutorialCoach } from '../../game/tutorial/Tutorial.js'
import { HotSeatMatch } from '../../game/modes/HotSeatMatch.js'
import { EndlessRun } from '../../domain/EndlessRun.js'
import { CastleCode, buildCustomLevel, STORAGE_KEYS } from '../../game/editor/CastleDesign.js'
import { eventFor } from '../../game/events/Season.js'
import { dayKey } from '../../game/daily/DailyChallenge.js'
import ToggleSwitch from '../ui/ToggleSwitch.vue'
import SegmentedControl from '../ui/SegmentedControl.vue'
import TrebuchetPanel from '../game/TrebuchetPanel.vue'
import { TREBUCHET_UNLOCK } from '../../game/Trebuchet.js'
import { ballistaUnlocked, BALLISTA_UNLOCK } from '../../game/Ballista.js'

const app = useApp()
const { state, t } = app

const canvas = ref(null)
/** Le contrôleur de jeu n'est pas réactif (markRaw) : Vue n'observe que le HUD. */
let controller = null
const hud = shallowRef(null)
const phase = ref('loading') // loading | story | intro | playing | paused | ended
/** Épisode de la Chronique affiché (avant le niveau, ou épilogue). */
const storyBeat = shallowRef(null)
const showPowers = ref(false)
const end = ref(null)
/** Dernier résultat authentique (hors réactivité : Vue l'envelopperait dans un Proxy). */
let lastResult = null
/** Dernier tir offert contre une vidéo : 'idle' | 'loading' | 'failed'. */
const offer = ref('idle')
/** Or doublé : 'idle' | 'loading' | 'done' | 'failed'. */
const doubling = ref('idle')
/** Mode de la partie : histoire, libre, duel, chacun sa partie, face-à-face, campagne à deux. */
const mode = computed(() => state.match.mode || 'story')
const isMulti = computed(() => ['duel', 'hotseat', 'versus', 'coop'].includes(mode.value))
const isCoop = computed(() => mode.value === 'coop')
/** Modes qui suivent la campagne (récit, répliques). */
const isCampaign = computed(() => mode.value === 'story' || isCoop.value)
const isVersus = computed(() => mode.value === 'versus')
const isDuel = computed(() => mode.value === 'duel')
/** Défi du jour, et défi reçu par un lien « Bats mon tir ». */
const isDaily = computed(() => mode.value === 'daily')
const isChallenge = computed(() => mode.value === 'challenge')
const isDefi = computed(() => isDaily.value || isChallenge.value)
/** Siège sans fin : la partie en cours (objet non réactif) et sa copie d'affichage. */
const isEndless = computed(() => mode.value === 'endless')
/** Château de l'atelier (le sien en essai, ou celui d'un ami). */
const isCustom = computed(() => mode.value === 'custom')
const customLevel = shallowRef(null)
let endlessRun = null
const endlessView = shallowRef(null)
function refreshEndless() {
  endlessView.value = endlessRun ? { wave: endlessRun.wave, score: endlessRun.score, shots: endlessRun.shots } : null
}
/** Défi par lien : score à battre (recalculé en rejouant le tir de l'ami) et étape ('play' ou 'watch' = relecture). */
const challengeTarget = ref(null)
const challengeStage = ref('play')
/** Journal de la dernière partie (pour la partager) et état du partage. */
let lastLog = null
const share = ref({ state: 'idle', url: '' })
const level = computed(() =>
  isCustom.value && customLevel.value
    ? customLevel.value
    : isVersus.value ? ArenaRepository.get(state.match.arenaId) : isDuel.value ? DuelRepository.get(state.match.duelId) : LevelRepository.get(state.levelId),
)
const novelties = computed(() => (isCampaign.value ? LevelRepository.novelties(state.levelId) : []))
/** Chacun sa partie : le tournoi en trois manches (objet non réactif) et sa copie d'affichage. */
let tourney = null
const tourneyView = shallowRef(null)
function refreshTourney() {
  tourneyView.value = tourney ? { round: tourney.round, player: tourney.player, wins: tourney.wins, table: tourney.table, finished: tourney.finished, winner: tourney.winner, totals: tourney.totals } : null
}
function newTourney() {
  const names = state.match.players.length === 2 ? state.match.players : [t('mp.defaultName', { n: 1 }), t('mp.defaultName', { n: 2 })]
  const levels = state.match.levels?.length === 3 ? state.match.levels : HotSeatMatch.levelsFrom(state.levelId, app.multiplayerLevels())
  tourney = markRaw(new HotSeatMatch(levels, names))
  refreshTourney()
}
/** Bandeau « Au tour de… » (modes à deux). */
const turnBanner = ref(null)
let turnTimer = null

const aiming = computed(() => phase.value === 'playing' && hud.value?.state === 'aiming')

/* ---------- Engin : catapulte ou trébuchet ---------- */

/** Niveaux réussis par le profil (campagne solo, ou à deux si plus avancée). */
const completedForEngine = computed(() => Math.max(state.profile?.completed ?? 0, isCoop.value ? (state.profile?.coop?.completed ?? 0) : 0))
/** Niveau d'apprentissage du trébuchet, au premier passage : le trébuchet est imposé. */
const trebuchetLesson = computed(() => {
  if (mode.value !== 'story' || level.value.tutorial !== 'engine:trebuchet') return false
  return !state.profile?.levels[state.levelId]?.completed && state.settings.tutorials !== false
})
/** Le trébuchet est débloqué après le niveau 13 (jamais au face-à-face : il tire depuis l'arrière). */
const engineChoice = computed(() => !isVersus.value && !isDefi.value && !trebuchetLesson.value && completedForEngine.value >= TREBUCHET_UNLOCK)
/** Baliste (v5.1) : réservée aux profils qui ont presque tout gagné (BALLISTA_UNLOCK). */
const ballistaReady = computed(() => ballistaUnlocked(completedForEngine.value, state.profile?.stars ?? 0))
const engine = computed(() => {
  // Défis : engin imposé, le même pour tous.
  if (isDaily.value) return state.match.daily?.engine ?? 'catapult'
  if (isChallenge.value) return state.match.challenge?.engine ?? 'catapult'
  if (trebuchetLesson.value) return 'trebuchet'
  if (engineChoice.value && state.settings.engine === 'ballista' && ballistaReady.value) return 'ballista'
  return engineChoice.value && state.settings.engine === 'trebuchet' ? 'trebuchet' : 'catapult'
})
const engineOptions = computed(() => [
  { value: 'catapult', label: t('game.engines.catapult') },
  { value: 'trebuchet', label: t('game.engines.trebuchet') },
  ...(ballistaReady.value ? [{ value: 'ballista', label: t('game.engines.ballista') }] : []),
])
const isTrebuchet = computed(() => hud.value?.engine === 'trebuchet')
/** Visée précise (curseurs) : option ; par défaut, on vise dans la scène et une barre fine suffit. */
const precise = computed(() => state.settings.preciseAim === true)
/** Changement d'engin depuis l'introduction : la partie est reconstruite, l'introduction reste affichée. */
function chooseEngine(value) {
  if (!engineChoice.value || value === engine.value) return
  app.setSetting('engine', value)
  startLevel({ rebuild: true })
}

/* ---------- Aide à la visée (v5.0) ---------- */

/** L'aide est-elle visible en ce moment (réglage, premiers pas ou tutoriel en cours) ? */
const aidActive = computed(() => state.settings.trajectoryAid === true || Boolean(controller?.session.assist) || Boolean(coachStep.value))
/** Bouton de l'interface : active ou coupe l'aide à la visée (même réglage que dans les Réglages). */
function toggleAid() {
  app.setSetting('trajectoryAid', !state.settings.trajectoryAid)
  if (assistTip.value) dismissAssistTip()
}
/**
 * Carte d'explication, une seule fois : la première fois qu'on joue sans l'aide
 * (après les niveaux de premiers pas), on dit qu'elle est coupée et comment la remettre.
 */
const assistTip = ref(false)
function maybeAssistTip() {
  if (assistTip.value || state.settings.assistTipSeen === true || !controller) return
  if (phase.value !== 'playing' || coachStep.value || state.settings.trajectoryAid === true || controller.session.assist) return
  if (!isCampaign.value) return
  assistTip.value = true
}
function dismissAssistTip(enable = false) {
  assistTip.value = false
  app.setSetting('assistTipSeen', true)
  if (enable) app.setSetting('trajectoryAid', true)
}

/* ---------- Tutoriel guidé ---------- */

/** Tutoriel en cours (premier passage d'un niveau qui présente un outil). */
let coach = null
const coachStep = shallowRef(null)
const coachProgress = ref({ index: 1, total: 1 })
const coachTool = ref('')
const coachAnchor = computed(() => (phase.value === 'playing' ? coachStep.value?.anchor ?? '' : ''))
let coachTimer = null

function startCoach(tool) {
  stopCoach()
  coach = markRaw(new TutorialCoach(tool))
  coachTool.value = tool
  coach.onChange = (step) => {
    coachStep.value = step
    coachProgress.value = coach?.progress ?? coachProgress.value
    clearTimeout(coachTimer)
    // Dernière bulle : elle s'efface d'elle-même.
    if (step?.id === 'done') coachTimer = setTimeout(stopCoach, 9000)
    if (!step) stopCoach()
  }
  coachStep.value = coach.step
  coachProgress.value = coach.progress
  // Pendant l'apprentissage, la trajectoire prévue est affichée.
  if (controller) controller.session.options.trajectoryAid = true
}
function stopCoach() {
  clearTimeout(coachTimer)
  coach = null
  coachStep.value = null
  if (controller) controller.session.options.trajectoryAid = state.settings.trajectoryAid
}
const coachNotify = (event, detail) => coach?.notify(event, detail)
/** Titre du tutoriel affiché dans l'introduction. */
const coachTitle = computed(() => {
  const tool = coachTool.value
  if (tool === 'aim') return t('tutorial.aimTitle')
  const [kind, name] = tool.split(':')
  const label = kind === 'ammo' ? t(`game.ammo.${name}`) : kind === 'engine' ? t(`game.engines.${name}`) : t(`powers.${name}`)
  return t('tutorial.title', { name: label })
})
watch(
  () => hud.value?.turn,
  (turn, prev) => {
    if (turn > (prev ?? 0)) coachNotify('turn')
  },
)
watch(showPowers, (open) => open && coachNotify('menu'))

/* ---------- Cycle de vie ---------- */

async function startLevel({ rebuild = false } = {}) {
  destroyController()
  end.value = null
  pendingHint.value = null
  pendingFree.value = null
  introRewardFailed.value = false
  showPowers.value = false
  if (!rebuild) phase.value = 'loading'
  const profile = state.profile
  if (mode.value === 'hotseat') {
    if (!tourney || tourney.finished) newTourney()
    state.levelId = tourney.levelId
  }
  const rec = isCoop.value ? profile?.coop?.levels[state.levelId] : profile?.levels[state.levelId]
  // Siège sans fin : un siège neuf au premier château (ou après une défaite).
  if (isEndless.value) {
    if (!profile || !profile.endless?.unlocked) {
      app.go('home', { replace: true })
      return
    }
    if (!endlessRun || endlessRun.over) endlessRun = markRaw(EndlessRun.start())
    state.levelId = endlessRun.levelFor()
    refreshEndless()
  }
  // Atelier : le château est relu et validé à chaque partie.
  if (isCustom.value) {
    try {
      customLevel.value = markRaw(buildCustomLevel(CastleCode.decode(state.match.custom?.code)))
    } catch {
      app.go('home', { replace: true })
      return
    }
  }
  // Défis : le défi du jour exige un profil (la série), le défi par lien un code validé.
  if ((isDaily.value && (!profile || !state.match.daily)) || (isChallenge.value && !state.match.challenge)) {
    app.go('home', { replace: true })
    return
  }
  // Contrôles d'accès : la campagne (seul ou à deux) suit la progression, le mode libre exige un niveau terminé.
  if ((isCampaign.value && !rec?.unlocked) || (mode.value === 'free' && !rec?.completed)) {
    app.go(profile ? (isCoop.value ? 'multiplayer' : 'levels') : 'profiles', { replace: true })
    return
  }
  const players = state.match.players.length === 2 ? state.match.players : [t('mp.defaultName', { n: 1 }), t('mp.defaultName', { n: 2 })]
  // Pouvoirs : ceux débloqués par le profil, en solo comme à deux.
  const completedLevels = Math.max(profile?.completed ?? 0, isCoop.value ? (profile?.coop?.completed ?? 0) : 0)
  const effects = app.activeSlot?.effects
  share.value = { state: 'idle', url: '' }
  // Défi par lien : le score à battre est calculé une fois, en rejouant le tir de l'ami.
  if (isChallenge.value && challengeTarget.value === null) challengeTarget.value = await computeTarget(state.match.challenge)
  const rules =
    isDefi.value || isCustom.value
      ? createMode(mode.value, { completedLevels })
      : isEndless.value
        ? createMode('endless', { effects, completedLevels, shots: endlessRun.shots })
      : mode.value === 'story' || mode.value === 'free'
      ? createMode(mode.value, { effects, completedLevels })
      : mode.value === 'hotseat'
        ? createMode('hotseat', { players: [players[tourney.player]], completedLevels })
        : createMode(mode.value, { players, completedLevels })
  const { GameController } = await import('../../game/GameController.js')
  if (!canvas.value) return
  controller = markRaw(
    await GameController.create(canvas.value, level.value, {
      // À deux, tout se joue en Difficile : deux humains, des châteaux à leur mesure.
      // Défis : Normal pour tout le monde.
      difficulty: isMulti.value ? 'hard' : isDefi.value || isCustom.value || !profile ? 'normal' : profile.difficulty,
      completedLevels,
      settings: { ...state.settings },
      reducedMotion: app.reducedMotion(),
      audio: app.services.audio,
      haptics: app.services.haptics,
      effects,
      mode: rules,
      // Portails : un dernier tir contre une vidéo, en campagne solo uniquement.
      continueOffer: state.rewardedAvailable && mode.value === 'story',
      engine: engine.value,
      replay: isChallenge.value && challengeStage.value === 'watch' ? state.match.challenge.actions : null,
      season: eventFor(dayKey()),
    }),
  )
  controller.on('turn', ({ name }) => showTurn(name))
  controller.on('aimed', () => coachNotify('aim'))
  // Tir, balancier, lâcher ou division (bouton, clavier, ou clic sur la scène au trébuchet).
  controller.on('trigger', ({ result, ammo }) => {
    if (result === 'fired') coachNotify('fire', ammo)
    else if (result === 'armed') {
      coachNotify('arm')
      coachNotify('fire', ammo)
    } else if (result === 'aimed') coachNotify('target')
  })
  controller.on('hud', (h) => (hud.value = h))
  controller.on('caption', (c) => {
    app.caption(c.key, c.side)
    // Les grands fracas font monter la musique.
    if (c.key === 'explosion' || c.key === 'collapse' || c.key === 'quake') app.services.music.surge(3, 4)
  })
  controller.on('announce', (a) => app.announce(formatAnnouncement(a)))
  controller.on('pause', (p) => {
    if (phase.value === 'playing' || phase.value === 'paused') phase.value = p ? 'paused' : 'playing'
    app.services.music.duck(p)
  })
  controller.on('end', onEnd)
  controller.on('offer', () => {
    offer.value = 'idle'
    showPowers.value = false
    phase.value = 'offer'
  })
  hud.value = controller.session.hud
  stopCoach()
  if (mode.value === 'story' && level.value.tutorial && !rec?.completed && state.settings.tutorials !== false) startCoach(level.value.tutorial)
  // Premier passage d'un niveau qui ouvre un chapitre : la Chronique d'abord.
  // Démarrage rapide (nouveau joueur sur un portail) : directement dans la partie, le tutoriel guide.
  const quick = !rebuild && state.match.quick === true
  if (quick) state.match.quick = false
  const beat = !quick && !rebuild && isCampaign.value && !rec?.completed && state.settings.story !== false ? StoryRepository.before(state.levelId) : null
  storyBeat.value = beat
  if (quick) return play()
  phase.value = beat ? 'story' : 'intro'
  await nextTick()
  observeHud()
}

/** Score obtenu par le tir partagé, recalculé par le moteur (jamais lu dans le lien). */
async function computeTarget(run) {
  const [{ GameSession }, { ReplayPlayer }] = await Promise.all([import('../../game/GameSession.js'), import('../../game/replay/ReplayPlayer.js')])
  const session = new GameSession(LevelRepository.get(run.levelId), { difficulty: 'normal', completedLevels: 0, reducedMotion: true, engine: run.engine, replay: true }, createMode('challenge', {}))
  let ended = null
  session.on('end', (e) => (ended = e))
  new ReplayPlayer(session, run.actions).runToEnd()
  const score = ended ? ended.scores[0] : session.score.current
  session.destroy()
  return score
}

/** Défi par lien : regarder le tir de l'ami, puis revenir à l'introduction. */
async function watchChallenge() {
  challengeStage.value = 'watch'
  await startLevel({ rebuild: true })
  play()
}
async function stopWatching() {
  challengeStage.value = 'play'
  await startLevel()
}

/** Partager sa partie (défi du jour ou défi relevé). */
async function shareRun() {
  if (!lastLog || share.value.state === 'busy') return
  share.value = { state: 'busy', url: '' }
  const run = {
    day: isDaily.value ? state.match.daily.key : (state.match.challenge?.day ?? ''),
    levelId: state.levelId,
    engine: engine.value,
    name: state.profile?.name ?? '',
    log: lastLog,
  }
  try {
    const res = await app.shareRun(run, t('daily.shareText', { score: (end.value?.score ?? 0).toLocaleString(state.locale) }))
    share.value = { state: res.method, url: res.url }
    if (res.method === 'copied') app.announce(t('daily.copied'))
  } catch {
    share.value = { state: 'failed', url: '' }
  }
}

function destroyController() {
  clearTimeout(coachTimer)
  coach = null
  coachStep.value = null
  controller?.destroy()
  controller = null
}

function showTurn(name) {
  clearTimeout(turnTimer)
  turnBanner.value = t('game.turnOf', { name })
  app.announce(t('a11y.playerTurn', { name }))
  turnTimer = setTimeout(() => (turnBanner.value = null), 1600)
}

/* Le cadrage de la scène tient compte de la hauteur réelle des bandeaux du HUD. */
const root = ref(null)
let hudObs = null
function measureInsets() {
  if (!controller || !root.value) return
  const el = root.value
  const top = el.querySelector('.hud-top')?.getBoundingClientRect()
  const bottom = el.querySelector('.hud-bottom')?.getBoundingClientRect()
  const h = el.clientHeight
  // Téléphone (v5.5, voir mobile.css) : les commandes sont rangées dans des
  // bandeaux et la scène n'occupe que l'espace restant — aucun bouton dessus.
  const dock = getComputedStyle(el).getPropertyValue('--hud-dock').trim()
  if (dock === 'rail' || dock === 'tray') {
    const visible = (r) => r && r.width > 0 && r.height > 0
    const box = el.getBoundingClientRect()
    const dockTop = visible(top) ? Math.max(0, top.bottom - box.top) : 0
    const dockBottom = dock === 'tray' && visible(bottom) ? Math.max(0, box.bottom - bottom.top) : 0
    const dockRight = dock === 'rail' && visible(bottom) ? Math.max(0, box.right - bottom.left) : 0
    el.style.setProperty('--dock-top', `${Math.round(dockTop)}px`)
    el.style.setProperty('--dock-bottom', `${Math.round(dockBottom)}px`)
    el.style.setProperty('--dock-right', `${Math.round(dockRight)}px`)
    el.style.setProperty('--hud-top-h', `${Math.round(dockTop)}px`)
    el.style.setProperty('--hud-bottom-h', `${Math.round(dockBottom)}px`)
    controller.setInsets(0, 0)
    return
  }
  for (const v of ['--dock-top', '--dock-bottom', '--dock-right']) el.style.removeProperty(v)
  // Barre compacte : les boutons se posent sur la terre du premier plan, la scène garde la hauteur.
  const compact = root.value.querySelector('.hud-bottom--compact')
  // (Plafonné : sur deux lignes — trébuchet en portrait — le panneau ne doit pas masquer le château.)
  const bottomInset = bottom && bottom.height ? h - bottom.top - (compact ? Math.min(bottom.height * 0.55, 56) : 0) : 0
  controller.setInsets(top ? top.bottom : 0, bottomInset)
  // Les sous-titres et l'astuce se placent juste au-dessus des commandes.
  root.value.style.setProperty('--hud-bottom-h', `${Math.round(bottomInset)}px`)
  root.value.style.setProperty('--hud-top-h', `${Math.round(top ? top.bottom : 0)}px`)
}
function observeHud() {
  hudObs?.disconnect()
  if (typeof ResizeObserver === 'undefined' || !root.value) return
  hudObs = new ResizeObserver(measureInsets)
  root.value.querySelectorAll('.hud-top, .hud-bottom').forEach((el) => hudObs.observe(el))
  hudObs.observe(root.value)
  measureInsets()
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKeyUp)
  startLevel()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('keyup', onKeyUp)
  hudObs?.disconnect()
  destroyController()
})
watch(
  () => [state.settings.trajectoryAid, state.settings.screenShake, state.settings.blood, state.settings.screams, state.settings.motion, state.systemReducedMotion, state.settings.slowSwing],
  () => {
    controller?.applySettings({ ...state.settings }, app.reducedMotion())
    if (coach && controller) controller.session.options.trajectoryAid = true
  },
)

/* ---------- Actions ---------- */

const play = async () => {
  app.services.audio.unlock()
  app.services.music.play('chapter', { chapter: level.value.chapter || 1 })
  updateMusic()
  phase.value = 'playing'
  await nextTick()
  observeHud()
}
const pause = () => {
  if (phase.value !== 'playing') return
  showPowers.value = false
  controller?.pause()
}
const resume = () => controller?.resume()
/** Tirer (catapulte), balancier puis lâcher (trébuchet), ou diviser la mitraille. */
const fire = () => {
  if (!controller || phase.value !== 'playing') return
  controller.trigger()
}
function aim(kind, value) {
  const s = controller?.session
  if (!s) return
  s.skipIntro()
  if (kind === 'angle') s.aim(value, s.catapult.power)
  else s.aim(s.catapult.angle, value / 100)
  coachNotify('aim')
}
function nudge(da, dp) {
  if (isTrebuchet.value) return
  controller?.session.nudge(da, dp)
  coachNotify('aim')
}
function selectAmmo(type) {
  if (controller?.session.selectAmmo(type)) coachNotify('select', type)
}
function usePower(id) {
  if (controller?.session.usePower(id)) {
    showPowers.value = false
    coachNotify('power', id)
  }
}
/* Vidéos récompensées en partie (portails, campagne solo) : toujours facultatives. */
/*
 * Vidéos récompensées facultatives (portails, campagne solo).
 * Règle des portails : jamais de bouton vidéo pendant qu'on joue. Elles sont
 * donc proposées sur l'écran d'introduction du niveau ; le ticket obtenu est
 * gardé et utilisé ensuite (l'indice au premier tir, le pouvoir quand le
 * joueur le choisit). Les tickets ne valent que pour ce niveau.
 */
const rewardBusy = ref(false)
const pendingHint = shallowRef(null)
const pendingFree = shallowRef(null)
const introRewardFailed = ref(false)
const introRewards = computed(() =>
  phase.value === 'intro' && state.rewardedAvailable && isCampaign.value && !isCoop.value && hud.value?.rewards
    ? { hint: hud.value.rewards.hint && !pendingHint.value && !state.settings.trajectoryAid, free: hud.value.rewards.freePower && !pendingFree.value && Boolean(hud.value.powers?.some((p) => p.unlocked)) }
    : null,
)
async function watchFor(purpose) {
  if (rewardBusy.value) return
  rewardBusy.value = true
  introRewardFailed.value = false
  const ticket = await app.services.ads.rewarded(purpose)
  rewardBusy.value = false
  if (!ticket) {
    introRewardFailed.value = true
    return
  }
  if (purpose === 'hint') pendingHint.value = markRaw(ticket)
  else pendingFree.value = markRaw(ticket)
}
// L'indice obtenu à l'introduction s'applique au premier tir.
// Aide à la visée : la carte d'explication apparaît au premier tour visé sans aide.
watch(aiming, (now) => now && maybeAssistTip())
watch(coachStep, (step) => !step && aiming.value && maybeAssistTip())

watch(aiming, (now) => {
  if (!now || !pendingHint.value || !controller) return
  if (controller.session.grantHint(pendingHint.value)) app.announce(t('ads.hintGranted'))
  pendingHint.value = null
})
function usePowerFree(id) {
  if (!pendingFree.value || !controller) return
  if (controller.session.usePowerFree(id, pendingFree.value)) {
    pendingFree.value = null
    showPowers.value = false
    coachNotify('power', id)
  }
}

function quit() {
  destroyController()
  tourney = null
  refreshTourney()
  endlessRun = null
  if (isCustom.value) return app.go(state.match.custom?.fromEditor ? 'editor' : 'home')
  app.go(isMulti.value ? 'multiplayer' : isDefi.value ? 'home' : isEndless.value ? 'modes' : 'levels')
}
/** Rejouer : en « chacun sa partie », la revanche repart d'un tournoi neuf. */
async function restart() {
  // Siège sans fin : recommencer, c'est repartir du premier château.
  if (isEndless.value) endlessRun = null
  if (mode.value === 'hotseat' && phase.value === 'ended' && end.value?.kind === 'tourney') tourney = null
  if (phase.value === 'ended') await app.services.ads.interstitial()
  startLevel()
}
/** Chacun sa partie : au joueur suivant, ou à la manche suivante. */
function nextRound() {
  startLevel()
}
async function nextLevel() {
  state.levelId = Math.min(state.levelId + 1, GAME.LEVEL_COUNT)
  // Portails : une publicité éventuelle, uniquement entre deux niveaux (règles AdPolicy).
  await app.services.ads.interstitial()
  startLevel()
}

/* ---------- Vidéos récompensées (portails) ---------- */

/** Dernier tir : la vidéo doit être vue en entier, sinon la défaite reste proposée. */
async function acceptOffer() {
  if (offer.value === 'loading' || !controller) return
  offer.value = 'loading'
  const ticket = await app.services.ads.rewarded('extra-shot')
  if (ticket && controller?.session.acceptOffer(ticket)) {
    offer.value = 'idle'
    phase.value = 'playing'
    app.announce(t('ads.extraShotGranted'))
  } else offer.value = 'failed'
}
function declineOffer() {
  controller?.session.declineOffer()
}
async function doubleGold() {
  if (doubling.value !== 'idle' || !lastResult) return
  doubling.value = 'loading'
  const bonus = await app.doubleGold(lastResult)
  if (bonus > 0) {
    end.value = { ...end.value, gold: end.value.gold + bonus }
    doubling.value = 'done'
    app.announce(t('ads.goldDoubled', { gold: bonus }))
  } else doubling.value = 'failed'
}

/* Événements de partie pour les portails (statistiques, fréquence des pubs). */
watch(phase, (now, before) => {
  if (now === 'playing') app.services.ads.gameplayStart()
  else if (before === 'playing') app.services.ads.gameplayStop()
})

/* ---------- Chronique ---------- */

/** Réplique d'un personnage avant le niveau (campagne, si le récit est affiché). */
const interlude = computed(() => (isCampaign.value && state.settings.story !== false ? StoryRepository.line(state.levelId) : null))

function storyDone() {
  storyBeat.value = null
  if (phase.value === 'story') phase.value = 'intro'
}
/** Épilogue, lu depuis l'écran de victoire finale. */
function readEpilogue() {
  storyBeat.value = StoryRepository.after(GAME.LEVEL_COUNT)
}

/* ---------- Musique ---------- */

/** Dernier niveau d'un chapitre (tous les 10) : la tension reste élevée. */
const isBoss = computed(() => isCampaign.value && state.levelId % GAME.LEVELS_PER_CHAPTER === 0)
function updateMusic() {
  const h = hud.value
  const music = app.services.music
  if (!h || phase.value === 'ended') return
  if (h.state === 'flying') {
    music.setIntensity(2)
    if (h.targetsLeft === 1) music.surge(3, 3)
  } else music.setIntensity(isBoss.value || h.targetsLeft === 1 ? 2 : 1)
}
watch(() => [hud.value?.state, hud.value?.targetsLeft], () => phase.value === 'playing' && updateMusic())

/** Fin de partie : présentation propre à chaque mode. */
async function onEnd(e) {
  app.services.music.stop(1.5)
  lastLog = controller?.session.log ?? null
  if (isChallenge.value && challengeStage.value === 'watch') {
    // Fin de la relecture : retour à l'introduction, le défi peut commencer.
    setTimeout(() => stopWatching(), 1500)
    return
  }
  if (isDaily.value) return onDailyEnd(e)
  if (isEndless.value) return onEndlessEnd(e)
  if (isCustom.value) return onCustomEnd(e)
  if (isChallenge.value) return onChallengeEnd(e)
  if (mode.value === 'story') return onStoryEnd(e)
  if (isCoop.value) return onCoopEnd(e)
  const session = controller?.session
  const names = session?.players.map((p) => p.name) ?? []
  let view
  if (mode.value === 'free') {
    view = { kind: 'free' }
  } else if (mode.value === 'hotseat') {
    const p = session.players[0]
    const shots = p.shotsTotal - p.shotsLeft
    const kills = session.level.targets.length - session.targetsLeft
    const who = tourney.player
    const step = tourney.record({ cleared: e.won, shots, kills, score: e.scores[0] })
    refreshTourney()
    const result = { name: state.match.players[who] || names[0], cleared: e.won, shots, kills, score: e.scores[0] }
    if (step === 'next-player') view = { kind: 'round', who, result, next: tourney.player, nextName: tourney.players[tourney.player] }
    else if (step === 'round-over') view = { kind: 'roundEnd', round: tourney.round - 1, winner: tourney.roundWinner(tourney.round - 1) }
    else view = { kind: 'tourney', winner: tourney.winner, names: [...tourney.players] }
  } else {
    view = {
      kind: 'compare',
      winner: e.winner,
      reason: e.reason,
      names,
      scores: e.scores,
      renown: e.renown,
      defenders: isVersus.value ? session?.hud.players.map((p) => p.defenders) : null,
    }
  }
  setTimeout(() => {
    end.value = view
    phase.value = 'ended'
    if (view.kind === 'compare' || view.kind === 'tourney') app.announce(view.winner === null ? t('end.draw') : t('end.winner', { name: view.names[view.winner] }))
    else if (view.kind === 'round') app.announce(t('end.roundDone', { name: view.result.name }))
    else if (view.kind === 'roundEnd') app.announce(view.winner === null ? t('end.roundDraw') : t('end.roundWon', { name: tourney.players[view.winner] }))
    else app.announce(t('end.cleared'))
  }, 1200)
}

/** Fin d'un niveau de la campagne à deux : progression commune, meilleur joueur. */
async function onCoopEnd({ won, result, renown }) {
  const outcome = result ? await app.recordCoop(result) : { saved: true }
  const names = controller?.session.players.map((p) => p.name) ?? []
  const [a, b] = renown ?? [0, 0]
  setTimeout(() => {
    end.value = {
      kind: 'coop',
      won,
      score: result?.score ?? 0,
      stars: result?.stars ?? 0,
      shotsUsed: result?.shotsUsed ?? 0,
      names,
      renown: [a, b],
      mvp: a === b ? null : a > b ? 0 : 1,
      newBest: won && outcome.newBest,
      saved: outcome.saved !== false,
      hasNext: won && state.levelId < PLAYABLE_LEVELS,
    }
    phase.value = 'ended'
    app.announce(won ? `${t('end.victory')} ${t('a11y.stars', { count: result.stars })}` : t('end.defeat'))
  }, won ? 1400 : 900)
}

/** Fin du défi du jour : série, record du jour, partage. */
async function onDailyEnd({ won, result, scores }) {
  const outcome = result ? await app.recordDaily(result, state.match.daily.key) : { saved: true }
  const score = result?.score ?? scores?.[0] ?? 0
  setTimeout(() => {
    end.value = {
      kind: 'daily',
      won,
      score,
      newBest: won && outcome.newBest,
      reward: outcome.reward ?? null,
      streak: outcome.streak ?? state.profile?.daily?.streak ?? 0,
      extended: Boolean(outcome.extended),
      todayBest: state.profile?.daily?.todayBest ?? null,
      saved: outcome.saved !== false,
    }
    phase.value = 'ended'
    app.announce(won ? `${t('end.victory')} ${t('end.score')} ${score}. ${t('daily.streak', { count: end.value.streak })}` : t('end.defeat'))
  }, won ? 1400 : 900)
}

/** Fin d'un château du siège sans fin : château suivant, ou fin du siège. */
async function onEndlessEnd({ result }) {
  const left = controller?.session.player.shotsLeft ?? 0
  const step = endlessRun.record(result, Math.max(0, left))
  refreshEndless()
  let outcome = null
  if (step === 'over') outcome = await app.recordEndless(endlessRun)
  setTimeout(() => {
    end.value =
      step === 'next'
        ? { kind: 'endlessNext', ...endlessRun.last, wave: endlessRun.wave, shots: endlessRun.shots, total: endlessRun.score }
        : { kind: 'endlessOver', cleared: endlessRun.cleared, total: endlessRun.score, newBest: outcome?.newBest, newWave: outcome?.newWave, best: state.profile?.endless?.best ?? 0, saved: outcome?.saved !== false }
    phase.value = 'ended'
    app.announce(step === 'next' ? t('endless.castleDown', { n: endlessRun.cleared }) : t('endless.over', { count: endlessRun.cleared }))
  }, step === 'next' ? 1400 : 900)
}
async function nextCastle() {
  await app.services.ads.interstitial()
  startLevel()
}
function newSiege() {
  endlessRun = null
  startLevel()
}

/** Fin d'une partie dans un château de l'atelier. */
function onCustomEnd({ won, scores }) {
  const fromEditor = state.match.custom?.fromEditor
  // Prendre son propre château prouve qu'il est faisable : on peut alors le partager.
  if (won && fromEditor) {
    state.editorVerified = state.match.custom.code
    try {
      app.services.storage.writeJson(STORAGE_KEYS.verified, state.match.custom.code)
    } catch {
      /* sans stockage : la preuve vaut pour la session */
    }
  }
  setTimeout(() => {
    end.value = { kind: 'custom', won, score: scores?.[0] ?? 0, fromEditor }
    phase.value = 'ended'
    app.announce(won ? t('editor.taken') : t('end.defeat'))
  }, won ? 1400 : 900)
}

/** Fin d'un défi par lien : a-t-on battu le score de l'ami ? */
function onChallengeEnd({ won, scores }) {
  const score = scores?.[0] ?? 0
  const target = challengeTarget.value ?? 0
  setTimeout(() => {
    end.value = { kind: 'challenge', won, score, target, beaten: won && score > target, name: state.match.challenge?.name || '' }
    phase.value = 'ended'
    app.announce(end.value.beaten ? t('daily.beaten') : t('daily.notBeaten', { score: target }))
  }, won ? 1400 : 900)
}

async function onStoryEnd({ won, result }) {
  lastResult = result
  doubling.value = 'idle'
  const maskBefore = state.profile?.levels[result.levelId]?.ach ?? 0
  const outcome = await app.recordResult(result)
  const rec = state.profile?.levels[result.levelId]
  setTimeout(() => {
    end.value = {
      kind: 'story',
      won,
      score: result.score,
      stars: result.stars,
      best: rec?.best ?? 0,
      newBest: won && outcome.newBest,
      unlockedPower: outcome.unlockedPower,
      gold: outcome.gold || 0,
      achMask: maskBefore,
      achFresh: outcome.newAchievements || 0,
      shotsUsed: result.shotsUsed,
      saved: outcome.saved,
      hasNext: won && result.levelId < PLAYABLE_LEVELS,
      campaignDone: won && result.levelId === GAME.LEVEL_COUNT,
      demoDone: won && IS_DEMO && result.levelId === PLAYABLE_LEVELS,
    }
    phase.value = 'ended'
    app.announce(won ? `${t('end.victory')} ${t('end.score')} ${result.score}. ${t('a11y.stars', { count: result.stars })}` : t('end.defeat'))
  }, won ? 1400 : 900)
}

/** Titre de l'introduction et du bandeau : niveau, ou arène en face-à-face. */
const matchTitle = computed(() =>
  isCustom.value
    ? state.match.custom?.name || t('editor.untitled')
    : isEndless.value
    ? t('endless.castle', { n: endlessView.value?.wave ?? 1 })
    : isDaily.value
    ? t('daily.title')
    : isChallenge.value
      ? state.match.challenge?.name
        ? t('daily.challengeFrom', { name: state.match.challenge.name })
        : t('daily.challengeTitle')
      : isVersus.value ? t(`mp.arenas.${state.match.arenaId}`) : isDuel.value ? t(`mp.duels.${state.match.duelId}`) : t('game.level', { n: state.levelId }),
)
const matchSubtitle = computed(() => {
  if (isCustom.value) return state.match.custom?.fromEditor ? t('editor.testing') : t('editor.title')
  if (isEndless.value) return `${t('endless.title')} · ${t('end.points', { score: (endlessView.value?.score ?? 0).toLocaleString(state.locale) })}`
  if (isDaily.value) return `${formatDay(state.match.daily.key)} · ${t('game.level', { n: state.levelId })}`
  if (isChallenge.value) return t('game.level', { n: state.levelId })
  if (isCoop.value) return `${t('mp.formats.coop.name')} · ${t('levels.chapter', { n: level.value.chapter })} · ${t(`levels.chapters.${level.value.chapter}`)}`
  if (mode.value === 'hotseat' && tourneyView.value) return `${t('mp.formats.hotseat.name')} · ${t('mp.roundOf', { n: Math.min(tourneyView.value.round + 1, 3) })}`
  if (isMulti.value) return t(`mp.formats.${mode.value}.name`)
  if (mode.value === 'free') return t('levels.free')
  return `${t('levels.chapter', { n: level.value.chapter })} · ${t(`levels.chapters.${level.value.chapter}`)}`
})

/** Date lisible d'un défi du jour (langue du joueur). */
function formatDay(key) {
  const [y, m, d] = key.split('-').map(Number)
  try {
    return new Date(y, m - 1, d).toLocaleDateString(state.locale, { weekday: 'long', day: 'numeric', month: 'long' })
  } catch {
    return key
  }
}

/* ---------- Clavier ---------- */

const ARROWS = Object.freeze({ ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' })
function onKeyUp(e) {
  const arrow = ARROWS[e.code]
  if (arrow) controller?.aimKey(arrow, false)
}
function onKey(e) {
  if (e.target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'range') return
  if (phase.value === 'paused' && (e.key === 'p' || e.key === 'P')) return resume()
  if (phase.value !== 'playing' || showPowers.value) return
  if (controller?.replaying) {
    if (e.code === 'KeyP') stopWatching()
    return
  }
  // Flèches (v5.2) : maintien avec accélération, Maj pour la précision (voir AimInput).
  const arrow = ARROWS[e.code]
  if (arrow) {
    if (e.target?.type === 'range') return
    // Trébuchet : ← → déplacent la cible au sol (Maj : par petits pas).
    if (isTrebuchet.value) {
      if (arrow !== 'left' && arrow !== 'right') return
      e.preventDefault()
      controller?.trebNudge(arrow === 'left' ? -1 : 1, e.shiftKey)
      return
    }
    e.preventDefault()
    controller?.aimKey(arrow, true, e.shiftKey)
    coachNotify('aim')
    return
  }
  switch (e.code) {
    case 'Space':
    case 'Enter':
      if (e.target instanceof HTMLButtonElement) return
      if (!e.repeat) fire()
      break
    // Pas d'Échap : sur les portails, cette touche sert au navigateur (sortie du plein écran).
    case 'KeyP':
      pause()
      break
    default:
      if (/^Digit[1-6]$/.test(e.code)) {
        const a = hud.value?.ammo[Number(e.code.slice(5)) - 1]
        if (a) selectAmmo(a.type)
        break
      }
      return
  }
  e.preventDefault()
}

/* ---------- Accessibilité ---------- */

/** Vent lu aux lecteurs d'écran : vitesse réelle, sens, et rafales en Difficile. */
function windText(w) {
  const h = hud.value
  const kmh = h?.windKmh ?? Math.round(Math.abs(w) * 30)
  if (!kmh) return t('game.windCalm')
  const base = `${kmh} km/h ${w < 0 ? t('a11y.windLeft') : t('a11y.windRight')}`
  return h?.windDynamic ? `${base}, ${t('a11y.windGusty')}` : base
}

function formatAnnouncement({ key, params = {} }) {
  const p = { ...params }
  if (key === 'a11y.turn') p.wind = windText(hud.value?.wind ?? 0)
  if (key === 'a11y.powerUsed') p.power = t(`powers.${params.power}`)
  return t(key, p)
}

const canvasLabel = computed(() =>
  hud.value
    ? `${t('a11y.canvas', { level: state.levelId, targets: hud.value.targetsLeft, shots: hud.value.shotsLeft ?? '∞', wind: windText(hud.value.wind) })} ${isTrebuchet.value ? t('a11y.keyboardHelpTreb') : t('a11y.keyboardHelp')}`
    : t('app.title'),
)
</script>

<template>
  <main ref="root" class="game" :data-phase="phase">
    <canvas ref="canvas" class="game__canvas" role="img" :aria-label="canvasLabel" />

    <template v-if="hud">
      <GameHud :hud="hud" :title="matchTitle" :subtitle="matchSubtitle" :coach="coachAnchor" @pause="pause" @powers="showPowers = !showPowers" />
      <p v-if="turnBanner" class="turn-banner" aria-hidden="true">{{ turnBanner }}</p>

      <PowersMenu
        v-if="showPowers && phase === 'playing'"
        :powers="hud.powers"
        :coach="coachAnchor"
        :free-offer="Boolean(pendingFree) && Boolean(hud.rewards?.freePower)"
        :free-busy="rewardBusy"
        @use="usePower"
        @use-free="usePowerFree"
        @close="showPowers = false"
      />

      <div v-if="isChallenge && challengeStage === 'watch' && phase === 'playing'" class="replay-banner" role="status">
        <AppIcon name="play" :size="18" />
        <span>{{ state.match.challenge?.name ? t('daily.watchingName', { name: state.match.challenge.name }) : t('daily.watching') }}</span>
        <button type="button" class="btn btn--small" @click="stopWatching">{{ t('daily.skip') }}</button>
      </div>
      <div v-show="phase === 'playing' && !(isChallenge && challengeStage === 'watch')" :class="['hud-bottom', { 'hud-bottom--compact': !precise }]">
        <TrebuchetPanel v-if="isTrebuchet" :hud="hud" />
        <AimPanel v-else-if="precise" :angle="hud.angle" :power="hud.power" :disabled="!aiming" :coach="coachAnchor" :min-angle="hud.engine === 'ballista' ? 0 : 5" :max-angle="hud.engine === 'ballista' ? 60 : 80" @aim="aim" @nudge="nudge" />
        <p v-else class="aim-readout" data-coach="aim" :aria-label="`${t('game.angle')} ${hud.angle}°, ${t('game.power')} ${hud.power} %`">
          <span>{{ hud.angle }}°</span><span class="aim-readout__sep" aria-hidden="true">·</span><span>{{ hud.power }} %</span>
        </p>
        <AmmoBar :ammo="hud.ammo" :disabled="!aiming" :coach="coachAnchor" @select="selectAmmo" />
        <button
          type="button"
          :class="['btn btn--icon aid-btn', { 'aid-btn--on': aidActive, 'coach-focus': assistTip }]"
          data-coach="aid"
          :aria-pressed="String(state.settings.trajectoryAid === true)"
          :aria-label="t('game.aidToggle')"
          :title="aidActive ? t('game.aidOn') : t('game.aidOff')"
          @click="toggleAid"
        >
          <AppIcon name="aim" :size="22" />
        </button>
        <button
          type="button"
          :class="['fire-btn', { 'fire-btn--split': hud.canActivate, 'fire-btn--release': hud.trebPhase === 'power', 'coach-focus': coachAnchor === 'fire' }]"
          data-coach="fire"
          :disabled="(!aiming || hud.armed) && !hud.canActivate"
          @click="fire"
        >
          <AppIcon :name="hud.canActivate ? (hud.activateKind === 'dive' ? 'meteor' : 'volley') : 'target'" :size="28" />
          <span>{{ hud.canActivate ? (hud.activateKind === 'dive' ? t('game.dive') : t('game.split')) : isTrebuchet ? (hud.trebPhase === 'power' ? t('game.treb.fireBtn') : t('game.treb.targetBtn')) : t('game.fire') }}</span>
        </button>
      </div>
      <CoachBubble v-if="coachStep && phase === 'playing'" :tool="coachTool" :step="coachStep" :progress="coachProgress" @skip="stopCoach" />
      <aside v-else-if="assistTip && phase === 'playing'" class="coach assist-tip" role="status" aria-live="polite" :aria-label="t('tutorial.assistTitle')">
        <p class="coach__head">
          <AppIcon name="aim" :size="18" />
          <span class="coach__title">{{ t('tutorial.assistTitle') }}</span>
        </p>
        <p class="coach__text">{{ t('tutorial.assist') }}</p>
        <p class="assist-tip__actions">
          <button type="button" class="btn btn--primary" @click="dismissAssistTip(true)">{{ t('tutorial.assistOn') }}</button>
          <button type="button" class="coach__skip" @click="dismissAssistTip(false)">{{ t('tutorial.assistOk') }}</button>
        </p>
      </aside>
      <!-- Geste de visée montré en image : une main tire vers l'arrière puis relâche. -->
      <div v-if="coachAnchor === 'drag' && aiming" class="drag-hint" aria-hidden="true">
        <svg viewBox="0 0 160 120" width="160" height="120">
          <path class="drag-hint__trail" d="M120 30 Q 70 50 40 95" />
          <g class="drag-hint__hand">
            <circle cx="0" cy="0" r="16" class="drag-hint__dot" />
            <path d="M-6 -2 v-16 a5 5 0 0 1 10 0 v12 h2 v-6 a5 5 0 0 1 10 0 v14 c0 10 -6 18 -16 18 h-4 c-6 0 -10 -4 -12 -9 l-6 -12 a4 4 0 0 1 7 -4 z" class="drag-hint__finger" />
          </g>
        </svg>
      </div>
    </template>

    <CaptionFeed />
    <StoryPanel v-if="storyBeat" :key="storyBeat.id" :beat="storyBeat" @done="storyDone" />
    <p class="rotate-hint">{{ t('rotate') }}</p>

    <!-- Introduction du niveau -->
    <ModalPanel v-if="phase === 'intro'" labelledby="intro-title" :closable="false">
      <p class="modal__eyebrow">{{ matchSubtitle }}</p>
      <h2 id="intro-title" class="modal__title">{{ matchTitle }}</h2>
      <template v-if="isCampaign">
        <figure v-if="interlude" class="interlude">
          <PixelPortrait :id="interlude.speaker" height="5.5rem" decorative class="interlude__portrait" />
          <figcaption class="interlude__text">
            <span class="interlude__name">{{ t(`characters.${interlude.speaker}.name`) }}</span>
            <q>{{ t(interlude.key) }}</q>
          </figcaption>
        </figure>
        <p v-if="isCoop">{{ t('mp.formats.coop.desc') }}</p>
        <p class="intro-players" v-if="isCoop">
          <span v-for="(p, i) in hud?.players" :key="i" class="intro-players__name"><span :class="['player-dot', `player-dot--${i + 1}`]" aria-hidden="true" />{{ t('mp.shotsEach', { name: p.name, count: p.shotsLeft }) }}</span>
        </p>
        <p v-else>{{ t('intro.goal') }} {{ t('intro.shots', { count: hud?.shotsTotal ?? level.shots }) }}</p>
        <p class="intro-stars">
          <span><StarRow :count="3" :size="16" />{{ t('intro.star3', { count: level.par }) }}</span>
          <span><StarRow :count="2" :size="16" />{{ t('intro.star2', { count: level.star2 }) }}</span>
        </p>
        <template v-if="!isCoop">
          <h3 class="intro-ach__title"><AppIcon name="trophy" :size="18" />{{ t('ach.title') }}</h3>
          <AchievementList :level="level" :mask="state.profile?.levels[state.levelId]?.ach ?? 0" compact />
        </template>
      </template>
      <template v-else-if="isCustom">
        <p>{{ state.match.custom?.fromEditor ? t('editor.testHint') : t('editor.friendHint') }}</p>
        <p>{{ t('intro.shots', { count: hud?.shotsTotal ?? level.shots }) }}</p>
      </template>
      <template v-else-if="isEndless">
        <p v-if="(endlessView?.wave ?? 1) === 1">{{ t('endless.rules') }}</p>
        <p class="end__big">{{ t('endless.shots', { count: endlessView?.shots ?? 0 }) }}</p>
      </template>
      <template v-else-if="isDefi">
        <p>{{ t(isDaily ? 'daily.rules' : 'daily.challengeRules', { engine: t(`game.engines.${engine}`) }) }}</p>
        <p v-if="isDaily" class="daily-line">
          <AppIcon name="flame" :size="18" />{{ t('daily.streak', { count: state.profile?.daily?.streak ?? 0 }) }}
          <span v-if="state.profile?.daily?.todayBest !== null && state.profile?.daily?.todayBest !== undefined"> · {{ t('daily.todayBest', { score: state.profile.daily.todayBest.toLocaleString(state.locale) }) }}</span>
        </p>
        <p v-if="isChallenge" class="end__big">{{ t('daily.toBeat', { score: (challengeTarget ?? 0).toLocaleString(state.locale) }) }}</p>
      </template>
      <p v-else-if="mode === 'free'">{{ t('levels.freeHint') }}</p>
      <template v-else>
        <p>{{ t(`mp.formats.${mode}.desc`) }}</p>
        <p class="intro-players">
          <template v-if="mode === 'hotseat'">
            <span :class="['player-dot', `player-dot--${(tourneyView?.player ?? 0) + 1}`]" aria-hidden="true" />{{ t('game.turnOf', { name: hud?.players[0]?.name }) }}
            <span v-if="tourneyView" class="intro-players__meta">{{ t('mp.roundsWon', { a: tourneyView.wins[0], b: tourneyView.wins[1] }) }}</span>
          </template>
          <template v-else>
            <span v-for="(p, i) in hud?.players" :key="i" class="intro-players__name"><span :class="['player-dot', `player-dot--${i + 1}`]" aria-hidden="true" />{{ p.name }}</span>
          </template>
        </p>
      </template>
      <p v-if="coachStep" class="intro-tutorial"><AppIcon name="help" :size="18" />{{ coachTitle }}</p>
      <SegmentedControl
        v-if="engineChoice"
        class="intro-engine"
        name="intro-engine"
        :label="t('game.engine')"
        :model-value="engine"
        :options="engineOptions"
        @update:model-value="chooseEngine"
      />
      <p v-if="engine === 'trebuchet'" class="intro-engine__hint">{{ t('game.treb.introHint') }}</p>
      <p v-else-if="engine === 'ballista'" class="intro-engine__hint">{{ t('game.ballistaHint') }}</p>
      <p v-else-if="engineChoice && !ballistaReady" class="intro-engine__hint intro-engine__hint--locked">{{ t('game.ballistaLocked', { levels: BALLISTA_UNLOCK.levels, stars: BALLISTA_UNLOCK.stars }) }}</p>
      <ul v-if="novelties.length" class="novelties">
        <li v-for="n in novelties" :key="n" class="novelties__item">
          <span class="novelties__tag">{{ t('intro.new') }}</span>
          {{ t(`intro.novelty.${n}`) }}
        </li>
      </ul>
      <div v-if="introRewards && (introRewards.hint || introRewards.free || pendingHint || pendingFree)" class="intro-rewards">
        <p class="intro-rewards__title">{{ t('ads.introTitle') }}</p>
        <button v-if="introRewards.hint" type="button" class="btn btn--reward btn--small" :disabled="rewardBusy" @click="watchFor('hint')"><AppIcon name="play" :size="16" />{{ t('ads.introHint') }}</button>
        <p v-else-if="pendingHint" class="notice">{{ t('ads.introHintReady') }}</p>
        <button v-if="introRewards.free" type="button" class="btn btn--reward btn--small" :disabled="rewardBusy" @click="watchFor('free-power')"><AppIcon name="play" :size="16" />{{ t('ads.introFree') }}</button>
        <p v-else-if="pendingFree" class="notice">{{ t('ads.introFreeReady') }}</p>
        <p v-if="introRewardFailed" class="notice notice--warning" role="alert">{{ t('ads.unavailable') }}</p>
      </div>
      <div class="modal__actions">
        <button type="button" class="btn btn--primary btn--large" data-autofocus @click="play">{{ isChallenge ? t('daily.yourTurn') : t('intro.go') }}</button>
        <button v-if="isChallenge" type="button" class="btn" @click="watchChallenge"><AppIcon name="play" />{{ t('daily.watch') }}</button>
        <button type="button" class="btn btn--ghost" @click="quit">{{ t('menu.back') }}</button>
      </div>
    </ModalPanel>

    <!-- Plus de tirs : un dernier tir contre une vidéo (portails, campagne solo) -->
    <ModalPanel v-if="phase === 'offer'" labelledby="offer-title" tone="defeat" :closable="false">
      <h2 id="offer-title" class="modal__title">{{ t('ads.offerTitle') }}</h2>
      <p>{{ t('ads.offerText', { count: hud?.targetsLeft ?? 0 }) }}</p>
      <p v-if="offer === 'failed'" class="notice notice--warning" role="alert">{{ t('ads.unavailable') }}</p>
      <div class="modal__actions">
        <button type="button" class="btn btn--primary btn--large btn--reward" data-autofocus :disabled="offer !== 'idle'" @click="acceptOffer">
          <AppIcon name="play" />{{ offer === 'loading' ? t('ads.loading') : t('ads.extraShot') }}
        </button>
        <button type="button" class="btn btn--ghost" @click="declineOffer">{{ t('ads.giveUp') }}</button>
      </div>
    </ModalPanel>

    <!-- Pause -->
    <ModalPanel v-if="phase === 'paused'" labelledby="pause-title" @close="resume">
      <h2 id="pause-title" class="modal__title">{{ t('game.paused') }}</h2>
      <div class="modal__actions modal__actions--stack">
        <button type="button" class="btn btn--primary btn--large" @click="resume"><AppIcon name="play" />{{ t('game.resume') }}</button>
        <button type="button" class="btn" @click="restart"><AppIcon name="refresh" />{{ t('game.restart') }}</button>
        <button type="button" class="btn btn--ghost" @click="quit"><AppIcon name="map" />{{ t('game.quit') }}</button>
      </div>
      <div class="modal__options">
        <ToggleSwitch id="pause-aid" :model-value="state.settings.trajectoryAid" :label="t('settings.trajectoryAid')" @update:model-value="app.setSetting('trajectoryAid', $event)" />
        <ToggleSwitch id="pause-captions" :model-value="state.settings.captions" :label="t('settings.captions')" @update:model-value="app.setSetting('captions', $event)" />
        <ToggleSwitch id="pause-mute" :model-value="state.settings.muted" :label="t('settings.mute')" @update:model-value="app.setSetting('muted', $event)" />
      </div>
    </ModalPanel>

    <!-- Fin de niveau : campagne -->
    <ModalPanel v-if="phase === 'ended' && end?.kind === 'story'" labelledby="end-title" :tone="end.won ? 'victory' : 'defeat'" :closable="false">
      <h2 id="end-title" class="modal__title">{{ end.won ? t('end.victory') : t('end.defeat') }}</h2>
      <template v-if="end.won">
        <StarRow :count="end.stars" :size="40" class="end__stars" />
        <dl class="end__scores">
          <div><dt>{{ t('end.score') }}</dt><dd>{{ end.score.toLocaleString(state.locale) }}</dd></div>
          <div><dt>{{ t('end.best') }}</dt><dd>{{ end.best.toLocaleString(state.locale) }}</dd></div>
        </dl>
        <p class="end__shots">{{ t('end.shotsUsed', { count: end.shotsUsed }) }}<template v-if="end.stars < 3"> · {{ t('end.star3Hint', { count: level.par }) }}</template></p>
      </template>
      <div class="modal__actions">
        <button v-if="end.hasNext" type="button" class="btn btn--primary btn--large" data-autofocus @click="nextLevel">
          {{ t('end.next') }}
        </button>
        <button type="button" :class="['btn', { 'btn--primary btn--large': !end.won }]" :data-autofocus="!end.hasNext ? '' : undefined" @click="restart">
          <AppIcon name="refresh" />{{ t('end.retry') }}
        </button>
        <button type="button" class="btn btn--ghost" @click="quit"><AppIcon name="map" />{{ t('end.levels') }}</button>
      </div>
      <template v-if="end.won">
        <p v-if="end.newBest" class="end__badge">{{ t('end.newBest') }}</p>
        <AchievementList :level="level" :mask="end.achMask" :fresh="end.achFresh" compact />
        <p v-if="end.gold" class="end__gold"><AppIcon name="coin" />{{ t('end.gold', { gold: end.gold }) }}</p>
        <button v-if="end.gold && state.rewardedAvailable && doubling !== 'done'" type="button" class="btn btn--reward" :disabled="doubling === 'loading' || doubling === 'failed'" @click="doubleGold">
          <AppIcon name="play" />{{ doubling === 'failed' ? t('ads.unavailable') : t('ads.doubleGold') }}
        </button>
        <p v-if="state.match.mode === 'story' && state.profile?.affordable" class="end__workshop">
          <AppIcon name="hammer" :size="20" />{{ t('workshopPrompt.ready', { name: t(`workshop.names.${state.profile.affordable.id}`), cost: state.profile.affordable.cost }) }}
          <button type="button" class="btn btn--small" @click="app.go('workshop')">{{ t('workshopPrompt.go') }}</button>
        </p>
        <p v-if="end.unlockedPower" class="end__power">
          <AppIcon name="flame" />{{ t('powers.unlocked', { name: t(`powers.${end.unlockedPower}`) }) }}
        </p>
        <p v-if="end.campaignDone" class="end__note">{{ t('end.campaignDone') }}</p>
        <button v-if="end.campaignDone" type="button" class="btn" @click="readEpilogue"><AppIcon name="map" />{{ t('story.readEpilogue') }}</button>
        <p v-if="end.demoDone" class="end__note">{{ t('end.demoDone') }}</p>
      </template>
      <p v-else>{{ t('end.defeatHint') }}</p>
      <p v-if="!end.saved" class="notice notice--warning" role="alert">{{ t('end.saveError') }}</p>
    </ModalPanel>

    <!-- Atelier : fin de partie -->
    <ModalPanel v-if="phase === 'ended' && end?.kind === 'custom'" labelledby="end-title" :tone="end.won ? 'victory' : 'defeat'" :closable="false">
      <p class="modal__eyebrow">{{ t('editor.title') }}</p>
      <h2 id="end-title" class="modal__title">{{ end.won ? t('editor.taken') : t('end.defeat') }}</h2>
      <p v-if="end.won" class="end__big">{{ t('end.points', { score: end.score.toLocaleString(state.locale) }) }}</p>
      <p v-if="end.won && end.fromEditor" class="notice">{{ t('editor.verified') }}</p>
      <div class="modal__actions">
        <button v-if="end.fromEditor" type="button" class="btn btn--primary btn--large" data-autofocus @click="quit"><AppIcon name="hammer" />{{ t('editor.back') }}</button>
        <button type="button" :class="['btn', { 'btn--primary btn--large': !end.fromEditor }]" :data-autofocus="end.fromEditor ? undefined : ''" @click="restart"><AppIcon name="refresh" />{{ t('end.retry') }}</button>
        <button v-if="!end.fromEditor" type="button" class="btn" @click="app.go('editor')"><AppIcon name="hammer" />{{ t('editor.buildMine') }}</button>
        <button v-if="!end.fromEditor" type="button" class="btn btn--ghost" @click="quit"><AppIcon name="map" />{{ t('daily.menu') }}</button>
      </div>
    </ModalPanel>

    <!-- Siège sans fin : château abattu -->
    <ModalPanel v-if="phase === 'ended' && end?.kind === 'endlessNext'" labelledby="end-title" tone="victory" :closable="false">
      <p class="modal__eyebrow">{{ t('endless.title') }}</p>
      <h2 id="end-title" class="modal__title">{{ t('endless.castleDown', { n: end.wave - 1 }) }}</h2>
      <p class="end__big">{{ t('end.points', { score: end.score.toLocaleString(state.locale) }) }}</p>
      <p>{{ t('endless.bonus', { count: end.bonus }) }} · {{ t('endless.shots', { count: end.shots }) }}</p>
      <p class="notice">{{ t('endless.total', { score: end.total.toLocaleString(state.locale) }) }}</p>
      <div class="modal__actions">
        <button type="button" class="btn btn--primary btn--large" data-autofocus @click="nextCastle">{{ t('endless.next', { n: end.wave }) }}</button>
        <button type="button" class="btn btn--ghost" @click="quit"><AppIcon name="map" />{{ t('endless.stop') }}</button>
      </div>
    </ModalPanel>

    <!-- Siège sans fin : fin du siège -->
    <ModalPanel v-if="phase === 'ended' && end?.kind === 'endlessOver'" labelledby="end-title" tone="defeat" :closable="false">
      <p class="modal__eyebrow">{{ t('endless.title') }}</p>
      <h2 id="end-title" class="modal__title">{{ t('endless.over', { count: end.cleared }) }}</h2>
      <p class="end__big">{{ t('end.points', { score: end.total.toLocaleString(state.locale) }) }}</p>
      <p v-if="end.newBest || end.newWave" class="end__badge">{{ t('endless.record') }}</p>
      <p v-else class="notice">{{ t('endless.best', { score: end.best.toLocaleString(state.locale) }) }}</p>
      <p v-if="!end.saved" class="notice notice--warning" role="alert">{{ t('end.saveError') }}</p>
      <div class="modal__actions">
        <button type="button" class="btn btn--primary btn--large" data-autofocus @click="newSiege"><AppIcon name="refresh" />{{ t('endless.again') }}</button>
        <button type="button" class="btn btn--ghost" @click="quit"><AppIcon name="map" />{{ t('daily.menu') }}</button>
      </div>
    </ModalPanel>

    <!-- Fin : défi du jour -->
    <ModalPanel v-if="phase === 'ended' && end?.kind === 'daily'" labelledby="end-title" :tone="end.won ? 'victory' : 'defeat'" :closable="false">
      <p class="modal__eyebrow">{{ t('daily.title') }}</p>
      <h2 id="end-title" class="modal__title">{{ end.won ? t('end.victory') : t('end.defeat') }}</h2>
      <template v-if="end.won">
        <p class="end__big">{{ t('end.points', { score: end.score.toLocaleString(state.locale) }) }}</p>
        <p v-if="end.newBest" class="end__badge">{{ t('daily.newBest') }}</p>
        <p class="daily-line"><AppIcon name="flame" :size="20" />{{ t('daily.streak', { count: end.streak }) }}<template v-if="end.extended"> · {{ t('daily.extended') }}</template></p>
        <p v-if="end.reward" class="end__badge">{{ t('season.reward', { name: t(`workshop.names.${end.reward}`) }) }}</p>
      </template>
      <p v-else>{{ t('daily.lost') }}</p>
      <p class="notice">{{ t('daily.comeBack') }}</p>
      <div v-if="end.won" class="share">
        <button type="button" class="btn btn--primary" :disabled="share.state === 'busy'" @click="shareRun"><AppIcon name="users" />{{ t('daily.share') }}</button>
        <p v-if="share.state === 'copied'" class="share__done" role="status">{{ t('daily.copied') }}</p>
        <p v-else-if="share.state === 'shared'" class="share__done" role="status">{{ t('daily.shared') }}</p>
        <label v-else-if="share.state === 'manual'" class="share__manual">{{ t('daily.copyManual') }}<input class="input" type="text" readonly :value="share.url" @focus="$event.target.select()"></label>
      </div>
      <p v-if="!end.saved" class="notice notice--warning" role="alert">{{ t('end.saveError') }}</p>
      <div class="modal__actions">
        <button type="button" :class="['btn', { 'btn--primary btn--large': !end.won }]" :data-autofocus="!end.won ? '' : undefined" @click="restart"><AppIcon name="refresh" />{{ t('end.retry') }}</button>
        <button type="button" class="btn btn--ghost" @click="quit"><AppIcon name="map" />{{ t('daily.menu') }}</button>
      </div>
    </ModalPanel>

    <!-- Fin : défi reçu par lien -->
    <ModalPanel v-if="phase === 'ended' && end?.kind === 'challenge'" labelledby="end-title" :tone="end.beaten ? 'victory' : 'defeat'" :closable="false">
      <p class="modal__eyebrow">{{ t('daily.challengeTitle') }}</p>
      <h2 id="end-title" class="modal__title">{{ end.beaten ? t('daily.beaten') : t('daily.notBeatenTitle') }}</h2>
      <dl class="end__scores">
        <div><dt>{{ t('daily.you') }}</dt><dd>{{ end.score.toLocaleString(state.locale) }}</dd></div>
        <div><dt>{{ end.name || t('daily.friend') }}</dt><dd>{{ end.target.toLocaleString(state.locale) }}</dd></div>
      </dl>
      <div v-if="end.won" class="share">
        <button type="button" class="btn btn--primary" :disabled="share.state === 'busy'" @click="shareRun"><AppIcon name="users" />{{ t('daily.shareBack') }}</button>
        <p v-if="share.state === 'copied'" class="share__done" role="status">{{ t('daily.copied') }}</p>
        <p v-else-if="share.state === 'shared'" class="share__done" role="status">{{ t('daily.shared') }}</p>
        <label v-else-if="share.state === 'manual'" class="share__manual">{{ t('daily.copyManual') }}<input class="input" type="text" readonly :value="share.url" @focus="$event.target.select()"></label>
      </div>
      <div class="modal__actions">
        <button type="button" :class="['btn', { 'btn--primary btn--large': !end.won }]" :data-autofocus="!end.won ? '' : undefined" @click="restart"><AppIcon name="refresh" />{{ t('end.retry') }}</button>
        <button type="button" class="btn btn--ghost" @click="quit"><AppIcon name="map" />{{ t('daily.menu') }}</button>
      </div>
    </ModalPanel>

    <!-- Fin : mode libre -->
    <ModalPanel v-if="phase === 'ended' && end?.kind === 'free'" labelledby="end-title" tone="victory" :closable="false">
      <h2 id="end-title" class="modal__title">{{ t('end.cleared') }}</h2>
      <p>{{ t('end.freeNote') }}</p>
      <div class="modal__actions">
        <button type="button" class="btn btn--primary btn--large" data-autofocus @click="restart"><AppIcon name="refresh" />{{ t('end.retry') }}</button>
        <button type="button" class="btn btn--ghost" @click="quit"><AppIcon name="map" />{{ t('end.levels') }}</button>
      </div>
    </ModalPanel>

    <!-- Chacun sa partie : un joueur a fini, au suivant -->
    <ModalPanel v-if="phase === 'ended' && end?.kind === 'round'" labelledby="end-title" :closable="false">
      <h2 id="end-title" class="modal__title">{{ t('end.roundDone', { name: end.result.name }) }}</h2>
      <p class="end__big">{{ end.result.cleared ? t('mp.clearedIn', { count: end.result.shots }) : t('mp.felled', { count: end.result.kills }) }}</p>
      <p>{{ t('end.points', { score: end.result.score.toLocaleString(state.locale) }) }}</p>
      <p class="notice">{{ end.result.cleared ? t('mp.toBeatCleared', { name: end.nextName, count: end.result.shots }) : t('mp.toBeatKills', { name: end.nextName, count: end.result.kills }) }}</p>
      <div class="modal__actions">
        <button type="button" class="btn btn--primary btn--large" data-autofocus @click="nextRound">
          <span :class="['player-dot', `player-dot--${end.next + 1}`]" aria-hidden="true" />{{ t('end.nextRound', { name: end.nextName }) }}
        </button>
        <button type="button" class="btn btn--ghost" @click="quit">{{ t('game.quit') }}</button>
      </div>
    </ModalPanel>

    <!-- Chacun sa partie : fin de manche, ou fin du tournoi -->
    <ModalPanel v-if="phase === 'ended' && (end?.kind === 'roundEnd' || end?.kind === 'tourney') && tourneyView" labelledby="end-title" :tone="end.kind === 'tourney' ? 'victory' : 'neutral'" :closable="false">
      <p class="modal__eyebrow">{{ t('mp.formats.hotseat.name') }}</p>
      <h2 id="end-title" class="modal__title">
        <template v-if="end.kind === 'tourney'">{{ end.winner === null ? t('end.draw') : t('end.winner', { name: end.names[end.winner] }) }}</template>
        <template v-else>{{ end.winner === null ? t('end.roundDraw') : t('end.roundWon', { name: tourney?.players[end.winner] }) }}</template>
      </h2>
      <table class="tourney">
        <caption class="visually-hidden">{{ t('mp.tourneyTable') }}</caption>
        <thead>
          <tr>
            <th scope="col">{{ t('mp.round') }}</th>
            <th v-for="(n, i) in state.match.players" :key="i" scope="col"><span :class="['player-dot', `player-dot--${i + 1}`]" aria-hidden="true" />{{ n }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, k) in tourneyView.table" :key="k" :class="{ 'tourney__row--pending': !r.played }">
            <th scope="row">{{ t('game.level', { n: r.levelId }) }}</th>
            <td v-for="(x, i) in r.results" :key="i" :class="{ 'tourney__win': r.played && r.winner === i }">
              <template v-if="x">{{ x.cleared ? t('mp.clearedShort', { count: x.shots }) : t('mp.felledShort', { count: x.kills }) }}<AppIcon v-if="r.played && r.winner === i" name="crown" :size="14" /></template>
              <template v-else>–</template>
            </td>
          </tr>
        </tbody>
      </table>
      <p class="end__big">{{ t('mp.roundsWon', { a: tourneyView.wins[0], b: tourneyView.wins[1] }) }}</p>
      <div class="modal__actions">
        <button v-if="end.kind === 'roundEnd'" type="button" class="btn btn--primary btn--large" data-autofocus @click="nextRound">
          <span :class="['player-dot', `player-dot--${(tourneyView.player ?? 0) + 1}`]" aria-hidden="true" />{{ t('mp.nextRoundOf', { n: tourneyView.round + 1, name: tourney?.players[tourneyView.player] }) }}
        </button>
        <button v-else type="button" class="btn btn--primary btn--large" data-autofocus @click="restart"><AppIcon name="refresh" />{{ t('end.rematch') }}</button>
        <button type="button" class="btn btn--ghost" @click="quit"><AppIcon name="users" />{{ t('end.otherMatch') }}</button>
      </div>
    </ModalPanel>

    <!-- Duel et face-à-face : résultat -->
    <ModalPanel v-if="phase === 'ended' && end?.kind === 'compare'" labelledby="end-title" tone="victory" :closable="false">
      <h2 id="end-title" class="modal__title">{{ end.winner === null ? t('end.draw') : t('end.winner', { name: end.names[end.winner] }) }}</h2>
      <p v-if="end.reason" class="end__reason">{{ t(`mp.reasons.${end.reason}`) }}</p>
      <ol class="versus-result">
        <li v-for="(name, i) in end.names" :key="i" :class="['versus-result__row', { 'versus-result__row--win': end.winner === i }]">
          <span :class="['player-dot', `player-dot--${i + 1}`]" aria-hidden="true" />
          <span class="versus-result__name">{{ name }}</span>
          <span class="versus-result__score">
            <template v-if="end.defenders">{{ t('end.defendersLeft', { count: end.defenders[i] }) }}</template>
            <template v-else>{{ t('mp.renownPts', { count: end.renown[i] }) }} · {{ t('end.points', { score: end.scores[i].toLocaleString(state.locale) }) }}</template>
          </span>
          <AppIcon v-if="end.winner === i" name="crown" :size="20" />
        </li>
      </ol>
      <div class="modal__actions">
        <button type="button" class="btn btn--primary btn--large" data-autofocus @click="restart"><AppIcon name="refresh" />{{ t('end.rematch') }}</button>
        <button type="button" class="btn btn--ghost" @click="quit"><AppIcon name="users" />{{ t('end.otherMatch') }}</button>
      </div>
    </ModalPanel>

    <!-- Campagne à deux : fin de niveau -->
    <ModalPanel v-if="phase === 'ended' && end?.kind === 'coop'" labelledby="end-title" :tone="end.won ? 'victory' : 'defeat'" :closable="false">
      <p class="modal__eyebrow">{{ t('mp.formats.coop.name') }}</p>
      <h2 id="end-title" class="modal__title">{{ end.won ? t('end.victory') : t('end.defeat') }}</h2>
      <template v-if="end.won">
        <StarRow :count="end.stars" :size="40" class="end__stars" />
        <p class="end__shots">{{ t('end.shotsUsed', { count: end.shotsUsed }) }} · {{ t('end.points', { score: end.score.toLocaleString(state.locale) }) }}</p>
        <p v-if="end.newBest" class="end__badge">{{ t('end.newBest') }}</p>
      </template>
      <p v-else>{{ t('mp.coopDefeat') }}</p>
      <ol class="versus-result">
        <li v-for="(name, i) in end.names" :key="i" :class="['versus-result__row', { 'versus-result__row--win': end.mvp === i }]">
          <span :class="['player-dot', `player-dot--${i + 1}`]" aria-hidden="true" />
          <span class="versus-result__name">{{ name }}</span>
          <span class="versus-result__score">{{ t('mp.renownPts', { count: end.renown[i] }) }}</span>
          <span v-if="end.mvp === i" class="mvp-badge">{{ t('mp.mvp') }}</span>
        </li>
      </ol>
      <p v-if="!end.saved" class="notice notice--warning" role="alert">{{ t('end.saveError') }}</p>
      <div class="modal__actions">
        <button v-if="end.hasNext" type="button" class="btn btn--primary btn--large" data-autofocus @click="nextLevel">{{ t('end.next') }}</button>
        <button type="button" :class="['btn', { 'btn--primary btn--large': !end.won }]" :data-autofocus="!end.hasNext ? '' : undefined" @click="restart"><AppIcon name="refresh" />{{ t('end.retry') }}</button>
        <button type="button" class="btn btn--ghost" @click="quit"><AppIcon name="users" />{{ t('mp.backToMenu') }}</button>
      </div>
    </ModalPanel>
  </main>
</template>
