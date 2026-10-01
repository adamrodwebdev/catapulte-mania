import { Guard, ValidationError } from '../core/utils/Guard.js'
import { GAME } from '../config/gameConfig.js'
import { SaveSlot } from '../domain/SaveSlot.js'

/**
 * @typedef {{ index: number, status: 'empty' } |
 *   { index: number, status: 'corrupted' } |
 *   { index: number, status: 'ok', name: string, difficulty: string,
 *     completed: number, stars: number, score: number, updatedAt: number }} SlotSummary
 */

const slotKey = (index) => `slot-${index}`

/**
 * Gestion des sauvegardes (3 emplacements) dans le localStorage.
 *
 * Format stocké : `{ "data": "<JSON du profil>", "sig": "<signature>" }`.
 * Au chargement, trois barrières successives :
 *   1. la signature doit correspondre (pas de modification manuelle) ;
 *   2. les données doivent respecter le schéma (types, plages, clés connues) ;
 *   3. la progression doit être cohérente (pas de niveau sauté, score possible).
 * Une sauvegarde qui échoue est signalée « corrompue » et n'est jamais chargée.
 */
export class SaveManager {
  #storage
  #signer
  #checkRecord

  /**
   * @param {import('./StorageService.js').StorageService} storage
   * @param {import('./SaveSigner.js').SaveSigner} signer
   * @param {(levelId: number, best: number, stars: number) => void} [checkRecord]
   */
  constructor(storage, signer, checkRecord) {
    this.#storage = storage
    this.#signer = signer
    this.#checkRecord = checkRecord
  }

  #checkIndex(index) {
    return Guard.int(index, 'slot index', { min: 0, max: GAME.SAVE_SLOTS - 1 })
  }

  /**
   * @param {number} index
   * @returns {Promise<SaveSlot | null>} `null` si l'emplacement est vide
   * @throws {ValidationError} si la sauvegarde est altérée ou incohérente
   */
  async load(index) {
    this.#checkIndex(index)
    const envelope = this.#storage.readJson(slotKey(index))
    if (envelope === null) return null
    if (!envelope || typeof envelope.data !== 'string' || typeof envelope.sig !== 'string') {
      throw new ValidationError('save', 'malformed envelope')
    }
    if (!(await this.#signer.verify(envelope.data, envelope.sig))) {
      throw new ValidationError('save', 'signature mismatch')
    }
    let raw
    try {
      raw = JSON.parse(envelope.data)
    } catch {
      throw new ValidationError('save', 'invalid JSON')
    }
    return SaveSlot.fromJSON(index, raw, this.#checkRecord)
  }

  /** @param {SaveSlot} slot */
  async save(slot) {
    Guard.instance(slot, SaveSlot, 'slot')
    // Re-validation avant écriture : on n'écrit jamais un état incohérent.
    const json = slot.toJSON()
    SaveSlot.fromJSON(slot.index, json, this.#checkRecord)
    const data = JSON.stringify(json)
    const sig = await this.#signer.sign(data)
    return this.#storage.writeJson(slotKey(slot.index), { data, sig })
  }

  async create(index, name, difficulty) {
    this.#checkIndex(index)
    const slot = SaveSlot.create(index, name, difficulty)
    await this.save(slot)
    return slot
  }

  remove(index) {
    this.#checkIndex(index)
    this.#storage.remove(slotKey(index))
  }

  /** @returns {Promise<SlotSummary[]>} résumé de chaque emplacement pour l'écran des profils */
  async summaries() {
    const out = []
    for (let index = 0; index < GAME.SAVE_SLOTS; index++) {
      try {
        const slot = await this.load(index)
        if (!slot) out.push({ index, status: 'empty' })
        else {
          out.push({
            index,
            status: 'ok',
            name: slot.name,
            difficulty: slot.difficulty,
            completed: slot.completedCount,
            stars: slot.starCount,
            score: slot.totalScore,
            updatedAt: slot.updatedAt,
          })
        }
      } catch {
        out.push({ index, status: 'corrupted' })
      }
    }
    return out
  }

  /** Dernier emplacement utilisé (pour « Continuer »). */
  get lastSlot() {
    const v = this.#storage.read('last-slot')
    const n = v === null ? NaN : Number(v)
    return Number.isInteger(n) && n >= 0 && n < GAME.SAVE_SLOTS ? n : null
  }

  set lastSlot(index) {
    this.#checkIndex(index)
    this.#storage.write('last-slot', String(index))
  }
}
