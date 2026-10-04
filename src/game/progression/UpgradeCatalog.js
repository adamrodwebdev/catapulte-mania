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
   * @param {{ id: string, icon: string, costs: number[], stars: number[], effect: (level: number) => object }} def
   *   `stars[i]` : étoiles de campagne exigées pour acheter le niveau i+1
   */
  constructor({ id, icon, costs, stars, effect }) {
    this.id = Guard.string(id, 'upgrade id', { pattern: /^[a-z]+$/ })
    this.icon = icon
    this.costs = Object.freeze(costs.map((c) => Guard.int(c, 'cost', { min: 1, max: 100000 })))
    this.stars = Object.freeze(stars.map((n) => Guard.int(n, 'stars', { min: 0, max: 300 })))
    if (this.stars.length !== this.costs.length) throw new Error(`upgrade ${id}: stars/costs mismatch`)
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

  /** Étoiles exigées pour le prochain niveau (null si maximum atteint). */
  nextStars(level) {
    return level < this.maxLevel ? this.stars[level] : null
  }

  /** Or total dépensé pour atteindre `level`. */
  spentFor(level) {
    return this.costs.slice(0, level).reduce((a, b) => a + b, 0)
  }
}

export class Cosmetic {
  /** @param {{ id: string, slot: 'skin' | 'trail', cost: number, event?: string | null }} def */
  constructor({ id, slot, cost, event = null }) {
    this.id = Guard.string(id, 'cosmetic id', { pattern: /^[a-z]+$/ })
    this.slot = Guard.oneOf(slot, ['skin', 'trail'], 'cosmetic slot')
    this.cost = Guard.int(cost, 'cost', { min: 0, max: 100000 })
    /** Cosmétique d'événement (v4.0) : ne s'achète pas, il se gagne pendant l'événement. */
    this.event = event === null ? null : Guard.oneOf(event, ['halloween', 'winter'], 'cosmetic event')
    Object.freeze(this)
  }
}

/*
 * v3.1 : améliorations plus puissantes mais bien plus rares.
 * L'or ne vient plus de la répétition (voir GoldRules) : il récompense étoiles
 * et succès. Chaque palier exige en plus un nombre d'étoiles de campagne, si
 * bien qu'on ne peut pas tout acheter : il faut choisir son style de jeu
 * (puissance brute, munitions, feu, poudre, tactique).
 */
const UPGRADES = Object.freeze([
  // Bras renforcé : vitesse de lancer +7 % par niveau (énergie de choc +15 % environ).
  new Upgrade({ id: 'arm', icon: 'fist', costs: [300, 700, 1300, 2200], stars: [0, 30, 90, 180], effect: (l) => ({ speedFactor: 1 + 0.07 * l }) }),
  // Boulets lestés : projectiles +20 % plus lourds par niveau.
  new Upgrade({ id: 'ballast', icon: 'target', costs: [250, 600, 1100, 1900], stars: [0, 25, 80, 170], effect: (l) => ({ massFactor: 1 + 0.2 * l }) }),
  // Poix : le feu grégeois embrase une zone plus large (+35 % par niveau).
  new Upgrade({ id: 'pitch', icon: 'flame', costs: [350, 900, 1600], stars: [10, 50, 120], effect: (l) => ({ fireFactor: 1 + 0.35 * l }) }),
  // Poudre fine : explosions plus larges et plus destructrices (+15 % par niveau).
  new Upgrade({ id: 'powder', icon: 'bomb', costs: [450, 1100, 2000], stars: [20, 70, 150], effect: (l) => ({ blastFactor: 1 + 0.15 * l }) }),
  // Réserve : +1 munition spéciale de chaque type proposé par le niveau.
  new Upgrade({ id: 'quiver', icon: 'volley', costs: [500, 1200, 2200], stars: [15, 60, 140], effect: (l) => ({ extraAmmo: l }) }),
  // Stratège : les pouvoirs coûtent 15 % de points en moins par niveau.
  new Upgrade({ id: 'tactics', icon: 'crown', costs: [400, 1000], stars: [10, 60], effect: (l) => ({ powerCostFactor: 1 - 0.15 * l }) }),
  // Éclaireur : un tir supplémentaire à chaque niveau.
  new Upgrade({ id: 'scout', icon: 'map', costs: [1500, 3500], stars: [60, 200], effect: (l) => ({ extraShots: l }) }),
])

const COSMETICS = Object.freeze([
  new Cosmetic({ id: 'oak', slot: 'skin', cost: 0 }),
  new Cosmetic({ id: 'royal', slot: 'skin', cost: 250 }),
  new Cosmetic({ id: 'ebony', slot: 'skin', cost: 400 }),
  new Cosmetic({ id: 'dragon', slot: 'skin', cost: 650 }),
  new Cosmetic({ id: 'smoke', slot: 'trail', cost: 0 }),
  new Cosmetic({ id: 'embers', slot: 'trail', cost: 200 }),
  new Cosmetic({ id: 'stars', slot: 'trail', cost: 320 }),
  // Événements saisonniers (v4.0) : offerts, jamais vendus.
  new Cosmetic({ id: 'pumpkin', slot: 'trail', cost: 0, event: 'halloween' }),
  new Cosmetic({ id: 'snow', slot: 'trail', cost: 0, event: 'winter' }),
])

/** Effets neutres (aucune amélioration). */
export const NO_EFFECTS = deepFreeze({ speedFactor: 1, massFactor: 1, fireFactor: 1, blastFactor: 1, extraAmmo: 0, powerCostFactor: 1, extraShots: 0, skin: 'oak', trail: 'smoke' })

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
    return COSMETICS.filter((c) => c.cost === 0 && !c.event).map((c) => c.id)
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
