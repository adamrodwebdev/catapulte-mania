/**
 * Arguments des scripts, lus à la porte (règle du 9 novembre 2026) : la ligne
 * de commande est une donnée de l'extérieur. On écrit `--nom valeur`,
 * `--nom=valeur`, ou `--nom` seul pour un drapeau. Un argument inconnu, répété,
 * sans sa valeur (ou suivi d'un autre argument à la place) ou illisible est
 * refusé : le script s'arrête avec le code 2 avant tout travail, au lieu de
 * contrôler autre chose, ou rien, et de passer.
 *
 * Avant (v6.3.0) : `check:levels --levels abc` ne contrôlait aucun niveau et
 * passait, `--levels 1e1` contrôlait le niveau 10, `--workers four` prenait
 * tous les cœurs, `--level 5` (faute de frappe) les 100 niveaux ;
 * `release:portals --gd-id --y8-game 123` prenait « --y8-game » pour
 * l'identifiant GameDistribution ; `backgrounds --crop abc` encodait avec NaN.
 *
 * Module sans effet de bord : les tests le lisent sans lancer de script.
 */
import { InvalidInput, parseNumber, readChoice, readText } from '../src/core/utils/input.js'
import { TEXT_LIMITS } from '../src/config/limits.js'
import { GAME } from '../src/config/gameConfig.js'

/**
 * @typedef {{ flag: true } | { read: (text: string, name: string) => unknown }} OptionRule
 *   flag : présent ou absent ; read : lit la valeur (un texte déjà nettoyé et borné)
 */

/**
 * @param {readonly string[]} argv process.argv.slice(2)
 * @param {ReadonlyMap<string, OptionRule>} options les options du script, par nom (`--levels`)
 * @returns {Map<string, unknown>} la valeur lue de chaque option donnée (true pour un drapeau)
 * @throws {InvalidInput} sur un argument inconnu, répété, sans valeur ou illisible
 */
export function readArguments(argv, options) {
  const values = new Map()
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const [, name, inline] = /^(--[a-z][a-z0-9-]*)(?:=(.*))?$/s.exec(arg) ?? []
    const rule = name === undefined ? undefined : options.get(name)
    if (!rule) throw new InvalidInput(String(arg), 'not-a-choice')
    if (values.has(name)) throw new InvalidInput(name, 'too-many')
    if (rule.flag === true) {
      if (inline !== undefined) throw new InvalidInput(name, 'bad-format')
      values.set(name, true)
      continue
    }
    let text = inline
    if (text === undefined) {
      text = argv[i + 1]
      if (text === undefined || text.startsWith('--')) throw new InvalidInput(name, 'empty')
      i++
    }
    values.set(name, rule.read(readText(text, { maxLength: TEXT_LIMITS.scriptArgument, required: true }, name), name))
  }
  return values
}

/**
 * Liste de niveaux (`13,29,41-50`) : des numéros entiers de 1 à `max`, des
 * plages croissantes, chaque niveau une fois.
 * @param {string} text
 * @param {number} max nombre de niveaux du parcours
 * @param {string} name
 * @returns {number[]}
 */
export function readLevelList(text, max, name) {
  const level = { min: 1, max, integer: true }
  const ids = []
  for (const part of text.split(',')) {
    const bounds = part.split('-')
    if (bounds.length > 2) throw new InvalidInput(name, 'bad-format')
    const from = parseNumber(bounds[0], level, name)
    const to = bounds.length === 2 ? parseNumber(bounds[1], level, name) : from
    if (to < from) throw new InvalidInput(name, 'out-of-range')
    for (let id = from; id <= to; id++) ids.push(id)
    if (ids.length > max) throw new InvalidInput(name, 'too-many')
  }
  if (new Set(ids).size !== ids.length) throw new InvalidInput(name, 'too-many')
  return ids
}

const choiceOf = (choices) => (text, name) => readChoice(text, choices, name)
const numberIn = (rule) => (text, name) => parseNumber(text, rule, name)

/**
 * `npm run check:levels` (scripts/check-levels.mjs).
 * @param {readonly string[]} argv
 * @param {number} cores cœurs de la machine : le plus de --workers permis
 */
export function readCheckLevelsArguments(argv, cores) {
  const values = readArguments(
    argv,
    new Map([
      ['--levels', { read: (text) => text }],
      ['--track', { read: choiceOf(['campaign', 'heroic', 'duke']) }],
      ['--difficulty', { read: choiceOf(GAME.DIFFICULTIES) }],
      ['--engine', { read: choiceOf(['catapult', 'trebuchet']) }],
      ['--ammo', { read: choiceOf(['all', 'stone']) }],
      ['--workers', { read: numberIn({ min: 1, max: cores, integer: true }) }],
      ['--demo', { flag: true }],
      ['--boss', { flag: true }],
    ]),
  )
  const track = values.get('--track') ?? 'campaign'
  // Les Terres du Duc ont cinq châteaux, les autres parcours cent niveaux.
  const count = track === 'duke' ? 5 : GAME.LEVEL_COUNT
  const ids = values.has('--levels') ? readLevelList(values.get('--levels'), count, '--levels') : Array.from({ length: count }, (_, i) => i + 1)
  return {
    track,
    ids,
    difficulty: values.get('--difficulty') ?? 'hard',
    engine: values.get('--engine') ?? 'catapult',
    ammo: values.get('--ammo') ?? 'all',
    demo: values.has('--demo'),
    boss: values.has('--boss'),
    workers: values.get('--workers') ?? cores,
  }
}

/** Identifiant donné par le tableau de bord d'un portail (GameDistribution, Y8). */
const PORTAL_ID = Object.freeze({ maxLength: 64, required: true, pattern: /^[\w-]{1,64}$/ })
const portalId = (text, name) => readText(text, PORTAL_ID, name)

/**
 * `npm run release:portals` (scripts/release-portals.mjs).
 * @param {readonly string[]} argv
 * @returns {{ gd: string, y8Game: string, y8App: string }} '' : identifiant non donné
 */
export function readReleaseArguments(argv) {
  const values = readArguments(
    argv,
    new Map([
      ['--gd-id', { read: portalId }],
      ['--y8-game', { read: portalId }],
      ['--y8-app', { read: portalId }],
    ]),
  )
  return { gd: values.get('--gd-id') ?? '', y8Game: values.get('--y8-game') ?? '', y8App: values.get('--y8-app') ?? '' }
}

/**
 * `npm run backgrounds` (scripts/backgrounds/encode.mjs). Ces nombres sont écrits
 * dans le code que Chrome exécute pour l'encodage : ils doivent être des nombres.
 * @param {readonly string[]} argv
 * @returns {{ crop: number, width: number, quality: number, boxes: boolean }}
 */
export function readEncodeArguments(argv) {
  const values = readArguments(
    argv,
    new Map([
      // Part de la hauteur gardée (le bas, où le jeu dessine son sol, est rogné).
      ['--crop', { read: numberIn({ min: 0.1, max: 1 }) }],
      // Largeur de l'image encodée, en pixels.
      ['--width', { read: numberIn({ min: 320, max: 8192, integer: true }) }],
      // Qualité WebP, de 0 à 1.
      ['--quality', { read: numberIn({ min: 0, max: 1 }) }],
      ['--boxes', { flag: true }],
    ]),
  )
  return {
    crop: values.get('--crop') ?? 0.885,
    width: values.get('--width') ?? 2560,
    quality: values.get('--quality') ?? 0.84,
    boxes: values.has('--boxes'),
  }
}

/**
 * Lit les arguments d'un script ; sur un refus, l'explique et arrête le script (code 2).
 * @template T
 * @param {() => T} read
 * @param {string} usage
 * @returns {T}
 */
export function argumentsOrExit(read, usage) {
  try {
    return read()
  } catch (error) {
    if (!(error instanceof InvalidInput)) throw error
    console.error(`Argument refusé : ${error.field} (${error.problem}).\n${usage}`)
    process.exit(2)
  }
}
