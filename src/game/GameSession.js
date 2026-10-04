import Matter from 'matter-js'
import { EventBus } from '../core/utils/EventBus.js'
import { Guard } from '../core/utils/Guard.js'
import { SeededRandom } from '../core/utils/SeededRandom.js'
import { clamp } from '../core/utils/math.js'
import { DIFFICULTY, GAME } from '../config/gameConfig.js'
import { PhysicsWorld } from './physics/PhysicsWorld.js'
import { WIND_PROFILES, windageOf } from './physics/WindField.js'
import { WORLD } from './physics/constants.js'
import { Block } from './entities/Block.js'
import { Target } from './entities/Target.js'
import { Barrel } from './entities/Barrel.js'
import { Projectile, PROJECTILE_TYPES } from './entities/Projectile.js'
import { Catapult, AIM } from './Catapult.js'
import { Trebuchet, TREBUCHET_X, TREBUCHET_MASS } from './Trebuchet.js'
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
/** Engins de siège : catapulte (visée angle + puissance) ou trébuchet (deux clics). */
export const ENGINES = Object.freeze(['catapult', 'trebuchet'])

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
  /** Suivi des rafales (sous-titres, son). */
  #lastGustAt = -Infinity
  #lastGustLevel = 0
  #pendingVerdict = null
  #events = new EventBus()
  #time = 0
  #engine = 'catapult'
  /** Trébuchet : munition dans la fronde pendant le balancier. */
  #loadedAmmo = null
  /**
   * Journal des gestes du joueur (v3.9, « Bats mon tir ») : uniquement des
   * commandes (munition, angle, puissance, instant du lâcher…) datées en pas
   * de simulation, jamais des résultats. Rejoué, il redonne la même partie.
   */
  #log = []
  #aimStep = 0
  #fireStep = 0
  #spawnStep = 0
  /** Relecture : le lancement attend le pas enregistré (voir ReplayPlayer). */
  #replay = false
  #pendingLaunch = null
  /** Vidéos récompensées (v4.0) : indice de trajectoire et pouvoir offert, une fois par niveau chacun. */
  #hint = false
  #hintUsed = false
  #freePowerUsed = false
  /** Repère sonore du balancier : dernière tranche de 15° annoncée. */
  #tickBand = null
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
  constructor(level, { difficulty, completedLevels, trajectoryAid = false, reducedMotion = false, screenShake = true, blood = true, startPower = 100, effects = NO_EFFECTS, continueOffer = false, engine = 'catapult', slowSwing = false, infiniteSwing = false, replay = false, season = null }, mode = null) {
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
    // Le trébuchet tire depuis l'arrière : impossible au face-à-face (deux camps, deux châteaux).
    this.#engine = versus ? 'catapult' : Guard.oneOf(engine, ENGINES, 'engine')
    Guard.boolean(slowSwing, 'slowSwing')
    Guard.boolean(infiniteSwing, 'infiniteSwing')
    this.#replay = Guard.boolean(replay, 'replay')
    /** Événement saisonnier (décor seulement). */
    this.season = season === 'halloween' || season === 'winter' ? season : null
    /** Balancier infini : option du joueur, jamais en Difficile (ni donc à deux). */
    this.infiniteSwing = infiniteSwing && this.#difficulty !== 'hard'

    // Un état par joueur : catapulte (et sa visée), score, tirs, munitions.
    // Campagne à deux : un seul score commun aux deux joueurs.
    const shared = this.#mode.sharedScore ? new ScoreKeeper(level, this.#difficulty) : null
    this.players = this.#mode.players.map((name, i) => {
      const shots = this.#mode.shotsFor(level, diff, i)
      const right = versus && i === 1
      return {
        index: i,
        name,
        // `catapult` désigne l'engin du joueur, catapulte ou trébuchet.
        catapult:
          this.#engine === 'trebuchet'
            ? new Trebuchet(TREBUCHET_X, { speedFactor: fx.speedFactor, slow: slowSwing, infinite: this.infiniteSwing })
            : new Catapult(right ? CATAPULT_X.right : CATAPULT_X.left, { dir: right ? -1 : 1, speedFactor: fx.speedFactor }),
        score: shared ?? new ScoreKeeper(level, this.#difficulty),
        shotsTotal: shots,
        shotsLeft: shots,
        ammo: this.#mode.ammoFor(level, diff, i),
        selectedAmmo: 'stone',
        flag: this.#mode.players.length > 1 ? PLAYER_FLAGS[i] : null,
      }
    })

    this.world = new PhysicsWorld(this.#events, { seed: level.seed, windProfile: WIND_PROFILES[this.#difficulty] })
    // Le trébuchet est en retrait : le monde s'étend jusqu'à lui (un tir lâché trop tôt part en arrière).
    if (this.#engine === 'trebuchet') this.world.leftLimit = TREBUCHET_X - 700
    /** Zone cadrée par la caméra : de l'engin au bout du château. */
    this.focus = Object.freeze({
      left: this.#engine === 'trebuchet' ? TREBUCHET_X - 230 : level.focus.left,
      right: level.focus.right,
      top: level.focus.top,
    })
    this.particles = new ParticleSystem()
    this.particles.density = reducedMotion ? 0.35 : 1
    this.camera = new Camera()
    this.camera.follow = !reducedMotion
    this.camera.shakeEnabled = screenShake && !reducedMotion

    for (const b of level.blocks) this.world.add(new Block(b))
    for (const t of level.targets) this.world.add(new Target(t, diff.targetHp))
    for (const b of level.barrels) this.world.add(new Barrel(b))
    this.#applyStartPower()
    this.#loadEngine()
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
  /** Pas de simulation écoulés depuis le début de la partie. */
  get steps() {
    return Math.round(this.world.time / WORLD.STEP_MS)
  }

  /** Pas de simulation au début de la visée en cours. */
  get aimStep() {
    return this.#aimStep
  }

  /** Pas du dernier tir et du dernier lancement (relecture). */
  get fireStep() {
    return this.#fireStep
  }
  get spawnStep() {
    return this.#spawnStep
  }

  /** Un lancement attend son pas (relecture). */
  get launchPending() {
    return this.#pendingLaunch !== null
  }

  /** Journal des gestes (copie). */
  get log() {
    return structuredClone(this.#log)
  }

  /** Difficulté de la partie. */
  get difficulty() {
    return this.#difficulty
  }

  /** Engin de la partie : 'catapult' ou 'trebuchet'. */
  get engine() {
    return this.#engine
  }

  /** Trébuchet : balancier lancé, en attente du lâcher. */
  get armed() {
    return this.#engine === 'trebuchet' && this.catapult.armed
  }

  /** Balancier infini : le bras revient en position (le tir reste engagé). */
  get rewinding() {
    return this.#engine === 'trebuchet' && this.catapult.rewinding
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
      ...this.#windView(),
      angle: Math.round(this.catapult.angle),
      power: Math.round(this.catapult.power * 100),
      engine: this.#engine,
      armed: this.armed,
      rewinding: this.rewinding,
      infiniteSwing: this.infiniteSwing,
      ammo: this.ammo,
      powers: this.powers,
      canActivate: this.#activeProjectiles().some((p) => p.canActivate),
      rewards: this.rewardsLeft,
      hint: this.#hint,
      turn: this.#turn,
    }
  }

  /** Points de l'aide à la trajectoire (ou null si désactivée / hors visée). */
  get trajectory() {
    if (!this.options.trajectoryAid && !this.#hint) return null
    // Trébuchet : la courbe montre, en direct, le tir qu'on obtiendrait en lâchant maintenant.
    if (this.#engine === 'trebuchet' ? !this.armed : this.#state !== STATE.AIMING) return null
    const calm = this.#pendingPower === 'calm'
    const field = this.world.windField
    const start = this.catapult.launchPoint
    const windage = windageOf({ type: this.player.selectedAmmo, radius: PROJECTILE_TYPES[this.player.selectedAmmo].radius })
    return TrajectoryPredictor.predict(start, this.catapult.velocity, {
      wind: calm ? 0 : this.world.wind,
      windAccel: calm || !field.dynamic ? null : field.frozen(start.x, this.world.time, windage),
      obstacles: this.world.filter((e) => e.kind !== 'projectile'),
      maxPoints: this.#engine === 'trebuchet' ? 110 : 60,
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
    this.#loadEngine()
    this.emit('hud', this.hud)
    return true
  }

  /** Trébuchet : le projectile choisi est posé dans l'auge (sa taille compte). */
  #loadEngine() {
    if (this.#engine === 'trebuchet') this.catapult.setLoadRadius(PROJECTILE_TYPES[this.player.selectedAmmo].radius)
  }

  /**
   * Active un pouvoir pour ce tour.
   * @returns {boolean} succès
   */
  usePower(id, { free = false } = {}) {
    const power = PowerRegistry.get(id)
    if (this.#state !== STATE.AIMING || this.#powerUsedThisTurn || !this.#unlockedPowers.has(id)) return false
    this.#powerUsedThisTurn = true
    this.#log.push({ k: 'p', d: this.steps - this.#aimStep, id })
    if (!free) this.score.spend(this.#mode.powerCost(power))
    if (power.immediate) {
      this.world.arm()
      power.activate(this)
      this.camera.shake(14)
      this.#feedback({ sound: 'explosion', x: 1700, intensity: 0.8, caption: 'quake', haptic: 'explosion' })
    } else {
      this.#pendingPower = id
      this.#feedback({ sound: 'power', x: this.catapult.x, caption: 'power' })
    }
    this.emit('announce', { key: 'a11y.powerUsed', params: { power: id, cost: free ? 0 : this.#mode.powerCost(power) } })
    this.emit('hud', this.hud)
    return true
  }

  /**
   * Relecture : lance le projectile du tir en cours, comme lors de la partie
   * enregistrée. Catapulte : depuis sa visée ; trébuchet : le tir est
   * recalculé à partir de l'instant du lâcher (`release`, ms de balancier).
   * @param {{ release?: number }} [rec]
   */
  replayLaunch(rec = {}) {
    const pending = this.#pendingLaunch
    if (!this.#replay || !pending) return false
    if (this.#engine === 'trebuchet') {
      const release = Guard.number(rec.release, 'release', { min: 0, max: 5000 })
      const c = this.catapult
      const shot = Trebuchet.preview(release, { x: c.x, dir: c.dir, speedFactor: c.speedFactor, loadRadius: PROJECTILE_TYPES[pending.type].radius })
      if (!shot) return false
      c.forceRelease()
      pending.launch(shot.point, shot.velocity)
    } else {
      pending.launch(this.catapult.launchPoint, this.catapult.velocity)
    }
    return true
  }

  /**
   * Commande unique « au clic » : tire (catapulte), lance le balancier puis
   * lâche la fronde (trébuchet), ou divise la mitraille en vol.
   * @param {number} [lead] ms réelles écoulées depuis la dernière image (instant exact du clic)
   * @returns {'fired' | 'armed' | 'released' | 'split' | false}
   */
  trigger(lead = 0) {
    if (this.armed) return this.fire(lead) ? 'released' : false
    if (this.#state === STATE.FLYING && this.#activeProjectiles().some((p) => p.canActivate)) return this.activate() ? 'split' : false
    if (this.#state !== STATE.AIMING) return false
    if (!this.fire(lead)) return false
    return this.#engine === 'trebuchet' ? 'armed' : 'fired'
  }

  /** Les vidéos récompensées de la partie sont-elles encore proposables ? */
  get rewardsLeft() {
    return { hint: !this.#hintUsed && this.#mode.id === 'story', freePower: !this.#freePowerUsed && this.#mode.id === 'story' }
  }

  /**
   * Indice (vidéo récompensée, campagne solo) : la trajectoire prévue s'affiche
   * pour le prochain tir. Une fois par niveau, sur présentation d'un ticket.
   */
  grantHint(ticket) {
    if (this.#hintUsed || this.#mode.id !== 'story' || this.#state !== STATE.AIMING || !RewardTicket.redeem(ticket, 'hint')) return false
    this.#hintUsed = true
    this.#hint = true
    this.emit('hud', this.hud)
    return true
  }

  /**
   * Pouvoir offert (vidéo récompensée, campagne solo) : un pouvoir débloqué,
   * sans coût en points. Une fois par niveau, sur présentation d'un ticket.
   */
  usePowerFree(id, ticket) {
    if (this.#freePowerUsed || this.#mode.id !== 'story' || this.#state !== STATE.AIMING || this.#powerUsedThisTurn || !this.#unlockedPowers.has(id)) return false
    if (!RewardTicket.redeem(ticket, 'free-power')) return false
    this.#freePowerUsed = true
    return this.usePower(id, { free: true })
  }

  /**
   * Tire ! Au trébuchet : premier appel = libère le contrepoids (le tir est
   * engagé), second appel = lâche la fronde.
   * @param {number} [lead] voir trigger()
   */
  fire(lead = 0) {
    const player = this.player
    if (this.armed) {
      if (!this.catapult.release(Number.isFinite(lead) ? lead : 0)) return false
      this.emit('hud', this.hud)
      return true
    }
    if (this.#state !== STATE.AIMING || player.shotsLeft === 0 || this.catapult.busy) return false
    // Trébuchet encore en remise en batterie : on la termine, le clic n'est jamais perdu.
    if (this.#engine === 'trebuchet' && !this.catapult.ready) this.catapult.reload()
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
    // Trébuchet : projectiles plus lourds (voir TREBUCHET_MASS).
    if (this.#engine === 'trebuchet') shot.mods.massFactor *= TREBUCHET_MASS
    shot.mods.blastFactor = this.#mode.effects.blastFactor ?? 1
    shot.mods.fireFactor = this.#mode.effects.fireFactor ?? 1
    if (shot.windOverride !== null) this.world.wind = shot.windOverride
    if (player.shotsLeft !== null) player.shotsLeft--
    this.#shooter = this.#active
    // L'indice ne vaut que pour un tir.
    this.#hint = false
    const treb = this.#engine === 'trebuchet'
    const entry = treb ? { k: 't', d: this.steps - this.#aimStep, a: type } : { k: 'f', d: this.steps - this.#aimStep, a: type, ang: this.catapult.angle, pow: this.catapult.power }
    this.#log.push(entry)
    this.#fireStep = this.steps
    this.score.startShot(type)
    this.#setState(STATE.FLYING)
    this.#feedback({ sound: 'creak', x: this.catapult.x, intensity: 0.6 })
    const launch = (start, v) => {
      this.#loadedAmmo = null
      this.#pendingLaunch = null
      entry.l = this.steps - this.#fireStep
      if (treb) entry.r = this.catapult.simTime
      this.#spawnStep = this.steps
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
      this.#feedback({ sound: 'launch', x: this.catapult.x, caption: treb ? 'launchTreb' : 'launch', haptic: 'launch' })
      this.emit('hud', this.hud)
    }
    if (this.#engine === 'trebuchet') {
      // Le contrepoids tombe : le tir est engagé, il partira au lâcher (2e clic).
      this.catapult.setLoadRadius(PROJECTILE_TYPES[type].radius)
      this.#loadedAmmo = type
      this.catapult.arm(({ point, velocity }) => (this.#replay ? null : launch(point, velocity)))
      this.#feedback({ sound: 'creak', x: this.catapult.x, intensity: 1, caption: 'swing' })
      this.emit('announce', { key: 'a11y.swing' })
    } else {
      this.catapult.fire(() => (this.#replay ? null : launch(this.catapult.launchPoint, this.catapult.velocity)))
    }
    // Relecture : le lancement attend le pas enregistré (ReplayPlayer → replayLaunch).
    if (this.#replay) this.#pendingLaunch = { launch, type }
    if (type !== 'stone' && player.ammo[type] === 0) player.selectedAmmo = 'stone'
    this.emit('hud', this.hud)
    return true
  }

  /** Action en vol (mitraille : division en trois). */
  activate() {
    const p = this.#activeProjectiles().find((x) => x.canActivate)
    if (!p) return false
    this.#log.push({ k: 'x', d: this.steps - this.#spawnStep })
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
    // La fumée et les flammes dérivent avec le vent du moment.
    this.particles.wind = this.world.windField.sample(this.catapult.x, this.world.time).value
    this.particles.update(dt * timeScale)
    this.#visualEffects()
    this.#updateCamera(dt)
    if (this.#state === STATE.AIMING || this.#state === STATE.FLYING) this.#watchGusts()
    if (this.armed) this.#swingTicks()
    else this.#tickBand = null

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
      this.#restT = this.world.isAtRest() && !this.catapult.busy && !this.#pendingLaunch && !waitFire ? this.#restT + dt : 0
      const allDown = this.targetsLeft === 0
      if (!this.#pendingLaunch && (this.#restT >= REST_CONFIRM_MS || (this.#stateT > MAX_TURN_MS && !waitFire) || this.#stateT > FIRE_WAIT_MS || (allDown && this.#stateT > 3500))) this.#endTurn()
    }
  }

  /** Données de rendu pour le Renderer. */
  scene() {
    const loadType = this.#state === STATE.AIMING || this.#state === STATE.SETTLING || this.armed ? this.#loadedAmmo ?? this.player.selectedAmmo : null
    // Même emplacement pour tous (histoire, duel) : on ne dessine que la catapulte active.
    const shared = this.#mode.id !== 'versus'
    const catapults = this.players
      .filter((p) => !shared || p.index === this.#active)
      .map((p) => {
        const mine = p.index === this.#active
        const treb = p.catapult.kind === 'trebuchet'
        return {
          kind: treb ? 'trebuchet' : 'catapult',
          rig: treb ? p.catapult.rig : null,
          // Trébuchet : le projectile reste dans la fronde jusqu'au lâcher.
          loaded: treb ? p.catapult.phase === 'idle' || p.catapult.phase === 'swing' : true,
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
      season: this.season,
      time: this.#time,
      animate: !this.options.reducedMotion,
      catapults,
      versus: this.#mode.id === 'versus',
      wind: {
        field: this.world.windField,
        time: this.world.time,
        animate: !this.options.reducedMotion,
        catapults: catapults.map((c) => ({ x: c.x, y: c.y, dir: c.dir, offset: c.kind === 'trebuchet' ? 250 : 150 })),
        top: this.#mode.id === 'versus' ? null : this.#castleTop(),
      },
    }
  }

  /** Sommet du château (bloc debout le plus haut) : on y plante le fanion. */
  #castleTop() {
    let best = null
    for (const e of this.world.entities()) {
      if (e.kind !== 'block' || !e.alive || e.x < 900) continue
      const top = e.y - e.height / 2
      if (!best || top < best.y) best = { x: e.x, y: top }
    }
    return best
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
    if (s === STATE.AIMING) this.#aimStep = this.steps
    this.emit('hud', this.hud)
  }

  /** Réglage « Puissance au début du tour » (100 % par défaut). */
  #applyStartPower() {
    const p = this.options.startPower
    if (p === 'keep' || !Number.isFinite(p)) return
    for (const pl of this.players) pl.catapult.setAim(pl.catapult.angle, clamp(p / 100, 0, 1))
  }

  /**
   * Vent ressenti à la catapulte, pour le HUD : force du moment (rafale
   * comprise), rafale en cours (−1 à 1), et vent « dynamique » (Difficile).
   */
  #windView() {
    const field = this.world.windField
    const live = field.dynamic && field.base !== 0
    const { value, gust } = live ? field.sample(this.catapult.x, this.world.time) : { value: this.world.wind, gust: 0 }
    // Vitesse affichée : force réelle (le Difficile souffle ×2,4 plus fort).
    const kmh = Math.round(Math.abs(value) * 30 * field.profile.ratio)
    const level = kmh === 0 ? 'calm' : kmh < 20 ? 'breeze' : kmh < 45 ? 'strong' : 'storm'
    return { windNow: Math.round(value * 100) / 100, windKmh: kmh, windLevel: level, gust: Math.round(gust * 100) / 100, windDynamic: field.dynamic }
  }

  /** Difficile : une rafale forcit à la catapulte → son, sous-titre (malentendants). */
  #watchGusts() {
    const field = this.world.windField
    if (!field.dynamic || field.base === 0) return
    const g = field.gustAt(this.catapult.x, this.world.time)
    if (g > 0.55 && this.#lastGustLevel <= 0.55 && this.#time - this.#lastGustAt > 3000) {
      this.#lastGustAt = this.#time
      this.#feedback({ sound: 'gust', x: this.catapult.x + 300 * Math.sign(field.base), intensity: 0.5 + Math.abs(field.base) * 0.6, caption: 'gust' })
    }
    this.#lastGustLevel = g
  }

  #rollWind() {
    const max = this.#level.wind * DIFFICULTY[this.#difficulty].windFactor
    if (max <= 0) {
      this.#baseWind = 0
    } else {
      // Difficile : le vent n'est jamais une simple brise.
      const mag = max * this.#windRng.range(this.world.windField.dynamic ? 0.6 : 0.35, 1)
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
    this.#loadEngine()
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
    const treb = this.#engine === 'trebuchet'
    if (treb && this.armed) {
      // Balancier : tout le terrain reste visible (le bras ET le château), pour choisir l'instant du lâcher.
      this.camera.overview()
    } else if (this.#state === STATE.FLYING && flying.length && this.camera.follow) {
      const dir = this.catapult.dir
      const lead = flying.reduce((a, b) => (b.x * dir > a.x * dir ? b : a))
      this.camera.track(lead.x, lead.y, { keepGround: treb })
    } else if (treb && this.#state === STATE.FLYING && this.camera.follow) {
      // Le projectile a frappé : la caméra reste sur le château le temps qu'il s'effondre.
      this.camera.frame(this.#castleLeft() - 250, this.focus.right + 60, 0.8)
    } else {
      this.camera.overview()
    }
    this.camera.update(dt)
  }

  /**
   * Trébuchet : un « tic » à chaque tranche de 15° de l'angle de lâcher, de
   * plus en plus aigu à mesure que le tir se relève. On peut ainsi choisir
   * l'instant du lâcher à l'oreille (malvoyants).
   */
  #swingTicks() {
    const a = this.catapult.angle
    if (a < -15 || a > 105) return
    const band = Math.floor(a / 15)
    if (band !== this.#tickBand && this.#tickBand !== null) {
      this.#feedback({ sound: 'tick', x: this.catapult.x, intensity: 0.2 + clamp((a + 15) / 120, 0, 1) * 1.3 })
    }
    this.#tickBand = band
  }

  /** Bord avant du château (premier bloc debout). */
  #castleLeft() {
    let left = Infinity
    for (const e of this.world.entities()) if (e.kind === 'block' && e.alive && e.x > 600) left = Math.min(left, e.x - e.width / 2)
    return Number.isFinite(left) ? left : this.focus.right - 800
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
