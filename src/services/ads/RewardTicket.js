import { Guard } from '../../core/utils/Guard.js'

/** Récompenses qu'une publicité vidéo peut débloquer. */
export const REWARDS = Object.freeze(['extra-shot', 'double-gold'])

/**
 * Ticket de récompense (anti-triche).
 *
 * Une récompense (tir supplémentaire, or doublé) n'est accordée que sur
 * présentation d'un ticket émis par le service de publicité APRÈS une vidéo
 * regardée jusqu'au bout. Les tickets vivants sont rangés dans un WeakMap privé
 * à ce module : un objet fabriqué à la main est refusé, et chaque ticket ne
 * sert qu'une fois, pour la récompense prévue.
 */
const live = new WeakMap()

export class RewardTicket {
  /** @param {string} purpose */
  constructor(purpose) {
    this.purpose = Guard.oneOf(purpose, REWARDS, 'reward')
    Object.freeze(this)
  }

  /** Réservé aux services de publicité. */
  static issue(purpose) {
    const ticket = new RewardTicket(purpose)
    live.set(ticket, purpose)
    return ticket
  }

  /**
   * Consomme un ticket. Vrai une seule fois, et seulement pour la bonne récompense.
   * @param {unknown} ticket
   * @param {string} purpose
   */
  static redeem(ticket, purpose) {
    if (!(ticket instanceof RewardTicket) || live.get(ticket) !== purpose) return false
    live.delete(ticket)
    return true
  }
}
