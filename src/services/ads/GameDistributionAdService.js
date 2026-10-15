import { AdService } from './AdService.js'
import { AdPolicy } from './AdPolicy.js'
import { loadScript, SDK_URLS } from './loadScript.js'
import { ADS_ENABLED, PORTAL_IDS } from '../../config/gameConfig.js'

/**
 * GameDistribution (SDK HTML5, v5.6) : interstitiels entre les niveaux et
 * vidéos récompensées. Le portail pilote la partie par ses événements :
 * SDK_GAME_PAUSE (couper le son, figer la partie), SDK_GAME_START (reprendre),
 * SDK_REWARDED_WATCH_COMPLETE (vidéo vue jusqu'au bout).
 * Documentation : https://github.com/GameDistribution/GD-HTML5/wiki
 *
 * Le gameId vient du tableau de bord GameDistribution (variable CTC_GAME_ID au
 * build). Sans lui, le SDK n'est pas chargé : le jeu tourne sans publicité.
 */
export class GameDistributionAdService extends AdService {
  id = 'gamedistribution'
  #sdk = null
  /** Rappel de la pub en cours (pause), et vidéo récompensée vue en entier. */
  #onPause = null
  #rewarded = false

  constructor() {
    // GameDistribution limite lui-même la fréquence ; on reste raisonnable : 2 min.
    super(new AdPolicy({ minIntervalMs: 120_000, graceLevels: 2 }))
  }

  async init() {
    if (!PORTAL_IDS.gameId) return
    try {
      const ready = new Promise((resolve) => {
        globalThis.GD_OPTIONS = {
          gameId: PORTAL_IDS.gameId,
          onEvent: (event) => {
            const name = event?.name
            if (name === 'SDK_READY') resolve(true)
            else if (name === 'SDK_GAME_PAUSE') this.#onPause?.()
            else if (name === 'SDK_REWARDED_WATCH_COMPLETE') this.#rewarded = true
          },
        }
      })
      await loadScript(SDK_URLS.gamedistribution)
      // Délai maximal : sans réponse du portail, le jeu démarre quand même.
      await Promise.race([ready, new Promise((resolve) => setTimeout(resolve, 8000))])
      const sdk = globalThis.gdsdk
      if (sdk && typeof sdk.showAd === 'function') this.#sdk = sdk
    } catch {
      this.#sdk = null // bloqueur de pub, réseau… : le jeu continue sans
    }
  }

  get rewardedAvailable() {
    return ADS_ENABLED && this.#sdk !== null
  }

  async #show(type, pause) {
    if (!this.#sdk) return false
    let started = false
    this.#onPause = () => {
      started = true
      pause()
    }
    try {
      await (type ? this.#sdk.showAd(type) : this.#sdk.showAd())
    } catch {
      /* pas de pub disponible */
    } finally {
      this.#onPause = null
    }
    return started
  }

  _showInterstitial(pause) {
    if (!ADS_ENABLED) return Promise.resolve(false)
    return this.#show(null, pause)
  }

  async _showRewarded(pause) {
    if (!this.#sdk) return false
    try {
      await this.#sdk.preloadAd('rewarded')
    } catch {
      return false // aucune vidéo disponible
    }
    this.#rewarded = false
    await this.#show('rewarded', pause)
    return this.#rewarded
  }
}
