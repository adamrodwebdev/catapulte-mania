import { AdService } from './AdService.js'
import { AdPolicy } from './AdPolicy.js'
import { loadScript, SDK_URLS } from './loadScript.js'

/**
 * CrazyGames (SDK v3) : interstitiels « midgame », vidéos « rewarded »,
 * événements de partie et sauvegarde synchronisée (module `data`).
 * Documentation : https://docs.crazygames.com/sdk/intro/
 */
export class CrazyGamesAdService extends AdService {
  id = 'crazygames'
  #sdk = null

  constructor() {
    // Règle CrazyGames : au plus un interstitiel toutes les 3 minutes.
    super(new AdPolicy({ minIntervalMs: 180_000, graceLevels: 2 }))
  }

  async init() {
    try {
      await loadScript(SDK_URLS.crazygames)
      const sdk = globalThis.CrazyGames?.SDK
      if (!sdk) return
      // Délai maximal : sans réponse du portail, le jeu démarre quand même.
      await Promise.race([sdk.init(), new Promise((_, reject) => setTimeout(() => reject(new Error('sdk init timeout')), 8000))])
      if (sdk.environment === 'disabled') return
      this.#sdk = sdk
      sdk.game?.loadingStart?.()
      // Son coupé depuis le site CrazyGames : on suit le réglage, et ses changements.
      sdk.game?.addSettingsChangeListener?.((settings) => this.emit('mute', settings?.muteAudio === true))
    } catch {
      this.#sdk = null // bloqueur de pub, réseau… : le jeu continue sans
    }
  }

  get rewardedAvailable() {
    return this.#sdk !== null
  }

  get portalMuted() {
    try {
      return this.#sdk?.game?.settings?.muteAudio === true
    } catch {
      return false
    }
  }

  get locale() {
    try {
      const locale = this.#sdk?.user?.systemInfo?.locale
      return typeof locale === 'string' && /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*$/.test(locale) ? locale : null
    } catch {
      return null
    }
  }

  get cloudStorage() {
    const data = this.#sdk?.data
    return data && typeof data.getItem === 'function' && typeof data.setItem === 'function' ? data : null
  }

  loadingFinished() {
    this.#sdk?.game?.loadingStop?.()
  }

  /** Lien d'invitation CrazyGames (module `game`). */
  async inviteLink(params) {
    try {
      const link = this.#sdk?.game?.inviteLink?.(params)
      return typeof link === 'string' && /^https:\/\//.test(link) ? link : null
    } catch {
      return null
    }
  }
  inviteParam(key) {
    try {
      const v = this.#sdk?.game?.getInviteParam?.(key)
      return typeof v === 'string' ? v : null
    } catch {
      return null
    }
  }
  happytime() {
    this.#sdk?.game?.happytime?.()
  }
  reportProgress(percent) {
    const p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)))
    this.#sdk?.game?.reportGameCompletedPercentage?.(p)
  }
  gameplayStart() {
    this.#sdk?.game?.gameplayStart?.()
  }
  gameplayStop() {
    this.#sdk?.game?.gameplayStop?.()
  }

  #request(type, pause) {
    if (!this.#sdk) return Promise.resolve(false)
    return new Promise((resolve) => {
      this.#sdk.ad.requestAd(type, {
        adStarted: () => pause(),
        adFinished: () => resolve(true),
        adError: () => resolve(false),
      })
    })
  }

  _showInterstitial(pause) {
    return this.#request('midgame', pause)
  }

  _showRewarded(pause) {
    return this.#request('rewarded', pause)
  }
}
