import { PAINTERS } from '../procedural/painters.js'

/**
 * Fournisseur de visuels vectoriels : chaque clé correspond à une fonction
 * de dessin Canvas 2D (voir procedural/painters.js). Aucun fichier à charger.
 */
export class ProceduralProvider {
  async load(key) {
    if (!PAINTERS[key]) throw new Error(`no procedural painter for "${key}"`)
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
