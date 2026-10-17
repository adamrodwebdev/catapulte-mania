<script setup>
import { ref, shallowRef, computed, onMounted, onBeforeUnmount, watch, markRaw, nextTick } from 'vue'
import { useApp } from '../../app/AppContext.js'
import * as Setup from '../../app/MatchSetup.js'
import { EndOfMatch } from '../../app/EndOfMatch.js'
import { windText, formatDegrees, formatPercent, formatDayKey } from '../../app/Formats.js'
import { useGameKeyboard } from '../../composables/useGameKeyboard.js'
import { LevelRepository } from '../../game/levels/LevelRepository.js'
import MasteryCrest from '../ui/MasteryCrest.vue'
import { GAME, PLAYABLE_LEVELS } from '../../config/gameConfig.js'
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
import BossBar from '../game/BossBar.vue'
import BossBanner from '../game/BossBanner.vue'
import GeneralBust from '../game/GeneralBust.vue'
import HighlightClip from '../game/HighlightClip.vue'
import { SKILL_ICONS } from '../../game/bosses/generals.js'
import StoryPanel from '../ui/StoryPanel.vue'
import PixelPortrait from '../ui/PixelPortrait.vue'
import { StoryRepository } from '../../game/story/StoryRepository.js'
import { TutorialCoach } from '../../game/tutorial/Tutorial.js'
import { HotSeatMatch } from '../../game/modes/HotSeatMatch.js'
import { EndlessRun } from '../../domain/EndlessRun.js'
import { CARDS } from '../../domain/EndlessDeck.js'
import { CastleCode, buildCustomLevel } from '../../game/editor/CastleDesign.js'
import { eventFor } from '../../game/events/Season.js'
import { dayKey } from '../../game/daily/DailyChallenge.js'
import ToggleSwitch from '../ui/ToggleSwitch.vue'
import SegmentedControl from '../ui/SegmentedControl.vue'
import TrebuchetPanel from '../game/TrebuchetPanel.vue'
import DriveControl from '../game/DriveControl.vue'
import { BALLISTA_UNLOCK } from '../../game/Ballista.js'

/**
 * Écran de jeu : affichage et câblage. Les règles vivent ailleurs (v6.2) :
 * préparation de la partie (MatchSetup), fin de partie (EndOfMatch), parcours
 * (Tracks), clavier (useGameKeyboard), mises en forme (Formats).
 */
const app = useApp()
const { state, t, n } = app

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
/** Mode de la partie : histoire, libre, duel, chacun sa partie, face-à-face, campagne à deux… */
const mode = computed(() => state.match.mode || 'story')
const isMulti = computed(() => Setup.isMultiMode(mode.value))
const isCoop = computed(() => mode.value === 'coop')
/** Modes qui suivent la campagne (récit, répliques). */
const isCampaign = computed(() => Setup.isCampaignMode(mode.value))
/** Campagne héroïque et Terres du Duc (v6.2) : les parcours de la maîtrise, à médailles. */
const isHeroic = computed(() => mode.value === 'heroic')
const isDuke = computed(() => mode.value === 'duke')
const isMedal = computed(() => Setup.isMedalMode(mode.value))
const isVersus = computed(() => mode.value === 'versus')
const isDuel = computed(() => mode.value === 'duel')
/** Défi du jour, et défi reçu par un lien « Bats mon tir ». */
const isDaily = computed(() => mode.value === 'daily')
const isChallenge = computed(() => mode.value === 'challenge')
/** Coupe de la semaine (v6.0) : mêmes règles que le défi du jour. */
const isCup = computed(() => mode.value === 'cup')
const isDefi = computed(() => Setup.isDefiMode(mode.value))
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
/** Parcours de la partie (campagne, à deux, héroïque, Terres du Duc) : ses niveaux et ses records. */
const track = computed(() => Setup.trackFor(mode.value))
const level = computed(() => Setup.levelFor(mode.value, { levelId: state.levelId, arenaId: state.match.arenaId, duelId: state.match.duelId, customLevel: customLevel.value }))
const novelties = computed(() => (isCampaign.value ? LevelRepository.novelties(state.levelId) : []))
/** Chacun sa partie : le tournoi en trois manches (objet non réactif) et sa copie d'affichage. */
let tourney = null
const tourneyView = shallowRef(null)
function refreshTourney() {
  tourneyView.value = tourney ? { round: tourney.round, player: tourney.player, wins: tourney.wins, table: tourney.table, finished: tourney.finished, winner: tourney.winner, totals: tourney.totals } : null
}
/** Noms des deux joueurs (modes à deux). */
const players = () => Setup.playerNames(state.match.players, (i) => t('mp.defaultName', { n: i }))
function newTourney() {
  const levels = state.match.levels?.length === 3 ? state.match.levels : HotSeatMatch.levelsFrom(state.levelId, app.multiplayerLevels())
  tourney = markRaw(new HotSeatMatch(levels, players()))
  refreshTourney()
}
/** Bandeau « Au tour de… » (modes à deux). */
const turnBanner = ref(null)
let turnTimer = null

/* ---------- Grands sièges et généraux (v6.0) ---------- */

/** Durée de chaque bannière (ms). */
const BANNER_MS = Object.freeze({ cleared: 2000, intro: 3400, order: 1700, hurt: 1700, fallen: 2800 })
const bossBanner = ref(null)
let bossQueue = []
let bossTimer = null
function pushBossBanner(item) {
  // Une présentation ou une chute passe devant les ordres encore en attente.
  if (item.kind === 'intro' || item.kind === 'fallen') bossQueue = bossQueue.filter((b) => b.kind !== 'order')
  bossQueue.push(item)
  if (!bossBanner.value) nextBossBanner()
}
function nextBossBanner() {
  clearTimeout(bossTimer)
  bossBanner.value = bossQueue.shift() ?? null
  if (bossBanner.value) bossTimer = setTimeout(nextBossBanner, BANNER_MS[bossBanner.value.kind] ?? 2000)
}
function clearBossBanners() {
  bossQueue = []
  clearTimeout(bossTimer)
  bossBanner.value = null
}
/** Le général du grand siège en cours (barre du général), s'il y en a un. */
const levelGeneral = computed(() => (hud.value?.stageCount > 1 ? (level.value?.general ?? null) : null))
/** Difficulté de la partie (comme pour la session) : les vies du général en dépendent. */
const matchDifficulty = computed(() => Setup.matchDifficulty(mode.value, state.profile))
/** Introduction d'un grand siège : le général qui attend à la dernière étape, ses vies et ses ordres. */
const introGeneral = computed(() => Setup.introGeneral(mode.value, level.value, matchDifficulty.value))

const aiming = computed(() => phase.value === 'playing' && hud.value?.state === 'aiming')

/* ---------- Engin : catapulte, trébuchet ou baliste ---------- */

/** Niveaux réussis par le profil (campagne solo, ou à deux si plus avancée). */
const completedForEngine = computed(() => Setup.completedLevels(mode.value, state.profile))
/** Niveau d'apprentissage du trébuchet, au premier passage : le trébuchet est imposé. */
const trebuchetLesson = computed(() => Setup.isTrebuchetLesson({ mode: mode.value, level: level.value, record: state.profile?.levels[state.levelId], settings: state.settings }))
/** Le trébuchet est débloqué après le niveau 3 (jamais au face-à-face : il tire depuis l'arrière). */
const engineChoice = computed(() => Setup.canChooseEngine({ mode: mode.value, lesson: trebuchetLesson.value, completed: completedForEngine.value }))
/** Baliste (v5.1) : réservée aux profils qui ont presque tout gagné (BALLISTA_UNLOCK). */
const ballistaReady = computed(() => Setup.ballistaReady(completedForEngine.value, state.profile?.stars ?? 0))
const engine = computed(() => Setup.engineFor({ mode: mode.value, match: state.match, lesson: trebuchetLesson.value, choice: engineChoice.value, preferred: state.settings.engine, ballista: ballistaReady.value }))
const engineOptions = computed(() => [
  { value: 'catapult', label: t('game.engines.catapult') },
  { value: 'trebuchet', label: t('game.engines.trebuchet') },
  ...(ballistaReady.value ? [{ value: 'ballista', label: t('game.engines.ballista') }] : []),
])
const isTrebuchet = computed(() => hud.value?.engine === 'trebuchet')
/** Bornes des curseurs de visée (celles de l'engin : voir aim.js et Ballista.js). */
const aimRange = computed(() => Setup.aimRange(hud.value?.engine))
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
  if (tool === 'drag') return t('tutorial.dragTitle')
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
    app.setLevel(tourney.levelId)
  }
  const rec = track.value.record(profile, state.levelId)
  // Siège sans fin : un siège neuf au premier château (ou après une défaite).
  if (isEndless.value) {
    if (!profile || !profile.endless?.unlocked) {
      app.go('home', { replace: true })
      return
    }
    if (!endlessRun || endlessRun.over) endlessRun = markRaw(EndlessRun.start())
    app.setLevel(endlessRun.levelFor())
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
  if (Setup.defiMissing(mode.value, profile, state.match)) {
    app.go('home', { replace: true })
    return
  }
  // Contrôles d'accès : la campagne (seul ou à deux) suit la progression, le mode libre exige un niveau terminé.
  const denied = Setup.accessDenied(mode.value, profile, rec)
  if (denied) {
    app.go(denied, { replace: true })
    return
  }
  // Pouvoirs : ceux débloqués par le profil, en solo comme à deux.
  const completedLevels = Setup.completedLevels(mode.value, profile)
  const effects = app.activeSlot?.effects
  share.value = { state: 'idle', url: '' }
  // Défi par lien : le score à battre est calculé une fois, en rejouant le tir de l'ami.
  if (isChallenge.value && challengeTarget.value === null) challengeTarget.value = await Setup.challengeTarget(state.match.challenge)
  const rules = Setup.matchRules(mode.value, { completedLevels, effects, players: players(), hotseatPlayer: tourney?.player, endless: endlessRun })
  const { GameController } = await import('../../game/GameController.js')
  if (!canvas.value) return
  controller = markRaw(
    await GameController.create(canvas.value, level.value, {
      // À deux, tout se joue en Difficile ; défis : Normal pour tout le monde (voir MatchSetup).
      difficulty: Setup.matchDifficulty(mode.value, profile),
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
      translate: (key) => t(key),
      // Coup de pouce discret (v6.0) : campagne seule, premier chapitre, après des défaites.
      luck: Setup.matchLuck(mode.value, profile, app.activeSlot, state.levelId),
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
  controller.on('hud', (h) => {
    hud.value = h
    // Statistiques du portail (GamePix) : score courant, seulement s'il a changé.
    if (Number.isSafeInteger(h?.score)) app.services.ads.reportScore(h.score)
  })
  controller.on('caption', (c) => {
    app.caption(c.key, c.side)
    // Les grands fracas font monter la musique.
    if (c.key === 'explosion' || c.key === 'collapse' || c.key === 'quake') app.services.music.surge(3, 4)
  })
  controller.on('announce', (a) => app.announce(formatAnnouncement(a)))
  controller.on('pause', (p) => {
    if (phase.value === 'playing' || phase.value === 'paused') phase.value = p ? 'paused' : 'playing'
    app.services.music.duck(p)
    app.services.audio.duckAmbience(p)
  })
  controller.on('end', onEnd)
  controller.on('offer', () => {
    offer.value = 'idle'
    showPowers.value = false
    phase.value = 'offer'
  })
  controller.on('stage', (e) => {
    if (e.phase === 'cleared') pushBossBanner({ kind: 'cleared', id: e.general, stage: e.stage, total: e.total })
    else if (e.general) {
      pushBossBanner({ kind: 'intro', id: e.general })
      // Le général entre en scène : la musique monte.
      app.services.music.surge(3, 6)
    }
  })
  controller.on('general', (e) => {
    if (e.kind === 'turn') pushBossBanner({ kind: 'order', id: e.id, skill: e.skill, icon: SKILL_ICONS[e.skill] ?? null })
    else if (e.kind === 'hurt') pushBossBanner({ kind: 'hurt', id: e.id, lives: e.lives })
    else if (e.kind === 'fallen') pushBossBanner({ kind: 'fallen', id: e.id })
  })
  hud.value = controller.session.hud
  stopCoach()
  if (mode.value === 'story' && level.value.tutorial && !rec?.completed && state.settings.tutorials !== false) startCoach(level.value.tutorial)
  // Premier passage d'un niveau qui ouvre un chapitre : la Chronique d'abord.
  // Démarrage rapide (nouveau joueur sur un portail) : directement dans la partie, le tutoriel guide.
  const quick = !rebuild && app.takeQuickStart()
  const beat = !quick && !rebuild && isCampaign.value && !rec?.completed && state.settings.story !== false ? StoryRepository.before(state.levelId) : null
  storyBeat.value = beat
  if (quick) return play()
  phase.value = beat ? 'story' : 'intro'
  await nextTick()
  observeHud()
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
    const res = await app.shareRun(run, t('daily.shareText', { score: end.value?.score ?? 0 }))
    share.value = { state: res.method, url: res.url }
    if (res.method === 'copied') app.announce(t('daily.copied'))
  } catch {
    share.value = { state: 'failed', url: '' }
  }
}

function destroyController() {
  clearTimeout(coachTimer)
  // Le bilan en attente appartient à la partie qui s'achève (v6.2) : il ne s'affiche plus.
  clearEndTimer()
  clearBossBanners()
  highlight.value = null
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
    el.style.setProperty('--hud-controls-h', `${Math.round(dockBottom)}px`)
    controller.setInsets(0, 0)
    return
  }
  for (const v of ['--dock-top', '--dock-bottom', '--dock-right']) el.style.removeProperty(v)
  // Barre compacte : les boutons se posent sur la terre du premier plan, la scène garde la hauteur.
  const compact = root.value.querySelector('.hud-bottom--compact')
  // (Plafonné : sur deux lignes — trébuchet en portrait — le panneau ne doit pas masquer le château.)
  const bottomInset = bottom && bottom.height ? h - bottom.top - (compact ? Math.min(bottom.height * 0.55, 56) : 0) : 0
  controller.setInsets(top ? top.bottom : 0, bottomInset)
  root.value.style.setProperty('--hud-bottom-h', `${Math.round(bottomInset)}px`)
  // Les sous-titres et l'astuce se placent juste au-dessus des commandes (leur bord réel).
  root.value.style.setProperty('--hud-controls-h', `${Math.round(bottom && bottom.height ? h - bottom.top : 0)}px`)
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

/*
 * Clavier (v6.2, voir useGameKeyboard) : ses écouteurs se posent avant le
 * lancement du niveau, et se retirent avant la fin de la partie. Les actions
 * sont appelées au moment de la touche (elles sont définies plus bas).
 */
const { drive } = useGameKeyboard({
  controller: () => controller,
  phase,
  showPowers,
  isTrebuchet,
  hud,
  coach: coachNotify,
  actions: {
    resume: () => resume(),
    pause: () => pause(),
    fire: () => fire(),
    bucket: () => useBucket(),
    selectAmmo: (type) => selectAmmo(type),
    stopWatching: () => stopWatching(),
  },
})

onMounted(() => {
  startLevel()
})
onBeforeUnmount(() => {
  hudObs?.disconnect()
  destroyController()
  // Écran quitté (v6.2) : ni bandeau de tour ni cloches d'étoiles sur la carte des niveaux.
  clearTimeout(turnTimer)
  clearStarTimers()
})
watch(
  () => [state.settings.trajectoryAid, state.settings.screenShake, state.settings.blood, state.settings.screams, state.settings.motion, state.systemReducedMotion, state.settings.slowSwing, state.settings.contrast],
  () => {
    controller?.applySettings({ ...state.settings }, app.reducedMotion())
    if (coach && controller) controller.session.options.trajectoryAid = true
  },
)

/* ---------- Actions ---------- */

const play = async () => {
  app.services.audio.unlock()
  app.services.music.play('chapter', { chapter: level.value.chapter || 1 })
  app.services.ambience.play(level.value.chapter || 1)
  app.services.audio.duckAmbience(false)
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
  // Coupe de la semaine : retour à l'accueil, la coupe ouverte.
  if (isCup.value) app.requestCup()
  app.go(Setup.exitScreen(mode.value, state.match))
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
  app.setLevel(Math.min(state.levelId + 1, track.value.count))
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
/** La Légende (v6.2), lue depuis l'écran de la maîtrise. */
function readLegend() {
  storyBeat.value = StoryRepository.get('legend')
}

/* ---------- Engin en feu (v5.8) ---------- */

const engineBurning = computed(() => Boolean(hud.value?.condition?.states.some((s) => s.id === 'fire')))
/** Seau d'eau : éteint le feu (bouton ou touche B), en visée comme en plein vol. */
function useBucket() {
  if (!controller || phase.value !== 'playing') return
  if (controller.session.useBucket()) app.announce(t('captions.engine.extinguish'))
}

/* ---------- Musique ---------- */

/** Grand siège (fin de chapitre, ou citadelle du Duc) : la tension reste élevée. */
const isBoss = computed(() => Setup.isBossLevel(mode.value, state.levelId, level.value))
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

/** Écran de fin : une cloche par étoile, au rythme de leur apparition (voir game.css). */
let starTimers = []
function clearStarTimers() {
  starTimers.forEach(clearTimeout)
  starTimers = []
}
watch(end, (e) => {
  const stars = e?.won ? e.stars ?? 0 : 0
  for (let i = 0; i < stars; i++) starTimers.push(setTimeout(() => app.services.audio.play('star', { intensity: 0.8 + i * 0.2 }), 220 + i * 260))
})

/* ---------- Fin de partie : présentation propre à chaque mode (voir EndOfMatch) ---------- */

/** Durée du décompte des tirs restants (v6.0) : le bilan attend la fin du spectacle. */
let celebrateMs = 0
/** Minuterie du bilan (ou de la fin d'une relecture). */
let endTimer = null
function clearEndTimer() {
  clearTimeout(endTimer)
  endTimer = null
}
/** Moments forts (v6.0) : le plus beau tir de la partie, filmé (ou null). */
const highlight = shallowRef(null)
const clipName = computed(() => `catapulte-mania-${isCup.value ? 'coupe' : isDaily.value ? 'defi' : 'niveau'}-${state.levelId}`)

/** Ce que les stratégies de fin de partie lisent et appellent. */
function endContext() {
  return {
    mode: mode.value,
    t,
    n,
    state,
    app,
    session: controller?.session ?? null,
    tourney,
    endlessRun,
    refreshTourney,
    refreshEndless,
    challengeTarget: challengeTarget.value,
  }
}

async function onEnd(e) {
  celebrateMs = e.celebrateMs ?? 0
  highlight.value = null
  controller?.highlight().then((clip) => {
    if (phase.value === 'ended' || phase.value === 'playing') highlight.value = clip
  })
  app.services.music.stop(1.5)
  app.services.audio.stopLoops()
  lastLog = controller?.session.log ?? null
  if (isChallenge.value && challengeStage.value === 'watch') {
    // Fin de la relecture : retour à l'introduction, le défi peut commencer.
    clearEndTimer()
    endTimer = setTimeout(() => stopWatching(), 1500)
    return
  }
  const ending = EndOfMatch.for(mode.value)
  if (ending.doublesGold) {
    lastResult = e.result
    doubling.value = 'idle'
  }
  const match = controller
  const ctx = endContext()
  const outcome = await ending.record(e, ctx)
  // Partie quittée pendant l'enregistrement (v6.2) : aucun bilan sur l'écran suivant.
  if (controller !== match) return
  const view = ending.view(e, outcome, ctx)
  clearEndTimer()
  endTimer = setTimeout(() => {
    end.value = view
    phase.value = 'ended'
    app.announce(ending.announce(view, ctx))
  }, ending.delay(e, outcome, celebrateMs))
}

/** Passer le niveau après trois défaites (v6.0) : le suivant s'ouvre, on y va. */
async function skipLevel() {
  const id = state.levelId
  await app.skipLevel(id)
  if (id < PLAYABLE_LEVELS) {
    app.setLevel(id + 1, { match: true })
    startLevel()
  } else app.go('levels')
}

async function nextCupCastle() {
  await app.services.ads.interstitial()
  await app.startCup(end.value?.next ?? 1)
  startLevel()
}
async function shareCup() {
  const c = state.profile?.cup
  if (!c) return
  share.value = { state: 'busy', url: '' }
  const text = t('cup.shareText', { medal: c.medal ? t(`cup.medals.${c.medal}`) : t('cup.noMedal'), stars: c.stars, max: c.maxStars })
  const r = await app.shareCup(text)
  share.value = { state: r.method, url: r.url }
}

/** Main du siège (v6.0) : garder une carte, puis passer au château suivant. */
function pickCard(id) {
  if (!endlessRun || !end.value?.hand || end.value.picked) return
  endlessRun.pick(id)
  end.value = { ...end.value, picked: id, shots: endlessRun.shots }
  refreshEndless()
  app.announce(t('endless.cardKept', { name: t(`endless.cards.${id}.name`) }))
}
async function nextCastle() {
  await app.services.ads.interstitial()
  startLevel()
}
function newSiege() {
  endlessRun = null
  startLevel()
}

/** Titre de l'introduction et du bandeau : niveau, ou arène en face-à-face. */
const matchTitle = computed(() =>
  isCustom.value
    ? state.match.custom?.name || t('editor.untitled')
    : isEndless.value
    ? t('endless.castle', { n: endlessView.value?.wave ?? 1 })
    : isDaily.value
    ? t('daily.title')
    : isCup.value
    ? t('cup.castle', { n: state.match.cup?.index ?? 1 })
    : isChallenge.value
      ? state.match.challenge?.name
        ? t('daily.challengeFrom', { name: state.match.challenge.name })
        : t('daily.challengeTitle')
      : isVersus.value
        ? t(`mp.arenas.${state.match.arenaId}`)
        : isDuel.value
          ? t(`mp.duels.${state.match.duelId}`)
          : isDuke.value
            ? t(`duke.names.${state.levelId}`)
            : isHeroic.value
              ? t('heroic.level', { n: state.levelId })
              : t('game.level', { n: state.levelId }),
)
const matchSubtitle = computed(() => {
  if (isCustom.value) return state.match.custom?.fromEditor ? t('editor.testing') : t('editor.title')
  if (isEndless.value) return `${t('endless.title')} · ${t('end.points', { score: endlessView.value?.score ?? 0 })}`
  if (isDaily.value) return `${formatDayKey(app.d, state.match.daily.key)} · ${t('game.level', { n: state.levelId })}`
  if (isCup.value) return `${t('cup.title')} · ${t('game.level', { n: state.levelId })}`
  if (isChallenge.value) return t('game.level', { n: state.levelId })
  if (isCoop.value) return `${t('mp.formats.coop.name')} · ${t('levels.chapter', { n: level.value.chapter })} · ${t(`levels.chapters.${level.value.chapter}`)}`
  if (mode.value === 'hotseat' && tourneyView.value) return `${t('mp.formats.hotseat.name')} · ${t('mp.roundOf', { n: Math.min(tourneyView.value.round + 1, 3) })}`
  if (isMulti.value) return t(`mp.formats.${mode.value}.name`)
  if (mode.value === 'free') return t('levels.free')
  if (isDuke.value) return `${t('duke.num')} · ${t('duke.tab')}`
  if (isHeroic.value) return `${t('heroic.title')} · ${t(`levels.chapters.${level.value.chapter}`)}`
  return `${t('levels.chapter', { n: level.value.chapter })} · ${t(`levels.chapters.${level.value.chapter}`)}`
})

/* ---------- Accessibilité ---------- */

function formatAnnouncement({ key, params = {} }) {
  const p = { ...params }
  if (key === 'a11y.turn') p.wind = windText(t, hud.value, hud.value?.wind ?? 0)
  if (key === 'a11y.powerUsed') p.power = t(`powers.${params.power}`)
  // Généraux (v6.0) : leur nom et celui de leur ordre.
  if (params.general) p.general = t(`characters.${params.general}.name`)
  if (key === 'a11y.generalOrder') p.skill = t(`skills.${params.skill}.name`)
  return t(key, p)
}

const canvasLabel = computed(() =>
  hud.value
    ? `${t('a11y.canvas', { level: state.levelId, targets: hud.value.targetsLeft, shots: hud.value.shotsLeft ?? '∞', wind: windText(t, hud.value, hud.value.wind) })} ${isTrebuchet.value ? t('a11y.keyboardHelpTreb') : t('a11y.keyboardHelp')}`
    : t('app.title'),
)
/** Angle et puissance lus dans la barre fine (visée dans la scène). */
const aimReadout = computed(() => (hud.value ? { angle: formatDegrees(t, hud.value.angle), power: formatPercent(t, hud.value.power) } : null))
</script>

<template>
  <main ref="root" class="game" :data-phase="phase">
    <canvas ref="canvas" class="game__canvas" role="img" :aria-label="canvasLabel" />

    <template v-if="hud">
      <GameHud :hud="hud" :title="matchTitle" :subtitle="matchSubtitle" :coach="coachAnchor" @pause="pause" @powers="showPowers = !showPowers" />
      <p v-if="turnBanner" class="turn-banner" aria-hidden="true">{{ turnBanner }}</p>
      <!-- Grand siège (v6.0) : le général, ses vies et son prochain ordre ; les bannières de ses actes. -->
      <BossBar v-if="levelGeneral && (hud.general || hud.stage < hud.stageCount)" :id="levelGeneral" :view="hud.general" :stage-count="hud.stageCount" :acting="hud.state === 'enemy'" />
      <BossBanner v-if="bossBanner && phase !== 'intro' && phase !== 'story'" :key="`${bossBanner.kind}-${bossBanner.id}-${bossBanner.lives ?? ''}-${bossBanner.skill ?? ''}`" :item="bossBanner" />
      <!-- Couvre-feu d'un général : la nuit tombe sur la visée (ni trajectoire, ni repère du dernier tir). -->
      <div v-if="hud.curfew && aiming" class="curfew-veil" aria-hidden="true" />

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
        <!-- Déplacement de l'engin (v6.2) : à gauche, sous le pouce libre. -->
        <DriveControl v-if="hud.drive" :drive="hud.drive" :disabled="!hud.drive.open" :coach="coachAnchor" @drive="drive" />
        <TrebuchetPanel v-if="isTrebuchet" :hud="hud" />
        <AimPanel v-else-if="precise" :angle="hud.angle" :power="hud.power" :disabled="!aiming" :coach="coachAnchor" :min-angle="aimRange.min" :max-angle="aimRange.max" @aim="aim" @nudge="nudge" />
        <p v-else class="aim-readout" data-coach="aim">
          <span aria-hidden="true">{{ aimReadout.angle }}</span><span class="aim-readout__sep" aria-hidden="true">·</span><span aria-hidden="true">{{ aimReadout.power }}</span>
          <span class="visually-hidden">{{ t('game.angle') }} {{ aimReadout.angle }}, {{ t('game.power') }} {{ aimReadout.power }}</span>
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
        <!-- Seau d'eau (v5.8) : éteint le feu de l'engin ; s'agite quand l'engin brûle. -->
        <button
          v-if="hud.condition?.bucketsTotal"
          type="button"
          :class="['btn btn--icon aid-btn bucket-btn', { 'bucket-btn--urgent': engineBurning && hud.condition.buckets > 0 }]"
          :disabled="!engineBurning || hud.condition.buckets === 0"
          :aria-label="t('game.bucket', { count: hud.condition.buckets })"
          :title="engineBurning ? t('game.bucketUse') : t('game.bucketIdle')"
          @click="useBucket"
        >
          <AppIcon name="bucket" :size="22" />
          <span class="bucket-btn__count" aria-hidden="true">{{ hud.condition.buckets }}</span>
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
      <template v-else-if="isMedal">
        <figure v-if="isDuke" class="interlude">
          <PixelPortrait id="gontran" height="5.5rem" decorative class="interlude__portrait" />
          <figcaption class="interlude__text">
            <span class="interlude__name">{{ t('characters.gontran.name') }}</span>
            <q>{{ t(`duke.lines.${state.levelId}`) }}</q>
          </figcaption>
        </figure>
        <p v-else class="intro-heroic"><MasteryCrest :size="22" />{{ t('heroic.rules') }}</p>
        <p>{{ t('intro.goal') }} {{ t('intro.shots', { count: hud?.shotsTotal ?? level.shots }) }}</p>
        <p class="intro-stars">
          <span><span class="medal-dot medal-dot--gold" aria-hidden="true" />{{ t('heroic.medal.gold') }} · {{ t('intro.star3', { count: level.par }) }}</span>
          <span><span class="medal-dot medal-dot--silver" aria-hidden="true" />{{ t('heroic.medal.silver') }} · {{ t('intro.star2', { count: level.star2 }) }}</span>
        </p>
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
          <span v-if="state.profile?.daily?.todayBest !== null && state.profile?.daily?.todayBest !== undefined"> · {{ t('daily.todayBest', { score: state.profile.daily.todayBest }) }}</span>
        </p>
        <p v-if="isChallenge" class="end__big">{{ t('daily.toBeat', { score: challengeTarget ?? 0 }) }}</p>
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
      <section v-if="introGeneral" class="intro-general" :aria-label="t('boss.label', { name: t(`characters.${introGeneral.id}.name`) })">
        <GeneralBust :id="introGeneral.id" :size="64" class="intro-general__bust" />
        <div class="intro-general__body">
          <p class="intro-general__kicker">{{ t('boss.siege', { count: introGeneral.stages }) }}</p>
          <p class="intro-general__name">{{ t(`characters.${introGeneral.id}.name`) }}</p>
          <p class="intro-general__title">
            {{ t(`characters.${introGeneral.id}.role`) }} ·
            <span class="intro-general__lives">{{ t('boss.lives', { count: introGeneral.lives }) }}</span>
          </p>
          <ul class="intro-general__skills">
            <li v-for="s in introGeneral.skills" :key="s">
              <AppIcon :name="SKILL_ICONS[s]" :size="16" />
              <span><strong>{{ t(`skills.${s}.name`) }}</strong> {{ t(`skills.${s}.desc`) }}</span>
            </li>
          </ul>
        </div>
      </section>
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
      <p v-if="!end.won && end.reason === 'engine'" class="end__engine"><AppIcon name="flame" :size="18" />{{ t('end.engineDestroyed') }}</p>
      <template v-if="end.won">
        <StarRow :count="end.stars" :size="40" class="end__stars" />
        <dl class="end__scores">
          <div><dt>{{ t('end.score') }}</dt><dd>{{ n(end.score) }}</dd></div>
          <div><dt>{{ t('end.best') }}</dt><dd>{{ n(end.best) }}</dd></div>
        </dl>
        <p class="end__shots">{{ t('end.shotsUsed', { count: end.shotsUsed }) }}<template v-if="end.stars < 3"> · {{ t('end.star3Hint', { count: level.par }) }}</template></p>
      </template>
      <HighlightClip v-if="highlight" :clip="highlight" :name="clipName" />
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
        <!-- Maîtrise du royaume (v6.2) : le titre, l'écusson, les récompenses, la Légende. -->
        <section v-if="end.mastery" class="end__mastery" role="status">
          <MasteryCrest :size="56" />
          <p class="end__mastery-title">{{ t('mastery.title') }}</p>
          <p>{{ t('mastery.reached') }}</p>
          <p class="end__note">{{ t('mastery.rewards') }}</p>
          <button type="button" class="btn btn--primary" @click="readLegend"><AppIcon name="map" />{{ t('mastery.read') }}</button>
        </section>
        <p v-if="end.demoDone" class="end__note">{{ t('end.demoDone') }}</p>
      </template>
      <p v-else>{{ end.reason === 'engine' ? t('end.engineHint') : t('end.defeatHint') }}</p>
      <div v-if="end.canSkip" class="end__skip">
        <p class="end__note">{{ t('end.skipHint') }}</p>
        <button type="button" class="btn" @click="skipLevel"><AppIcon name="arrow" />{{ t('end.skip') }}</button>
      </div>
      <p v-if="!end.saved" class="notice notice--warning" role="alert">{{ t('end.saveError') }}</p>
    </ModalPanel>

    <!-- Fin de niveau : Campagne héroïque, Terres du Duc (v6.2) -->
    <ModalPanel v-if="phase === 'ended' && end?.kind === 'medal'" labelledby="end-title" :tone="end.won ? 'victory' : 'defeat'" :closable="false">
      <p class="modal__eyebrow">{{ t(end.titleKey) }}</p>
      <h2 id="end-title" class="modal__title">{{ end.won ? t('end.victory') : t('end.defeat') }}</h2>
      <p v-if="!end.won && end.reason === 'engine'" class="end__engine"><AppIcon name="flame" :size="18" />{{ t('end.engineDestroyed') }}</p>
      <template v-if="end.won">
        <p :class="['end__medal', `end__medal--${end.medal}`]"><span :class="['medal-dot', `medal-dot--${end.medal}`]" aria-hidden="true" />{{ t(`heroic.medal.${end.medal}`) }}</p>
        <dl class="end__scores">
          <div><dt>{{ t('end.score') }}</dt><dd>{{ n(end.score) }}</dd></div>
          <div><dt>{{ t('end.best') }}</dt><dd>{{ n(end.best) }}</dd></div>
        </dl>
        <p class="end__shots">{{ t('end.shotsUsed', { count: end.shotsUsed }) }}<template v-if="end.medal !== 'gold'"> · {{ t('end.star3Hint', { count: level.par }) }}</template></p>
        <p v-if="end.newBest" class="end__badge">{{ t('end.newBest') }}</p>
        <p v-if="end.trackDone" class="end__note">{{ t(end.doneKey) }}</p>
      </template>
      <p v-else>{{ end.reason === 'engine' ? t('end.engineHint') : t('end.defeatHint') }}</p>
      <HighlightClip v-if="highlight" :clip="highlight" :name="clipName" />
      <div class="modal__actions">
        <button v-if="end.hasNext" type="button" class="btn btn--primary btn--large" data-autofocus @click="nextLevel">{{ t('end.next') }}</button>
        <button type="button" :class="['btn', { 'btn--primary btn--large': !end.won }]" :data-autofocus="!end.hasNext ? '' : undefined" @click="restart"><AppIcon name="refresh" />{{ t('end.retry') }}</button>
        <button type="button" class="btn btn--ghost" @click="quit"><AppIcon name="map" />{{ t('end.levels') }}</button>
      </div>
      <p v-if="!end.saved" class="notice notice--warning" role="alert">{{ t('end.saveError') }}</p>
    </ModalPanel>

    <!-- Atelier : fin de partie -->
    <ModalPanel v-if="phase === 'ended' && end?.kind === 'custom'" labelledby="end-title" :tone="end.won ? 'victory' : 'defeat'" :closable="false">
      <p class="modal__eyebrow">{{ t('editor.title') }}</p>
      <h2 id="end-title" class="modal__title">{{ end.won ? t('editor.taken') : t('end.defeat') }}</h2>
      <p v-if="end.won" class="end__big">{{ t('end.points', { score: end.score }) }}</p>
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
      <p class="end__big">{{ t('end.points', { score: end.score }) }}</p>
      <p>{{ t('endless.bonus', { count: end.bonus }) }} · {{ t('endless.shots', { count: end.shots }) }}</p>
      <p class="notice">{{ t('endless.total', { score: end.total }) }}</p>
      <!-- Main du siège (v6.0) : trois cartes, on en garde une. -->
      <section v-if="end.hand?.length" class="deck" :aria-label="t('endless.handTitle')">
        <p class="deck__title">{{ end.picked ? t('endless.cardKept', { name: t(`endless.cards.${end.picked}.name`) }) : t('endless.handTitle') }}</p>
        <div class="deck__cards" role="radiogroup" :aria-label="t('endless.handTitle')">
          <button
            v-for="id in end.hand"
            :key="id"
            type="button"
            role="radio"
            :aria-checked="String(end.picked === id)"
            :disabled="Boolean(end.picked) && end.picked !== id"
            :class="['deck-card', { 'deck-card--kept': end.picked === id }]"
            @click="pickCard(id)"
          >
            <AppIcon :name="CARDS[id].icon" :size="28" class="deck-card__icon" />
            <span class="deck-card__name">{{ t(`endless.cards.${id}.name`) }}</span>
            <span class="deck-card__desc">{{ t(`endless.cards.${id}.desc`, { count: CARDS[id].count ?? 1 }) }}</span>
          </button>
        </div>
      </section>
      <div class="modal__actions">
        <button type="button" class="btn btn--primary btn--large" data-autofocus :disabled="Boolean(end.hand?.length) && !end.picked" @click="nextCastle">{{ t('endless.next', { n: end.wave }) }}</button>
        <button type="button" class="btn btn--ghost" @click="quit"><AppIcon name="map" />{{ t('endless.stop') }}</button>
      </div>
    </ModalPanel>

    <!-- Siège sans fin : fin du siège -->
    <ModalPanel v-if="phase === 'ended' && end?.kind === 'endlessOver'" labelledby="end-title" tone="defeat" :closable="false">
      <p class="modal__eyebrow">{{ t('endless.title') }}</p>
      <h2 id="end-title" class="modal__title">{{ t('endless.over', { count: end.cleared }) }}</h2>
      <p class="end__big">{{ t('end.points', { score: end.total }) }}</p>
      <p v-if="end.newBest || end.newWave" class="end__badge">{{ t('endless.record') }}</p>
      <p v-else class="notice">{{ t('endless.best', { score: end.best }) }}</p>
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
        <p class="end__big">{{ t('end.points', { score: end.score }) }}</p>
        <p v-if="end.newBest" class="end__badge">{{ t('daily.newBest') }}</p>
        <p class="daily-line"><AppIcon name="flame" :size="20" />{{ t('daily.streak', { count: end.streak }) }}<template v-if="end.extended"> · {{ t('daily.extended') }}</template></p>
        <p v-if="end.reward" class="end__badge">{{ t('season.reward', { name: t(`workshop.names.${end.reward}`) }) }}</p>
      </template>
      <p v-else>{{ t('daily.lost') }}</p>
      <HighlightClip v-if="highlight" :clip="highlight" :name="clipName" />
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

    <!-- Fin : un château de la coupe de la semaine (v6.0) -->
    <ModalPanel v-if="phase === 'ended' && end?.kind === 'cup'" labelledby="end-title" :tone="end.won ? 'victory' : 'defeat'" :closable="false">
      <p class="modal__eyebrow">{{ t('cup.title') }} · {{ t('cup.castle', { n: end.index }) }}</p>
      <h2 id="end-title" class="modal__title">{{ end.won ? t('end.victory') : t('end.defeat') }}</h2>
      <template v-if="end.won">
        <StarRow :count="end.stars" class="end__stars" />
        <p class="end__big">{{ t('end.points', { score: end.score }) }}</p>
        <p v-if="end.newBest" class="end__badge">{{ t('cup.newBest') }}</p>
      </template>
      <p v-else>{{ t('cup.lost') }}</p>
      <p class="cup-line">
        <span :class="['cup-medal', end.medal ? `cup-medal--${end.medal}` : 'cup-medal--none']" aria-hidden="true"><AppIcon name="trophy" :size="20" /></span>
        {{ t('cup.progress', { stars: end.cupStars, max: end.maxStars }) }} · {{ end.medal ? t(`cup.medals.${end.medal}`) : t('cup.noMedal') }}
      </p>
      <HighlightClip v-if="highlight" :clip="highlight" :name="clipName" />
      <p v-if="end.medalUp && end.medal" class="end__badge">{{ t('cup.medalWon', { medal: t(`cup.medals.${end.medal}`) }) }}</p>
      <div v-if="end.medal" class="share">
        <button type="button" class="btn btn--primary" :disabled="share.state === 'busy'" @click="shareCup"><AppIcon name="users" />{{ t('cup.share') }}</button>
        <p v-if="share.state === 'copied'" class="share__done" role="status">{{ t('daily.copied') }}</p>
        <p v-else-if="share.state === 'shared'" class="share__done" role="status">{{ t('daily.shared') }}</p>
        <label v-else-if="share.state === 'manual'" class="share__manual">{{ t('daily.copyManual') }}<input class="input" type="text" readonly :value="share.url" @focus="$event.target.select()"></label>
      </div>
      <p v-if="!end.saved" class="notice notice--warning" role="alert">{{ t('end.saveError') }}</p>
      <div class="modal__actions">
        <button v-if="end.won && end.next" type="button" class="btn btn--primary btn--large" data-autofocus @click="nextCupCastle">{{ t('cup.next', { n: end.next }) }}</button>
        <button type="button" :class="['btn', { 'btn--primary btn--large': !end.won || !end.next }]" :data-autofocus="!end.won || !end.next ? '' : undefined" @click="restart"><AppIcon name="refresh" />{{ t('end.retry') }}</button>
        <button type="button" class="btn btn--ghost" @click="quit"><AppIcon name="map" />{{ t('cup.back') }}</button>
      </div>
    </ModalPanel>

    <!-- Fin : défi reçu par lien -->
    <ModalPanel v-if="phase === 'ended' && end?.kind === 'challenge'" labelledby="end-title" :tone="end.beaten ? 'victory' : 'defeat'" :closable="false">
      <p class="modal__eyebrow">{{ t('daily.challengeTitle') }}</p>
      <h2 id="end-title" class="modal__title">{{ end.beaten ? t('daily.beaten') : t('daily.notBeatenTitle') }}</h2>
      <dl class="end__scores">
        <div><dt>{{ t('daily.you') }}</dt><dd>{{ n(end.score) }}</dd></div>
        <div><dt>{{ end.name || t('daily.friend') }}</dt><dd>{{ n(end.target) }}</dd></div>
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
      <p>{{ t('end.points', { score: end.result.score }) }}</p>
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
            <template v-else>{{ t('mp.renownPts', { count: end.renown[i] }) }} · {{ t('end.points', { score: end.scores[i] }) }}</template>
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
        <p class="end__shots">{{ t('end.shotsUsed', { count: end.shotsUsed }) }} · {{ t('end.points', { score: end.score }) }}</p>
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
