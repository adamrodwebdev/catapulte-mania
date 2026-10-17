import { Guard, deepFreeze } from '../../core/utils/Guard.js'
import { GAME } from '../../config/gameConfig.js'

/**
 * Coupe de la semaine (v6.0).
 *
 * Chaque semaine (semaine ISO, du lundi au dimanche), la même coupe pour tout
 * le monde : cinq châteaux de la campagne, un par tranche de difficulté, tirés
 * au sort à partir de la semaine (aucun serveur). Règles du défi du jour :
 * difficulté Normale, catapulte, sans pouvoirs ni améliorations. Chaque
 * château se rejoue autant qu'on veut pendant la semaine ; on garde le
 * meilleur. Les étoiles des cinq châteaux donnent la médaille.
 *
 * Les grands sièges (fins de chapitre) n'entrent pas dans la coupe : trop longs.
 */

/** Clé d'une semaine ISO : AAAA-Www. */
export const WEEK_KEY = /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/

export const CUP = deepFreeze({
  CASTLES: 5,
  /** Tranches de la campagne (une par château, de plus en plus dures). */
  BANDS: [[6, 19], [21, 39], [41, 59], [61, 79], [81, 99]],
  /** Étoiles (sur 15) qu'il faut pour chaque médaille. */
  MEDALS: { bronze: 5, silver: 10, gold: 13 },
})
export const MEDALS = Object.freeze(['bronze', 'silver', 'gold'])

/** Semaine ISO d'une date (date locale du joueur). */
export function weekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  // Le jeudi de la semaine décide de l'année ISO.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const year = d.getUTCFullYear()
  const week = Math.ceil(((d - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7)
  return `${year}-W${String(week).padStart(2, '0')}`
}

/** Hachage FNV-1a 32 bits (stable sur tous les appareils). */
function hash(text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

export class WeeklyCup {
  /**
   * La coupe d'une semaine donnée.
   * @param {string} key AAAA-Www
   * @returns {{ key: string, levels: number[], engine: 'catapult', difficulty: 'normal' }}
   */
  static forWeek(key) {
    Guard.string(key, 'week key', { pattern: WEEK_KEY })
    const levels = CUP.BANDS.map(([lo, hi], i) => {
      const ids = []
      for (let id = lo; id <= Math.min(hi, GAME.LEVEL_COUNT); id++) if (id % GAME.LEVELS_PER_CHAPTER !== 0) ids.push(id)
      return ids[hash(`catapulte-mania:cup:${key}:${i}`) % ids.length]
    })
    return deepFreeze({ key, levels, engine: 'catapult', difficulty: 'normal' })
  }

  static thisWeek(now = new Date()) {
    return WeeklyCup.forWeek(weekKey(now))
  }

  /**
   * Médaille pour un total d'étoiles (sur 15), ou null.
   * @param {number} stars
   */
  static medalFor(stars) {
    Guard.int(stars, 'cup stars', { min: 0, max: CUP.CASTLES * 3 })
    if (stars >= CUP.MEDALS.gold) return 'gold'
    if (stars >= CUP.MEDALS.silver) return 'silver'
    return stars >= CUP.MEDALS.bronze ? 'bronze' : null
  }
}
