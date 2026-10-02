import { Guard } from '../../core/utils/Guard.js'

/**
 * Pouvoir spécial (classe de base).
 *
 * Règles :
 *  - un pouvoir se débloque en réussissant un certain nombre de niveaux ;
 *  - un seul pouvoir par tour (par tir) ;
 *  - chaque utilisation retire `cost` points au score du niveau.
 *
 * Deux familles :
 *  - pouvoirs de tir : ils modifient le prochain projectile (`modifyShot`) ;
 *  - pouvoirs immédiats : ils agissent tout de suite sur la scène (`activate`).
 */
export class Power {
  /**
   * @param {{ id: string, unlockAfter: number, cost: number, icon: string, immediate?: boolean }} def
   */
  constructor({ id, unlockAfter, cost, icon, immediate = false }) {
    this.id = Guard.string(id, 'power id', { pattern: /^[a-z]+$/ })
    this.unlockAfter = Guard.int(unlockAfter, 'unlockAfter', { min: 0, max: 100 })
    this.cost = Guard.int(cost, 'cost', { min: 0, max: 5000 })
    this.icon = icon
    this.immediate = immediate
    Object.freeze(this)
  }

  /** @param {number} completedLevels */
  isUnlocked(completedLevels) {
    return completedLevels >= this.unlockAfter
  }

  /**
   * Modifie le tir à venir.
   * @param {{ mods: object, count: number, windOverride: number | null }} _shot
   */
  modifyShot(_shot) {}

  /** Effet immédiat (pouvoirs `immediate`). */
  activate(_session) {}
}
