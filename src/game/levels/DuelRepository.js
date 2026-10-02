import { buildLevel } from './LevelRepository.js'
import { BP } from './blueprints.js'

/**
 * Châteaux du DUEL : bien plus grands que les niveaux de campagne, avec deux
 * fois plus de défenseurs, pour que les deux joueurs aient chacun de nombreux
 * tirs à jouer avant que tout ne tombe. Huit tirs par joueur.
 */
const DUEL_SPECS = [
  // 1. La grande palissade : un fort de bois et son village.
  {
    theme: 1, shots: 8, wind: 0.2, ammo: { boulder: 2, fire: 2 },
    build(b) {
      BP.fortress(b, { x: 1450, floors: 5, side: 3, m: 'wood', top: 'straw', split: 3, s: 'wood' })
      BP.hamlet(b, { x0: 1880, gap: 150, count: 3 })
    },
  },
  // 2. Le bourg de pierre : un escalier de tours et un donjon.
  {
    theme: 2, shots: 8, wind: 0.3, ammo: { boulder: 3, bomb: 1 },
    build(b) {
      BP.stairs(b, { x0: 1220, step: 150, count: 4, start: 2, m: 'stone', top: 'wood', s: 'stone', king: false })
      BP.keep(b, { x: 2000, floors: 5, m: 'stone', top: 'wood', s: 'stone', w: 150, double: 2, king: true })
    },
  },
  // 3. Les deux forteresses.
  {
    theme: 3, shots: 8, wind: 0.4, ammo: { boulder: 2, bomb: 2 },
    build(b) {
      BP.fortress(b, { x: 1450, floors: 5, side: 3, m: 'brick', top: 'wood', s: 'stone', barrel: true })
      BP.twins(b, { x: 2000, gap: 280, floors: 4, m: 'stone', top: 'wood', s: 'stone', watchers: 2 })
    },
  },
  // 4. La citadelle nocturne : crypte et pont-levis.
  {
    theme: 4, shots: 8, wind: 0.45, ammo: { boulder: 2, bomb: 3 },
    build(b) {
      BP.crypt(b, { x: 1400, vault: 'iron', hall: 'wood', floors: 4, barrels: 2, side: false })
      BP.drawbridge(b, { x: 1900, gap: 320, floors: 4, m: 'stone', s: 'iron' })
    },
  },
  // 5. Le palais des dunes : un plateau et un caravansérail.
  {
    theme: 6, shots: 8, wind: 0.4, ammo: { boulder: 2, bomb: 2, split: 1 },
    build(b) {
      BP.mesa(b, { x: 1330, baseH: 140, baseW: 320, floors: 3 })
      BP.rampart(b, { x0: 1680, rooms: 4, w: 120, m: 'sandstone', s: 'wood' })
    },
  },
  // 6. Le Trône : la citadelle royale et sa tour de garde.
  {
    theme: 10, shots: 9, wind: 0.5, ammo: { boulder: 3, bomb: 3, fire: 1 },
    build(b) {
      BP.fortress(b, { x: 1500, floors: 7, side: 4, m: 'marble', top: 'brick', split: 3, s: 'marble', h: 88, barrel: true })
      BP.keep(b, { x: 2080, floors: 5, m: 'stone', top: 'wood', s: 'stone', knights: 1 })
    },
  },
]

let cache = null

export class DuelRepository {
  static all() {
    if (!cache) cache = Object.freeze(DUEL_SPECS.map((spec, i) => buildLevel(spec, i + 1, spec.theme, 5000)))
    return cache
  }

  static get(id) {
    const d = DuelRepository.all()[id - 1]
    if (!d) throw new RangeError(`unknown duel castle ${id}`)
    return d
  }
}
