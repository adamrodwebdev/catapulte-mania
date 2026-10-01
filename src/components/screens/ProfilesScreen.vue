<script setup>
import { ref, reactive, onMounted, nextTick } from 'vue'
import { useApp } from '../../app/AppContext.js'
import { PROFILE_NAME } from '../../domain/SaveSlot.js'
import { GAME } from '../../config/gameConfig.js'
import AppIcon from '../ui/AppIcon.vue'
import ScreenHeader from '../ui/ScreenHeader.vue'
import SegmentedControl from '../ui/SegmentedControl.vue'

const app = useApp()
const { state, t } = app

/** Index de l'emplacement en cours de création / de suppression. */
const creating = ref(null)
const confirming = ref(null)
const form = reactive({ name: '', difficulty: 'normal', error: '' })
const busy = ref(false)

onMounted(() => app.refreshSlots())

const difficultyOptions = () =>
  GAME.DIFFICULTIES.map((d) => ({ value: d, label: t(`difficulty.${d}`) }))

async function startCreate(index) {
  creating.value = index
  confirming.value = null
  form.name = ''
  form.difficulty = 'normal'
  form.error = ''
  await nextTick()
  document.getElementById(`profile-name-${index}`)?.focus()
}

async function submit(index) {
  const name = form.name.trim()
  if (!PROFILE_NAME.test(name)) {
    form.error = t('profiles.nameError')
    return
  }
  busy.value = true
  try {
    await app.createProfile(index, name, form.difficulty)
    creating.value = null
    app.go('levels')
  } catch {
    form.error = t('profiles.nameError')
  } finally {
    busy.value = false
  }
}

async function openSlot(index) {
  app.services.audio.unlock()
  try {
    if (await app.openProfile(index)) app.go('levels')
  } catch {
    await app.refreshSlots()
  }
}

async function remove(index) {
  await app.deleteProfile(index)
  confirming.value = null
}
</script>

<template>
  <main class="screen profiles">
    <ScreenHeader :title="t('profiles.title')" @back="app.go('home')" />
    <p class="screen__intro">{{ t('profiles.intro') }}</p>
    <p v-if="!state.persistent" class="notice notice--warning" role="alert">{{ t('profiles.storageWarning') }}</p>

    <ol class="slots">
      <li v-for="slot in state.slots" :key="slot.index" class="slot" :class="`slot--${slot.status}`">
        <h2 class="slot__title">{{ t('profiles.slot', { n: slot.index + 1 }) }}</h2>

        <!-- Profil existant -->
        <template v-if="slot.status === 'ok'">
          <p class="slot__name">{{ slot.name }}</p>
          <p class="slot__meta">{{ t(`difficulty.${slot.difficulty}`) }}</p>
          <p class="slot__meta">{{ t('profiles.progress', { done: slot.completed, stars: slot.stars }) }}</p>
          <p class="slot__meta">{{ t('profiles.score', { score: slot.score }) }}</p>
          <div v-if="confirming !== slot.index" class="slot__actions">
            <button type="button" class="btn btn--primary" @click="openSlot(slot.index)">
              <AppIcon name="play" />{{ t('profiles.open') }}
            </button>
            <button type="button" class="btn btn--ghost" :aria-label="`${t('profiles.delete')} – ${slot.name}`" @click="confirming = slot.index">
              <AppIcon name="trash" />
            </button>
          </div>
        </template>

        <!-- Sauvegarde altérée -->
        <template v-else-if="slot.status === 'corrupted'">
          <p class="slot__name">{{ t('profiles.corrupted') }}</p>
          <p class="slot__meta">{{ t('profiles.corruptedHelp') }}</p>
          <div v-if="confirming !== slot.index" class="slot__actions">
            <button type="button" class="btn btn--ghost" @click="confirming = slot.index">
              <AppIcon name="trash" />{{ t('profiles.delete') }}
            </button>
          </div>
        </template>

        <!-- Emplacement libre -->
        <template v-else>
          <form v-if="creating === slot.index" class="slot__form" novalidate @submit.prevent="submit(slot.index)">
            <div class="field">
              <label :for="`profile-name-${slot.index}`" class="field__label">{{ t('profiles.nameLabel') }}</label>
              <input
                :id="`profile-name-${slot.index}`"
                v-model="form.name"
                class="input"
                type="text"
                maxlength="16"
                autocomplete="nickname"
                spellcheck="false"
                :placeholder="t('profiles.namePlaceholder')"
                :aria-invalid="form.error ? 'true' : 'false'"
                :aria-describedby="`profile-help-${slot.index}`"
              >
              <span :id="`profile-help-${slot.index}`" class="field__desc" :class="{ 'field__desc--error': form.error }">
                {{ form.error || t('profiles.nameHelp') }}
              </span>
            </div>
            <SegmentedControl
              v-model="form.difficulty"
              :name="`difficulty-${slot.index}`"
              :label="t('profiles.difficultyLabel')"
              :options="difficultyOptions()"
            />
            <p class="field__desc">{{ t(`difficulty.${form.difficulty}Desc`) }}</p>
            <div class="slot__actions">
              <button type="submit" class="btn btn--primary" :disabled="busy">{{ t('profiles.start') }}</button>
              <button type="button" class="btn btn--ghost" @click="creating = null">{{ t('profiles.cancel') }}</button>
            </div>
          </form>
          <template v-else>
            <p class="slot__name slot__name--empty">{{ t('profiles.empty') }}</p>
            <div class="slot__actions">
              <button type="button" class="btn btn--primary" @click="startCreate(slot.index)">
                <AppIcon name="plus" />{{ t('profiles.create') }}
              </button>
            </div>
          </template>
        </template>

        <!-- Confirmation de suppression -->
        <div v-if="confirming === slot.index" class="slot__confirm" role="alertdialog" :aria-label="t('profiles.delete')">
          <p>{{ t('profiles.deleteConfirm', { name: slot.name || t('profiles.corrupted') }) }}</p>
          <div class="slot__actions">
            <button type="button" class="btn btn--danger" @click="remove(slot.index)">{{ t('profiles.confirm') }}</button>
            <button type="button" class="btn btn--ghost" @click="confirming = null">{{ t('profiles.cancel') }}</button>
          </div>
        </div>
      </li>
    </ol>
  </main>
</template>
