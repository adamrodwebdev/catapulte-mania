<script setup>
import { useApp } from '../../app/AppContext.js'
import ScreenHeader from '../ui/ScreenHeader.vue'

const app = useApp()
const { t } = app
const sections = ['goal', 'aim', 'aid', 'wind', 'materials', 'powers', 'score']
</script>

<template>
  <main class="screen help">
    <ScreenHeader :title="t('help.title')" @back="app.go(app.state.previous === 'help' ? 'home' : app.state.previous)" />
    <div class="help__grid">
      <section v-for="key in sections" :key="key" class="panel help__card" :aria-labelledby="`help-${key}`">
        <h2 :id="`help-${key}`" class="panel__title">{{ t(`help.${key}Title`) }}</h2>
        <template v-if="key === 'aim'">
          <p>{{ t('help.aimTouch') }}</p>
          <p>{{ t('help.aimKeys') }}</p>
        </template>
        <p v-else>{{ t(`help.${key}`) }}</p>
      </section>
    </div>
  </main>
</template>
