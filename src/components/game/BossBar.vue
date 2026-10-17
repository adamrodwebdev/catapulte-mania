<script setup>
import { computed } from 'vue'
import { useApp } from '../../app/AppContext.js'
import AppIcon from '../ui/AppIcon.vue'
import GeneralBust from './GeneralBust.vue'

/**
 * Barre du général (v6.0) : qui il est, ses vies, et l'ordre qu'il donnera
 * après votre tir (annoncé à l'avance : on peut le contrer). Avant son donjon,
 * on le présente déjà : il attend à la dernière étape.
 */
const props = defineProps({
  id: { type: String, required: true },
  /** Vue du conseil de guerre (hud.general), null tant qu'il n'est pas sur la scène. */
  view: { type: Object, default: null },
  stageCount: { type: Number, default: 1 },
  /** Il donne son ordre en ce moment (tour du général). */
  acting: { type: Boolean, default: false },
})
const { t } = useApp()

const waiting = computed(() => !props.view)
const name = computed(() => t(`characters.${props.id}.name`))
const intent = computed(() => props.view?.intent ?? null)
const lives = computed(() => props.view?.lives ?? 0)
</script>

<template>
  <section
    :class="['boss-bar', { 'boss-bar--waiting': waiting, 'boss-bar--acting': acting, 'boss-bar--guard': view?.guard }]"
    :aria-label="t('boss.label', { name })"
  >
    <GeneralBust :id="id" :size="44" class="boss-bar__bust" />
    <div class="boss-bar__body">
      <p class="boss-bar__name">{{ name }}</p>
      <p class="boss-bar__title">{{ t(`characters.${id}.role`) }}</p>
      <p v-if="waiting" class="boss-bar__line">{{ t('boss.awaitsShort', { stage: stageCount }) }}</p>
      <p v-else-if="intent" class="boss-bar__line boss-bar__intent">
        <AppIcon v-if="view.intentIcon" :name="view.intentIcon" :size="14" />
        <span class="boss-bar__label">{{ acting ? t('boss.ordering') : t('boss.next') }}</span>
        <strong>{{ t(`skills.${intent}.name`) }}</strong>
      </p>
    </div>
    <p v-if="!waiting" class="boss-bar__lives" role="img" :aria-label="t('boss.lives', { count: lives })">
      <AppIcon v-for="i in view.maxLives" :key="i" name="heart" :size="14" :class="['boss-bar__heart', { 'boss-bar__heart--lost': i > lives }]" />
    </p>
  </section>
</template>
