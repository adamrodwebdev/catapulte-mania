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
 *
 * v5.6.1 : la liste de contrôle d'intégration GamePix vérifie aussi
 * updateScore (à chaque changement de score), updateLevel (niveau réussi),
 * lang (lu une fois au démarrage) et happyMoment (record, premier passage).
 * v5.6.2 : GamePix décide lui-même de montrer ou non une publicité à chaque
 * appel d'interstitialAd (« Not every single interstitialAd() will trigger an
 * ad ») : on l'appelle à chaque passage entre deux niveaux, sans délai de
 * grâce. GamePix.loaded() renvoie une promesse : aucune pub avant sa fin.
 */
export class GamePixAdService extends AdService {
  id = 'gamepix'
  #sdk = null
  #loaded = false
  #started = false
  #lang = null
  #score = -1

  constructor() {
    super(new AdPolicy({ minIntervalMs: 0, graceLevels: 0 }))
  }

  async init() {
    try {
      if (!globalThis.GamePix) await loadScript(SDK_URLS.gamepix)
      const sdk = globalThis.GamePix
      if (!sdk) return
      this.#sdk = sdk
      sdk.loading?.(50)
      // Langue lue une fois, dès le démarrage (même si le joueur a déjà choisi la sienne).
      try {
        const lang = sdk.lang?.()
        this.#lang = typeof lang === 'string' && /^[a-z]{2}([-_][a-z]{2})?$/i.test(lang) ? lang.slice(0, 2).toLowerCase() : null
      } catch {
        this.#lang = null
      }
    } catch {
      this.#sdk = null
    }
  }

  get rewardedAvailable() {
    return ADS_ENABLED && this.#sdk !== null && typeof this.#sdk.rewardAd === 'function'
  }

  get locale() {
    return this.#lang
  }

  /** Stockage du portail (même interface que localStorage, valeurs texte). */
  get cloudStorage() {
    const s = this.#sdk?.localStorage
    return s && ['getItem', 'setItem', 'removeItem'].every((fn) => typeof s[fn] === 'function') ? s : null
  }

  loadingFinished() {
    if (!this.#sdk || this.#started) return
    this.#started = true
    const ready = () => {
      this.#loaded = true
      this.reportScore(0)
    }
    try {
      this.#sdk.loading?.(100)
      const p = this.#sdk.loaded?.()
      // loaded() renvoie une promesse dans le SDK v3 : on attend sa fin (échec : on continue).
      if (p && typeof p.then === 'function') p.then(ready, ready)
      else ready()
    } catch {
      ready()
    }
  }

  /** Vrai quand GamePix.loaded() est terminé (publicités et statistiques permises). */
  get ready() {
    return this.#loaded
  }

  happytime() {
    if (!this.#loaded) return
    try {
      this.#sdk?.happyMoment?.()
    } catch {
      /* rien */
    }
  }

  reportScore(score) {
    if (!this.#loaded || !Number.isSafeInteger(score) || score < 0 || score === this.#score) return
    this.#score = score
    try {
      this.#sdk?.updateScore?.(score)
    } catch {
      /* rien */
    }
  }

  reportLevel(level) {
    if (!this.#loaded || !Number.isSafeInteger(level) || level < 1) return
    try {
      this.#sdk?.updateLevel?.(level)
    } catch {
      /* rien */
    }
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
