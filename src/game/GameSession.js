import Matter from 'matter-js'
import { EventBus } from '../core/utils/EventBus.js'
import { Guard } from '../core/utils/Guard.js'
import { SeededRandom } from '../core/utils/SeededRandom.js'
import { clamp } from '../core/utils/math.js'
import { DIFFICULTY, GAME } from '../config/gameConfig.js'
import { PhysicsWorld } from './physics/PhysicsWorld.js'
import { WORLD } from './physics/constants.js'
import { Block } from './entities/Block.js'
import { Target } from './entities/Target.js'
import { Barrel } from './entities/Barrel.js'
import { Projectile, PROJECTILE_TYPES } from './entities/Projectile.js'
import { Catapult, AIM } from './Catapult.js'
import { TrajectoryPredictor } from './TrajectoryPredictor.js'
import { ParticleSystem } from './effects/ParticleSystem.js'
import { Camera } from './rendering/Camera.js'
import { ScoreKeeper } from './score/ScoreKeeper.js'
import { PowerRegistry } from './powers/PowerRegistry.js'

/** États d'une partie. */
export const STATE = Object.freeze({
  SETTLING: 'settling',
  AIMING: 'aiming',
  FLYING: 'flying',
  ENDED: 'ended',
})

const SETTLE_MS = 1200
const REST_CONFIRM_MS = 450
const MAX_TURN_MS = 11000
const AMMO_ORDER = Object.freeze(['stone', 'boulder', 'fire', 'bomb', 'split'])

/**
 * Une partie (un niveau joué) : orchestre la physique, la catapulte, le score,
 * les pouvoirs, le vent et l'enchaînement des tours.
 *
 * Événements émis :
 *  - `hud`       : l'état affichable a changé (score, tirs, vent, munitions…)
 *  - `feedback`  : { sound, x, intensity, caption, haptic } pour l'audio, les sous-titres et les vibrations
 *  - `announce`  : { key, params } message pour les lecteurs d'écran
 *  - `end`       : { won, result } fin de niveau (résultat authentifié)
 */
export class GameSession extends EventBus {
  #level
  #difficulty
  #unlockedPowers
  #state = STATE.SETTLING
  #stateT = 0
  #restT = 0
  #turn = 0
  #shotsLeft
  #shotsTotal
  #ammo
  #selectedAmmo = 'stone'
  #pendingPower = null
  #powerUsedThisTurn = false
  #windRng
  #baseWind = 0
  #slowMo = 0
  #events = new EventBus()
  #time = 0
  options = { trajectoryAid: false, reducedMotion: false, blood: true }

  /**
   * @param {object} level niveau gelé issu du LevelRepository
   * @param {{ difficulty: string, completedLevels: number, trajectoryAid?: boolean, reducedMotion?: boolean, screenShake?: boolean, blood?: boolean }} opts
   */
  constructor(level, { difficulty, completedLevels, trajectoryAid = false, reducedMotion = false, screenShake = true, blood = true }) {
    super()
    this.#level = level
    this.#difficulty = Guard.oneOf(difficulty, GAME.DIFFICULTIES, 'difficulty')
    Guard.int(completedLevels, 'completedLevels', { min: 0, max: GAME.LEVEL_COUNT })
    this.#unlockedPowers = new Set(PowerRegistry.unlocked(completedLevels).map((p) => p.id))
    const diff = DIFFICULTY[this.#difficulty]
    this.#shotsTotal = Math.max(2, level.shots + diff.shotDelta)
    this.#shotsLeft = this.#shotsTotal
    this.#ammo = { ...level.ammo }
    this.#windRng = new SeededRandom(level.seed)
    this.options = { trajectoryAid, reducedMotion, blood }

    this.world = new PhysicsWorld(this.#events, { seed: level.seed })
    this.catapult = new Catapult(170)
    this.particles = new ParticleSystem()
    this.particles.density = reducedMotion ? 0.35 : 1
    this.camera = new Camera()
    this.camera.follow = !reducedMotion
    this.camera.shakeEnabled = screenShake && !reducedMotion
    this.score = new ScoreKeeper(level, this.#difficulty)

    for (const b of level.blocks) this.world.add(new Block(b))
    for (const t of level.targets) this.world.add(new Target(t, diff.targetHp))
    for (const b of level.barrels) this.world.add(new Barrel(b))
    this.#bindWorldEvents()
    this.#rollWind()
  }

  /* ---------- Lecture d'état ---------- */

  get level() {
    return this.#level
  }
  get state() {
    return this.#state
  }
  get shotsLeft() {
    return this.#shotsLeft
  }
  get wind() {
    return this.world.wind
  }
  get selectedAmmo() {
    return this.#selectedAmmo
  }
  get targetsLeft() {
    return this.world.filter((e) => e.kind === 'target' && e.alive).length
  }

  /** Munitions disponibles : pierres (limitées par les tirs) + munitions spéciales. */
  get ammo() {
    return AMMO_ORDER.filter((t) => t === 'stone' || this.#ammo[t] !== undefined).map((type) => ({
      type,
      count: type === 'stone' ? null : this.#ammo[type],
      selected: type === this.#selectedAmmo,
    }))
  }

  get powers() {
    return PowerRegistry.all().map((p) => ({
      id: p.id,
      cost: p.cost,
      icon: p.icon,
      unlockAfter: p.unlockAfter,
      unlocked: this.#unlockedPowers.has(p.id),
      armed: this.#pendingPower === p.id,
      available: this.#unlockedPowers.has(p.id) && !this.#powerUsedThisTurn && this.#state === STATE.AIMING,
    }))
  }

  /** Instantané pour l'interface (HUD). */
  get hud() {
    return {
      state: this.#state,
      score: this.score.current,
      shotsLeft: this.#shotsLeft,
      shotsTotal: this.#shotsTotal,
      targetsLeft: this.targetsLeft,
      targetsTotal: this.#level.targets.length,
      wind: Math.round(this.world.wind * 100) / 100,
      angle: Math.round(this.catapult.angle),
      power: Math.round(this.catapult.power * 100),
      ammo: this.ammo,
      powers: this.powers,
      canActivate: this.#activeProjectiles().some((p) => p.canActivate),
      turn: this.#turn,
    }
  }

  /** Points de l'aide à la trajectoire (ou null si désactivée / hors visée). */
  get trajectory() {
    if (!this.options.trajectoryAid || this.#state !== STATE.AIMING) return null
    const wind = this.#pendingPower === 'calm' ? 0 : this.world.wind
    return TrajectoryPredictor.predict(this.catapult.launchPoint, this.catapult.velocity, {
      wind,
      obstacles: this.world.filter((e) => e.kind !== 'projectile'),
    })
  }

  /* ---------- Commandes du joueur ---------- */

  /**
   * Règle la visée.
   * @param {number} angle degrés
   * @param {number} power 0..1
   */
  aim(angle, power) {
    if (this.#state === STATE.ENDED) return
    this.catapult.setAim(angle, power)
    this.emit('hud', this.hud)
  }

  /** Ajustement relatif (clavier, boutons fins). */
  nudge(dAngle, dPower) {
    this.aim(this.catapult.angle + dAngle, this.catapult.power + dPower)
  }

  selectAmmo(type) {
    Guard.oneOf(type, AMMO_ORDER, 'ammo')
    if (type !== 'stone' && !(this.#ammo[type] > 0)) return false
    this.#selectedAmmo = type
    this.emit('hud', this.hud)
    return true
  }

  /**
   * Active un pouvoir pour ce tour.
   * @returns {boolean} succès
   */
  usePower(id) {
    const power = PowerRegistry.get(id)
    if (this.#state !== STATE.AIMING || this.#powerUsedThisTurn || !this.#unlockedPowers.has(id)) return false
    this.#powerUsedThisTurn = true
    this.score.spend(power.cost)
    if (power.immediate) {
      power.activate(this)
      this.camera.shake(14)
      this.#feedback({ sound: 'explosion', x: 1700, intensity: 0.8, caption: 'quake', haptic: 'explosion' })
    } else {
      this.#pendingPower = id
      this.#feedback({ sound: 'power', x: this.catapult.x, caption: 'power' })
    }
    this.emit('announce', { key: 'a11y.powerUsed', params: { power: id, cost: power.cost } })
    this.emit('hud', this.hud)
    return true
  }

  /** Tire ! */
  fire() {
    if (this.#state !== STATE.AIMING || this.#shotsLeft <= 0 || this.catapult.busy) return false
    let type = this.#selectedAmmo
    if (type !== 'stone') {
      if (!(this.#ammo[type] > 0)) type = 'stone'
      else this.#ammo[type]--
    }
    const shot = { mods: {}, count: 1, windOverride: null }
    if (this.#pendingPower) PowerRegistry.get(this.#pendingPower).modifyShot(shot)
    this.#pendingPower = null
    if (shot.windOverride !== null) this.world.wind = shot.windOverride
    this.#shotsLeft--
    this.score.startShot()
    this.#setState(STATE.FLYING)
    this.#feedback({ sound: 'creak', x: this.catapult.x, intensity: 0.6 })
    this.catapult.fire(() => {
      const start = this.catapult.launchPoint
      const v = this.catapult.velocity
      const spreads = shot.count === 3 ? [-2.5, 0, 2.5] : [0]
      spreads.forEach((deg, i) => {
        const p = new Projectile(type, start.x - i * 4, start.y + i * 3, shot.mods)
        this.world.add(p)
        const a = (deg * Math.PI) / 180
        const factor = 1 + (i - 1) * 0.02 * (shot.count === 3 ? 1 : 0)
        Matter.Body.setVelocity(p.body, {
          x: (v.x * Math.cos(a) - v.y * Math.sin(a)) * factor,
          y: (v.x * Math.sin(a) + v.y * Math.cos(a)) * factor,
        })
      })
      this.#feedback({ sound: 'launch', x: this.catapult.x, caption: 'launch', haptic: 'launch' })
    })
    if (type !== 'stone' && this.#ammo[type] === 0) this.#selectedAmmo = 'stone'
    this.emit('hud', this.hud)
    return true
  }

  /** Action en vol (mitraille : division en trois). */
  activate() {
    const p = this.#activeProjectiles().find((x) => x.canActivate)
    if (!p) return false
    this.world.splitProjectile(p)
    this.#feedback({ sound: 'split', x: p.x, caption: 'split' })
    this.emit('hud', this.hud)
    return true
  }

  /* ---------- Boucle ---------- */

  /** @param {number} dtMs temps réel écoulé depuis l'image précédente */
  update(dtMs) {
    const dt = clamp(dtMs, 0, 100)
    this.#time += dt
    this.#stateT += dt
    const timeScale = this.#slowMo > 0 ? 0.35 : 1
    this.#slowMo = Math.max(0, this.#slowMo - dt)
    if (this.#state !== STATE.ENDED || this.#stateT < 4000) this.world.step(dt, timeScale)
    this.catapult.update(dt)
    this.particles.update(dt * timeScale)
    this.#visualEffects()
    this.#updateCamera(dt)

    if (this.#state === STATE.SETTLING && this.#stateT >= SETTLE_MS) {
      this.#setState(STATE.AIMING)
      this.emit('announce', { key: 'a11y.levelStart', params: { targets: this.targetsLeft, shots: this.#shotsLeft } })
    } else if (this.#state === STATE.FLYING) {
      this.#restT = this.world.isAtRest() && !this.catapult.busy ? this.#restT + dt : 0
      const allDown = this.targetsLeft === 0
      if (this.#restT >= REST_CONFIRM_MS || this.#stateT > MAX_TURN_MS || (allDown && this.#stateT > 3500)) this.#endTurn()
    }
  }

  /** Données de rendu pour le Renderer. */
  scene() {
    const loadType = this.#state === STATE.AIMING || this.#state === STATE.SETTLING ? this.#selectedAmmo : null
    return {
      camera: this.camera,
      entities: this.world.entities(),
      particles: this.particles,
      trajectory: this.trajectory,
      theme: this.#level.chapter,
      time: this.#time,
      animate: !this.options.reducedMotion,
      catapult: {
        x: this.catapult.x,
        y: this.catapult.y,
        armAngle: this.catapult.armAngle,
        load: loadType ? `projectile.${loadType}` : null,
        loadRadius: loadType ? PROJECTILE_TYPES[loadType].radius : 0,
      },
    }
  }

  /** Abandon / sortie : libère la mémoire. */
  destroy() {
    this.#events.clear()
    this.world.destroy()
    this.particles.clear()
    this.clear()
  }

  /* ---------- Interne ---------- */

  #activeProjectiles() {
    return this.world.filter((e) => e.kind === 'projectile' && e.alive)
  }

  #setState(s) {
    this.#state = s
    this.#stateT = 0
    this.emit('hud', this.hud)
  }

  #rollWind() {
    const max = this.#level.wind * DIFFICULTY[this.#difficulty].windFactor
    if (max <= 0) {
      this.#baseWind = 0
    } else {
      const mag = max * this.#windRng.range(0.35, 1)
      this.#baseWind = clamp((this.#windRng.chance(0.5) ? -1 : 1) * mag, -1, 1)
    }
    this.world.wind = Math.round(this.#baseWind * 100) / 100
  }

  #endTurn() {
    this.#turn++
    this.#restT = 0
    const won = this.targetsLeft === 0
    if (won || this.#shotsLeft <= 0) {
      const result = this.score.finalize({ won, shotsLeft: this.#shotsLeft, shotsUsed: this.#shotsTotal - this.#shotsLeft })
      this.#setState(STATE.ENDED)
      this.#feedback({ sound: won ? 'victory' : 'defeat', x: 1000, caption: won ? 'victory' : 'defeat', haptic: won ? 'victory' : 'defeat' })
      this.emit('end', { won, result })
      return
    }
    this.#powerUsedThisTurn = false
    this.#rollWind()
    this.#setState(STATE.AIMING)
    this.emit('announce', { key: 'a11y.turn', params: { targets: this.targetsLeft, shots: this.#shotsLeft, wind: Math.round(this.world.wind * 10) } })
  }

  #updateCamera(dt) {
    const flying = this.#activeProjectiles()
    if (this.#state === STATE.FLYING && flying.length && this.camera.follow) {
      const lead = flying.reduce((a, b) => (b.x > a.x ? b : a))
      this.camera.track(lead.x, lead.y)
    } else {
      this.camera.overview()
    }
    this.camera.update(dt)
  }

  #visualEffects() {
    for (const e of this.world.entities()) {
      if (e.burning > 0 && e.kind !== 'projectile') this.particles.flame(e.x, e.y - e.height / 2, e.width)
      if (e.kind === 'projectile' && !e.hasImpacted) this.particles.trail(e.x, e.y, e.ignites)
    }
  }

  #feedback(f) {
    this.emit('feedback', f)
  }

  #bindWorldEvents() {
    const ev = this.#events
    ev.on('entity:destroyed', ({ entity, cause }) => {
      const gained = this.score.registerDestroyed(entity)
      if (entity.kind === 'target') {
        if (gained) this.particles.text(entity.x, entity.y - 40, `+${gained}`)
        if (this.options.blood) {
          const vx = entity.body.velocity.x
          const foot = Math.min(entity.y + entity.height / 2, WORLD.GROUND_Y)
          this.particles.blood(entity.x, entity.y, foot, Math.abs(vx) > 0.5 ? Math.sign(vx) : 0)
        } else {
          this.particles.dust(entity.x, entity.y, 10)
        }
        this.#feedback({ sound: 'down', x: entity.x, caption: `down.${entity.type}`, haptic: 'kill' })
        this.emit('announce', { key: 'a11y.targetDown', params: { left: this.targetsLeft } })
        if (this.targetsLeft === 0 && !this.options.reducedMotion) this.#slowMo = 900
      } else if (entity.kind === 'block') {
        this.particles.debris(entity.x, entity.y, entity.material, Math.max(entity.width, entity.height))
        if (gained && entity.scoreValue >= 100) this.particles.text(entity.x, entity.y - 20, `+${gained}`, '#e8eef7')
        this.#feedback({ sound: entity.sound, x: entity.x, intensity: 0.8, caption: cause === 'fire' ? null : `break.${entity.material}` })
      }
      this.emit('hud', this.hud)
    })
    ev.on('impact', ({ entity, energy, x, material }) => {
      if (energy < 25) return
      const sound = entity.kind === 'target' ? 'hit' : entity.kind === 'barrel' ? 'wood' : material
      this.#feedback({ sound, x, intensity: clamp(energy / 400, 0.3, 1.2), caption: null, haptic: energy > 300 ? 'impact' : null })
      if (energy > 400) this.camera.shake(Math.min(6, energy / 300))
    })
    ev.on('explosion', ({ x, y, radius }) => {
      this.particles.explosion(x, y, radius)
      this.camera.shake(12)
      this.#feedback({ sound: 'explosion', x, intensity: 1, caption: 'explosion', haptic: 'explosion' })
    })
    ev.on('structure:collapse', ({ entity }) => {
      this.particles.dust(entity.x, entity.y - entity.height / 2, 8)
      this.camera.shake(5)
      this.#feedback({ sound: entity.sound || 'wood', x: entity.x, intensity: 1, caption: 'collapse', haptic: 'impact' })
    })
    ev.on('fire:start', ({ entity }) => {
      this.#feedback({ sound: 'fire', x: entity.x, intensity: 0.6, caption: 'fire' })
    })
    ev.on('projectile:spent', ({ entity }) => {
      if (entity.alive === false && entity.deathCause === 'out') return
      this.particles.dust(entity.x, entity.y, 3)
    })
  }
}

export { AIM, WORLD }
