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
      await sdk.init()
      if (sdk.environment === 'disabled') return
      this.#sdk = sdk
      sdk.game?.loadingStart?.()
    } catch {
      this.#sdk = null // bloqueur de pub, réseau… : le jeu continue sans
    }
  }

  get rewardedAvailable() {
    return this.#sdk !== null
  }

  get cloudStorage() {
    const data = this.#sdk?.data
    return data && typeof data.getItem === 'function' && typeof data.setItem === 'function' ? data : null
  }

  loadingFinished() {
    this.#sdk?.game?.loadingStop?.()
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
