import { AdService } from './AdService.js'
import { AdPolicy } from './AdPolicy.js'
import { loadScript, SDK_URLS } from './loadScript.js'
import { ADS_ENABLED } from '../../config/gameConfig.js'

/**
 * Toutes les clés de sauvegarde du jeu (voir StorageService : préfixe `ctc:`).
 * Playgama demande de tout lire d'un seul appel au démarrage : le stockage de la
 * plateforme est asynchrone, celui du jeu synchrone ; on lit donc tout d'avance,
 * puis on sert les lectures depuis la mémoire (un test vérifie que la liste
 * couvre toutes les clés employées par le jeu).
 */
export const PLAYGAMA_KEYS = Object.freeze([
  'ctc:cloud',
  'ctc:settings',
  'ctc:slot-0',
  'ctc:slot-1',
  'ctc:slot-2',
  'ctc:last-slot',
  'ctc:device-salt',
  'ctc:castle-draft',
  'ctc:castle-verified',
])

/** Une publicité qui ne s'ouvre pas dans ce délai est abandonnée (le jeu continue). */
const OPEN_TIMEOUT_MS = 12_000
/** Délai maximal d'une publicité ouverte (au-delà, on rend la main au jeu). */
const SHOW_TIMEOUT_MS = 120_000
/** Écritures regroupées : un seul appel au stockage de la plateforme par rafale. */
const FLUSH_DELAY_MS = 300

const withTimeout = (promise, ms, fallback) =>
  Promise.race([Promise.resolve(promise), new Promise((resolve) => setTimeout(() => resolve(fallback), ms))])

/**
 * Playgama (Bridge SDK v2, v6.4) : langue, sauvegarde de la plateforme, son et
 * pause, « jeu prêt », étapes des niveaux, interstitiels et vidéos récompensées.
 *
 * Règles de Playgama suivies ici :
 * - le Bridge est chargé avant le jeu (premier script de <head>, voir
 *   vite.config.js) et initialisé avant tout autre appel ;
 * - la langue vient de `bridge.platform.language`, l'anglais à défaut ;
 * - la progression passe par `bridge.storage` seulement : une lecture groupée au
 *   démarrage, des écritures groupées ensuite ;
 * - son et partie s'arrêtent quand la plateforme le demande (pause, son coupé,
 *   publicité qu'elle lance d'elle-même) ;
 * - `game_ready` part une fois, quand le premier écran répond ;
 * - interstitiels seulement entre deux niveaux, vidéos récompensées seulement à
 *   la demande du joueur, récompense seulement sur `rewarded` ;
 * - bloqueur de publicités (`checkAdBlock`) : aucune publicité proposée ni
 *   attendue. Le Bridge peut rester « loading » sans jamais signaler l'échec :
 *   on n'attend jamais une publicité plus de 12 s avant qu'elle s'ouvre ;
 * - aucun lien vers l'extérieur (`externalLinksAllowed` faux).
 */
export class PlaygamaAdService extends AdService {
  id = 'playgama'
  #bridge = null
  #ready = false
  #inLevel = false
  #adBlocked = false
  #muted = false
  #paused = false
  /** @type {Map<string, string | null> | null} */
  #cache = null
  #pendingSet = new Map()
  #pendingDelete = new Set()
  #flushTimer = null

  constructor() {
    // Deux minutes au moins entre deux interstitiels ; le premier, une fois deux niveaux
    // terminés : jamais après la toute première victoire (le Bridge impose lui-même 60 s).
    super(new AdPolicy({ minIntervalMs: 120_000, graceLevels: 2 }))
  }

  async init() {
    try {
      if (!globalThis.bridge) await loadScript(SDK_URLS.playgama)
      const bridge = globalThis.bridge
      if (!bridge) return
      await withTimeout(bridge.initialize(), 8000, null)
      this.#bridge = bridge
      // Sauvegarde : tout lire d'un coup, avant que le jeu ne lise quoi que ce soit.
      const values = await withTimeout(bridge.storage.get([...PLAYGAMA_KEYS], false), 6000, null)
      if (Array.isArray(values)) {
        this.#cache = new Map(PLAYGAMA_KEYS.map((key, i) => [key, typeof values[i] === 'string' ? values[i] : null]))
      }
      // Son : l'état de départ (l'événement ne vient qu'aux changements), puis chaque changement.
      this.#muted = bridge.platform.isAudioEnabled === false
      const events = bridge.EVENT_NAME ?? {}
      bridge.platform.on?.(events.AUDIO_STATE_CHANGED ?? 'audio_state_changed', (enabled) => {
        this.#muted = enabled === false
        this.emit('mute', this.#muted)
      })
      // Pause demandée par la plateforme (onglet caché, publicité lancée par elle) : rideau, son coupé.
      bridge.platform.on?.(events.PAUSE_STATE_CHANGED ?? 'pause_state_changed', (paused) => this.#setPaused(paused === true))
      // Déjà en pause au démarrage, ou une publicité déjà à l'écran : le jeu démarre en pause
      // (AppContext lit `platformPaused`), jusqu'à la fin de cette publicité.
      const ads = bridge.advertisement
      this.#paused = bridge.platform.isPaused === true || ads?.interstitialState === 'opened'
      if (ads?.interstitialState === 'opened') {
        const name = events.INTERSTITIAL_STATE_CHANGED ?? 'interstitial_state_changed'
        const onState = (state) => {
          if (state !== 'closed' && state !== 'failed') return
          ads.off?.(name, onState)
          if (bridge.platform.isPaused !== true) this.#setPaused(false)
        }
        ads.on(name, onState)
      }
      this.#adBlocked = (await withTimeout(bridge.advertisement?.checkAdBlock?.(), 3000, false)) === true
      globalThis.addEventListener?.('pagehide', () => this.#flush())
      globalThis.document?.addEventListener?.('visibilitychange', () => {
        if (globalThis.document.hidden) this.#flush()
      })
    } catch {
      this.#bridge = null
    }
  }

  get rewardedAvailable() {
    const ads = this.#bridge?.advertisement
    return ADS_ENABLED && Boolean(ads) && !this.#adBlocked && ads.isRewardedSupported !== false
  }

  get portalMuted() {
    return this.#muted
  }

  get platformPaused() {
    return this.#paused
  }

  #setPaused(paused) {
    if (paused === this.#paused) return
    this.#paused = paused
    this.emit(paused ? 'pause' : 'resume', 'platform')
  }

  get locale() {
    const lang = this.#bridge?.platform?.language
    return typeof lang === 'string' && /^[a-z]{2}([-_][a-z]{2})?$/i.test(lang) ? lang.slice(0, 2).toLowerCase() : null
  }

  /** Aucun lien vers l'extérieur sur Playgama (réseaux sociaux, sites, courriel). */
  get externalLinksAllowed() {
    return false
  }

  /**
   * Sauvegarde de la plateforme, servie depuis la mémoire (lue au démarrage) ;
   * chaque écriture part, regroupée avec ses voisines, vers `bridge.storage`.
   */
  get cloudStorage() {
    if (!this.#cache) return null
    return {
      getItem: (key) => (this.#cache.has(key) ? this.#cache.get(key) : null),
      setItem: (key, value) => {
        const text = String(value)
        this.#cache.set(key, text)
        this.#pendingDelete.delete(key)
        this.#pendingSet.set(key, text)
        this.#schedule()
      },
      removeItem: (key) => {
        this.#cache.set(key, null)
        this.#pendingSet.delete(key)
        this.#pendingDelete.add(key)
        this.#schedule()
      },
    }
  }

  #schedule() {
    if (this.#flushTimer) return
    this.#flushTimer = setTimeout(() => this.#flush(), FLUSH_DELAY_MS)
  }

  /** Envoie les écritures en attente : un appel pour les valeurs, un pour les effacements. */
  #flush() {
    clearTimeout(this.#flushTimer)
    this.#flushTimer = null
    const storage = this.#bridge?.storage
    if (!storage) return
    if (this.#pendingSet.size) {
      const keys = [...this.#pendingSet.keys()]
      const values = keys.map((k) => this.#pendingSet.get(k))
      this.#pendingSet.clear()
      Promise.resolve(storage.set(keys, values)).catch(() => {
        /* la partie reste acquise pour la session */
      })
    }
    if (this.#pendingDelete.size) {
      const keys = [...this.#pendingDelete]
      this.#pendingDelete.clear()
      Promise.resolve(storage.delete(keys)).catch(() => {})
    }
  }

  /** Le premier écran répond : `game_ready`, une seule fois. */
  loadingFinished() {
    if (!this.#bridge || this.#ready) return
    this.#ready = true
    this.#send('game_ready')
  }

  gameplayStart() {
    this.#send(this.#inLevel ? 'level_resumed' : 'level_started')
    this.#inLevel = true
  }

  gameplayStop() {
    if (this.#inLevel) this.#send('level_paused')
  }

  levelEnded(won) {
    if (!this.#inLevel) return
    this.#inLevel = false
    this.#send(won ? 'level_completed' : 'level_failed')
  }

  #send(message) {
    try {
      this.#bridge?.platform?.sendMessage?.(message)
    } catch {
      /* message non essentiel */
    }
  }

  /** Une publicité est-elle en cours du côté du Bridge (on n'en demande jamais deux) ? */
  #bridgeBusy() {
    const ads = this.#bridge?.advertisement
    const busy = (s) => s === 'loading' || s === 'opened' || s === 'rewarded'
    return busy(ads?.interstitialState) || busy(ads?.rewardedState)
  }

  async _showInterstitial(pause) {
    const ads = this.#bridge?.advertisement
    if (!ADS_ENABLED || !ads || this.#adBlocked || ads.isInterstitialSupported === false || this.#bridgeBusy()) return false
    return this.#watch('INTERSTITIAL_STATE_CHANGED', 'interstitial_state_changed', pause, () => ads.showInterstitial('level_end'), {
      done: (state, opened) => (state === 'closed' || state === 'failed' ? opened : undefined),
    })
  }

  async _showRewarded(pause) {
    const ads = this.#bridge?.advertisement
    if (!ADS_ENABLED || !ads || this.#adBlocked || ads.isRewardedSupported === false || this.#bridgeBusy()) return false
    let rewarded = false
    return this.#watch('REWARDED_STATE_CHANGED', 'rewarded_state_changed', pause, () => ads.showRewarded('bonus'), {
      done: (state) => {
        if (state === 'rewarded') rewarded = true
        if (state === 'closed') return rewarded
        if (state === 'failed') return false
        return undefined
      },
    })
  }

  /**
   * Suit les états d'une publicité : `opened` → pause du jeu ; `done(state)`
   * rend le résultat quand la publicité est finie. Jamais d'attente sans fin :
   * 12 s pour s'ouvrir, 2 min une fois ouverte.
   */
  #watch(eventKey, eventName, pause, show, { done }) {
    const bridge = this.#bridge
    const name = bridge.EVENT_NAME?.[eventKey] ?? eventName
    return new Promise((resolve) => {
      let opened = false
      let finished = false
      let timer = null
      const finish = (result) => {
        if (finished) return
        finished = true
        clearTimeout(timer)
        try {
          bridge.advertisement.off?.(name, onState)
        } catch {
          /* pas de désabonnement dans cette version : `finished` rend l'écoute inerte */
        }
        resolve(result === true)
      }
      const onState = (state) => {
        if (finished) return
        if (state === 'opened' && !opened) {
          opened = true
          pause()
          clearTimeout(timer)
          timer = setTimeout(() => finish(false), SHOW_TIMEOUT_MS)
        }
        const result = done(state, opened)
        if (result !== undefined) finish(result)
      }
      bridge.advertisement.on(name, onState)
      timer = setTimeout(() => finish(false), OPEN_TIMEOUT_MS)
      try {
        show()
      } catch {
        finish(false)
      }
    })
  }
}
