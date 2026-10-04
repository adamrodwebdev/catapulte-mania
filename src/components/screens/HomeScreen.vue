<script setup>
import { computed, onMounted } from 'vue'
import { useApp } from '../../app/AppContext.js'
import AppIcon from '../ui/AppIcon.vue'
import LanguagePicker from '../ui/LanguagePicker.vue'
import SiegeLandscape from '../ui/SiegeLandscape.vue'
import ModalPanel from '../ui/ModalPanel.vue'
import { DailyChallenge, dayKey } from '../../game/daily/DailyChallenge.js'
import { eventFor } from '../../game/events/Season.js'
import { IS_DEMO, PLAYABLE_LEVELS, APP_VERSION } from '../../config/gameConfig.js'

const app = useApp()
const { state, t } = app

onMounted(() => app.refreshSlots())

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
function acceptChallenge() {
  app.services.audio.unlock()
  app.startChallenge()
}

function open(screen) {
  app.services.audio.unlock()
  app.go(screen)
}
</script>

<template>
  <main class="home">
    <SiegeLandscape class="home__scene" />
    <div class="home__content">
      <header class="home__heading">
        <h1 class="home__title">Catapulte&nbsp;Mania</h1>
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
            <button type="button" :class="['banner__item', { 'banner__item--primary': !lastProfile }]" @click="open('profiles')">
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
    <p v-if="state.badChallenge" class="notice notice--warning home__notice" role="alert">{{ t('daily.badLink') }}</p>

    <footer class="home__footer">
      <LanguagePicker id="home-lang" />
      <button type="button" class="home__link" @click="app.go('privacy')">{{ t('privacy.link') }}</button>
      <span class="home__version">{{ t('app.version', { version: APP_VERSION }) }}</span>
    </footer>
  </main>
</template>
