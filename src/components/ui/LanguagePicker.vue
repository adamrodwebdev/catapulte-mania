<script setup>
import { useApp } from '../../app/AppContext.js'
import { LANGUAGE_NAMES } from '../../i18n/loader.js'
import { GAME } from '../../config/gameConfig.js'
import { readListChoice } from '../../app/fields.js'

defineProps({ id: { type: String, default: 'lang-picker' } })
const { state, t, setLocale } = useApp()
/** Langue choisie, lue à la porte (v6.3.1) : exactement l'une des langues du jeu. */
const onChange = (e) => {
  const lang = readListChoice(e.target.value, GAME.LANGUAGES)
  if (lang !== null) setLocale(lang)
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
