import { ProceduralProvider } from './providers/ProceduralProvider.js'
import { ImageProvider } from './providers/ImageProvider.js'
import { ASSET_MANIFEST } from './assets.config.js'

/**
 * @typedef {object} DrawState état transmis au fournisseur de visuel
 * @property {number} w largeur de l'objet (unités monde)
 * @property {number} h hauteur
 * @property {{x:number,y:number}[]} [vertices] sommets locaux (polygones)
 * @property {string} [shape] 'rect' | 'triangle' | 'circle'
 * @property {number} [damage] 0..1
 * @property {boolean} [burning]
 * @property {number} [time] horloge d'animation (ms)
 * @property {number} [seed] graine visuelle stable par objet
 * @property {number} [pixel] taille d'un pixel écran en unités monde
 * @property {object} [extra] paramètres propres à la clé (angle du bras, thème…)
 */

/**
 * Registre des visuels (patron Stratégie).
 *
 * Le moteur demande « dessine target.soldier » sans savoir COMMENT il est dessiné.
 * Le manifeste décide, clé par clé, du fournisseur : vectoriel ou image.
 * Ajouter un nouveau fournisseur (sprites animés, Lottie, WebGL…) consiste à
 * implémenter `has(key)`, `load(key, entry)` et `draw(ctx, key, state)`.
 */
export class AssetRegistry {
  #manifest
  #providers
  /** @type {Map<string, object>} fournisseur effectif par clé */
  #resolved = new Map()

  /**
   * @param {Record<string, {type: string}>} [manifest]
   * @param {Record<string, object>} [providers]
   */
  constructor(manifest = ASSET_MANIFEST, providers = {}) {
    this.#manifest = manifest
    this.#providers = { procedural: new ProceduralProvider(), image: new ImageProvider(), ...providers }
  }

  /** Charge les ressources externes ; en cas d'échec, bascule sur le repli. */
  async preload() {
    const jobs = Object.entries(this.#manifest).map(async ([key, entry]) => {
      const provider = this.#providers[entry.type]
      try {
        if (!provider) throw new Error(`unknown provider "${entry.type}"`)
        await provider.load(key, entry)
        this.#resolved.set(key, provider)
      } catch (err) {
        const fallback = this.#providers[entry.fallback || 'procedural']
        console.warn(`[assets] "${key}" → repli ${entry.fallback || 'procedural'}`, err?.message || err)
        this.#resolved.set(key, fallback)
      }
    })
    await Promise.all(jobs)
  }

  #provider(key) {
    if (!this.#resolved.has(key)) {
      const entry = this.#manifest[key]
      this.#resolved.set(key, (entry && this.#providers[entry.type]?.isReady?.(key)) ? this.#providers[entry.type] : this.#providers.procedural)
    }
    return this.#resolved.get(key)
  }

  /**
   * Dessine l'élément `key` centré sur l'origine du contexte (déjà translaté/tourné).
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} key
   * @param {DrawState} state
   */
  draw(ctx, key, state) {
    const provider = this.#provider(key)
    if (provider.has(key)) provider.draw(ctx, key, state)
    else this.#providers.procedural.drawMissing(ctx, state)
  }
}
