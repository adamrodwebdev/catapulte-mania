<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useApp } from '../../app/AppContext.js'

/**
 * Générique du studio (v3.8 ; identité AdamRodWebDev en v5.4.1) :
 * « AdamRodWebDev présente ».
 *
 * Le logo du portfolio : un hexagone d'or sur fond noir, avec un « A ».
 * L'hexagone se trace, le « A » s'inscrit, un éclat d'or traverse le logo,
 * puis le nom apparaît — « AdamRod » en clair, « WebDev » en or, comme sur
 * le portfolio. 2,6 s en tout, entièrement en CSS et SVG (aucune image, aucune
 * police téléchargée : 0 requête réseau).
 *
 * - Passable d'un clic, d'un toucher ou d'une touche.
 * - Mouvement réduit : l'image finale s'affiche, fixe, puis s'efface.
 * - Une seule fois par session de navigation.
 */
const emit = defineEmits(['done'])
const { t, reducedMotion } = useApp()

const leaving = ref(false)
const still = reducedMotion()
/** Nom du studio : « AdamRod » en clair, « WebDev » en or. */
const NAME = [...'AdamRod'].map((c) => ({ c, gold: false })).concat([...'WebDev'].map((c) => ({ c, gold: true })))
let timer = null

function finish() {
  if (leaving.value) return
  leaving.value = true
  clearTimeout(timer)
  setTimeout(() => emit('done'), 350)
}
function onKey(e) {
  if (e.key !== 'Tab') finish()
}

onMounted(() => {
  timer = setTimeout(finish, still ? 1400 : 2600)
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  clearTimeout(timer)
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div :class="['studio', { 'studio--still': still, 'studio--leaving': leaving }]" role="img" :aria-label="t('studio.label')" @pointerdown="finish">
    <div class="studio__glow" aria-hidden="true" />
    <!-- Logo AdamRodWebDev (même tracé que sur le portfolio). -->
    <svg class="studio__mark" viewBox="0 0 48 48" aria-hidden="true">
      <path class="studio__hex" pathLength="100" d="M24 3 42 13.5v21L24 45 6 34.5v-21Z" />
      <path class="studio__a" pathLength="100" d="M15 33 24 13l9 20" />
      <path class="studio__bar" pathLength="100" d="M19 26h10" />
      <path class="studio__shine" pathLength="100" d="M24 3 42 13.5v21L24 45 6 34.5v-21Z" />
    </svg>
    <p class="studio__name" aria-hidden="true">
      <span v-for="(l, i) in NAME" :key="i" :class="['studio__letter', { 'studio__letter--gold': l.gold }]" :style="{ '--i': i }">{{ l.c }}</span>
    </p>
    <p class="studio__presents" aria-hidden="true">{{ t('studio.presents') }}</p>
  </div>
</template>
