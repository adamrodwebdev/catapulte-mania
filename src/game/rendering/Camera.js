import { clamp, lerp } from '../../core/utils/math.js'
import { WORLD } from '../physics/constants.js'

/**
 * Caméra 2D : cadre la scène à l'écran et suit le projectile.
 * - Mode « vue d'ensemble » : la catapulte ET le château sont visibles.
 * - Mode « suivi » : léger zoom qui accompagne le projectile en vol.
 * Les tremblements d'écran sont désactivables (accessibilité).
 */
export class Camera {
  viewW = 1
  viewH = 1
  x = WORLD.WIDTH / 2
  y = 600
  scale = 0.5
  #target = { x: WORLD.WIDTH / 2, y: 600, scale: 0.5 }
  #focus = { left: 0, right: WORLD.WIDTH, top: 200 }
  #shake = 0
  #shakeT = 0
  follow = true
  shakeEnabled = true
  /** Marges (px) occupées par le HUD en haut et en bas : la scène est cadrée entre les deux. */
  insetTop = 0
  insetBottom = 0

  resize(w, h) {
    this.viewW = Math.max(1, w)
    this.viewH = Math.max(1, h)
    this.overview(true)
  }

  /**
   * Déclare la place prise par l'interface (bandeaux haut/bas).
   * Valeurs bornées : le HUD ne peut jamais masquer plus de 60 % de l'écran.
   */
  setInsets(top, bottom) {
    const max = this.viewH * 0.3
    this.insetTop = Number.isFinite(top) ? clamp(top, 0, max) : 0
    this.insetBottom = Number.isFinite(bottom) ? clamp(bottom, 0, max) : 0
    this.overview(true)
  }

  get #usableH() {
    return Math.max(1, this.viewH - this.insetTop - this.insetBottom)
  }

  /** Centre vertical de caméra qui place le sol juste au-dessus du bandeau bas. */
  #groundY(s) {
    return WORLD.GROUND_Y + 90 - (this.viewH / 2 - this.insetBottom) / s
  }

  /** Zone d'intérêt du niveau (de la catapulte au bout du château). */
  setFocus(left, right, top) {
    this.#focus = { left, right, top }
    this.overview(true)
  }

  #fitScale() {
    const { left, right, top } = this.#focus
    const w = right - left
    const h = WORLD.GROUND_Y + 90 - top
    return Math.min(this.viewW / w, this.#usableH / h)
  }

  /** Cadre toute la zone d'intérêt. */
  overview(immediate = false) {
    const s = this.#fitScale()
    const { left, right } = this.#focus
    // Le sol est calé en bas de l'écran ; l'espace libre va au ciel.
    this.#target = { x: (left + right) / 2, y: this.#groundY(s), scale: s }
    if (immediate) Object.assign(this, this.#target)
  }

  /**
   * Cadre une portion du terrain, de `left` à `right` (sol calé en bas),
   * sans zoomer au-delà de `maxScale`. Sert au trébuchet : gros plan sur le
   * balancier, puis sur le château pendant l'effondrement.
   */
  frame(left, right, maxScale = 1.1) {
    if (!this.follow) return
    const s = Math.min(this.viewW / Math.max(200, right - left), maxScale)
    this.#target = { x: (left + right) / 2, y: this.#groundY(s), scale: s }
  }

  /** Suit un point (projectile) avec un zoom modéré. */
  track(px, py, { keepGround = false } = {}) {
    if (!this.follow) return
    if (keepGround) {
      // Trébuchet : on suit le projectile en gardant le sol en bas de l'écran ;
      // plus il monte, plus on dézoome (jamais en deçà de la vue d'ensemble).
      const fit = this.#fitScale()
      // Ce qui doit rester visible : le projectile ET le haut du château (on voit l'impact en entier).
      const span = WORLD.GROUND_Y + 90 - Math.min(py, this.#focus.top) + 160
      const s = clamp(Math.min(this.#usableH / Math.max(1, span), 0.9), fit, Math.max(fit, 0.9))
      const halfW = this.viewW / s / 2
      const x = clamp(px + halfW * 0.25, this.#focus.left - 100 + halfW, Math.max(this.#focus.left - 100 + halfW, this.#focus.right + 300 - halfW))
      this.#target = { x, y: this.#groundY(s), scale: s }
      return
    }
    const s = Math.min(this.#fitScale() * 1.35, 1.2)
    const halfW = this.viewW / s / 2
    const x = clamp(px, this.#focus.left - 100 + halfW, this.#focus.right + 300 - halfW)
    const y = Math.min(Math.max(py, WORLD.TOP + (this.viewH / 2 - this.insetTop) / s), this.#groundY(s))
    this.#target = { x, y, scale: s }
  }

  shake(intensity) {
    if (!this.shakeEnabled) return
    this.#shake = Math.min(18, this.#shake + intensity)
  }

  update(dtMs) {
    const k = 1 - Math.pow(0.0025, dtMs / 1000)
    this.x = lerp(this.x, this.#target.x, k)
    this.y = lerp(this.y, this.#target.y, k)
    this.scale = lerp(this.scale, this.#target.scale, k)
    this.#shakeT += dtMs
    this.#shake = Math.max(0, this.#shake - dtMs * 0.03)
  }

  get offset() {
    if (this.#shake <= 0) return { x: 0, y: 0 }
    return { x: Math.sin(this.#shakeT * 0.09) * this.#shake, y: Math.cos(this.#shakeT * 0.11) * this.#shake * 0.6 }
  }

  /** Applique la transformation monde → écran au contexte. */
  apply(ctx, dpr, parallax = 1) {
    const o = this.offset
    ctx.setTransform(
      dpr * this.scale, 0, 0, dpr * this.scale,
      dpr * (this.viewW / 2 - this.x * this.scale * parallax + o.x),
      dpr * (this.viewH / 2 - this.y * this.scale + o.y),
    )
  }

  screenToWorld(sx, sy) {
    return { x: (sx - this.viewW / 2) / this.scale + this.x, y: (sy - this.viewH / 2) / this.scale + this.y }
  }

  worldToScreen(wx, wy) {
    return { x: (wx - this.x) * this.scale + this.viewW / 2, y: (wy - this.y) * this.scale + this.viewH / 2 }
  }
}
