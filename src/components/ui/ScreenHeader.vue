<script setup>
import { onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { useApp } from '../../app/AppContext.js'

defineProps({ title: { type: String, required: true } })
const emit = defineEmits(['back'])
const { t } = useApp()
const heading = ref(null)
// À chaque changement d'écran, le focus va au titre : les lecteurs d'écran l'annoncent.
onMounted(() => heading.value?.focus({ preventScroll: true }))
</script>

<template>
  <header class="screen-header">
    <button type="button" class="btn btn--icon" :aria-label="t('menu.back')" @click="emit('back')">
      <AppIcon name="back" />
    </button>
    <h1 ref="heading" class="screen-header__title" tabindex="-1">{{ title }}</h1>
    <div class="screen-header__extra"><slot /></div>
  </header>
</template>
