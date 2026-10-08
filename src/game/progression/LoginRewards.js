import { deepFreeze, Guard } from '../../core/utils/Guard.js'
import { DAY_KEY, dayKey, dayNumber } from '../daily/DailyChallenge.js'

/**
 * Récompenses de connexion (v4.6) : un coffre d'or par jour de jeu.
 *
 * - Un seul coffre par jour du calendrier (heure locale).
 * - Des jours consécutifs font avancer le cycle de 7 jours (le 7e coffre est
 *   le plus gros) ; un jour manqué ramène au jour 1. Après le 7e, on recommence.
 * - Sans serveur, l'horloge de l'appareil fait foi : on ne peut pas l'empêcher
 *   d'être avancée, mais un coffre n'est jamais donné pour une date antérieure
 *   au dernier coffre ouvert (remettre l'heure en arrière bloque les coffres),
 *   et la sauvegarde vérifie que l'or des coffres reste possible (au plus un
 *   coffre par jour depuis la création du profil, au plus le gros coffre).
 */
export const LOGIN_CYCLE = deepFreeze([40, 60, 80, 100, 130, 160, 250])
export const LOGIN_MAX_DAILY = Math.max(...LOGIN_CYCLE)

/** État vierge d'un profil. */
export const emptyLogin = () => ({ last: '', day: 0, claims: 0, gold: 0 })

/**
 * Où en est le joueur aujourd'hui ?
 * @param {{ last: string, day: number }} login
 * @param {Date} [now]
 * @returns {{ canClaim: boolean, day: number, reward: number, broken: boolean, locked: boolean, today: string }}
 *   `day` : jour du cycle (1..7) du coffre du jour ; `broken` : la série vient d'être perdue ;
 *   `locked` : l'horloge de l'appareil est antérieure au dernier coffre.
 */
export function loginStatus(login, now = new Date()) {
  const today = dayKey(now)
  if (!login.last) return { canClaim: true, day: 1, reward: LOGIN_CYCLE[0], broken: false, locked: false, today }
  const gap = dayNumber(today) - dayNumber(login.last)
  if (gap <= 0) {
    const day = Math.max(1, login.day)
    return { canClaim: false, day, reward: LOGIN_CYCLE[day - 1], broken: false, locked: gap < 0, today }
  }
  const day = gap === 1 ? (login.day % LOGIN_CYCLE.length) + 1 : 1
  return { canClaim: true, day, reward: LOGIN_CYCLE[day - 1], broken: gap > 1 && login.day > 0, locked: false, today }
}

/**
 * Ouvre le coffre du jour.
 * @returns {{ login: { last: string, day: number, claims: number, gold: number }, gold: number } | null} null si déjà ouvert
 */
export function claimLogin(login, now = new Date()) {
  const s = loginStatus(login, now)
  if (!s.canClaim) return null
  return { login: { last: s.today, day: s.day, claims: login.claims + 1, gold: login.gold + s.reward }, gold: s.reward }
}

/**
 * Cohérence d'un état de connexion sauvegardé (sauvegarde non fiable).
 * @param {{ last: string, day: number, claims: number, gold: number }} login
 * @param {number} createdAt date de création du profil (ms)
 */
export function checkLogin(login, createdAt) {
  if (Boolean(login.last) !== login.claims > 0) return 'inconsistent claims'
  if (!login.last) return login.day === 0 && login.gold === 0 ? null : 'reward without claim'
  Guard.string(login.last, 'login.last', { pattern: DAY_KEY })
  if (login.day < 1) return 'invalid day'
  const span = dayNumber(login.last) - dayNumber(dayKey(new Date(createdAt))) + 1
  // Un jour de tolérance (changement de fuseau horaire entre deux sessions).
  if (span < 0) return 'claim before creation'
  if (login.claims > span + 1) return 'more claims than days'
  if (login.gold > login.claims * LOGIN_MAX_DAILY) return 'more gold than possible'
  if (login.gold < login.claims * LOGIN_CYCLE[0]) return 'less gold than possible'
  return null
}
