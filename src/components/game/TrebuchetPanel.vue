<script setup>
import { computed } from 'vue'
import { useApp } from '../../app/AppContext.js'

/**
 * Commandes du trébuchet (v5.4) : deux clics.
 *  1. toucher le point d'impact (un fanion s'y plante) ;
 *  2. figer la jauge entre tir en cloche et tir tendu.
 * Le cadran rappelle l'arc choisi, la barre situe la cible par rapport au
 * château ; la jauge elle-même est dessinée dans la scène (fluide, à chaque image).
 */
const props = defineProps({
  hud: { type: Object, required: true },
})
const { t } = useApp()

const bar = computed(() => props.hud.trebBar ?? null)
const step = computed(() => {
  const p = props.hud.trebPhase
  if (p === 'target') return 'target'
  if (p === 'power') return 'power'
  return props.hud.armed ? 'swing' : 'wait'
})
const hasAngle = computed(() => typeof props.hud.angle === 'number')
/** Aiguille du cadran : 0° à droite (tir tendu), 90° en haut (tir vertical). */
const needle = computed(() => {
  const a = Math.max(0, Math.min(90, props.hud.angle ?? 45))
  const r = (a * Math.PI) / 180
  return { x: 50 + Math.cos(r) * 38, y: 50 - Math.sin(r) * 38 }
})
</script>

<template>
  <div class="treb-panel" role="group" :aria-label="t('game.engines.trebuchet')">
    <svg class="treb-panel__dial" viewBox="0 0 100 56" aria-hidden="true">
      <path d="M8 50a42 42 0 0 1 84 0" class="treb-panel__arc" />
      <path d="M50 50V8a42 42 0 0 1 42 42Z" class="treb-panel__sweet" />
      <line v-if="hasAngle" x1="50" y1="50" :x2="needle.x" :y2="needle.y" class="treb-panel__needle" />
      <circle cx="50" cy="50" r="4" class="treb-panel__hub" />
    </svg>
    <div class="treb-panel__text">
      <p :class="['treb-panel__step', `treb-panel__step--${step}`]">{{ t(`game.treb.${step}`) }}</p>
      <!-- Barre : la zone du château et la cible choisie. -->
      <div v-if="bar" class="treb-bar" aria-hidden="true">
        <span class="treb-bar__castle" :style="{ left: `${bar.castle[0] * 100}%`, width: `${Math.max(2, (bar.castle[1] - bar.castle[0]) * 100)}%` }" />
        <span class="treb-bar__target" :style="{ left: `${bar.target * 100}%` }" />
      </div>
      <p class="treb-panel__values">
        <span>{{ t('game.treb.angle') }} <strong>{{ hasAngle ? `${hud.angle}°` : '–' }}</strong></span>
        <span>{{ t('game.treb.powerLabel') }} <strong>{{ typeof hud.power === 'number' ? `${hud.power} %` : '–' }}</strong></span>
      </p>
    </div>
  </div>
</template>
