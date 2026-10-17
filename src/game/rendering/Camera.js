import { clamp, lerp } from '../../core/utils/math.js'
import { WORLD } from '../physics/constants.js'

/**
 * Caméra 2D : cadre la scène à l'écran et suit le projectile.
 * - Mode « vue d'ensemble » : la catapulte ET le château sont visibles.
 * - Mode « suivi » : léger zoom qui accompagne le projectile en vol.
 * Les tremblements d'écran sont désactivables (accessibilité).
 *
 * v5.7 : tremblement « à traumatisme », comme dans les jeux d'action : chaque
 * choc ajoute du traumatisme (0..1), l'amplitude suit son carré (les petits
 * chocs restent discrets, les gros secouent vraiment) et le mouvement suit un
 * bruit lisse (plus de vibration mécanique), avec un léger roulis.
 */
/** Vitesse de zoom maximale (facteur e par seconde : ≈ ×1,8 par seconde). */
const ZOOM_RATE = 0.6
const smooth = (t, s) => (Math.sin(t * 0.031 + s) + Math.sin(t * 0.057 + s * 2.3) * 0.6 + Math.sin(t * 0.093 + s * 4.1) * 0.3) / 1.9
export class Camera {
  viewW = 1
  viewH = 1
  x = WORLD.WIDTH / 2
  y = 600
  scale = 0.5
  #target = { x: WORLD.WIDTH / 2, y: 600, scale: 0.5 }
  #focus = { left: 0, right: WORLD.WIDTH, top: 200 }
  #trauma = 0
  #shakeT = 0
  /** Coup de boutoir en cours (px écran, v6.1). */
  #kick = { x: 0, y: 0 }
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

  /**
   * Bord gauche de la zone d'intérêt (v6.2) : il suit l'engin qui roule. Pas de
   * saut : la vue d'ensemble y glisse à son rythme habituel.
   */
  setFocusLeft(left) {
    if (Number.isFinite(left)) this.#focus = { ...this.#focus, left }
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
   * sans zoomer au-delà de `maxScale`. Sert aux gros plans sur le château
   * (plan d'ouverture, effondrement, fin de partie).
   */
  frame(left, right, maxScale = 1.1, top = null) {
    if (!this.follow) return
    let s = Math.min(this.viewW / Math.max(200, right - left), maxScale)
    // Si le haut de la zone est donné, il doit rester visible sous le bandeau du haut.
    if (Number.isFinite(top)) s = Math.min(s, this.#usableH / Math.max(100, WORLD.GROUND_Y + 90 - top + 50))
    // Jamais plus loin que la vue d'ensemble.
    s = Math.max(s, this.#fitScale())
    this.#target = { x: (left + right) / 2, y: this.#groundY(s), scale: s }
  }

  /** Échelle de la vue d'ensemble (toute la zone d'intérêt). */
  get fitScale() {
    return this.#fitScale()
  }

  /**
   * Gros plan sur un point (impact, défenseurs) : le point est placé au centre
   * de la zone utile, sans jamais montrer le dessous du sol ni zoomer moins
   * que la vue d'ensemble.
   */
  focusOn(px, py, scale) {
    if (!this.follow || !Number.isFinite(px) || !Number.isFinite(py)) return
    const fit = this.#fitScale()
    const s = clamp(Number.isFinite(scale) ? scale : fit, fit, Math.max(fit, 1.1))
    const halfW = this.viewW / s / 2
    const x = clamp(px, this.#focus.left - 100 + halfW, Math.max(this.#focus.left - 100 + halfW, this.#focus.right + 300 - halfW))
    const y = Math.min(py + (this.insetBottom - this.insetTop) / 2 / s, this.#groundY(s))
    this.#target = { x, y, scale: s }
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

  /** @param {number} intensity force du choc (≈ 4 léger, 12 explosion, 18 maximum) */
  shake(intensity) {
    if (!this.shakeEnabled) return
    this.#trauma = Math.min(1, this.#trauma + intensity / 16)
  }

  /**
   * Coup de boutoir (v6.1) : l'image recule d'un coup dans le sens du choc
   * (px écran), puis revient en ressort amorti (~0,15 s). Désactivé avec le
   * tremblement (réglage, mouvement réduit).
   */
  kick(dx, dy, strength = 6) {
    if (!this.shakeEnabled) return
    const len = Math.hypot(dx, dy) || 1
    const s = Math.min(14, strength)
    this.#kick.x = clamp(this.#kick.x + (dx / len) * s, -16, 16)
    this.#kick.y = clamp(this.#kick.y + (dy / len) * s, -16, 16)
  }

  /** Traumatisme courant (0..1), pour les tests et les effets qui en dépendent. */
  get trauma() {
    return this.#trauma
  }

  /**
   * Rapproche la caméra de sa cible. Confort (v5.8) : le zoom est interpolé
   * en échelle logarithmique (même ressenti en zoomant qu'en dézoomant), plus
   * lentement que le déplacement, et sa vitesse est bornée : jamais de
   * « plongée » brusque qui donne le mal des transports.
   */
  update(dtMs) {
    const k = 1 - Math.pow(0.0025, dtMs / 1000)
    this.x = lerp(this.x, this.#target.x, k)
    this.y = lerp(this.y, this.#target.y, k)
    const kz = 1 - Math.pow(0.02, dtMs / 1000)
    const want = Math.log(this.#target.scale / this.scale) * kz
    const maxStep = ZOOM_RATE * (dtMs / 1000)
    this.scale *= Math.exp(clamp(want, -maxStep, maxStep))
    this.#shakeT += dtMs
    this.#trauma = Math.max(0, this.#trauma - dtMs * 0.0017)
    const back = Math.pow(0.0005, dtMs / 1000)
    this.#kick.x *= back
    this.#kick.y *= back
  }

  /** Décalage (px écran) et roulis (rad) du tremblement. */
  get offset() {
    const kx = this.#kick.x
    const ky = this.#kick.y
    if (this.#trauma <= 0) return { x: kx, y: ky, roll: 0 }
    const k = this.#trauma * this.#trauma
    const amp = k * Math.min(26, Math.max(10, this.viewH * 0.03))
    const t = this.#shakeT
    return { x: smooth(t, 1.3) * amp + kx, y: smooth(t, 7.9) * amp * 0.8 + ky, roll: smooth(t, 4.2) * k * 0.018 }
  }

  /**
   * Applique la transformation monde → écran au contexte. Les plans lointains
   * (parallaxe < 1) tremblent moins : ils sont loin du choc.
   */
  apply(ctx, dpr, parallax = 1) {
    const o = this.offset
    const depth = Math.min(1, parallax)
    const tx = this.viewW / 2 - this.x * this.scale * parallax + o.x * depth
    const ty = this.viewH / 2 - this.y * this.scale + o.y * depth
    const roll = o.roll * depth
    if (!roll) {
      ctx.setTransform(dpr * this.scale, 0, 0, dpr * this.scale, dpr * tx, dpr * ty)
      return
    }
    // Rotation autour du centre de l'écran.
    const cos = Math.cos(roll)
    const sin = Math.sin(roll)
    const cx = this.viewW / 2
    const cy = this.viewH / 2
    const s = this.scale
    ctx.setTransform(
      dpr * s * cos, dpr * s * sin, -dpr * s * sin, dpr * s * cos,
      dpr * (cos * (tx - cx) - sin * (ty - cy) + cx),
      dpr * (sin * (tx - cx) + cos * (ty - cy) + cy),
    )
  }

  screenToWorld(sx, sy) {
    return { x: (sx - this.viewW / 2) / this.scale + this.x, y: (sy - this.viewH / 2) / this.scale + this.y }
  }

  worldToScreen(wx, wy) {
    return { x: (wx - this.x) * this.scale + this.viewW / 2, y: (wy - this.y) * this.scale + this.viewH / 2 }
  }
}
