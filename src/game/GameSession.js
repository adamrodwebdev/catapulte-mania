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
import { Flyer } from './entities/Flyer.js'
import { Projectile, PROJECTILE_TYPES } from './entities/Projectile.js'
import { Catapult, AIM } from './Catapult.js'
import { Trebuchet, TREBUCHET_X, TREBUCHET_MASS, TREBUCHET_TOP_SPEED } from './Trebuchet.js'
import { TrebuchetInput } from './aim/TrebuchetInput.js'
import { Ballista } from './Ballista.js'
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
import { EngineCondition } from '../domain/EngineCondition.js'

/** Niveaux de « premiers pas » (trajectoire montrée, premier tir réglé). */
export const ASSIST_LEVELS = 3

/** États d'une partie. */
/** Durée du plan d'ouverture sur le château (ms). */
/** Durée du gros plan sur l'impact (ms). */
export const PUNCH_MS = 1000

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
const AMMO_ORDER = Object.freeze(['stone', 'fire', 'boulder', 'frost', 'bomb', 'split'])
/** Engins de siège : catapulte (visée angle + puissance) ou trébuchet (deux clics). */
export const ENGINES = Object.freeze(['catapult', 'trebuchet', 'ballista'])

/** Couleurs des fanions des joueurs (modes à deux). */
const PLAYER_FLAGS = Object.freeze(['#a3322b', '#3d7a3a'])

/** Trébuchet : sans aide à la trajectoire, seul le début de la courbe est montré pendant la jauge. */
const TREB_PATH_HINT = 0.45

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
 *  - `timing`    : { grade, error } note d'un lâcher au trébuchet (v5.3)
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
  /** Arrêt sur image d'un gros choc (ms) : l'impact « pèse » (v5.7). */
  #hitStop = 0
  /** Seaux d'eau du niveau (v5.8) : ils éteignent le feu de l'engin. */
  #buckets = { left: 0, total: 0 }
  /** Puissance laissée à l'engin par ses avaries (appliquée à sa vitesse de tir). */
  #powerFactor = 1
  /** Défenseurs abattus d'affilée pendant ce tir (doublé, triplé…). */
  #chain = { count: 0, at: -Infinity }
  /** Gros plan bref sur le premier impact d'un tir : { x, y, ms } ou null. */
  #punch = null
  #punchUsed = false
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
  #assist = false
  #hintUsed = false
  #freePowerUsed = false
  /** Point d'impact prévu du trébuchet (cache par pas de simulation). */
  /** Le repère d'impact était-il sur le château à l'image précédente ? (signal sonore) */
  /** Tir suivi pour tracer sa trajectoire (repère fantôme du tir suivant). */
  #tracked = null
  /** Repère sonore du balancier : dernière tranche de 15° annoncée. */
  #tickBand = null
  options = { trajectoryAid: false, reducedMotion: false, blood: true, screams: true }

  /**
   * @param {object} level niveau gelé issu du LevelRepository
   * @param {{ difficulty: string, completedLevels: number, trajectoryAid?: boolean, reducedMotion?: boolean, screenShake?: boolean, blood?: boolean }} opts
   */
  /**
   * @param {object} level niveau (LevelRepository) ou arène (ArenaRepository), gelé
   * @param {object} opts options d'affichage et de difficulté
   * @param {import('./modes/GameMode.js').GameMode} [mode] règles (histoire par défaut)
   */
  constructor(level, { difficulty, completedLevels, trajectoryAid = false, reducedMotion = false, screenShake = true, blood = true, screams = true, startPower = 100, effects = NO_EFFECTS, continueOffer = false, engine = 'catapult', slowSwing = false, infiniteSwing = false, replay = false, season = null }, mode = null) {
    super()
    this.#level = level
    this.#difficulty = Guard.oneOf(difficulty, GAME.DIFFICULTIES, 'difficulty')
    Guard.int(completedLevels, 'completedLevels', { min: 0, max: GAME.LEVEL_COUNT })
    this.#mode = mode || new StoryMode({ effects, completedLevels })
    const fx = this.#mode.effects
    this.#unlockedPowers = new Set(this.#mode.powersEnabled ? PowerRegistry.unlocked(completedLevels).map((p) => p.id) : [])
    const diff = DIFFICULTY[this.#difficulty]
    this.#windRng = new SeededRandom(level.seed)
    /**
     * Premiers pas (campagne, niveaux 1 à 3) : la trajectoire est montrée et le
     * premier tir est déjà réglé pour toucher. Un nouveau joueur réussit son
     * premier tir avant d'avoir rien lu (exigence de prise en main des portails).
     */
    this.#assist = this.#mode.id === 'story' && level.id <= ASSIST_LEVELS
    this.options = { trajectoryAid: trajectoryAid || this.#assist, reducedMotion, blood, screams: Boolean(screams), startPower, trail: fx.trail || 'smoke' }
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
    /** Balancier infini : sans objet depuis la v5.4 (le lâcher est programmé), gardé pour les réglages. */
    this.infiniteSwing = false

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
            ? new Trebuchet(TREBUCHET_X, { speedFactor: fx.speedFactor })
            : this.#engine === 'ballista'
              ? new Ballista(CATAPULT_X.left, { speedFactor: fx.speedFactor })
              : new Catapult(right ? CATAPULT_X.right : CATAPULT_X.left, { dir: right ? -1 : 1, speedFactor: fx.speedFactor }),
        score: shared ?? new ScoreKeeper(level, this.#difficulty),
        shotsTotal: shots,
        shotsLeft: shots,
        ammo: this.#mode.ammoFor(level, diff, i),
        selectedAmmo: 'stone',
        flag: this.#mode.players.length > 1 ? PLAYER_FLAGS[i] : null,
      }
    })

    this.world = new PhysicsWorld(this.#events, { seed: level.seed, windProfile: WIND_PROFILES[this.#difficulty], zones: level.zones ?? [] })
    // Le trébuchet est en retrait : le monde s'étend jusqu'à lui (un tir lâché trop tôt part en arrière).
    if (this.#engine === 'trebuchet') this.world.leftLimit = TREBUCHET_X - 700
    /** Zone cadrée par la caméra : de l'engin au bout du château. */
    this.focus = Object.freeze({
      left: this.#engine === 'trebuchet' ? TREBUCHET_X - 230 : level.focus.left,
      right: level.focus.right,
      top: level.focus.top,
    })
    this.particles = new ParticleSystem()
    this.particles.surfaceAt = (x, y) => this.world.solidAt(x, y)
    this.particles.density = reducedMotion ? 0.35 : 1
    this.camera = new Camera()
    this.camera.follow = !reducedMotion
    this.camera.shakeEnabled = screenShake && !reducedMotion

    for (const b of level.blocks) this.world.add(new Block(b))
    for (const t of level.targets) this.world.add(new Target(t, diff.targetHp))
    for (const b of level.barrels) this.world.add(new Barrel(b))
    for (const f of level.flyers ?? []) this.world.add(new Flyer(f))
    this.#applyStartPower()
    this.#loadEngine()
    // État de l'engin (v5.8) : points de vie, avaries, seaux d'eau. Les pillards
    // trouvent l'engin grâce à la navigation des défenseurs (voir ../ai/).
    this.condition = new EngineCondition({ difficulty: this.#difficulty })
    this.condition.raining = level.chapter === 9
    this.condition.onChange = (kind, data) => this.#onCondition(kind, data)
    const buckets = versus ? 0 : (level.buckets ?? 0)
    const allowed = this.#difficulty === 'hard' ? Math.min(buckets, Math.max(1, buckets - 1)) : buckets
    this.#buckets = { left: allowed, total: allowed }
    for (const p of this.players) p.baseSpeedFactor = p.catapult.speedFactor
    this.world.units.setEngines(() => (versus ? [] : [this.#engineSpot()]))
    // Trébuchet (v5.4) : 1er clic = point d'impact, 2e clic = arc (voir aim/TrebuchetInput.js).
    this.trebInput = this.#engine === 'trebuchet' ? new TrebuchetInput({ sweepMs: TrebuchetInput.sweepFor(this.#difficulty, slowSwing) }) : null
    this.#bindWorldEvents()
    this.#rollWind()
    // Niveau 1 : premier tir déjà réglé ; niveaux 2 et 3 : le joueur vise, la trajectoire le guide.
    if (this.#assist && level.id === 1 && this.#engine === 'catapult') this.#aimAtFirstTarget()
  }

  /** Règle la visée (angle de 35°) pour que la pierre arrive sur la cible la plus proche. */
  #aimAtFirstTarget() {
    const target = this.world
      .filter((e) => e.kind === 'target' && e.alive)
      .sort((a, b) => a.x - b.x)[0]
    if (!target) return
    const c = this.catapult
    const angle = 35
    let lo = 0.05
    let hi = 1
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2
      c.setAim(angle, mid)
      const pts = TrajectoryPredictor.predict(c.launchPoint, c.velocity, { wind: this.world.wind, maxPoints: 400, every: 1 })
      const at = pts.find((p) => p.x >= target.x)
      if ((at ? at.y : Infinity) > target.y) lo = mid
      else hi = mid
    }
    c.setAim(angle, Math.round(((lo + hi) / 2) * 100) / 100)
  }

  /* ---------- Lecture d'état ---------- */

  get level() {
    return this.#level
  }
  /** Niveau de premiers pas (trajectoire toujours montrée). */
  get assist() {
    return this.#assist
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
      // Valeurs exactes de la visée (pas de 0,5° et 0,5 %, v5.2).
      angle: this.#engine === 'trebuchet' ? this.#trebHud().angle : Math.round(this.catapult.angle * 2) / 2,
      power: this.#engine === 'trebuchet' ? this.#trebHud().power : Math.round(this.catapult.power * 200) / 2,
      engine: this.#engine,
      armed: this.armed,
      trebPhase: this.trebPhase,
      trebBar: this.#trebBar(),
      rewinding: this.rewinding,
      ammo: this.ammo,
      powers: this.powers,
      canActivate: this.#activeProjectiles().some((p) => p.canActivate),
      activateKind: this.#activeProjectiles().find((p) => p.canActivate)?.diveable ? 'dive' : 'split',
      rewards: this.rewardsLeft,
      hint: this.#hint,
      turn: this.#turn,
      condition: this.#conditionView(),
    }
  }

  /* ---------- État de l'engin (v5.8) ---------- */

  /** Avaries de l'engin pour le rendu. */
  #conditionScene() {
    const c = this.condition
    const view = this.#conditionView()
    return { heat: c.heat, frozen: c.frozen, crack: c.crackLevel, rust: c.rust, hp: c.hp / c.maxHp, show: Boolean(view?.show) }
  }

  /** Avaries de l'engin pour l'interface (null au face-à-face : pas de pillards). */
  #conditionView() {
    if (this.#mode.id === 'versus') return null
    const c = this.condition
    const raid = this.world.units.raiders
    return {
      hp: Math.ceil(c.hp),
      maxHp: c.maxHp,
      states: c.states,
      power: Math.round(c.powerFactor * 100),
      buckets: this.#buckets.left,
      bucketsTotal: this.#buckets.total,
      raiders: raid,
      // Affiché dès qu'une menace existe ou que l'engin a souffert.
      show: raid > 0 || this.#buckets.total > 0 || c.hp < c.maxHp || c.states.length > 0,
    }
  }

  /** Où se tient l'engin, et son flanc tourné vers le château (là où frappent les pillards). */
  #engineSpot() {
    const c = this.catapult
    const half = c.kind === 'trebuchet' ? 118 : c.kind === 'ballista' ? 80 : 88
    return { x: c.x, y: c.y, dir: c.dir, front: c.x + c.dir * half }
  }

  /** Avance l'état de l'engin et applique ses avaries à la puissance de tir. */
  #tickCondition(ms) {
    if (this.#mode.id === 'versus') return
    this.condition.update(ms)
    const f = this.condition.powerFactor
    if (f !== this.#powerFactor) {
      this.#powerFactor = f
      for (const p of this.players) p.catapult.speedFactor = p.baseSpeedFactor * f
      this.emit('hud', this.hud)
    }
  }

  /**
   * Seau d'eau (v5.8) : éteint d'un coup le feu de l'engin… au prix d'une
   * couche de rouille sur les ferrures. Utilisable en visée comme en plein vol.
   * @returns {boolean} succès
   */
  useBucket() {
    if (this.#state === STATE.ENDED || this.#state === STATE.OFFER || this.#buckets.left <= 0 || !(this.condition.heat > 0)) return false
    this.#buckets.left--
    this.#log.push({ k: 'w', d: this.steps })
    const spot = this.#engineSpot()
    this.particles.steam(spot.x, spot.y - 70, 90)
    this.particles.splash(spot.x + spot.dir * 20, false)
    this.condition.douse()
    this.emit('hud', this.hud)
    return true
  }

  /** Avaries : son, sous-titre, annonce pour les lecteurs d'écran, et fin de partie si l'engin est détruit. */
  #onCondition(kind, data = {}) {
    const x = this.catapult.x
    const sounds = { ignite: 'fire', fireUp: 'fire', freeze: 'frost', crack: 'breach', destroyed: 'explosion', extinguish: data.by === 'water' ? 'splash' : 'steam' }
    const haptic = kind === 'destroyed' ? 'explosion' : kind === 'ignite' || kind === 'crack' ? 'impact' : null
    this.#feedback({ sound: sounds[kind], x, intensity: kind === 'fireUp' ? 0.6 + (data.level ?? 1) * 0.2 : 1, caption: `engine.${kind}`, haptic })
    if (['ignite', 'fireUp', 'freeze', 'crack', 'rust', 'destroyed'].includes(kind)) this.emit('announce', { key: `captions.engine.${kind}`, params: data })
    if (kind === 'crack') this.camera.shake(5)
    if (kind === 'destroyed') {
      const spot = this.#engineSpot()
      this.particles.explosion(spot.x, spot.y - 60, 140)
      this.particles.debris(spot.x, spot.y - 60, 'wood', 120)
      this.camera.shake(14)
      if (this.#state !== STATE.ENDED) this.#finish({ won: false, winner: null, reason: 'engine' })
    }
    this.emit('hud', this.hud)
  }

  /* ---------- Trébuchet (v5.4) ---------- */

  /** La cible a été choisie par le joueur (sinon : le défenseur le plus proche). */
  #userTarget = false
  /** Tir programmé (après le 2e clic) : sa courbe reste affichée jusqu'au lâcher. */
  #trebLocked = null

  /**
   * Prédiction du vol pour le trébuchet : vent du moment, rafale du moment
   * figée (Difficile) ; les rafales à venir restent imprévisibles.
   */
  #trebPredict(ammo, { obstacles = [], maxPoints = 600, every = 1 } = {}) {
    const field = this.world.windField
    const calm = this.#pendingPower === 'falcon'
    const windage = windageOf({ type: ammo, radius: PROJECTILE_TYPES[ammo].radius })
    const time = this.world.time
    return (start, velocity) =>
      TrajectoryPredictor.predict(start, velocity, {
        wind: calm ? 0 : this.world.wind,
        windAccel: calm || !field.dynamic ? null : field.frozen(start.x, time, windage),
        obstacles,
        maxPoints,
        every,
      })
  }

  /**
   * Tir du trébuchet pour une position de jauge (0 = cloche, 1 = tendu) :
   * instant de lâcher (la fronde part sous l'angle voulu), point de départ, et
   * vitesse qui mène exactement à la cible — sans dépasser la vitesse de
   * pointe de l'engin.
   * @returns {{ gauge: number, angle: number, release: number, point: {x:number,y:number}, velocity: {x:number,y:number}, speed: number, reachable: boolean } | null}
   */
  trebShot(gauge, ammo = this.player.selectedAmmo) {
    const ti = this.trebInput
    if (!ti?.target) return null
    Guard.number(gauge, 'gauge', { min: 0, max: 1 })
    const c = this.catapult
    const angle = TrebuchetInput.angleFor(gauge)
    const loadRadius = PROJECTILE_TYPES[ammo].radius
    const release = Trebuchet.releaseFor(angle, { loadRadius })
    const natural = Trebuchet.preview(release, { x: c.x, dir: c.dir, speedFactor: c.speedFactor, loadRadius })
    if (!natural) return null
    // Au sol, c'est le bas du boulet qui touche : son centre vise un rayon plus haut.
    const aim = { x: ti.target.x, y: Math.min(ti.target.y, WORLD.GROUND_Y - loadRadius) }
    // Le contrepoids est « ajusté » : jusqu'à la vitesse de pointe de l'engin, sous tous les angles.
    const vmax = TREBUCHET_TOP_SPEED * c.speedFactor
    const sol = TrebuchetInput.solve({ start: natural.point, target: aim, angle, dir: c.dir, vmax, predict: this.#trebPredict(ammo) })
    return { gauge, angle, release, point: natural.point, ...sol }
  }

  /** Angle (°) et puissance (%) du trébuchet pour le panneau : arc de la jauge, puis tir programmé. */
  #trebHud() {
    const locked = this.#trebLocked
    if (locked) return { angle: Math.round(locked.angle), power: Math.round((locked.speed / (TREBUCHET_TOP_SPEED * this.catapult.speedFactor)) * 100) }
    if (this.trebPhase === 'power') return { angle: Math.round(TrebuchetInput.angleFor(this.trebInput.gauge)), power: null }
    return { angle: null, power: null }
  }

  /** Étape du trébuchet : 'target' (point d'impact), 'power' (jauge), ou null. */
  get trebPhase() {
    return this.trebInput && this.#state === STATE.AIMING && !this.catapult.busy ? this.trebInput.phase : null
  }

  /** Position de la jauge (0 = cloche, 1 = tendu). */
  get trebGauge() {
    return this.trebInput ? this.trebInput.gauge : null
  }

  #canTarget() {
    return Boolean(this.trebInput) && this.#state === STATE.AIMING && !this.catapult.busy
  }

  /** Cible ramenée sur le terrain, devant l'engin et jamais sous le sol. */
  #clampTarget(x, y) {
    Guard.number(x, 'target x', { min: -5000, max: 10000 })
    Guard.number(y, 'target y', { min: -5000, max: 5000 })
    const c = this.catapult
    const near = c.x + 160 * c.dir
    const fx = c.dir === 1 ? Math.min(Math.max(x, near), WORLD.WIDTH + 150) : Math.max(Math.min(x, near), -150)
    return { x: fx, y: Math.min(Math.max(y, -1200), WORLD.GROUND_Y) }
  }

  /**
   * 1er clic : le point d'impact (exactement là où le joueur a touché) ; la jauge part.
   * @returns {boolean}
   */
  placeTrebTarget(x, y) {
    if (!this.#canTarget()) return false
    const t = this.#clampTarget(x, y)
    this.trebInput.place(t.x, t.y)
    this.#userTarget = true
    this.emit('hud', this.hud)
    return true
  }

  /** Glissé ou flèches : déplace la cible (la jauge, si elle tourne, continue). */
  moveTrebTarget(x, y) {
    if (!this.#canTarget()) return false
    const t = this.#clampTarget(x, y)
    this.trebInput.move(t.x, t.y)
    this.#userTarget = true
    this.emit('hud', this.hud)
    return true
  }

  /** Clavier : décale la cible de `dx` unités du monde. */
  nudgeTrebTarget(dx) {
    const t = this.trebInput?.target
    if (!t) return false
    Guard.number(dx, 'dx', { min: -500, max: 500 })
    return this.moveTrebTarget(t.x + dx * this.catapult.dir, t.y)
  }

  /** Espace / bouton : valide la cible proposée et lance la jauge. */
  startTrebGauge() {
    const t = this.trebInput?.target
    if (!t || !this.#canTarget()) return false
    this.trebInput.place(t.x, t.y)
    this.emit('hud', this.hud)
    return true
  }

  /** Nouveau tour : retour au choix de la cible ; cible proposée sur le défenseur le plus proche. */
  #newTrebTurn() {
    const ti = this.trebInput
    if (!ti) return
    ti.reset()
    this.#trebLocked = null
    const t = ti.target
    const stillThere = t && (this.#userTarget || this.world.filter((e) => e.kind === 'target' && e.alive && Math.hypot(e.x - t.x, e.y - t.y) < 30).length)
    if (stillThere) return
    this.#userTarget = false
    const first = this.world.filter((e) => e.kind === 'target' && e.alive).sort((a, b) => (a.x - b.x) * this.catapult.dir)[0]
    if (first) {
      const p = this.#clampTarget(first.x, first.y)
      ti.move(p.x, p.y)
    } else ti.clear()
  }

  /** Points de l'aide à la trajectoire (ou null si désactivée / hors visée). */
  get trajectory() {
    const falcon = this.#pendingPower === 'falcon'
    // Baliste (v5.1) : sa ligne de mire (début de la trajectoire) reste toujours visible.
    const sight = this.#engine === 'ballista' && !this.options.trajectoryAid && !this.#hint && !falcon
    if (!this.options.trajectoryAid && !this.#hint && !falcon && !sight) return null
    // Trébuchet (v5.4) : sa courbe est dessinée avec la jauge (voir trebAim).
    if (this.#engine === 'trebuchet' || this.#state !== STATE.AIMING) return null
    const calm = falcon
    const field = this.world.windField
    const start = this.catapult.launchPoint
    const projType = this.#engine === 'ballista' ? 'bolt' : this.player.selectedAmmo
    const windage = windageOf({ type: projType, radius: PROJECTILE_TYPES[projType].radius })
    return TrajectoryPredictor.predict(start, this.catapult.velocity, {
      wind: calm ? 0 : this.world.wind,
      windAccel: calm || !field.dynamic ? null : field.frozen(start.x, this.world.time, windage),
      // La baliste tire à travers la roche : la mire l'ignore.
      obstacles: this.world.filter((e) => e.kind !== 'projectile' && e.kind !== 'flyer' && !(projType === 'bolt' && e.terrain)),
      // Œil du faucon : la courbe entière, jusqu'au point d'impact.
      maxPoints: falcon ? 400 : sight ? 14 : this.#engine === 'trebuchet' ? 110 : 60,
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

  /**
   * Le joueur prend la main. Sans objet depuis la v5.8 : le plan d'ouverture
   * (zoom sur les défenseurs, source de mal des transports) est supprimé et la
   * partie s'ouvre directement sur la vue d'ensemble. Gardé pour l'interface.
   */
  skipIntro() {}

  /** Ajustement relatif (clavier, boutons fins). */
  nudge(dAngle, dPower) {
    this.skipIntro()
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
    this.#log.push({ k: 'p', d: this.steps, id })
    if (!free) this.score.spend(this.#mode.powerCost(power))
    if (power.immediate) {
      this.world.arm()
      power.activate(this)
      if (id === 'quake') {
        this.camera.shake(14)
        this.#feedback({ sound: 'explosion', x: 1700, intensity: 0.8, caption: 'quake', haptic: 'explosion' })
      }
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
    if (this.#engine === 'trebuchet' && pending.plan) {
      // v5.4 : le tir a été recalculé au même instant du monde, à partir des gestes enregistrés.
      this.catapult.forceRelease()
      pending.launch(pending.plan.point, pending.plan.velocity)
    } else if (this.#engine === 'trebuchet') {
      // Défis enregistrés avant la v5.4 : instant de lâcher noté.
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
    if (this.armed) return false
    if (this.#state === STATE.FLYING && this.#activeProjectiles().some((p) => p.canActivate)) return this.activate() ? 'split' : false
    if (this.#state !== STATE.AIMING) return false
    // Trébuchet : valider le point d'impact lance la jauge ; le clic suivant tire.
    if (this.trebPhase === 'target') return this.startTrebGauge() ? 'aimed' : false
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
   * Tire ! Au trébuchet (v5.4) : le balancier part et la fronde s'ouvrira
   * d'elle-même sous l'arc choisi (jauge, ou `arc` imposé : relecture, tests).
   * @param {number} [_lead] sans objet depuis la v5.4 (gardé pour la signature de trigger())
   * @param {{ arc?: number }} [opts]
   */
  fire(_lead = 0, { arc } = {}) {
    this.#punch = null
    this.#punchUsed = false
    this.#chain = { count: 0, at: -Infinity }
    const player = this.player
    // Trébuchet : le lâcher est programmé, rien à faire pendant le balancier.
    if (this.armed) return false
    if (this.#state !== STATE.AIMING || player.shotsLeft === 0 || this.catapult.busy) return false
    // Trébuchet : il faut un point d'impact, et la position de la jauge (ou l'arc imposé).
    const gauge = this.#engine === 'trebuchet' ? (arc ?? this.trebInput?.gauge) : null
    if (this.#engine === 'trebuchet') {
      if (!this.trebInput?.target) return false
      Guard.number(gauge, 'arc', { min: 0, max: 1 })
    }
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
    // Baliste : la munition choisie devient un carreau spécial.
    const ballista = this.#engine === 'ballista'
    if (ballista) {
      if (type === 'fire') shot.mods.ignites = true
      if (type === 'frost') shot.mods.frost = true
      if (type === 'bomb') shot.mods.explodes = true
      if (type === 'split') shot.mods.splits = true
      if (type === 'boulder') shot.mods.massFactor *= 1.3
    }
    const projType = ballista ? 'bolt' : type
    shot.mods.blastFactor = this.#mode.effects.blastFactor ?? 1
    shot.mods.fireFactor = this.#mode.effects.fireFactor ?? 1
    if (shot.windOverride !== null) this.world.wind = shot.windOverride
    // Trébuchet : tir calculé maintenant (vent du moment), rejouable à l'identique.
    const plan = this.#engine === 'trebuchet' ? this.trebShot(gauge, type) : null
    if (plan) {
      const tg = this.trebInput.target
      plan.path = this.#trebPath(plan, type, 1)
      plan.target = { ...tg }
      this.#trebLocked = plan
    }
    if (player.shotsLeft !== null) player.shotsLeft--
    this.#shooter = this.#active
    // L'indice ne vaut que pour un tir.
    this.#hint = false
    const treb = this.#engine === 'trebuchet'
    // v5.0 : pas ABSOLU du geste (depuis le début de la partie). Des créatures
    // volent pendant la visée : un tir doit partir au même instant du monde.
    const entry = treb ? { k: 't', d: this.steps, a: type, tx: plan.target.x, ty: plan.target.y, g: plan.gauge } : { k: 'f', d: this.steps, a: type, ang: this.catapult.angle, pow: this.catapult.power }
    this.#log.push(entry)
    this.#fireStep = this.steps
    this.score.startShot(type)
    this.#setState(STATE.FLYING)
    this.#feedback({ sound: 'creak', x: this.catapult.x, intensity: 0.6 })
    const launch = (start, v) => {
      this.#loadedAmmo = null
      this.#pendingLaunch = null
      entry.l = this.steps - this.#fireStep
      this.#trebLocked = null
      this.#spawnStep = this.steps
      // Éventail : trois (Salve) ou cinq (Pluie de feu) projectiles.
      const spreads = shot.count === 5 ? [-5, -2.5, 0, 2.5, 5] : shot.count === 3 ? [-2.5, 0, 2.5] : [0]
      const mid = (spreads.length - 1) / 2
      // Repère fantôme (v5.2) : la trajectoire du projectile central est mémorisée.
      const ghost = treb ? null : { angle: this.catapult.angle, power: this.catapult.power, path: [{ x: start.x, y: start.y }] }
      player.lastShot = ghost
      spreads.forEach((deg, i) => {
        const p = new Projectile(projType, start.x - i * 4, start.y + i * 3, shot.mods)
        this.world.add(p)
        if (ghost && i === Math.floor(mid)) this.#tracked = { p, path: ghost.path, n: 0 }
        const a = (deg * Math.PI) / 180
        const factor = 1 + (i - mid) * 0.02
        Matter.Body.setVelocity(p.body, {
          x: (v.x * Math.cos(a) - v.y * Math.sin(a)) * factor,
          y: (v.x * Math.sin(a) + v.y * Math.cos(a)) * factor,
        })
      })
      this.#feedback({ sound: ballista ? 'bolt' : 'launch', x: this.catapult.x, caption: treb ? 'launchTreb' : ballista ? 'launchBallista' : 'launch', haptic: 'launch' })
      this.emit('hud', this.hud)
    }
    if (this.#engine === 'trebuchet') {
      // Le contrepoids tombe ; la fronde s'ouvrira d'elle-même sous l'arc choisi,
      // avec la vitesse calculée pour atteindre le point visé.
      this.catapult.setLoadRadius(PROJECTILE_TYPES[type].radius)
      this.#loadedAmmo = type
      this.catapult.arm(() => (this.#replay ? null : launch(plan.point, plan.velocity)))
      this.catapult.scheduleRelease(plan.release)
      this.#feedback({ sound: 'creak', x: this.catapult.x, intensity: 1, caption: 'swing' })
      this.emit('announce', { key: 'a11y.swing' })
    } else {
      this.catapult.fire(() => (this.#replay ? null : launch(this.catapult.launchPoint, this.catapult.velocity)))
    }
    // Relecture : le lancement attend le pas enregistré (ReplayPlayer → replayLaunch).
    if (this.#replay) this.#pendingLaunch = { launch, type, plan }
    if (type !== 'stone' && player.ammo[type] === 0) player.selectedAmmo = 'stone'
    this.emit('hud', this.hud)
    return true
  }

  /** Action en vol (mitraille : division en trois). */
  activate() {
    const p = this.#activeProjectiles().find((x) => x.canActivate)
    if (!p) return false
    this.#log.push({ k: 'x', d: this.steps - this.#spawnStep })
    if (p.diveable) {
      this.world.dive(p)
      this.#feedback({ sound: 'launch', x: p.x, intensity: 1.2, caption: 'dive' })
    } else {
      this.world.splitProjectile(p)
      this.#feedback({ sound: 'split', x: p.x, caption: 'split' })
    }
    this.emit('hud', this.hud)
    return true
  }

  /* ---------- Boucle ---------- */

  /** @param {number} dtMs temps réel écoulé depuis l'image précédente */
  update(dtMs) {
    const dt = clamp(dtMs, 0, 100)
    this.#time += dt
    this.#stateT += dt
    const timeScale = this.#hitStop > 0 ? 0.04 : this.#slowMo > 0 ? 0.35 : 1
    this.#hitStop = Math.max(0, this.#hitStop - dt)
    this.#slowMo = Math.max(0, this.#slowMo - dt)
    // Les pillards ne courent que pendant le vol des tirs : la pression reste au tour par tour.
    this.world.units.marching = this.#state === STATE.FLYING
    const steps = this.#state !== STATE.ENDED || this.#stateT < 4000 ? this.world.step(dt, timeScale) : 0
    if (steps) this.#tickCondition(steps * WORLD.STEP_MS)
    this.catapult.update(dt)
    // La fumée et les flammes dérivent avec le vent du moment.
    this.particles.wind = this.world.windField.sample(this.catapult.x, this.world.time).value
    this.particles.update(dt * timeScale)
    this.#visualEffects()
    this.#trackGhost()
    this.#updateCamera(dt)
    if (this.#state === STATE.AIMING || this.#state === STATE.FLYING) this.#watchGusts()
    if (this.armed) {
      // Repère sonore : un tic de plus en plus aigu suit l'angle de la fronde.
      this.#swingTicks()
    } else {
      this.#tickBand = null
    }

    if (this.#state === STATE.SETTLING && this.#stateT >= SETTLE_MS) {
      this.#setState(STATE.AIMING)
      this.emit('announce', { key: 'a11y.levelStart', params: { targets: this.targetsLeft, shots: this.player.shotsLeft ?? '∞' } })
      if (this.players.length > 1) this.emit('turn', { player: this.#active, name: this.player.name })
    } else if (this.#state === STATE.AIMING) {
      // Trébuchet : la jauge oscille (temps réel ; la position figée au clic est enregistrée).
      if (this.trebPhase === 'power') this.trebInput.tick(dt)
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
          kind: p.catapult.kind === 'ballista' ? 'ballista' : treb ? 'trebuchet' : 'catapult',
          tension: p.catapult.tension ?? 1,
          angle: p.catapult.angle,
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
          // Avaries (v5.8) : feu, givre, fissures, rouille, points de vie.
          condition: shared ? this.#conditionScene() : null,
        }
      })
    return {
      camera: this.camera,
      entities: this.world.entities(),
      particles: this.particles,
      trajectory: this.trajectory,
      theme: this.#level.chapter,
      terrain: this.world.terrain,
      worldTime: this.world.time,
      trebAim: this.#trebView(),
      season: this.season,
      time: this.#time,
      animate: !this.options.reducedMotion,
      catapults,
      // Ouvrages des pillards (v5.8) : échelles et chantiers.
      works: this.world.units.works,
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
      if (e.kind !== 'block' || !e.alive || e.terrain || e.construct || e.x < 900) continue
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
    if (s === STATE.AIMING) {
      this.#aimStep = this.steps
      this.#newTrebTurn()
    }
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
    // Orage (v5.8) : la pluie rouille l'engin, une couche tous les trois tours.
    if (this.condition.raining && this.#turn % 3 === 0) this.condition.addRust()
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
    // Château pris : confettis au-dessus des ruines.
    if (won && this.#mode.id !== 'versus' && !this.options.reducedMotion) {
      const left = this.#castleLeft()
      this.particles.confetti((left + this.focus.right) / 2, WORLD.GROUND_Y - 380, Math.max(300, this.focus.right - left))
    }
    this.#feedback({ sound: happy ? 'victory' : 'defeat', x: 1000, caption: happy ? 'victory' : 'defeat', haptic: happy ? 'victory' : 'defeat' })
    this.emit('end', { won, result, winner, scores, reason, renown: [...this.#renown], mode: this.#mode.id })
  }

  /** Haut actuel du château (blocs et personnages encore debout), pour cadrer au plus près. */
  #castleRoof() {
    let top = Infinity
    for (const e of this.world.entities()) {
      if (!e.alive || e.x < 600 || e.terrain || e.construct || (e.kind !== 'block' && e.kind !== 'target' && e.kind !== 'barrel')) continue
      top = Math.min(top, e.y - e.height / 2)
    }
    return Number.isFinite(top) ? top - 40 : this.focus.top
  }

  #updateCamera(dt) {
    const flying = this.#activeProjectiles()
    const treb = this.#engine === 'trebuchet'
    const cam = this.camera
    // Gros plan sur le premier impact (hors face-à-face, où il y a deux
    // châteaux) : modéré (×1,4 au plus) pour ne pas donner le mal des transports.
    const solo = this.#mode.id !== 'versus'
    const close = Math.min(1.05, cam.fitScale * 1.4)
    const castle = () => cam.frame(this.#castleLeft() - 160, this.focus.right + 70, 0.95, this.#castleRoof())
    if (this.#punch && this.#punch.ms > 0 && solo) this.#punch.ms -= dt
    if (treb && this.armed) {
      // Balancier : tout le terrain reste visible (le bras ET le château), pour choisir l'instant du lâcher.
      cam.overview()
    } else if (this.#punch && this.#punch.ms > 0 && solo && cam.follow) {
      cam.focusOn(this.#punch.x, this.#punch.y, close)
    } else if (this.#state === STATE.FLYING && flying.length && cam.follow) {
      const dir = this.catapult.dir
      const lead = flying.reduce((a, b) => (b.x * dir > a.x * dir ? b : a))
      cam.track(lead.x, lead.y, { keepGround: true })
    } else if (solo && (this.#state === STATE.FLYING || this.#state === STATE.ENDED) && cam.follow) {
      // Effondrement puis fin de partie : au plus près de ce qui reste du château.
      castle()
    } else {
      cam.overview()
    }
    cam.update(dt)
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

  /**
   * Barre du panneau du trébuchet : où est la cible (0 = engin, 1 = bout du
   * terrain) et où se trouve le château.
   */
  #trebBar() {
    const tg = this.trebInput?.target
    if (!tg) return null
    const from = this.catapult.x
    const to = this.focus.right + 120
    const f = (x) => Math.round(Math.max(0, Math.min(1, (x - from) / (to - from))) * 1000) / 1000
    return { target: f(tg.x), castle: [f(this.#castleLeft()), f(this.focus.right)] }
  }

  /** Trace la course du tir en cours (un point tous les 3 rafraîchissements), jusqu'au premier choc. */
  #trackGhost() {
    const tr = this.#tracked
    if (!tr) return
    const p = tr.p
    if (++tr.n % 3 === 0 || p.hasImpacted || !p.alive) tr.path.push({ x: Math.round(p.x), y: Math.round(p.y) })
    if (p.hasImpacted || !p.alive || tr.path.length > 400) this.#tracked = null
  }

  /** Dernier tir du joueur actif : angle, puissance et trajectoire (repères de la visée). */
  get lastShot() {
    return this.player.lastShot ?? null
  }

  /**
   * Courbe d'un tir du trébuchet pour le dessin : elle s'arrête au premier
   * obstacle (on voit si l'arc passe au-dessus du rempart).
   */
  #trebPath(shot, ammo, share) {
    const obstacles = this.world.filter((e) => e.kind !== 'projectile' && e.kind !== 'flyer')
    const pts = this.#trebPredict(ammo, { obstacles, maxPoints: 200, every: 3 })(shot.point, shot.velocity)
    return share >= 1 ? pts : pts.slice(0, Math.max(2, Math.ceil(pts.length * share)))
  }

  /** Cible, jauge et courbe du trébuchet, pour le dessin (image par image). */
  #trebView() {
    const ti = this.trebInput
    if (!ti?.target) return null
    const locked = this.#trebLocked
    if (locked && (this.armed || this.#pendingLaunch)) {
      return { x: locked.target.x, y: locked.target.y, phase: 'fired', gauge: locked.gauge, angle: locked.angle, reachable: locked.reachable, path: locked.path, origin: this.#dialOrigin() }
    }
    const phase = this.trebPhase
    if (!phase) return null
    const view = { x: ti.target.x, y: ti.target.y, phase, gauge: null, angle: null, reachable: true, path: null, origin: this.#dialOrigin() }
    if (phase === 'power') {
      const shot = this.trebShot(ti.gauge)
      if (shot) {
        view.gauge = shot.gauge
        view.angle = shot.angle
        view.reachable = shot.reachable
        view.path = this.#trebPath(shot, this.player.selectedAmmo, this.options.trajectoryAid || this.#hint ? 1 : TREB_PATH_HINT)
      }
    }
    return view
  }

  /** Centre du cadran de la jauge : au-dessus du trébuchet. */
  #dialOrigin() {
    const c = this.catapult
    return { x: c.x + 60 * c.dir, y: WORLD.GROUND_Y - 330 }
  }

  /** Bord avant du château (premier bloc debout). */
  #castleLeft() {
    let left = Infinity
    for (const e of this.world.entities()) if (e.kind === 'block' && e.alive && !e.terrain && !e.construct && e.x > 600) left = Math.min(left, e.x - e.width / 2)
    return Number.isFinite(left) ? left : this.focus.right - 800
  }

  #visualEffects() {
    // L'engin en feu (v5.8) : plus le feu est intense, plus il y a de flammes.
    const level = this.condition.fireLevel
    if (level) {
      const spot = this.#engineSpot()
      // Deux foyers par niveau d'intensité, des flammes plus grosses à chaque niveau.
      for (let i = 0; i < level * 2; i++) {
        const u = ((this.#time / 97 + i * 0.37) % 1) - 0.5
        this.particles.flame(spot.x + u * 130, spot.y - 25 - ((i * 37) % 70), 30 + level * 12, 1.3 + level * 0.35)
      }
    }
    for (const e of this.world.entities()) {
      if (e.burning > 0 && e.kind !== 'projectile') this.particles.flame(e.x, e.y - e.height / 2, e.width)
      if (e.kind === 'projectile' && !e.hasImpacted) this.particles.trail(e.x, e.y, e.ignites, e.frost ? 'snow' : this.options.trail)
      // Veilleurs (v5.8) : quelques escarbilles s'échappent de la torche.
      if (e.kind === 'target' && e.torch && e.alive && ((this.#time / 16) | 0) % 9 === e.id % 9) {
        const tip = e.torchTip
        this.particles.spark(tip.x, tip.y)
      }
      // Boulet encore brûlant après l'impact : il continue de flamber.
      if (e.kind === 'projectile' && e.hasImpacted && e.heatMs > 0) this.particles.flame(e.x, e.y - e.radius * 0.6, e.radius * 1.2)
    }
  }

  #feedback(f) {
    this.emit('feedback', f)
  }

  /**
   * Un pillard frappe l'engin (v5.8) : torche (feu), pot de givre, marteau du
   * saboteur ou massue de l'ogre (dégâts bruts).
   */
  #engineStruck(raider, x) {
    const c = this.condition
    const spot = this.#engineSpot()
    const payload = raider.raid
    if (payload === 'fire') {
      c.ignite(1)
      c.hit(3)
    } else if (payload === 'frost') {
      c.freeze()
      c.hit(3)
      this.particles.frost(spot.front, spot.y - 50, 60)
    } else {
      c.hit(payload === 'smash' ? 13 : 9)
      this.particles.impact(spot.front, spot.y - 45, 'wood', payload === 'smash' ? 700 : 400)
      this.camera.shake(payload === 'smash' ? 6 : 3)
    }
    this.#feedback({ sound: payload === 'smash' ? 'stone' : payload === 'blow' ? 'hammer' : payload === 'frost' ? 'frost' : 'wood', x, intensity: 1, caption: `unit.strike.${payload}`, haptic: 'impact' })
    this.emit('hud', this.hud)
  }

  /** Arrêt sur image (sauf animations réduites) : jamais cumulé au-delà de 100 ms. */
  #freeze(ms) {
    if (this.options.reducedMotion || this.#state !== STATE.FLYING) return
    this.#hitStop = Math.min(100, Math.max(this.#hitStop, ms))
  }

  /**
   * Enchaînement (v5.7) : deux défenseurs abattus à moins de 1,5 s d'écart
   * pendant le même tir font un « doublé », puis un « triplé », puis un
   * « carnage ». Annonce dans la scène (`callout`), cloche qui monte, sous-titre.
   */
  #countChain(entity) {
    if (this.#state !== STATE.FLYING) return
    const c = this.#chain
    c.count = this.#time - c.at <= 1500 ? c.count + 1 : 1
    c.at = this.#time
    if (c.count < 2) return
    const tier = Math.min(3, c.count - 1)
    this.emit('callout', { key: ['double', 'triple', 'rampage'][tier - 1], tier, x: entity.x, y: entity.y - 170 })
    this.#feedback({ sound: 'combo', x: entity.x, intensity: [0.8, 1.1, 1.4][tier - 1], caption: 'combo', haptic: 'kill' })
  }

  #bindWorldEvents() {
    const ev = this.#events
    ev.on('entity:destroyed', ({ entity, cause }) => {
      // Pont des pillards rompu (v5.8) : ni points ni statistiques de château.
      if (entity.construct) {
        this.particles.debris(entity.x, entity.y, 'wood', 80)
        this.#feedback({ sound: 'wood', x: entity.x, intensity: 1, caption: 'unit.bridgeDown', haptic: 'impact' })
        return
      }
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
          this.particles.blood(entity.x, entity.y, WORLD.GROUND_Y, Math.abs(vx) > 0.5 ? Math.sign(vx) : 0)
        } else {
          this.particles.dust(entity.x, entity.y, 10)
        }
        this.#feedback({ sound: 'down', x: entity.x, caption: `down.${entity.type}`, haptic: 'kill' })
        // Cri du défenseur (réglage « Cris des soldats ») : voix selon le personnage.
        if (this.options.screams) this.#feedback({ sound: 'scream', x: entity.x, intensity: entity.type === 'knight' || entity.type === 'ogre' ? 1.3 : entity.type === 'king' ? 0.5 : 1, caption: 'scream' })
        this.emit('announce', { key: 'a11y.targetDown', params: { left: this.targetsLeft } })
        this.#countChain(entity)
        if (this.targetsLeft === 0 && !this.options.reducedMotion) this.#slowMo = 900
      } else if (entity.kind === 'flyer') {
        if (gained) this.particles.text(entity.x, entity.y - 30, `+${gained}`, '#cfe6ff')
      } else if (entity.kind === 'block') {
        this.particles.debris(entity.x, entity.y, entity.material, Math.max(entity.width, entity.height))
        if (gained && entity.scoreValue >= 100) this.particles.text(entity.x, entity.y - 20, `+${gained}`, '#e8eef7')
        this.#feedback({ sound: entity.sound, x: entity.x, intensity: 0.8, caption: cause === 'fire' ? null : `break.${entity.material}` })
      }
      this.emit('hud', this.hud)
    })
    ev.on('impact', ({ entity, energy, x, y, material }) => {
      if (energy < 25) return
      // Premier gros choc du tir sur le château : bref gros plan sur l'impact.
      if (!this.#punchUsed && energy > 120 && entity.kind !== 'projectile' && this.#state === STATE.FLYING && !this.options.reducedMotion) {
        this.#punchUsed = true
        this.#punch = { x, y, ms: PUNCH_MS }
      }
      // Éclats, étincelles, gerbes de terre : la matière réagit au choc.
      if (energy > 60) {
        if (entity.kind === 'projectile') {
          if (y > WORLD.GROUND_Y - 30) this.particles.groundHit(x, energy)
        } else if (entity.kind === 'block' || entity.kind === 'barrel') {
          this.particles.impact(x, y, entity.kind === 'barrel' ? 'barrel' : material, energy)
        }
      }
      const sound = entity.kind === 'target' ? 'hit' : entity.kind === 'barrel' ? 'wood' : material
      this.#feedback({ sound, x, intensity: clamp(energy / 400, 0.3, 1.2), caption: null, haptic: energy > 300 ? 'impact' : null })
      if (energy > 400) this.camera.shake(Math.min(6, energy / 300))
      if (energy > 900 && entity.kind !== 'projectile') this.#freeze(40)
    })
    ev.on('explosion', ({ x, y, radius }) => {
      this.particles.explosion(x, y, radius)
      this.camera.shake(12)
      this.#freeze(90)
      this.#feedback({ sound: 'explosion', x, intensity: 1, caption: 'explosion', haptic: 'explosion' })
    })
    ev.on('structure:collapse', ({ entity }) => {
      this.particles.dust(entity.x, entity.y - entity.height / 2, 12)
      this.particles.dust(entity.x, WORLD.GROUND_Y - 10, 8, '190,175,150')
      this.camera.shake(5)
      this.#feedback({ sound: entity.sound || 'wood', x: entity.x, intensity: 1, caption: 'collapse', haptic: 'impact' })
    })
    // v5.0 : percée, givre, vapeur, terrains et créatures volantes.
    ev.on('breach', ({ x, y, material }) => {
      this.particles.impact(x, y, material, 900)
      this.camera.shake(7)
      this.#freeze(60)
      this.#feedback({ sound: 'breach', x, intensity: 1, caption: 'breach', haptic: 'impact' })
    })
    ev.on('frost', ({ x, y, radius }) => {
      this.particles.frost(x, y, radius)
      this.#feedback({ sound: 'frost', x, intensity: 0.9, caption: 'frost', haptic: 'impact' })
    })
    ev.on('steam', ({ x, y, radius, entity }) => {
      this.particles.steam(x, y, radius)
      // Vapeur « décorative » (boulet éteint dans l'eau) : sans sous-titre d'alerte.
      this.#feedback({ sound: 'steam', x, intensity: entity ? 1 : 0.5, caption: entity ? 'steam' : null })
    })
    ev.on('terrain', ({ kind, x }) => {
      if (kind === 'skip') this.particles.splash(x, false)
      else if (kind === 'drown' || kind === 'thaw') this.particles.splash(x, true)
      else if (kind === 'melt') this.particles.melt(x)
      else if (kind === 'crust' || kind === 'freeze') this.particles.frost(x, WORLD.GROUND_Y - 10, 60)
      else if (kind === 'snow') this.particles.dust(x, WORLD.GROUND_Y - 6, 6, '245,248,252')
      const sound = { skip: 'splash', drown: 'splash', thaw: 'steam', melt: 'steam', crust: 'frost', freeze: 'frost', snow: 'snow' }[kind]
      this.#feedback({ sound, x, intensity: kind === 'skip' ? 0.6 : 0.9, caption: `terrain.${kind}` })
    })
    ev.on('flyer:hit', ({ entity, x, y }) => {
      this.particles.feathers(x, y, entity.type === 'wyvern' ? '#4a6b3a' : '#1f1f29', entity.type === 'wyvern' ? 16 : 12)
      this.#feedback({ sound: 'flyer', x, intensity: 0.8, caption: `flyer.${entity.type}`, haptic: 'kill' })
    })
    ev.on('ogre', ({ kind, x, y, other }) => {
      // Revers de massue : éclats et poussière, gros plan si c'est le tir du joueur.
      this.particles.impact(other?.x ?? x, other?.y ?? y, 'wood', 400)
      this.particles.dust(x, y + 20, 4)
      this.camera.shake(4)
      this.#feedback({ sound: 'breach', x, intensity: 0.7, caption: `ogre.${kind}`, haptic: 'impact' })
    })
    // v5.8 : capacités des défenseurs (voir ../ai/).
    ev.on('unit', (data) => {
      const { kind, entity, block, x, y } = data
      if (kind === 'dodge') {
        this.particles.dust(x, entity.y + entity.height / 2 - 4, 4)
        this.#feedback({ sound: 'whoosh', x, intensity: 0.6, caption: 'unit.dodge' })
      } else if (kind === 'shieldBlock') {
        this.particles.impact(x, y, 'iron', 500)
        this.camera.shake(3)
        this.#feedback({ sound: 'iron', x, intensity: 1, caption: 'unit.shieldBlock', haptic: 'impact' })
      } else if (kind === 'repair') {
        this.#feedback({ sound: 'hammer', x: block?.x ?? x, intensity: 1, caption: 'unit.repair' })
      } else if (kind === 'repaired') {
        this.particles.dust(x, y, 6, '220,200,160')
        this.#feedback({ sound: 'hammer', x, intensity: 0.7, caption: 'unit.repaired' })
      } else if (kind === 'raid') {
        this.#feedback({ sound: 'scream', x, intensity: entity.type === 'ogre' ? 1.3 : 1, caption: `unit.raid.${entity.raid}` })
        this.emit('announce', { key: `captions.unit.raid.${entity.raid}` })
      } else if (kind === 'strike') {
        this.#engineStruck(entity, x)
      } else if (kind === 'crew') {
        this.particles.dust(x, entity.y, 8)
        this.#feedback({ sound: 'hit', x, intensity: 1, caption: 'unit.crew' })
      } else if (kind === 'build') {
        this.#feedback({ sound: 'hammer', x, intensity: 0.8, caption: `unit.build.${data.work}` })
      } else if (kind === 'built') {
        this.particles.dust(x, WORLD.GROUND_Y - 6, 6, '200,170,120')
        this.#feedback({ sound: 'wood', x, intensity: 0.7, caption: `unit.built.${data.work}` })
      } else if (kind === 'ladderDown') {
        this.particles.debris(x, y, 'wood', 60)
        this.#feedback({ sound: 'wood', x, intensity: 1, caption: 'unit.ladderDown', haptic: 'impact' })
      } else if (kind === 'torchDrop') {
        this.particles.flame(x, y - 6, 24)
        this.#feedback({ sound: 'fire', x, intensity: 0.9, caption: 'unit.torchDrop' })
      }
    })
    ev.on('flyer:drop', ({ x }) => {
      this.#feedback({ sound: 'fire', x, intensity: 0.7, caption: 'flyerDrop' })
    })
    ev.on('lightning', ({ x, y }) => {
      this.particles.lightning(x, y, Math.min(-300, y - 700))
      this.camera.shake(10)
      this.#feedback({ sound: 'thunder', x, intensity: 1, caption: 'lightning', haptic: 'explosion' })
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
