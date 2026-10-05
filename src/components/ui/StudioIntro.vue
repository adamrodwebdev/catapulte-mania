<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useApp } from '../../app/AppContext.js'

/**
 * Générique du studio (v3.8, renommé en v4.0.1) : « Adamrodwebtech présente ».
 *
 * Une étincelle gravit un escalier de cinq marches (la progression, niveau
 * après niveau), éclate au sommet comme un passage de niveau, l'aube se lève
 * et le nom du studio apparaît. 2,6 s en tout, entièrement en CSS et SVG (aucune
 * image, aucune police supplémentaire : 0 requête réseau).
 *
 * - Passable d'un clic, d'un toucher ou d'une touche.
 * - Mouvement réduit : l'image finale s'affiche, fixe, puis s'efface.
 * - Une seule fois par session de navigation.
 */
const emit = defineEmits(['done'])
const { t, reducedMotion } = useApp()

const leaving = ref(false)
const still = reducedMotion()
const NAME = 'Adamrodwebtech'
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
    <div class="studio__dawn" aria-hidden="true" />
    <svg class="studio__mark" viewBox="0 0 200 120" aria-hidden="true">
      <line x1="30" y1="100.5" x2="170" y2="100.5" class="studio__ground" />
      <rect v-for="i in 5" :key="i" :x="16 + i * 24" :y="100 - (2 + i * 14)" width="24.6" :height="2 + i * 14" class="studio__step" :style="{ '--i': i }" />
      <circle cx="148" cy="24" r="4" class="studio__ring" />
      <g class="studio__spark">
        <circle r="4.2" class="studio__spark-core" />
      </g>
    </svg>
    <p class="studio__name" aria-hidden="true">
      <span v-for="(c, i) in NAME" :key="i" class="studio__letter" :style="{ '--i': i }">{{ c === ' ' ? ' ' : c }}</span>
    </p>
    <p class="studio__presents" aria-hidden="true">{{ t('studio.presents') }}</p>
  </div>
</template>
