import { EventBus } from '../../core/utils/EventBus.js'
import { AdPolicy } from './AdPolicy.js'
import { RewardTicket } from './RewardTicket.js'

/**
 * Service de publicité et de plateforme (patron Adaptateur).
 *
 * Le jeu ne connaît que cette interface ; chaque portail a sa sous-classe
 * (CrazyGamesAdService, PokiAdService), chargée seulement dans le build de ce
 * portail. Le build de notre site utilise NoAdService : aucun script tiers.
 *
 * Événements : `pause` (une pub commence : couper le son, bloquer les commandes)
 * et `resume` (elle est finie ou a échoué).
 */
export class AdService extends EventBus {
  /** Identifiant de la plateforme. */
  id = 'none'
  #busy = false

  /** @param {AdPolicy} [policy] */
  constructor(policy = new AdPolicy()) {
    super()
    this.policy = policy
  }

  /** Des vidéos récompensées peuvent-elles être proposées ? */
  get rewardedAvailable() {
    return false
  }

  /** Une pub est-elle en cours ? */
  get busy() {
    return this.#busy
  }

  /** Initialise le SDK (sans jamais échouer : le jeu continue sans pub). */
  async init() {}

  /** Le jeu est chargé et prêt. */
  loadingFinished() {}
  /** Le joueur commence ou reprend une partie. */
  gameplayStart() {}
  /** Le joueur quitte la partie (fin, pause, menu). */
  gameplayStop() {}

  /** Stockage synchronisé de la plateforme (interface de localStorage) ou null. */
  get cloudStorage() {
    return null
  }

  /**
   * Interstitiel entre deux niveaux, si les règles de fréquence le permettent.
   * @returns {Promise<boolean>} une pub a-t-elle été montrée ?
   */
  async interstitial() {
    this.policy.levelDone()
    if (this.#busy || !this.policy.canInterstitial()) return false
    const shown = await this.#wrap((pause) => this._showInterstitial(pause))
    if (shown) this.policy.shown()
    return shown
  }

  /**
   * Vidéo récompensée, à la demande du joueur.
   * @param {string} purpose récompense visée (voir REWARDS)
   * @returns {Promise<RewardTicket | null>} ticket si la vidéo a été vue en entier
   */
  async rewarded(purpose) {
    if (this.#busy || !this.rewardedAvailable) return null
    const ok = await this.#wrap((pause) => this._showRewarded(pause))
    this.policy.shown()
    return ok ? RewardTicket.issue(purpose) : null
  }

  async #wrap(show) {
    this.#busy = true
    let paused = false
    const pause = () => {
      if (!paused) this.emit('pause')
      paused = true
    }
    try {
      return (await show(pause)) === true
    } catch {
      return false
    } finally {
      this.#busy = false
      if (paused) this.emit('resume')
    }
  }

  /* À fournir par les sous-classes. `pause` doit être appelé au début de la pub. */
  /** @returns {Promise<boolean>} */
  async _showInterstitial() {
    return false
  }
  /** @returns {Promise<boolean>} vidéo vue jusqu'au bout */
  async _showRewarded() {
    return false
  }
}

/** Notre site et la démo : aucune publicité, aucun script tiers. */
export class NoAdService extends AdService {}
