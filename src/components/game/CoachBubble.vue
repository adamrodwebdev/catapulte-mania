<script setup>
import { computed } from 'vue'
import { useApp } from '../../app/AppContext.js'
import AppIcon from '../ui/AppIcon.vue'
import PixelPortrait from '../ui/PixelPortrait.vue'

/**
 * Bulle du tutoriel guidé : consigne de l'étape en cours, progression et
 * bouton « Passer ». Annoncée aux lecteurs d'écran (role="status").
 */
const props = defineProps({
  /** Outil présenté : 'aim', 'ammo:<type>' ou 'power:<id>'. */
  tool: { type: String, required: true },
  /** Étape en cours ({ id, anchor }). */
  step: { type: Object, required: true },
  progress: { type: Object, required: true },
})
const emit = defineEmits(['skip'])
const { t } = useApp()

const kind = computed(() => props.tool.split(':')[0])
const name = computed(() => props.tool.split(':')[1] || '')
/** Nom affiché de l'outil (munition ou pouvoir). */
const toolName = computed(() =>
  kind.value === 'ammo' ? t(`game.ammo.${name.value}`) : kind.value === 'power' ? t(`powers.${name.value}`) : kind.value === 'engine' ? t(`game.engines.${name.value}`) : '',
)
const title = computed(() => (kind.value === 'aim' ? t('tutorial.aimTitle') : t('tutorial.title', { name: toolName.value })))

/** Texte de l'étape : générique (choisir, ouvrir, activer) ou propre à l'outil. */
const text = computed(() => {
  const id = props.step.id
  if (kind.value === 'aim') return t(`tutorial.aim.${id}`)
  if (kind.value === 'engine') return t(`tutorial.engine.${id}`)
  if (id === 'select' || id === 'open' || id === 'use') return t(`tutorial.step.${id}`, { name: toolName.value })
  if (id === 'watch') return t('tutorial.step.watch')
  const key = props.tool.replace(':', '_')
  return t(`tutorial.${id === 'done' ? 'done' : 'tips'}.${key}`)
})
</script>

<template>
  <aside :class="['coach', { 'coach--center': kind === 'engine' }]" role="status" aria-live="polite" :aria-label="title">
    <PixelPortrait id="gontran" height="4.5rem" decorative class="coach__portrait" />
    <p class="coach__head">
      <AppIcon name="help" :size="18" />
      <span class="coach__title">{{ title }}</span>
      <span class="coach__progress">{{ progress.index }}/{{ progress.total }}</span>
    </p>
    <p class="coach__text">{{ text }}</p>
    <button type="button" class="coach__skip" @click="emit('skip')">{{ step.id === 'done' ? t('tutorial.close') : t('tutorial.skip') }}</button>
  </aside>
</template>
