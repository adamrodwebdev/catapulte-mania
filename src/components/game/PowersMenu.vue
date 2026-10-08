<script setup>
import { onMounted, ref } from 'vue'
import { useApp } from '../../app/AppContext.js'
import AppIcon from '../ui/AppIcon.vue'

defineProps({
  powers: { type: Array, required: true },
  /** Élément mis en valeur par le tutoriel (voir Tutorial.js). */
  coach: { type: String, default: '' },
  /** Portails : un pouvoir peut être offert contre une vidéo (une fois par niveau). */
  freeOffer: { type: Boolean, default: false },
  freeBusy: { type: Boolean, default: false },
})
const emit = defineEmits(['use', 'use-free', 'close'])
const { t } = useApp()
const ICONS = { falcon: 'eye', titan: 'fist', lodestone: 'magnet', meteor: 'meteor', firestorm: 'flame', lightning: 'bolt', quake: 'quake' }
const panel = ref(null)
onMounted(() => panel.value?.querySelector('button:not([disabled])')?.focus())
</script>

<template>
  <div ref="panel" class="powers-menu" role="dialog" aria-modal="false" aria-labelledby="powers-menu-title" @keydown.esc="emit('close')">
    <div class="powers-menu__head">
      <h2 id="powers-menu-title" class="powers-menu__title">{{ t('game.powersTitle') }}</h2>
      <button type="button" class="btn btn--icon" :aria-label="t('menu.close')" @click="emit('close')">
        <AppIcon name="close" :size="20" />
      </button>
    </div>
    <p class="powers-menu__rule">{{ t('powers.rule') }}</p>
    <ul class="powers-menu__list">
      <li v-for="p in powers" :key="p.id">
        <button
          type="button"
          :class="['power-btn', { 'power-btn--armed': p.armed, 'coach-focus': coach === `power:${p.id}` }]"
          :data-coach="`power:${p.id}`"
          :disabled="!p.available"
          @click="emit('use', p.id)"
        >
          <AppIcon :name="p.unlocked ? ICONS[p.id] : 'lock'" :size="22" />
          <span class="power-btn__text">
            <span class="power-btn__name">{{ t(`powers.${p.id}`) }}</span>
            <span class="power-btn__desc">
              {{ p.unlocked ? t(`powers.desc.${p.id}`) : t('game.unlocksAfter', { count: p.unlockAfter }) }}
            </span>
          </span>
          <span class="power-btn__cost">{{ p.armed ? t('game.armed') : t('game.cost', { cost: p.cost }) }}</span>
        </button>
        <button v-if="freeOffer && p.available" type="button" class="btn btn--reward btn--small power-free" :disabled="freeBusy" @click="emit('use-free', p.id)">
          <AppIcon name="play" :size="16" />{{ t('ads.freePower') }}
        </button>
      </li>
    </ul>
  </div>
</template>
