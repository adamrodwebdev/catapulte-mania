<script setup>
import { computed } from 'vue'
import { useApp } from '../../app/AppContext.js'
import AppIcon from '../ui/AppIcon.vue'
import GeneralBust from './GeneralBust.vue'

/**
 * Bannière d'un grand siège (v6.0), sous le bandeau du haut, quelques
 * secondes : étape prise, entrée en scène du général, ordre qu'il donne, vie
 * qu'il perd, chute. Décorative pour les lecteurs d'écran : chaque événement
 * est déjà annoncé (voir les clés a11y.*).
 *
 * item : { kind: 'cleared' | 'intro' | 'order' | 'hurt' | 'fallen', id?, skill?, icon?, lives?, stage?, total? }
 */
const props = defineProps({
  item: { type: Object, required: true },
})
const { t } = useApp()

const name = computed(() => (props.item.id ? t(`characters.${props.item.id}.name`) : ''))
const big = computed(() => props.item.kind === 'intro' || props.item.kind === 'fallen')
const lines = computed(() => {
  const { kind, id, skill, lives, stage, total } = props.item
  switch (kind) {
    case 'cleared':
      return { kicker: t('boss.stageCleared', { stage, total }), title: id ? t('boss.awaits', { name: name.value }) : t('boss.nextStage'), quote: '' }
    case 'intro':
      return { kicker: t(`characters.${id}.role`), title: name.value, quote: t(`generals.${id}.motto`) }
    case 'order':
      return { kicker: t('boss.orders', { name: name.value }), title: t(`skills.${skill}.name`), quote: t(`skills.${skill}.desc`) }
    case 'hurt':
      return { kicker: t('boss.wounded', { name: name.value }), title: t('boss.livesLeft', { count: lives }), quote: '' }
    default:
      return { kicker: t('boss.fallen', { name: name.value }), title: name.value, quote: t(`generals.${id}.defeat`) }
  }
})
</script>

<template>
  <div :class="['boss-banner', `boss-banner--${item.kind}`, { 'boss-banner--big': big }]" aria-hidden="true">
    <GeneralBust v-if="item.id" :id="item.id" :size="big ? 64 : 44" :hurt="item.kind === 'hurt' || item.kind === 'fallen'" class="boss-banner__bust" />
    <AppIcon v-else name="crown" :size="28" class="boss-banner__icon" />
    <div class="boss-banner__text">
      <p class="boss-banner__kicker">{{ lines.kicker }}</p>
      <p class="boss-banner__title">
        <AppIcon v-if="item.kind === 'order' && item.icon" :name="item.icon" :size="20" />
        {{ lines.title }}
      </p>
      <p v-if="lines.quote" class="boss-banner__quote">{{ item.kind === 'order' ? lines.quote : t('boss.quote', { text: lines.quote }) }}</p>
    </div>
  </div>
</template>
