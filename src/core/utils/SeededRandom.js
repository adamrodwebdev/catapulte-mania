import { Guard } from './Guard.js'

/**
 * Générateur pseudo-aléatoire déterministe (algorithme Mulberry32).
 * Une même graine produit toujours la même suite : les 40 niveaux sont donc
 * identiques pour tous les joueurs et reproductibles dans les tests.
 */
export class SeededRandom {
  #state

  /** @param {number} seed entier 32 bits */
  constructor(seed) {
    Guard.int(seed, 'seed', { min: 0, max: 0xffffffff })
    this.#state = seed >>> 0
  }

  /** @returns {number} flottant dans [0, 1[ */
  next() {
    this.#state = (this.#state + 0x6d2b79f5) >>> 0
    let t = this.#state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Flottant dans [min, max[. */
  range(min, max) {
    return min + (max - min) * this.next()
  }

  /** Entier dans [min, max]. */
  int(min, max) {
    return Math.floor(this.range(min, max + 1))
  }

  /** Élément au hasard d'un tableau non vide. */
  pick(list) {
    return list[Math.floor(this.next() * list.length)]
  }

  /** Vrai avec la probabilité p. */
  chance(p) {
    return this.next() < p
  }
}
