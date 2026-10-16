<script setup>
import { computed, ref } from 'vue'
import { useApp } from '../../app/AppContext.js'
import AppIcon from './AppIcon.vue'
import ModalPanel from './ModalPanel.vue'
import StarRow from './StarRow.vue'

/**
 * Coupe de la semaine (v6.0) : les cinq châteaux, le meilleur de chacun, la
 * médaille de la semaine, les médailles gagnées ; partager sa coupe.
 */
const emit = defineEmits(['close'])
const app = useApp()
const { state, t } = app

const cup = computed(() => state.profile?.cup ?? null)
/** Premier château qui n'a pas encore ses trois étoiles (sinon le premier). */
const nextIndex = computed(() => cup.value?.castles.find((c) => c.stars < 3)?.index ?? 1)
const medalName = computed(() => (cup.value?.medal ? t(`cup.medals.${cup.value.medal}`) : t('cup.noMedal')))
const shareState = ref({ state: 'idle', url: '' })

function play(index) {
  app.services.audio.unlock()
  app.startCup(index)
}
async function share() {
  if (!cup.value) return
  shareState.value = { state: 'busy', url: '' }
  const r = await app.shareCup(t('cup.shareText', { medal: medalName.value, stars: cup.value.stars, max: cup.value.maxStars }))
  shareState.value = { state: r.method, url: r.url }
}
</script>

<template>
  <ModalPanel v-if="cup" labelledby="cup-title" @close="emit('close')">
    <p class="modal__eyebrow">{{ t('cup.weekOf', { week: cup.week.slice(6) }) }}</p>
    <h2 id="cup-title" class="modal__title">{{ t('cup.title') }}</h2>
    <p class="cup-line">
      <span :class="['cup-medal', cup.medal ? `cup-medal--${cup.medal}` : 'cup-medal--none']" aria-hidden="true"><AppIcon name="trophy" :size="22" /></span>
      {{ t('cup.progress', { stars: cup.stars, max: cup.maxStars }) }} · <strong>{{ medalName }}</strong>
    </p>
    <p class="cup-rules">{{ t('cup.rules', { bronze: cup.thresholds.bronze, silver: cup.thresholds.silver, gold: cup.thresholds.gold }) }}</p>
    <ol class="cup-castles">
      <li v-for="c in cup.castles" :key="c.index" class="cup-castle">
        <span class="cup-castle__n" aria-hidden="true">{{ c.index }}</span>
        <span class="cup-castle__body">
          <span class="cup-castle__name">{{ t('cup.castle', { n: c.index }) }} · {{ t('game.level', { n: c.levelId }) }}</span>
          <small>{{ c.best ? t('end.points', { score: c.best.toLocaleString(state.locale) }) : t('cup.notYet') }}</small>
        </span>
        <StarRow :count="c.stars" />
        <button type="button" class="btn btn--small" :aria-label="`${c.stars ? t('cup.replay') : t('cup.play')} · ${t('cup.castle', { n: c.index })}`" @click="play(c.index)">
          {{ c.stars ? t('cup.replay') : t('cup.play') }}
        </button>
      </li>
    </ol>
    <p class="cup-trophies">
      {{ t('cup.trophies') }}
      <span class="cup-medal cup-medal--gold" aria-hidden="true"><AppIcon name="trophy" :size="16" /></span>{{ cup.trophies.gold }}
      <span class="cup-medal cup-medal--silver" aria-hidden="true"><AppIcon name="trophy" :size="16" /></span>{{ cup.trophies.silver }}
      <span class="cup-medal cup-medal--bronze" aria-hidden="true"><AppIcon name="trophy" :size="16" /></span>{{ cup.trophies.bronze }}
      <span class="visually-hidden">{{ t('cup.trophiesA11y', { gold: cup.trophies.gold, silver: cup.trophies.silver, bronze: cup.trophies.bronze }) }}</span>
    </p>
    <div v-if="cup.medal" class="share">
      <button type="button" class="btn" :disabled="shareState.state === 'busy'" @click="share"><AppIcon name="users" />{{ t('cup.share') }}</button>
      <p v-if="shareState.state === 'copied'" class="share__done" role="status">{{ t('daily.copied') }}</p>
      <p v-else-if="shareState.state === 'shared'" class="share__done" role="status">{{ t('daily.shared') }}</p>
      <label v-else-if="shareState.state === 'manual'" class="share__manual">{{ t('daily.copyManual') }}<input class="input" type="text" readonly :value="shareState.url" @focus="$event.target.select()"></label>
    </div>
    <div class="modal__actions">
      <button type="button" class="btn btn--primary btn--large" data-autofocus @click="play(nextIndex)">{{ t('cup.playCastle', { n: nextIndex }) }}</button>
      <button type="button" class="btn btn--ghost" @click="emit('close')">{{ t('daily.later') }}</button>
    </div>
  </ModalPanel>
</template>
