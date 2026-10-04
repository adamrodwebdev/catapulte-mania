import { reactive, markRaw, inject, watch } from 'vue'
import { StorageService } from '../services/StorageService.js'
import { SettingsService } from '../services/SettingsService.js'
import { I18nService } from '../services/I18nService.js'
import { SaveSigner } from '../services/SaveSigner.js'
import { SaveManager } from '../services/SaveManager.js'
import { AudioService } from '../game/audio/AudioService.js'
import { HapticService } from '../game/audio/HapticService.js'
import { MusicDirector } from '../game/audio/MusicDirector.js'
import { LevelRepository } from '../game/levels/LevelRepository.js'
import { starsFor } from '../game/score/ScoreRules.js'
import { PowerRegistry } from '../game/powers/PowerRegistry.js'
import { DailyChallenge, dayKey } from '../game/daily/DailyChallenge.js'
import { ReplayCode } from '../game/replay/ReplayCode.js'
import { loadDictionary } from '../i18n/loader.js'
import { NoAdService } from '../services/ads/AdService.js'
import { CloudStorageBackend } from '../services/CloudStorageBackend.js'
import { GAME, PLAYABLE_LEVELS } from '../config/gameConfig.js'
import { ValidationError } from '../core/utils/Guard.js'

const KEY = Symbol('app')

/**
 * Contrôle métier d'un record chargé depuis la sauvegarde.
 * Les étoiles ne sont jamais crues sur parole : elles sont recalculées à partir
 * du plus petit nombre de tirs gagnants. Les profils antérieurs à la v3.1, dont
 * ce nombre est inconnu (0), gardent les étoiles obtenues à l'époque.
 * @param {number} levelId
 * @param {{ best: number, stars: number, shots: number }} rec
 * @returns {number} nombre d'étoiles correct pour ce record
 */
function checkRecord(levelId, rec) {
  const level = LevelRepository.get(levelId)
  if (rec.best > level.maxScore) throw new ValidationError(`levels.${levelId}.best`, 'impossible score')
  if (rec.shots > level.shots + 10) throw new ValidationError(`levels.${levelId}.shots`, 'impossible shot count')
  return rec.shots > 0 ? starsFor(level, rec.shots) : Math.max(1, rec.stars)
}

/** Écrans de l'application (navigation interne, une seule URL pour le SEO). */
export const SCREENS = Object.freeze(['home', 'profiles', 'levels', 'game', 'settings', 'help', 'workshop', 'multiplayer', 'privacy'])

/**
 * Contexte applicatif : instancie les services (une seule fois) et expose un
 * état réactif minimal à l'interface. Les objets métier restent hors de la
 * réactivité Vue (markRaw) : Vue n'observe que des copies d'affichage.
 */
/**
 * @param {{ ads?: import('../services/ads/AdService.js').AdService }} [opts]
 *   ads : service de publicité du build (aucune pub sur notre site)
 */
export async function createAppContext({ ads = new NoAdService() } = {}) {
  // Portail avec sauvegarde synchronisée : le stockage du portail remplace le localStorage.
  let cloud = null
  try {
    cloud = ads.cloudStorage ? new CloudStorageBackend(ads.cloudStorage, globalThis.localStorage ?? null) : null
  } catch {
    cloud = null
  }
  const storage = cloud ? new StorageService(cloud) : new StorageService()
  const settings = new SettingsService(storage)
  const urlLang = new URLSearchParams(globalThis.location?.search || '').get('lang')
  const locale =
    urlLang && GAME.LANGUAGES.includes(urlLang)
      ? urlLang
      : settings.hasStoredLanguage
        ? settings.get('language')
        : I18nService.detect('', globalThis.navigator?.languages || [], GAME.LANGUAGES, GAME.DEFAULT_LANGUAGE)
  // Seule la langue du joueur est téléchargée avant l'affichage (v3.5).
  const i18n = new I18nService({ [locale]: await loadDictionary(locale) }, locale, 'en', {
    available: GAME.LANGUAGES,
    loader: loadDictionary,
  })
  const saves = new SaveManager(storage, new SaveSigner(storage), checkRecord)
  const audio = new AudioService()
  const haptics = new HapticService()
  const music = new MusicDirector(audio)

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
    match: { mode: 'story', levelId: 1, levels: null, arenaId: 1, duelId: 1, players: [], daily: null, challenge: null },
    /** Défi reçu par un lien « Bats mon tir » (décodé et validé), en attente sur l'accueil. */
    incomingChallenge: null,
    /** Lien de défi reçu mais illisible ou altéré. */
    badChallenge: false,
    /** Écran à ouvrir une fois un profil choisi (ex. 'daily'). */
    afterProfile: null,
    announcement: '',
    captions: [],
    systemDark: false,
    systemReducedMotion: false,
    /** Une publicité est à l'écran (son coupé, commandes bloquées). */
    adPlaying: false,
    /** Les vidéos récompensées sont-elles proposables sur cette plateforme ? */
    rewardedAvailable: ads.rewardedAvailable,
  })

  /** @type {import('../domain/SaveSlot.js').SaveSlot | null} */
  let activeSlot = null

  const services = markRaw({ storage, settings, i18n, saves, audio, haptics, music, ads })

  /* ----- Publicités (portails) : son coupé et commandes bloquées pendant la vidéo ----- */
  ads.on('pause', () => {
    state.adPlaying = true
    audio.adMuted = true
  })
  ads.on('resume', () => {
    state.adPlaying = false
    audio.adMuted = false
  })

  /**
   * Double l'or de la dernière victoire contre une vidéo récompensée.
   * @returns {Promise<number>} or ajouté (0 si vidéo interrompue ou refusée)
   */
  async function doubleGold(result) {
    if (!activeSlot || !activeSlot.canDoubleGold(result)) return 0
    const ticket = await ads.rewarded('double-gold')
    if (!ticket) return 0
    const bonus = activeSlot.claimDoubleGold(result, ticket)
    if (bonus > 0) {
      try {
        await saves.save(activeSlot)
      } catch {
        /* l'or reste acquis pour la session */
      }
      state.profile = profileView(activeSlot)
    }
    return bonus
  }

  /* ----- Langue ----- */
  const t = (key, params) => {
    void state.locale // dépendance réactive : retraduit quand la langue change
    return i18n.t(key, params)
  }
  /** Change de langue (téléchargée au besoin). Hors-ligne et non en cache : on garde l'actuelle. */
  async function setLocale(lang) {
    try {
      await i18n.use(lang)
      settings.set('language', lang)
    } catch (err) {
      console.warn('[i18n]', err)
    }
  }
  // La langue de secours n'est pas préchargée : un test garantit que chaque
  // dictionnaire contient toutes les clés.
  i18n.on('change', (lang) => (state.locale = lang))
  settings.on('change', ({ key, value }) => {
    state.settings[key] = value
    if (key === 'volume') audio.volume = value
    if (key === 'muted') audio.muted = value
    if (key === 'music') {
      audio.musicVolume = value
      music.setEnabled(value > 0)
    }
    if (key === 'haptics') haptics.enabled = value
  })
  audio.volume = settings.get('volume')
  audio.muted = settings.get('muted')
  audio.musicVolume = settings.get('music')
  music.setEnabled(settings.get('music') > 0)
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
      levels[id] = { unlocked: slot.isUnlocked(id) && id <= PLAYABLE_LEVELS, stars: rec?.stars ?? 0, best: rec?.best ?? 0, completed: Boolean(rec), shots: rec?.shots ?? 0, ach: rec?.ach ?? 0 }
    }
    return {
      index: slot.index,
      name: slot.name,
      difficulty: slot.difficulty,
      completed: slot.completedCount,
      stars: slot.starCount,
      achievements: slot.achievementCount,
      coop: {
        completed: slot.coopCompleted,
        stars: slot.coopStars,
        next: Math.min(slot.coopCompleted + 1, PLAYABLE_LEVELS),
        levels: Object.fromEntries(
          Array.from({ length: PLAYABLE_LEVELS }, (_, i) => {
            const rec = slot.coopRecord(i + 1)
            return [i + 1, { stars: rec?.stars ?? 0, completed: Boolean(rec), unlocked: slot.isCoopUnlocked(i + 1) }]
          }),
        ),
      },
      score: slot.totalScore,
      next: Math.min(slot.nextLevel, PLAYABLE_LEVELS),
      levels,
      powers: PowerRegistry.all().map((p) => ({ id: p.id, cost: p.cost, unlockAfter: p.unlockAfter, unlocked: p.isUnlocked(slot.completedCount) })),
      gold: slot.gold,
      upgrades: slot.upgrades,
      cosmetics: slot.cosmetics,
      daily: dailyView(slot),
    }
  }

  /** Défi du jour vu par un profil : série en cours, record du jour, derniers jours. */
  function dailyView(slot) {
    const today = dayKey()
    const d = slot.daily
    return {
      today,
      challenge: DailyChallenge.forDay(today),
      streak: slot.dailyStreak(today),
      bestStreak: d.bestStreak,
      todayBest: d.days[today] ?? null,
      history: Object.entries(d.days)
        .sort((a, b) => (a[0] < b[0] ? 1 : -1))
        .map(([day, score]) => ({ day, score })),
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
    if (!activeSlot) return { newBest: false, firstClear: false, unlockedPower: null, saved: false, gold: 0, newAchievements: 0 }
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
    if (after > before) ads.reportProgress((after / GAME.LEVEL_COUNT) * 100)
    state.profile = profileView(activeSlot)
    await refreshSlots()
    return { ...outcome, unlockedPower: unlocked ? unlocked.id : null, saved }
  }

  /**
   * Enregistre une partie de la campagne à deux dans le profil actif.
   * @returns {Promise<{ newBest: boolean, firstClear: boolean, saved: boolean }>}
   */
  async function recordCoop(result) {
    if (!activeSlot) return { newBest: false, firstClear: false, saved: false }
    const outcome = activeSlot.recordCoop(result)
    let saved
    try {
      saved = await saves.save(activeSlot)
    } catch {
      saved = false
    }
    state.profile = profileView(activeSlot)
    return { ...outcome, saved }
  }

  /**
   * Enregistre une partie du défi du jour (résultat authentifié, défi du jour même).
   * @returns {Promise<{ newBest: boolean, streak: number, extended: boolean, saved: boolean }>}
   */
  async function recordDaily(result, day) {
    if (!activeSlot) return { newBest: false, streak: 0, extended: false, saved: false }
    const outcome = activeSlot.recordDaily(result, day)
    let saved
    try {
      saved = await saves.save(activeSlot)
    } catch {
      saved = false
    }
    if (outcome.newBest || outcome.extended) ads.happytime()
    state.profile = profileView(activeSlot)
    return { ...outcome, saved }
  }

  /** Lance le défi du jour (un profil est nécessaire pour la série). */
  async function startDaily() {
    if (!activeSlot) {
      const last = saves.lastSlot
      if (!(Number.isInteger(last) && (await openProfile(last)))) {
        state.afterProfile = 'daily'
        go('profiles')
        return
      }
    }
    const c = DailyChallenge.today()
    state.match = { mode: 'daily', levelId: c.levelId, levels: null, arenaId: 1, duelId: 1, players: [], daily: c, challenge: null }
    state.levelId = c.levelId
    go('game')
  }

  /** Après le choix d'un profil : écran demandé avant (défi du jour) ou la carte des niveaux. */
  function afterProfileChosen() {
    const next = state.afterProfile
    state.afterProfile = null
    if (next === 'daily') return startDaily()
    go('levels')
  }

  /** Lance un défi reçu par lien (aucun profil nécessaire, rien n'est enregistré). */
  function startChallenge(run = state.incomingChallenge) {
    if (!run) return
    state.incomingChallenge = null
    state.match = { mode: 'challenge', levelId: run.levelId, levels: null, arenaId: 1, duelId: 1, players: [], daily: null, challenge: run }
    state.levelId = run.levelId
    go('game')
  }

  /**
   * Partage une partie (« Bats mon tir ») : lien du portail si possible, sinon
   * l'adresse de notre site ; partage natif sur mobile, sinon copie.
   * @returns {Promise<{ url: string, method: 'shared' | 'copied' | 'manual' }>}
   */
  async function shareRun(run, text) {
    const code = ReplayCode.encode(run)
    let url = await ads.inviteLink({ defi: code })
    if (!url) {
      const base = globalThis.location ? `${location.origin}${location.pathname}` : ''
      url = `${base}#defi=${code}`
    }
    try {
      if (globalThis.navigator?.share) {
        await navigator.share({ title: 'Catapulte Mania', text, url })
        return { url, method: 'shared' }
      }
    } catch (e) {
      if (e?.name === 'AbortError') return { url, method: 'manual' }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`)
      return { url, method: 'copied' }
    } catch {
      return { url, method: 'manual' }
    }
  }

  /** Au démarrage : un défi reçu par lien (portail ou #defi= sur notre site) ? */
  function readIncomingChallenge() {
    let code = null
    try {
      code = ads.inviteParam('defi')
      if (!code && globalThis.location?.hash.startsWith('#defi=')) code = location.hash.slice(6)
    } catch {
      code = null
    }
    if (!code) return
    try {
      state.incomingChallenge = ReplayCode.decode(code)
    } catch {
      state.badChallenge = true
    }
    // Le lien a servi : on le retire de l'adresse (un rechargement ne le rejoue pas).
    try {
      if (location.hash) history.replaceState(history.state, '', location.pathname + location.search)
    } catch {
      /* sans conséquence */
    }
  }
  readIncomingChallenge()

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
   * @param {{ mode: string, levelId?: number, arenaId?: number, duelId?: number, players?: string[] }} match
   */
  function startMatch(match) {
    const levels = Array.isArray(match.levels) && match.levels.length === 3 && match.levels.every((id) => Number.isInteger(id) && id >= 1 && id <= GAME.LEVEL_COUNT) ? [...match.levels] : null
    state.match = { mode: match.mode, levelId: match.levelId ?? state.levelId, levels, arenaId: match.arenaId ?? 1, duelId: match.duelId ?? 1, players: [...(match.players || [])], daily: null, challenge: null }
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

  /* ----- Musique ----- */
  // Sous-titre pour les personnes malentendantes quand la musique s'emballe.
  music.onClimax = () => caption('music')
  // Hors partie : thème calme des menus. L'écran de jeu choisit lui-même son morceau.
  watch(
    () => state.screen,
    (screen) => {
      if (screen === 'game') return
      music.setIntensity(0)
      music.duck(false)
      music.play('menu')
    },
    { immediate: true },
  )
  globalThis.document?.addEventListener?.('visibilitychange', () => audio.suspend(document.hidden))

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
    recordCoop,
    recordDaily,
    startDaily,
    startChallenge,
    afterProfileChosen,
    shareRun,
    doubleGold,
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
