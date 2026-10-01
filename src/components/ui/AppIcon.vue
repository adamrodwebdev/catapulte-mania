<script setup>
import { ICON_PATHS as PATHS } from './icons.js'
/**
 * Icônes SVG en ligne (aucune requête réseau, aucune police d'icônes).
 * Décoratives par défaut (aria-hidden) : le texte du bouton porte le sens.
 */
defineProps({
  name: { type: String, required: true, validator: (v) => Object.hasOwn(PATHS, v) },
  size: { type: [Number, String], default: 24 },
})
</script>

<template>
  <svg
    class="icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="PATHS[name]" fill="currentColor" />
  </svg>
</template>
