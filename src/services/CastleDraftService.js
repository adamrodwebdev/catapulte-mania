import { CastleCode, emptyDesign, STORAGE_KEYS } from '../game/editor/CastleDesign.js'

/** Longueur maximale d'un code de château mémorisé (au-delà, il est ignoré). */
const MAX_CODE = 4000

/**
 * Ce que l'atelier de châteaux (v4.0) garde sur l'appareil (v6.2, sorti de
 * l'écran) : le brouillon en cours, et le dernier château que son auteur a
 * pris lui-même (condition pour le partager). Aucune erreur ne remonte : sans
 * stockage, tout vaut le temps de la session.
 * Chargé à la demande, avec l'atelier (l'accueil reste léger).
 */
export class CastleDraftService {
  #storage

  /** @param {import('./StorageService.js').StorageService} storage */
  constructor(storage) {
    this.#storage = storage
  }

  /** Le brouillon enregistré, ou un château vide (brouillon absent ou illisible). */
  loadDraft() {
    try {
      const code = this.#storage.readJson(STORAGE_KEYS.draft)
      if (typeof code === 'string') return CastleCode.decode(code, { draft: true })
    } catch {
      /* brouillon illisible : on repart d'un château vide */
    }
    return emptyDesign()
  }

  /** Enregistre le brouillon (sans stockage : il vit le temps de la session). */
  saveDraft(design) {
    try {
      this.#storage.writeJson(STORAGE_KEYS.draft, CastleCode.encode(design))
    } catch {
      /* sans stockage : le brouillon vit le temps de la session */
    }
  }

  /** Code du château pris par son auteur, mémorisé sur l'appareil, ou null. */
  verifiedCode() {
    try {
      const saved = this.#storage.readJson(STORAGE_KEYS.verified)
      if (typeof saved === 'string' && saved.length <= MAX_CODE) return saved
    } catch {
      /* rien de mémorisé */
    }
    return null
  }

  /** Mémorise le château que son auteur vient de prendre. */
  rememberVerified(code) {
    try {
      this.#storage.writeJson(STORAGE_KEYS.verified, code)
    } catch {
      /* sans stockage : la preuve vaut pour la session */
    }
  }
}
