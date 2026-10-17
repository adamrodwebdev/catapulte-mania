import { Guard } from '../../core/utils/Guard.js'
import { GAME } from '../../config/gameConfig.js'
import { DUKE_COUNT } from '../progression/Mastery.js'
import { LevelRepository } from './LevelRepository.js'
import { DukeRepository } from './DukeRepository.js'

/**
 * Parcours (v6.2) : une suite de niveaux et ses records dans le profil.
 *  - campaign : la campagne, seul ;
 *  - coop     : la campagne à deux (mêmes niveaux, progression à part) ;
 *  - heroic   : la Campagne héroïque (les mêmes châteaux, renforcés ; médailles) ;
 *  - duke     : les Terres du Duc (cinq châteaux d'exception ; médailles).
 * Chaque parcours sait bâtir ses niveaux, les compter, lire ses records dans
 * la copie d'affichage du profil (ProfilePresenter) et dire où se dresse un
 * grand siège : les écrans et le contrôle des sauvegardes n'ont plus à choisir
 * entre campagne, héroïque et Duc (polymorphisme plutôt que conditions).
 */
export class Track {
  #level
  #records
  #next
  #isBoss

  /**
   * @param {{
   *   id: string,
   *   count: number,
   *   medals?: boolean,
   *   level: (id: number) => object,
   *   records: (profile: object | null) => Record<number, object> | undefined,
   *   next: (profile: object | null) => number,
   *   isBoss: (levelId: number, level: object | null) => boolean,
   * }} def
   *   medals : le parcours donne des médailles (bronze, argent, or) au lieu d'or et de succès
   */
  constructor({ id, count, medals = false, level, records, next, isBoss }) {
    this.id = Guard.string(id, 'track id', { pattern: /^[a-z]+$/ })
    this.count = Guard.int(count, `${id} count`, { min: 1, max: GAME.LEVEL_COUNT })
    this.medals = medals === true
    this.#level = level
    this.#records = records
    this.#next = next
    this.#isBoss = isBoss
    Object.freeze(this)
  }

  /** Niveau `id` du parcours (construit, validé, gelé). */
  level(id) {
    return this.#level(id)
  }

  /** Records du parcours dans la copie d'affichage du profil (par numéro de niveau). */
  records(profile) {
    return this.#records(profile)
  }

  /** Record d'un niveau (copie d'affichage), ou null. */
  record(profile, id) {
    return this.records(profile)?.[id] ?? null
  }

  /** Prochain niveau à jouer sur ce parcours. */
  next(profile) {
    return this.#next(profile)
  }

  /** Ce niveau est-il un grand siège, gardé par un général (musique de boss) ? */
  isBoss(levelId, level = null) {
    return this.#isBoss(levelId, level)
  }
}

/** Fin de chapitre (tous les dix niveaux) : le général du chapitre attend. */
const chapterEnd = (levelId) => levelId % GAME.LEVELS_PER_CHAPTER === 0

const TRACKS = Object.freeze({
  campaign: new Track({
    id: 'campaign',
    count: GAME.LEVEL_COUNT,
    level: (id) => LevelRepository.get(id),
    records: (p) => p?.levels,
    next: (p) => p?.next ?? 1,
    isBoss: chapterEnd,
  }),
  coop: new Track({
    id: 'coop',
    count: GAME.LEVEL_COUNT,
    level: (id) => LevelRepository.get(id),
    records: (p) => p?.coop?.levels,
    next: (p) => p?.coop?.next ?? 1,
    isBoss: chapterEnd,
  }),
  heroic: new Track({
    id: 'heroic',
    count: GAME.LEVEL_COUNT,
    medals: true,
    level: (id) => LevelRepository.heroic(id),
    records: (p) => p?.heroic?.levels,
    next: (p) => p?.heroic?.next ?? 1,
    isBoss: chapterEnd,
  }),
  duke: new Track({
    id: 'duke',
    count: DUKE_COUNT,
    medals: true,
    level: (id) => DukeRepository.get(id),
    records: (p) => p?.duke?.levels,
    next: (p) => Math.min((p?.duke?.completed ?? 0) + 1, DUKE_COUNT),
    // Le Duc garde ses châteaux lui-même : seul le dernier a son général (Mordrac).
    isBoss: (levelId, level) => Boolean(level?.general),
  }),
})

/** Parcours de chaque mode de jeu ; les autres modes jouent les niveaux de la campagne. */
const MODE_TRACKS = Object.freeze({ coop: 'coop', heroic: 'heroic', duke: 'duke' })

/** Registre des parcours. */
export class Tracks {
  /** @returns {readonly string[]} */
  static ids() {
    return Object.keys(TRACKS)
  }

  /** @param {'campaign' | 'coop' | 'heroic' | 'duke'} id */
  static get(id) {
    Guard.oneOf(id, Tracks.ids(), 'track')
    return TRACKS[id]
  }

  /** Parcours d'un mode de jeu (campagne par défaut : libre, défis, siège sans fin…). */
  static forMode(mode) {
    return TRACKS[MODE_TRACKS[mode] ?? 'campaign']
  }
}
