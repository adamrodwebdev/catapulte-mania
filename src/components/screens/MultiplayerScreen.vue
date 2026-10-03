<script setup>
import { computed, onMounted, ref } from 'vue'
import { useApp } from '../../app/AppContext.js'
import { PROFILE_NAME } from '../../domain/SaveSlot.js'
import { ArenaRepository } from '../../game/levels/ArenaRepository.js'
import { DuelRepository } from '../../game/levels/DuelRepository.js'
import { HotSeatMatch } from '../../game/modes/HotSeatMatch.js'
import StarRow from '../ui/StarRow.vue'
import AppIcon from '../ui/AppIcon.vue'
import ScreenHeader from '../ui/ScreenHeader.vue'

/**
 * Préparation d'une partie à deux sur le même appareil :
 * formule (campagne à deux, duel, tournoi, face-à-face), noms, niveau ou arène.
 */
const app = useApp()
const { state, t } = app

const FORMATS = [
  { id: 'coop', icon: 'map' },
  { id: 'duel', icon: 'target' },
  { id: 'hotseat', icon: 'users' },
  { id: 'versus', icon: 'swords' },
]
const format = ref(state.match.mode && FORMATS.some((f) => f.id === state.match.mode) ? state.match.mode : 'coop')
const names = ref([state.match.players?.[0] || '', state.match.players?.[1] || ''])
const levelId = ref(1)
const arenaId = ref(state.match.arenaId || 1)
const arenas = ArenaRepository.all()
const duels = DuelRepository.all()
const duelId = ref(state.match.duelId || 1)

onMounted(() => app.refreshSlots())
const maxLevel = computed(() => app.multiplayerLevels())
const levels = computed(() => Array.from({ length: maxLevel.value }, (_, i) => i + 1))
/** Tournoi : trois niveaux consécutifs à partir du niveau choisi. */
const tourneyLevels = computed(() => HotSeatMatch.levelsFrom(levelId.value, maxLevel.value))
/** Campagne à deux : progression du profil actif. */
const coop = computed(() => state.profile?.coop ?? null)
const coopLevel = ref(state.profile?.coop?.next ?? 1)
/** Profils existants, à choisir sans quitter l'écran. */
const readySlots = computed(() => state.slots.filter((x) => x.status === 'ok'))
async function pickProfile(index) {
  await app.openProfile(index)
  coopLevel.value = state.profile?.coop?.next ?? 1
  coopChapter.value = Math.ceil(coopLevel.value / 10)
}
const coopChapter = ref(Math.ceil((state.profile?.coop?.next ?? 1) / 10))
const coopLevels = computed(() => Array.from({ length: 10 }, (_, i) => (coopChapter.value - 1) * 10 + i + 1).filter((id) => coop.value?.levels[id]))

const nameError = (i) => names.value[i].trim() !== '' && !PROFILE_NAME.test(names.value[i].trim())
const canStart = computed(() => !nameError(0) && !nameError(1) && (format.value !== 'coop' || (coop.value && coop.value.levels[coopLevel.value]?.unlocked)))

function start() {
  if (!canStart.value) return
  app.services.audio.unlock()
  const players = names.value.map((n, i) => n.trim() || t('mp.defaultName', { n: i + 1 }))
  const levelFor = format.value === 'coop' ? coopLevel.value : format.value === 'hotseat' ? tourneyLevels.value[0] : undefined
  app.startMatch({ mode: format.value, levelId: levelFor, levels: format.value === 'hotseat' ? tourneyLevels.value : undefined, arenaId: arenaId.value, duelId: duelId.value, players })
}
</script>

<template>
  <main class="screen multiplayer">
    <ScreenHeader :title="t('mp.title')" @back="app.go('home')" />
    <p class="screen__intro">{{ t('mp.intro') }}</p>

    <form class="mp" @submit.prevent="start">
      <fieldset class="panel">
        <legend class="panel__title">{{ t('mp.format') }}</legend>
        <div class="format-grid">
          <label v-for="f in FORMATS" :key="f.id" :class="['format', { 'format--on': format === f.id }]">
            <input v-model="format" class="visually-hidden" type="radio" name="mp-format" :value="f.id">
            <AppIcon :name="f.icon" :size="30" class="format__icon" />
            <span class="format__name">{{ t(`mp.formats.${f.id}.name`) }}</span>
            <span class="format__desc">{{ t(`mp.formats.${f.id}.desc`) }}</span>
          </label>
        </div>
      </fieldset>

      <fieldset class="panel">
        <legend class="panel__title">{{ t('mp.players') }}</legend>
        <div class="mp__names">
          <div v-for="i in [0, 1]" :key="i" :class="['field', `field--p${i + 1}`]">
            <label :for="`mp-name-${i}`" class="field__label"><span :class="['player-dot', `player-dot--${i + 1}`]" aria-hidden="true" />{{ t('mp.playerName', { n: i + 1 }) }}</label>
            <input
              :id="`mp-name-${i}`"
              v-model="names[i]"
              class="input"
              type="text"
              maxlength="16"
              autocomplete="off"
              :placeholder="t('mp.defaultName', { n: i + 1 })"
              :aria-invalid="nameError(i) ? 'true' : 'false'"
              :aria-describedby="nameError(i) ? `mp-name-err-${i}` : undefined"
            >
            <p v-if="nameError(i)" :id="`mp-name-err-${i}`" class="field__desc field__desc--error">{{ t('mp.nameError') }}</p>
          </div>
        </div>
      </fieldset>

      <fieldset v-if="format === 'coop'" class="panel">
        <legend class="panel__title">{{ t('mp.level') }}</legend>
        <template v-if="coop">
          <p class="field__desc">{{ t('mp.coopProfile') }} <strong>{{ state.profile.name }}</strong> · {{ t('mp.coopProgress', { done: coop.completed, stars: coop.stars }) }}</p>
          <div class="coop-chapters" role="group" :aria-label="t('mp.chaptersLabel')">
            <button
              v-for="c in 10"
              :key="c"
              type="button"
              :class="['btn', 'btn--chip', { 'btn--chip-on': coopChapter === c }]"
              :disabled="!coop.levels[(c - 1) * 10 + 1]?.unlocked"
              :aria-pressed="coopChapter === c ? 'true' : 'false'"
              @click="coopChapter = c"
            >{{ t('mp.chapterShort', { n: c }) }}</button>
          </div>
          <div class="level-pick" role="radiogroup" :aria-label="t('mp.level')">
            <label v-for="id in coopLevels" :key="id" :class="['level-pick__item', { 'level-pick__item--on': coopLevel === id, 'level-pick__item--locked': !coop.levels[id].unlocked }]">
              <input v-model="coopLevel" class="visually-hidden" type="radio" name="mp-coop" :value="id" :disabled="!coop.levels[id].unlocked">
              <span>{{ id }}</span>
              <StarRow v-if="coop.levels[id].completed" :count="coop.levels[id].stars" :size="10" />
              <AppIcon v-else-if="!coop.levels[id].unlocked" name="lock" :size="12" />
            </label>
          </div>
        </template>
        <template v-else>
          <p class="notice">{{ t('mp.coopNoProfile') }}</p>
          <div class="coop-profiles">
            <button v-for="slot in readySlots" :key="slot.index" type="button" class="btn" @click="pickProfile(slot.index)">
              <AppIcon name="users" />{{ slot.name }}
            </button>
            <button type="button" class="btn btn--ghost" @click="app.go('profiles')">{{ t('mp.coopChoose') }}</button>
          </div>
        </template>
      </fieldset>

      <fieldset v-else-if="format === 'duel'" class="panel">
        <legend class="panel__title">{{ t('mp.castle') }}</legend>
        <div class="arena-grid">
          <label v-for="d in duels" :key="d.id" :class="['arena', `arena--theme${d.chapter}`, { 'arena--on': duelId === d.id }]">
            <input v-model="duelId" class="visually-hidden" type="radio" name="mp-duel" :value="d.id">
            <span class="arena__num">{{ d.id }}</span>
            <span class="arena__name">{{ t(`mp.duels.${d.id}`) }}</span>
            <span class="arena__meta">{{ t('mp.castleMeta', { targets: d.targets.length, shots: d.shots }) }}</span>
          </label>
        </div>
      </fieldset>

      <fieldset v-else-if="format === 'hotseat'" class="panel">
        <legend class="panel__title">{{ t('mp.level') }}</legend>
        <p class="field__desc">{{ t('mp.levelsHint') }}</p>
        <p class="field__desc"><strong>{{ t('mp.tourneyLevels', { a: tourneyLevels[0], b: tourneyLevels[1], c: tourneyLevels[2] }) }}</strong></p>
        <div class="level-pick" role="radiogroup" :aria-label="t('mp.level')">
          <label v-for="id in levels" :key="id" :class="['level-pick__item', { 'level-pick__item--on': levelId === id }]">
            <input v-model="levelId" class="visually-hidden" type="radio" name="mp-level" :value="id">
            <span>{{ id }}</span>
          </label>
        </div>
      </fieldset>

      <fieldset v-else class="panel">
        <legend class="panel__title">{{ t('mp.arena') }}</legend>
        <div class="arena-grid">
          <label v-for="a in arenas" :key="a.id" :class="['arena', `arena--theme${a.chapter}`, { 'arena--on': arenaId === a.id }]">
            <input v-model="arenaId" class="visually-hidden" type="radio" name="mp-arena" :value="a.id">
            <span class="arena__num">{{ a.id }}</span>
            <span class="arena__name">{{ t(`mp.arenas.${a.id}`) }}</span>
          </label>
        </div>
      </fieldset>

      <button type="submit" class="btn btn--primary btn--large mp__start" :disabled="!canStart">
        <AppIcon name="play" />{{ t('mp.start') }}
      </button>
    </form>
  </main>
</template>
