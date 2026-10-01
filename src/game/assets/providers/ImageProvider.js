/**
 * Fournisseur de visuels à base d'images (PNG, WebP, SVG, AVIF…).
 * L'image est étirée à la taille de l'objet physique ; pour les polygones,
 * elle est découpée selon la forme.
 */
export class ImageProvider {
  /** @type {Map<string, { img: CanvasImageSource, damaged?: CanvasImageSource }>} */
  #images = new Map()

  static #loadImage(src) {
    return new Promise((resolve, reject) => {
      if (typeof src !== 'string' || !/^(?:\.{0,2}\/|data:image\/|blob:|https?:)/.test(src)) {
        reject(new Error('invalid image source'))
        return
      }
      const img = new Image()
      img.decoding = 'async'
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error(`cannot load ${src}`))
      img.src = src
    })
  }

  async load(key, entry) {
    const img = await ImageProvider.#loadImage(entry.src)
    const damaged = entry.damagedSrc ? await ImageProvider.#loadImage(entry.damagedSrc).catch(() => undefined) : undefined
    this.#images.set(key, { img, damaged })
  }

  isReady(key) {
    return this.#images.has(key)
  }

  has(key) {
    return this.#images.has(key)
  }

  draw(ctx, key, state) {
    const { img, damaged } = this.#images.get(key)
    const source = damaged && (state.damage ?? 0) > 0.5 ? damaged : img
    const { w, h } = state
    if (state.vertices && state.shape === 'triangle') {
      ctx.save()
      ctx.beginPath()
      state.vertices.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)))
      ctx.closePath()
      ctx.clip()
      ctx.drawImage(source, -w / 2, -h / 2, w, h)
      ctx.restore()
    } else {
      ctx.drawImage(source, -w / 2, -h / 2, w, h)
    }
  }
}
