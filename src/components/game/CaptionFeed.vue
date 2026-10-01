<script setup>
import { useApp } from '../../app/AppContext.js'

/**
 * Sous-titres des sons (accessibilité malentendants).
 * Chaque son important apparaît avec sa direction (← gauche, → droite).
 * Région « log » : les lecteurs d'écran peuvent la consulter sans être interrompus.
 */
const { state, t } = useApp()
const ARROWS = { left: '◀', right: '▶', center: '●' }
</script>

<template>
  <ul v-if="state.settings.captions" class="captions" role="log" aria-live="off">
    <li v-for="c in state.captions" :key="c.id" :class="['captions__item', `captions__item--${c.side}`]">
      <span class="captions__dir" aria-hidden="true">{{ ARROWS[c.side] }}</span>
      <span>[{{ t(`captions.${c.key}`) }}]</span>
      <span class="visually-hidden">{{ t(`captions.${c.side}`) }}</span>
    </li>
  </ul>
</template>
