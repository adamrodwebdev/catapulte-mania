/** Faux localStorage en mémoire pour les tests. */
export class MemoryStorage {
  #map = new Map()
  getItem(k) {
    return this.#map.has(k) ? this.#map.get(k) : null
  }
  setItem(k, v) {
    this.#map.set(k, String(v))
  }
  removeItem(k) {
    this.#map.delete(k)
  }
  get length() {
    return this.#map.size
  }
}
