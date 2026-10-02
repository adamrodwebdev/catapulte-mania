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
import { StoryRepository } from '../../game/story/StoryRepository.js'
import { TutorialCoach } from '../../game/tutorial/Tutorial.js'
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
/** Mode de la partie : histoire, libre, duel, chacun sa partie, face-à-face. */
const mode = computed(() => state.match.mode || 'story')
const isMulti = computed(() => ['duel', 'hotseat', 'versus'].includes(mode.value))
const isVersus = computed(() => mode.value === 'versus')
const isDuel = computed(() => mode.value === 'duel')
const level = computed(() =>
  isVersus.value ? ArenaRepository.get(state.match.arenaId) : isDuel.value ? DuelRepository.get(state.match.duelId) : LevelRepository.get(state.levelId),
)
const novelties = computed(() => (mode.value === 'story' ? LevelRepository.novelties(state.levelId) : []))
/** Chacun sa partie : manche en cours (0 = joueur 1, 1 = joueur 2) et scores des manches. */
const round = ref(0)
const roundScores = ref([])
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
  const rec = profile?.levels[state.levelId]
  // Contrôles d'accès : la campagne suit la progression, le mode libre exige un niveau terminé.
  if ((mode.value === 'story' && !rec?.unlocked) || (mode.value === 'free' && !rec?.completed)) {
    app.go(profile ? 'levels' : 'profiles', { replace: true })
    return
  }
  const players = state.match.players.length === 2 ? state.match.players : [t('mp.defaultName', { n: 1 }), t('mp.defaultName', { n: 2 })]
  const completedLevels = profile?.completed ?? 0
  const effects = app.activeSlot?.effects
  const rules =
    mode.value === 'story' || mode.value === 'free'
      ? createMode(mode.value, { effects, completedLevels })
      : mode.value === 'hotseat'
        ? createMode('hotseat', { players: [players[round.value]], completedLevels })
        : createMode(mode.value, { players, completedLevels })
  const { GameController } = await import('../../game/GameController.js')
  if (!canvas.value) return
  controller = markRaw(
    await GameController.create(canvas.value, level.value, {
      difficulty: isMulti.value ? 'normal' : profile.difficulty,
      completedLevels,
      settings: { ...state.settings },
      reducedMotion: app.reducedMotion(),
      audio: app.services.audio,
      haptics: app.services.haptics,
      effects,
      mode: rules,
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
  hud.value = controller.session.hud
  stopCoach()
  if (mode.value === 'story' && level.value.tutorial && !rec?.completed && state.settings.tutorials !== false) startCoach(level.value.tutorial)
  // Premier passage d'un niveau qui ouvre un chapitre : la Chronique d'abord.
  const beat = mode.value === 'story' && !rec?.completed && state.settings.story !== false ? StoryRepository.before(state.levelId) : null
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
  round.value = 0
  roundScores.value = []
  app.go(isMulti.value ? 'multiplayer' : 'levels')
}
/** Rejouer : en « chacun sa partie », on repart de la manche du joueur 1. */
function restart() {
  if (mode.value === 'hotseat' && phase.value === 'ended') {
    round.value = 0
    roundScores.value = []
  }
  startLevel()
}
function nextRound() {
  round.value = 1
  startLevel()
}
function nextLevel() {
  state.levelId = Math.min(state.levelId + 1, GAME.LEVEL_COUNT)
  startLevel()
}

/* ---------- Chronique ---------- */

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
const isBoss = computed(() => mode.value === 'story' && state.levelId % GAME.LEVELS_PER_CHAPTER === 0)
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
  const names = controller?.session.players.map((p) => p.name) ?? []
  let view
  if (mode.value === 'free') {
    view = { kind: 'free' }
  } else if (mode.value === 'hotseat') {
    roundScores.value = [...roundScores.value, e.scores[0]]
    if (round.value === 0) {
      view = { kind: 'round', name: names[0], score: e.scores[0], next: state.match.players[1] || t('mp.defaultName', { n: 2 }) }
    } else {
      const [a, b] = roundScores.value
      const winner = a === b ? null : a > b ? 0 : 1
      view = { kind: 'compare', winner, names: state.match.players, scores: roundScores.value }
    }
  } else {
    view = { kind: 'compare', winner: e.winner, names, scores: e.scores, defenders: isVersus.value ? controller?.session.hud.players.map((p) => p.defenders) : null }
  }
  setTimeout(() => {
    end.value = view
    phase.value = 'ended'
    if (view.kind === 'compare') app.announce(view.winner === null ? t('end.draw') : t('end.winner', { name: view.names[view.winner] }))
    else if (view.kind === 'round') app.announce(`${t('end.roundDone', { name: view.name })}. ${t('end.points', { score: view.score })}`)
    else app.announce(t('end.cleared'))
  }, 1200)
}

async function onStoryEnd({ won, result }) {
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
      <template v-if="mode === 'story'">
        <p>{{ t('intro.goal') }} {{ t('intro.shots', { count: hud?.shotsTotal ?? level.shots }) }}</p>
        <p class="intro-stars">
          <span><StarRow :count="3" :size="16" />{{ t('intro.star3', { count: level.par }) }}</span>
          <span><StarRow :count="2" :size="16" />{{ t('intro.star2', { count: level.star2 }) }}</span>
        </p>
        <h3 class="intro-ach__title"><AppIcon name="trophy" :size="18" />{{ t('ach.title') }}</h3>
        <AchievementList :level="level" :mask="state.profile?.levels[state.levelId]?.ach ?? 0" compact />
      </template>
      <p v-else-if="mode === 'free'">{{ t('levels.freeHint') }}</p>
      <template v-else>
        <p>{{ t(`mp.formats.${mode}.desc`) }}</p>
        <p class="intro-players">
          <template v-if="mode === 'hotseat'">
            <span :class="['player-dot', `player-dot--${round + 1}`]" aria-hidden="true" />{{ t('game.turnOf', { name: hud?.players[0]?.name }) }}
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

    <!-- Fin de manche : chacun sa partie -->
    <ModalPanel v-if="phase === 'ended' && end?.kind === 'round'" labelledby="end-title" :closable="false">
      <h2 id="end-title" class="modal__title">{{ t('end.roundDone', { name: end.name }) }}</h2>
      <p class="end__big">{{ t('end.points', { score: end.score.toLocaleString(state.locale) }) }}</p>
      <div class="modal__actions">
        <button type="button" class="btn btn--primary btn--large" data-autofocus @click="nextRound">
          <span class="player-dot player-dot--2" aria-hidden="true" />{{ t('end.nextRound', { name: end.next }) }}
        </button>
        <button type="button" class="btn btn--ghost" @click="quit">{{ t('game.quit') }}</button>
      </div>
    </ModalPanel>

    <!-- Fin : résultat à deux joueurs -->
    <ModalPanel v-if="phase === 'ended' && end?.kind === 'compare'" labelledby="end-title" tone="victory" :closable="false">
      <h2 id="end-title" class="modal__title">{{ end.winner === null ? t('end.draw') : t('end.winner', { name: end.names[end.winner] }) }}</h2>
      <ol class="versus-result">
        <li v-for="(name, i) in end.names" :key="i" :class="['versus-result__row', { 'versus-result__row--win': end.winner === i }]">
          <span :class="['player-dot', `player-dot--${i + 1}`]" aria-hidden="true" />
          <span class="versus-result__name">{{ name }}</span>
          <span class="versus-result__score">
            <template v-if="end.defenders">{{ t('end.defendersLeft', { count: end.defenders[i] }) }}</template>
            <template v-else>{{ t('end.points', { score: end.scores[i].toLocaleString(state.locale) }) }}</template>
          </span>
          <AppIcon v-if="end.winner === i" name="crown" :size="20" />
        </li>
      </ol>
      <div class="modal__actions">
        <button type="button" class="btn btn--primary btn--large" data-autofocus @click="restart"><AppIcon name="refresh" />{{ t('end.rematch') }}</button>
        <button type="button" class="btn btn--ghost" @click="quit"><AppIcon name="users" />{{ t('end.otherMatch') }}</button>
      </div>
    </ModalPanel>
  </main>
</template>
