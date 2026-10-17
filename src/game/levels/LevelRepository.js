import { StructureBuilder } from './StructureBuilder.js'
import { LEVEL_SPECS } from './levelSpecs.js'
import { LEVEL_SPECS_2 } from './levelSpecs2.js'
import { GAME, IS_DEMO } from '../../config/gameConfig.js'
import { Schema, Guard, deepFreeze } from '../../core/utils/Guard.js'
import { MATERIAL_NAMES } from '../entities/materials.js'
import { TARGET_TYPES, PROJECTILE_NAMES, FLYER_NAMES } from '../entities/catalog.js'
import { referenceScore, maxScore } from '../score/ScoreRules.js'
import { achievementsFor } from '../progression/Achievements.js'
import { PowerRegistry } from '../powers/PowerRegistry.js'
import { TREBUCHET_UNLOCK } from '../Trebuchet.js'
import { applyCurve, ammoFor, AMMO_UNLOCK } from './LevelCurve.js'
import { ZONE_KINDS } from '../physics/Terrain.js'
import { GENERAL_IDS } from '../bosses/generals.js'
import { PROP_NAMES } from '../entities/props.js'
import { worldWindFor } from '../physics/WorldWinds.js'
import { findKeystones, KEYSTONE } from '../physics/castleRules.js'
import { WORLD } from '../physics/constants.js'
import { DRIVE } from '../drive/driveRules.js'
import { GAUGE } from './campaignRules.js'


const coord = Schema.number({ min: -500, max: 4000 })
const WORLD_GROUND = WORLD.GROUND_Y
const size = Schema.number({ min: 6, max: 600 })

const blocksSchema = Schema.array(
  // angle (v6.0) : un tablier de pont-levis légèrement penché ; 0 pour tout le reste.
  // prop (v6.1) : ouvrage (moulin, forge, citerne, ruche, farine ; voir entities/props.js).
  Schema.object({ material: Schema.enum(MATERIAL_NAMES), x: coord, y: coord, w: size, h: size, shape: Schema.enum(['rect', 'triangle']), angle: Schema.optional(Schema.number({ min: -0.5, max: 0.5 }), 0), prop: Schema.optional(Schema.nullable(Schema.enum(PROP_NAMES)), null), keystone: Schema.optional(Schema.boolean(), false) }),
  { maxLength: 200 },
)
const targetsSchema = Schema.array(
  // patrol (v5.1) : demi-longueur de la ronde (0 = immobile).
  // torch (v5.8) : veilleur de nuit, sa torche met le feu là où il tombe.
  // raid (v5.8) : pillard qui court attaquer l'engin du joueur.
  // general (v6.0) : lequel des généraux de Mordrac (cible de type « general »).
  Schema.object({
    type: Schema.enum(Object.keys(TARGET_TYPES)),
    x: coord,
    y: coord,
    patrol: Schema.optional(Schema.int({ min: 0, max: 200 }), 0),
    torch: Schema.optional(Schema.boolean(), false),
    raid: Schema.optional(Schema.nullable(Schema.enum(['fire', 'frost', 'blow', 'smash'])), null),
    general: Schema.optional(Schema.nullable(Schema.enum(GENERAL_IDS)), null),
  }),
  // 24 (v6.2) : la Campagne héroïque ajoute un pillard aux étapes déjà pleines (20 défenseurs au niveau 90).
  { maxLength: 24 },
)
const barrelsSchema = Schema.array(Schema.object({ x: coord, y: coord }), { maxLength: 20 })
/** Mécanismes (v6.0) : liens entre deux blocs (rang dans `blocks`, point dans le repère du bloc), charnières. */
const offset = Schema.number({ min: -300, max: 300 })
const blockIndex = Schema.int({ min: 0, max: 199 })
const tethersSchema = Schema.array(
  Schema.object({ kind: Schema.enum(['rope', 'chain']), a: blockIndex, ax: offset, ay: offset, b: blockIndex, bx: offset, by: offset }),
  { maxLength: 8 },
)
const hingesSchema = Schema.array(Schema.object({ b: blockIndex, x: coord, y: coord }), { maxLength: 6 })

/** Liens et charnières du constructeur → rangs des blocs (après la courbe de la campagne). */
function mechanisms(sb, where) {
  const at = (block) => {
    const i = sb.blocks.indexOf(block)
    if (i < 0) throw new Error(`${where}: mechanism on an unknown block`)
    return i
  }
  return {
    tethers: sb.tethers.map((t) => ({ kind: t.kind, a: at(t.a), ax: t.ax, ay: t.ay, b: at(t.b), bx: t.bx, by: t.by })),
    // Point de la charnière dans le monde (le bloc peut être incliné).
    hinges: sb.hinges.map((h) => {
      const a = h.b.angle ?? 0
      return { b: at(h.b), x: h.b.x + h.dx * Math.cos(a) - h.dy * Math.sin(a), y: h.b.y + h.dx * Math.sin(a) + h.dy * Math.cos(a) }
    }),
  }
}
const flyersSchema = Schema.array(
  Schema.object({
    type: Schema.enum(FLYER_NAMES),
    x: coord,
    y: Schema.number({ min: -800, max: 1000 }),
    range: Schema.number({ min: 0, max: 900 }),
    period: Schema.number({ min: 1500, max: 20000 }),
    phase: Schema.number({ min: 0, max: 1 }),
  }),
  { maxLength: 8 },
)

/** Schéma d'un niveau construit : protège contre une erreur de saisie dans levelSpecs.js. */
const levelSchema = Schema.object(
  {
    // v6.0 : jusqu'à 16 tirs (grands sièges en plusieurs étapes).
    shots: Schema.int({ min: 1, max: 16 }),
    wind: Schema.number({ min: 0, max: 1 }),
    ammo: Schema.record(new RegExp(`^(?:${PROJECTILE_NAMES.join('|')})$`), Schema.int({ min: 0, max: 10 }), { maxKeys: 10 }),
    blocks: blocksSchema,
    targets: targetsSchema,
    barrels: barrelsSchema,
    // v5.0 : terrains du sol et créatures volantes.
    zones: Schema.array(Schema.object({ kind: Schema.enum(ZONE_KINDS), x0: coord, x1: coord }), { maxLength: 6 }),
    flyers: flyersSchema,
    tethers: tethersSchema,
    hinges: hingesSchema,
  },
  { strict: true },
)

/**
 * Étape suivante d'un grand siège (v6.0) : un autre château, sur le même
 * terrain, avec les tirs et les munitions qui restent. Son `focus` cadre la
 * caméra ; `shots` et `par` s'ajoutent à ceux du niveau.
 */
const stageSchema = Schema.object({ blocks: blocksSchema, targets: targetsSchema, barrels: barrelsSchema, flyers: flyersSchema, tethers: tethersSchema, hinges: hingesSchema }, { strict: true })

/** Un général n'apparaît qu'en cible de type « general », et une cible « general » a toujours son général. */
function checkGenerals(targets, where) {
  for (const t of targets) {
    if ((t.type === 'general') !== Boolean(t.general)) throw new Error(`${where}: a general target needs its general id (and only it)`)
  }
}

/**
 * Construit, valide et gèle un niveau à partir de sa description.
 * Partagé avec les châteaux de duel (DuelRepository).
 * @param {{ shots: number, wind: number, ammo: object, build: (b: StructureBuilder) => void }} spec
 * @param {number} id
 * @param {number} chapter thème du décor (1 à 10)
 */
/**
 * @param {{ tutorial?: string | null, rank?: number | null, track?: 'campaign' | 'heroic' | 'duke', heroic?: boolean }} [opts]
 *   track (v6.2) : parcours du niveau (ses records) ; heroic : variante de la Campagne héroïque
 */
export function buildLevel(spec, id, chapter, seedSalt = 0, { tutorial = null, rank = null, track = 'campaign', heroic = false } = {}) {
  const b = new StructureBuilder()
  spec.build(b)
  // Campagne : distance, décor et garnison selon le rang du niveau (LevelCurve).
  let ammo = { ...spec.ammo }
  let shots = spec.shots
  if (rank) {
    const { terrain } = applyCurve(b, rank, { heroic })
    // Montagne ET douves de lave ou d'eau : un tir de plus pour composer avec les deux.
    if (terrain.mountain && b.zones.some((z) => z.kind === 'lava' || z.kind === 'lake') && b.blocks.some((k) => k.material === 'rock' && k.shape === 'triangle' && k.x < 1100)) shots = Math.min(12, shots + 1)
    const cold = b.zones.some((z) => z.kind !== 'lake')
    ammo = ammoFor(rank, ammo, { cold })
  }
  // Grands sièges (v6.0) : les étapes suivantes, chacune avec ses tirs en plus. Le terrain
  // (plateaux de roche, douves) reste celui du niveau : `floorAt(x)` donne le dessus du sol.
  const rock = b.blocks.filter((k) => k.material === 'rock' && k.shape === 'rect')
  const floorAt = (x) => rock.filter((k) => Math.abs(x - k.x) <= k.w / 2).reduce((top, k) => Math.min(top, k.y - k.h / 2), WORLD_GROUND)
  // Points sensibles (v6.2) : les clés de voûte du château, d'après sa géométrie.
  if (!rank || rank >= KEYSTONE.FROM) markKeystones(b)
  const stages = (spec.stages ?? []).map((st, i) => {
    const sb = new StructureBuilder()
    st.build(sb, { floorAt })
    if (!rank || rank >= KEYSTONE.FROM) markKeystones(sb)
    const where = `level ${id} stage ${i + 2}`
    const d = stageSchema({ blocks: sb.blocks, targets: sb.targets, barrels: sb.barrels, flyers: sb.flyers, ...mechanisms(sb, where) }, where)
    if (!d.targets.length) throw new Error(`${where}: no target`)
    checkGenerals(d.targets, where)
    const sbounds = sb.bounds()
    return {
      ...d,
      shots: Guard.int(st.shots, `${where} shots`, { min: 1, max: 8 }),
      par: Guard.int(st.par ?? 1, `${where} par`, { min: 1, max: 6 }),
      focus: { left: 0, right: Math.max(1500, sbounds.right + 160), top: Math.min(250, sbounds.top - 180) },
    }
  })
  shots += stages.reduce((s, st) => s + st.shots, 0)
  const data = levelSchema(
    { shots, wind: spec.wind, ammo, blocks: b.blocks, targets: b.targets, barrels: b.barrels, zones: b.zones, flyers: b.flyers, ...mechanisms(b, `level ${id}`) },
    `level ${id}`,
  )
  if (!data.targets.length) throw new Error(`level ${id}: no target`)
  checkGenerals(data.targets, `level ${id}`)
  const bounds = b.bounds()
  const level = {
    id,
    chapter,
    seed: ((id + seedSalt) * 2654435761) >>> 0,
    ...data,
    focus: { left: 0, right: Math.max(1500, bounds.right + 160), top: Math.min(250, bounds.top - 180) },
    stages,
    stageCount: 1 + stages.length,
    /** Général de Mordrac qui défend ce niveau (fin de chapitre), ou null. */
    general: [...data.targets, ...stages.flatMap((st) => st.targets)].find((t) => t.general)?.general ?? null,
  }
  // Étoiles : 3 en `par` tirs (1, ou 2 pour les châteaux très garnis), 2 en `star2` tirs.
  // Grand siège : le par de chaque étape s'ajoute.
  const basePar = spec.par ?? (data.targets.length >= 6 ? 2 : 1)
  level.par = Guard.int(basePar + stages.reduce((s, st) => s + st.par, 0), `level ${id} par`, { min: 1, max: data.shots })
  level.star2 = Math.min(data.shots, level.par + Math.max(1, Math.floor((data.shots - level.par) / 2)))
  // Outil présenté par un tutoriel guidé (voir LevelRepository.tutorialFor).
  level.tutorial = tutorial
  // Parcours (v6.2) : campagne, Campagne héroïque ou Terres du Duc.
  level.track = track
  // Seaux d'eau (v5.8) : deux par niveau où un pillard porte une torche (un en Difficile).
  level.buckets = Guard.int(spec.buckets ?? (data.targets.some((t) => t.raid === 'fire') ? 2 : 0), `level ${id} buckets`, { min: 0, max: 5 })
  level.achievements = achievementsFor(level)
  level.reference = referenceScore(level)
  level.maxScore = maxScore(level)
  return deepFreeze(level)
}

/**
 * Clés de voûte (v6.2, voir CastleJoints.findKeystones) : marquées sur les
 * définitions des blocs ; les blocs des mécanismes (potence, pont-levis) n'en
 * sont jamais.
 * @param {StructureBuilder} b
 */
function markKeystones(b) {
  const skip = new Set()
  for (const t of b.tethers ?? []) {
    for (const block of [t.a, t.b]) {
      const i = b.blocks.indexOf(block)
      if (i >= 0) skip.add(i)
    }
  }
  for (const h of b.hinges ?? []) {
    const i = b.blocks.indexOf(h.block ?? h.b)
    if (i >= 0) skip.add(i)
  }
  for (const i of findKeystones(b.blocks, skip)) b.blocks[i].keystone = true
}

/**
 * Ouvrages que les pillards devront bâtir dans ce niveau (v5.8) : échelle pour
 * une montagne ou un plateau, pont pour des douves au ras du sol.
 * @returns {('build:ladder' | 'build:bridge')[]}
 */
function worksOf(level) {
  const raiders = level.targets.filter((t) => t.raid)
  if (!raiders.length) return []
  // v6.2 : seul ce qu'un pillard doit franchir compte (l'embusqué du champ n'a ni pont ni échelle à bâtir).
  const far = Math.max(...raiders.map((t) => t.x))
  const plateau = raiders.some((t) => t.y + TARGET_TYPES[t.type].h / 2 < WORLD_GROUND - 20) && level.blocks.some((b) => b.material === 'rock' && b.shape === 'rect' && b.y < WORLD_GROUND - 20)
  const mountain = level.blocks.some((b) => b.material === 'rock' && b.shape === 'triangle' && b.h >= 150 && b.x < 1100 && b.x - b.w / 2 < far)
  const moat = level.zones.some((z) => (z.kind === 'lake' || z.kind === 'lava' || z.kind === 'ice') && z.x0 < far)
  const out = []
  if (plateau || mountain) out.push('build:ladder')
  if (moat && !plateau) out.push('build:bridge')
  return out
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

  /** Campagne héroïque (v6.2) : variantes construites à la demande. */
  static #heroic = new Map()

  /**
   * Niveau de la Campagne héroïque : le même château, avec un pillard de plus
   * (voir LevelCurve.raidFor) ; plus solide en partie (voir HeroicMode).
   */
  static heroic(id) {
    Guard.int(id, 'level id', { min: 1, max: GAME.LEVEL_COUNT })
    let level = LevelRepository.#heroic.get(id)
    if (!level) {
      const spec = [...LEVEL_SPECS, ...LEVEL_SPECS_2][id - 1]
      level = buildLevel(spec, id, Math.ceil(id / GAME.LEVELS_PER_CHAPTER), 0, { rank: id, track: 'heroic', heroic: true })
      LevelRepository.#heroic.set(id, level)
    }
    return level
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
      // Un pillard a sa propre fiche (v6.2) : il ne présente pas son type de défenseur.
      l.targets.forEach((t) => !t.raid && seen.add(`target:${t.type}`))
      // Veilleurs de nuit (les pillards à la torche ont leur propre fiche).
      if (l.targets.some((t) => t.torch && !t.raid)) seen.add('torch')
      l.targets.forEach((t) => t.raid && seen.add(`raid:${t.raid}`))
      if (l.buckets) seen.add('buckets')
      for (const w of worksOf(l)) seen.add(w)
      if (l.barrels.length) seen.add('barrel')
      l.zones.forEach((z) => seen.add(`terrain:${z.kind}`))
      l.flyers.forEach((f) => seen.add(`flyer:${f.type}`))
      if (l.blocks.some((b) => b.material === 'rock' && b.shape === 'triangle' && b.h >= 150 && b.x < 1100)) seen.add('terrain:mountain')
      // Grands sièges (v6.0) : les défenseurs des étapes suivantes comptent aussi.
      for (const st of l.stages ?? []) st.targets.forEach((t) => seen.add(`target:${t.type}`))
      // Mécanismes (v6.0) : potence (corde) et pont-levis (chaîne).
      for (const t of [l, ...(l.stages ?? [])].flatMap((p) => p.tethers ?? [])) seen.add(t.kind === 'chain' ? 'contraption:drawbridge' : 'contraption:gallows')
      if (l.stageCount > 1) seen.add('siege')
      // v6.1 : ouvrages et souffle du monde.
      for (const p of [l, ...(l.stages ?? [])]) p.blocks.forEach((b) => b.prop && seen.add(`prop:${b.prop}`))
      seen.add(`wind:${worldWindFor(l.chapter)}`)
      if ([l, ...(l.stages ?? [])].some((p) => p.blocks.some((b) => b.keystone))) seen.add('keystone')
    }
    const level = LevelRepository.get(id)
    const now = new Set()
    level.blocks.forEach((b) => now.add(`material:${b.material}`))
    level.targets.forEach((t) => !t.raid && now.add(`target:${t.type}`))
    if (level.targets.some((t) => t.torch && !t.raid)) now.add('torch')
    level.targets.forEach((t) => t.raid && now.add(`raid:${t.raid}`))
    if (level.buckets) now.add('buckets')
    for (const w of worksOf(level)) now.add(w)
    if (level.barrels.length) now.add('barrel')
    level.zones.forEach((z) => now.add(`terrain:${z.kind}`))
    level.flyers.forEach((f) => now.add(`flyer:${f.type}`))
    if (level.blocks.some((b) => b.material === 'rock' && b.shape === 'triangle' && b.h >= 150 && b.x < 1100)) now.add('terrain:mountain')
    LevelRepository.newAmmo(id).forEach((a) => now.add(`ammo:${a}`))
    if (id === TREBUCHET_UNLOCK + 1) now.add('engine:trebuchet')
    for (const st of level.stages ?? []) st.targets.forEach((t) => now.add(`target:${t.type}`))
    if (level.stageCount > 1) now.add('siege')
    for (const t of [level, ...(level.stages ?? [])].flatMap((p) => p.tethers ?? [])) now.add(t.kind === 'chain' ? 'contraption:drawbridge' : 'contraption:gallows')
    // Jauge de destruction (v6.0, voir GameSession) : présentée au niveau où elle apparaît.
    if (id === GAUGE.FROM_LEVEL) now.add('gauge')
    // v6.2 : l'engin roule (présenté au niveau où les boutons apparaissent).
    if (id === DRIVE.FROM_LEVEL) now.add('drive')
    // v6.1 : ouvrages et souffle du monde (le vent simple n'a pas de fiche).
    for (const p of [level, ...(level.stages ?? [])]) p.blocks.forEach((b) => b.prop && now.add(`prop:${b.prop}`))
    // v6.2 : points sensibles (clés de voûte), présentés la première fois.
    if ([level, ...(level.stages ?? [])].some((p) => p.blocks.some((b) => b.keystone))) now.add('keystone')
    const wind = worldWindFor(level.chapter)
    if (wind !== 'breeze') now.add(`wind:${wind}`)
    // Le général a sa propre fiche dans l'introduction (voir GameScreen.vue).
    now.delete('target:general')
    // La roche du décor n'a pas de fiche : celle de la montagne la présente (v6.1, plus de clé brute à l'écran).
    now.delete('material:rock')
    return [...now].filter((k) => !seen.has(k))
  }
}
