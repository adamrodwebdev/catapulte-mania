<script>
/** Coffre du jour : une proposition par session (pas à chaque retour sur la carte). */
let loginShown = false
</script>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useApp } from '../../app/AppContext.js'
import { GAME, IS_DEMO, PLAYABLE_LEVELS } from '../../config/gameConfig.js'
import AppIcon from '../ui/AppIcon.vue'
import StarRow from '../ui/StarRow.vue'
import ScreenHeader from '../ui/ScreenHeader.vue'
import StoryPanel from '../ui/StoryPanel.vue'
import { StoryRepository } from '../../game/story/StoryRepository.js'
import LoginReward from '../ui/LoginReward.vue'
import MasteryCrest from '../ui/MasteryCrest.vue'
import { Tracks } from '../../game/levels/Tracks.js'
import { MASTERY_TOTAL } from '../../game/progression/Mastery.js'
import { countAchievements } from '../../game/progression/Achievements.js'

const app = useApp()
const { state, t, n } = app
const profile = computed(() => state.profile)
const CAMPAIGN_CHAPTERS = Array.from({ length: GAME.LEVEL_COUNT / GAME.LEVELS_PER_CHAPTER }, (_, i) => i + 1)
/** Les Terres du Duc (v6.2) : un onglet de plus pour le Grand Ingénieur du Royaume (campagne seulement). */
const DUKE = 'duke'
const DUKE_TRACK = Tracks.get('duke')
const dukeLevels = Array.from({ length: DUKE_TRACK.count }, (_, i) => i + 1)
/** Vues de la carte : le parcours dont elles montrent les records, et le mode de la partie lancée. */
const VIEWS = Object.freeze({
  story: Object.freeze({ track: Tracks.get('campaign'), mode: 'story' }),
  free: Object.freeze({ track: Tracks.get('campaign'), mode: 'free' }),
  heroic: Object.freeze({ track: Tracks.get('heroic'), mode: 'heroic' }),
})

const chapter = ref(1)
/** La Chronique : épisodes déjà découverts, à relire (et la Légende, à la maîtrise). */
const chronicle = computed(() => (profile.value ? StoryRepository.unlocked(profile.value.completed, profile.value.mastered) : []))
const reading = ref(null)
/**
 * Vue de la carte : la campagne, le mode libre (niveaux terminés, sans limite) ou,
 * pour le Grand Ingénieur du Royaume, la Campagne héroïque (v6.2).
 */
const view = ref(state.match.mode === 'free' ? 'free' : state.match.mode === 'heroic' && state.profile?.mastered ? 'heroic' : 'story')
const freeMode = computed(() => view.value === 'free')
const heroicMode = computed(() => view.value === 'heroic')
const canFree = computed(() => (profile.value?.completed ?? 0) > 0)
const mastered = computed(() => Boolean(profile.value?.mastered))
const heroicStarted = computed(() => Boolean(profile.value?.heroic?.started))
const chapters = computed(() => (mastered.value && view.value === 'story' ? [...CAMPAIGN_CHAPTERS, DUKE] : CAMPAIGN_CHAPTERS))
/** Parcours de la vue en cours (campagne ou héroïque) et ses niveaux. */
const track = computed(() => VIEWS[view.value].track)
const trackLevels = computed(() => track.value.records(profile.value))
const playable = (id) => (freeMode.value ? profile.value.levels[id].completed : trackLevels.value[id].unlocked)
const nextId = computed(() => track.value.next(profile.value))
onMounted(async () => {
  if (!profile.value) {
    app.go('profiles', { replace: true })
    return
  }
  chapter.value = state.match.mode === 'duke' && mastered.value ? DUKE : Math.ceil(Math.min(nextId.value, GAME.LEVEL_COUNT) / GAME.LEVELS_PER_CHAPTER)
  // Coffre du jour : proposé une fois par session, s'il attend le joueur et
  // qu'il a déjà joué (un nouveau joueur va d'abord au premier niveau ; le
  // bouton « coffre disponible » reste visible).
  if (profile.value.login?.canClaim && profile.value.completed > 0 && !loginShown) {
    loginShown = true
    showLogin.value = true
  }
})

/** Coffre du jour (récompense de connexion). */
const showLogin = ref(false)
/** Amélioration à portée de bourse : on signale l'atelier. */
const upgradeHint = computed(() => profile.value?.affordable ?? null)

const levelsOf = (c) => Array.from({ length: GAME.LEVELS_PER_CHAPTER }, (_, i) => (c - 1) * GAME.LEVELS_PER_CHAPTER + i + 1)
/** Chaque onglet montre un parcours : les Terres du Duc, ou celui de la vue en cours. */
const chapterTrack = (c) => (c === DUKE ? DUKE_TRACK : track.value)
const chapterLevels = (c) => (c === DUKE ? dukeLevels : levelsOf(c))
/** Étoiles gagnées dans un chapitre (carte du chapitre, v6) ; médailles en héroïque. */
const chapterStars = (c) => chapterLevels(c).reduce((sum, id) => sum + (chapterTrack(c).record(profile.value, id)?.stars ?? 0), 0)
const chapterMax = (c) => chapterLevels(c).length * 3

function tileLabel(id) {
  if (heroicMode.value) {
    const h = profile.value.heroic.levels[id]
    const name = t('heroic.level', { n: id })
    if (!h.unlocked) return `${name}, ${t('levels.locked')}`
    return `${name}, ${t(`heroic.medal.${h.medal ?? 'none'}`)}${h.best ? `, ${t('levels.best', { score: h.best })}` : ''}`
  }
  const lvl = profile.value.levels[id]
  const name = t('levels.level', { n: id })
  if (!lvl.unlocked) return `${name}, ${IS_DEMO && id > PLAYABLE_LEVELS ? t('levels.demoLocked') : t('levels.locked')}`
  const best = lvl.best ? `, ${t('levels.best', { score: lvl.best })}` : ''
  const ach = lvl.completed ? `, ${t('levels.achCount', { count: countAchievements(lvl.ach) })}` : ''
  return `${name}, ${t('a11y.stars', { count: lvl.stars })}${ach}${best}`
}

function play(id) {
  if (!playable(id)) return
  app.services.audio.unlock()
  app.startMatch({ mode: VIEWS[view.value].mode, levelId: id })
}

/** Terres du Duc : un des cinq châteaux. */
function dukeLabel(id) {
  const d = profile.value.duke.levels[id]
  const name = t(`duke.names.${id}`)
  if (!d.unlocked) return `${name}, ${t('levels.locked')}`
  return `${name}, ${t(`heroic.medal.${d.medal ?? 'none'}`)}`
}
function playDuke(id) {
  if (!profile.value.duke.levels[id].unlocked) return
  app.services.audio.unlock()
  app.startMatch({ mode: 'duke', levelId: id })
}

/** Commence la Campagne héroïque (ses paliers d'atelier s'ouvrent du même coup). */
const starting = ref(false)
async function startHeroic() {
  if (starting.value) return
  starting.value = true
  if (await app.startHeroic()) {
    chapter.value = 1
    app.announce(t('heroic.title'))
  }
  starting.value = false
}
/** Changer de vue : le chapitre du prochain niveau ; les Terres du Duc restent à la campagne. */
function setView(next) {
  view.value = next
  lockTapped.value = false
  chapter.value = Math.ceil(Math.min(nextId.value, GAME.LEVEL_COUNT) / GAME.LEVELS_PER_CHAPTER)
}

/**
 * Campagne héroïque fermée (v6.2) : la raison est lue aux lecteurs d'écran
 * (description de l'option) et s'affiche au toucher, sous la barre — pas
 * seulement dans une infobulle, que le toucher ne montre pas.
 */
const lockTapped = ref(false)
/** Avis permanent « toutes les étoiles… » : la campagne finie, la maîtrise pas encore. */
const heroicHint = computed(() => !mastered.value && view.value === 'story' && profile.value.completed >= GAME.LEVEL_COUNT)
function onHeroicTap() {
  if (!mastered.value) lockTapped.value = true
}
const modeHint = computed(() => {
  if (lockTapped.value && !mastered.value && !heroicHint.value) return t('heroic.locked')
  return heroicMode.value ? '' : canFree.value ? (freeMode.value ? t('levels.freeHint') : '') : t('levels.freeLocked')
})

/** Navigation entre onglets au clavier (← →), selon le modèle ARIA « tabs ». */
function onTabKey(e) {
  const list = chapters.value
  const i = list.indexOf(chapter.value)
  if (e.key === 'ArrowRight') chapter.value = list[(i + 1) % list.length]
  else if (e.key === 'ArrowLeft') chapter.value = list[(i + list.length - 1) % list.length]
  else return
  e.preventDefault()
  nextTick(() => document.getElementById(`tab-${chapter.value}`)?.focus())
}
</script>

<template>
  <main v-if="profile" class="screen levels" :data-chapter="chapter">
    <ScreenHeader :title="t('levels.title')" @back="app.go('profiles')">
      <div class="levels__summary">
        <span class="levels__profile">
          <MasteryCrest v-if="mastered" :size="20" labelled />{{ profile.name }} · {{ t(`difficulty.${profile.difficulty}`) }}
        </span>
        <span v-if="mastered" class="levels__title">{{ t('mastery.title') }}</span>
        <span class="levels__stat"><AppIcon name="star" :size="16" />{{ t('levels.totalStars', { count: profile.stars, max: MASTERY_TOTAL }) }}</span>
        <span class="levels__stat"><AppIcon name="trophy" :size="16" />{{ t('levels.totalAch', { count: profile.achievements, max: MASTERY_TOTAL }) }}</span>
        <span class="levels__stat">{{ t('levels.totalScore', { score: profile.score }) }}</span>
      </div>
    </ScreenHeader>

    <div class="levels__toolbar">
      <div class="segmented" role="radiogroup" :aria-label="t('help.modesTitle')">
        <label :class="['segmented__option', { 'segmented__option--on': view === 'story' }]">
          <input :checked="view === 'story'" class="visually-hidden" type="radio" name="lvl-mode" value="story" @change="setView('story')">{{ t('levels.story') }}
        </label>
        <label :class="['segmented__option', { 'segmented__option--on': view === 'free' }]" :aria-disabled="!canFree ? 'true' : undefined">
          <input :checked="view === 'free'" class="visually-hidden" type="radio" name="lvl-mode" value="free" :disabled="!canFree" @change="setView('free')"><AppIcon name="infinity" :size="18" />{{ t('levels.free') }}
        </label>
        <!-- Campagne héroïque (v6.2) : visible de tous, ouverte par la maîtrise. -->
        <label :class="['segmented__option', 'segmented__option--heroic', { 'segmented__option--on': view === 'heroic' }]" :aria-disabled="!mastered ? 'true' : undefined" :title="mastered ? undefined : t('heroic.locked')" @click="onHeroicTap">
          <input :checked="view === 'heroic'" class="visually-hidden" type="radio" name="lvl-mode" value="heroic" :disabled="!mastered" :aria-describedby="mastered ? undefined : 'heroic-lock-reason'" @change="setView('heroic')"><AppIcon :name="mastered ? 'crown' : 'lock'" :size="18" />{{ t('heroic.tab') }}
        </label>
        <span v-if="!mastered" id="heroic-lock-reason" class="visually-hidden">{{ t('heroic.locked') }}</span>
      </div>
      <button type="button" class="btn" @click="app.go('workshop')">
        <AppIcon name="hammer" :size="20" />{{ t('menu.workshop') }}
        <span class="gold-badge gold-badge--small"><AppIcon name="coin" :size="16" />{{ n(profile.gold) }}</span>
      </button>
    </div>
    <p v-if="upgradeHint" class="notice levels__workshop">
      <AppIcon name="hammer" :size="20" />
      <span>{{ t('workshopPrompt.ready', { name: t(`workshop.names.${upgradeHint.id}`), cost: upgradeHint.cost }) }}</span>
      <button type="button" class="btn btn--small btn--primary" @click="app.go('workshop')">{{ t('workshopPrompt.go') }}</button>
    </p>
    <button v-if="profile.login?.canClaim && !showLogin" type="button" class="btn levels__chest" @click="showLogin = true">
      <AppIcon name="coin" :size="20" />{{ t('login.badge') }}
    </button>
    <LoginReward v-if="showLogin" @close="showLogin = false" />
    <p class="field__desc levels__mode-hint">{{ modeHint }}</p>

    <!-- Campagne héroïque (v6.2) : présentation, puis le bouton pour la commencer. -->
    <section v-if="heroicMode" class="heroic-panel" aria-labelledby="heroic-title">
      <MasteryCrest :size="44" />
      <div class="heroic-panel__body">
        <h2 id="heroic-title" class="heroic-panel__title">{{ t('heroic.title') }}</h2>
        <p>{{ t('heroic.intro') }}</p>
        <p v-if="heroicStarted" class="heroic-panel__medals">
          <span><span class="medal-dot medal-dot--gold" aria-hidden="true" />{{ profile.heroic.medals.gold }}</span>
          <span><span class="medal-dot medal-dot--silver" aria-hidden="true" />{{ profile.heroic.medals.silver }}</span>
          <span><span class="medal-dot medal-dot--bronze" aria-hidden="true" />{{ profile.heroic.medals.bronze }}</span>
          <span class="visually-hidden">{{ t('heroic.medals', profile.heroic.medals) }}</span>
        </p>
        <button v-else type="button" class="btn btn--primary btn--large" :disabled="starting" @click="startHeroic"><AppIcon name="crown" />{{ t('heroic.start') }}</button>
      </div>
    </section>
    <p v-else-if="heroicHint" class="notice levels__heroic-hint"><AppIcon name="lock" :size="18" />{{ t('heroic.locked') }}</p>

    <div v-show="!heroicMode || heroicStarted" class="tabs" role="tablist" :aria-label="t('levels.title')" @keydown="onTabKey">
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
        :class="{ 'tabs__tab--duke': c === DUKE }"
        @click="chapter = c"
      >
        <span class="tabs__num">{{ c === DUKE ? t('duke.num') : t('levels.chapter', { n: c }) }}</span>
        <span class="tabs__name">{{ c === DUKE ? t('duke.tab') : t(`levels.chapters.${c}`) }}</span>
        <!-- Avancement du chapitre (v6) : jauge et étoiles gagnées (médailles en héroïque). -->
        <span class="tabs__progress" aria-hidden="true">
          <span class="tabs__bar" :style="{ '--p': chapterStars(c) / chapterMax(c) }" />
          <span class="tabs__stars"><AppIcon name="star" :size="12" />{{ chapterStars(c) }}/{{ chapterMax(c) }}</span>
        </span>
      </button>
    </div>

    <section
      v-for="c in chapters"
      v-show="chapter === c && (!heroicMode || heroicStarted)"
      :id="`panel-${c}`"
      :key="c"
      :class="['chapter', { 'chapter--duke': c === DUKE }]"
      role="tabpanel"
      :aria-labelledby="`tab-${c}`"
    >
      <!-- Les Terres du Duc (v6.2) : cinq châteaux, des médailles. -->
      <template v-if="c === DUKE">
        <p class="chapter__desc">{{ t('duke.desc') }}</p>
        <ol class="level-grid level-grid--duke">
          <li v-for="id in dukeLevels" :key="id">
            <button
              type="button"
              :class="['level-tile', 'level-tile--duke', { 'level-tile--locked': !profile.duke.levels[id].unlocked, 'level-tile--done': profile.duke.levels[id].completed }]"
              :aria-disabled="!profile.duke.levels[id].unlocked ? 'true' : undefined"
              :aria-label="dukeLabel(id)"
              @click="playDuke(id)"
            >
              <span class="level-tile__num">{{ id }}</span>
              <span class="level-tile__name">{{ t(`duke.names.${id}`) }}</span>
              <AppIcon v-if="!profile.duke.levels[id].unlocked" name="lock" :size="18" class="level-tile__lock" />
              <span v-else-if="profile.duke.levels[id].medal" :class="['medal-dot', `medal-dot--${profile.duke.levels[id].medal}`]" aria-hidden="true" />
            </button>
          </li>
        </ol>
      </template>
      <template v-else>
      <p class="chapter__desc">{{ t(`levels.chapterDesc.${c}`) }}</p>
      <ol class="level-grid">
        <li v-for="id in levelsOf(c)" :key="id">
          <button
            type="button"
            :class="[
              'level-tile',
              {
                'level-tile--locked': !playable(id),
                'level-tile--done': trackLevels[id].completed,
                'level-tile--next': id === nextId && trackLevels[id].unlocked,
                'level-tile--heroic': heroicMode,
              },
            ]"
            :aria-disabled="!playable(id) ? 'true' : undefined"
            :aria-label="tileLabel(id)"
            @click="play(id)"
          >
            <span class="level-tile__num">{{ id }}</span>
            <AppIcon v-if="!playable(id)" name="lock" :size="18" class="level-tile__lock" />
            <template v-else-if="heroicMode">
              <span v-if="trackLevels[id].medal" :class="['medal-dot', `medal-dot--${trackLevels[id].medal}`]" aria-hidden="true" />
            </template>
            <StarRow v-else :count="profile.levels[id].stars" :size="14" />
            <span v-if="!heroicMode && profile.levels[id].completed" class="level-tile__ach" aria-hidden="true">
              <span v-for="b in [0, 1, 2]" :key="b" :class="['ach-pip', { 'ach-pip--on': profile.levels[id].ach & (1 << b) }]" />
            </span>
          </button>
        </li>
      </ol>
      <p v-if="IS_DEMO && c === 1" class="notice">{{ t('demo.full') }}</p>
      </template>
    </section>

    <section class="powers-strip" aria-labelledby="powers-title">
      <h2 id="powers-title" class="powers-strip__title">{{ t('levels.powers') }}</h2>
      <p class="powers-strip__rule">{{ t('powers.rule') }}</p>
      <ul class="powers-strip__list">
        <li v-for="p in profile.powers" :key="p.id" :class="['power-chip', { 'power-chip--locked': !p.unlocked }]">
          <AppIcon :name="p.unlocked ? p.icon : 'lock'" :size="20" />
          <span class="power-chip__name">{{ t(`powers.${p.id}`) }}</span>
          <span class="power-chip__meta">
            {{ p.unlocked ? t('game.cost', { cost: p.cost }) : t('game.unlocksAfter', { count: p.unlockAfter }) }}
          </span>
        </li>
      </ul>
    </section>

    <section v-if="chronicle.length" class="powers-strip" aria-labelledby="chronicle-title">
      <h2 id="chronicle-title" class="powers-strip__title">{{ t('story.chronicle') }}</h2>
      <p class="powers-strip__rule">{{ t('story.chronicleIntro') }}</p>
      <ul class="chronicle-list">
        <li v-for="b in chronicle" :key="b.id">
          <button type="button" class="btn" @click="reading = b"><AppIcon name="map" :size="18" />{{ t(`story.${b.id}.title`) }}</button>
        </li>
      </ul>
    </section>
    <StoryPanel v-if="reading" :key="reading.id" :beat="reading" @done="reading = null" />
  </main>
</template>
