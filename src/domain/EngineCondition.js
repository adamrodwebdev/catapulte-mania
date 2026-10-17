import { Guard, deepFreeze } from '../core/utils/Guard.js'

/**
 * État de l'engin du joueur (v5.8) : points de vie et avaries.
 *
 * Les pillards qui atteignent l'engin l'endommagent ; passé un seuil, des
 * avaries apparaissent, chacune avec un effet lisible et un remède :
 *
 *  - FEU : l'intensité (1 à 3) monte tant qu'il y a de quoi brûler, puis le
 *    feu s'éteint de lui-même. Plus il est intense, plus il ronge vite
 *    (perte ∝ intensité^1,5). Remède : un seau d'eau (en nombre limité). La
 *    pluie l'affaiblit ; le givre et le feu s'annulent.
 *  - GIVRE : le bras raidi ne tire plus qu'à 70 % de sa puissance, jusqu'au
 *    dégel (quelques secondes, ou tout de suite au contact du feu).
 *  - DÉGÂTS BRUTS : coups de masse et de marteau. Fissuré (puissance × 0,9),
 *    puis disloqué (× 0,78), jusqu'à la fin du niveau.
 *  - ROUILLE : l'eau a un prix. Chaque seau utilisé (et la pluie de l'orage)
 *    ajoute une couche : −4 % de puissance et +12 % de dégâts subis par couche.
 *
 * Plus de points de vie : l'engin est détruit, la partie est perdue.
 *
 * Module pur et déterministe (aucun hasard, aucune horloge) : la partie le
 * fait avancer pas à pas, ce qui garde les relectures exactes. Les
 * changements d'état sont signalés à `onChange(kind, data)` (sons, sous-titres,
 * annonces pour les lecteurs d'écran).
 */

export const CONDITION = deepFreeze({
  /** Points de vie selon la difficulté. */
  HP: { easy: 130, normal: 100, hard: 80 },
  FIRE: {
    /** Intensité maximale. */
    MAX: 3,
    /** Combustible apporté par un départ de feu (ms) et plafond. */
    FUEL_MS: 8000,
    FUEL_MAX_MS: 16000,
    /** Le feu prend : +intensité par seconde tant qu'il reste du combustible. */
    GROWTH: 0.16,
    /** Puis il retombe, combustible épuisé (par seconde). */
    DECAY: 0.5,
    /** Perte de points de vie par seconde à l'intensité 1 (× intensité^1,5). */
    DPS: 1.3,
    /** Pluie : le feu retombe plus vite et brûle son combustible deux fois plus vite. */
    RAIN_DECAY: 0.25,
  },
  FROST: { MS: 9000, POWER: 0.7 },
  /** Seuils de dégâts bruts cumulés (points de vie) et puissance qui reste. */
  CRACK: { AT: [25, 55], POWER: [1, 0.9, 0.78] },
  RUST: { MAX: 3, POWER: 0.04, VULNERABILITY: 0.12 },
})

/**
 * Frappe d'un pillard sur l'engin (v5.8 ; v6.2 : en table) : selon ce qu'il
 * porte, il l'enflamme (burn : intensité), le gèle, et lui ôte des points de vie.
 */
export const RAID_STRIKE = deepFreeze({
  fire: { burn: 1, hp: 3 },
  frost: { freeze: true, hp: 3 },
  blow: { hp: 9 },
  smash: { hp: 13 },
})

const FIRE = CONDITION.FIRE

export class EngineCondition {
  maxHp
  hp
  /** Intensité du feu (0 = éteint), continue : son niveau affiché est arrondi au supérieur. */
  heat = 0
  /** Combustible restant (ms). */
  fuel = 0
  frozenMs = 0
  /** Dégâts bruts cumulés (coups). */
  wear = 0
  rust = 0
  /** Pluie (chapitre de l'orage). */
  raining = false
  /** @type {(kind: string, data?: object) => void} */
  onChange = () => {}

  /** @param {{ difficulty?: 'easy' | 'normal' | 'hard', maxHp?: number }} [opts] */
  constructor({ difficulty = 'normal', maxHp } = {}) {
    this.maxHp = Guard.number(maxHp ?? CONDITION.HP[difficulty] ?? CONDITION.HP.normal, 'engine hp', { min: 1, max: 1000 })
    this.hp = this.maxHp
  }

  get destroyed() {
    return this.hp <= 0
  }

  /** Niveau de feu affiché : 0 (éteint) à 3. */
  get fireLevel() {
    // Intensité 1 dès qu'il brûle, 2 à partir de 2, 3 à partir de 3.
    return this.heat > 0 ? Math.max(1, Math.min(FIRE.MAX, Math.floor(this.heat + 1e-9))) : 0
  }

  get frozen() {
    return this.frozenMs > 0
  }

  /** Niveau de fissure : 0 (intact), 1 (fissuré), 2 (disloqué). */
  get crackLevel() {
    return CONDITION.CRACK.AT.filter((t) => this.wear >= t).length
  }

  /** Puissance qui reste à l'engin (multiplie sa vitesse de tir). */
  get powerFactor() {
    const frost = this.frozen ? CONDITION.FROST.POWER : 1
    const crack = CONDITION.CRACK.POWER[this.crackLevel]
    const rust = 1 - CONDITION.RUST.POWER * this.rust
    return Math.round(frost * crack * rust * 1000) / 1000
  }

  /** Avaries en cours, pour l'interface. */
  get states() {
    const out = []
    if (this.fireLevel) out.push({ id: 'fire', level: this.fireLevel })
    if (this.frozen) out.push({ id: 'frost', level: 1 })
    if (this.crackLevel) out.push({ id: 'crack', level: this.crackLevel })
    if (this.rust) out.push({ id: 'rust', level: this.rust })
    return out
  }

  /**
   * Coup reçu (masse, marteau, éclats). La rouille rend l'engin plus fragile.
   * @param {number} amount points de vie
   */
  hit(amount) {
    if (this.destroyed || !(amount > 0)) return
    const dmg = amount * (1 + CONDITION.RUST.VULNERABILITY * this.rust)
    const crack = this.crackLevel
    this.wear += amount
    this.#lose(dmg, 'blow')
    if (this.crackLevel > crack) this.onChange('crack', { level: this.crackLevel })
  }

  /**
   * Départ de feu (torche, pot de feu). Sur un engin gelé, le feu ne prend
   * pas : il fait fondre le givre.
   * @param {number} [heat] intensité ajoutée
   */
  ignite(heat = 1) {
    if (this.destroyed) return
    if (this.frozen) {
      this.frozenMs = 0
      this.onChange('thaw', { by: 'fire' })
      return
    }
    const before = this.fireLevel
    this.heat = Math.min(FIRE.MAX, this.heat + heat)
    this.fuel = Math.min(FIRE.FUEL_MAX_MS, this.fuel + FIRE.FUEL_MS)
    if (!before) this.onChange('ignite', { level: this.fireLevel })
    else if (this.fireLevel > before) this.onChange('fireUp', { level: this.fireLevel })
  }

  /** Pot de givre : le bras gèle. Sur un engin en feu, les deux s'annulent (vapeur). */
  freeze(ms = CONDITION.FROST.MS) {
    if (this.destroyed) return
    if (this.heat > 0) {
      this.#douse('frost')
      return
    }
    const was = this.frozen
    this.frozenMs = Math.max(this.frozenMs, ms)
    if (!was) this.onChange('freeze')
  }

  /**
   * Seau d'eau : éteint le feu d'un coup… et ajoute une couche de rouille.
   * @returns {boolean} vrai s'il y avait un feu à éteindre
   */
  douse() {
    if (this.destroyed || !(this.heat > 0)) return false
    this.#douse('water')
    this.addRust()
    return true
  }

  /** Une couche de rouille de plus (eau, pluie). */
  addRust() {
    if (this.destroyed || this.rust >= CONDITION.RUST.MAX) return
    this.rust++
    this.onChange('rust', { level: this.rust })
  }

  /** Avance le temps (ms de simulation). */
  update(dtMs) {
    if (this.destroyed || !(dtMs > 0)) return
    const s = dtMs / 1000
    if (this.frozenMs > 0) {
      this.frozenMs = Math.max(0, this.frozenMs - dtMs)
      if (!this.frozenMs) this.onChange('thaw', { by: 'time' })
    }
    if (this.heat > 0) {
      const level = this.fireLevel
      // Perte : plus le feu est intense, plus il ronge vite.
      this.#lose(FIRE.DPS * Math.pow(this.heat, 1.5) * s, 'fire')
      if (this.destroyed) return
      this.fuel = Math.max(0, this.fuel - dtMs * (this.raining ? 2 : 1))
      if (this.fuel > 0) this.heat = Math.min(FIRE.MAX, this.heat + FIRE.GROWTH * s)
      else this.heat = Math.max(0, this.heat - FIRE.DECAY * s)
      if (this.raining) this.heat = Math.max(0, this.heat - FIRE.RAIN_DECAY * s)
      if (this.heat <= 0) {
        this.heat = 0
        this.fuel = 0
        this.onChange('burnedOut')
      } else if (this.fireLevel > level) this.onChange('fireUp', { level: this.fireLevel })
    }
  }

  #douse(by) {
    this.heat = 0
    this.fuel = 0
    this.onChange('extinguish', { by })
  }

  #lose(amount, cause) {
    this.hp = Math.max(0, this.hp - amount)
    if (this.hp <= 0) {
      this.heat = 0
      this.fuel = 0
      this.onChange('destroyed', { cause })
    }
  }
}
