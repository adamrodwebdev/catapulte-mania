import { StructureBuilder } from './StructureBuilder.js'
import { LEVEL_SPECS } from './levelSpecs.js'
import { GAME } from '../../config/gameConfig.js'
import { Schema, Guard, deepFreeze } from '../../core/utils/Guard.js'
import { MATERIAL_NAMES } from '../entities/materials.js'
import { TARGET_TYPES, PROJECTILE_NAMES } from '../entities/catalog.js'
import { referenceScore, maxScore } from '../score/ScoreRules.js'

const coord = Schema.number({ min: -500, max: 4000 })
const size = Schema.number({ min: 6, max: 600 })

/** Schéma d'un niveau construit : protège contre une erreur de saisie dans levelSpecs.js. */
const levelSchema = Schema.object(
  {
    shots: Schema.int({ min: 1, max: 12 }),
    wind: Schema.number({ min: 0, max: 1 }),
    ammo: Schema.record(new RegExp(`^(?:${PROJECTILE_NAMES.join('|')})$`), Schema.int({ min: 0, max: 10 }), { maxKeys: 5 }),
    blocks: Schema.array(
      Schema.object({ material: Schema.enum(MATERIAL_NAMES), x: coord, y: coord, w: size, h: size, shape: Schema.enum(['rect', 'triangle']) }),
      { maxLength: 200 },
    ),
    targets: Schema.array(Schema.object({ type: Schema.enum(Object.keys(TARGET_TYPES)), x: coord, y: coord }), { maxLength: 20 }),
    barrels: Schema.array(Schema.object({ x: coord, y: coord }), { maxLength: 20 }),
  },
  { strict: true },
)

/**
 * Catalogue des niveaux : construit les 40 niveaux une seule fois, les valide,
 * calcule leurs barèmes puis les gèle (lecture seule).
 */
export class LevelRepository {
  /** @type {ReadonlyArray<object> | null} */
  static #levels = null

  static #build() {
    return LEVEL_SPECS.map((spec, i) => {
      const id = i + 1
      const b = new StructureBuilder()
      spec.build(b)
      const data = levelSchema(
        { shots: spec.shots, wind: spec.wind, ammo: { ...spec.ammo }, blocks: b.blocks, targets: b.targets, barrels: b.barrels },
        `level ${id}`,
      )
      if (!data.targets.length) throw new Error(`level ${id}: no target`)
      const bounds = b.bounds()
      const level = {
        id,
        chapter: Math.ceil(id / GAME.LEVELS_PER_CHAPTER),
        seed: (id * 2654435761) >>> 0,
        ...data,
        focus: { left: 0, right: Math.max(1500, bounds.right + 160), top: Math.min(250, bounds.top - 180) },
      }
      level.reference = referenceScore(level)
      level.maxScore = maxScore(level)
      return deepFreeze(level)
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

  /** Éléments de gameplay rencontrés pour la première fois (matériau, cible, baril). */
  static novelties(id) {
    const seen = new Set()
    for (const l of LevelRepository.all().slice(0, id - 1)) {
      l.blocks.forEach((b) => seen.add(`material:${b.material}`))
      l.targets.forEach((t) => seen.add(`target:${t.type}`))
      if (l.barrels.length) seen.add('barrel')
    }
    const level = LevelRepository.get(id)
    const now = new Set()
    level.blocks.forEach((b) => now.add(`material:${b.material}`))
    level.targets.forEach((t) => now.add(`target:${t.type}`))
    if (level.barrels.length) now.add('barrel')
    LevelRepository.newAmmo(id).forEach((a) => now.add(`ammo:${a}`))
    return [...now].filter((k) => !seen.has(k))
  }
}
