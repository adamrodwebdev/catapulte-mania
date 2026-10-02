import { Schema, Guard, ValidationError } from '../core/utils/Guard.js'
import { GAME } from '../config/gameConfig.js'
import { LevelResult } from './LevelResult.js'
import { UpgradeCatalog } from '../game/progression/UpgradeCatalog.js'
import { GOLD, goldFor, maxGoldFor, legacyMaxGoldFor } from '../game/progression/GoldRules.js'
import { countAchievements } from '../game/progression/Achievements.js'

/** Nom de profil : lettres (toutes langues), chiffres, espaces, tirets. */
export const PROFILE_NAME = /^[\p{L}\p{N}][\p{L}\p{N} _'-]{0,15}$/u
const LEVEL_KEY = /^(?:[1-9]|[1-9][0-9]|100)$/
const COUNTER = Schema.int({ min: 0, max: 1e9 })

const GOLD_INT = Schema.int({ min: 0, max: GOLD.MAX_BALANCE })
const COSMETIC_IDS = UpgradeCatalog.cosmetics().map((c) => c.id)

/** Schéma de la sauvegarde (version 4). Toute clé inconnue est refusée. */
export const saveSchema = Schema.object({
  version: Schema.enum([GAME.SAVE_VERSION]),
  name: Schema.string({ minLength: 1, maxLength: 16, pattern: PROFILE_NAME }),
  difficulty: Schema.enum(GAME.DIFFICULTIES),
  createdAt: Schema.int({ min: 0, max: 8.64e15 }),
  updatedAt: Schema.int({ min: 0, max: 8.64e15 }),
  levels: Schema.record(
    LEVEL_KEY,
    Schema.object({
      stars: Schema.int({ min: 0, max: 3 }),
      best: Schema.int({ min: 0, max: GAME.MAX_LEVEL_SCORE }),
      attempts: Schema.int({ min: 0, max: 1e6 }),
      // v3 : moins de tirs utilisés pour gagner (0 = inconnu, profil antérieur à la v3.1)
      shots: Schema.int({ min: 0, max: 100 }),
      // v3 : succès obtenus (masque de 3 bits)
      ach: Schema.int({ min: 0, max: 7 }),
    }),
    { maxKeys: GAME.LEVEL_COUNT },
  ),
  stats: Schema.object({
    shots: COUNTER,
    targets: COUNTER,
    blocks: COUNTER,
    barrels: COUNTER,
    powers: COUNTER,
  }),
  // v2 : économie (or gagné en jouant, améliorations, apparences).
  gold: GOLD_INT,
  goldEarned: GOLD_INT,
  // v3 : or gagné avec l'ancien barème (profils migrés), contrôlé séparément.
  legacyGold: GOLD_INT,
  upgrades: Schema.record(/^[a-z]{2,12}$/, Schema.int({ min: 0, max: 5 }), { maxKeys: 10 }),
  cosmetics: Schema.object({
    owned: Schema.array(Schema.enum(COSMETIC_IDS), { maxLength: COSMETIC_IDS.length }),
    skin: Schema.enum(COSMETIC_IDS),
    trail: Schema.enum(COSMETIC_IDS),
  }),
})

/**
 * Migration des anciennes sauvegardes (avant validation du schéma).
 * v1 → v2 : ajout de l'économie, vide.
 * v2 → v3 : étoiles au nombre de tirs et succès. Les améliorations, dont les
 *           prix ont changé, sont remboursées ; l'or déjà gagné est conservé
 *            (et contrôlé selon l'ancien barème).
 * v3 → v4 : succès renouvelés (masques remis à zéro, or conservé).
 * @param {any} raw
 */
export function migrateSave(raw) {
  let save = raw
  if (save && typeof save === 'object' && save.version === 1) {
    save = { ...save, version: 2, gold: 0, goldEarned: 0, upgrades: {}, cosmetics: { owned: UpgradeCatalog.defaults(), skin: 'oak', trail: 'smoke' } }
  }
  if (save && typeof save === 'object' && save.version === 2 && save.levels && typeof save.levels === 'object' && save.cosmetics) {
    const levels = {}
    for (const [id, rec] of Object.entries(save.levels)) levels[id] = { ...rec, shots: 0, ach: 0 }
    const owned = Array.isArray(save.cosmetics.owned) ? save.cosmetics.owned : []
    const cosmeticSpend = owned.reduce((sum, id) => sum + (COSMETIC_IDS.includes(id) ? UpgradeCatalog.cosmetic(id).cost : 0), 0)
    const earned = Number.isInteger(save.goldEarned) ? save.goldEarned : 0
    save = { ...save, version: 3, levels, upgrades: {}, legacyGold: earned, gold: Math.max(0, earned - cosmeticSpend) }
  }
  if (save && typeof save === 'object' && save.version === 3 && save.levels && typeof save.levels === 'object') {
    // v3 → v4 : les défis ont été renouvelés (18 au lieu de 8), les anciens
    // masques ne correspondent plus ; tout l'or déjà gagné devient « hérité ».
    const levels = {}
    for (const [id, rec] of Object.entries(save.levels)) levels[id] = rec && typeof rec === 'object' ? { ...rec, ach: 0 } : rec
    save = { ...save, version: 4, levels, legacyGold: Number.isInteger(save.goldEarned) ? save.goldEarned : 0 }
  }
  return save
}

/**
 * Profil de joueur : progression, meilleurs scores et statistiques.
 * Les valeurs dérivées (score total, étoiles, pouvoirs débloqués) ne sont
 * jamais stockées : elles sont recalculées à partir des niveaux réussis.
 */
export class SaveSlot {
  #index
  #data

  /**
   * @param {number} index numéro d'emplacement (0..2)
   * @param {object} data données déjà validées par `saveSchema`
   */
  constructor(index, data) {
    this.#index = Guard.int(index, 'slot index', { min: 0, max: GAME.SAVE_SLOTS - 1 })
    this.#data = data
  }

  /** Crée un profil vierge. */
  static create(index, name, difficulty, now = Date.now()) {
    const data = saveSchema({
      version: GAME.SAVE_VERSION,
      name: String(name).trim(),
      difficulty,
      createdAt: now,
      updatedAt: now,
      levels: {},
      stats: { shots: 0, targets: 0, blocks: 0, barrels: 0, powers: 0 },
      gold: 0,
      goldEarned: 0,
      legacyGold: 0,
      upgrades: {},
      cosmetics: { owned: UpgradeCatalog.defaults(), skin: 'oak', trail: 'smoke' },
    })
    return new SaveSlot(index, data)
  }

  /**
   * Reconstruit un profil depuis des données non fiables et vérifie leur cohérence.
   * @param {number} index
   * @param {unknown} raw
   * @param {(levelId: number, rec: { best: number, stars: number, shots: number }) => number | void} [checkRecord]
   *   contrôle métier optionnel (score possible) ; s'il renvoie un nombre,
   *   c'est le nombre d'étoiles recalculé pour ce niveau
   */
  static fromJSON(index, raw, checkRecord) {
    const data = saveSchema(migrateSave(raw), 'save')
    // Progression continue : on ne peut pas avoir réussi le niveau N sans le niveau N-1.
    const done = Object.keys(data.levels).map(Number).sort((a, b) => a - b)
    done.forEach((id, i) => {
      if (id !== i + 1) throw new ValidationError(`save.levels.${id}`, 'progression gap')
      const rec = data.levels[id]
      if (rec.attempts < 1) throw new ValidationError(`save.levels.${id}`, 'no attempt recorded')
      if (checkRecord) {
        const stars = checkRecord(id, { best: rec.best, stars: rec.stars, shots: rec.shots })
        if (Number.isInteger(stars)) rec.stars = stars
      }
    })
    if (data.updatedAt < data.createdAt) throw new ValidationError('save.updatedAt', 'before creation')
    SaveSlot.#checkEconomy(data)
    return new SaveSlot(index, data)
  }

  /**
   * Cohérence de l'économie :
   *  - améliorations et apparences connues, niveaux dans les bornes ;
   *  - or restant = or gagné − or dépensé (au centime près) ;
   *  - or gagné ≤ ce que les niveaux joués peuvent avoir rapporté.
   */
  static #checkEconomy(data) {
    let spent = 0
    const stars = Object.values(data.levels).reduce((sum, r) => sum + r.stars, 0)
    for (const [id, level] of Object.entries(data.upgrades)) {
      const u = UpgradeCatalog.upgrade(id)
      if (level > u.maxLevel) throw new ValidationError(`save.upgrades.${id}`, 'level above maximum')
      if (level > 0 && u.stars[level - 1] > stars) throw new ValidationError(`save.upgrades.${id}`, 'not enough stars')
      spent += u.spentFor(level)
    }
    const owned = new Set(data.cosmetics.owned)
    if (owned.size !== data.cosmetics.owned.length) throw new ValidationError('save.cosmetics.owned', 'duplicate')
    for (const id of UpgradeCatalog.defaults()) if (!owned.has(id)) throw new ValidationError('save.cosmetics.owned', 'default missing')
    for (const id of owned) spent += UpgradeCatalog.cosmetic(id).cost
    for (const slot of ['skin', 'trail']) {
      const id = data.cosmetics[slot]
      if (!owned.has(id) || UpgradeCatalog.cosmetic(id).slot !== slot) throw new ValidationError(`save.cosmetics.${slot}`, 'not owned')
    }
    if (data.goldEarned - spent !== data.gold) throw new ValidationError('save.gold', 'balance mismatch')
    if (data.legacyGold > legacyMaxGoldFor(data.levels)) throw new ValidationError('save.legacyGold', 'more gold than possible')
    if (data.goldEarned > data.legacyGold + maxGoldFor(data.levels)) throw new ValidationError('save.goldEarned', 'more gold than possible')
  }

  get index() {
    return this.#index
  }
  get name() {
    return this.#data.name
  }
  get difficulty() {
    return this.#data.difficulty
  }
  set difficulty(value) {
    this.#data.difficulty = Guard.oneOf(value, GAME.DIFFICULTIES, 'difficulty')
  }
  get updatedAt() {
    return this.#data.updatedAt
  }
  get stats() {
    return { ...this.#data.stats }
  }

  /* ----- Économie ----- */

  get gold() {
    return this.#data.gold
  }

  /** Niveau acheté de chaque amélioration. */
  get upgrades() {
    return { ...this.#data.upgrades }
  }

  get cosmetics() {
    return { owned: [...this.#data.cosmetics.owned], skin: this.#data.cosmetics.skin, trail: this.#data.cosmetics.trail }
  }

  /** Effets en jeu des améliorations et apparences équipées. */
  get effects() {
    return UpgradeCatalog.effectsOf(this.#data.upgrades, this.#data.cosmetics)
  }

  /**
   * Achète le niveau suivant d'une amélioration.
   * @returns {boolean} faux si or ou étoiles insuffisants, ou maximum atteint
   */
  buyUpgrade(id) {
    const u = UpgradeCatalog.upgrade(id)
    const level = this.#data.upgrades[id] || 0
    const cost = u.nextCost(level)
    if (cost === null || cost > this.#data.gold || u.nextStars(level) > this.starCount) return false
    this.#data.gold -= cost
    this.#data.upgrades[id] = level + 1
    return true
  }

  /** Achète une apparence. */
  buyCosmetic(id) {
    const c = UpgradeCatalog.cosmetic(id)
    if (this.#data.cosmetics.owned.includes(id) || c.cost > this.#data.gold) return false
    this.#data.gold -= c.cost
    this.#data.cosmetics.owned.push(id)
    return true
  }

  /** Équipe une apparence possédée. */
  equip(id) {
    const c = UpgradeCatalog.cosmetic(id)
    if (!this.#data.cosmetics.owned.includes(id)) return false
    this.#data.cosmetics[c.slot] = id
    return true
  }

  /** @returns {{ stars: number, best: number, attempts: number, shots: number, ach: number } | null} */
  levelRecord(levelId) {
    const rec = this.#data.levels[levelId]
    return rec ? { ...rec } : null
  }

  isCompleted(levelId) {
    return Boolean(this.#data.levels[levelId])
  }

  isUnlocked(levelId) {
    Guard.int(levelId, 'levelId', { min: 1, max: GAME.LEVEL_COUNT })
    return levelId === 1 || this.isCompleted(levelId - 1)
  }

  get completedCount() {
    return Object.keys(this.#data.levels).length
  }

  get totalScore() {
    return Object.values(this.#data.levels).reduce((sum, r) => sum + r.best, 0)
  }

  get starCount() {
    return Object.values(this.#data.levels).reduce((sum, r) => sum + r.stars, 0)
  }

  /** Nombre total de succès obtenus (3 par niveau au maximum). */
  get achievementCount() {
    return Object.values(this.#data.levels).reduce((sum, r) => sum + countAchievements(r.ach), 0)
  }

  /** Prochain niveau à jouer (le premier non réussi). */
  get nextLevel() {
    return Math.min(this.completedCount + 1, GAME.LEVEL_COUNT)
  }

  /**
   * Enregistre le résultat d'une partie. N'accepte que les résultats authentiques
   * émis par le moteur de score et n'améliore que le meilleur score.
   * @param {LevelResult} result
   * @returns {{ newBest: boolean, firstClear: boolean, gold: number }}
   */
  recordResult(result, now = Date.now()) {
    if (!LevelResult.isAuthentic(result)) throw new ValidationError('result', 'untrusted result rejected')
    if (!this.isUnlocked(result.levelId)) throw new ValidationError('result', 'level is locked')
    const s = this.#data.stats
    s.shots += result.shotsUsed
    s.targets += result.targetsKilled
    s.blocks += result.blocksDestroyed
    s.barrels += result.barrelsExploded
    s.powers += result.powersUsed
    this.#data.updatedAt = Math.max(now, this.#data.updatedAt)

    const prev = this.#data.levels[result.levelId]
    if (!result.won) {
      if (prev) prev.attempts += 1
      return { newBest: false, firstClear: false, gold: 0, newAchievements: 0 }
    }
    const firstClear = !prev
    const before = prev ?? { stars: 0, ach: 0 }
    const newStars = Math.max(0, result.stars - before.stars)
    const newAchievements = result.achievements & ~before.ach
    const perfect = newAchievements !== 0 && (before.ach | result.achievements) === 7
    const gold = goldFor(result, { firstClear, newStars, newAchievements: countAchievements(newAchievements), perfect })
    this.#data.gold = Math.min(GOLD.MAX_BALANCE, this.#data.gold + gold)
    this.#data.goldEarned = Math.min(GOLD.MAX_BALANCE, this.#data.goldEarned + gold)
    if (firstClear) {
      this.#data.levels[result.levelId] = { stars: result.stars, best: result.score, attempts: 1, shots: Math.max(1, result.shotsUsed), ach: result.achievements }
      return { newBest: true, firstClear: true, gold, newAchievements }
    }
    prev.attempts += 1
    const newBest = result.score > prev.best
    if (newBest) prev.best = result.score
    prev.stars = Math.max(prev.stars, result.stars)
    const shots = Math.max(1, result.shotsUsed)
    prev.shots = prev.shots > 0 ? Math.min(prev.shots, shots) : shots
    prev.ach |= result.achievements
    return { newBest, firstClear: false, gold, newAchievements }
  }

  /** Copie sérialisable (validée à nouveau avant écriture). */
  toJSON() {
    return structuredClone(this.#data)
  }
}
