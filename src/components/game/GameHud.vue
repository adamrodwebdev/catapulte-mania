<script setup>
import { computed } from 'vue'
import { useApp } from '../../app/AppContext.js'
import AppIcon from '../ui/AppIcon.vue'

/**
 * Bandeau supérieur : pause, titre, statistiques.
 * En solo : score, cibles, tirs, vent. À deux : le score (ou les défenseurs en
 * face-à-face) de chaque joueur, celui dont c'est le tour mis en évidence.
 */
const props = defineProps({
  hud: { type: Object, required: true },
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  /** Élément mis en valeur par le tutoriel (voir Tutorial.js). */
  coach: { type: String, default: '' },
})
const emit = defineEmits(['pause', 'powers'])
const { t, state } = useApp()

/** Vent ressenti à la catapulte (rafale comprise en Difficile), en km/h réels. */
const windNow = computed(() => props.hud.windNow ?? props.hud.wind)
const windKmh = computed(() => props.hud.windKmh ?? Math.round(Math.abs(windNow.value) * 30))
/** Rafale en cours (Difficile) : affichée au-delà d'un seuil. */
const gusting = computed(() => props.hud.windDynamic && props.hud.gust > 0.35 && windKmh.value > 0)
/** Souffle du monde (v6.1) : son nom et son effet (infobulle), sinon « Vent » / « Vent en rafales ». */
const worldWindId = computed(() => props.hud.worldWind?.id ?? 'breeze')
const windLabel = computed(() => (worldWindId.value !== 'breeze' ? t(`game.worldWind.${worldWindId.value}`) : props.hud.windDynamic && windKmh.value > 0 ? t('game.windGusty') : t('game.wind')))
const worldWindDesc = computed(() => (worldWindId.value !== 'breeze' ? t(`game.worldWindDesc.${worldWindId.value}`) : undefined))
const worldWindClass = computed(() => (worldWindId.value !== 'breeze' ? ['world-wind', `world-wind--${worldWindId.value}`] : null))
const hasPowers = computed(() => props.hud.powersEnabled !== false && props.hud.powers.some((p) => p.unlocked))
const duo = computed(() => props.hud.players.length > 1)

/* ---------- État de l'engin (v5.8) ---------- */
const STATE_ICON = Object.freeze({ fire: 'flame', frost: 'snowflake', crack: 'crack', rust: 'rust' })
const cond = computed(() => props.hud.condition)
const hpRatio = computed(() => (cond.value ? Math.max(0, Math.min(1, cond.value.hp / cond.value.maxHp)) : 1))
/** Alerte : engin en feu ou à moins d'un tiers de ses points de vie. */
const engineAlarm = computed(() => Boolean(cond.value && (cond.value.states.some((s) => s.id === 'fire') || hpRatio.value < 0.34)))
const stateLabel = (s) => t(`game.condition.${s.id}`, { level: s.level })
const engineText = computed(() => {
  const c = cond.value
  if (!c) return ''
  const states = c.states.map(stateLabel).join(', ')
  return `${t('game.engineHpValue', { hp: c.hp, max: c.maxHp })}${states ? `, ${states}` : ''}`
})
const infinite = computed(() => props.hud.shotsTotal === null)
</script>

<template>
  <header :class="['hud-top', { 'hud-top--duo': duo }]">
    <button type="button" class="btn btn--icon hud-top__pause" :aria-label="t('game.pause')" @click="emit('pause')">
      <AppIcon name="pause" />
    </button>
    <div class="hud-top__level">
      <span class="hud-top__name">
        {{ title }}
        <!-- Grand siège (v6.0) : l'étape en cours. -->
        <span v-if="hud.stageCount > 1" class="hud-top__stage">{{ t('game.stage', { stage: hud.stage, total: hud.stageCount }) }}</span>
      </span>
      <span class="hud-top__chapter">{{ subtitle }}</span>
    </div>

    <dl v-if="duo" class="hud-stats hud-stats--duo">
      <div v-for="(p, i) in hud.players" :key="i" :class="['hud-player', `hud-player--${i + 1}`, { 'hud-player--active': p.active }]">
        <dt><span :class="['player-dot', `player-dot--${i + 1}`]" aria-hidden="true" />{{ p.name }}<span v-if="p.active" class="visually-hidden">, {{ t('game.turnOf', { name: p.name }) }}</span></dt>
        <dd class="hud-stat__value">
          <template v-if="hud.mode === 'versus'"><AppIcon name="crown" :size="14" />{{ p.defenders }}<span class="visually-hidden"> {{ t('mp.defenders') }}</span></template>
          <template v-else-if="hud.mode === 'duel' || hud.mode === 'coop'"><AppIcon name="trophy" :size="14" />{{ p.renown }}<span class="visually-hidden"> {{ t('mp.renown') }}</span></template>
          <template v-else>{{ p.score.toLocaleString(state.locale) }}</template>
          <span class="hud-player__shots">· {{ p.shotsLeft }} <span class="visually-hidden">{{ t('game.shots') }}</span></span>
        </dd>
      </div>
    </dl>

    <dl class="hud-stats" :class="{ 'hud-stats--compact': duo }">
      <div v-if="!duo" class="hud-stat">
        <dt>{{ t('game.score') }}</dt>
        <dd class="hud-stat__value hud-stat__value--score">{{ hud.score.toLocaleString(state.locale) }}</dd>
      </div>
      <div v-if="hud.mode !== 'versus'" class="hud-stat">
        <dt>{{ t('game.targets') }}</dt>
        <dd class="hud-stat__value"><AppIcon name="crown" :size="16" />{{ hud.targetsLeft }}/{{ hud.targetsTotal }}</dd>
      </div>
      <div v-if="!duo" class="hud-stat">
        <dt>{{ t('game.shots') }}</dt>
        <dd class="hud-stat__value">
          <template v-if="infinite"><AppIcon name="infinity" :size="20" /><span class="visually-hidden">{{ t('game.infinite') }}</span></template>
          <template v-else>
            <span class="shots-col">
              <span class="shots" aria-hidden="true">
                <span v-for="i in hud.shotsTotal" :key="i" :class="['shots__dot', { 'shots__dot--used': i > hud.shotsLeft, 'shots__dot--bonus': i > hud.shotsTotal - (hud.bonusShots || 0) }]" />
              </span>
              <!-- Jauge de destruction (v6.0) : à moitié du château, une pierre de plus. -->
              <span
                v-if="hud.gauge"
                :class="['gauge', { 'gauge--full': hud.gauge.earned }]"
                role="meter"
                :aria-label="t('game.gauge')"
                aria-valuemin="0"
                aria-valuemax="100"
                :aria-valuenow="Math.round(hud.gauge.ratio * 100)"
                :title="t('game.gaugeHint')"
              >
                <span class="gauge__fill" :style="{ '--fill': hud.gauge.ratio }" />
              </span>
            </span>
            <span class="shots__text">{{ hud.shotsLeft }}</span>
          </template>
        </dd>
      </div>
      <div v-if="cond?.show && !duo" :class="['hud-stat hud-stat--engine', { 'hud-stat--alarm': engineAlarm }]">
        <dt>{{ t('game.engineHp') }}</dt>
        <dd class="hud-stat__value">
          <span class="engine-hp" role="meter" :aria-label="t('game.engineHp')" aria-valuemin="0" :aria-valuemax="cond.maxHp" :aria-valuenow="cond.hp" :aria-valuetext="engineText">
            <span class="engine-hp__bar" :style="{ '--hp': hpRatio }" />
          </span>
          <span class="engine-hp__value" aria-hidden="true">{{ cond.hp }}</span>
          <span v-for="s in cond.states" :key="s.id" :class="['engine-state', `engine-state--${s.id}`]" :title="stateLabel(s)">
            <AppIcon :name="STATE_ICON[s.id]" :size="14" />
            <span v-if="s.level > 1" class="engine-state__lvl" aria-hidden="true">{{ s.level }}</span>
          </span>
        </dd>
      </div>
      <div :class="['hud-stat hud-stat--wind', `hud-stat--wind-${hud.windLevel || 'calm'}`, { 'hud-stat--gust': gusting }]">
        <!-- v6.1 : le souffle du monde prend le nom du vent quand il porte quelque chose. -->
        <dt :title="worldWindDesc" :class="worldWindClass">{{ windLabel }}</dt>
        <dd class="hud-stat__value">
          <span v-if="worldWindClass" :class="['wind-element', ...worldWindClass]" aria-hidden="true" />
          <template v-if="windKmh === 0">{{ t('game.windCalm') }}</template>
          <template v-else>
            <AppIcon name="arrow" :size="18" :class="['wind-arrow', { 'wind-arrow--left': windNow < 0 }]" />
            {{ windKmh }} km/h
            <span class="visually-hidden">{{ windNow < 0 ? t('a11y.windLeft') : t('a11y.windRight') }}, {{ t(`game.windLevels.${hud.windLevel || 'breeze'}`) }}</span>
          </template>
          <span v-if="gusting" class="wind-gust" aria-hidden="true">{{ t('game.gust') }}</span>
        </dd>
      </div>
    </dl>

    <button v-if="hasPowers" type="button" :class="['btn btn--primary hud-top__powers', { 'coach-focus': coach === 'powers' }]" data-coach="powers" @click="emit('powers')">
      <AppIcon name="flame" :size="20" />
      <span>{{ t('game.powersTitle') }}</span>
    </button>
  </header>
</template>
