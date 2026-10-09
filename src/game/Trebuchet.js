import { WORLD } from './physics/constants.js'
import { Guard } from '../core/utils/Guard.js'
import { clamp } from '../core/utils/math.js'

/**
 * Trébuchet à contrepoids (v3.7, commande revue en v5.4).
 *
 * Rien n'est « truqué » dans le mouvement : le bras obéit à son contrepoids
 * (pendule amorti) et le projectile est une vraie masse au bout d'une corde
 * (intégration de Verlet avec contrainte de longueur), qui glisse d'abord dans
 * l'auge puis décolle. La simulation est à pas fixe : un même instant de
 * lâcher donne toujours le même tir.
 *
 * v5.4 : le joueur ne chronomètre plus le lâcher. Il désigne le point
 * d'impact puis l'arc (voir aim/TrebuchetInput.js) ; la partie programme le
 * lâcher à l'instant où la fronde part sous l'angle voulu (scheduleRelease).
 * Le balancier tourne à vitesse constante et son dessin est INTERPOLÉ entre
 * deux pas de simulation : mouvement fluide quelle que soit la fréquence de
 * l'écran (avant, au ralenti, le bras n'avançait qu'une image sur trois).
 *
 * Lâcher manuel (release / releaseAt) : conservé pour relire les défis
 * enregistrés avant la v5.4.
 *
 * Repère local : origine au pied de l'engin, au sol, x vers l'avant (sens du tir).
 */
export const TREBUCHET_GEOMETRY = Object.freeze({
  /** Hauteur de l'axe du bras. */
  pivotY: -150,
  /** Grand bras (côté fronde) et petit bras (côté contrepoids). */
  armLong: 175,
  armShort: 55,
  /** Longueur de la fronde. */
  sling: 120,
})

/** Position au sol du trébuchet : en retrait de la catapulte, le château est donc plus loin. */
export const TREBUCHET_X = -520

/** Le trébuchet se débloque après ce niveau (niveau suivant = tutoriel). */
export const TREBUCHET_UNLOCK = 3

/**
 * Le trébuchet lance des pierres plus lourdes que la catapulte (×1,5) : ses
 * tirs plongeants enfoncent les planchers jusqu'aux étages bas.
 */
export const TREBUCHET_MASS = 1.5

/** Vitesse du balancier (ms simulées par ms réelle) : constante, le lâcher est programmé. */
export const SWING_SPEED = 0.62
/** Retour du bras en position avant un nouveau balancier (balancier infini), ms réelles. */
const REWIND_MS = 650

const STEP = 1000 / 120
/** Tables angle de départ → instant de lâcher, par taille de projectile (voir releaseFor). */
const RELEASE_TABLES = new Map()
/** Pas de la simulation du balancier (ms) : un lâcher se joue à ce pas près. */
export const TREBUCHET_STEP = STEP
/** Gravité Matter (px/ms²) : 1 × 0,001. */
const G = WORLD.GRAVITY * WORLD.GRAVITY_SCALE
/** Contrepoids (accélération angulaire max, rad/ms²) et amortissement. */
const PULL = 8.5e-6
const DAMP = 0.0003
const DAMP_EMPTY = 0.0022
/** Bras armé : grand bras abaissé vers l'arrière. */
const REST = Math.PI * 0.8
/** Au-delà, le bras est presque vertical vers l'avant : la fronde s'ouvre d'elle-même. */
const AUTO_RELEASE = (330 * Math.PI) / 180
/** Vitesse « 100 % » affichée (vitesse de pointe du balancier, unités Matter). */
const TOP_SPEED = 34
export const TREBUCHET_TOP_SPEED = TOP_SPEED
/** Remise en batterie après un tir (ms réelles). */
const RESET_MS = 1400

export class Trebuchet {
  kind = 'trebuchet'
  x
  y = WORLD.GROUND_Y
  dir = 1
  /** Multiplicateur de vitesse (amélioration « Bras renforcé » : contrepoids plus lourd). */
  speedFactor = 1
  /** Balancier infini : sans lâcher, le balancier recommence (option, jamais en Difficile). */
  infinite = false
  /** Rayon du projectile chargé (il glisse dans l'auge, posé au sol). */
  loadRadius = 14

  /**
   * 'idle' (armé, prêt) | 'swing' (bras en mouvement) | 'rewind' (balancier infini :
   * retour en position) | 'released' (fronde vide) | 'reset' (remise en batterie)
   */
  #phase = 'idle'
  #theta = REST
  #omega = 0
  #p = { x: 0, y: 0 }
  #pp = { x: 0, y: 0 }
  /** État au pas précédent : le dessin interpole entre les deux (fluidité). */
  #prevTheta = REST
  #prevP = { x: 0, y: 0 }
  /** Lâcher programmé (ms simulées), ou null. */
  #scheduled = null
  #acc = 0
  /** Temps de balancier écoulé (ms simulées) : rejouable à l'identique. */
  #simTime = 0
  /** Avance prise au lâcher (ms simulées) pour coller à l'instant exact du clic. */
  #debt = 0
  #resetT = 0
  #resetFrom = REST
  #onRelease = null

  /**
   * @param {number} [x] position au sol
   * @param {{ dir?: 1 | -1, speedFactor?: number, infinite?: boolean }} [opts]
   */
  constructor(x = TREBUCHET_X, { dir = 1, speedFactor = 1, infinite = false } = {}) {
    this.x = Guard.number(x, 'trebuchet x', { min: -1500, max: WORLD.WIDTH + 1500 })
    this.dir = dir === -1 ? -1 : 1
    this.speedFactor = Guard.number(speedFactor, 'speedFactor', { min: 0.5, max: 1.6 })
    this.setInfinite(infinite)
    this.#loadSling()
  }

  /** Option « Balancier infini » (la partie la refuse en Difficile). */
  setInfinite(on) {
    this.infinite = on === true
  }

  /** Vitesse du balancier (ms simulées par ms réelle). */
  get timeScale() {
    return SWING_SPEED
  }

  setLoadRadius(r) {
    this.loadRadius = clamp(Guard.number(r, 'load radius'), 4, 40)
    if (this.#phase === 'idle') this.#loadSling()
  }

  /* ---------- Lecture ---------- */

  get phase() {
    return this.#phase
  }
  /** Balancier en mouvement, projectile encore dans la fronde. */
  get armed() {
    return this.#phase === 'swing'
  }
  /** Occupé : le tour ne peut pas se terminer tant que le projectile n'est pas parti. */
  get busy() {
    return this.#phase === 'swing' || this.#phase === 'rewind'
  }

  /** Balancier infini : bras qui revient en position avant de repartir. */
  get rewinding() {
    return this.#phase === 'rewind'
  }
  /** Prêt pour un nouveau tir. */
  get ready() {
    return this.#phase === 'idle'
  }
  get simTime() {
    return this.#simTime
  }
  get armAngle() {
    return this.#theta
  }

  #local(x, y) {
    return { x: this.x + this.dir * x, y: this.y + y }
  }

  #tip(theta = this.#theta) {
    const { pivotY, armLong } = TREBUCHET_GEOMETRY
    return { x: armLong * Math.cos(theta), y: pivotY + armLong * Math.sin(theta) }
  }

  /**
   * Bout du grand bras et extrémité de la fronde (repère monde), pour le dessin.
   * En mouvement, l'état est interpolé entre les deux derniers pas de
   * simulation (fraction du pas en cours) : le bras glisse au lieu d'avancer par à-coups.
   */
  get rig() {
    const { pivotY, armShort } = TREBUCHET_GEOMETRY
    const moving = this.#phase === 'swing' || this.#phase === 'released'
    const k = moving ? clamp(this.#acc / STEP, 0, 1) : 1
    const theta = this.#prevTheta + (this.#theta - this.#prevTheta) * k
    const tip = this.#tip(theta)
    const cw = { x: -armShort * Math.cos(theta), y: pivotY - armShort * Math.sin(theta) }
    const p = { x: this.#prevP.x + (this.#p.x - this.#prevP.x) * k, y: this.#prevP.y + (this.#p.y - this.#prevP.y) * k }
    return {
      theta,
      tip: this.#local(tip.x, tip.y),
      counterweight: this.#local(cw.x, cw.y),
      // Fronde vide : elle pend au bout du bras.
      sling: this.#phase === 'released' || this.#phase === 'reset' ? null : this.#local(p.x, p.y),
    }
  }

  /** Point de départ du projectile si l'on lâchait maintenant. */
  get launchPoint() {
    return this.#local(this.#p.x, this.#p.y)
  }

  /** Vitesse du projectile si l'on lâchait maintenant (unités Matter : px par 16,67 ms). */
  get velocity() {
    const k = (1000 / 60 / STEP) * this.speedFactor
    return { x: (this.#p.x - this.#pp.x) * k * this.dir, y: (this.#p.y - this.#pp.y) * k }
  }

  /** Angle de lâcher du moment (degrés, 0 = horizontal vers l'avant), pour le HUD. */
  get angle() {
    if (this.#phase !== 'swing') return 0
    const v = this.velocity
    return Math.round((Math.atan2(-v.y, v.x * this.dir) * 180) / Math.PI)
  }

  /** Vitesse du moment, de 0 à 1 (HUD). */
  get power() {
    if (this.#phase !== 'swing') return 0
    const v = this.velocity
    return clamp(Math.hypot(v.x, v.y) / (TOP_SPEED * this.speedFactor), 0, 1)
  }

  /**
   * Remise en batterie immédiate (début de tour) : le joueur n'attend jamais
   * la fin de l'animation pour tirer à nouveau.
   */
  reload() {
    if (this.#phase === 'swing' || this.#phase === 'rewind') return
    this.#phase = 'idle'
    this.#theta = REST
    this.#omega = 0
    this.#loadSling()
  }

  /** Relecture : la fronde est vidée sans lancer (le tir est recalculé par la partie). */
  forceRelease() {
    if (this.#phase !== 'swing' && this.#phase !== 'rewind') return
    this.#onRelease = null
    this.#phase = 'released'
    this.#resetT = 0
  }

  /** Sans objet : le trébuchet ne se règle pas, il se joue au moment du lâcher. */
  setAim() {}

  /* ---------- Commandes ---------- */

  /**
   * 1er clic : libère le contrepoids.
   * @param {(shot: { point: {x:number,y:number}, velocity: {x:number,y:number} }) => void} onRelease
   * @returns {boolean}
   */
  arm(onRelease) {
    if (this.#phase !== 'idle') return false
    this.#phase = 'swing'
    this.#simTime = 0
    this.#acc = 0
    this.#debt = 0
    this.#omega = 0
    this.#theta = REST
    this.#loadSling()
    this.#scheduled = null
    this.#onRelease = onRelease
    return true
  }

  /**
   * Programme le lâcher (v5.4) : la fronde s'ouvrira d'elle-même à cet instant
   * du balancier (ms simulées), au pas de simulation près.
   */
  scheduleRelease(simMs) {
    if (this.#phase !== 'swing') return false
    this.#scheduled = Guard.number(simMs, 'release time', { min: 0, max: 5000 })
    return true
  }

  /**
   * 2e clic : lâche la fronde.
   * @param {number} [leadMs] temps réel écoulé depuis la dernière image : le
   *   balancier est avancé d'autant, le lâcher correspond à l'instant du clic.
   * @returns {boolean}
   */
  release(leadMs = 0) {
    if (this.#phase !== 'swing') return false
    const lead = this.#realToSim(clamp(Number.isFinite(leadMs) ? leadMs : 0, 0, 50))
    this.#advance(lead)
    this.#debt += lead
    this.#letGo()
    return true
  }

  /**
   * Lâcher à un instant précis du balancier (ms simulées depuis le 1er clic).
   * Utilisé par les tests et le contrôleur de niveaux.
   */
  releaseAt(simMs) {
    if (this.#phase !== 'swing') return false
    Guard.number(simMs, 'release time', { min: 0, max: 5000 })
    // Pas à pas jusqu'à l'instant voulu (sans erreur d'arrondi : même résultat
    // que le jeu image par image).
    while (this.#phase === 'swing' && this.#simTime + 1e-6 < simMs) this.#tick()
    if (this.#phase === 'swing') this.#letGo()
    return true
  }

  /**
   * Tir qu'on obtiendrait en lâchant à l'instant `simMs` (sans rien modifier).
   * @returns {{ point, velocity, angle, speed } | null}
   */
  static preview(simMs, { x = TREBUCHET_X, dir = 1, speedFactor = 1, loadRadius = 14 } = {}) {
    const t = new Trebuchet(x, { dir, speedFactor })
    t.setLoadRadius(loadRadius)
    let shot = null
    t.arm((s) => (shot = s))
    t.releaseAt(simMs)
    if (!shot) return null
    const v = shot.velocity
    return { ...shot, angle: (Math.atan2(-v.y, v.x * dir) * 180) / Math.PI, speed: Math.hypot(v.x, v.y) }
  }

  /**
   * Instant de lâcher (ms simulées, au pas de simulation) où la fronde part
   * sous l'angle `angleDeg` (0 = horizontal, 90 = vertical). L'angle de départ
   * ne dépend que de la géométrie de l'engin et du projectile : la table est
   * calculée une fois par taille de projectile.
   */
  static releaseFor(angleDeg, { loadRadius = 14 } = {}) {
    Guard.number(angleDeg, 'angle', { min: -30, max: 120 })
    const r = Math.round(clamp(loadRadius, 4, 40))
    let table = RELEASE_TABLES.get(r)
    if (!table) {
      table = []
      for (let k = Math.ceil(400 / STEP); k <= Math.floor(1100 / STEP); k++) {
        const shot = Trebuchet.preview(k * STEP, { loadRadius: r })
        if (shot) table.push({ t: k * STEP, angle: shot.angle })
      }
      RELEASE_TABLES.set(r, table)
    }
    let best = table[0]
    for (const row of table) if (Math.abs(row.angle - angleDeg) < Math.abs(best.angle - angleDeg)) best = row
    return best.t
  }

  update(dtMs) {
    const dt = Math.max(0, dtMs)
    if (this.#phase === 'swing' || this.#phase === 'released') {
      let sim = this.#realToSim(dt)
      const pay = Math.min(this.#debt, sim)
      this.#debt -= pay
      sim -= pay
      this.#advance(sim)
      // Fronde vide : au plus 1,6 s de balancement, puis remise en batterie.
      if (this.#phase === 'released') {
        this.#resetT += dt
        if (this.#resetT > 1600) this.#startReset()
      }
    } else if (this.#phase === 'rewind') {
      // Balancier infini : le bras revient en position, la fronde se recharge, et c'est reparti.
      this.#resetT += dt
      const t = Math.min(1, this.#resetT / REWIND_MS)
      const ease = t * t * (3 - 2 * t)
      this.#theta = this.#resetFrom + (REST - this.#resetFrom) * ease
      this.#loadSling()
      if (t >= 1) {
        this.#phase = 'swing'
        this.#simTime = 0
        this.#acc = 0
        this.#omega = 0
        this.#theta = REST
        this.#loadSling()
      }
    } else if (this.#phase === 'reset') {
      this.#resetT += dt
      const t = Math.min(1, this.#resetT / RESET_MS)
      const ease = t * t * (3 - 2 * t)
      this.#theta = this.#resetFrom + (REST - this.#resetFrom) * ease
      if (t >= 1) {
        this.#phase = 'idle'
        this.#theta = REST
        this.#loadSling()
      }
    }
  }

  /* ---------- Simulation ---------- */

  /** Projectile posé dans l'auge, fronde tendue vers l'avant. */
  #loadSling() {
    const tip = this.#tip()
    const r = this.loadRadius
    const dy = -r - tip.y
    const dx = Math.sqrt(Math.max(0, TREBUCHET_GEOMETRY.sling ** 2 - dy * dy))
    this.#p = { x: tip.x + dx, y: -r }
    this.#pp = { ...this.#p }
    this.#prevP = this.#p
    this.#prevTheta = this.#theta
  }

  /** Durée réelle → durée simulée (balancier à vitesse constante). */
  #realToSim(realMs) {
    return realMs * SWING_SPEED
  }

  #advance(simMs) {
    this.#acc += simMs
    while (this.#acc >= STEP) {
      this.#acc -= STEP
      this.#tick()
      if (this.#phase === 'rewind') return
    }
  }

  /** Un pas de simulation, avec le lâcher automatique (ou le retour du balancier infini). */
  #tick() {
    this.#step()
    if (this.#phase !== 'swing') return
    // Lâcher programmé (v5.4).
    if (this.#scheduled !== null && this.#simTime + 1e-6 >= this.#scheduled) {
      this.#letGo()
      return
    }
    if (this.#theta < AUTO_RELEASE) return
    if (this.infinite) {
      // Balancier infini : pas de lâcher automatique, le bras revient et recommence.
      this.#phase = 'rewind'
      this.#resetT = 0
      this.#resetFrom = this.#theta
      this.#acc = 0
      this.#debt = 0
      return
    }
    this.#letGo()
  }

  #step() {
    const h = STEP
    const empty = this.#phase !== 'swing'
    this.#prevTheta = this.#theta
    this.#prevP = this.#p
    // Bras : pendule amorti mû par le contrepoids (équilibre : grand bras vertical).
    const a = -PULL * Math.cos(this.#theta) - (empty ? DAMP_EMPTY : DAMP) * this.#omega
    this.#omega += a * h
    this.#theta += this.#omega * h
    if (empty) {
      // Fronde vide : le bras finit de se balancer puis on le remet en batterie.
      if (Math.abs(this.#omega) < 0.0004 && Math.abs(this.#theta - 1.5 * Math.PI) < 0.25) this.#startReset()
      return
    }
    this.#simTime += h
    // Projectile : masse au bout d'une corde (Verlet + contrainte de longueur).
    const tip = this.#tip()
    const vx = this.#p.x - this.#pp.x
    const vy = this.#p.y - this.#pp.y
    this.#pp = { ...this.#p }
    let x = this.#p.x + vx
    let y = this.#p.y + vy + G * h * h
    const dx = x - tip.x
    const dy = y - tip.y
    const d = Math.hypot(dx, dy)
    const L = TREBUCHET_GEOMETRY.sling
    if (d > L) {
      x = tip.x + (dx * L) / d
      y = tip.y + (dy * L) / d
    }
    // Auge : le projectile glisse au sol tant que la fronde ne le soulève pas.
    if (y > -this.loadRadius) {
      y = -this.loadRadius
      this.#pp.y = y
    }
    this.#p = { x, y }
  }

  #startReset() {
    this.#phase = 'reset'
    this.#resetT = 0
    this.#resetFrom = this.#theta
  }

  #letGo() {
    this.#scheduled = null
    const shot = { point: this.launchPoint, velocity: this.velocity }
    this.#phase = 'released'
    this.#resetT = 0
    const cb = this.#onRelease
    this.#onRelease = null
    cb?.(shot)
  }
}
