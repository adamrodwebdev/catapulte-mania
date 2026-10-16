import { deepFreeze, Guard } from '../../core/utils/Guard.js'
import { GAME } from '../../config/gameConfig.js'
import { CHARACTERS } from './Portraits.meta.js'

/**
 * La Chronique : le récit raconté entre les niveaux de la campagne.
 *
 * Deux formes :
 *  - les ÉPISODES (« beats »), lus avant les niveaux qui ouvrent un chapitre
 *    (`before`) ou après la victoire finale (`after`) : quelques pages, chacune
 *    avec un personnage qui parle (`speaker`, ou null pour le narrateur) et les
 *    personnages présents sur la scène (`cast`, à gauche puis à droite) ;
 *  - les RÉPLIQUES : une phrase avant CHAQUE niveau, dite par un personnage,
 *    affichée dans la fenêtre d'introduction du niveau.
 *
 * Les personnages sont des portraits pixel art dessinés par le code
 * (voir Portraits.js) : aucune image à télécharger.
 * Textes : rubrique `story` des dictionnaires (`story.<épisode>.p<n>`,
 * `story.lines.l<niveau>`).
 */

/**
 * @typedef {{ speaker: string | null, cast: string[] }} StoryPage
 * @typedef {{ id: string, chapter: number, before?: number, after?: number, pages: StoryPage[] }} StoryBeat
 */

const Y = 'ysolde'
const A = 'aubert'
const G = 'gontran'
const M = 'mordrac'
// Les généraux de Mordrac (v6.0), un par chapitre.
const RU = 'rufus'
const GA = 'galeran'
const BE = 'bertille'
const MO = 'morgane'
const AN = 'anselme'
const IL = 'ilsa'
const HU = 'hugues'
const UL = 'ulric'
const BA = 'baudouin'
const page = (speaker, cast = speaker ? [speaker] : []) => ({ speaker, cast })

/** @type {readonly StoryBeat[]} */
// Chaque chapitre se clôt sur l'entrée en scène de son général (v6.0) ;
// Bertille, l'ancienne apprentie de Gontran, le nargue en face.
const BEATS = deepFreeze([
  { id: 'prologue', chapter: 1, before: 1, pages: [page(null, [A, M]), page(Y), page(G, [G, Y]), page(G), page(RU)] },
  { id: 'ch2', chapter: 2, before: 11, pages: [page(M), page(G, [G, Y]), page(GA)] },
  { id: 'ch3', chapter: 3, before: 21, pages: [page(G), page(Y, [G, Y]), page(BE, [G, BE])] },
  { id: 'ch4', chapter: 4, before: 31, pages: [page(A), page(Y, [G, Y]), page(MO)] },
  { id: 'ch5', chapter: 5, before: 41, pages: [page(M), page(G), page(AN)] },
  { id: 'ch6', chapter: 6, before: 51, pages: [page(Y), page(G, [G, Y]), page(IL)] },
  { id: 'ch7', chapter: 7, before: 61, pages: [page(M), page(G), page(HU)] },
  { id: 'ch8', chapter: 8, before: 71, pages: [page(Y, [G, Y]), page(G, [G, Y]), page(UL)] },
  { id: 'ch9', chapter: 9, before: 81, pages: [page(A), page(Y, [G, Y]), page(BA)] },
  { id: 'ch10', chapter: 10, before: 91, pages: [page(M), page(G), page(Y, [G, Y])] },
  { id: 'epilogue', chapter: 10, after: 100, pages: [page(null, [M]), page(A, [A, Y]), page(Y, [G, Y])] },
])

/**
 * Qui parle avant chaque niveau (indice 0 = niveau 1). Maître Gontran donne
 * les conseils techniques, Ysolde mène la troupe, le général du chapitre
 * nargue la troupe avant son grand siège (v6.0), Mordrac avant le Trône, et
 * le roi Aubert, captif, écrit à sa fille dans les derniers chapitres.
 */
const LINE_SPEAKERS = Object.freeze([
  G, Y, G, Y, G, G, Y, G, G, RU, // 1-10
  G, Y, G, G, G, G, G, Y, G, GA, // 11-20 (14 : Gontran présente son trébuchet)
  G, G, Y, G, G, Y, G, Y, Y, BE, // 21-30
  G, Y, G, G, Y, Y, G, G, Y, MO, // 31-40
  G, G, Y, Y, G, Y, G, G, Y, AN, // 41-50
  Y, G, Y, G, Y, G, Y, G, Y, IL, // 51-60
  G, Y, G, G, Y, G, Y, G, Y, HU, // 61-70
  G, Y, Y, G, Y, G, G, Y, G, UL, // 71-80
  A, G, Y, G, G, Y, Y, G, G, BA, // 81-90
  Y, G, Y, G, A, Y, G, M, A, M, // 91-100
])

// Contrôle de cohérence au chargement (erreur de saisie = erreur immédiate).
const IDS = Object.keys(CHARACTERS)
for (const b of BEATS) {
  Guard.string(b.id, 'story id', { pattern: /^[a-z0-9]+$/ })
  Guard.int(b.chapter, 'story chapter', { min: 1, max: 10 })
  if (b.before !== undefined) Guard.int(b.before, 'story before', { min: 1, max: GAME.LEVEL_COUNT })
  if (b.after !== undefined) Guard.int(b.after, 'story after', { min: 1, max: GAME.LEVEL_COUNT })
  for (const p of b.pages) {
    if (p.speaker !== null) Guard.oneOf(p.speaker, IDS, 'story speaker')
    if (p.cast.length > 2) throw new Error(`story ${b.id}: at most two characters on stage`)
    p.cast.forEach((c) => Guard.oneOf(c, IDS, 'story cast'))
  }
}
if (LINE_SPEAKERS.length !== GAME.LEVEL_COUNT) throw new Error('story: one line per level expected')
LINE_SPEAKERS.forEach((s) => Guard.oneOf(s, IDS, 'line speaker'))

export class StoryRepository {
  static all() {
    return BEATS
  }

  static get(id) {
    const beat = BEATS.find((b) => b.id === id)
    if (!beat) throw new Error(`unknown story beat "${id}"`)
    return beat
  }

  /** Épisode à lire avant de jouer ce niveau (ou null). */
  static before(levelId) {
    return BEATS.find((b) => b.before === levelId) ?? null
  }

  /** Épisode à lire après avoir gagné ce niveau (ou null). */
  static after(levelId) {
    return BEATS.find((b) => b.after === levelId) ?? null
  }

  /**
   * Réplique dite avant un niveau.
   * @returns {{ speaker: string, key: string }}
   */
  static line(levelId) {
    Guard.int(levelId, 'level id', { min: 1, max: GAME.LEVEL_COUNT })
    return { speaker: LINE_SPEAKERS[levelId - 1], key: `story.lines.l${levelId}` }
  }

  /**
   * Épisodes déjà accessibles pour un profil (pour les relire dans la Chronique).
   * @param {number} completed niveaux réussis
   */
  static unlocked(completed) {
    return BEATS.filter((b) => (b.before !== undefined ? b.before <= completed + 1 : b.after <= completed))
  }
}
