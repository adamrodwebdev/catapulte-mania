<script setup>
import { useApp } from '../../app/AppContext.js'
import ScreenHeader from '../ui/ScreenHeader.vue'
import { LEGAL, APP_VERSION, IS_PORTAL } from '../../config/gameConfig.js'

/**
 * Confidentialité et mentions (v3.8) : ce que le jeu enregistre, où, et qui l'édite.
 * Le jeu n'a pas de serveur : rien n'est envoyé nulle part depuis notre site.
 */
const app = useApp()
const { t } = app
const sections = IS_PORTAL ? ['data', 'storage', 'portal', 'rights'] : ['data', 'storage', 'ads', 'rights']
</script>

<template>
  <main class="screen help privacy">
    <ScreenHeader :title="t('privacy.title')" @back="app.go(app.state.previous === 'privacy' ? 'home' : app.state.previous)" />
    <div class="help__grid">
      <section v-for="key in sections" :key="key" class="panel help__card" :aria-labelledby="`privacy-${key}`">
        <h2 :id="`privacy-${key}`" class="panel__title">{{ t(`privacy.${key}Title`) }}</h2>
        <p>{{ t(`privacy.${key}`) }}</p>
      </section>
      <section class="panel help__card" aria-labelledby="privacy-publisher">
        <h2 id="privacy-publisher" class="panel__title">{{ t('privacy.publisherTitle') }}</h2>
        <p>{{ t('privacy.publisher', { name: LEGAL.publisher, version: APP_VERSION }) }}</p>
        <p v-if="LEGAL.contact">{{ t('privacy.contact') }} <a :href="`mailto:${LEGAL.contact}`">{{ LEGAL.contact }}</a></p>
      </section>
    </div>
  </main>
</template>
