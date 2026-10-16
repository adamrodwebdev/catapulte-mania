import { Schema, Guard, ValidationError } from '../core/utils/Guard.js'
import { GAME } from '../config/gameConfig.js'
import { LevelResult } from './LevelResult.js'
import { UpgradeCatalog } from '../game/progression/UpgradeCatalog.js'
import { GOLD, goldFor, maxGoldFor, legacyMaxGoldFor } from '../game/progression/GoldRules.js'
import { countAchievements } from '../game/progression/Achievements.js'
import { RewardTicket } from '../services/ads/RewardTicket.js'
import { DAY_KEY, dayNumber, DailyChallenge } from '../game/daily/DailyChallenge.js'
import { EndlessRun } from './EndlessRun.js'
import { eventFor, EVENTS } from '../game/events/Season.js'
import { emptyLogin, loginStatus, claimLogin, checkLogin, LOGIN_CYCLE } from '../game/progression/LoginRewards.js'
import { WEEK_KEY, WeeklyCup, CUP } from '../game/daily/WeeklyCup.js'

/** Nom de profil : lettres (toutes langues), chiffres, espaces, tirets. */
export const PROFILE_NAME = /^[\p{L}\p{N}][\p{L}\p{N} _'-]{0,15}$/u
const LEVEL_KEY = /^(?:[1-9]|[1-9][0-9]|100)$/
const COUNTER = Schema.int({ min: 0, max: 1e9 })

const GOLD_INT = Schema.int({ min: 0, max: GOLD.MAX_BALANCE })
const COSMETIC_IDS = UpgradeCatalog.cosmetics().map((c) => c.id)

/** Record d'un niveau de la campagne à deux. */
const COOP_RECORD = Schema.object({
  stars: Schema.int({ min: 1, max: 3 }),
  best: Schema.int({ min: 0, max: GAME.MAX_LEVEL_SCORE }),
  shots: Schema.int({ min: 1, max: 100 }),
  attempts: Schema.int({ min: 1, max: 1e6 }),
})

/** Défi du jour : jours gardés en mémoire (les plus récents). */
export const DAILY_HISTORY = 14
const DAILY = Schema.object({
  // Dernier jour réussi (AAAA-MM-JJ), '' si aucun.
  last: Schema.string({ minLength: 0, maxLength: 10, pattern: /^(?:|\d{4}-\d{2}-\d{2})$/ }),
  streak: Schema.int({ min: 0, max: 100000 }),
  bestStreak: Schema.int({ min: 0, max: 100000 }),
  // Meilleur score de chaque jour réussi récemment.
  days: Schema.record(DAY_KEY, Schema.int({ min: 0, max: GAME.MAX_LEVEL_SCORE }), { maxKeys: DAILY_HISTORY }),
})

/**
 * Coupe de la semaine (v10) : la semaine en cours, le meilleur de chaque
 * château (1 à 5), la médaille de la semaine ; les médailles gagnées en tout.
 */
const CUP_SAVE = Schema.object({
  week: Schema.string({ minLength: 0, maxLength: 8, pattern: /^(?:|\d{4}-W\d{2})$/ }),
  castles: Schema.record(/^[1-5]$/, Schema.object({ best: Schema.int({ min: 0, max: GAME.MAX_LEVEL_SCORE }), stars: Schema.int({ min: 1, max: 3 }) }), { maxKeys: CUP.CASTLES }),
  medal: Schema.enum(['', 'bronze', 'silver', 'gold']),
  trophies: Schema.object({ bronze: COUNTER, silver: COUNTER, gold: COUNTER }),
})

/** Coupe vide (nouveau profil, ou profil d'avant la v10). */
export function emptyCup() {
  return { week: '', castles: {}, medal: '', trophies: { bronze: 0, silver: 0, gold: 0 } }
}

/** Schéma de la sauvegarde (version 10). Toute clé inconnue est refusée. */
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
      // v10 : niveau passé après trois défaites (0 étoile, à reprendre plus tard).
      skipped: Schema.optional(Schema.boolean()),
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
  // v5 : campagne à deux (progression séparée, sans or).
  coop: Schema.record(LEVEL_KEY, COOP_RECORD, { maxKeys: GAME.LEVEL_COUNT }),
  // v6 : or gagné grâce aux vidéos récompensées (portails), plafonné séparément.
  bonusGold: GOLD_INT,
  // v7 : défi du jour (série, records récents).
  daily: DAILY,
  // v8 : siège sans fin (meilleur score, plus de châteaux abattus).
  endless: Schema.object({ best: Schema.int({ min: 0, max: 1e9 }), bestWave: Schema.int({ min: 0, max: 10000 }), sieges: COUNTER }),
  // v9 : récompenses de connexion (dernier coffre ouvert, jour du cycle, total).
  login: Schema.object({
    last: Schema.string({ minLength: 0, maxLength: 10, pattern: /^(?:|\d{4}-\d{2}-\d{2})$/ }),
    day: Schema.int({ min: 0, max: LOGIN_CYCLE.length }),
    claims: Schema.int({ min: 0, max: 100000 }),
    gold: GOLD_INT,
  }),
  // v10 : coupe de la semaine.
  cup: CUP_SAVE,
  // v10 : défaites d'affilée au premier niveau pas encore réussi (coup de pouce, niveau à passer).
  frontier: Schema.object({ level: Schema.int({ min: 0, max: GAME.LEVEL_COUNT }), fails: Schema.int({ min: 0, max: 1e6 }) }),
})

/** Défaites d'affilée après lesquelles on peut passer un niveau (v6.0). */
export const SKIP_AFTER = 3
/** Coup de pouce discret du premier chapitre : à partir de 2 défaites, +10 % par défaite, au plus 30 %. */
export const LUCK = Object.freeze({ CHAPTER_MAX_LEVEL: 10, FROM_FAILS: 2, STEP: 0.1, MAX: 0.3 })

/**
 * Migration des anciennes sauvegardes (avant validation du schéma).
 * v1 → v2 : ajout de l'économie, vide.
 * v2 → v3 : étoiles au nombre de tirs et succès. Les améliorations, dont les
 *           prix ont changé, sont remboursées ; l'or déjà gagné est conservé
 *            (et contrôlé selon l'ancien barème).
 * v3 → v4 : succès renouvelés (masques remis à zéro, or conservé).
 * v4 → v5 : ajout de la campagne à deux, vide.
 * v5 → v6 : or des vidéos récompensées, à zéro.
 * v6 → v7 : défi du jour, vide.
 * v7 → v8 : siège sans fin, vide.
 * v8 → v9 : récompenses de connexion, vides.
 * v9 → v10 : coupe de la semaine, vide ; aucune défaite au front.
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
  if (save && typeof save === 'object' && save.version === 4) save = { ...save, version: 5, coop: {} }
  if (save && typeof save === 'object' && save.version === 5) save = { ...save, version: 6, bonusGold: 0 }
  if (save && typeof save === 'object' && save.version === 6) save = { ...save, version: 7, daily: { last: '', streak: 0, bestStreak: 0, days: {} } }
  if (save && typeof save === 'object' && save.version === 7) save = { ...save, version: 8, endless: { best: 0, bestWave: 0, sieges: 0 } }
  if (save && typeof save === 'object' && save.version === 8) save = { ...save, version: 9, login: emptyLogin() }
  if (save && typeof save === 'object' && save.version === 9) save = { ...save, version: 10, cup: emptyCup(), frontier: { level: 0, fails: 0 } }
  // Version de développement de la v10 (coupe sans le front) : le champ manquant est ajouté, vide.
  if (save && typeof save === 'object' && save.version === 10 && save.frontier === undefined) save = { ...save, frontier: { level: 0, fails: 0 } }
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
  /** Or doublable par une vidéo : résultat authentique → or gagné (usage unique). */
  #doublable = new WeakMap()

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
      coop: {},
      bonusGold: 0,
      daily: { last: '', streak: 0, bestStreak: 0, days: {} },
      endless: { best: 0, bestWave: 0, sieges: 0 },
      login: emptyLogin(),
      cup: emptyCup(),
      frontier: { level: 0, fails: 0 },
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
      if (rec.skipped && (rec.stars > 0 || rec.best > 0 || rec.shots > 0)) throw new ValidationError(`save.levels.${id}`, 'skipped level with a result')
      if (checkRecord && !rec.skipped) {
        const stars = checkRecord(id, { best: rec.best, stars: rec.stars, shots: rec.shots })
        if (Number.isInteger(stars)) rec.stars = stars
      }
    })
    // Front : un niveau pas encore réussi (ou aucun).
    if (data.frontier.level && data.levels[data.frontier.level]) throw new ValidationError('save.frontier.level', 'already completed')
    // Campagne à deux : progression continue elle aussi, étoiles recalculées.
    Object.keys(data.coop).map(Number).sort((a, b) => a - b).forEach((id, i) => {
      if (id !== i + 1) throw new ValidationError(`save.coop.${id}`, 'progression gap')
      const rec = data.coop[id]
      if (checkRecord) {
        const stars = checkRecord(id, { best: rec.best, stars: rec.stars, shots: rec.shots })
        if (Number.isInteger(stars)) rec.stars = stars
      }
    })
    if (data.updatedAt < data.createdAt) throw new ValidationError('save.updatedAt', 'before creation')
    SaveSlot.#checkEconomy(data)
    // Défi du jour : série cohérente.
    const daily = data.daily
    if (daily.streak > daily.bestStreak) throw new ValidationError('save.daily.streak', 'streak above best')
    if ((daily.streak > 0) !== Boolean(daily.last)) throw new ValidationError('save.daily.last', 'inconsistent streak')
    if (daily.last && !DAY_KEY.test(daily.last)) throw new ValidationError('save.daily.last', 'invalid day')
    // Siège sans fin : un score ne peut pas dépasser ce que les châteaux abattus permettent.
    if (data.endless.best > data.endless.bestWave * GAME.MAX_LEVEL_SCORE) throw new ValidationError('save.endless.best', 'impossible score')
    // Coffres de connexion : au plus un par jour depuis la création du profil.
    const loginError = checkLogin(data.login, data.createdAt)
    if (loginError) throw new ValidationError('save.login', loginError)
    // Coupe de la semaine : semaine valide, médaille conforme aux étoiles, et comptée.
    const cup = data.cup
    if (cup.week && !WEEK_KEY.test(cup.week)) throw new ValidationError('save.cup.week', 'invalid week')
    if (!cup.week && (Object.keys(cup.castles).length || cup.medal)) throw new ValidationError('save.cup.week', 'results without a week')
    const cupStars = Object.values(cup.castles).reduce((sum, c) => sum + c.stars, 0)
    if ((WeeklyCup.medalFor(cupStars) ?? '') !== cup.medal) throw new ValidationError('save.cup.medal', 'medal does not match the stars')
    if (cup.medal && cup.trophies[cup.medal] < 1) throw new ValidationError('save.cup.trophies', 'medal not counted')
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
    // L'or des vidéos ne peut jamais dépasser l'or gagnable en jouant (au plus « doublé »).
    if (data.bonusGold > maxGoldFor(data.levels)) throw new ValidationError('save.bonusGold', 'more bonus than possible')
    if (data.goldEarned > data.legacyGold + maxGoldFor(data.levels) + data.bonusGold + data.login.gold) throw new ValidationError('save.goldEarned', 'more gold than possible')
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
    if (c.event || this.#data.cosmetics.owned.includes(id) || c.cost > this.#data.gold) return false
    this.#data.gold -= c.cost
    this.#data.cosmetics.owned.push(id)
    return true
  }

  /**
   * Récompense d'événement (v4.0) : le cosmétique de l'événement en cours,
   * offert pour une victoire au défi du jour pendant l'événement.
   * @returns {string | null} cosmétique obtenu (null si déjà possédé ou hors événement)
   */
  grantEventReward(today) {
    const event = eventFor(today)
    if (!event) return null
    const id = EVENTS[event].reward
    if (this.#data.cosmetics.owned.includes(id)) return null
    this.#data.cosmetics.owned.push(id)
    return id
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
    const front = this.#data.frontier
    if (!result.won) {
      if (prev) prev.attempts += 1
      // Défaites d'affilée au premier niveau pas encore réussi (v6.0).
      else {
        front.fails = front.level === result.levelId ? front.fails + 1 : 1
        front.level = result.levelId
      }
      return { newBest: false, firstClear: false, gold: 0, newAchievements: 0 }
    }
    if (front.level === result.levelId) {
      front.level = 0
      front.fails = 0
    }
    const firstClear = !prev
    const before = prev ?? { stars: 0, ach: 0 }
    const newStars = Math.max(0, result.stars - before.stars)
    const newAchievements = result.achievements & ~before.ach
    const perfect = newAchievements !== 0 && (before.ach | result.achievements) === 7
    const gold = goldFor(result, { firstClear, newStars, newAchievements: countAchievements(newAchievements), perfect })
    this.#data.gold = Math.min(GOLD.MAX_BALANCE, this.#data.gold + gold)
    this.#data.goldEarned = Math.min(GOLD.MAX_BALANCE, this.#data.goldEarned + gold)
    if (gold > 0) this.#doublable.set(result, gold)
    if (firstClear) {
      this.#data.levels[result.levelId] = { stars: result.stars, best: result.score, attempts: 1, shots: Math.max(1, result.shotsUsed), ach: result.achievements }
      return { newBest: true, firstClear: true, gold, newAchievements }
    }
    prev.attempts += 1
    // Un niveau passé, enfin pris : il compte désormais comme les autres.
    delete prev.skipped
    const newBest = result.score > prev.best
    if (newBest) prev.best = result.score
    prev.stars = Math.max(prev.stars, result.stars)
    const shots = Math.max(1, result.shotsUsed)
    prev.shots = prev.shots > 0 ? Math.min(prev.shots, shots) : shots
    prev.ach |= result.achievements
    return { newBest, firstClear: false, gold, newAchievements }
  }

  /* ---------- Coup de pouce et niveau passé (v6.0) ---------- */

  /** Défaites d'affilée sur ce niveau (s'il n'est pas encore réussi). */
  failsAt(levelId) {
    const f = this.#data.frontier
    return f.level === levelId && !this.isCompleted(levelId) ? f.fails : 0
  }

  /** Après trois défaites d'affilée, on peut passer le niveau (jamais le dernier). */
  canSkip(levelId) {
    return levelId < GAME.LEVEL_COUNT && this.isUnlocked(levelId) && !this.isCompleted(levelId) && this.failsAt(levelId) >= SKIP_AFTER
  }

  /**
   * Passe un niveau : il compte comme fait (le suivant s'ouvre), sans étoile,
   * sans or ni score ; on peut revenir le prendre pour de bon.
   */
  skipLevel(levelId, now = Date.now()) {
    if (!this.canSkip(levelId)) throw new ValidationError('skip', 'level cannot be skipped')
    this.#data.levels[levelId] = { stars: 0, best: 0, attempts: Math.max(1, this.failsAt(levelId)), shots: 0, ach: 0, skipped: true }
    this.#data.frontier = { level: 0, fails: 0 }
    this.#data.updatedAt = Math.max(now, this.#data.updatedAt)
  }

  /** Niveau passé (sans l'avoir pris) ? */
  isSkipped(levelId) {
    return Boolean(this.#data.levels[levelId]?.skipped)
  }

  /**
   * Coup de pouce discret du premier chapitre (Facile et Normal) : après deux
   * défaites d'affilée, les défenseurs encaissent un peu moins et le vent
   * faiblit (10 % par défaite, 30 % au plus). Rien ne l'annonce.
   */
  luckFor(levelId, difficulty) {
    if (levelId > LUCK.CHAPTER_MAX_LEVEL || difficulty === 'hard') return 0
    const fails = this.failsAt(levelId)
    return fails >= LUCK.FROM_FAILS ? Math.min(LUCK.MAX, LUCK.STEP * (fails - LUCK.FROM_FAILS + 1)) : 0
  }

  /**
   * Double l'or d'une victoire qui vient d'être enregistrée, contre une vidéo.
   * Exige le résultat authentique ET le ticket de la vidéo ; une seule fois par
   * victoire ; plafonné pour que la sauvegarde reste vérifiable.
   * @returns {number} or ajouté (0 si refusé)
   */
  claimDoubleGold(result, ticket) {
    const gold = this.#doublable.get(result)
    if (!gold || !RewardTicket.redeem(ticket, 'double-gold')) return 0
    this.#doublable.delete(result)
    const room = Math.max(0, maxGoldFor(this.#data.levels) - this.#data.bonusGold)
    const bonus = Math.min(gold, room, GOLD.MAX_BALANCE - this.#data.goldEarned)
    if (bonus <= 0) return 0
    this.#data.gold += bonus
    this.#data.goldEarned += bonus
    this.#data.bonusGold += bonus
    return bonus
  }

  /* ---------- Récompenses de connexion ---------- */

  /** Coffre du jour : disponible ? quel jour du cycle ? (voir LoginRewards) */
  loginStatus(now = new Date()) {
    return { ...loginStatus(this.#data.login, now), claims: this.#data.login.claims }
  }

  /**
   * Ouvre le coffre du jour (une fois par jour) et crédite l'or.
   * @returns {number} or reçu (0 si déjà ouvert ou horloge antérieure au dernier coffre)
   */
  claimLogin(now = new Date()) {
    const r = claimLogin(this.#data.login, now)
    if (!r) return 0
    const gold = Math.min(r.gold, GOLD.MAX_BALANCE - this.#data.goldEarned)
    if (gold <= 0) return 0
    this.#data.login = { ...r.login, gold: this.#data.login.gold + gold }
    this.#data.gold += gold
    this.#data.goldEarned += gold
    return gold
  }

  /** L'or de cette victoire peut-il encore être doublé ? */
  canDoubleGold(result) {
    return this.#doublable.has(result)
  }

  /** Copie sérialisable (validée à nouveau avant écriture). */
  /* ---------- Campagne à deux ---------- */

  /** @returns {{ stars: number, best: number, shots: number, attempts: number } | null} */
  coopRecord(levelId) {
    const rec = this.#data.coop[levelId]
    return rec ? { ...rec } : null
  }

  /** Niveaux réussis à deux. */
  get coopCompleted() {
    return Object.keys(this.#data.coop).length
  }

  /** Étoiles obtenues à deux. */
  get coopStars() {
    return Object.values(this.#data.coop).reduce((sum, r) => sum + r.stars, 0)
  }

  /** Un niveau est jouable à deux si le précédent a été réussi à deux. */
  isCoopUnlocked(levelId) {
    Guard.int(levelId, 'levelId', { min: 1, max: GAME.LEVEL_COUNT })
    return levelId === 1 || Boolean(this.#data.coop[levelId - 1])
  }

  /**
   * Enregistre une partie de la campagne à deux (résultat authentifié uniquement).
   * Pas d'or ni de succès : la campagne à deux a sa propre progression.
   * @returns {{ newBest: boolean, firstClear: boolean }}
   */
  recordCoop(result) {
    if (!LevelResult.isAuthentic(result)) throw new ValidationError('result', 'not issued by the game engine')
    if (!this.isCoopUnlocked(result.levelId)) throw new ValidationError('result.levelId', 'level locked')
    if (!result.won) return { newBest: false, firstClear: false }
    const prev = this.#data.coop[result.levelId]
    const shots = Math.max(1, result.shotsUsed)
    if (!prev) {
      this.#data.coop[result.levelId] = { stars: Math.max(1, result.stars), best: result.score, shots, attempts: 1 }
      this.#data.updatedAt = Math.max(this.#data.updatedAt, Date.now())
      return { newBest: true, firstClear: true }
    }
    prev.attempts += 1
    const newBest = result.score > prev.best
    if (newBest) prev.best = result.score
    prev.stars = Math.max(prev.stars, result.stars)
    prev.shots = Math.min(prev.shots, shots)
    return { newBest, firstClear: false }
  }

  /* ---------- Défi du jour ---------- */

  /** Série, meilleure série et records récents (copie). */
  get daily() {
    return structuredClone(this.#data.daily)
  }

  /**
   * Série en cours au jour `today` : elle est rompue si le dernier défi
   * réussi date d'avant-hier ou plus.
   */
  dailyStreak(today) {
    const { last, streak } = this.#data.daily
    if (!last) return 0
    const gap = dayNumber(today) - dayNumber(last)
    return gap <= 1 ? streak : 0
  }

  /**
   * Enregistre une partie du défi du jour (résultat authentifié uniquement,
   * et seulement pour le défi du jour `today`). Pas d'or : la récompense est
   * la série et le record.
   * @returns {{ newBest: boolean, streak: number, extended: boolean }}
   */
  recordDaily(result, today) {
    if (!LevelResult.isAuthentic(result)) throw new ValidationError('result', 'not issued by the game engine')
    const challenge = DailyChallenge.forDay(today)
    if (result.levelId !== challenge.levelId || result.difficulty !== challenge.difficulty) throw new ValidationError('result', 'not today\'s challenge')
    const d = this.#data.daily
    if (!result.won) return { newBest: false, streak: this.dailyStreak(today), extended: false }
    const prev = d.days[today]
    const newBest = prev === undefined || result.score > prev
    if (newBest) d.days[today] = result.score
    // Ne garder que les jours les plus récents.
    const keys = Object.keys(d.days).sort()
    while (keys.length > DAILY_HISTORY) delete d.days[keys.shift()]
    let extended = false
    if (d.last !== today) {
      const gap = d.last ? dayNumber(today) - dayNumber(d.last) : Infinity
      if (gap < 0) return { newBest, streak: d.streak, extended: false } // horloge reculée : on ne touche pas à la série
      d.streak = gap === 1 ? d.streak + 1 : 1
      d.last = today
      d.bestStreak = Math.max(d.bestStreak, d.streak)
      extended = true
    }
    this.#data.updatedAt = Math.max(this.#data.updatedAt, Date.now())
    return { newBest, streak: d.streak, extended }
  }

  /* ---------- Coupe de la semaine ---------- */

  /** La coupe (copie) : semaine, meilleur de chaque château, médaille, médailles gagnées. */
  get cup() {
    return structuredClone(this.#data.cup)
  }

  /**
   * Enregistre un château de la coupe (résultat authentifié, château de la
   * coupe de la semaine `week`). Une nouvelle semaine remet la coupe à zéro ;
   * les médailles gagnées restent. Pas d'or : la récompense est la médaille.
   * @param {LevelResult} result
   * @param {string} week AAAA-Www
   * @param {number} index château (1 à 5)
   * @returns {{ newBest: boolean, stars: number, medal: string | null, medalUp: boolean }}
   */
  recordCup(result, week, index) {
    if (!LevelResult.isAuthentic(result)) throw new ValidationError('result', 'not issued by the game engine')
    Guard.int(index, 'cup castle', { min: 1, max: CUP.CASTLES })
    const cup = WeeklyCup.forWeek(week)
    if (result.levelId !== cup.levels[index - 1] || result.difficulty !== cup.difficulty) throw new ValidationError('result', 'not this week\'s cup')
    const c = this.#data.cup
    const total = () => Object.values(c.castles).reduce((sum, r) => sum + r.stars, 0)
    // Horloge reculée : une coupe plus ancienne que la dernière jouée ne change rien.
    if (c.week && week < c.week) return { newBest: false, stars: total(), medal: c.medal || null, medalUp: false }
    if (c.week !== week) {
      c.week = week
      c.castles = {}
      c.medal = ''
    }
    if (!result.won) return { newBest: false, stars: total(), medal: c.medal || null, medalUp: false }
    const prev = c.castles[index]
    const newBest = !prev || result.score > prev.best
    c.castles[index] = { best: Math.max(prev?.best ?? 0, result.score), stars: Math.max(prev?.stars ?? 0, result.stars) }
    const stars = total()
    const medal = WeeklyCup.medalFor(stars) ?? ''
    const medalUp = medal !== c.medal
    if (medalUp) {
      if (c.medal) c.trophies[c.medal] -= 1
      c.trophies[medal] += 1
      c.medal = medal
    }
    this.#data.updatedAt = Math.max(this.#data.updatedAt, Date.now())
    return { newBest, stars, medal: medal || null, medalUp }
  }

  /* ---------- Siège sans fin ---------- */

  get endless() {
    return { ...this.#data.endless }
  }

  /**
   * Enregistre un siège terminé (partie authentique uniquement).
   * @returns {{ newBest: boolean, newWave: boolean }}
   */
  recordEndless(run) {
    if (!EndlessRun.isAuthentic(run) || !run.over) throw new ValidationError('endless', 'not a finished siege from the game engine')
    const e = this.#data.endless
    const newBest = run.score > e.best
    const newWave = run.cleared > e.bestWave
    e.best = Math.max(e.best, run.score)
    e.bestWave = Math.max(e.bestWave, run.cleared)
    e.sieges += 1
    this.#data.updatedAt = Math.max(this.#data.updatedAt, Date.now())
    return { newBest, newWave }
  }

  toJSON() {
    return structuredClone(this.#data)
  }
}
