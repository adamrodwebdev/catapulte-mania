import { Guard, deepFreeze } from '../../core/utils/Guard.js'
import { DAY_KEY } from '../daily/DailyChallenge.js'

/**
 * Événements saisonniers (v4.0) : un décor de saison et une récompense
 * cosmétique, offerte pour une victoire au défi du jour pendant l'événement.
 * Aucune incidence sur la difficulté. Dates fixes, sans serveur.
 */
export const EVENTS = deepFreeze({
  // La nuit des citrouilles : du 15 octobre au 2 novembre.
  halloween: { from: [10, 15], to: [11, 2], reward: 'pumpkin' },
  // Le siège d'hiver : du 15 décembre au 6 janvier.
  winter: { from: [12, 15], to: [1, 6], reward: 'snow' },
})

const inRange = (m, d, [fm, fd], [tm, td]) => {
  const v = m * 100 + d
  const a = fm * 100 + fd
  const b = tm * 100 + td
  return a <= b ? v >= a && v <= b : v >= a || v <= b
}

/** Événement en cours à une date (clé AAAA-MM-JJ), ou null. */
export function eventFor(key) {
  Guard.string(key, 'day key', { pattern: DAY_KEY })
  const [, m, d] = key.split('-').map(Number)
  for (const [id, e] of Object.entries(EVENTS)) if (inRange(m, d, e.from, e.to)) return id
  return null
}
