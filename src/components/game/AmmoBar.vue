<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useApp } from '../../app/AppContext.js'

const props = defineProps({
  ammo: { type: Array, required: true },
  disabled: { type: Boolean, default: false },
  /** Élément mis en valeur par le tutoriel (voir Tutorial.js). */
  coach: { type: String, default: '' },
})
const emit = defineEmits(['select'])
const { t } = useApp()

/*
 * Neuf munitions (v6.1) : sur téléphone, la barre défile (en ligne en portrait,
 * en colonne en paysage). Un fondu signale ce qui est caché de chaque côté, et
 * la munition choisie ou montrée par le tutoriel est ramenée en vue.
 */
const bar = ref(null)
const more = ref({ start: false, end: false, column: false })
const barClass = computed(() => ({ 'ammo--more-start': more.value.start, 'ammo--more-end': more.value.end, 'ammo--column': more.value.column }))
/** Marge laissée autour d'une munition ramenée en vue : la largeur du fondu. */
const REVEAL_PAD = 28

function measure() {
  const el = bar.value
  if (!el) return
  const column = el.scrollHeight > el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1
  const pos = column ? el.scrollTop : el.scrollLeft
  const max = column ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth
  const next = { start: pos > 1, end: pos < max - 1, column }
  if (next.start !== more.value.start || next.end !== more.value.end || next.column !== more.value.column) more.value = next
}

/** Fait défiler la barre (et elle seule) jusqu'à la munition. */
function reveal(type) {
  const el = bar.value
  const item = el && [...el.children].find((c) => c.dataset.coach === `ammo:${type}`)
  if (!item) return
  const box = el.getBoundingClientRect()
  const r = item.getBoundingClientRect()
  if (r.top < box.top) el.scrollTop -= box.top - r.top + REVEAL_PAD
  else if (r.bottom > box.bottom) el.scrollTop += r.bottom - box.bottom + REVEAL_PAD
  if (r.left < box.left) el.scrollLeft -= box.left - r.left + REVEAL_PAD
  else if (r.right > box.right) el.scrollLeft += r.right - box.right + REVEAL_PAD
  measure()
}

const selected = computed(() => props.ammo.find((a) => a.selected)?.type ?? null)
watch(selected, (type) => type && nextTick(() => reveal(type)))
watch(
  () => props.coach,
  (c) => c?.startsWith('ammo:') && nextTick(() => reveal(c.slice(5))),
  { immediate: true },
)
watch(() => props.ammo.length, () => nextTick(measure))

let observer = null
onMounted(() => {
  measure()
  if (typeof ResizeObserver === 'function') {
    observer = new ResizeObserver(measure)
    observer.observe(bar.value)
  }
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div ref="bar" :class="['ammo', barClass]" role="radiogroup" :aria-label="t('game.ammoTitle')" @scroll.passive="measure">
    <button
      v-for="(a, i) in ammo"
      :key="a.type"
      type="button"
      role="radio"
      :aria-checked="a.selected ? 'true' : 'false'"
      :class="['ammo__item', `ammo__item--${a.type}`, { 'ammo__item--on': a.selected, 'coach-focus': coach === `ammo:${a.type}` }]"
      :data-coach="`ammo:${a.type}`"
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
