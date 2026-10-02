import { deepFreeze, Guard } from '../../core/utils/Guard.js'
import { GAME } from '../../config/gameConfig.js'

/**
 * La Chronique : le récit raconté entre les niveaux de la campagne.
 *
 * Chaque épisode (« beat ») est lu avant un niveau donné (`before`), ou après
 * la victoire finale (`after`). Il se compose de quelques pages ; chaque page a
 * un texte traduit (`story.<id>.p<n>` dans les dictionnaires) et, si elle
 * existe, une illustration dans `public/story/` (format WebP conseillé,
 * 1280 × 720). Sans illustration, l'écran affiche un tableau peint aux
 * couleurs du chapitre : le récit fonctionne dès maintenant et les images
 * viendront s'y glisser sans toucher au code de l'interface.
 *
 * Pour ajouter une illustration : déposer le fichier dans `public/story/` et
 * renseigner `image` sur la page concernée (ex. 'story/prologue-1.webp').
 */

/**
 * @typedef {{ image: string | null }} StoryPage
 * @typedef {{ id: string, chapter: number, before?: number, after?: number, pages: StoryPage[] }} StoryBeat
 */

const page = (image = null) => ({ image })

/** @type {readonly StoryBeat[]} */
const BEATS = deepFreeze([
  { id: 'prologue', chapter: 1, before: 1, pages: [page(), page(), page()] },
  { id: 'ch2', chapter: 2, before: 11, pages: [page(), page()] },
  { id: 'ch3', chapter: 3, before: 21, pages: [page(), page()] },
  { id: 'ch4', chapter: 4, before: 31, pages: [page(), page()] },
  { id: 'ch5', chapter: 5, before: 41, pages: [page(), page()] },
  { id: 'ch6', chapter: 6, before: 51, pages: [page(), page()] },
  { id: 'ch7', chapter: 7, before: 61, pages: [page(), page()] },
  { id: 'ch8', chapter: 8, before: 71, pages: [page(), page()] },
  { id: 'ch9', chapter: 9, before: 81, pages: [page(), page()] },
  { id: 'ch10', chapter: 10, before: 91, pages: [page(), page(), page()] },
  { id: 'epilogue', chapter: 10, after: 100, pages: [page(), page(), page()] },
])

/** Chemin d'image autorisé : un fichier du dossier story/, rien d'autre. */
const IMAGE_PATH = /^story\/[a-z0-9-]+\.(?:webp|png|jpg|avif)$/

// Contrôle de cohérence au chargement (erreur de saisie = erreur immédiate).
for (const b of BEATS) {
  Guard.string(b.id, 'story id', { pattern: /^[a-z0-9]+$/ })
  Guard.int(b.chapter, 'story chapter', { min: 1, max: 10 })
  if (b.before !== undefined) Guard.int(b.before, 'story before', { min: 1, max: GAME.LEVEL_COUNT })
  if (b.after !== undefined) Guard.int(b.after, 'story after', { min: 1, max: GAME.LEVEL_COUNT })
  for (const p of b.pages) if (p.image !== null) Guard.string(p.image, 'story image', { pattern: IMAGE_PATH })
}

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
   * Épisodes déjà accessibles pour un profil (pour les relire dans la Chronique).
   * @param {number} completed niveaux réussis
   */
  static unlocked(completed) {
    return BEATS.filter((b) => (b.before !== undefined ? b.before <= completed + 1 : b.after <= completed))
  }
}
