<script setup>
import { computed } from 'vue'
import { useApp } from '../../app/AppContext.js'
import AppIcon from '../ui/AppIcon.vue'

const props = defineProps({
  hud: { type: Object, required: true },
  levelId: { type: Number, required: true },
  chapter: { type: Number, required: true },
})
const emit = defineEmits(['pause', 'powers'])
const { t, state } = useApp()

const windAbs = computed(() => Math.abs(props.hud.wind))
const windKmh = computed(() => Math.round(windAbs.value * 30))
const hasPowers = computed(() => props.hud.powers.some((p) => p.unlocked))
</script>

<template>
  <header class="hud-top">
    <button type="button" class="btn btn--icon hud-top__pause" :aria-label="t('game.pause')" @click="emit('pause')">
      <AppIcon name="pause" />
    </button>
    <div class="hud-top__level">
      <span class="hud-top__name">{{ t('game.level', { n: levelId }) }}</span>
      <span class="hud-top__chapter">{{ t(`levels.chapters.${chapter}`) }}</span>
    </div>

    <dl class="hud-stats">
      <div class="hud-stat">
        <dt>{{ t('game.score') }}</dt>
        <dd class="hud-stat__value hud-stat__value--score">{{ hud.score.toLocaleString(state.locale) }}</dd>
      </div>
      <div class="hud-stat">
        <dt>{{ t('game.targets') }}</dt>
        <dd class="hud-stat__value"><AppIcon name="crown" :size="16" />{{ hud.targetsLeft }}/{{ hud.targetsTotal }}</dd>
      </div>
      <div class="hud-stat">
        <dt>{{ t('game.shots') }}</dt>
        <dd class="hud-stat__value">
          <span class="shots" aria-hidden="true">
            <span v-for="i in hud.shotsTotal" :key="i" :class="['shots__dot', { 'shots__dot--used': i > hud.shotsLeft }]" />
          </span>
          <span class="shots__text">{{ hud.shotsLeft }}</span>
        </dd>
      </div>
      <div class="hud-stat hud-stat--wind">
        <dt>{{ t('game.wind') }}</dt>
        <dd class="hud-stat__value">
          <template v-if="windKmh === 0">{{ t('game.windCalm') }}</template>
          <template v-else>
            <AppIcon name="arrow" :size="18" :class="['wind-arrow', { 'wind-arrow--left': hud.wind < 0 }]" />
            {{ windKmh }} km/h
            <span class="visually-hidden">{{ hud.wind < 0 ? t('a11y.windLeft') : t('a11y.windRight') }}</span>
          </template>
        </dd>
      </div>
    </dl>

    <button v-if="hasPowers" type="button" class="btn hud-top__powers" @click="emit('powers')">
      <AppIcon name="flame" :size="20" />
      <span>{{ t('game.powersTitle') }}</span>
    </button>
  </header>
</template>
