import { PAINTERS } from '../procedural/painters.js'
import { warmMaterial } from '../procedural/materials.js'
import { warmBaseTextures } from '../procedural/realism.js'

/** Laisse respirer l'interface entre deux textures (chargement progressif). */
const yieldToUi = () => new Promise((resolve) => setTimeout(resolve, 0))
let baseWarm = null

/**
 * Fournisseur de visuels vectoriels : chaque clé correspond à une fonction
 * de dessin Canvas 2D (voir procedural/painters.js). Aucun fichier à charger.
 */
export class ProceduralProvider {
  async load(key) {
    if (!PAINTERS[key]) throw new Error(`no procedural painter for "${key}"`)
    // Les textures réalistes (calculées pixel par pixel) sont préparées pendant
    // le chargement, une par une, plutôt qu'au milieu d'une partie.
    if (typeof document === 'undefined' && typeof OffscreenCanvas === 'undefined') return
    baseWarm ??= yieldToUi().then(warmBaseTextures)
    await baseWarm
    if (key.startsWith('block.')) {
      await yieldToUi()
      warmMaterial(key.slice(6))
    }
  }

  isReady(key) {
    return Boolean(PAINTERS[key])
  }

  has(key) {
    return Boolean(PAINTERS[key])
  }

  draw(ctx, key, state) {
    PAINTERS[key](ctx, state)
  }

  /** Visuel de secours très visible pour repérer une clé manquante. */
  drawMissing(ctx, { w, h }) {
    ctx.fillStyle = '#ff00ff'
    ctx.fillRect(-w / 2, -h / 2, w, h)
  }
}
