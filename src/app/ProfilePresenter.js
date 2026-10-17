import { GAME, PLAYABLE_LEVELS } from '../config/gameConfig.js'
import { PowerRegistry } from '../game/powers/PowerRegistry.js'
import { UpgradeCatalog } from '../game/progression/UpgradeCatalog.js'
import { DUKE_COUNT, medalFor } from '../game/progression/Mastery.js'
import { WeeklyCup, weekKey, CUP } from '../game/daily/WeeklyCup.js'
import { DailyChallenge, dayKey } from '../game/daily/DailyChallenge.js'
import { ENDLESS } from '../domain/EndlessRun.js'

/**
 * Copie d'affichage d'un profil (v6.2, sortie d'AppContext) : ce que les
 * écrans lisent dans `state.profile`. Fonction pure du profil et de la date :
 * aucun service, aucune réactivité ; les objets métier restent hors de Vue.
 */
export class ProfilePresenter {
  /**
   * @param {import('../domain/SaveSlot.js').SaveSlot | null} slot
   * @param {Date} [now] jour du défi, semaine de la coupe, coffre de connexion
   */
  static view(slot, now = new Date()) {
    if (!slot) return null
    const levels = {}
    for (let id = 1; id <= GAME.LEVEL_COUNT; id++) {
      const rec = slot.levelRecord(id)
      levels[id] = { unlocked: slot.isUnlocked(id) && id <= PLAYABLE_LEVELS, stars: rec?.stars ?? 0, best: rec?.best ?? 0, completed: Boolean(rec), shots: rec?.shots ?? 0, ach: rec?.ach ?? 0, skipped: Boolean(rec?.skipped) }
    }
    const workshop = ProfilePresenter.#workshop(slot)
    return {
      index: slot.index,
      name: slot.name,
      difficulty: slot.difficulty,
      completed: slot.completedCount,
      stars: slot.starCount,
      achievements: slot.achievementCount,
      coop: {
        completed: slot.coopCompleted,
        stars: slot.coopStars,
        next: Math.min(slot.coopCompleted + 1, PLAYABLE_LEVELS),
        levels: Object.fromEntries(
          Array.from({ length: PLAYABLE_LEVELS }, (_, i) => {
            const rec = slot.coopRecord(i + 1)
            return [i + 1, { stars: rec?.stars ?? 0, completed: Boolean(rec), unlocked: slot.isCoopUnlocked(i + 1) }]
          }),
        ),
      },
      score: slot.totalScore,
      next: Math.min(slot.nextLevel, PLAYABLE_LEVELS),
      levels,
      powers: PowerRegistry.all().map((p) => ({ id: p.id, icon: p.icon, cost: p.cost, unlockAfter: p.unlockAfter, unlocked: p.isUnlocked(slot.completedCount) })),
      gold: slot.gold,
      upgrades: slot.upgrades,
      cosmetics: slot.cosmetics,
      daily: ProfilePresenter.#daily(slot, now),
      cup: ProfilePresenter.#cup(slot, now),
      endless: { ...slot.endless, unlocked: slot.completedCount >= ENDLESS.UNLOCK },
      login: slot.loginStatus(now),
      // v6.2 : offres de l'atelier (règle d'achat : SaveSlot.upgradeOffer) et la moins chère à portée.
      workshop,
      affordable: ProfilePresenter.#affordable(workshop),
      // v6.2 : maîtrise du royaume, Campagne héroïque et Terres du Duc.
      mastered: slot.mastered,
      heroic: ProfilePresenter.#heroic(slot),
      duke: ProfilePresenter.#duke(slot),
    }
  }

  /** Atelier : l'offre de chaque amélioration, avec son icône et ses paliers. */
  static #workshop(slot) {
    return UpgradeCatalog.upgrades().map((u) => ({ ...slot.upgradeOffer(u.id), icon: u.icon, base: u.base, max: u.maxLevel }))
  }

  /**
   * Amélioration que le joueur peut s'offrir tout de suite (la moins chère),
   * pour lui signaler l'atelier. null s'il n'y en a aucune.
   */
  static #affordable(offers) {
    let best = null
    for (const o of offers) {
      if (o.affordable && (!best || o.cost < best.cost)) best = { id: o.id, cost: o.cost }
    }
    return best
  }

  /** Campagne héroïque : commencée ou non, ses niveaux et ses médailles. */
  static #heroic(slot) {
    const h = slot.heroic
    const levels = {}
    const medals = { gold: 0, silver: 0, bronze: 0 }
    let done = 0
    for (let id = 1; id <= GAME.LEVEL_COUNT; id++) {
      const rec = h.levels[id]
      const medal = rec ? medalFor(rec.stars) : null
      if (medal) medals[medal]++
      if (rec) done++
      levels[id] = { unlocked: slot.isHeroicUnlocked(id) && id <= PLAYABLE_LEVELS, completed: Boolean(rec), stars: rec?.stars ?? 0, best: rec?.best ?? 0, medal }
    }
    return { started: h.started, levels, medals, completed: done, next: Math.min(done + 1, PLAYABLE_LEVELS) }
  }

  /** Terres du Duc : les cinq châteaux, leurs médailles. */
  static #duke(slot) {
    const recs = slot.duke
    const levels = {}
    for (let id = 1; id <= DUKE_COUNT; id++) {
      const rec = recs[id]
      levels[id] = { unlocked: slot.isDukeUnlocked(id), completed: Boolean(rec), stars: rec?.stars ?? 0, best: rec?.best ?? 0, medal: rec ? medalFor(rec.stars) : null }
    }
    return { levels, completed: Object.keys(recs).length }
  }

  /** Coupe de la semaine pour l'interface : châteaux, meilleurs résultats, étoiles, médaille. */
  static #cup(slot, now) {
    const week = weekKey(now)
    const saved = slot.cup
    const current = saved.week === week
    const castles = WeeklyCup.forWeek(week).levels.map((levelId, i) => {
      const rec = current ? saved.castles[i + 1] : null
      return { index: i + 1, levelId, best: rec?.best ?? 0, stars: rec?.stars ?? 0 }
    })
    const stars = castles.reduce((sum, c) => sum + c.stars, 0)
    return { week, castles, stars, maxStars: CUP.CASTLES * 3, medal: current ? saved.medal || null : null, thresholds: CUP.MEDALS, trophies: saved.trophies }
  }

  /** Défi du jour vu par un profil : série en cours, record du jour, derniers jours. */
  static #daily(slot, now) {
    const today = dayKey(now)
    const d = slot.daily
    return {
      today,
      challenge: DailyChallenge.forDay(today),
      streak: slot.dailyStreak(today),
      bestStreak: d.bestStreak,
      todayBest: d.days[today] ?? null,
      history: Object.entries(d.days)
        .sort((a, b) => (a[0] < b[0] ? 1 : -1))
        .map(([day, score]) => ({ day, score })),
    }
  }
}
