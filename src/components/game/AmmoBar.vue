<script setup>
import { useApp } from '../../app/AppContext.js'

defineProps({
  ammo: { type: Array, required: true },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['select'])
const { t } = useApp()
</script>

<template>
  <div class="ammo" role="radiogroup" :aria-label="t('game.ammoTitle')">
    <button
      v-for="(a, i) in ammo"
      :key="a.type"
      type="button"
      role="radio"
      :aria-checked="a.selected ? 'true' : 'false'"
      :class="['ammo__item', `ammo__item--${a.type}`, { 'ammo__item--on': a.selected }]"
      :disabled="disabled || a.count === 0"
      :title="t(`game.ammoDesc.${a.type}`)"
      @click="emit('select', a.type)"
    >
      <span class="ammo__icon" aria-hidden="true" />
      <span class="ammo__name">{{ t(`game.ammo.${a.type}`) }}</span>
      <span class="ammo__count">
        <span class="visually-hidden">, </span>{{ a.count === null ? '∞' : `×${a.count}` }}
        <span class="visually-hidden">{{ a.count === null ? t('game.infinite') : '' }}</span>
      </span>
      <kbd class="ammo__key" aria-hidden="true">{{ i + 1 }}</kbd>
    </button>
  </div>
</template>
