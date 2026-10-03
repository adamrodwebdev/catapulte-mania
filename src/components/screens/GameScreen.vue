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
import ToggleSwitch from '../ui/ToggleSwitch.vue'

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
const level = computed(() =>
  isVersus.value ? ArenaRepository.get(state.match.arenaId) : isDuel.value ? DuelRepository.get(state.match.duelId) : LevelRepository.get(state.levelId),
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
watch(
  () => hud.value?.turn,
  (turn, prev) => {
    if (turn > (prev ?? 0)) coachNotify('turn')
  },
)
watch(showPowers, (open) => open && coachNotify('menu'))

/* ---------- Cycle de vie ---------- */

async function startLevel() {
  destroyController()
  end.value = null
  showPowers.value = false
  phase.value = 'loading'
  const profile = state.profile
  if (mode.value === 'hotseat') {
    if (!tourney || tourney.finished) newTourney()
    state.levelId = tourney.levelId
  }
  const rec = isCoop.value ? profile?.coop?.levels[state.levelId] : profile?.levels[state.levelId]
  // Contrôles d'accès : la campagne (seul ou à deux) suit la progression, le mode libre exige un niveau terminé.
  if ((isCampaign.value && !rec?.unlocked) || (mode.value === 'free' && !rec?.completed)) {
    app.go(profile ? (isCoop.value ? 'multiplayer' : 'levels') : 'profiles', { replace: true })
    return
  }
  const players = state.match.players.length === 2 ? state.match.players : [t('mp.defaultName', { n: 1 }), t('mp.defaultName', { n: 2 })]
  // Pouvoirs : ceux débloqués par le profil, en solo comme à deux.
  const completedLevels = Math.max(profile?.completed ?? 0, isCoop.value ? (profile?.coop?.completed ?? 0) : 0)
  const effects = app.activeSlot?.effects
  const rules =
    mode.value === 'story' || mode.value === 'free'
      ? createMode(mode.value, { effects, completedLevels })
      : mode.value === 'hotseat'
        ? createMode('hotseat', { players: [players[tourney.player]], completedLevels })
        : createMode(mode.value, { players, completedLevels })
  const { GameController } = await import('../../game/GameController.js')
  if (!canvas.value) return
  controller = markRaw(
    await GameController.create(canvas.value, level.value, {
      // À deux, tout se joue en Difficile : deux humains, des châteaux à leur mesure.
      difficulty: isMulti.value ? 'hard' : profile.difficulty,
      completedLevels,
      settings: { ...state.settings },
      reducedMotion: app.reducedMotion(),
      audio: app.services.audio,
      haptics: app.services.haptics,
      effects,
      mode: rules,
      // Portails : un dernier tir contre une vidéo, en campagne solo uniquement.
      continueOffer: state.rewardedAvailable && mode.value === 'story',
    }),
  )
  controller.on('turn', ({ name }) => showTurn(name))
  controller.on('aimed', () => coachNotify('aim'))
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
  const beat = isCampaign.value && !rec?.completed && state.settings.story !== false ? StoryRepository.before(state.levelId) : null
  storyBeat.value = beat
  phase.value = beat ? 'story' : 'intro'
  await nextTick()
  observeHud()
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
  const top = root.value.querySelector('.hud-top')?.getBoundingClientRect()
  const bottom = root.value.querySelector('.hud-bottom')?.getBoundingClientRect()
  const h = root.value.clientHeight
  const bottomInset = bottom && bottom.height ? h - bottom.top : 0
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
  startLevel()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  hudObs?.disconnect()
  destroyController()
})
watch(
  () => [state.settings.trajectoryAid, state.settings.screenShake, state.settings.blood, state.settings.motion, state.systemReducedMotion],
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
const fire = () => {
  if (!controller) return
  app.services.audio.unlock()
  if (hud.value?.canActivate) controller.session.activate()
  else if (aiming.value) {
    const ammo = controller.session.selectedAmmo
    if (controller.session.fire()) coachNotify('fire', ammo)
  }
}
function aim(kind, value) {
  const s = controller?.session
  if (!s) return
  if (kind === 'angle') s.aim(value, s.catapult.power)
  else s.aim(s.catapult.angle, value / 100)
  coachNotify('aim')
}
function nudge(da, dp) {
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
function quit() {
  destroyController()
  tourney = null
  refreshTourney()
  app.go(isMulti.value ? 'multiplayer' : 'levels')
}
/** Rejouer : en « chacun sa partie », la revanche repart d'un tournoi neuf. */
async function restart() {
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
  isVersus.value ? t(`mp.arenas.${state.match.arenaId}`) : isDuel.value ? t(`mp.duels.${state.match.duelId}`) : t('game.level', { n: state.levelId }),
)
const matchSubtitle = computed(() => {
  if (isCoop.value) return `${t('mp.formats.coop.name')} · ${t('levels.chapter', { n: level.value.chapter })} · ${t(`levels.chapters.${level.value.chapter}`)}`
  if (mode.value === 'hotseat' && tourneyView.value) return `${t('mp.formats.hotseat.name')} · ${t('mp.roundOf', { n: Math.min(tourneyView.value.round + 1, 3) })}`
  if (isMulti.value) return t(`mp.formats.${mode.value}.name`)
  if (mode.value === 'free') return t('levels.free')
  return `${t('levels.chapter', { n: level.value.chapter })} · ${t(`levels.chapters.${level.value.chapter}`)}`
})

/* ---------- Clavier ---------- */

function onKey(e) {
  if (e.target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'range') return
  if (phase.value === 'paused' && (e.key === 'p' || e.key === 'P')) return resume()
  if (phase.value !== 'playing' || showPowers.value) return
  const fast = e.shiftKey ? 5 : 1
  switch (e.code) {
    case 'ArrowLeft':
      if (e.target?.type === 'range') return
      nudge(-fast, 0)
      break
    case 'ArrowRight':
      if (e.target?.type === 'range') return
      nudge(fast, 0)
      break
    case 'ArrowUp':
      if (e.target?.type === 'range') return
      nudge(0, 0.01 * fast)
      break
    case 'ArrowDown':
      if (e.target?.type === 'range') return
      nudge(0, -0.01 * fast)
      break
    case 'Space':
    case 'Enter':
      if (e.target instanceof HTMLButtonElement) return
      fire()
      break
    case 'KeyP':
    case 'Escape':
      pause()
      break
    default:
      if (/^Digit[1-5]$/.test(e.code)) {
        const a = hud.value?.ammo[Number(e.code.slice(5)) - 1]
        if (a) selectAmmo(a.type)
        break
      }
      return
  }
  e.preventDefault()
}

/* ---------- Accessibilité ---------- */

function windText(w) {
  const kmh = Math.round(Math.abs(w) * 30)
  if (!kmh) return t('game.windCalm')
  return `${kmh} km/h ${w < 0 ? t('a11y.windLeft') : t('a11y.windRight')}`
}

function formatAnnouncement({ key, params = {} }) {
  const p = { ...params }
  if (key === 'a11y.turn') p.wind = windText(hud.value?.wind ?? 0)
  if (key === 'a11y.powerUsed') p.power = t(`powers.${params.power}`)
  return t(key, p)
}

const canvasLabel = computed(() =>
  hud.value
    ? `${t('a11y.canvas', { level: state.levelId, targets: hud.value.targetsLeft, shots: hud.value.shotsLeft ?? '∞', wind: windText(hud.value.wind) })} ${t('a11y.keyboardHelp')}`
    : t('app.title'),
)
</script>

<template>
  <main ref="root" class="game" :data-phase="phase">
    <canvas ref="canvas" class="game__canvas" role="img" :aria-label="canvasLabel" />

    <template v-if="hud">
      <GameHud :hud="hud" :title="matchTitle" :subtitle="matchSubtitle" :coach="coachAnchor" @pause="pause" @powers="showPowers = !showPowers" />
      <p v-if="turnBanner" class="turn-banner" aria-hidden="true">{{ turnBanner }}</p>

      <PowersMenu v-if="showPowers && phase === 'playing'" :powers="hud.powers" :coach="coachAnchor" @use="usePower" @close="showPowers = false" />

      <div v-show="phase === 'playing'" class="hud-bottom">
        <AimPanel :angle="hud.angle" :power="hud.power" :disabled="!aiming" :coach="coachAnchor" @aim="aim" @nudge="nudge" />
        <AmmoBar :ammo="hud.ammo" :disabled="!aiming" :coach="coachAnchor" @select="selectAmmo" />
        <button
          type="button"
          :class="['fire-btn', { 'fire-btn--split': hud.canActivate, 'coach-focus': coachAnchor === 'fire' }]"
          data-coach="fire"
          :disabled="!aiming && !hud.canActivate"
          @click="fire"
        >
          <AppIcon :name="hud.canActivate ? 'volley' : 'target'" :size="28" />
          <span>{{ hud.canActivate ? t('game.split') : t('game.fire') }}</span>
        </button>
      </div>
      <CoachBubble v-if="coachStep && phase === 'playing'" :tool="coachTool" :step="coachStep" :progress="coachProgress" @skip="stopCoach" />
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
      <p v-if="coachStep" class="intro-tutorial"><AppIcon name="help" :size="18" />{{ coachTool === 'aim' ? t('tutorial.aimTitle') : t('tutorial.title', { name: coachTool.startsWith('ammo:') ? t(`game.ammo.${coachTool.slice(5)}`) : t(`powers.${coachTool.slice(6)}`) }) }}</p>
      <ul v-if="novelties.length" class="novelties">
        <li v-for="n in novelties" :key="n" class="novelties__item">
          <span class="novelties__tag">{{ t('intro.new') }}</span>
          {{ t(`intro.novelty.${n}`) }}
        </li>
      </ul>
      <div class="modal__actions">
        <button type="button" class="btn btn--primary btn--large" data-autofocus @click="play">{{ t('intro.go') }}</button>
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
        <p v-if="end.newBest" class="end__badge">{{ t('end.newBest') }}</p>
        <AchievementList :level="level" :mask="end.achMask" :fresh="end.achFresh" compact />
        <p v-if="end.gold" class="end__gold"><AppIcon name="coin" />{{ t('end.gold', { gold: end.gold }) }}</p>
        <button v-if="end.gold && state.rewardedAvailable && doubling !== 'done'" type="button" class="btn btn--reward" :disabled="doubling === 'loading' || doubling === 'failed'" @click="doubleGold">
          <AppIcon name="play" />{{ doubling === 'failed' ? t('ads.unavailable') : t('ads.doubleGold') }}
        </button>
        <p v-if="end.unlockedPower" class="end__power">
          <AppIcon name="flame" />{{ t('powers.unlocked', { name: t(`powers.${end.unlockedPower}`) }) }}
        </p>
        <p v-if="end.campaignDone" class="end__note">{{ t('end.campaignDone') }}</p>
        <button v-if="end.campaignDone" type="button" class="btn" @click="readEpilogue"><AppIcon name="map" />{{ t('story.readEpilogue') }}</button>
        <p v-if="end.demoDone" class="end__note">{{ t('end.demoDone') }}</p>
      </template>
      <p v-else>{{ t('end.defeatHint') }}</p>
      <p v-if="!end.saved" class="notice notice--warning" role="alert">{{ t('end.saveError') }}</p>
      <div class="modal__actions">
        <button v-if="end.hasNext" type="button" class="btn btn--primary btn--large" data-autofocus @click="nextLevel">
          {{ t('end.next') }}
        </button>
        <button type="button" :class="['btn', { 'btn--primary btn--large': !end.won }]" :data-autofocus="!end.hasNext ? '' : undefined" @click="restart">
          <AppIcon name="refresh" />{{ t('end.retry') }}
        </button>
        <button type="button" class="btn btn--ghost" @click="quit"><AppIcon name="map" />{{ t('end.levels') }}</button>
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
