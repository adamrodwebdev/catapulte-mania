import { reactive, markRaw, inject, watch } from 'vue'
import { StorageService } from '../services/StorageService.js'
import { SettingsService } from '../services/SettingsService.js'
import { I18nService } from '../services/I18nService.js'
import { SaveSigner } from '../services/SaveSigner.js'
import { SaveManager } from '../services/SaveManager.js'
import { AudioService } from '../game/audio/AudioService.js'
import { HapticService } from '../game/audio/HapticService.js'
import { LevelRepository } from '../game/levels/LevelRepository.js'
import { starsFor } from '../game/score/ScoreRules.js'
import { PowerRegistry } from '../game/powers/PowerRegistry.js'
import { DICTIONARIES } from '../i18n/index.js'
import { GAME, PLAYABLE_LEVELS } from '../config/gameConfig.js'
import { ValidationError } from '../core/utils/Guard.js'

const KEY = Symbol('app')

/** Contrôle métier d'un record chargé depuis la sauvegarde. */
function checkRecord(levelId, best, stars) {
  const level = LevelRepository.get(levelId)
  if (best > level.maxScore) throw new ValidationError(`levels.${levelId}.best`, 'impossible score')
  if (stars !== starsFor(level, best)) throw new ValidationError(`levels.${levelId}.stars`, 'stars do not match score')
}

/** Écrans de l'application (navigation interne, une seule URL pour le SEO). */
export const SCREENS = Object.freeze(['home', 'profiles', 'levels', 'game', 'settings', 'help', 'workshop', 'multiplayer'])

/**
 * Contexte applicatif : instancie les services (une seule fois) et expose un
 * état réactif minimal à l'interface. Les objets métier restent hors de la
 * réactivité Vue (markRaw) : Vue n'observe que des copies d'affichage.
 */
export function createAppContext() {
  const storage = new StorageService()
  const settings = new SettingsService(storage)
  const urlLang = new URLSearchParams(globalThis.location?.search || '').get('lang')
  const locale =
    urlLang && GAME.LANGUAGES.includes(urlLang)
      ? urlLang
      : settings.hasStoredLanguage
        ? settings.get('language')
        : I18nService.detect('', globalThis.navigator?.languages || [], GAME.LANGUAGES, GAME.DEFAULT_LANGUAGE)
  const i18n = new I18nService(DICTIONARIES, locale, 'en')
  const saves = new SaveManager(storage, new SaveSigner(storage), checkRecord)
  const audio = new AudioService()
  const haptics = new HapticService()

  const state = reactive({
    screen: 'home',
    previous: 'home',
    locale,
    settings: settings.snapshot(),
    persistent: storage.persistent,
    slots: [],
    /** Profil actif (copie d'affichage). */
    profile: null,
    levelId: 1,
    /**
     * Partie à lancer : mode ('story' | 'free' | 'duel' | 'hotseat' | 'versus'),
     * niveau ou arène, noms des joueurs (modes à deux).
     */
    match: { mode: 'story', levelId: 1, arenaId: 1, players: [] },
    announcement: '',
    captions: [],
    systemDark: false,
    systemReducedMotion: false,
  })

  /** @type {import('../domain/SaveSlot.js').SaveSlot | null} */
  let activeSlot = null

  const services = markRaw({ storage, settings, i18n, saves, audio, haptics })

  /* ----- Langue ----- */
  const t = (key, params) => {
    void state.locale // dépendance réactive : retraduit quand la langue change
    return i18n.t(key, params)
  }
  function setLocale(lang) {
    i18n.setLocale(lang)
    settings.set('language', lang)
  }
  i18n.on('change', (lang) => (state.locale = lang))
  settings.on('change', ({ key, value }) => {
    state.settings[key] = value
    if (key === 'volume') audio.volume = value
    if (key === 'muted') audio.muted = value
    if (key === 'haptics') haptics.enabled = value
  })
  audio.volume = settings.get('volume')
  audio.muted = settings.get('muted')
  haptics.enabled = settings.get('haptics')

  /* ----- Préférences système ----- */
  if (globalThis.matchMedia) {
    const dark = matchMedia('(prefers-color-scheme: dark)')
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    state.systemDark = dark.matches
    state.systemReducedMotion = motion.matches
    dark.addEventListener?.('change', (e) => (state.systemDark = e.matches))
    motion.addEventListener?.('change', (e) => (state.systemReducedMotion = e.matches))
  }

  const reducedMotion = () =>
    state.settings.motion === 'reduced' || (state.settings.motion === 'system' && state.systemReducedMotion)

  /* ----- Navigation ----- */
  function go(screen, { replace = false } = {}) {
    if (!SCREENS.includes(screen)) return
    state.previous = state.screen
    state.screen = screen
    try {
      const fn = replace ? history.replaceState : history.pushState
      fn.call(history, { screen }, '')
    } catch {
      /* historique indisponible (iframe sandbox) */
    }
  }
  globalThis.addEventListener?.('popstate', (e) => {
    const s = e.state && SCREENS.includes(e.state.screen) ? e.state.screen : 'home'
    state.screen = s === 'game' ? 'levels' : s
  })

  /* ----- Profils ----- */
  function profileView(slot) {
    if (!slot) return null
    const levels = {}
    for (let id = 1; id <= GAME.LEVEL_COUNT; id++) {
      const rec = slot.levelRecord(id)
      levels[id] = { unlocked: slot.isUnlocked(id) && id <= PLAYABLE_LEVELS, stars: rec?.stars ?? 0, best: rec?.best ?? 0, completed: Boolean(rec) }
    }
    return {
      index: slot.index,
      name: slot.name,
      difficulty: slot.difficulty,
      completed: slot.completedCount,
      stars: slot.starCount,
      score: slot.totalScore,
      next: Math.min(slot.nextLevel, PLAYABLE_LEVELS),
      levels,
      powers: PowerRegistry.all().map((p) => ({ id: p.id, cost: p.cost, unlockAfter: p.unlockAfter, unlocked: p.isUnlocked(slot.completedCount) })),
      gold: slot.gold,
      upgrades: slot.upgrades,
      cosmetics: slot.cosmetics,
    }
  }

  async function refreshSlots() {
    state.slots = await saves.summaries()
  }

  async function openProfile(index) {
    const slot = await saves.load(index)
    if (!slot) return false
    activeSlot = markRaw(slot)
    saves.lastSlot = index
    state.profile = profileView(slot)
    return true
  }

  async function createProfile(index, name, difficulty) {
    const slot = await saves.create(index, name, difficulty)
    activeSlot = markRaw(slot)
    saves.lastSlot = index
    state.profile = profileView(slot)
    await refreshSlots()
  }

  async function deleteProfile(index) {
    saves.remove(index)
    if (activeSlot?.index === index) {
      activeSlot = null
      state.profile = null
    }
    await refreshSlots()
  }

  async function setDifficulty(difficulty) {
    if (!activeSlot) return
    activeSlot.difficulty = difficulty
    await saves.save(activeSlot)
    state.profile = profileView(activeSlot)
  }

  /**
   * Enregistre un résultat authentifié dans le profil actif.
   * @returns {Promise<{ newBest: boolean, firstClear: boolean, unlockedPower: string | null, saved: boolean }>}
   */
  async function recordResult(result) {
    if (!activeSlot) return { newBest: false, firstClear: false, unlockedPower: null, saved: false, gold: 0 }
    const before = activeSlot.completedCount
    const outcome = activeSlot.recordResult(result)
    let saved
    try {
      saved = await saves.save(activeSlot)
    } catch {
      saved = false
    }
    const after = activeSlot.completedCount
    const unlocked = after > before ? PowerRegistry.unlockedAt(after) : null
    state.profile = profileView(activeSlot)
    await refreshSlots()
    return { ...outcome, unlockedPower: unlocked ? unlocked.id : null, saved }
  }

  /* ----- Atelier (or et améliorations) ----- */

  /**
   * Achat ou équipement à l'atelier, puis sauvegarde.
   * @param {'upgrade' | 'cosmetic' | 'equip'} action
   * @returns {Promise<boolean>}
   */
  async function workshop(action, id) {
    if (!activeSlot) return false
    const ok = action === 'upgrade' ? activeSlot.buyUpgrade(id) : action === 'cosmetic' ? activeSlot.buyCosmetic(id) : activeSlot.equip(id)
    if (!ok) return false
    try {
      await saves.save(activeSlot)
    } catch {
      return false
    }
    state.profile = profileView(activeSlot)
    return true
  }

  /* ----- Lancement d'une partie ----- */

  /**
   * @param {{ mode: string, levelId?: number, arenaId?: number, players?: string[] }} match
   */
  function startMatch(match) {
    state.match = { mode: match.mode, levelId: match.levelId ?? state.levelId, arenaId: match.arenaId ?? 1, players: [...(match.players || [])] }
    if (match.levelId) state.levelId = match.levelId
    go('game')
  }

  /** Niveaux jouables à deux : chapitre 1 + tout ce qu'un profil a débloqué. */
  function multiplayerLevels() {
    const best = Math.max(0, ...state.slots.filter((s) => s.status === 'ok').map((s) => s.completed))
    return Math.min(PLAYABLE_LEVELS, Math.max(GAME.LEVELS_PER_CHAPTER, best + 1))
  }

  /* ----- Annonces & sous-titres (accessibilité) ----- */
  let announceTimer = null
  function announce(text) {
    if (!state.settings.announcements || !text) return
    state.announcement = ''
    clearTimeout(announceTimer)
    announceTimer = setTimeout(() => (state.announcement = text), 60)
  }

  let captionId = 0
  function caption(key, side = 'center') {
    if (!state.settings.captions || !key) return
    const recent = state.captions.find((c) => c.key === key && Date.now() - c.at < 700)
    if (recent) return
    const item = { id: ++captionId, key, side, at: Date.now() }
    state.captions = [...state.captions.slice(-3), item]
    setTimeout(() => (state.captions = state.captions.filter((c) => c.id !== item.id)), 2600)
  }

  /* ----- Thème appliqué au document ----- */
  function applyDocument() {
    const root = document.documentElement
    const s = state.settings
    const theme = s.theme === 'system' ? (state.systemDark ? 'dark' : 'light') : s.theme
    root.dataset.theme = theme
    root.dataset.contrast = s.contrast
    root.dataset.motion = reducedMotion() ? 'reduced' : 'full'
    root.style.setProperty('--ui-scale', String(s.uiScale))
    root.lang = state.locale
    document.title = i18n.t('app.metaTitle')
    document.querySelector('meta[name="description"]')?.setAttribute('content', i18n.t('app.metaDescription'))
  }
  if (globalThis.document) {
    watch(() => [state.settings, state.locale, state.systemDark, state.systemReducedMotion], applyDocument, { deep: true, immediate: true })
  }

  return {
    state,
    services,
    t,
    setLocale,
    setSetting: (key, value) => settings.set(key, value),
    resetSettings: () => settings.reset(),
    reducedMotion,
    go,
    refreshSlots,
    openProfile,
    createProfile,
    deleteProfile,
    setDifficulty,
    recordResult,
    workshop,
    startMatch,
    multiplayerLevels,
    announce,
    caption,
    get activeSlot() {
      return activeSlot
    },
  }
}

export function provideApp(app, ctx) {
  app.provide(KEY, ctx)
}

/** @returns {ReturnType<typeof createAppContext>} */
export function useApp() {
  return inject(KEY)
}
