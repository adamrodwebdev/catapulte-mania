const PREFIX = 'ctc:'
const MARKER = `${PREFIX}cloud`

/**
 * Stockage synchronisé d'un portail (ex. module `data` de CrazyGames), présenté
 * avec l'interface de localStorage pour StorageService.
 *
 * Au premier lancement avec la synchronisation, les données déjà présentes dans
 * le localStorage du navigateur (profils, réglages) sont recopiées une fois
 * dans le stockage du portail : le joueur ne perd pas sa progression.
 */
export class CloudStorageBackend {
  #cloud

  /**
   * @param {{ getItem(k: string): string | null, setItem(k: string, v: string): void, removeItem(k: string): void }} cloud
   * @param {Storage | null} [local] localStorage du navigateur (migration)
   */
  constructor(cloud, local = null) {
    for (const fn of ['getItem', 'setItem', 'removeItem']) {
      if (typeof cloud?.[fn] !== 'function') throw new TypeError(`cloud storage: ${fn} missing`)
    }
    this.#cloud = cloud
    if (cloud.getItem(MARKER) === null) {
      this.#migrate(local)
      cloud.setItem(MARKER, '1')
    }
  }

  #migrate(local) {
    if (!local) return
    try {
      for (let i = 0; i < local.length; i++) {
        const key = local.key(i)
        if (typeof key === 'string' && key.startsWith(PREFIX) && this.#cloud.getItem(key) === null) {
          const value = local.getItem(key)
          if (typeof value === 'string') this.#cloud.setItem(key, value)
        }
      }
    } catch {
      /* localStorage inaccessible : rien à recopier */
    }
  }

  getItem(key) {
    return this.#cloud.getItem(key)
  }
  setItem(key, value) {
    this.#cloud.setItem(key, value)
  }
  removeItem(key) {
    this.#cloud.removeItem(key)
  }
}
