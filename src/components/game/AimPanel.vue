<script setup>
import { useApp } from '../../app/AppContext.js'
import AppIcon from '../ui/AppIcon.vue'

defineProps({
  angle: { type: Number, required: true },
  power: { type: Number, required: true },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['aim', 'nudge'])
const { t } = useApp()

function onRange(kind, e) {
  const v = Number(e.target.value)
  if (!Number.isFinite(v)) return
  emit('aim', kind, v)
}
</script>

<template>
  <div class="aim-panel" role="group" :aria-label="`${t('game.angle')} / ${t('game.power')}`">
    <div class="aim-row">
      <label for="aim-angle" class="aim-row__label">{{ t('game.angle') }}</label>
      <button type="button" class="btn btn--step" :disabled="disabled" :aria-label="`${t('game.angle')} −1`" @click="emit('nudge', -1, 0)">
        <AppIcon name="minus" :size="18" />
      </button>
      <input id="aim-angle" class="range range--aim" type="range" min="5" max="80" step="1" :value="angle" :disabled="disabled" :aria-valuetext="`${angle}°`" @input="onRange('angle', $event)">
      <button type="button" class="btn btn--step" :disabled="disabled" :aria-label="`${t('game.angle')} +1`" @click="emit('nudge', 1, 0)">
        <AppIcon name="plus" :size="18" />
      </button>
      <output for="aim-angle" class="aim-row__value">{{ angle }}°</output>
    </div>
    <div class="aim-row">
      <label for="aim-power" class="aim-row__label">{{ t('game.power') }}</label>
      <button type="button" class="btn btn--step" :disabled="disabled" :aria-label="`${t('game.power')} −1`" @click="emit('nudge', 0, -0.01)">
        <AppIcon name="minus" :size="18" />
      </button>
      <input id="aim-power" class="range range--aim" type="range" min="0" max="100" step="1" :value="power" :disabled="disabled" :aria-valuetext="`${power} %`" @input="onRange('power', $event)">
      <button type="button" class="btn btn--step" :disabled="disabled" :aria-label="`${t('game.power')} +1`" @click="emit('nudge', 0, 0.01)">
        <AppIcon name="plus" :size="18" />
      </button>
      <output for="aim-power" class="aim-row__value">{{ power }} %</output>
    </div>
  </div>
</template>
