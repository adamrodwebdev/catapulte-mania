import { Guard, deepFreeze } from '../../core/utils/Guard.js'

/**
 * Améliorations achetables à l'atelier avec l'or gagné en jouant.
 *
 * Deux familles :
 *  - Upgrade   : améliore la catapulte, par niveaux successifs (effet en jeu) ;
 *  - Cosmetic  : change l'apparence seulement (aucun effet sur la difficulté).
 *
 * Toutes les valeurs sont gelées : impossible de modifier un prix ou un effet
 * depuis la console. Les effets sont lus par GameSession via `effectsOf()`.
 */
export class Upgrade {
  /**
   * @param {{ id: string, icon: string, costs: number[], effect: (level: number) => object }} def
   */
  constructor({ id, icon, costs, effect }) {
    this.id = Guard.string(id, 'upgrade id', { pattern: /^[a-z]+$/ })
    this.icon = icon
    this.costs = Object.freeze(costs.map((c) => Guard.int(c, 'cost', { min: 1, max: 100000 })))
    this.effect = effect
    Object.freeze(this)
  }

  get maxLevel() {
    return this.costs.length
  }

  /** Prix du prochain niveau, ou null si le maximum est atteint. */
  nextCost(level) {
    return level < this.maxLevel ? this.costs[level] : null
  }

  /** Or total dépensé pour atteindre `level`. */
  spentFor(level) {
    return this.costs.slice(0, level).reduce((a, b) => a + b, 0)
  }
}

export class Cosmetic {
  /** @param {{ id: string, slot: 'skin' | 'trail', cost: number }} def */
  constructor({ id, slot, cost }) {
    this.id = Guard.string(id, 'cosmetic id', { pattern: /^[a-z]+$/ })
    this.slot = Guard.oneOf(slot, ['skin', 'trail'], 'cosmetic slot')
    this.cost = Guard.int(cost, 'cost', { min: 0, max: 100000 })
    Object.freeze(this)
  }
}

const UPGRADES = Object.freeze([
  // Bras renforcé : vitesse de lancer +7 % par niveau (énergie de choc +15 % environ).
  new Upgrade({ id: 'arm', icon: 'fist', costs: [150, 320, 550], effect: (l) => ({ speedFactor: 1 + 0.07 * l }) }),
  // Boulets lestés : projectiles +20 % plus lourds par niveau.
  new Upgrade({ id: 'ballast', icon: 'target', costs: [120, 260, 450], effect: (l) => ({ massFactor: 1 + 0.2 * l }) }),
  // Réserve : +1 munition spéciale de chaque type proposé par le niveau.
  new Upgrade({ id: 'quiver', icon: 'volley', costs: [200, 480], effect: (l) => ({ extraAmmo: l }) }),
  // Stratège : les pouvoirs coûtent 15 % de points en moins par niveau.
  new Upgrade({ id: 'tactics', icon: 'flame', costs: [180, 380], effect: (l) => ({ powerCostFactor: 1 - 0.15 * l }) }),
  // Éclaireur : un tir supplémentaire à chaque niveau.
  new Upgrade({ id: 'scout', icon: 'map', costs: [650], effect: (l) => ({ extraShots: l }) }),
])

const COSMETICS = Object.freeze([
  new Cosmetic({ id: 'oak', slot: 'skin', cost: 0 }),
  new Cosmetic({ id: 'royal', slot: 'skin', cost: 250 }),
  new Cosmetic({ id: 'ebony', slot: 'skin', cost: 400 }),
  new Cosmetic({ id: 'dragon', slot: 'skin', cost: 650 }),
  new Cosmetic({ id: 'smoke', slot: 'trail', cost: 0 }),
  new Cosmetic({ id: 'embers', slot: 'trail', cost: 200 }),
  new Cosmetic({ id: 'stars', slot: 'trail', cost: 320 }),
])

/** Effets neutres (aucune amélioration). */
export const NO_EFFECTS = deepFreeze({ speedFactor: 1, massFactor: 1, extraAmmo: 0, powerCostFactor: 1, extraShots: 0, skin: 'oak', trail: 'smoke' })

export class UpgradeCatalog {
  static upgrades() {
    return UPGRADES
  }

  static cosmetics() {
    return COSMETICS
  }

  static upgrade(id) {
    Guard.oneOf(id, UPGRADES.map((u) => u.id), 'upgrade id')
    return UPGRADES.find((u) => u.id === id)
  }

  static cosmetic(id) {
    Guard.oneOf(id, COSMETICS.map((c) => c.id), 'cosmetic id')
    return COSMETICS.find((c) => c.id === id)
  }

  /** Cosmétiques possédés d'office. */
  static defaults() {
    return COSMETICS.filter((c) => c.cost === 0).map((c) => c.id)
  }

  /**
   * Effets cumulés pour un profil.
   * @param {Record<string, number>} levels niveau acheté de chaque amélioration
   * @param {{ skin?: string, trail?: string }} [equipped]
   */
  static effectsOf(levels = {}, equipped = {}) {
    const out = { ...NO_EFFECTS }
    for (const u of UPGRADES) {
      const l = levels[u.id] || 0
      if (l > 0) Object.assign(out, u.effect(Math.min(l, u.maxLevel)))
    }
    if (equipped.skin) out.skin = equipped.skin
    if (equipped.trail) out.trail = equipped.trail
    return Object.freeze(out)
  }
}
