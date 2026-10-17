<script setup>
import { useId } from 'vue'
import { useApp } from '../../app/AppContext.js'

/**
 * Écusson d'or du Grand Ingénieur du Royaume (v6.2) : un écu doré, une
 * couronne, un chevron de maître d'œuvre. Décoratif par défaut ; avec
 * `labelled`, il porte son nom pour les lecteurs d'écran.
 * Couleurs : jetons `--crest-*` (tokens.css), contraste élevé compris.
 */
defineProps({
  size: { type: [Number, String], default: 32 },
  labelled: { type: Boolean, default: false },
})
const { t } = useApp()
/** Identifiants des dégradés, propres à chaque écusson de la page. */
const uid = `crest-${useId()}`
</script>

<template>
  <svg
    class="crest"
    :width="size"
    :height="size"
    viewBox="0 0 48 48"
    :role="labelled ? 'img' : undefined"
    :aria-label="labelled ? t('mastery.crest') : undefined"
    :aria-hidden="labelled ? undefined : 'true'"
    focusable="false"
  >
    <defs>
      <linearGradient :id="`${uid}-gold`" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" class="crest__stop crest__stop--gold-hi" />
        <stop offset="0.45" class="crest__stop crest__stop--gold" />
        <stop offset="1" class="crest__stop crest__stop--gold-lo" />
      </linearGradient>
      <linearGradient :id="`${uid}-field`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" class="crest__stop crest__stop--field-hi" />
        <stop offset="1" class="crest__stop crest__stop--field-lo" />
      </linearGradient>
    </defs>
    <!-- Couronne -->
    <path class="crest__edge" d="M13 12 16 4l4 5 4-7 4 7 4-5 3 8Z" :fill="`url(#${uid}-gold)`" stroke-width="1" stroke-linejoin="round" />
    <!-- Écu : bordure d'or, champ royal -->
    <path class="crest__edge" d="M8 13h32v12c0 10-7 16-16 21C15 41 8 35 8 25Z" :fill="`url(#${uid}-gold)`" stroke-width="1.2" stroke-linejoin="round" />
    <path d="M11.5 16h25v9c0 8-5.4 12.6-12.5 16.6C16.9 37.6 11.5 33 11.5 25Z" :fill="`url(#${uid}-field)`" />
    <!-- Chevron d'or et bras d'engin -->
    <path d="M13.5 31.5 24 22l10.5 9.5-2.4 2.6L24 27l-8.1 7.1Z" :fill="`url(#${uid}-gold)`" />
    <circle cx="24" cy="19" r="2.2" :fill="`url(#${uid}-gold)`" />
    <!-- Reflet -->
    <path class="crest__shine" d="M12 16.5h9l-9 9Z" opacity="0.14" />
  </svg>
</template>

<style scoped>
.crest {
  flex: none;
  filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.35)) drop-shadow(0 0 6px var(--crest-glow));
}
.crest__stop--gold-hi {
  stop-color: var(--crest-gold-hi);
}
.crest__stop--gold {
  stop-color: var(--crest-gold);
}
.crest__stop--gold-lo {
  stop-color: var(--crest-gold-lo);
}
.crest__stop--field-hi {
  stop-color: var(--crest-field-hi);
}
.crest__stop--field-lo {
  stop-color: var(--crest-field-lo);
}
.crest__edge {
  stroke: var(--crest-edge);
}
.crest__shine {
  fill: var(--crest-shine);
}
</style>
