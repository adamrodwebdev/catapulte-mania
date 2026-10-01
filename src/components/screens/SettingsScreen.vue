<script setup>
import { computed } from 'vue'
import { useApp } from '../../app/AppContext.js'
import { GAME } from '../../config/gameConfig.js'
import ScreenHeader from '../ui/ScreenHeader.vue'
import ToggleSwitch from '../ui/ToggleSwitch.vue'
import SegmentedControl from '../ui/SegmentedControl.vue'
import LanguagePicker from '../ui/LanguagePicker.vue'

const app = useApp()
const { state, t } = app
const s = computed(() => state.settings)

// Les points sont des séparateurs de clés : « 1.15 » devient « 1_15 » dans les dictionnaires.
const opts = (key, values) => values.map((v) => ({ value: v, label: t(`settings.${key}.${String(v).replace('.', '_')}`) }))
const set = (key) => (value) => app.setSetting(key, value)
const back = () => app.go(state.previous === 'game' || state.previous === 'settings' ? 'home' : state.previous)

function onVolume(e) {
  const v = Number(e.target.value) / 100
  if (Number.isFinite(v)) app.setSetting('volume', Math.min(1, Math.max(0, v)))
}
</script>

<template>
  <main class="screen settings">
    <ScreenHeader :title="t('settings.title')" @back="back" />

    <div class="settings__grid">
      <section class="panel" aria-labelledby="set-display">
        <h2 id="set-display" class="panel__title">{{ t('settings.sections.display') }}</h2>
        <LanguagePicker id="settings-lang" />
        <SegmentedControl :model-value="s.theme" name="theme" :label="t('settings.theme')" :options="opts('themes', ['system', 'light', 'dark'])" @update:model-value="set('theme')($event)" />
        <SegmentedControl :model-value="s.uiScale" name="scale" :label="t('settings.uiScale')" :options="opts('scales', [1, 1.15, 1.3])" @update:model-value="set('uiScale')($event)" />
        <SegmentedControl :model-value="s.motion" name="motion" :label="t('settings.motion')" :options="opts('motions', ['system', 'reduced', 'full'])" @update:model-value="set('motion')($event)" />
      </section>

      <section class="panel" aria-labelledby="set-a11y">
        <h2 id="set-a11y" class="panel__title">{{ t('settings.sections.accessibility') }}</h2>
        <ToggleSwitch id="opt-aid" :model-value="s.trajectoryAid" :label="t('settings.trajectoryAid')" :description="t('settings.trajectoryAidDesc')" @update:model-value="set('trajectoryAid')($event)" />
        <ToggleSwitch id="opt-contrast" :model-value="s.contrast === 'high'" :label="t('settings.contrast')" @update:model-value="app.setSetting('contrast', $event ? 'high' : 'normal')" />
        <ToggleSwitch id="opt-captions" :model-value="s.captions" :label="t('settings.captions')" :description="t('settings.captionsDesc')" @update:model-value="set('captions')($event)" />
        <ToggleSwitch id="opt-announce" :model-value="s.announcements" :label="t('settings.announcements')" :description="t('settings.announcementsDesc')" @update:model-value="set('announcements')($event)" />
        <ToggleSwitch id="opt-shake" :model-value="s.screenShake" :label="t('settings.screenShake')" @update:model-value="set('screenShake')($event)" />
        <ToggleSwitch id="opt-haptics" :model-value="s.haptics" :label="t('settings.haptics')" :description="t('settings.hapticsDesc')" @update:model-value="set('haptics')($event)" />
      </section>

      <section class="panel" aria-labelledby="set-sound">
        <h2 id="set-sound" class="panel__title">{{ t('settings.sections.sound') }}</h2>
        <div class="field">
          <label for="opt-volume" class="field__label">{{ t('settings.volume') }} · {{ Math.round(s.volume * 100) }} %</label>
          <input id="opt-volume" class="range" type="range" min="0" max="100" step="5" :value="Math.round(s.volume * 100)" @input="onVolume">
        </div>
        <ToggleSwitch id="opt-mute" :model-value="s.muted" :label="t('settings.mute')" @update:model-value="set('muted')($event)" />
      </section>

      <section v-if="state.profile" class="panel" aria-labelledby="set-game">
        <h2 id="set-game" class="panel__title">{{ t('settings.sections.game') }}</h2>
        <SegmentedControl
          :model-value="state.profile.difficulty"
          name="profile-difficulty"
          :label="t('settings.difficulty')"
          :options="GAME.DIFFICULTIES.map((d) => ({ value: d, label: t(`difficulty.${d}`) }))"
          @update:model-value="app.setDifficulty($event)"
        />
        <p class="field__desc">{{ t(`difficulty.${state.profile.difficulty}Desc`) }}</p>
      </section>
    </div>

    <button type="button" class="btn btn--ghost settings__reset" @click="app.resetSettings()">{{ t('settings.reset') }}</button>
  </main>
</template>
