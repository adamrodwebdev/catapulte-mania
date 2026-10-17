import { Guard, deepFreeze } from '../../core/utils/Guard.js'
import { BP } from './blueprints.js'
import { buildLevel } from './LevelRepository.js'
import { RAIDER_TYPE, raiderTorch } from './campaignRules.js'

/**
 * Les Terres du Duc (v6.2) : le chapitre secret de la maîtrise du royaume.
 *
 * Le duc Aymeric de Valombre ouvre ses cinq châteaux d'exception au Grand
 * Ingénieur du Royaume : chacun combine les mécanismes du jeu (pont-levis et
 * potence, fer rougi et citerne, palais de glace, aiguilles et moulin, grand
 * siège). Tout l'arsenal y brille ; la pierre seule suffit pourtant à les prendre.
 * Chaque château a le décor (et le souffle) d'un chapitre de la campagne.
 */

/** Pillard posté au sol (torche pour celui qui porte le feu). */
function raider(b, x, raid) {
  b.target(b.spot(x, b.ground), RAIDER_TYPE[raid])
  Object.assign(b.targets.at(-1), { raid, ...(raiderTorch(raid) ? { torch: true } : {}) })
}

export const DUKE_SPECS = deepFreeze([
  // 1. Le Gué du Duc : des douves, un pont-levis qui s'abat sur la garde de la
  //    porte, une salle suspendue entre deux tours, une potence derrière.
  {
    chapter: 1,
    shots: 6,
    wind: 0.5,
    ammo: { boulder: 2, bomb: 2, fire: 2, bale: 1 },
    build(b) {
      b.zones.push({ kind: 'lake', x0: 960, x1: 1140 })
      const a = b.tower(1350, { floors: 4, mats: ['stone', 'stone', 'brick', 'brick'], slab: 'iron', t: 26 })
      const c = b.tower(1750, { floors: 4, mats: ['stone', 'stone', 'wood', 'wood'], slab: 'iron', t: 26 })
      b.plank(1350, 1750, a[3].topY, { mat: 'wood', t: 22 })
      const hall = b.room(1550, a[3].topY - 22, { mat: 'wood', w: 150, h: 95 })
      b.target(hall, 'knight', -30)
      b.target(hall, 'soldier', 30)
      // Le tablier dressé devant la porte, sa chaîne au pilier du premier étage.
      const post = a[1].posts[0]
      b.drawbridge(1240, { block: post, x: post.x - 13, y: post.y - 12 })
      b.target(b.spot(1165, b.ground))
      b.target(b.spot(1200, b.ground), 'shieldbearer')
      b.target(a[0], 'knight')
      b.target(c[0], 'knight')
      b.target(c[2])
      // La potence, derrière : sa charge pend au-dessus d'un garde.
      b.target(b.gallows(1960))
    },
  },
  // 2. La Forge Royale : une crypte de fer sous une salle de bois. Le feu rougit
  //    le fer, qui brûle qui le touche ; la citerne, crevée, trempe la garde, et
  //    l'orbe d'orage foudroie tous ceux qui sont trempés.
  {
    chapter: 3,
    shots: 6,
    wind: 0.55,
    ammo: { fire: 3, thunder: 2, bomb: 2, frost: 1 },
    build(b) {
      BP.crypt(b, { x: 1500, vault: 'iron', hall: 'wood', floors: 3, barrels: 2, sideMat: 'iron' })
      b.prop('forge', b.spot(1180, b.ground))
      b.cistern(2010)
      b.target(b.spot(1990, b.ground), 'knight')
      b.target(b.spot(2030, b.ground))
      raider(b, 1250, 'fire')
    },
  },
  // 3. Le Palais de Glace : douves gelées, un palais de glace et de marbre. Le
  //    feu fait fondre la glace (vapeur), une bombe la fait voler en éclats.
  {
    chapter: 8,
    shots: 6,
    wind: 0.55,
    ammo: { fire: 3, bomb: 2, frost: 2, boulder: 2 },
    build(b) {
      b.zones.push({ kind: 'ice', x0: 1000, x1: 1230 })
      const k = b.tower(1520, { floors: 4, mats: ['marble', 'ice', 'ice', 'ice'], slab: 'ice', w: 170, t: 24, roof: 'wood' })
      b.target(k[0], 'knight', -40)
      b.target(k[0], 'knight', 40)
      b.target(k[1], 'soldier')
      b.target(k[2], 'king')
      b.target(k[3], 'soldier')
      const wing = b.tower(1780, { floors: 2, mat: 'ice', slab: 'marble', w: 120, t: 24, roof: 'straw' })
      b.target(wing[0])
      b.target(wing[1], 'scout')
      raider(b, 1300, 'frost')
    },
  },
  // 4. Les Aiguilles du Duc : deux très hautes tours reliées au sommet, un
  //    moulin qui souffle vers l'engin, les courants chauds de la montagne.
  //    Les clés de voûte font tout s'écrouler… si on les trouve.
  {
    chapter: 7,
    shots: 6,
    wind: 0.6,
    ammo: { boulder: 3, bomb: 2, split: 2, bale: 1 },
    build(b) {
      BP.twins(b, { x: 1600, gap: 320, floors: 7, m: 'stone', top: 'wood', split: 3, s: 'stone', plank: 'wood', watchers: 2, h: 90 })
      b.windmill(1250)
      raider(b, 1340, 'blow')
    },
  },
  // 5. La Citadelle de Mordrac : le grand siège. La forteresse et ses gardes,
  //    puis l'escalier d'honneur : Mordrac en personne au sommet de la dernière
  //    tour, ses barils au pied des grandes. Le rez-de-chaussée du donjon n'est
  //    que sa poudrière (v6.2) : sous cinq étages de marbre et de fer, un garde
  //    y était hors d'atteinte de la pierre ; le baril y reste pour les bombes.
  {
    chapter: 10,
    shots: 5,
    wind: 0.7,
    ammo: { boulder: 3, bomb: 3, fire: 2, thunder: 1, poison: 1 },
    build(b) {
      BP.fortress(b, { x: 1600, floors: 6, side: 4, m: 'marble', top: 'iron', split: 3, s: 'marble', h: 88, king: false, barrel: true, guard: null })
      raider(b, 1250, 'fire')
      raider(b, 1210, 'fire')
    },
    stages: [
      {
        // Six tirs (v6.2, quatre auparavant) : Mordrac a quatre vies, et il n'en
        // perd qu'une par tir ; à la seule pierre, ses renforts finissaient par
        // l'emporter. Le par ne change pas : l'or reste un défi d'expert.
        shots: 6,
        par: 2,
        build: (b) => {
          let top = null
          for (let i = 0; i < 4; i++) {
            const floors = 2 + i
            const r = b.tower(1340 + i * 170, { floors, mats: ['marble', 'marble', 'iron', 'iron', 'iron'], slab: 'marble', w: 110, t: 24, h: 92, roof: i === 3 ? 'stone' : 'straw' })
            if (i < 3) b.target(r[floors - 1], i % 2 ? 'knight' : 'soldier')
            if (floors >= 4) b.barrel(r[0])
            top = r[floors - 1]
          }
          b.general(top, 'mordrac')
          b.target(b.spot(1180, b.ground), 'shieldbearer')
        },
      },
    ],
  },
])

/** Catalogue des Terres du Duc : construit une fois, validé, gelé. */
export class DukeRepository {
  /** @type {ReadonlyArray<object> | null} */
  static #levels = null

  static all() {
    if (!DukeRepository.#levels) {
      DukeRepository.#levels = Object.freeze(DUKE_SPECS.map((spec, i) => buildLevel(spec, i + 1, spec.chapter, 7000, { track: 'duke' })))
    }
    return DukeRepository.#levels
  }

  /** @param {number} id 1 à 5 */
  static get(id) {
    Guard.int(id, 'duke level', { min: 1, max: DUKE_SPECS.length })
    return DukeRepository.all()[id - 1]
  }

  static get count() {
    return DUKE_SPECS.length
  }
}
