<script setup>
import { computed, ref } from 'vue'
import { useApp } from '../../app/AppContext.js'
import AppIcon from '../ui/AppIcon.vue'

/**
 * Le plus beau tir de la partie (v6.0), filmé par ClipRecorder : un aperçu
 * qui tourne en boucle (immobile en mouvement réduit, avec ses commandes),
 * à enregistrer ou à partager. Rien n'est envoyé sans le geste du joueur.
 */
const props = defineProps({
  /** { url, blob, type, extension } */
  clip: { type: Object, required: true },
  /** Nom du fichier (sans extension). */
  name: { type: String, default: 'catapulte-mania' },
})
const app = useApp()
const { t } = app
const reduced = computed(() => app.reducedMotion())
const fileName = computed(() => `${props.name}.${props.clip.extension}`)
const shared = ref('idle')

/** Partage de fichier possible (téléphones surtout) ? */
const canShare = computed(() => {
  try {
    return Boolean(globalThis.navigator?.canShare?.({ files: [new File([props.clip.blob], fileName.value, { type: props.clip.type })] }))
  } catch {
    return false
  }
})

async function share() {
  try {
    await navigator.share({ files: [new File([props.clip.blob], fileName.value, { type: props.clip.type })], title: 'Catapulte Mania', text: t('clip.shareText') })
    shared.value = 'done'
  } catch {
    shared.value = 'idle'
  }
}
</script>

<template>
  <section class="clip" :aria-label="t('clip.title')">
    <p class="clip__title"><AppIcon name="play" :size="16" />{{ t('clip.title') }}</p>
    <video class="clip__video" :src="clip.url" muted playsinline loop :autoplay="!reduced" :controls="reduced" width="320" height="200" :aria-label="t('clip.title')" />
    <p class="clip__actions">
      <a class="btn btn--small" :href="clip.url" :download="fileName"><AppIcon name="arrow" :size="16" class="clip__save-icon" />{{ t('clip.save') }}</a>
      <button v-if="canShare" type="button" class="btn btn--small" @click="share"><AppIcon name="users" :size="16" />{{ shared === 'done' ? t('daily.shared') : t('clip.share') }}</button>
    </p>
  </section>
</template>
