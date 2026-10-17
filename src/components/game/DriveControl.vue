<script setup>
import { onBeforeUnmount } from 'vue'
import { useApp } from '../../app/AppContext.js'
import AppIcon from '../ui/AppIcon.vue'

/**
 * Déplacement de l'engin (v6.2) : deux boutons à maintenir, reculer et avancer
 * (au clavier : A et D, Q et D en AZERTY). L'engin roule tant que le bouton est
 * tenu ; le bouton du côté où il bute s'estompe (un appui dit encore pourquoi).
 * Rien ne bouge pendant le vol d'un tir.
 *
 * Bouton indisponible : `aria-disabled` plutôt que `disabled`, pour qu'un doigt
 * levé pendant le vol d'un tir soit toujours entendu (un bouton désactivé ne
 * reçoit plus le relâcher : le sens restait tenu et avalait l'appui suivant).
 */
const props = defineProps({
  /** { dir, open, front, back } (voir GameSession#driveView). */
  drive: { type: Object, required: true },
  disabled: { type: Boolean, default: false },
  /** Élément mis en valeur par le tutoriel (voir Tutorial.js). */
  coach: { type: String, default: '' },
})
const emit = defineEmits(['drive'])
const { t } = useApp()

const SIDES = Object.freeze([
  { dir: -1, icon: 'back', label: 'game.drive.back', stop: 'back' },
  { dir: 1, icon: 'forward', label: 'game.drive.forward', stop: 'front' },
])
/** Sens tenu par ce contrôle (un seul à la fois). */
let held = 0

function press(dir, e) {
  if (props.disabled || held === dir) return
  e?.currentTarget?.setPointerCapture?.(e.pointerId)
  held = dir
  emit('drive', dir)
}
function release(dir) {
  if (held !== dir) return
  held = 0
  emit('drive', 0)
}
onBeforeUnmount(() => {
  if (held) emit('drive', 0)
})
</script>

<template>
  <div :class="['drive', { 'coach-focus': coach === 'drive' }]" role="group" :aria-label="t('game.drive.label')" data-coach="drive">
    <button
      v-for="s in SIDES"
      :key="s.dir"
      type="button"
      :class="['drive__btn', `drive__btn--${s.stop}`, { 'drive__btn--on': drive.dir === s.dir, 'drive__btn--end': drive[s.stop] }]"
      :aria-disabled="disabled ? 'true' : undefined"
      :aria-label="t(s.label)"
      :title="t(s.label)"
      @pointerdown.prevent="press(s.dir, $event)"
      @pointerup="release(s.dir)"
      @pointercancel="release(s.dir)"
      @lostpointercapture="release(s.dir)"
      @keydown.space.prevent="press(s.dir)"
      @keydown.enter.prevent="press(s.dir)"
      @keyup.space="release(s.dir)"
      @keyup.enter="release(s.dir)"
      @blur="release(s.dir)"
      @contextmenu.prevent
    >
      <AppIcon :name="s.icon" :size="20" />
      <AppIcon class="drive__wheel" name="wheel" :size="18" />
    </button>
  </div>
</template>
