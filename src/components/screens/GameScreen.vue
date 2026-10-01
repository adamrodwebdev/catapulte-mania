<script setup>
import { ref, shallowRef, computed, onMounted, onBeforeUnmount, watch, markRaw, nextTick } from 'vue'
import { useApp } from '../../app/AppContext.js'
import { LevelRepository } from '../../game/levels/LevelRepository.js'
import { GAME, IS_DEMO, PLAYABLE_LEVELS } from '../../config/gameConfig.js'
import GameHud from '../game/GameHud.vue'
import AimPanel from '../game/AimPanel.vue'
import AmmoBar from '../game/AmmoBar.vue'
import PowersMenu from '../game/PowersMenu.vue'
import CaptionFeed from '../game/CaptionFeed.vue'
import ModalPanel from '../ui/ModalPanel.vue'
import StarRow from '../ui/StarRow.vue'
import AppIcon from '../ui/AppIcon.vue'
import ToggleSwitch from '../ui/ToggleSwitch.vue'

const app = useApp()
const { state, t } = app

const canvas = ref(null)
/** Le contrôleur de jeu n'est pas réactif (markRaw) : Vue n'observe que le HUD. */
let controller = null
const hud = shallowRef(null)
const phase = ref('loading') // loading | intro | playing | paused | ended
const showPowers = ref(false)
const end = ref(null)
const level = computed(() => LevelRepository.get(state.levelId))
const novelties = computed(() => LevelRepository.novelties(state.levelId))
const aiming = computed(() => phase.value === 'playing' && hud.value?.state === 'aiming')

/* ---------- Cycle de vie ---------- */

async function startLevel() {
  destroyController()
  end.value = null
  showPowers.value = false
  phase.value = 'loading'
  const profile = state.profile
  if (!profile || !profile.levels[state.levelId]?.unlocked) {
    app.go('levels', { replace: true })
    return
  }
  const { GameController } = await import('../../game/GameController.js')
  if (!canvas.value) return
  controller = markRaw(
    await GameController.create(canvas.value, level.value, {
      difficulty: profile.difficulty,
      completedLevels: profile.completed,
      settings: { ...state.settings },
      reducedMotion: app.reducedMotion(),
      audio: app.services.audio,
      haptics: app.services.haptics,
    }),
  )
  controller.on('hud', (h) => (hud.value = h))
  controller.on('caption', (c) => app.caption(c.key, c.side))
  controller.on('announce', (a) => app.announce(formatAnnouncement(a)))
  controller.on('pause', (p) => {
    if (phase.value === 'playing' || phase.value === 'paused') phase.value = p ? 'paused' : 'playing'
  })
  controller.on('end', onEnd)
  hud.value = controller.session.hud
  phase.value = 'intro'
  await nextTick()
  observeHud()
}

function destroyController() {
  controller?.destroy()
  controller = null
}

/* Le cadrage de la scène tient compte de la hauteur réelle des bandeaux du HUD. */
const root = ref(null)
let hudObs = null
function measureInsets() {
  if (!controller || !root.value) return
  const top = root.value.querySelector('.hud-top')?.getBoundingClientRect()
  const bottom = root.value.querySelector('.hud-bottom')?.getBoundingClientRect()
  const h = root.value.clientHeight
  controller.setInsets(top ? top.bottom : 0, bottom && bottom.height ? h - bottom.top : 0)
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
  () => controller?.applySettings({ ...state.settings }, app.reducedMotion()),
)

/* ---------- Actions ---------- */

const play = async () => {
  app.services.audio.unlock()
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
  else if (aiming.value) controller.session.fire()
}
function aim(kind, value) {
  const s = controller?.session
  if (!s) return
  if (kind === 'angle') s.aim(value, s.catapult.power)
  else s.aim(s.catapult.angle, value / 100)
}
const nudge = (da, dp) => controller?.session.nudge(da, dp)
const selectAmmo = (type) => controller?.session.selectAmmo(type)
function usePower(id) {
  if (controller?.session.usePower(id)) showPowers.value = false
}
function quit() {
  destroyController()
  app.go('levels')
}
function nextLevel() {
  state.levelId = Math.min(state.levelId + 1, GAME.LEVEL_COUNT)
  startLevel()
}

async function onEnd({ won, result }) {
  const outcome = await app.recordResult(result)
  const rec = state.profile?.levels[result.levelId]
  setTimeout(() => {
    end.value = {
      won,
      score: result.score,
      stars: result.stars,
      best: rec?.best ?? 0,
      newBest: won && outcome.newBest,
      unlockedPower: outcome.unlockedPower,
      saved: outcome.saved,
      hasNext: won && result.levelId < PLAYABLE_LEVELS,
      campaignDone: won && result.levelId === GAME.LEVEL_COUNT,
      demoDone: won && IS_DEMO && result.levelId === PLAYABLE_LEVELS,
    }
    phase.value = 'ended'
    app.announce(won ? `${t('end.victory')} ${t('end.score')} ${result.score}. ${t('a11y.stars', { count: result.stars })}` : t('end.defeat'))
  }, won ? 1400 : 900)
}

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
    ? `${t('a11y.canvas', { level: state.levelId, targets: hud.value.targetsLeft, shots: hud.value.shotsLeft, wind: windText(hud.value.wind) })} ${t('a11y.keyboardHelp')}`
    : t('app.title'),
)
</script>

<template>
  <main ref="root" class="game" :data-phase="phase">
    <canvas ref="canvas" class="game__canvas" role="img" :aria-label="canvasLabel" />

    <template v-if="hud">
      <GameHud :hud="hud" :level-id="state.levelId" :chapter="level.chapter" @pause="pause" @powers="showPowers = !showPowers" />

      <PowersMenu v-if="showPowers && phase === 'playing'" :powers="hud.powers" @use="usePower" @close="showPowers = false" />

      <div v-show="phase === 'playing'" class="hud-bottom">
        <AimPanel :angle="hud.angle" :power="hud.power" :disabled="!aiming" @aim="aim" @nudge="nudge" />
        <AmmoBar :ammo="hud.ammo" :disabled="!aiming" @select="selectAmmo" />
        <button
          type="button"
          :class="['fire-btn', { 'fire-btn--split': hud.canActivate }]"
          :disabled="!aiming && !hud.canActivate"
          @click="fire"
        >
          <AppIcon :name="hud.canActivate ? 'volley' : 'target'" :size="28" />
          <span>{{ hud.canActivate ? t('game.split') : t('game.fire') }}</span>
        </button>
      </div>
      <p v-if="phase === 'playing' && hud.turn === 0 && hud.state === 'aiming' && state.levelId <= 2" class="game__hint">{{ t('game.aimHint') }}</p>
    </template>

    <CaptionFeed />
    <p class="rotate-hint">{{ t('rotate') }}</p>

    <!-- Introduction du niveau -->
    <ModalPanel v-if="phase === 'intro'" labelledby="intro-title" :closable="false">
      <p class="modal__eyebrow">{{ t('levels.chapter', { n: level.chapter }) }} · {{ t(`levels.chapters.${level.chapter}`) }}</p>
      <h2 id="intro-title" class="modal__title">{{ t('game.level', { n: state.levelId }) }}</h2>
      <p>{{ t('intro.goal') }} {{ t('intro.shots', { count: hud?.shotsTotal ?? level.shots }) }}</p>
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
        <button type="button" class="btn" @click="startLevel"><AppIcon name="refresh" />{{ t('game.restart') }}</button>
        <button type="button" class="btn btn--ghost" @click="quit"><AppIcon name="map" />{{ t('game.quit') }}</button>
      </div>
      <div class="modal__options">
        <ToggleSwitch id="pause-aid" :model-value="state.settings.trajectoryAid" :label="t('settings.trajectoryAid')" @update:model-value="app.setSetting('trajectoryAid', $event)" />
        <ToggleSwitch id="pause-captions" :model-value="state.settings.captions" :label="t('settings.captions')" @update:model-value="app.setSetting('captions', $event)" />
        <ToggleSwitch id="pause-mute" :model-value="state.settings.muted" :label="t('settings.mute')" @update:model-value="app.setSetting('muted', $event)" />
      </div>
    </ModalPanel>

    <!-- Fin de niveau -->
    <ModalPanel v-if="phase === 'ended' && end" labelledby="end-title" :tone="end.won ? 'victory' : 'defeat'" :closable="false">
      <h2 id="end-title" class="modal__title">{{ end.won ? t('end.victory') : t('end.defeat') }}</h2>
      <template v-if="end.won">
        <StarRow :count="end.stars" :size="40" class="end__stars" />
        <dl class="end__scores">
          <div><dt>{{ t('end.score') }}</dt><dd>{{ end.score.toLocaleString(state.locale) }}</dd></div>
          <div><dt>{{ t('end.best') }}</dt><dd>{{ end.best.toLocaleString(state.locale) }}</dd></div>
        </dl>
        <p v-if="end.newBest" class="end__badge">{{ t('end.newBest') }}</p>
        <p v-if="end.unlockedPower" class="end__power">
          <AppIcon name="flame" />{{ t('powers.unlocked', { name: t(`powers.${end.unlockedPower}`) }) }}
        </p>
        <p v-if="end.campaignDone" class="end__note">{{ t('end.campaignDone') }}</p>
        <p v-if="end.demoDone" class="end__note">{{ t('end.demoDone') }}</p>
      </template>
      <p v-else>{{ t('end.defeatHint') }}</p>
      <p v-if="!end.saved" class="notice notice--warning" role="alert">{{ t('end.saveError') }}</p>
      <div class="modal__actions">
        <button v-if="end.hasNext" type="button" class="btn btn--primary btn--large" data-autofocus @click="nextLevel">
          {{ t('end.next') }}
        </button>
        <button type="button" :class="['btn', { 'btn--primary btn--large': !end.won }]" :data-autofocus="!end.hasNext ? '' : undefined" @click="startLevel">
          <AppIcon name="refresh" />{{ t('end.retry') }}
        </button>
        <button type="button" class="btn btn--ghost" @click="quit"><AppIcon name="map" />{{ t('end.levels') }}</button>
      </div>
    </ModalPanel>
  </main>
</template>
