<script setup>
import { computed } from 'vue'
import { useApp } from '../../app/AppContext.js'

/**
 * Commandes du trébuchet (v3.7) : il se joue uniquement au clic.
 * Le cadran montre en direct l'angle et la vitesse qu'aurait le tir si l'on
 * lâchait maintenant ; le texte rappelle le prochain geste.
 */
const props = defineProps({
  hud: { type: Object, required: true },
})
const { t } = useApp()

const armed = computed(() => props.hud.armed)
const step = computed(() => (armed.value ? 'release' : props.hud.state === 'aiming' ? 'arm' : 'wait'))
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
      <p class="treb-panel__values">
        <span>{{ t('game.treb.angle') }} <strong>{{ armed ? `${hud.angle}°` : '–' }}</strong></span>
        <span>{{ t('game.treb.speed') }} <strong>{{ armed ? `${hud.power} %` : '–' }}</strong></span>
      </p>
    </div>
  </div>
</template>
