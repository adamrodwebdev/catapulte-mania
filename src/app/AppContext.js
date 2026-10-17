import { reactive, markRaw, inject, watch } from 'vue'
import { StorageService } from '../services/StorageService.js'
import { SettingsService } from '../services/SettingsService.js'
import { I18nService } from '../services/I18nService.js'
import { SaveSigner } from '../services/SaveSigner.js'
import { SaveManager } from '../services/SaveManager.js'
import { ShareService } from '../services/ShareService.js'
import { AudioService } from '../game/audio/AudioService.js'
import { HapticService } from '../game/audio/HapticService.js'
import { MusicDirector } from '../game/audio/MusicDirector.js'
import { AmbienceDirector } from '../game/audio/AmbienceDirector.js'
import { Tracks } from '../game/levels/Tracks.js'
import { starsFor } from '../game/score/ScoreRules.js'
import { PowerRegistry } from '../game/powers/PowerRegistry.js'
import { WeeklyCup, weekKey, CUP } from '../game/daily/WeeklyCup.js'
import { DailyChallenge } from '../game/daily/DailyChallenge.js'
import { ReplayCode } from '../game/replay/ReplayCode.js'
import { ENDLESS } from '../domain/EndlessRun.js'
import { loadDictionary } from '../i18n/loader.js'
import { NoAdService } from '../services/ads/AdService.js'
import { CloudStorageBackend } from '../services/CloudStorageBackend.js'
import { GAME, PLAYABLE_LEVELS, IS_PORTAL } from '../config/gameConfig.js'
import { ValidationError } from '../core/utils/Guard.js'
import { ProfilePresenter } from './ProfilePresenter.js'

const KEY = Symbol('app')

/**
 * Contrôle métier d'un record chargé depuis la sauvegarde.
 * Les étoiles ne sont jamais crues sur parole : elles sont recalculées à partir
 * du plus petit nombre de tirs gagnants. Les profils antérieurs à la v3.1, dont
 * ce nombre est inconnu (0), gardent les étoiles obtenues à l'époque.
 * @param {number} levelId
 * @param {{ best: number, stars: number, shots: number }} rec
 * @param {'campaign' | 'heroic' | 'duke'} [track] parcours du record (v6.2, voir Tracks)
 * @returns {number} nombre d'étoiles correct pour ce record
 */
function checkRecord(levelId, rec, track = 'campaign') {
  const level = Tracks.get(track).level(levelId)
  // Niveau passé (v6.0) : aucune étoile tant qu'il n'est pas pris pour de bon.
  if (rec.skipped) return 0
  if (rec.best > level.maxScore) throw new ValidationError(`levels.${levelId}.best`, 'impossible score')
  if (rec.shots > level.shots + 10) throw new ValidationError(`levels.${levelId}.shots`, 'impossible shot count')
  return rec.shots > 0 ? starsFor(level, rec.shots) : Math.max(1, rec.stars)
}

/** Écrans de l'application (navigation interne, une seule URL pour le SEO). */
export const SCREENS = Object.freeze(['home', 'profiles', 'levels', 'game', 'settings', 'help', 'workshop', 'multiplayer', 'privacy', 'modes', 'editor'])

/** Invitations reçues par lien, en attente sur l'accueil (clé de l'état). */
const INCOMING = Object.freeze({ challenge: 'incomingChallenge', castle: 'incomingCastle', cup: 'incomingCup' })

/**
 * Contexte applicatif : instancie les services (une seule fois) et expose un
 * état réactif minimal à l'interface. Les objets métier restent hors de la
 * réactivité Vue (markRaw) : Vue n'observe que des copies d'affichage
 * (ProfilePresenter). Les écrans ne modifient jamais l'état partagé ni le
 * stockage eux-mêmes : ils passent par les actions ci-dessous.
 */
/**
 * @param {{ ads?: import('../services/ads/AdService.js').AdService }} [opts]
 *   ads : service de publicité du build (aucune pub sur notre site)
 */
export async function createAppContext({ ads = new NoAdService() } = {}) {
  // Portail avec sauvegarde synchronisée : le stockage du portail remplace le localStorage.
  // localStorage peut être interdit (cadre isolé d'un portail) : la sauvegarde du portail suffit alors.
  let local
  try {
    local = globalThis.localStorage ?? null
  } catch {
    local = null
  }
  let cloud
  try {
    cloud = ads.cloudStorage ? new CloudStorageBackend(ads.cloudStorage, local) : null
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
        : // Sur un portail : langue fournie par le portail d'abord, l'anglais à défaut (règle CrazyGames).
          I18nService.detect('', [ads.locale, ...(globalThis.navigator?.languages || [])].filter(Boolean), GAME.LANGUAGES, IS_PORTAL ? 'en' : GAME.DEFAULT_LANGUAGE)
  // Seule la langue du joueur est téléchargée avant l'affichage (v3.5).
  const i18n = new I18nService({ [locale]: await loadDictionary(locale) }, locale, 'en', {
    available: GAME.LANGUAGES,
    loader: loadDictionary,
  })
  const saves = new SaveManager(storage, new SaveSigner(storage), checkRecord)
  const audio = new AudioService()
  const haptics = new HapticService()
  const music = new MusicDirector(audio)
  const ambience = new AmbienceDirector(audio)
  // Partage des liens (v6.2) : le titre du partage natif est le nom du jeu.
  const sharing = new ShareService(ads, { title: () => i18n.t('app.title') })

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
    /** Château reçu par lien (atelier d'un ami), en attente sur l'accueil : { code, name }. */
    incomingCastle: null,
    /** Coupe de la semaine reçue par lien (v6.0) : { week, current } ou null. */
    incomingCup: null,
    /** Ouvrir la coupe à l'accueil (retour d'un château de la coupe). */
    showCup: false,
    /** Code du château de l'atelier que le joueur a lui-même pris (condition pour le partager). */
    editorVerified: null,
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

  const services = markRaw({ storage, settings, i18n, saves, audio, haptics, music, ambience, ads })

  /* ----- Profil actif : copie d'affichage et sauvegarde ----- */

  const profileView = (slot) => ProfilePresenter.view(slot)
  /** Rafraîchit la copie d'affichage du profil actif. */
  function refreshProfile() {
    state.profile = profileView(activeSlot)
  }

  /**
   * Enregistre le profil actif puis rafraîchit sa copie d'affichage. Une
   * sauvegarde refusée (profil incohérent, stockage plein) ne lève jamais
   * d'erreur : la partie reste acquise pour la session.
   * @param {{ strict?: boolean }} [opts] strict : si la sauvegarde lève une
   *   erreur, l'action est refusée — l'affichage n'est pas rafraîchi, `null` est renvoyé
   * @returns {Promise<boolean | null>} écriture réussie ou non ; null (strict) si refusée
   */
  async function persist({ strict = false } = {}) {
    let saved
    try {
      saved = await saves.save(activeSlot)
    } catch {
      if (strict) return null
      saved = false
    }
    refreshProfile()
    return saved
  }

  /* ----- Publicités (portails) : son coupé et commandes bloquées pendant la vidéo ----- */
  ads.on('pause', () => {
    state.adPlaying = true
    audio.adMuted = true
  })
  ads.on('resume', () => {
    state.adPlaying = false
    audio.adMuted = false
  })
  // Son coupé par le portail (réglage du site CrazyGames).
  audio.portalMuted = ads.portalMuted
  ads.on('mute', (muted) => (audio.portalMuted = muted))

  /**
   * Double l'or de la dernière victoire contre une vidéo récompensée.
   * @returns {Promise<number>} or ajouté (0 si vidéo interrompue ou refusée)
   */
  async function doubleGold(result) {
    if (!activeSlot || !activeSlot.canDoubleGold(result)) return 0
    const ticket = await ads.rewarded('double-gold')
    if (!ticket) return 0
    const bonus = activeSlot.claimDoubleGold(result, ticket)
    // Sauvegarde refusée : l'or reste acquis pour la session.
    if (bonus > 0) await persist()
    return bonus
  }

  /* ----- Langue ----- */
  const t = (key, params) => {
    void state.locale // dépendance réactive : retraduit quand la langue change
    return i18n.t(key, params)
  }
  /** Nombre dans la langue courante (Intl, code complet de la langue). */
  const n = (value) => {
    void state.locale
    return i18n.formatNumber(value)
  }
  /** Date dans la langue courante (Intl, code complet de la langue : « en-GB »…). */
  const d = (date, options) => {
    void state.locale
    return i18n.formatDate(date, options)
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

  /* ----- Récompenses de connexion ----- */

  /** Ouvre le coffre du jour du profil actif ; renvoie l'or reçu (0 si rien). */
  async function claimLogin() {
    if (!activeSlot) return 0
    const gold = activeSlot.claimLogin()
    if (!gold) return 0
    if ((await persist({ strict: true })) === null) return 0
    return gold
  }

  /* ----- Profils ----- */

  async function refreshSlots() {
    state.slots = await saves.summaries()
  }

  async function openProfile(index) {
    const slot = await saves.load(index)
    if (!slot) return false
    // Maîtrise atteinte avant la v6.2 : l'Engin d'or et la Comète d'or sont offerts.
    if (slot.grantMastery().length) {
      try {
        await saves.save(slot)
      } catch {
        /* offerts de nouveau à la prochaine ouverture */
      }
    }
    activeSlot = markRaw(slot)
    saves.lastSlot = index
    refreshProfile()
    return true
  }

  async function createProfile(index, name, difficulty) {
    const slot = await saves.create(index, name, difficulty)
    activeSlot = markRaw(slot)
    saves.lastSlot = index
    refreshProfile()
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
    // Ici, une sauvegarde refusée remonte à l'écran des réglages.
    await saves.save(activeSlot)
    refreshProfile()
  }

  /**
   * Enregistre un résultat authentifié dans le profil actif.
   * @returns {Promise<{ newBest: boolean, firstClear: boolean, unlockedPower: string | null, saved: boolean }>}
   */
  async function recordResult(result) {
    if (!activeSlot) return { newBest: false, firstClear: false, unlockedPower: null, saved: false, gold: 0, newAchievements: 0 }
    const before = activeSlot.completedCount
    const masteredBefore = activeSlot.mastered
    const outcome = activeSlot.recordResult(result)
    // v6.2 : toutes les étoiles et tous les succès, à l'instant : Grand Ingénieur du Royaume.
    const mastery = !masteredBefore && activeSlot.mastered
    if (mastery) activeSlot.grantMastery()
    const saved = await persist()
    const after = activeSlot.completedCount
    const unlocked = after > before ? PowerRegistry.unlockedAt(after) : null
    if (after > before) ads.reportProgress((after / GAME.LEVEL_COUNT) * 100)
    if (result.won) {
      ads.reportScore(result.score)
      ads.reportLevel(result.levelId)
      if (outcome.newBest || outcome.firstClear) ads.happytime()
    }
    await refreshSlots()
    return { ...outcome, unlockedPower: unlocked ? unlocked.id : null, saved, mastery }
  }

  /** Lance la Campagne héroïque (profil maîtrisé) : ses paliers d'atelier s'ouvrent. */
  async function startHeroic() {
    if (!activeSlot || !activeSlot.startHeroic()) return false
    return (await persist({ strict: true })) !== null
  }

  /**
   * Victoire de la Campagne héroïque ou des Terres du Duc : des médailles.
   * @param {'heroic' | 'duke'} track
   * @returns {Promise<{ newBest: boolean, firstClear: boolean, stars: number, before: number, saved: boolean }>}
   */
  async function recordMedal(result, track) {
    if (!activeSlot) return { newBest: false, firstClear: false, stars: 0, before: 0, saved: false }
    const outcome = track === 'heroic' ? activeSlot.recordHeroic(result) : activeSlot.recordDuke(result)
    // Une défaite n'est pas enregistrée : rien à sauvegarder.
    let saved = true
    if (result.won) saved = await persist()
    else refreshProfile()
    return { ...outcome, saved }
  }

  /**
   * Enregistre une partie de la campagne à deux dans le profil actif.
   * @returns {Promise<{ newBest: boolean, firstClear: boolean, saved: boolean }>}
   */
  async function recordCoop(result) {
    if (!activeSlot) return { newBest: false, firstClear: false, saved: false }
    const outcome = activeSlot.recordCoop(result)
    const saved = await persist()
    return { ...outcome, saved }
  }

  /**
   * Enregistre une partie du défi du jour (résultat authentifié, défi du jour même).
   * @returns {Promise<{ newBest: boolean, streak: number, extended: boolean, saved: boolean }>}
   */
  async function recordDaily(result, day) {
    if (!activeSlot) return { newBest: false, streak: 0, extended: false, saved: false, reward: null }
    const outcome = activeSlot.recordDaily(result, day)
    // Événement saisonnier : une victoire au défi du jour offre sa récompense.
    const reward = result.won ? activeSlot.grantEventReward(day) : null
    const saved = await persist()
    if (outcome.newBest || outcome.extended || reward) ads.happytime()
    return { ...outcome, saved, reward }
  }

  /**
   * Enregistre un château de la coupe de la semaine (résultat authentifié).
   * @returns {Promise<{ newBest: boolean, stars: number, medal: string | null, medalUp: boolean, saved: boolean }>}
   */
  async function recordCup(result, week, index) {
    if (!activeSlot) return { newBest: false, stars: 0, medal: null, medalUp: false, saved: false }
    const outcome = activeSlot.recordCup(result, week, index)
    const saved = await persist()
    if (outcome.medalUp) ads.happytime()
    return { ...outcome, saved }
  }

  /** Lance un château de la coupe de la semaine (un profil est nécessaire pour la médaille). */
  async function startCup(index = 1) {
    if (!activeSlot) {
      const last = saves.lastSlot
      if (!(Number.isInteger(last) && (await openProfile(last)))) {
        state.afterProfile = 'cup'
        go('profiles')
        return
      }
    }
    const cup = WeeklyCup.thisWeek()
    const i = Math.max(1, Math.min(CUP.CASTLES, Math.trunc(index) || 1))
    state.match = { mode: 'cup', levelId: cup.levels[i - 1], levels: null, arenaId: 1, duelId: 1, players: [], daily: null, challenge: null, cup: { week: cup.key, index: i } }
    state.levelId = cup.levels[i - 1]
    go('game')
  }

  /** Partage sa coupe : lien qui ouvre la coupe de la semaine chez un ami. */
  async function shareCup(text) {
    return sharing.share({ coupe: weekKey() }, text)
  }

  /** Au démarrage : une coupe partagée par lien ? (celle de la semaine, ou une coupe finie). */
  function readIncomingCup() {
    let week
    try {
      week = ads.inviteParam('coupe')
      if (!week && globalThis.location?.hash.startsWith('#coupe=')) week = decodeURIComponent(location.hash.slice(7))
    } catch {
      week = null
    }
    if (!week) return
    state.incomingCup = /^\d{4}-W\d{2}$/.test(week) ? { week, current: week === weekKey() } : null
  }

  /** Passe un niveau après trois défaites d'affilée (v6.0) ; le suivant s'ouvre. */
  async function skipLevel(levelId) {
    if (!activeSlot) return false
    activeSlot.skipLevel(levelId)
    return persist()
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
    if (next === 'cup') return startCup(1)
    if (next === 'endless') return startEndless()
    go('levels')
  }

  /** Lance un siège sans fin (profil requis, premier chapitre terminé). */
  async function startEndless() {
    if (!activeSlot) {
      const last = saves.lastSlot
      if (!(Number.isInteger(last) && (await openProfile(last)))) {
        state.afterProfile = 'endless'
        go('profiles')
        return
      }
    }
    if (activeSlot.completedCount < ENDLESS.UNLOCK) {
      go('modes')
      return
    }
    state.match = { mode: 'endless', levelId: 1, levels: null, arenaId: 1, duelId: 1, players: [], daily: null, challenge: null }
    go('game')
  }

  /**
   * Enregistre un siège terminé (partie authentique).
   * @returns {Promise<{ newBest: boolean, newWave: boolean, saved: boolean }>}
   */
  async function recordEndless(run) {
    if (!activeSlot) return { newBest: false, newWave: false, saved: false }
    const outcome = activeSlot.recordEndless(run)
    const saved = await persist()
    if (outcome.newBest || outcome.newWave) ads.happytime()
    return { ...outcome, saved }
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
    return sharing.share({ defi: ReplayCode.encode(run) }, text)
  }

  /** Joue un château de l'atelier (le sien, pour le tester, ou celui d'un ami). */
  async function startCustom(code, { fromEditor = false } = {}) {
    // L'atelier n'est chargé qu'à la demande (accueil plus léger).
    const { CastleCode } = await import('../game/editor/CastleDesign.js')
    const design = CastleCode.decode(code)
    state.incomingCastle = null
    state.match = { mode: 'custom', levelId: 1, levels: null, arenaId: 1, duelId: 1, players: [], daily: null, challenge: null, custom: { code, fromEditor: fromEditor === true, name: design.name } }
    go('game')
  }

  /** Partage un château de l'atelier (lien du portail, ou #chateau= sur notre site). */
  async function shareCastle(code, text) {
    const { CastleCode } = await import('../game/editor/CastleDesign.js')
    CastleCode.decode(code)
    return sharing.share({ chateau: code }, text)
  }

  /**
   * Château de l'atelier pris par son auteur (v4.0) : il prouve qu'il est
   * faisable, on peut alors le partager. Mémorisé sur l'appareil (sans
   * stockage, la preuve vaut pour la session).
   */
  async function verifyCastle(code) {
    state.editorVerified = code
    try {
      const { CastleDraftService } = await import('../services/CastleDraftService.js')
      new CastleDraftService(storage).rememberVerified(code)
    } catch {
      /* atelier indisponible : la preuve vaut pour la session */
    }
  }

  /** À l'ouverture de l'atelier : le château déjà pris par son auteur, mémorisé sur l'appareil. */
  async function restoreVerifiedCastle() {
    if (state.editorVerified) return
    try {
      const { CastleDraftService } = await import('../services/CastleDraftService.js')
      const saved = new CastleDraftService(storage).verifiedCode()
      if (saved && !state.editorVerified) state.editorVerified = saved
    } catch {
      /* rien de mémorisé */
    }
  }

  /** Au démarrage : un château partagé par lien ? */
  async function readIncomingCastle() {
    let code
    try {
      code = ads.inviteParam('chateau')
      if (!code && globalThis.location?.hash.startsWith('#chateau=')) code = location.hash.slice(9)
    } catch {
      code = null
    }
    if (!code) return
    try {
      const { CastleCode } = await import('../game/editor/CastleDesign.js')
      const design = CastleCode.decode(code)
      state.incomingCastle = { code, name: design.name }
    } catch {
      state.badChallenge = true
    }
    try {
      if (location.hash) history.replaceState(history.state, '', location.pathname + location.search)
    } catch {
      /* sans conséquence */
    }
  }
  readIncomingCastle()

  /** Au démarrage : un défi reçu par lien (portail ou #defi= sur notre site) ? */
  function readIncomingChallenge() {
    let code
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
  readIncomingCup()

  /** Invitation reçue par lien (défi, château, coupe) refusée ou remise à plus tard. */
  function dismissIncoming(kind) {
    if (Object.hasOwn(INCOMING, kind)) state[INCOMING[kind]] = null
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
    return (await persist({ strict: true })) !== null
  }

  /* ----- Lancement d'une partie ----- */

  /**
   * @param {{ mode: string, levelId?: number, arenaId?: number, duelId?: number, players?: string[] }} match
   */
  function startMatch(match) {
    const quick = match.quick === true
    const levels = Array.isArray(match.levels) && match.levels.length === 3 && match.levels.every((id) => Number.isInteger(id) && id >= 1 && id <= GAME.LEVEL_COUNT) ? [...match.levels] : null
    state.match = { mode: match.mode, levelId: match.levelId ?? state.levelId, levels, arenaId: match.arenaId ?? 1, duelId: match.duelId ?? 1, players: [...(match.players || [])], daily: null, challenge: null, quick }
    if (match.levelId) state.levelId = match.levelId
    go('game')
  }

  /**
   * Niveau à jouer dans la partie en cours (suivant, tournoi, siège sans fin,
   * niveau passé) ; `match` : la partie le retient aussi (`state.match.levelId`).
   */
  function setLevel(levelId, { match = false } = {}) {
    state.levelId = levelId
    if (match) state.match = { ...state.match, levelId }
  }

  /** Démarrage rapide (portails) : vrai une seule fois, au lancement de la partie demandée. */
  function takeQuickStart() {
    if (state.match.quick !== true) return false
    state.match.quick = false
    return true
  }

  /** Retour d'un château de la coupe : l'accueil rouvrira la coupe. */
  function requestCup() {
    state.showCup = true
  }

  /** L'accueil doit-il rouvrir la coupe ? (une seule fois) */
  function takeCupRequest() {
    const open = Boolean(state.showCup)
    state.showCup = false
    return open
  }

  /**
   * Portails (règle CrazyGames : un nouveau joueur arrive dans la partie en un
   * clic au plus) : sans aucun profil, on lui en crée un (nom par défaut,
   * difficulté Normale, modifiable ensuite) et on lance le premier niveau
   * directement. Renvoie false s'il existe déjà un profil.
   */
  async function quickStart() {
    await refreshSlots()
    if (state.slots.some((s) => s.status !== 'empty')) return false
    await createProfile(0, t('profiles.defaultName'), 'normal')
    startMatch({ mode: 'story', levelId: 1, quick: true })
    return true
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
      // Les menus n'ont que la musique : l'ambiance appartient au champ de bataille.
      ambience.stop()
      audio.stopLoops()
      audio.duckAmbience(false)
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

  /* ----- Profil de test : toute la campagne ouverte (v6.2, serveur de développement) ----- */
  // `?unlock=all` / `?unlock=complete` : voir devUnlock.js, absent des versions publiées.
  if (import.meta.env?.DEV) {
    try {
      const { openTestCampaign } = await import('./devUnlock.js')
      await openTestCampaign({
        state,
        saves,
        refreshSlots,
        openProfile,
        createProfile,
        go,
        activeSlot: () => activeSlot,
        adopt: (slot) => {
          activeSlot = markRaw(slot)
          refreshProfile()
        },
      })
    } catch (err) {
      console.warn('[Catapulte Mania] profil de test indisponible', err)
    }
  }

  return {
    state,
    services,
    t,
    n,
    d,
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
    startHeroic,
    recordMedal,
    workshop,
    claimLogin,
    startMatch,
    setLevel,
    takeQuickStart,
    recordCoop,
    recordDaily,
    startDaily,
    recordCup,
    startCup,
    shareCup,
    requestCup,
    takeCupRequest,
    skipLevel,
    startChallenge,
    startEndless,
    recordEndless,
    startCustom,
    quickStart,
    shareCastle,
    verifyCastle,
    restoreVerifiedCastle,
    dismissIncoming,
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
