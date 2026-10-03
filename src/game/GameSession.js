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
import { StoryMode } from './modes/modes.js'
import { CATAPULT_X } from './levels/ArenaRepository.js'
import { NO_EFFECTS } from './progression/UpgradeCatalog.js'
import { renownOf, COUP_DE_GRACE } from './modes/Renown.js'
import { RewardTicket } from '../services/ads/RewardTicket.js'

/** États d'une partie. */
export const STATE = Object.freeze({
  SETTLING: 'settling',
  AIMING: 'aiming',
  FLYING: 'flying',
  /** Défaite en suspens : un dernier tir est proposé contre une vidéo (portails). */
  OFFER: 'offer',
  ENDED: 'ended',
})

const SETTLE_MS = 1200
const REST_CONFIRM_MS = 450
const MAX_TURN_MS = 11000
const IDLE_WIN_MS = 1200
const FIRE_WAIT_MS = 20000
const AMMO_ORDER = Object.freeze(['stone', 'boulder', 'fire', 'bomb', 'split'])

/** Couleurs des fanions des joueurs (modes à deux). */
const PLAYER_FLAGS = Object.freeze(['#a3322b', '#3d7a3a'])

/**
 * Une partie (un niveau joué) : orchestre la physique, la ou les catapultes,
 * le score, les pouvoirs, le vent et l'enchaînement des tours.
 * Les règles propres à chaque façon de jouer (histoire, libre, deux joueurs)
 * sont déléguées à un objet GameMode (patron Stratégie).
 *
 * Événements émis :
 *  - `hud`       : l'état affichable a changé (score, tirs, vent, munitions…)
 *  - `feedback`  : { sound, x, intensity, caption, haptic } pour l'audio, les sous-titres et les vibrations
 *  - `announce`  : { key, params } message pour les lecteurs d'écran
 *  - `turn`      : { player, name } c'est au tour d'un autre joueur
 *  - `offer`     : { kind: 'extra-shot' } défaite en suspens, un dernier tir peut être offert
 *  - `end`       : { won, result, winner, scores } fin de partie
 *                  (result : résultat authentifié, seulement en mode histoire)
 */
export class GameSession extends EventBus {
  #level
  #difficulty
  #mode
  #unlockedPowers
  #state = STATE.SETTLING
  #stateT = 0
  #restT = 0
  #idleWinT = 0
  #turn = 0
  /** Renommée gagnée par chaque joueur (modes à deux). */
  #renown = [0, 0]
  /** Joueur auteur du dernier tir : c'est lui qui est crédité des destructions. */
  #shooter = 0
  #active = 0
  #pendingPower = null
  #powerUsedThisTurn = false
  #windRng
  #baseWind = 0
  #slowMo = 0
  /** Dernier tir offert : déjà utilisé ? verdict de défaite en attente. */
  #continued = false
  #pendingVerdict = null
  #events = new EventBus()
  #time = 0
  options = { trajectoryAid: false, reducedMotion: false, blood: true }

  /**
   * @param {object} level niveau gelé issu du LevelRepository
   * @param {{ difficulty: string, completedLevels: number, trajectoryAid?: boolean, reducedMotion?: boolean, screenShake?: boolean, blood?: boolean }} opts
   */
  /**
   * @param {object} level niveau (LevelRepository) ou arène (ArenaRepository), gelé
   * @param {object} opts options d'affichage et de difficulté
   * @param {import('./modes/GameMode.js').GameMode} [mode] règles (histoire par défaut)
   */
  constructor(level, { difficulty, completedLevels, trajectoryAid = false, reducedMotion = false, screenShake = true, blood = true, startPower = 100, effects = NO_EFFECTS, continueOffer = false }, mode = null) {
    super()
    this.#level = level
    this.#difficulty = Guard.oneOf(difficulty, GAME.DIFFICULTIES, 'difficulty')
    Guard.int(completedLevels, 'completedLevels', { min: 0, max: GAME.LEVEL_COUNT })
    this.#mode = mode || new StoryMode({ effects, completedLevels })
    const fx = this.#mode.effects
    this.#unlockedPowers = new Set(this.#mode.powersEnabled ? PowerRegistry.unlocked(completedLevels).map((p) => p.id) : [])
    const diff = DIFFICULTY[this.#difficulty]
    this.#windRng = new SeededRandom(level.seed)
    this.options = { trajectoryAid, reducedMotion, blood, startPower, trail: fx.trail || 'smoke' }
    /** Proposer un dernier tir contre une vidéo (campagne solo, portails). */
    this.continueOffer = Guard.boolean(continueOffer, 'continueOffer')
    const versus = this.#mode.id === 'versus'

    // Un état par joueur : catapulte (et sa visée), score, tirs, munitions.
    // Campagne à deux : un seul score commun aux deux joueurs.
    const shared = this.#mode.sharedScore ? new ScoreKeeper(level, this.#difficulty) : null
    this.players = this.#mode.players.map((name, i) => {
      const shots = this.#mode.shotsFor(level, diff, i)
      const right = versus && i === 1
      return {
        index: i,
        name,
        catapult: new Catapult(right ? CATAPULT_X.right : CATAPULT_X.left, { dir: right ? -1 : 1, speedFactor: fx.speedFactor }),
        score: shared ?? new ScoreKeeper(level, this.#difficulty),
        shotsTotal: shots,
        shotsLeft: shots,
        ammo: this.#mode.ammoFor(level, diff, i),
        selectedAmmo: 'stone',
        flag: this.#mode.players.length > 1 ? PLAYER_FLAGS[i] : null,
      }
    })

    this.world = new PhysicsWorld(this.#events, { seed: level.seed })
    this.particles = new ParticleSystem()
    this.particles.density = reducedMotion ? 0.35 : 1
    this.camera = new Camera()
    this.camera.follow = !reducedMotion
    this.camera.shakeEnabled = screenShake && !reducedMotion

    for (const b of level.blocks) this.world.add(new Block(b))
    for (const t of level.targets) this.world.add(new Target(t, diff.targetHp))
    for (const b of level.barrels) this.world.add(new Barrel(b))
    this.#applyStartPower()
    this.#bindWorldEvents()
    this.#rollWind()
  }

  /* ---------- Lecture d'état ---------- */

  get level() {
    return this.#level
  }
  get mode() {
    return this.#mode
  }
  /** Joueur dont c'est le tour. */
  get player() {
    return this.players[this.#active]
  }
  get activePlayer() {
    return this.#active
  }
  /** Catapulte du joueur actif. */
  get catapult() {
    return this.player.catapult
  }
  /** Score du joueur actif (en solo : le score de la partie). */
  get score() {
    return this.player.score
  }
  get state() {
    return this.#state
  }
  get shotsLeft() {
    return this.player.shotsLeft
  }
  get wind() {
    return this.world.wind
  }
  get selectedAmmo() {
    return this.player.selectedAmmo
  }
  /** Renommée de chaque joueur (copie). */
  get renown() {
    return [...this.#renown]
  }

  /** Joueur dont le dernier tir est en cours d'effet. */
  get shooter() {
    return this.#shooter
  }

  get targetsLeft() {
    return this.world.filter((e) => e.kind === 'target' && e.alive).length
  }

  /** Munitions disponibles : pierres (limitées par les tirs) + munitions spéciales. */
  get ammo() {
    const p = this.player
    return AMMO_ORDER.filter((t) => t === 'stone' || p.ammo[t] !== undefined).map((type) => ({
      type,
      count: type === 'stone' || p.ammo[type] === Infinity ? null : p.ammo[type],
      selected: type === p.selectedAmmo,
    }))
  }

  get powers() {
    return PowerRegistry.all().map((p) => ({
      id: p.id,
      cost: this.#mode.powerCost(p),
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
      mode: this.#mode.id,
      score: this.score.current,
      shotsLeft: this.player.shotsLeft,
      shotsTotal: this.player.shotsTotal,
      activePlayer: this.#active,
      players: this.players.map((p) => ({
        name: p.name,
        score: p.score.current,
        shotsLeft: p.shotsLeft,
        active: p.index === this.#active,
        defenders: this.world.filter((e) => e.kind === 'target' && e.alive && e.team === p.index + 1).length,
        renown: this.#renown[p.index] ?? 0,
      })),
      powersEnabled: this.#mode.powersEnabled,
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
    if (type !== 'stone' && !(this.player.ammo[type] > 0)) return false
    this.player.selectedAmmo = type
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
    this.score.spend(this.#mode.powerCost(power))
    if (power.immediate) {
      this.world.arm()
      power.activate(this)
      this.camera.shake(14)
      this.#feedback({ sound: 'explosion', x: 1700, intensity: 0.8, caption: 'quake', haptic: 'explosion' })
    } else {
      this.#pendingPower = id
      this.#feedback({ sound: 'power', x: this.catapult.x, caption: 'power' })
    }
    this.emit('announce', { key: 'a11y.powerUsed', params: { power: id, cost: this.#mode.powerCost(power) } })
    this.emit('hud', this.hud)
    return true
  }

  /** Tire ! */
  fire() {
    const player = this.player
    if (this.#state !== STATE.AIMING || player.shotsLeft === 0 || this.catapult.busy) return false
    let type = player.selectedAmmo
    if (type !== 'stone') {
      if (!(player.ammo[type] > 0)) type = 'stone'
      else if (player.ammo[type] !== Infinity) player.ammo[type]--
    }
    const shot = { mods: {}, count: 1, windOverride: null }
    if (this.#pendingPower) PowerRegistry.get(this.#pendingPower).modifyShot(shot)
    this.#pendingPower = null
    // Amélioration « Boulets lestés » : se cumule avec la Force du Titan.
    shot.mods.massFactor = (shot.mods.massFactor ?? 1) * (this.#mode.effects.massFactor ?? 1)
    shot.mods.blastFactor = this.#mode.effects.blastFactor ?? 1
    shot.mods.fireFactor = this.#mode.effects.fireFactor ?? 1
    if (shot.windOverride !== null) this.world.wind = shot.windOverride
    if (player.shotsLeft !== null) player.shotsLeft--
    this.#shooter = this.#active
    this.score.startShot(type)
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
    if (type !== 'stone' && player.ammo[type] === 0) player.selectedAmmo = 'stone'
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
      this.emit('announce', { key: 'a11y.levelStart', params: { targets: this.targetsLeft, shots: this.player.shotsLeft ?? '∞' } })
      if (this.players.length > 1) this.emit('turn', { player: this.#active, name: this.player.name })
    } else if (this.#state === STATE.AIMING) {
      // Victoire sans tir : le feu ou un pouvoir (séisme) a éliminé les dernières
      // cibles pendant la visée. On laisse 1,2 s pour voir la chute, puis on conclut.
      this.#idleWinT = this.#mode.evaluate(this)?.won ? this.#idleWinT + dt : 0
      if (this.#idleWinT >= IDLE_WIN_MS) this.#finish(this.#mode.evaluate(this))
    } else if (this.#state === STATE.FLYING) {
      // Une cible en feu va succomber : on attend avant de rendre la main.
      // Au dernier tir, on laisse aussi le feu finir son œuvre (jusqu'à 20 s).
      const burning = this.world.filter((e) => e.alive && e.burning > 0 && e.kind !== 'projectile')
      const waitFire = burning.some((e) => e.kind === 'target') || (this.player.shotsLeft === 0 && burning.length > 0 && this.#stateT < FIRE_WAIT_MS)
      this.#restT = this.world.isAtRest() && !this.catapult.busy && !waitFire ? this.#restT + dt : 0
      const allDown = this.targetsLeft === 0
      if (this.#restT >= REST_CONFIRM_MS || (this.#stateT > MAX_TURN_MS && !waitFire) || this.#stateT > FIRE_WAIT_MS || (allDown && this.#stateT > 3500)) this.#endTurn()
    }
  }

  /** Données de rendu pour le Renderer. */
  scene() {
    const loadType = this.#state === STATE.AIMING || this.#state === STATE.SETTLING ? this.player.selectedAmmo : null
    // Même emplacement pour tous (histoire, duel) : on ne dessine que la catapulte active.
    const shared = this.#mode.id !== 'versus'
    const catapults = this.players
      .filter((p) => !shared || p.index === this.#active)
      .map((p) => {
        const mine = p.index === this.#active
        return {
          x: p.catapult.x,
          y: p.catapult.y,
          dir: p.catapult.dir,
          armAngle: p.catapult.armAngle,
          load: mine && loadType ? `projectile.${loadType}` : null,
          loadRadius: mine && loadType ? PROJECTILE_TYPES[loadType].radius : 0,
          skin: this.players.length > 1 ? 'oak' : this.#mode.effects.skin || 'oak',
          flag: p.flag,
        }
      })
    return {
      camera: this.camera,
      entities: this.world.entities(),
      particles: this.particles,
      trajectory: this.trajectory,
      theme: this.#level.chapter,
      time: this.#time,
      animate: !this.options.reducedMotion,
      catapults,
      versus: this.#mode.id === 'versus',
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

  /** Réglage « Puissance au début du tour » (100 % par défaut). */
  #applyStartPower() {
    const p = this.options.startPower
    if (p === 'keep' || !Number.isFinite(p)) return
    for (const pl of this.players) pl.catapult.setAim(pl.catapult.angle, clamp(p / 100, 0, 1))
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
    const verdict = this.#mode.evaluate(this)
    if (verdict && !verdict.won && this.continueOffer && !this.#continued && this.#mode.id === 'story') {
      this.#pendingVerdict = verdict
      this.#setState(STATE.OFFER)
      this.emit('offer', { kind: 'extra-shot' })
      this.emit('hud', this.hud)
      return
    }
    if (verdict) return this.#finish(verdict)
    const next = this.#mode.nextPlayer(this.#active, this)
    const changed = next !== this.#active
    this.#active = next
    this.#powerUsedThisTurn = false
    this.#pendingPower = null
    this.#rollWind()
    this.#applyStartPower()
    this.#setState(STATE.AIMING)
    if (changed) this.emit('turn', { player: next, name: this.player.name })
    this.emit('announce', { key: 'a11y.turn', params: { targets: this.targetsLeft, shots: this.player.shotsLeft ?? '∞', wind: Math.round(this.world.wind * 10) } })
  }

  /**
   * Accepte le dernier tir offert : exige le ticket d'une vidéo vue en entier.
   * Une seule fois par partie. Le tir compte comme les autres (étoiles, score).
   * @param {RewardTicket} ticket
   * @returns {boolean}
   */
  acceptOffer(ticket) {
    if (this.#state !== STATE.OFFER || !RewardTicket.redeem(ticket, 'extra-shot')) return false
    this.#continued = true
    this.#pendingVerdict = null
    const p = this.player
    p.shotsTotal += 1
    p.shotsLeft = (p.shotsLeft ?? 0) + 1
    this.#powerUsedThisTurn = false
    this.#pendingPower = null
    this.#applyStartPower()
    this.#setState(STATE.AIMING)
    this.emit('announce', { key: 'a11y.turn', params: { targets: this.targetsLeft, shots: p.shotsLeft, wind: Math.round(this.world.wind * 10) } })
    this.emit('hud', this.hud)
    return true
  }

  /** Refuse le dernier tir : la défaite est prononcée. */
  declineOffer() {
    if (this.#state !== STATE.OFFER) return
    const verdict = this.#pendingVerdict
    this.#pendingVerdict = null
    this.#finish(verdict)
  }

  /** Fin de partie : résultat signé (histoire), scores, annonce. */
  #finish({ won, winner, reason = null }) {
    if (this.#state === STATE.ENDED) return
    const p = this.player
    // Seul le mode histoire produit un résultat authentifié (enregistrable).
    // Score commun (campagne à deux) : les tirs des deux joueurs comptent ensemble.
    const team = this.#mode.sharedScore ? this.players : [p]
    const shotsLeft = team.reduce((sum, pl) => sum + (pl.shotsLeft ?? 0), 0)
    const shotsUsed = team.reduce((sum, pl) => sum + (pl.shotsTotal - pl.shotsLeft), 0)
    const result = this.#mode.recordsResult ? this.score.finalize({ won, shotsLeft, shotsUsed }) : null
    const scores = this.#mode.sharedScore
      ? this.players.map(() => (result ? result.score : p.score.finalScore({ won, shotsLeft })))
      : this.players.map((pl) => pl.score.finalScore({ won, shotsLeft: pl.shotsLeft ?? 0 }))
    const happy = this.players.length > 1 || won
    this.#setState(STATE.ENDED)
    this.#feedback({ sound: happy ? 'victory' : 'defeat', x: 1000, caption: happy ? 'victory' : 'defeat', haptic: happy ? 'victory' : 'defeat' })
    this.emit('end', { won, result, winner, scores, reason, renown: [...this.#renown], mode: this.#mode.id })
  }

  #updateCamera(dt) {
    const flying = this.#activeProjectiles()
    if (this.#state === STATE.FLYING && flying.length && this.camera.follow) {
      const dir = this.catapult.dir
      const lead = flying.reduce((a, b) => (b.x * dir > a.x * dir ? b : a))
      this.camera.track(lead.x, lead.y)
    } else {
      this.camera.overview()
    }
    this.camera.update(dt)
  }

  #visualEffects() {
    for (const e of this.world.entities()) {
      if (e.burning > 0 && e.kind !== 'projectile') this.particles.flame(e.x, e.y - e.height / 2, e.width)
      if (e.kind === 'projectile' && !e.hasImpacted) this.particles.trail(e.x, e.y, e.ignites, this.options.trail)
    }
  }

  #feedback(f) {
    this.emit('feedback', f)
  }

  #bindWorldEvents() {
    const ev = this.#events
    ev.on('entity:destroyed', ({ entity, cause }) => {
      // Les points vont à l'auteur du tir, même si la chute finit pendant le tour suivant.
      const shooter = this.players[this.#shooter] ?? this.player
      const gained = shooter.score.registerDestroyed(entity, cause)
      if (entity.kind === 'target') {
        const own = this.#mode.teamOf(entity)
        // Au face-à-face, abattre un défenseur de son propre camp ne rapporte rien.
        if (!own || own !== this.#shooter + 1) this.#renown[this.#shooter] += renownOf(entity)
        if (this.#mode.coupDeGrace && this.targetsLeft === 0) this.#renown[this.#shooter] += COUP_DE_GRACE
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
