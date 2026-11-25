/** Ce que la garde a décidé pour cet appareil, gardé pour les parties suivantes de la visite. */
let remembered = 0

/**
 * Garde de fluidité (v6.4) : moyenne glissante du temps d'une image. Un appareil
 * qui peine (moins de ~45 images/s en continu) perd d'abord des particules
 * (niveau 1) ; s'il peine encore quelques secondes, le ciel vivant se fige
 * (niveau 2 : la peinture reste, immobile). On ne revient jamais en arrière
 * pendant la visite : pas de va-et-vient visible, et la partie suivante part
 * directement du bon niveau.
 */
export class FrameGuard {
  #avg
  #slowMs = 0
  level = remembered

  /**
   * @param {{ threshold?: number, holdMs?: number, start?: number }} [opts]
   *   threshold : temps d'image moyen (ms) au-delà duquel l'appareil peine ;
   *   holdMs : durée cumulée de peine avant de figer le ciel ; start : moyenne de départ (ms)
   */
  constructor({ threshold = 22, holdMs = 2500, start = 16.7 } = {}) {
    this.threshold = threshold
    this.holdMs = holdMs
    this.#avg = start
  }

  /** Temps d'image moyen (ms). */
  get average() {
    return this.#avg
  }

  /**
   * @param {number} dt durée de la dernière image (ms ; plafonnée : un onglet caché ne compte pas)
   * @returns {number} niveau : 0 tout, 1 moins de particules, 2 ciel vivant figé
   */
  update(dt) {
    const d = Math.min(Math.max(0, dt), 100)
    this.#avg = this.#avg * 0.97 + d * 0.03
    const slow = this.#avg > this.threshold
    this.#slowMs = slow ? this.#slowMs + d : Math.max(0, this.#slowMs - d)
    if (slow && this.level < 1) this.level = 1
    if (this.level === 1 && this.#slowMs >= this.holdMs) this.level = 2
    remembered = Math.max(remembered, this.level)
    return this.level
  }

  /** Oublie la décision de la visite (tests). */
  static reset() {
    remembered = 0
  }
}
