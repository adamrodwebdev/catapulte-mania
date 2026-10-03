<script setup>
import { onMounted, ref, watch } from 'vue'
import { useApp } from '../../app/AppContext.js'

/**
 * Portrait pixel art d'un personnage, dessiné par le code dans un <canvas>
 * (aucune image téléchargée). Les données ne sont chargées qu'au premier
 * portrait affiché, pour ne pas alourdir l'écran d'accueil.
 */
const props = defineProps({
  /** ysolde | aubert | gontran | mordrac */
  id: { type: String, required: true },
  /** Hauteur affichée (CSS), la largeur suit les proportions. */
  height: { type: String, default: '8rem' },
  /** Regarde vers la gauche (miroir). */
  flip: { type: Boolean, default: false },
  /** Image décorative (le nom est déjà écrit à côté). */
  decorative: { type: Boolean, default: false },
})
const { t } = useApp()
const canvas = ref(null)

async function paint() {
  if (!canvas.value) return
  const { paintPortrait } = await import('../../game/story/Portraits.js')
  if (canvas.value) paintPortrait(canvas.value, props.id)
}
onMounted(paint)
watch(() => props.id, paint)
</script>

<template>
  <canvas
    ref="canvas"
    :class="['pixel-portrait', { 'pixel-portrait--flip': flip }]"
    :style="{ height }"
    :role="decorative ? undefined : 'img'"
    :aria-hidden="decorative ? 'true' : undefined"
    :aria-label="decorative ? undefined : t(`characters.${id}.name`)"
    width="1"
    height="1"
  />
</template>
