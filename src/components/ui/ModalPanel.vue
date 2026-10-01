<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'

/**
 * Fenêtre modale accessible : focus déplacé à l'ouverture, piégé avec Tab,
 * rendu à l'élément d'origine à la fermeture, Échap pour fermer.
 */
const props = defineProps({
  labelledby: { type: String, required: true },
  tone: { type: String, default: 'neutral' },
  closable: { type: Boolean, default: true },
})
const emit = defineEmits(['close'])
const root = ref(null)
let previous = null

const focusables = () =>
  [...root.value.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select, [tabindex]:not([tabindex="-1"])')]

function onKey(e) {
  if (e.key === 'Escape' && props.closable) {
    e.stopPropagation()
    emit('close')
  } else if (e.key === 'Tab') {
    const list = focusables()
    if (!list.length) return
    const first = list[0]
    const last = list[list.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
}

onMounted(() => {
  previous = document.activeElement
  const autofocus = root.value.querySelector('[data-autofocus]') || focusables()[0]
  autofocus?.focus({ preventScroll: true })
})
onBeforeUnmount(() => {
  if (previous && document.contains(previous)) previous.focus?.({ preventScroll: true })
})
</script>

<template>
  <div class="modal" @keydown="onKey">
    <div ref="root" :class="['modal__panel', `modal__panel--${tone}`]" role="dialog" aria-modal="true" :aria-labelledby="labelledby">
      <slot />
    </div>
  </div>
</template>
