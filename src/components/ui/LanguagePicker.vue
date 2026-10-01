<script setup>
import { useApp } from '../../app/AppContext.js'
import { LANGUAGE_NAMES } from '../../i18n/index.js'
import { GAME } from '../../config/gameConfig.js'

defineProps({ id: { type: String, default: 'lang-picker' } })
const { state, t, setLocale } = useApp()
const onChange = (e) => {
  if (GAME.LANGUAGES.includes(e.target.value)) setLocale(e.target.value)
}
</script>

<template>
  <div class="lang">
    <label :for="id" class="lang__label">{{ t('menu.language') }}</label>
    <select :id="id" class="lang__select" :value="state.locale" @change="onChange">
      <option v-for="code in GAME.LANGUAGES" :key="code" :value="code" :lang="code">
        {{ LANGUAGE_NAMES[code] }}
      </option>
    </select>
  </div>
</template>
