import { StructureBuilder } from './StructureBuilder.js'
import { LEVEL_SPECS } from './levelSpecs.js'
import { LEVEL_SPECS_2 } from './levelSpecs2.js'
import { GAME, IS_DEMO } from '../../config/gameConfig.js'
import { Schema, Guard, deepFreeze } from '../../core/utils/Guard.js'
import { MATERIAL_NAMES } from '../entities/materials.js'
import { TARGET_TYPES, PROJECTILE_NAMES } from '../entities/catalog.js'
import { referenceScore, maxScore } from '../score/ScoreRules.js'
import { achievementsFor } from '../progression/Achievements.js'
import { PowerRegistry } from '../powers/PowerRegistry.js'
import { TREBUCHET_UNLOCK } from '../Trebuchet.js'
import { applyCurve, ammoFor, AMMO_UNLOCK } from './LevelCurve.js'
import { ZONE_KINDS } from '../physics/Terrain.js'
import { FLYER_NAMES } from '../entities/Flyer.js'

const coord = Schema.number({ min: -500, max: 4000 })
const size = Schema.number({ min: 6, max: 600 })

/** Schéma d'un niveau construit : protège contre une erreur de saisie dans levelSpecs.js. */
const levelSchema = Schema.object(
  {
    shots: Schema.int({ min: 1, max: 12 }),
    wind: Schema.number({ min: 0, max: 1 }),
    ammo: Schema.record(new RegExp(`^(?:${PROJECTILE_NAMES.join('|')})$`), Schema.int({ min: 0, max: 10 }), { maxKeys: 6 }),
    blocks: Schema.array(
      Schema.object({ material: Schema.enum(MATERIAL_NAMES), x: coord, y: coord, w: size, h: size, shape: Schema.enum(['rect', 'triangle']) }),
      { maxLength: 200 },
    ),
    targets: Schema.array(
      // patrol (v5.1) : demi-longueur de la ronde (0 = immobile).
      Schema.object({ type: Schema.enum(Object.keys(TARGET_TYPES)), x: coord, y: coord, patrol: Schema.optional(Schema.int({ min: 0, max: 200 }), 0) }),
      { maxLength: 20 },
    ),
    barrels: Schema.array(Schema.object({ x: coord, y: coord }), { maxLength: 20 }),
    // v5.0 : terrains du sol et créatures volantes.
    zones: Schema.array(Schema.object({ kind: Schema.enum(ZONE_KINDS), x0: coord, x1: coord }), { maxLength: 6 }),
    flyers: Schema.array(
      Schema.object({
        type: Schema.enum(FLYER_NAMES),
        x: coord,
        y: Schema.number({ min: -800, max: 1000 }),
        range: Schema.number({ min: 0, max: 900 }),
        period: Schema.number({ min: 1500, max: 20000 }),
        phase: Schema.number({ min: 0, max: 1 }),
      }),
      { maxLength: 8 },
    ),
  },
  { strict: true },
)

/**
 * Construit, valide et gèle un niveau à partir de sa description.
 * Partagé avec les châteaux de duel (DuelRepository).
 * @param {{ shots: number, wind: number, ammo: object, build: (b: StructureBuilder) => void }} spec
 * @param {number} id
 * @param {number} chapter thème du décor (1 à 10)
 */
export function buildLevel(spec, id, chapter, seedSalt = 0, { tutorial = null, rank = null } = {}) {
  const b = new StructureBuilder()
  spec.build(b)
  // Campagne : distance, décor et garnison selon le rang du niveau (LevelCurve).
  let ammo = { ...spec.ammo }
  let shots = spec.shots
  if (rank) {
    const { terrain } = applyCurve(b, rank)
    // Montagne ET douves de lave ou d'eau : un tir de plus pour composer avec les deux.
    if (terrain.mountain && b.zones.some((z) => z.kind === 'lava' || z.kind === 'lake') && b.blocks.some((k) => k.material === 'rock' && k.shape === 'triangle' && k.x < 1100)) shots = Math.min(12, shots + 1)
    const cold = b.zones.some((z) => z.kind !== 'lake')
    ammo = ammoFor(rank, ammo, { cold })
  }
  const data = levelSchema(
    { shots, wind: spec.wind, ammo, blocks: b.blocks, targets: b.targets, barrels: b.barrels, zones: b.zones, flyers: b.flyers },
    `level ${id}`,
  )
  if (!data.targets.length) throw new Error(`level ${id}: no target`)
  const bounds = b.bounds()
  const level = {
    id,
    chapter,
    seed: ((id + seedSalt) * 2654435761) >>> 0,
    ...data,
    focus: { left: 0, right: Math.max(1500, bounds.right + 160), top: Math.min(250, bounds.top - 180) },
  }
  // Étoiles : 3 en `par` tirs (1, ou 2 pour les châteaux très garnis), 2 en `star2` tirs.
  level.par = Guard.int(spec.par ?? (data.targets.length >= 6 ? 2 : 1), `level ${id} par`, { min: 1, max: data.shots })
  level.star2 = Math.min(data.shots, level.par + Math.max(1, Math.floor((data.shots - level.par) / 2)))
  // Outil présenté par un tutoriel guidé (voir LevelRepository.tutorialFor).
  level.tutorial = tutorial
  level.achievements = achievementsFor(level)
  level.reference = referenceScore(level)
  level.maxScore = maxScore(level)
  return deepFreeze(level)
}

/**
 * Démo (v4.6) : les niveaux qui montrent le meilleur du jeu, dans l'ordre où on
 * les joue (numéros dans la campagne). Premier tir, baril, point de rupture,
 * trébuchet, feu, boulets et barils, bombe et fer, mitraille, puis deux
 * châteaux de fin de partie (plateau rocheux, aiguille et baril).
 * Les autres niveaux suivent, verrouillés.
 */
export const DEMO_SHOWCASE = Object.freeze([1, 2, 3, 4, 5, 7, 10, 14, 24, 39])

/** Ordre de jeu : numéros de campagne des niveaux 1, 2, 3… */
function playOrder(demo) {
  const all = Array.from({ length: GAME.LEVEL_COUNT }, (_, i) => i + 1)
  return demo ? [...DEMO_SHOWCASE, ...all.filter((id) => !DEMO_SHOWCASE.includes(id))] : all
}

/**
 * Catalogue des niveaux : construit les 100 niveaux une seule fois, les valide,
 * calcule leurs barèmes puis les gèle (lecture seule).
 */
export class LevelRepository {
  /** @type {ReadonlyArray<object> | null} */
  static #levels = null
  /** Ordre « démo » (build de démonstration, ou forcé par les outils de contrôle). */
  static #demo = IS_DEMO

  /** Outils (scripts/check-levels.mjs) : construire le catalogue dans l'ordre de la démo. */
  static useDemoOrder(on = true) {
    LevelRepository.#demo = Boolean(on)
    LevelRepository.#levels = null
  }

  static #build() {
    const seen = new Set()
    const specs = [...LEVEL_SPECS, ...LEVEL_SPECS_2]
    return playOrder(LevelRepository.#demo).map((source, i) => {
      const spec = specs[source - 1]
      const id = i + 1
      // Tutoriel : la visée au niveau 1, puis chaque munition et chaque pouvoir
      // dans le niveau où ils apparaissent pour la première fois (munitions de
      // la courbe comprises, dans l'ordre où elles se débloquent).
      const fresh = Object.keys(ammoFor(source, spec.ammo))
        .filter((a) => !seen.has(a))
        .sort((a, b) => (AMMO_UNLOCK[a] ?? 99) - (AMMO_UNLOCK[b] ?? 99))
      fresh.forEach((a) => seen.add(a))
      const power = PowerRegistry.all().find((p) => p.unlockAfter === id - 1)
      // Le trébuchet a son propre niveau d'apprentissage, juste après son déblocage.
      const engine = id === TREBUCHET_UNLOCK + 1 ? 'engine:trebuchet' : null
      const tutorial = id === 1 ? 'aim' : id === 2 ? 'drag' : fresh.length ? `ammo:${fresh[0]}` : power ? `power:${power.id}` : engine
      // Le décor (chapitre) et la courbe de difficulté suivent le niveau d'origine.
      return buildLevel(spec, id, Math.ceil(source / GAME.LEVELS_PER_CHAPTER), 0, { tutorial, rank: source })
    })
  }

  static all() {
    if (!LevelRepository.#levels) {
      LevelRepository.#levels = Object.freeze(LevelRepository.#build())
      if (LevelRepository.#levels.length !== GAME.LEVEL_COUNT) {
        throw new Error(`expected ${GAME.LEVEL_COUNT} levels, got ${LevelRepository.#levels.length}`)
      }
    }
    return LevelRepository.#levels
  }

  static get(id) {
    Guard.int(id, 'level id', { min: 1, max: GAME.LEVEL_COUNT })
    return LevelRepository.all()[id - 1]
  }

  /** Munitions nouvelles introduites par ce niveau (pour l'écran d'introduction). */
  static newAmmo(id) {
    const cur = Object.keys(LevelRepository.get(id).ammo)
    const prev = new Set(LevelRepository.all().slice(0, id - 1).flatMap((l) => Object.keys(l.ammo)))
    return cur.filter((a) => !prev.has(a))
  }

  /**
   * Outil présenté par un tutoriel guidé dans ce niveau : la visée au niveau 1,
   * puis chaque munition et chaque pouvoir là où ils apparaissent pour la première fois.
   * @returns {string | null} 'aim' | 'ammo:<type>' | 'power:<id>'
   */
  static tutorialFor(id) {
    return LevelRepository.get(id).tutorial
  }

  /** Éléments de gameplay rencontrés pour la première fois (matériau, cible, baril). */
  static novelties(id) {
    const seen = new Set()
    for (const l of LevelRepository.all().slice(0, id - 1)) {
      l.blocks.forEach((b) => seen.add(`material:${b.material}`))
      l.targets.forEach((t) => seen.add(`target:${t.type}`))
      if (l.barrels.length) seen.add('barrel')
      l.zones.forEach((z) => seen.add(`terrain:${z.kind}`))
      l.flyers.forEach((f) => seen.add(`flyer:${f.type}`))
      if (l.blocks.some((b) => b.material === 'rock' && b.shape === 'triangle' && b.h >= 150 && b.x < 1100)) seen.add('terrain:mountain')
    }
    const level = LevelRepository.get(id)
    const now = new Set()
    level.blocks.forEach((b) => now.add(`material:${b.material}`))
    level.targets.forEach((t) => now.add(`target:${t.type}`))
    if (level.barrels.length) now.add('barrel')
    level.zones.forEach((z) => now.add(`terrain:${z.kind}`))
    level.flyers.forEach((f) => now.add(`flyer:${f.type}`))
    if (level.blocks.some((b) => b.material === 'rock' && b.shape === 'triangle' && b.h >= 150 && b.x < 1100)) now.add('terrain:mountain')
    LevelRepository.newAmmo(id).forEach((a) => now.add(`ammo:${a}`))
    if (id === TREBUCHET_UNLOCK + 1) now.add('engine:trebuchet')
    return [...now].filter((k) => !seen.has(k))
  }
}
