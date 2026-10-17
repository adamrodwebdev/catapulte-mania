import { deepFreeze, Guard } from '../core/utils/Guard.js'
import { SeededRandom } from '../core/utils/SeededRandom.js'

/**
 * La main du siège sans fin (v6.0) : après chaque château pris, trois cartes
 * tirées d'un paquet ; on en garde une, qui façonne la suite du siège.
 *
 * Les mains dépendent seulement de la graine du siège, du numéro du château
 * et de ce qui a déjà été gardé (l'intendant ne revient pas au-delà de son
 * maximum) : même graine, mêmes choix, mêmes mains.
 *
 *  - `ammo`   : des munitions spéciales en plus, pour le prochain château ;
 *  - `shots`  : des pierres en plus, gardées pour la suite du siège ;
 *  - `supply` : +1 de chaque munition spéciale à chaque château, jusqu'à la fin ;
 *  - `fortune`: les points du prochain château comptent davantage.
 * Textes : `endless.cards.<id>.name` et `.desc` (paramètre `count`).
 */
export const CARDS = deepFreeze({
  bombs: { kind: 'ammo', ammo: 'bomb', count: 2, weight: 3, icon: 'bomb' },
  boulders: { kind: 'ammo', ammo: 'boulder', count: 2, weight: 3, icon: 'boulder' },
  fire: { kind: 'ammo', ammo: 'fire', count: 2, weight: 3, icon: 'flame' },
  frost: { kind: 'ammo', ammo: 'frost', count: 2, weight: 2, icon: 'snowflake' },
  grapeshot: { kind: 'ammo', ammo: 'split', count: 2, weight: 2, icon: 'volley' },
  stone: { kind: 'shots', count: 1, weight: 3, icon: 'shot' },
  quartermaster: { kind: 'supply', count: 1, max: 2, weight: 1, icon: 'gear' },
  fortune: { kind: 'fortune', factor: 1.5, weight: 2, icon: 'coin' },
})

export const CARD_IDS = Object.freeze(Object.keys(CARDS))
export const HAND_SIZE = 3

/**
 * Les trois cartes offertes avant le château `wave` (toutes différentes).
 * @param {number} seed graine du siège
 * @param {number} wave château qui vient
 * @param {{ supply?: number }} [state] intendants déjà gardés
 * @returns {string[]}
 */
export function handFor(seed, wave, { supply = 0 } = {}) {
  Guard.int(seed, 'deck seed', { min: 0, max: 0xffffffff })
  Guard.int(wave, 'deck wave', { min: 1, max: 10000 })
  const rng = new SeededRandom((seed ^ Math.imul(wave, 0x9e3779b1)) >>> 0)
  const pool = CARD_IDS.filter((id) => !(CARDS[id].kind === 'supply' && supply >= CARDS[id].max))
  const hand = []
  while (hand.length < HAND_SIZE && pool.length) {
    const total = pool.reduce((sum, id) => sum + CARDS[id].weight, 0)
    let r = rng.next() * total
    let i = pool.findIndex((id) => (r -= CARDS[id].weight) < 0)
    if (i < 0) i = pool.length - 1
    hand.push(pool.splice(i, 1)[0])
  }
  return hand
}
