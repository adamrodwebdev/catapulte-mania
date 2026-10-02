<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useApp } from '../../app/AppContext.js'
import { GAME, IS_DEMO, PLAYABLE_LEVELS } from '../../config/gameConfig.js'
import AppIcon from '../ui/AppIcon.vue'
import StarRow from '../ui/StarRow.vue'
import ScreenHeader from '../ui/ScreenHeader.vue'

const app = useApp()
const { state, t } = app
const profile = computed(() => state.profile)
const chapters = [1, 2, 3, 4]
const POWER_ICONS = { calm: 'wind', titan: 'fist', greekfire: 'flame', volley: 'volley', powder: 'bomb', quake: 'quake' }

const chapter = ref(1)
/** Mode libre : seuls les niveaux déjà terminés sont jouables, sans limite. */
const freeMode = ref(state.match.mode === 'free')
const canFree = computed(() => (profile.value?.completed ?? 0) > 0)
const playable = (id) => (freeMode.value ? profile.value.levels[id].completed : profile.value.levels[id].unlocked)
onMounted(async () => {
  if (!profile.value) {
    app.go('profiles', { replace: true })
    return
  }
  chapter.value = Math.ceil(Math.min(profile.value.next, GAME.LEVEL_COUNT) / GAME.LEVELS_PER_CHAPTER)
})

const levelsOf = (c) => Array.from({ length: GAME.LEVELS_PER_CHAPTER }, (_, i) => (c - 1) * GAME.LEVELS_PER_CHAPTER + i + 1)

function tileLabel(id) {
  const lvl = profile.value.levels[id]
  const name = t('levels.level', { n: id })
  if (!lvl.unlocked) return `${name}, ${IS_DEMO && id > PLAYABLE_LEVELS ? t('levels.demoLocked') : t('levels.locked')}`
  const best = lvl.best ? `, ${t('levels.best', { score: lvl.best })}` : ''
  return `${name}, ${t('a11y.stars', { count: lvl.stars })}${best}`
}

function play(id) {
  if (!playable(id)) return
  app.services.audio.unlock()
  app.startMatch({ mode: freeMode.value ? 'free' : 'story', levelId: id })
}

/** Navigation entre onglets au clavier (← →), selon le modèle ARIA « tabs ». */
function onTabKey(e) {
  const i = chapters.indexOf(chapter.value)
  if (e.key === 'ArrowRight') chapter.value = chapters[(i + 1) % chapters.length]
  else if (e.key === 'ArrowLeft') chapter.value = chapters[(i + chapters.length - 1) % chapters.length]
  else return
  e.preventDefault()
  nextTick(() => document.getElementById(`tab-${chapter.value}`)?.focus())
}
</script>

<template>
  <main v-if="profile" class="screen levels" :data-chapter="chapter">
    <ScreenHeader :title="t('levels.title')" @back="app.go('profiles')">
      <div class="levels__summary">
        <span class="levels__profile">{{ profile.name }} · {{ t(`difficulty.${profile.difficulty}`) }}</span>
        <span class="levels__stat"><AppIcon name="star" :size="16" />{{ t('levels.totalStars', { count: profile.stars }) }}</span>
        <span class="levels__stat">{{ t('levels.totalScore', { score: profile.score }) }}</span>
      </div>
    </ScreenHeader>

    <div class="levels__toolbar">
      <div class="segmented" role="radiogroup" :aria-label="t('levels.free')">
        <label :class="['segmented__option', { 'segmented__option--on': !freeMode }]">
          <input v-model="freeMode" class="visually-hidden" type="radio" name="lvl-mode" :value="false">{{ t('levels.story') }}
        </label>
        <label :class="['segmented__option', { 'segmented__option--on': freeMode }]" :aria-disabled="!canFree ? 'true' : undefined">
          <input v-model="freeMode" class="visually-hidden" type="radio" name="lvl-mode" :value="true" :disabled="!canFree"><AppIcon name="infinity" :size="18" />{{ t('levels.free') }}
        </label>
      </div>
      <button type="button" class="btn" @click="app.go('workshop')">
        <AppIcon name="hammer" :size="20" />{{ t('menu.workshop') }}
        <span class="gold-badge gold-badge--small"><AppIcon name="coin" :size="16" />{{ profile.gold.toLocaleString(state.locale) }}</span>
      </button>
    </div>
    <p class="field__desc levels__mode-hint">{{ canFree ? (freeMode ? t('levels.freeHint') : '') : t('levels.freeLocked') }}</p>

    <div class="tabs" role="tablist" :aria-label="t('levels.title')" @keydown="onTabKey">
      <button
        v-for="c in chapters"
        :id="`tab-${c}`"
        :key="c"
        type="button"
        role="tab"
        class="tabs__tab"
        :aria-selected="chapter === c ? 'true' : 'false'"
        :aria-controls="`panel-${c}`"
        :tabindex="chapter === c ? 0 : -1"
        @click="chapter = c"
      >
        <span class="tabs__num">{{ t('levels.chapter', { n: c }) }}</span>
        <span class="tabs__name">{{ t(`levels.chapters.${c}`) }}</span>
      </button>
    </div>

    <section
      v-for="c in chapters"
      v-show="chapter === c"
      :id="`panel-${c}`"
      :key="c"
      class="chapter"
      role="tabpanel"
      :aria-labelledby="`tab-${c}`"
    >
      <p class="chapter__desc">{{ t(`levels.chapterDesc.${c}`) }}</p>
      <ol class="level-grid">
        <li v-for="id in levelsOf(c)" :key="id">
          <button
            type="button"
            :class="[
              'level-tile',
              {
                'level-tile--locked': !playable(id),
                'level-tile--done': profile.levels[id].completed,
                'level-tile--next': id === profile.next && profile.levels[id].unlocked,
              },
            ]"
            :aria-disabled="!playable(id) ? 'true' : undefined"
            :aria-label="tileLabel(id)"
            @click="play(id)"
          >
            <span class="level-tile__num">{{ id }}</span>
            <AppIcon v-if="!playable(id)" name="lock" :size="18" class="level-tile__lock" />
            <StarRow v-else :count="profile.levels[id].stars" :size="14" />
          </button>
        </li>
      </ol>
      <p v-if="IS_DEMO && c === 1" class="notice">{{ t('demo.full') }}</p>
    </section>

    <section class="powers-strip" aria-labelledby="powers-title">
      <h2 id="powers-title" class="powers-strip__title">{{ t('levels.powers') }}</h2>
      <p class="powers-strip__rule">{{ t('powers.rule') }}</p>
      <ul class="powers-strip__list">
        <li v-for="p in profile.powers" :key="p.id" :class="['power-chip', { 'power-chip--locked': !p.unlocked }]">
          <AppIcon :name="p.unlocked ? POWER_ICONS[p.id] : 'lock'" :size="20" />
          <span class="power-chip__name">{{ t(`powers.${p.id}`) }}</span>
          <span class="power-chip__meta">
            {{ p.unlocked ? t('game.cost', { cost: p.cost }) : t('game.unlocksAfter', { count: p.unlockAfter }) }}
          </span>
        </li>
      </ul>
    </section>
  </main>
</template>
