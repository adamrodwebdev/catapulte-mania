<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useApp } from '../../app/AppContext.js'
import AppIcon from '../ui/AppIcon.vue'
import LanguagePicker from '../ui/LanguagePicker.vue'
import SiegeLandscape from '../ui/SiegeLandscape.vue'
import ModalPanel from '../ui/ModalPanel.vue'
import CupPanel from '../ui/CupPanel.vue'
import { WeeklyCup } from '../../game/daily/WeeklyCup.js'
import { DailyChallenge, dayKey } from '../../game/daily/DailyChallenge.js'
import { eventFor } from '../../game/events/Season.js'
import { IS_DEMO, IS_PORTAL, PLAYABLE_LEVELS, APP_VERSION } from '../../config/gameConfig.js'

const app = useApp()
const { state, t } = app

onMounted(() => app.refreshSlots())

/**
 * Parallaxe de l'illustration (v6) : sur ordinateur, les plans suivent un peu
 * le pointeur (variables --px / --py, de -1 à 1). Rien au toucher ni en
 * mouvement réduit ; une image par rafraîchissement au plus.
 */
const root = ref(null)
let frame = 0
function onPointer(e) {
  if (e.pointerType !== 'mouse' || app.reducedMotion() || frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    const el = root.value
    if (!el) return
    el.style.setProperty('--px', ((e.clientX / innerWidth) * 2 - 1).toFixed(3))
    el.style.setProperty('--py', ((e.clientY / innerHeight) * 2 - 1).toFixed(3))
  })
}
onMounted(() => addEventListener('pointermove', onPointer, { passive: true }))
onBeforeUnmount(() => {
  removeEventListener('pointermove', onPointer)
  cancelAnimationFrame(frame)
})

const lastProfile = computed(() => {
  const idx = app.services.saves.lastSlot
  return state.slots.find((s) => s.index === idx && s.status === 'ok') || null
})

async function continueGame() {
  app.services.audio.unlock()
  if (await app.openProfile(lastProfile.value.index)) app.go('levels')
}

/** Défi du jour : niveau et engin du jour, série du dernier profil. */
const today = DailyChallenge.today()
/** Événement saisonnier en cours (bandeau d'accueil). */
const season = eventFor(dayKey())
const dailyStreak = computed(() => state.profile?.daily?.streak ?? 0)
function daily() {
  app.services.audio.unlock()
  app.startDaily()
}
/** Coupe de la semaine (v6.0) : le panneau s'ouvre sur le profil en cours (ou le dernier). */
const cupWeek = WeeklyCup.thisWeek()
const cupOpen = ref(Boolean(state.showCup))
state.showCup = false
const cupHint = computed(() => {
  const c = state.profile?.cup
  if (!c) return t('cup.menuHint', { n: cupWeek.levels.length })
  return c.medal ? `${t(`cup.medals.${c.medal}`)} · ${t('cup.progress', { stars: c.stars, max: c.maxStars })}` : t('cup.progress', { stars: c.stars, max: c.maxStars })
})
async function openCup() {
  app.services.audio.unlock()
  if (!state.profile) {
    const last = lastProfile.value
    if (!last || !(await app.openProfile(last.index))) return app.startCup(1)
  }
  cupOpen.value = true
}
/** Lien d'une coupe : celle de la semaine s'ouvre ; une coupe finie, on le dit. */
function acceptCup() {
  state.incomingCup = null
  openCup()
}
function acceptChallenge() {
  app.services.audio.unlock()
  app.startChallenge()
}

/** Jouer : sur un portail, un nouveau joueur part directement au premier niveau. */
async function playNow() {
  app.services.audio.unlock()
  if (IS_PORTAL && !lastProfile.value) {
    try {
      if (await app.quickStart()) return
    } catch {
      /* profil impossible à créer : écran des profils */
    }
  }
  open('profiles')
}
function open(screen) {
  app.services.audio.unlock()
  app.go(screen)
}
</script>

<template>
  <main ref="root" class="home">
    <SiegeLandscape class="home__scene" />
    <div class="home__content">
      <header class="home__heading">
        <h1 class="home__title">Catapulte Mania</h1>
        <p class="home__tagline">{{ t('app.tagline') }}</p>
        <p v-if="season && !IS_DEMO" class="home__event">{{ t(`season.${season}`) }}</p>
        <p v-if="IS_DEMO" class="home__demo">{{ t('demo.banner', { count: PLAYABLE_LEVELS }) }}</p>
      </header>

      <nav class="banner" :aria-label="t('app.title')">
        <ul class="banner__list">
          <li v-if="lastProfile">
            <button type="button" class="banner__item banner__item--primary" @click="continueGame">
              <AppIcon name="play" />
              <span class="banner__text">
                {{ t('menu.continue') }}
                <small>{{ t('menu.continueHint', { name: lastProfile.name, level: Math.min(lastProfile.completed + 1, PLAYABLE_LEVELS) }) }}</small>
              </span>
            </button>
          </li>
          <li>
            <button type="button" :class="['banner__item', { 'banner__item--primary': !lastProfile }]" @click="playNow">
              <AppIcon name="target" />
              <span class="banner__text">{{ t('menu.play') }}</span>
            </button>
          </li>
          <li v-if="!IS_DEMO">
            <button type="button" class="banner__item" @click="daily">
              <AppIcon name="flame" />
              <span class="banner__text">
                {{ t('daily.title') }}
                <small>{{ dailyStreak ? t('daily.streak', { count: dailyStreak }) : t('daily.menuHint', { n: today.levelId, engine: t(`game.engines.${today.engine}`) }) }}</small>
              </span>
            </button>
          </li>
          <li v-if="!IS_DEMO">
            <button type="button" class="banner__item" @click="openCup">
              <AppIcon name="trophy" />
              <span class="banner__text">
                {{ t('cup.title') }}
                <small>{{ cupHint }}</small>
              </span>
            </button>
          </li>
          <li>
            <button type="button" class="banner__item" @click="open('modes')">
              <AppIcon name="users" />
              <span class="banner__text">
                {{ t('modes.title') }}
                <small>{{ t('modes.hint') }}</small>
              </span>
            </button>
          </li>
          <li>
            <button type="button" class="banner__item" @click="open('settings')">
              <AppIcon name="gear" />
              <span class="banner__text">{{ t('menu.settings') }}</span>
            </button>
          </li>
          <li>
            <button type="button" class="banner__item" @click="open('help')">
              <AppIcon name="help" />
              <span class="banner__text">{{ t('menu.help') }}</span>
            </button>
          </li>
        </ul>
      </nav>
    </div>

    <ModalPanel v-if="state.incomingChallenge" labelledby="incoming-title" class="incoming" @close="state.incomingChallenge = null">
      <h2 id="incoming-title" class="modal__title">{{ state.incomingChallenge.name ? t('daily.challengeFrom', { name: state.incomingChallenge.name }) : t('daily.challengeTitle') }}</h2>
      <p>{{ t('daily.incoming', { n: state.incomingChallenge.levelId, engine: t(`game.engines.${state.incomingChallenge.engine}`) }) }}</p>
      <div class="modal__actions">
        <button type="button" class="btn btn--primary btn--large" data-autofocus @click="acceptChallenge">{{ t('daily.accept') }}</button>
        <button type="button" class="btn btn--ghost" @click="state.incomingChallenge = null">{{ t('daily.later') }}</button>
      </div>
    </ModalPanel>
    <ModalPanel v-if="state.incomingCastle" labelledby="castle-title" class="incoming" @close="state.incomingCastle = null">
      <h2 id="castle-title" class="modal__title">{{ state.incomingCastle.name ? t('editor.incomingNamed', { name: state.incomingCastle.name }) : t('editor.incoming') }}</h2>
      <p>{{ t('editor.incomingText') }}</p>
      <div class="modal__actions">
        <button type="button" class="btn btn--primary btn--large" data-autofocus @click="app.startCustom(state.incomingCastle.code)">{{ t('editor.attack') }}</button>
        <button type="button" class="btn btn--ghost" @click="state.incomingCastle = null">{{ t('daily.later') }}</button>
      </div>
    </ModalPanel>
    <CupPanel v-if="cupOpen" @close="cupOpen = false" />
    <ModalPanel v-if="state.incomingCup" labelledby="incoming-cup-title" @close="state.incomingCup = null">
      <h2 id="incoming-cup-title" class="modal__title">{{ t('cup.title') }}</h2>
      <p>{{ state.incomingCup.current ? t('cup.incoming') : t('cup.incomingOver') }}</p>
      <div class="modal__actions">
        <button type="button" class="btn btn--primary btn--large" data-autofocus @click="acceptCup">{{ state.incomingCup.current ? t('cup.open') : t('cup.openThisWeek') }}</button>
        <button type="button" class="btn btn--ghost" @click="state.incomingCup = null">{{ t('daily.later') }}</button>
      </div>
    </ModalPanel>
    <p v-if="state.badChallenge" class="notice notice--warning home__notice" role="alert">{{ t('daily.badLink') }}</p>

    <footer class="home__footer">
      <LanguagePicker id="home-lang" />
      <button type="button" class="home__link" @click="app.go('privacy')">{{ t('privacy.link') }}</button>
      <span class="home__version">{{ t('app.version', { version: APP_VERSION }) }}</span>
    </footer>
  </main>
</template>
