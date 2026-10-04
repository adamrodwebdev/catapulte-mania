<script setup>
import { computed } from 'vue'
import { useApp } from '../../app/AppContext.js'
import ScreenHeader from '../ui/ScreenHeader.vue'
import AppIcon from '../ui/AppIcon.vue'
import { ENDLESS } from '../../domain/EndlessRun.js'

/**
 * Autres modes (v4.0) : siège sans fin, atelier de châteaux (éditeur) et
 * modes à deux. Le siège sans fin demande un profil ayant fini le premier chapitre.
 */
const app = useApp()
const { state, t } = app
const endless = computed(() => state.profile?.endless ?? null)

function siege() {
  app.services.audio.unlock()
  app.startEndless()
}
</script>

<template>
  <main class="screen modes-screen">
    <ScreenHeader :title="t('modes.title')" @back="app.go('home')" />
    <div class="modes-grid">
      <section class="panel mode-card" aria-labelledby="mode-endless">
        <h2 id="mode-endless" class="panel__title"><AppIcon name="infinity" :size="22" />{{ t('endless.title') }}</h2>
        <p>{{ t('endless.desc') }}</p>
        <p v-if="endless && (endless.best || endless.bestWave)" class="mode-card__meta">{{ t('endless.record2', { count: endless.bestWave, score: endless.best.toLocaleString(state.locale) }) }}</p>
        <p v-if="state.profile && !endless?.unlocked" class="mode-card__meta"><AppIcon name="lock" :size="16" />{{ t('endless.locked', { count: ENDLESS.UNLOCK }) }}</p>
        <button type="button" class="btn btn--primary" :disabled="Boolean(state.profile) && !endless?.unlocked" @click="siege">
          {{ state.profile ? t('endless.start') : t('modes.chooseProfile') }}
        </button>
      </section>
      <section class="panel mode-card" aria-labelledby="mode-editor">
        <h2 id="mode-editor" class="panel__title"><AppIcon name="hammer" :size="22" />{{ t('editor.title') }}</h2>
        <p>{{ t('editor.desc') }}</p>
        <button type="button" class="btn btn--primary" @click="app.go('editor')">{{ t('editor.open') }}</button>
      </section>
      <section class="panel mode-card" aria-labelledby="mode-duo">
        <h2 id="mode-duo" class="panel__title"><AppIcon name="users" :size="22" />{{ t('menu.twoPlayers') }}</h2>
        <p>{{ t('modes.duoDesc') }}</p>
        <button type="button" class="btn btn--primary" @click="app.go('multiplayer')">{{ t('modes.duoOpen') }}</button>
      </section>
    </div>
  </main>
</template>
