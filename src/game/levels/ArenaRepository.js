import { StructureBuilder } from './StructureBuilder.js'
import { WORLD } from '../physics/constants.js'
import { deepFreeze } from '../../core/utils/Guard.js'
import { BP } from './blueprints.js'

/**
 * Arènes du face-à-face : chaque joueur a sa catapulte et son château.
 *
 * Chaque arène décrit UN château (côté gauche, joueur 1) ; le château du
 * joueur 2 en est le reflet exact (x → largeur du monde − x). Les deux camps
 * sont donc strictement équitables. Chaque château abrite un roi.
 */
export const CATAPULT_X = Object.freeze({ left: 170, right: WORLD.WIDTH - 170 })

/*
 * Six arènes, chacune avec un ROI dans le château : l'abattre donne la victoire
 * (voir VersusMode). Le roi est logé à l'arrière (côté de sa propre catapulte),
 * protégé par des tours de garde tournées vers l'adversaire.
 */
const ARENA_SPECS = [
  // 1. Les palissades : donjon de bois et tour de garde.
  {
    shots: 7, wind: 0.25, theme: 1, ammo: { fire: 2 },
    build(b) {
      BP.keep(b, { x: 680, floors: 4, m: 'wood', s: 'wood', w: 130, roof: 'straw', king: true })
      const g = b.tower(930, { floors: 3, mats: ['straw', 'wood', 'wood'], slab: 'wood', w: 110, roof: 'straw' })
      b.target(g[0])
      b.target(g[2])
    },
  },
  // 2. Les forts de pierre : un chevalier en garde, un baril sous la tour avancée.
  {
    shots: 7, wind: 0.35, theme: 2, ammo: { boulder: 2, bomb: 1 },
    build(b) {
      BP.keep(b, { x: 660, floors: 4, m: 'stone', top: 'wood', split: 2, s: 'stone', w: 130, roof: 'wood', king: true, knights: 1 })
      const g = b.tower(920, { floors: 3, mats: ['stone', 'wood', 'wood'], slab: 'stone', w: 120, t: 24, roof: 'straw' })
      b.barrel(g[0], -26)
      b.target(g[0], 'soldier', 26)
      b.target(g[2], 'knight')
    },
  },
  // 3. Les poudrières : une forteresse et ses deux tours, des barils au cœur.
  {
    shots: 8, wind: 0.4, theme: 3, ammo: { boulder: 2, bomb: 2, fire: 1, frost: 1 },
    build(b) {
      BP.fortress(b, { x: 900, floors: 5, side: 3, m: 'brick', top: 'wood', split: 2, s: 'stone', king: true, barrel: true })
    },
  },
  // 4. Les citadelles de nuit : un donjon de fer sur son socle, une tour de brique devant.
  {
    shots: 8, wind: 0.5, theme: 4, ammo: { boulder: 2, bomb: 2 },
    build(b) {
      const top = b.base(700, { w: 260, h: 80, mat: 'stone', rows: 2 })
      const k = b.tower(700, { floors: 3, mat: 'stone', slab: 'iron', t: 26, floorY: top, roof: 'wood' })
      b.target(k[0], 'knight')
      b.target(k[1])
      b.target(k[2], 'king')
      const g = b.tower(970, { floors: 3, mat: 'brick', slab: 'stone', w: 120, t: 24, roof: 'straw' })
      b.target(g[0])
      b.target(g[2], 'knight')
    },
  },
  // 5. Les pilotis des marais : le château du roi sur des pieds de verre.
  {
    shots: 8, wind: 0.45, theme: 5, ammo: { boulder: 1, bomb: 2, split: 1 },
    build(b) {
      BP.stiltCastle(b, { x: 720, legs: 3, legMat: 'glass', deck: 'stone', h: 120, floors: 3, m: 'brick', s: 'stone', twin: false })
      BP.keep(b, { x: 990, floors: 2, m: 'wood', s: 'wood', w: 110, roof: 'straw' })
    },
  },
  // 6. Les trônes : citadelles de marbre, barils et chevaliers.
  {
    shots: 9, wind: 0.55, theme: 10, ammo: { boulder: 3, bomb: 3, fire: 1 },
    build(b) {
      BP.fortress(b, { x: 900, floors: 5, side: 3, m: 'marble', top: 'brick', split: 2, s: 'marble', h: 88, king: true, barrel: true })
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
