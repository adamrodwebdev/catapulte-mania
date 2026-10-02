import { StructureBuilder } from './StructureBuilder.js'
import { WORLD } from '../physics/constants.js'
import { deepFreeze } from '../../core/utils/Guard.js'

/**
 * Arènes du face-à-face : chaque joueur a sa catapulte et son château.
 *
 * Chaque arène décrit UN château (côté gauche, joueur 1) ; le château du
 * joueur 2 en est le reflet exact (x → largeur du monde − x). Les deux camps
 * sont donc strictement équitables.
 */
export const CATAPULT_X = Object.freeze({ left: 170, right: WORLD.WIDTH - 170 })

const ARENA_SPECS = [
  // 1. Les deux tours : bois, à découvert.
  {
    shots: 6, wind: 0.2, theme: 1, ammo: {},
    build(b) {
      const t = b.tower(620, { floors: 3, roof: 'straw' })
      b.target(t[0])
      b.target(t[2])
      b.target(b.room(790, b.ground, { mat: 'wood', w: 100, h: 90 }))
    },
  },
  // 2. Forts de pierre : un chevalier bien abrité.
  {
    shots: 6, wind: 0.35, theme: 2, ammo: { boulder: 2 },
    build(b) {
      const t = b.tower(620, { floors: 3, mats: ['stone', 'stone', 'wood'], t: 24, roof: 'wood' })
      b.target(t[0], 'knight')
      b.target(t[2])
      b.target(b.room(800, b.ground, { mat: 'stone', slab: 'wood', w: 110, t: 24 }))
    },
  },
  // 3. Poudrières : un baril sous chaque tour. Visez juste.
  {
    shots: 6, wind: 0.4, theme: 2, ammo: { boulder: 1, fire: 2 },
    build(b) {
      const t = b.tower(640, { floors: 4, mats: ['wood', 'stone', 'stone', 'wood'], slab: 'stone', w: 130, t: 24, h: 95, roof: 'wood' })
      b.barrel(t[0], -24)
      b.target(t[0], 'soldier', 26)
      b.target(t[1])
      b.target(t[3])
    },
  },
  // 4. Citadelles de fer : sur une colline, planchers de fer.
  {
    shots: 7, wind: 0.5, theme: 3, ammo: { boulder: 2, bomb: 2 },
    build(b) {
      const top = b.base(660, { w: 260, h: 80, mat: 'stone', rows: 2 })
      const t = b.tower(640, { floors: 3, mat: 'stone', slab: 'iron', t: 26, floorY: top, roof: 'wood' })
      b.target(t[0], 'knight')
      b.target(t[1])
      b.target(t[2], 'king')
    },
  },
  // 5. La nuit des pilotis : tout repose sur des pieds de verre.
  {
    shots: 6, wind: 0.6, theme: 4, ammo: { boulder: 1, bomb: 1, split: 1 },
    build(b) {
      const deck = b.stilts(660, { legs: 3, mat: 'glass', deck: 'stone', w: 200, h: 120, legW: 20, t: 24 })
      const t = b.tower(660, { floors: 2, mat: 'stone', w: 140, t: 24, floorY: deck.floorY, roof: 'wood' })
      b.target(t[0], 'knight', -30)
      b.target(t[0], 'soldier', 30)
      b.target(t[1])
    },
  },
]

const mirrorX = (x) => WORLD.WIDTH - x

/** Construit une arène : château gauche (équipe 1) + son reflet (équipe 2). */
function buildArena(spec, i) {
  const b = new StructureBuilder()
  spec.build(b)
  const blocks = [...b.blocks, ...b.blocks.map((k) => ({ ...k, x: mirrorX(k.x) }))]
  const targets = [...b.targets.map((t) => ({ ...t, team: 1 })), ...b.targets.map((t) => ({ ...t, x: mirrorX(t.x), team: 2 }))]
  const barrels = [...b.barrels, ...b.barrels.map((k) => ({ ...k, x: mirrorX(k.x) }))]
  const top = Math.min(...blocks.map((k) => k.y - k.h / 2))
  return deepFreeze({
    id: i + 1,
    arena: true,
    chapter: spec.theme,
    seed: ((i + 101) * 2654435761) >>> 0,
    shots: spec.shots,
    wind: spec.wind,
    ammo: { ...spec.ammo },
    blocks,
    targets,
    barrels,
    reference: 1,
    maxScore: 200000,
    focus: { left: 0, right: WORLD.WIDTH, top: Math.min(250, top - 200) },
  })
}

let cache = null

export class ArenaRepository {
  static all() {
    if (!cache) cache = Object.freeze(ARENA_SPECS.map(buildArena))
    return cache
  }

  static get(id) {
    const a = ArenaRepository.all()[id - 1]
    if (!a) throw new RangeError(`unknown arena ${id}`)
    return a
  }
}
