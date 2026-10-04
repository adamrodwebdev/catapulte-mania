import { Guard, deepFreeze } from '../../core/utils/Guard.js'
import { GAME } from '../../config/gameConfig.js'

/**
 * Défi du jour (v3.9).
 *
 * Chaque jour, le même défi pour tout le monde : un niveau de la campagne et
 * un engin imposé, tirés au sort à partir de la date (aucun serveur). Règles
 * identiques pour tous : difficulté Normale, sans pouvoirs ni améliorations.
 * Les niveaux sont tous contrôlés (stables, gagnables à la catapulte comme
 * au trébuchet) : un défi n'est jamais impossible.
 *
 * Gagner le défi plusieurs jours de suite fait grandir une série.
 */

/** Clé d'un jour : AAAA-MM-JJ (date locale du joueur). */
export const DAY_KEY = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/

/** Niveaux tirés au sort : on laisse de côté les tout premiers (apprentissage). */
const FIRST = 5

/** Clé du jour pour une date (locale). */
export function dayKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Numéro du jour (jours depuis le 1er janvier 1970), pour mesurer une série. */
export function dayNumber(key) {
  Guard.string(key, 'day key', { pattern: DAY_KEY })
  const [y, m, d] = key.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

/** Hachage FNV-1a 32 bits (stable, identique sur tous les appareils). */
function hash(text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

export class DailyChallenge {
  /**
   * Défi d'un jour donné.
   * @param {string} key AAAA-MM-JJ
   * @returns {{ key: string, levelId: number, engine: 'catapult' | 'trebuchet', difficulty: 'normal' }}
   */
  static forDay(key) {
    Guard.string(key, 'day key', { pattern: DAY_KEY })
    const h = hash(`catapulte-mania:${key}`)
    return deepFreeze({
      key,
      levelId: FIRST + (h % (GAME.LEVEL_COUNT - FIRST + 1)),
      engine: (h >>> 16) & 1 ? 'trebuchet' : 'catapult',
      difficulty: 'normal',
    })
  }

  static today(now = new Date()) {
    return DailyChallenge.forDay(dayKey(now))
  }
}
