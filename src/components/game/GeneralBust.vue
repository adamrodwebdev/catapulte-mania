<script setup>
import { onMounted, ref, watch } from 'vue'
import { GENERAL_PAINTERS } from '../../game/assets/procedural/warlords.js'

/**
 * Buste d'un général (v6.0) : son dessin du jeu, cadré sur la tête et les
 * épaules. C'est la même figure que sur la scène : on le reconnaît d'un coup
 * d'œil, dans la barre du général comme dans les bannières.
 */
const props = defineProps({
  id: { type: String, required: true },
  /** Côté du cadre (px CSS). */
  size: { type: Number, default: 48 },
  /** Visage crispé (blessé, vaincu). */
  hurt: { type: Boolean, default: false },
})
const canvas = ref(null)
const paint = GENERAL_PAINTERS['target.general']

function draw() {
  const c = canvas.value
  if (!c) return
  const dpr = Math.min(3, globalThis.devicePixelRatio || 1)
  const px = Math.round(props.size * dpr)
  c.width = px
  c.height = px
  const g = c.getContext('2d')
  if (!g) return
  g.clearRect(0, 0, px, px)
  // Cadre de 34 unités du corps physique (34 × 62), centré sous le menton.
  const s = px / 34
  g.save()
  g.translate(px / 2 + 1.5 * s, px / 2 + 22 * s)
  g.scale(s, s)
  paint(g, { w: 34, h: 62, time: 0, seed: 1, extra: { general: props.id, still: true, hurt: props.hurt } })
  g.restore()
}

onMounted(draw)
watch(() => [props.id, props.size, props.hurt], draw)
</script>

<template>
  <canvas ref="canvas" class="general-bust" :style="{ width: `${size}px`, height: `${size}px` }" width="1" height="1" aria-hidden="true" />
</template>
