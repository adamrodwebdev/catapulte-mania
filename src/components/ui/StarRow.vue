<script setup>
import AppIcon from './AppIcon.vue'
import { useApp } from '../../app/AppContext.js'

defineProps({
  count: { type: Number, required: true, validator: (v) => Number.isInteger(v) && v >= 0 && v <= 3 },
  size: { type: Number, default: 16 },
})
const { t } = useApp()
</script>

<template>
  <span class="stars" role="img" :aria-label="t('a11y.stars', { count })">
    <AppIcon
      v-for="i in 3"
      :key="i"
      name="star"
      :size="size"
      :class="['stars__star', { 'stars__star--on': i <= count }]"
    />
  </span>
</template>
