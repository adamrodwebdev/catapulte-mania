import { AdService } from './AdService.js'
import { AdPolicy } from './AdPolicy.js'
import { loadScript, SDK_URLS } from './loadScript.js'
import { ADS_ENABLED } from '../../config/gameConfig.js'

/**
 * GamePix (SDK v3, v5.6) : chargement, interstitiels, vidéos récompensées,
 * « moments forts », langue du joueur et stockage synchronisé.
 * Le SDK est inclus en premier script de <head> (exigence GamePix, voir
 * vite.config.js) ; on ne le recharge que s'il manque.
 * GamePix.loaded() doit précéder tout autre appel au SDK.
 */
export class GamePixAdService extends AdService {
  id = 'gamepix'
  #sdk = null
  #loaded = false

  constructor() {
    super(new AdPolicy({ minIntervalMs: 120_000, graceLevels: 2 }))
  }

  async init() {
    try {
      if (!globalThis.GamePix) await loadScript(SDK_URLS.gamepix)
      const sdk = globalThis.GamePix
      if (!sdk) return
      this.#sdk = sdk
      sdk.loading?.(50)
    } catch {
      this.#sdk = null
    }
  }

  get rewardedAvailable() {
    return ADS_ENABLED && this.#sdk !== null && typeof this.#sdk.rewardAd === 'function'
  }

  get locale() {
    try {
      const lang = this.#sdk?.lang?.()
      return typeof lang === 'string' && /^[a-z]{2}$/i.test(lang) ? lang.toLowerCase() : null
    } catch {
      return null
    }
  }

  /** Stockage du portail (même interface que localStorage, valeurs texte). */
  get cloudStorage() {
    const s = this.#sdk?.localStorage
    return s && ['getItem', 'setItem', 'removeItem'].every((fn) => typeof s[fn] === 'function') ? s : null
  }

  loadingFinished() {
    if (!this.#sdk || this.#loaded) return
    this.#loaded = true
    try {
      this.#sdk.loading?.(100)
      this.#sdk.loaded?.()
    } catch {
      /* rien */
    }
  }

  happytime() {
    if (this.#loaded) this.#sdk?.happyMoment?.()
  }

  async _showInterstitial(pause) {
    if (!ADS_ENABLED || !this.#sdk || !this.#loaded) return false
    pause()
    try {
      await this.#sdk.interstitialAd()
      return true
    } catch {
      return true // la pause a eu lieu : la reprise suit
    }
  }

  async _showRewarded(pause) {
    if (!this.#sdk || !this.#loaded) return false
    pause()
    try {
      const res = await this.#sdk.rewardAd()
      return res === true || res?.success === true
    } catch {
      return false
    }
  }
}
