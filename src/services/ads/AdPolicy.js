import { Guard } from '../../core/utils/Guard.js'

/**
 * Règles de fréquence des publicités, communes à toutes les plateformes.
 *
 * - Jamais pendant une visée ou un vol : seulement entre deux niveaux.
 * - Pas d'interstitiel avant que le joueur ait terminé `graceLevels` niveaux
 *   dans la session (on ne coupe pas une première découverte).
 * - Au moins `minIntervalMs` (3 min, règle CrazyGames) entre deux interstitiels.
 * - Une vidéo récompensée, choisie par le joueur, repousse le prochain interstitiel.
 */
export class AdPolicy {
  #last = -Infinity
  #levels = 0

  /**
   * @param {{ minIntervalMs?: number, graceLevels?: number, now?: () => number }} [opts]
   */
  constructor({ minIntervalMs = 180_000, graceLevels = 2, now = () => Date.now() } = {}) {
    this.minIntervalMs = Guard.int(minIntervalMs, 'minIntervalMs', { min: 0, max: 3_600_000 })
    this.graceLevels = Guard.int(graceLevels, 'graceLevels', { min: 0, max: 100 })
    this.now = now
  }

  /** Un niveau vient de se terminer (gagné ou perdu). */
  levelDone() {
    this.#levels++
  }

  /** Peut-on montrer un interstitiel maintenant ? */
  canInterstitial() {
    return this.#levels >= this.graceLevels && this.now() - this.#last >= this.minIntervalMs
  }

  /** Une publicité (quelle qu'elle soit) vient d'être montrée. */
  shown() {
    this.#last = this.now()
  }
}
