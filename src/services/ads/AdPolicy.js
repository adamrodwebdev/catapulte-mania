import { Guard } from '../../core/utils/Guard.js'

/**
 * Règles de fréquence des publicités, communes à toutes les plateformes.
 *
 * - Jamais pendant une visée ou un vol : seulement entre deux niveaux.
 * - Pas d'interstitiel avant que le joueur ait terminé `graceLevels` niveaux
 *   dans la session (on ne coupe pas une première découverte).
 * - Au moins `minIntervalMs` (3 min, règle CrazyGames) entre deux interstitiels.
 * - Une vidéo récompensée, choisie par le joueur, repousse le prochain interstitiel.
 * - Le dernier tir contre une vidéo (v6.4) : une fois par niveau et par session, pas à
 *   chaque défaite (règle Playgama : jamais « +1 vie » à chaque vie perdue).
 */
export class AdPolicy {
  #last = -Infinity
  #levels = 0
  /** Niveaux où le dernier tir a déjà été proposé dans cette session. */
  #lastShot = new Set()

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

  /** Le dernier tir contre une vidéo est-il encore proposable pour ce niveau ? */
  canOfferLastShot(level) {
    return !this.#lastShot.has(String(level))
  }

  /** Le dernier tir vient d'être proposé pour ce niveau (vidéo vue ou non). */
  lastShotOffered(level) {
    this.#lastShot.add(String(level))
  }
}
