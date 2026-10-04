<script setup>
import { computed, onMounted } from 'vue'
import { useApp } from '../../app/AppContext.js'
import AppIcon from '../ui/AppIcon.vue'
import LanguagePicker from '../ui/LanguagePicker.vue'
import SiegeLandscape from '../ui/SiegeLandscape.vue'
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
          <li>
            <button type="button" class="banner__item" @click="open('multiplayer')">
              <AppIcon name="users" />
              <span class="banner__text">{{ t('menu.twoPlayers') }}</span>
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

    <footer class="home__footer">
      <LanguagePicker id="home-lang" />
      <button type="button" class="home__link" @click="app.go('privacy')">{{ t('privacy.link') }}</button>
      <span class="home__version">{{ t('app.version', { version: APP_VERSION }) }}</span>
    </footer>
  </main>
</template>
