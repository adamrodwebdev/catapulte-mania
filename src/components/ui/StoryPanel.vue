<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useApp } from '../../app/AppContext.js'
import AppIcon from './AppIcon.vue'

/**
 * Un épisode de la Chronique, page par page : illustration (ou tableau peint
 * aux couleurs du chapitre en attendant les images), texte, page suivante.
 * Clavier : Entrée / Espace / → page suivante, ← page précédente, Échap passe.
 * Le texte est un vrai texte HTML, lu par les lecteurs d'écran.
 */
const props = defineProps({
  /** Épisode (StoryRepository). */
  beat: { type: Object, required: true },
})
const emit = defineEmits(['done'])
const { t } = useApp()

const index = ref(0)
const next = ref(null)
const root = ref(null)
let previous = null
const page = computed(() => props.beat.pages[index.value])
const last = computed(() => index.value === props.beat.pages.length - 1)
const titleId = `story-title-${props.beat.id}`
/** Les illustrations sont servies depuis le dossier public du site (chemin relatif). */
const imageUrl = computed(() => page.value.image)

function forward() {
  if (last.value) emit('done')
  else index.value++
}
function back() {
  if (index.value > 0) index.value--
}
function onKey(e) {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('done')
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    forward()
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    back()
  } else if (e.key === 'Tab') {
    // Focus piégé dans le livre.
    const list = [...root.value.querySelectorAll('button:not([disabled])')]
    const i = list.indexOf(document.activeElement)
    if (e.shiftKey && i <= 0) {
      e.preventDefault()
      list[list.length - 1]?.focus()
    } else if (!e.shiftKey && i === list.length - 1) {
      e.preventDefault()
      list[0]?.focus()
    }
  }
}
watch(index, async () => {
  await nextTick()
  next.value?.focus({ preventScroll: true })
})
onMounted(() => {
  previous = document.activeElement
  next.value?.focus({ preventScroll: true })
})
onBeforeUnmount(() => {
  if (previous && document.contains(previous)) previous.focus?.({ preventScroll: true })
})
</script>

<template>
  <div ref="root" class="story" role="dialog" aria-modal="true" :aria-labelledby="titleId" @keydown="onKey">
    <div :class="['story__art', `story__art--theme${beat.chapter}`]">
      <img v-if="imageUrl" :key="imageUrl" class="story__img" :src="imageUrl" alt="" width="1280" height="720" decoding="async">
      <svg v-else class="story__scene" viewBox="0 0 320 120" aria-hidden="true" preserveAspectRatio="xMidYMax slice">
        <path d="M0 120V92l30-10 40 8 50-16 60 12 50-14 50 10 40-6v44Z" class="story__hill" />
        <g class="story__castle">
          <path d="M192 120V78h6v-5h6v5h6v-5h6v5h6v-5h6v5h6v-5h6v5h6v-5h6v5h6v-5h6v5h6v-5h6v5h6v42Z" />
          <path d="M184 120V58h4v-5h5v5h4v-5h5v5h4v-5h4v67ZM274 120V58h4v-5h4v5h5v-5h4v5h5v-5h4v67Z" />
          <path d="M226 78V44h28v34ZM222 45l18-22 18 22Z" />
          <path d="M240 23v-9l9 3-9 3" />
          <path d="M235 120v-14a5 5 0 0 1 10 0v14Z" class="story__gate" />
        </g>
        <path d="M36 120v-6h34v6ZM44 114l14-22 3 2-11 20ZM57 92l-18-6 1-3 19 7Z" class="story__engine" />
      </svg>
      <p class="story__chapter">{{ t('levels.chapter', { n: beat.chapter }) }} · {{ t(`levels.chapters.${beat.chapter}`) }}</p>
    </div>
    <div class="story__book">
      <h2 :id="titleId" class="story__title">{{ t(`story.${beat.id}.title`) }}</h2>
      <p :key="index" class="story__text" aria-live="polite">{{ t(`story.${beat.id}.p${index + 1}`) }}</p>
      <div class="story__nav">
        <span class="story__dots" aria-hidden="true">
          <span v-for="(p, i) in beat.pages" :key="i" :class="['story__dot', { 'story__dot--on': i === index }]" />
        </span>
        <span class="visually-hidden">{{ t('story.page', { n: index + 1, total: beat.pages.length }) }}</span>
        <button type="button" class="btn btn--ghost" @click="emit('done')">{{ t('story.skip') }}</button>
        <button v-if="index > 0" type="button" class="btn btn--icon" :aria-label="t('story.previous')" @click="back"><AppIcon name="back" :size="20" /></button>
        <button ref="next" type="button" class="btn btn--primary" @click="forward">
          {{ last ? t('story.close') : t('story.next') }}<AppIcon v-if="!last" name="arrow" :size="18" />
        </button>
      </div>
    </div>
  </div>
</template>
