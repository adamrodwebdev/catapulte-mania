import { Guard } from '../core/utils/Guard.js'

const PREFIX = 'ctc:'
/** Taille maximale d'une entrée : protège contre le remplissage abusif du stockage. */
const MAX_ENTRY_SIZE = 64 * 1024

/**
 * Accès sécurisé au localStorage.
 * - toutes les clés sont préfixées et validées ;
 * - aucune exception ne remonte (navigation privée, quota dépassé, stockage bloqué) ;
 * - repli automatique sur une mémoire temporaire si le stockage est indisponible.
 */
export class StorageService {
  /** @type {Storage | null} */
  #backend = null
  /** @type {Map<string, string>} */
  #memory = new Map()

  /** @param {Storage | null} [backend] injectable pour les tests */
  constructor(backend) {
    this.#backend = backend === undefined ? StorageService.#detect() : backend
  }

  static #detect() {
    try {
      const s = globalThis.localStorage
      if (!s) return null
      const probe = `${PREFIX}probe`
      s.setItem(probe, '1')
      s.removeItem(probe)
      return s
    } catch {
      return null
    }
  }

  /** Le stockage est-il persistant (vrai localStorage) ? */
  get persistent() {
    return this.#backend !== null
  }

  #key(key) {
    Guard.string(key, 'storage key', { minLength: 1, maxLength: 48, pattern: /^[a-z0-9:_-]+$/ })
    return PREFIX + key
  }

  /** @returns {string | null} */
  read(key) {
    const k = this.#key(key)
    try {
      const v = this.#backend ? this.#backend.getItem(k) : this.#memory.get(k)
      if (typeof v !== 'string' || v.length > MAX_ENTRY_SIZE) return null
      return v
    } catch {
      return null
    }
  }

  /** @returns {boolean} succès de l'écriture */
  write(key, value) {
    const k = this.#key(key)
    Guard.string(value, 'storage value', { maxLength: MAX_ENTRY_SIZE })
    try {
      if (this.#backend) this.#backend.setItem(k, value)
      else this.#memory.set(k, value)
      return true
    } catch {
      return false
    }
  }

  remove(key) {
    const k = this.#key(key)
    try {
      if (this.#backend) this.#backend.removeItem(k)
      else this.#memory.delete(k)
    } catch {
      /* stockage indisponible : rien à faire */
    }
  }

  /** Lecture JSON tolérante : renvoie `null` si absent ou illisible. */
  readJson(key) {
    const raw = this.read(key)
    if (raw === null) return null
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  writeJson(key, value) {
    return this.write(key, JSON.stringify(value))
  }
}
