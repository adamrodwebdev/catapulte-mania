import { Guard, deepFreeze } from '../../core/utils/Guard.js'

/**
 * Visée « au doigt » de la catapulte et de la baliste (v5.2).
 *
 * Module pur (aucun accès au DOM ni au moteur) : il reçoit des positions de
 * pointeur et des touches, et produit un angle et une puissance. Testable seul,
 * réutilisable par tous les engins visés au geste.
 *
 * Inspirations : la fronde d'Angry Birds (on tire vers l'arrière et on relâche,
 * on annule en revenant au point de départ), le mode précision des jeux de
 * golf (on ralentit la visée pour le réglage final), les courbes de réponse
 * des manettes (zone morte, courbe progressive, lissage), et les nudges au
 * clavier à accélération des jeux d'artillerie (Worms, Pocket Tanks).
 *
 * Principes :
 *  - PRÉCIS : angle et puissance arrondis à un pas fixe (0,5° et 0,5 %), ce
 *    qu'on lit est exactement ce qui part ; le tir part avec la valeur visée,
 *    jamais avec une valeur lissée en retard ;
 *  - STABLE : zone morte au départ, et l'angle ne suit que progressivement
 *    tant que le geste est court (là où un pixel ferait varier l'angle de 10°) ;
 *  - FIN : puissance sur une courbe progressive (plus de finesse en bas), et
 *    mode précision (×¼) en restant immobile un instant, avec Maj, ou avec un
 *    second doigt ; on en sort en bougeant franchement, sans à-coup ;
 *  - FLUIDE : l'affichage suit la cible par un lissage court (≈ 45 ms) ;
 *  - SÛR : un simple appui ne tire jamais ; relâcher près du point de départ annule.
 */
export const AIM_TUNING = deepFreeze({
  /** Zone morte : en deçà, le geste n'est pas une visée (et relâcher annule). */
  DEADZONE_PX: 12,
  /** Longueur de traction pour 100 % : part de la plus petite dimension de l'écran, bornée. */
  SPAN_RATIO: 0.36,
  SPAN_MIN: 140,
  SPAN_MAX: 340,
  /** Courbe de puissance (exposant > 1 : plus de finesse aux faibles puissances). */
  CURVE: 1.25,
  /** En deçà de cette traction, l'angle ne suit que partiellement (stabilité). */
  ANGLE_SETTLE_PX: 44,
  /** Lissage de l'affichage (constante de temps, ms). */
  SMOOTH_MS: 45,
  /** Mode précision : immobile (à FINE_STILL_PX près) pendant FINE_DWELL_MS. */
  FINE_DWELL_MS: 380,
  FINE_STILL_PX: 4,
  /** Sensibilité en mode précision (par pixel) : angle et puissance. */
  FINE_ANGLE_PER_PX: 0.1,
  FINE_POWER_PER_PX: 0.0011,
  /** On quitte le mode précision au-delà de cette vitesse (px/ms) soutenue. */
  FINE_EXIT_SPEED: 1.1,
  FINE_EXIT_MS: 70,
  /** Pas de réglage. */
  STEP_ANGLE: 0.5,
  STEP_POWER: 0.005,
  /** Puissance minimale pour qu'un relâcher tire. */
  MIN_FIRE_POWER: 0.05,
  /** Clavier : vitesse de départ et vitesse atteinte après KEY_RAMP_MS de maintien ; Maj ×¼. */
  KEY_ANGLE: [8, 40],
  KEY_POWER: [0.08, 0.4],
  KEY_RAMP_MS: 900,
  KEY_FINE: 0.25,
  /** Retours (vibration légère, clic) tous les 5° et tous les 10 %. */
  TICK_ANGLE: 5,
  TICK_POWER: 0.1,
})

const T = AIM_TUNING
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const snap = (v, step) => Math.round(Math.round(v / step) * step * 1e6) / 1e6
const DEG = 180 / Math.PI

export class AimInput {
  /** Bornes de l'angle de l'engin visé (°). */
  minAngle
  maxAngle
  /** Sens de tir : 1 vers la droite, -1 vers la gauche. */
  dir
  /** Visée en cours (valeurs arrondies : ce qui partira). */
  target = { angle: 45, power: 1 }
  /** Valeurs affichées (lissées). */
  display = { angle: 45, power: 1 }
  /** Geste en cours. */
  #drag = null
  /** Touches maintenues : code → durée de maintien (ms). */
  #keys = new Map()
  #fineKey = false

  /**
   * @param {{ minAngle?: number, maxAngle?: number, dir?: 1 | -1 }} [opts]
   */
  constructor({ minAngle = 5, maxAngle = 80, dir = 1 } = {}) {
    this.minAngle = Guard.number(minAngle, 'minAngle', { min: -10, max: 90 })
    this.maxAngle = Guard.number(maxAngle, 'maxAngle', { min: this.minAngle, max: 90 })
    this.dir = dir === -1 ? -1 : 1
  }

  /* ---------- État ---------- */

  get dragging() {
    return this.#drag !== null && this.#drag.active
  }

  /** Le mode précision est-il actif ? */
  get fine() {
    return Boolean(this.#drag?.fine)
  }

  /** Le geste est-il revenu dans la zone d'annulation (relâcher n'enverrait rien) ? */
  get cancelling() {
    return Boolean(this.#drag?.active && this.#drag.len < T.DEADZONE_PX)
  }

  /** Position écran du point de départ du geste (dessin de la fronde). */
  get anchor() {
    return this.#drag ? { x: this.#drag.ax, y: this.#drag.ay } : null
  }

  /** Position écran courante du pointeur. */
  get pointer() {
    return this.#drag ? { x: this.#drag.px, y: this.#drag.py } : null
  }

  /** Fixe la visée (curseurs, réglage au début du tour, relecture) : sans lissage. */
  set(angle, power) {
    this.target = this.#quantize(angle, power)
    this.display = { ...this.target }
  }

  /* ---------- Geste (souris, doigt, stylet) ---------- */

  /**
   * Début du geste.
   * @param {number} x position écran (px)
   * @param {number} y
   * @param {number} t horodatage (ms)
   * @param {{ w: number, h: number }} view taille de la zone de jeu (px)
   */
  begin(x, y, t, view) {
    const span = clamp(Math.min(view.w, view.h) * T.SPAN_RATIO, T.SPAN_MIN, T.SPAN_MAX)
    this.#drag = {
      ax: x, ay: y, px: x, py: y, span, len: 0, active: false,
      start: { ...this.target },
      fine: false, fineFrom: null,
      stillX: x, stillY: y, stillT: t, lastT: t, fastMs: 0,
    }
  }

  /**
   * Le pointeur bouge.
   * @param {{ fine?: boolean }} [opts] précision demandée (Maj, second doigt)
   * @returns {{ changed: boolean, ticks: number }} ticks : seuils de 5° / 10 % franchis
   */
  move(x, y, t, { fine = false } = {}) {
    const d = this.#drag
    if (!d) return { changed: false, ticks: 0 }
    const dt = Math.max(1, t - d.lastT)
    const speed = Math.hypot(x - d.px, y - d.py) / dt
    d.px = x
    d.py = y
    d.lastT = t
    const pull = this.#pull(d)
    d.len = Math.hypot(pull.x, pull.y)
    if (!d.active) {
      if (d.len < T.DEADZONE_PX) return { changed: false, ticks: 0 }
      d.active = true
    }
    // Immobilité : passage en mode précision.
    if (Math.hypot(x - d.stillX, y - d.stillY) > T.FINE_STILL_PX) {
      d.stillX = x
      d.stillY = y
      d.stillT = t
    }
    const wantFine = fine || (t - d.stillT >= T.FINE_DWELL_MS && d.len >= T.DEADZONE_PX)
    if (wantFine && !d.fine) this.#enterFine(d)
    // Mouvement franc et soutenu : retour à la visée directe, sans à-coup.
    d.fastMs = speed > T.FINE_EXIT_SPEED ? d.fastMs + dt : 0
    if (d.fine && !fine && d.fastMs >= T.FINE_EXIT_MS) this.#exitFine(d)
    const before = { ...this.target }
    this.target = d.fine ? this.#fineAim(d) : this.#directAim(d)
    return { changed: before.angle !== this.target.angle || before.power !== this.target.power, ticks: this.#ticks(before, this.target) }
  }

  /**
   * Fin du geste.
   * @returns {{ fire: boolean, cancel: boolean, moved: boolean }}
   */
  end() {
    const d = this.#drag
    this.#drag = null
    if (!d) return { fire: false, cancel: false, moved: false }
    if (!d.active) return { fire: false, cancel: false, moved: false }
    // Revenu au point de départ : on annule, la visée d'avant est rétablie.
    if (d.len < T.DEADZONE_PX) {
      this.set(d.start.angle, d.start.power)
      return { fire: false, cancel: true, moved: true }
    }
    // Ce qui part est exactement ce qui est affiché.
    this.display = { ...this.target }
    return { fire: this.target.power >= T.MIN_FIRE_POWER, cancel: false, moved: true }
  }

  /** Abandon (Échap, perte du pointeur) : la visée d'avant est rétablie. */
  abort() {
    const d = this.#drag
    this.#drag = null
    if (d?.active) this.set(d.start.angle, d.start.power)
  }

  /** Molette : puissance (ou angle avec Maj). */
  wheel(deltaY, { angle = false } = {}) {
    const s = Math.sign(deltaY)
    if (!s) return false
    const before = { ...this.target }
    if (angle) this.set(this.target.angle - s * T.STEP_ANGLE, this.target.power)
    else this.set(this.target.angle, this.target.power - s * 0.01)
    return before.angle !== this.target.angle || before.power !== this.target.power
  }

  /* ---------- Clavier (maintien, avec accélération) ---------- */

  /** @param {'left'|'right'|'up'|'down'} key @param {boolean} [fine] */
  keyDown(key, fine = false) {
    Guard.oneOf(key, ['left', 'right', 'up', 'down'], 'aim key')
    if (!this.#keys.has(key)) this.#keys.set(key, 0)
    this.#fineKey = Boolean(fine)
  }

  keyUp(key) {
    this.#keys.delete(key)
    // Au relâcher, la valeur se cale sur le pas : on lit un nombre rond.
    this.set(this.target.angle, this.target.power)
  }

  get keysHeld() {
    return this.#keys.size > 0
  }

  /* ---------- Image par image ---------- */

  /**
   * Avance d'une image : touches maintenues, puis lissage de l'affichage.
   * @returns {{ changed: boolean, ticks: number }}
   */
  tick(dtMs) {
    const dt = clamp(Number(dtMs) || 0, 0, 100)
    let ticks = 0
    let changed = false
    if (this.#keys.size) {
      const before = { ...this.target }
      let { angle, power } = this.target
      for (const [key, held] of this.#keys) {
        const h = held + dt
        this.#keys.set(key, h)
        const ramp = Math.min(1, h / T.KEY_RAMP_MS)
        const k = this.#fineKey ? T.KEY_FINE : 1
        const ra = (T.KEY_ANGLE[0] + (T.KEY_ANGLE[1] - T.KEY_ANGLE[0]) * ramp * ramp) * k
        const rp = (T.KEY_POWER[0] + (T.KEY_POWER[1] - T.KEY_POWER[0]) * ramp * ramp) * k
        // Premier appui : un pas exact, puis le maintien accélère.
        const first = held === 0
        if (key === 'left') angle -= first ? T.STEP_ANGLE * (this.#fineKey ? 1 : 2) : (ra * dt) / 1000
        if (key === 'right') angle += first ? T.STEP_ANGLE * (this.#fineKey ? 1 : 2) : (ra * dt) / 1000
        if (key === 'up') power += first ? T.STEP_POWER * (this.#fineKey ? 1 : 2) : (rp * dt) / 1000
        if (key === 'down') power -= first ? T.STEP_POWER * (this.#fineKey ? 1 : 2) : (rp * dt) / 1000
      }
      // Sans arrondi pendant le maintien (sinon les petits pas s'annulent).
      this.target = { angle: clamp(angle, this.minAngle, this.maxAngle), power: clamp(power, 0, 1) }
      this.display = { ...this.target }
      changed = before.angle !== this.target.angle || before.power !== this.target.power
      ticks = this.#ticks(before, this.target)
      return { changed, ticks }
    }
    // Lissage exponentiel indépendant de la cadence d'affichage.
    const k = 1 - Math.exp(-dt / T.SMOOTH_MS)
    const da = this.target.angle - this.display.angle
    const dp = this.target.power - this.display.power
    if (Math.abs(da) > 0.01 || Math.abs(dp) > 0.0005) {
      this.display = { angle: this.display.angle + da * k, power: this.display.power + dp * k }
      changed = true
    } else if (da !== 0 || dp !== 0) {
      this.display = { ...this.target }
      changed = true
    }
    return { changed, ticks }
  }

  /* ---------- Interne ---------- */

  /** Vecteur de traction (vers l'arrière = vers l'avant du tir), en px. */
  #pull(d) {
    return { x: (d.ax - d.px) * this.dir, y: d.py - d.ay }
  }

  #quantize(angle, power) {
    return {
      angle: clamp(snap(Number(angle) || 0, T.STEP_ANGLE), this.minAngle, this.maxAngle),
      power: clamp(snap(Number(power) || 0, T.STEP_POWER), 0, 1),
    }
  }

  /** Visée directe : la traction donne la direction et la puissance. */
  #directAim(d) {
    const p = this.#pull(d)
    const len = Math.hypot(p.x, p.y)
    const u = clamp((len - T.DEADZONE_PX) / (d.span - T.DEADZONE_PX), 0, 1)
    const power = Math.pow(u, T.CURVE)
    let angle = Math.atan2(p.y, p.x) * DEG
    // Tirer vers le château (traction « à l'envers ») : l'angle reste dans ses bornes, du côté le plus proche.
    if (angle > 90 + (180 - 90) / 2 || angle < -90) angle = angle > 0 ? this.maxAngle : this.minAngle
    // Geste court : l'angle ne suit que progressivement (un pixel ne vaut pas 10°).
    const settle = clamp((len - T.DEADZONE_PX) / (T.ANGLE_SETTLE_PX - T.DEADZONE_PX), 0, 1)
    const a0 = clamp(d.start.angle, this.minAngle, this.maxAngle)
    angle = a0 + (clamp(angle, this.minAngle, this.maxAngle) - a0) * settle
    return this.#quantize(angle, power)
  }

  /** Mode précision : petits déplacements relatifs, le long de la traction (puissance) et en travers (angle). */
  #fineAim(d) {
    const f = d.fineFrom
    const p = this.#pull(d)
    const dx = p.x - f.pull.x
    const dy = p.y - f.pull.y
    // Repère de la traction au moment d'entrer en précision.
    const ux = Math.cos(f.angle / DEG)
    const uy = Math.sin(f.angle / DEG)
    const along = dx * ux + dy * uy
    const across = -dx * uy + dy * ux
    return this.#quantize(f.angle + across * T.FINE_ANGLE_PER_PX, f.power + along * T.FINE_POWER_PER_PX)
  }

  #enterFine(d) {
    d.fine = true
    d.fastMs = 0
    d.fineFrom = { pull: this.#pull(d), angle: this.target.angle, power: this.target.power }
  }

  /** Sortie du mode précision : on recale le point de départ pour que la visée ne saute pas. */
  #exitFine(d) {
    d.fine = false
    d.fineFrom = null
    const u = Math.pow(this.target.power, 1 / T.CURVE)
    const len = T.DEADZONE_PX + u * (d.span - T.DEADZONE_PX)
    const a = this.target.angle / DEG
    d.ax = d.px + (Math.cos(a) * len) / this.dir
    d.ay = d.py - Math.sin(a) * len
    d.start = { ...this.target }
    d.stillT = d.lastT
  }

  /** Nombre de seuils franchis (tous les 5° et tous les 10 %) : retours discrets. */
  #ticks(a, b) {
    const ta = Math.abs(Math.floor(b.angle / T.TICK_ANGLE) - Math.floor(a.angle / T.TICK_ANGLE))
    const tp = Math.abs(Math.floor(b.power / T.TICK_POWER + 1e-9) - Math.floor(a.power / T.TICK_POWER + 1e-9))
    return ta + tp
  }
}
