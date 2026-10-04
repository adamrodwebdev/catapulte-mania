import { AdService } from './AdService.js'
import { AdPolicy } from './AdPolicy.js'
import { loadScript, SDK_URLS } from './loadScript.js'

/**
 * Poki (SDK v2) : `commercialBreak` avant chaque reprise de partie (Poki décide
 * lui-même de la fréquence), `rewardedBreak` à la demande du joueur.
 * Documentation : https://sdk.poki.com/html5.html
 */
export class PokiAdService extends AdService {
  id = 'poki'
  #sdk = null

  constructor() {
    // Poki gère sa propre fréquence : on demande une pause à chaque fin de niveau.
    super(new AdPolicy({ minIntervalMs: 0, graceLevels: 1 }))
  }

  async init() {
    try {
      await loadScript(SDK_URLS.poki)
      const sdk = globalThis.PokiSDK
      if (!sdk) return
      await sdk.init()
      this.#sdk = sdk
    } catch {
      this.#sdk = null
    }
  }

  get rewardedAvailable() {
    return this.#sdk !== null
  }

  loadingFinished() {
    this.#sdk?.gameLoadingFinished?.()
  }

  /** Lien partageable Poki (`shareableURL`), relu avec `getURLParam`. */
  async inviteLink(params) {
    try {
      const link = await this.#sdk?.shareableURL?.(params)
      return typeof link === 'string' && /^https:\/\//.test(link) ? link : null
    } catch {
      return null
    }
  }
  inviteParam(key) {
    try {
      const v = this.#sdk?.getURLParam?.(key)
      return typeof v === 'string' && v ? v : null
    } catch {
      return null
    }
  }
  gameplayStart() {
    this.#sdk?.gameplayStart?.()
  }
  gameplayStop() {
    this.#sdk?.gameplayStop?.()
  }

  async _showInterstitial(pause) {
    if (!this.#sdk) return false
    let started = false
    await this.#sdk.commercialBreak(() => {
      started = true
      pause()
    })
    return started
  }

  async _showRewarded(pause) {
    if (!this.#sdk) return false
    return (await this.#sdk.rewardedBreak({ size: 'medium', onStart: () => pause() })) === true
  }
}
