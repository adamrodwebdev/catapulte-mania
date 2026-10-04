<script setup>
import { computed, defineAsyncComponent, ref } from 'vue'
import { useApp } from './app/AppContext.js'
import HomeScreen from './components/screens/HomeScreen.vue'
import ProfilesScreen from './components/screens/ProfilesScreen.vue'
import LevelSelectScreen from './components/screens/LevelSelectScreen.vue'
import SettingsScreen from './components/screens/SettingsScreen.vue'
import HelpScreen from './components/screens/HelpScreen.vue'
import WorkshopScreen from './components/screens/WorkshopScreen.vue'
import MultiplayerScreen from './components/screens/MultiplayerScreen.vue'
import StudioIntro from './components/ui/StudioIntro.vue'
import PrivacyScreen from './components/screens/PrivacyScreen.vue'

/**
 * Composant racine : affiche l'écran courant et la région d'annonces
 * destinée aux lecteurs d'écran.
 *
 * L'écran de jeu (et le moteur physique) est chargé à la demande :
 * la page d'accueil reste légère et s'affiche instantanément.
 */
const GameScreen = defineAsyncComponent(() => import('./components/screens/GameScreen.vue'))

const { state, t } = useApp()
const SCREENS = {
  home: HomeScreen,
  profiles: ProfilesScreen,
  levels: LevelSelectScreen,
  game: GameScreen,
  settings: SettingsScreen,
  help: HelpScreen,
  workshop: WorkshopScreen,
  multiplayer: MultiplayerScreen,
  privacy: PrivacyScreen,
}
const current = computed(() => SCREENS[state.screen] || HomeScreen)

/**
 * Générique du studio : une fois par session de navigation (et jamais si l'URL
 * contient ?nointro, pratique pour les tests). Stockage indisponible : on l'affiche.
 */
function introSeen() {
  try {
    if (new URLSearchParams(location.search).has('nointro')) return true
    return sessionStorage.getItem('ctc:intro') === '1'
  } catch {
    return false
  }
}
const showIntro = ref(!introSeen())
function introDone() {
  showIntro.value = false
  try {
    sessionStorage.setItem('ctc:intro', '1')
  } catch {
    /* sans stockage : le générique repassera à la prochaine visite */
  }
}
</script>

<template>
  <Transition name="screen" mode="out-in">
    <component :is="current" :key="state.screen" />
  </Transition>
  <div class="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{{ state.announcement }}</div>
  <!-- Portails : pendant une publicité, le jeu est masqué et ne reçoit plus aucune commande. -->
  <StudioIntro v-if="showIntro" @done="introDone" />
  <div v-if="state.adPlaying" class="ad-curtain" role="status" aria-live="polite">{{ t('ads.playing') }}</div>
</template>
