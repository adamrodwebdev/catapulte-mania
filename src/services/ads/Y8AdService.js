import { AdService } from './AdService.js'
import { AdPolicy } from './AdPolicy.js'
import { loadScript, SDK_URLS } from './loadScript.js'
import { ADS_ENABLED, PORTAL_IDS } from '../../config/gameConfig.js'

/**
 * Y8 (SDK « minimal » 2.0, v5.6) : pauses publicitaires entre les niveaux
 * (type « next ») et vidéos récompensées (type « reward »).
 * Identifiants du portail développeur Y8 (SDK Initialization → Credentials) :
 * Game ID (CTC_GAME_ID) et App ID (CTC_APP_ID), fournis au build.
 * Documentation : https://docs.y8.com/
 */
export class Y8AdService extends AdService {
  id = 'y8'
  #sdk = null

  constructor() {
    super(new AdPolicy({ minIntervalMs: 120_000, graceLevels: 2 }))
  }

  async init() {
    if (!PORTAL_IDS.gameId) return
    try {
      const ready = new Promise((resolve) => globalThis.addEventListener('y8sdk.ready', () => resolve(true), { once: true }))
      await loadScript(SDK_URLS.y8)
      // Le SDK a pu être prêt avant notre écoute.
      if (globalThis.y8?.emitReadyEvent) globalThis.y8.emitReadyEvent()
      await Promise.race([ready, new Promise((resolve) => setTimeout(resolve, 8000))])
      const sdk = globalThis.y8?.sdk?.()
      if (!sdk || typeof sdk.showAd !== 'function') return
      await sdk.init({ appId: PORTAL_IDS.appId, autoLogin: false }, { gameId: PORTAL_IDS.gameId, preloadAdBreaks: 'on', sound: 'on', onReady: () => {} })
      this.#sdk = sdk
    } catch {
      this.#sdk = null
    }
  }

  get rewardedAvailable() {
    return ADS_ENABLED && this.#sdk !== null
  }

  #break(type, pause) {
    if (!this.#sdk) return Promise.resolve(false)
    return new Promise((resolve) => {
      let viewed = false
      let started = false
      const done = () => resolve(type === 'reward' ? viewed : started)
      try {
        const p = this.#sdk.showAd({
          type,
          name: type === 'reward' ? 'reward' : 'next-level',
          beforeAd: () => {
            started = true
            pause()
          },
          afterAd: () => {},
          beforeReward: (show) => show(),
          adDismissed: () => {},
          adViewed: () => {
            viewed = true
          },
          adBreakDone: done,
        })
        p?.catch?.(done)
      } catch {
        done()
      }
    })
  }

  _showInterstitial(pause) {
    if (!ADS_ENABLED) return Promise.resolve(false)
    return this.#break('next', pause)
  }

  _showRewarded(pause) {
    return this.#break('reward', pause)
  }
}
