<script setup>
/**
 * Coffre du jour (v4.6) : calendrier des 7 jours, coffre du jour à ouvrir.
 * Affiché sur la carte des niveaux quand un coffre attend le joueur.
 */
import { ref, computed } from 'vue'
import { useApp } from '../../app/AppContext.js'
import { LOGIN_CYCLE } from '../../game/progression/LoginRewards.js'
import ModalPanel from './ModalPanel.vue'
import AppIcon from './AppIcon.vue'

const emit = defineEmits(['close'])
const app = useApp()
const { state, t } = app
const status = computed(() => state.profile?.login)
const gained = ref(0)
const busy = ref(false)

async function claim() {
  if (busy.value) return
  busy.value = true
  gained.value = await app.claimLogin()
  busy.value = false
  if (gained.value) {
    app.services.audio.play?.('victory')
    app.announce(t('login.claimed', { gold: gained.value }))
  }
}

function toWorkshop() {
  emit('close')
  app.go('workshop')
}
</script>

<template>
  <ModalPanel labelledby="login-title" class="login" @close="emit('close')">
    <h2 id="login-title" class="modal__title"><AppIcon name="coin" />{{ t('login.title') }}</h2>
    <p class="login__intro">{{ t('login.intro') }}</p>
    <p v-if="status?.broken && !gained" class="login__note">{{ t('login.broken') }}</p>
    <p v-if="status?.locked" class="login__note">{{ t('login.locked') }}</p>
    <ol class="login__days">
      <li
        v-for="(gold, i) in LOGIN_CYCLE"
        :key="i"
        :class="['login__day', {
          'login__day--done': gained ? i + 1 <= status.day : i + 1 < status.day,
          'login__day--today': i + 1 === status.day,
          'login__day--big': i === LOGIN_CYCLE.length - 1,
        }]"
      >
        <span class="login__label">{{ t('login.day', { n: i + 1 }) }}</span>
        <span class="login__chest" aria-hidden="true">
          <svg viewBox="0 0 32 28" width="32" height="28">
            <path d="M3 12h26v13H3z" fill="#7a4a24" stroke="#2a1a0e" stroke-width="1.5" />
            <path d="M3 12c0-6 4-9 13-9s13 3 13 9z" fill="#9a5f2e" stroke="#2a1a0e" stroke-width="1.5" />
            <path d="M3 12h26M14 10h4v6h-4z" fill="#d4a537" stroke="#2a1a0e" stroke-width="1.2" />
            <path d="M6 12v13M26 12v13" stroke="#d4a537" stroke-width="2" />
          </svg>
        </span>
        <span class="login__gold"><AppIcon name="coin" :size="14" />{{ gold }}</span>
      </li>
    </ol>
    <p v-if="gained" class="login__result" role="status">{{ t('login.claimed', { gold: gained }) }}</p>
    <p v-else-if="status && !status.canClaim && !status.locked" class="login__note">{{ t('login.tomorrow') }}</p>
    <div class="modal__actions">
      <button v-if="status?.canClaim && !gained" type="button" class="btn btn--primary btn--large" data-autofocus :disabled="busy" @click="claim">
        {{ t('login.claim', { gold: status.reward }) }}
      </button>
      <button v-if="gained && state.profile?.affordable" type="button" class="btn btn--primary" data-autofocus @click="toWorkshop">
        <AppIcon name="hammer" :size="20" />{{ t('login.spend') }}
      </button>
      <button type="button" class="btn btn--ghost" @click="emit('close')">{{ gained ? t('menu.close') : t('login.later') }}</button>
    </div>
  </ModalPanel>
</template>
