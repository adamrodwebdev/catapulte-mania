<script setup>
import { computed } from 'vue'
import { useApp } from '../../app/AppContext.js'

/**
 * Commandes du trébuchet (v3.7) : il se joue uniquement au clic.
 * v5.3 : la barre porte la cible choisie au sol (repère doré).
 * Le cadran montre en direct l'angle et la vitesse qu'aurait le tir si l'on
 * lâchait maintenant ; le texte rappelle le prochain geste.
 */
const props = defineProps({
  hud: { type: Object, required: true },
})
const { t } = useApp()

const armed = computed(() => props.hud.armed)
/** Repère d'impact (v5.1) : où tomberait le tir, et où est le château, sur une barre de 0 à 1. */
// v5.3 : en visée, la barre montre la cible (glisser sur le terrain pour la déplacer).
const landing = computed(() => props.hud.landing ?? null)
const onTarget = computed(() => Boolean(landing.value?.on))
const hasTarget = computed(() => typeof landing.value?.target === 'number')
const step = computed(() =>
  armed.value ? (onTarget.value ? 'now' : 'release') : props.hud.rewinding ? 'rewind' : props.hud.state === 'aiming' ? (hasTarget.value ? 'target' : 'arm') : 'wait',
)
/** Aiguille du cadran : 0° à droite (tir tendu), 90° en haut (tir vertical). */
const needle = computed(() => {
  const a = Math.max(-20, Math.min(110, props.hud.angle))
  const r = (a * Math.PI) / 180
  return { x: 50 + Math.cos(r) * 38, y: 50 - Math.sin(r) * 38 }
})
</script>

<template>
  <div class="treb-panel" role="group" :aria-label="t('game.engines.trebuchet')">
    <svg class="treb-panel__dial" viewBox="0 0 100 56" aria-hidden="true">
      <path d="M8 50a42 42 0 0 1 84 0" class="treb-panel__arc" />
      <path d="M50 50V8a42 42 0 0 1 42 42Z" class="treb-panel__sweet" />
      <line v-if="armed" x1="50" y1="50" :x2="needle.x" :y2="needle.y" class="treb-panel__needle" />
      <circle cx="50" cy="50" r="4" class="treb-panel__hub" />
    </svg>
    <div class="treb-panel__text">
      <p :class="['treb-panel__step', `treb-panel__step--${step}`]">{{ t(`game.treb.${step}`) }}</p>
      <!-- Barre de visée : la zone du château, et le point d'impact qui la traverse pendant le balancier. -->
      <div v-if="landing" class="treb-bar" aria-hidden="true">
        <span class="treb-bar__castle" :style="{ left: `${landing.castle[0] * 100}%`, width: `${Math.max(2, (landing.castle[1] - landing.castle[0]) * 100)}%` }" />
        <span v-if="hasTarget" class="treb-bar__target" :style="{ left: `${landing.target * 100}%` }" />
        <span v-if="typeof landing.at === 'number'" :class="['treb-bar__mark', { 'treb-bar__mark--on': onTarget }]" :style="{ left: `${landing.at * 100}%` }" />
      </div>
      <p class="treb-panel__values">
        <span>{{ t('game.treb.angle') }} <strong>{{ armed ? `${hud.angle}°` : '–' }}</strong></span>
        <span>{{ t('game.treb.speed') }} <strong>{{ armed ? `${hud.power} %` : '–' }}</strong></span>
      </p>
    </div>
  </div>
</template>
