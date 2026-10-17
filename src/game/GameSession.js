import Matter from 'matter-js'
import { EventBus } from '../core/utils/EventBus.js'
import { Guard } from '../core/utils/Guard.js'
import { SeededRandom } from '../core/utils/SeededRandom.js'
import { clamp } from '../core/utils/math.js'
import { DIFFICULTY, GAME } from '../config/gameConfig.js'
import { PhysicsWorld } from './physics/PhysicsWorld.js'
import { WIND_PROFILES, windageOf } from './physics/WindField.js'
import { WORLD_WINDS, worldWindFor, exposureStep } from './physics/WorldWinds.js'
import { MILL } from './entities/props.js'
import { WORLD } from './physics/constants.js'
import { RAID } from './ai/UnitBrain.js'
import { FREEFALL } from './physics/FallingObjects.js'
import { Block } from './entities/Block.js'
import { Target } from './entities/Target.js'
import { General } from './entities/General.js'
import { WarCouncil } from './bosses/WarCouncil.js'
import { livesFor } from './bosses/generals.js'
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
import { EngineCondition, RAID_STRIKE } from '../domain/EngineCondition.js'
import { SessionEffects } from './effects/SessionEffects.js'
import { GameFeel } from './feel/GameFeel.js'
import { DRIVE, extentOf } from './drive/driveRules.js'
import { GAUGE, gaugeTaught } from './levels/campaignRules.js'
import { EngineDrive } from './drive/EngineDrive.js'
import { driveControls, rangeMarker } from './drive/DriveView.js'

/** Niveaux de « premiers pas » (trajectoire montrée, premier tir réglé). */
export const ASSIST_LEVELS = 3

/** États d'une partie. */
export const STATE = Object.freeze({
  SETTLING: 'settling',
  AIMING: 'aiming',
  FLYING: 'flying',
  /** Défaite en suspens : un dernier tir est proposé contre une vidéo (portails). */
  OFFER: 'offer',
  /** Grand siège (v6.0) : une étape est prise, la suivante se prépare. */
  STAGE: 'stage',
  /** Tour du général (v6.0) : il donne son ordre entre deux tirs. */
  ENEMY: 'enemy',
  ENDED: 'ended',
})

/** Grand siège : pas de simulation entre la prise d'une étape et l'arrivée de la suivante (≈ 1,1 s). */
export const STAGE_SWAP_STEPS = 132
/** Tour du général : pas avant son ordre (le temps de l'annoncer), durées d'affichage (ms). */
export const ENEMY_ACT_STEPS = 48
const ENEMY_MIN_MS = 1500
const ENEMY_MAX_MS = 4500

/**
 * Coup de grâce (v6.0). Suspense : le tir file vers la dernière cible, le
 * temps ralentit et le tambour roule (rien ne change à la simulation : le
 * ralenti espace seulement les pas). Puis, la victoire acquise, chaque tir
 * restant éclate en points, un par un, avant le bilan.
 */
const SUSPENSE = Object.freeze({ RANGE: 260, MAX_MS: 1400, SCALE: 0.4 })
export const BONUS_POP_MS = 230
const BONUS_POP_MAX = 12

/** Jauge de destruction (v6.0) : règles dans levels/campaignRules.js. */
export { GAUGE }


const SETTLE_MS = 1200
const REST_CONFIRM_MS = 450
const MAX_TURN_MS = 11000
const IDLE_WIN_MS = 1200
const FIRE_WAIT_MS = 20000
// v6.1 : botte de paille, orbe d'orage et pot de poison à la suite.
export const AMMO_ORDER = Object.freeze(['stone', 'fire', 'boulder', 'frost', 'bomb', 'split', 'bale', 'thunder', 'poison'])
/** Engins de siège : catapulte (visée angle + puissance) ou trébuchet (deux clics). */
export const ENGINES = Object.freeze(['catapult', 'trebuchet', 'ballista'])

/** Déplacement de l'engin (v6.2) : règles dans drive/driveRules.js. */
export { DRIVE }

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
  /** Suspense du dernier tir : { turn, t, on, slow, x, y } ou null (v6.0). */
  #suspense = null
  /** Tirs restants qui éclatent en points après la victoire : { left, paid, t, next, per, final } ou null. */
  #bonus = null
  /** Score affiché pendant ce décompte (sinon le score courant), et tirs déjà changés en points. */
  #shownScore = null
  #bonusPaid = 0
  /** Fin de partie en plan large (décompte des tirs restants). */
  #wideEnd = false
  /** Coup de pouce (0 à 0,3) : défenseurs moins résistants, vent plus faible. */
  #luck = 0
  /** Jauge de destruction de l'étape : { value, goal, earned } (goal 0 : pas de jauge). */
  #gauge = { value: 0, goal: 0, earned: false }
  /** Défenseurs abattus pendant ce tir (aucun : un défenseur raille le tir manqué). */
  #downThisShot = 0
  /** Sensation de jeu (v6.2) : arrêts sur image, ralenti, gros plan (voir feel/GameFeel.js). */
  #feel = new GameFeel()
  /** Effets de la partie (v6.2) : particules, sons, sous-titres, répliques (voir effects/SessionEffects.js). @type {SessionEffects} */
  #effects = null
  /** Seaux d'eau du niveau (v5.8) : ils éteignent le feu de l'engin. */
  #buckets = { left: 0, total: 0 }
  /** Puissance laissée à l'engin par ses avaries (appliquée à sa vitesse de tir). */
  #powerFactor = 1
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
  /** Grand siège (v6.0) : étape en cours (0 = le château du niveau) et ses cibles de départ. */
  #stageIndex = 0
  #stageTargets = 0
  /** Général de l'étape en cours (v6.0), ou null. */
  #council = null
  /** Tour du général en cours : son ordre est-il donné ? */
  #enemy = null
  /** Effets programmés à un pas précis : { at, run, seq } triés par pas (voir #runScheduled). */
  #scheduled = []
  #seq = 0
  /** Relecture : pas enregistrés des étapes (g) et des ordres des généraux (b). */
  #recorded = null
  /** Ordres des généraux : vent imposé au prochain tour, couvre-feu (pas d'aide à la visée). */
  #windOverride = null
  #curfew = false
  #curfewNext = false
  /** Repère sonore du balancier : dernière tranche de 15° annoncée. */
  #tickBand = null
  /** Souffle du monde (v6.1, voir physics/WorldWinds.js) : son élément, ou null. */
  #element = null
  /** Déplacement de l'engin (v6.2, voir drive/EngineDrive.js). @type {EngineDrive} */
  #drive = null
  /** Bord gauche du cadrage au départ (il suit l'engin quand il roule). */
  #focusLeft0 = 0
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
  constructor(level, { difficulty, completedLevels, trajectoryAid = false, reducedMotion = false, screenShake = true, blood = true, screams = true, healthBars = true, startPower = 100, effects = NO_EFFECTS, continueOffer = false, engine = 'catapult', slowSwing = false, infiniteSwing = false, replay = false, season = null, luck = 0 }, mode = null) {
    super()
    this.#level = level
    // Coup de pouce discret (v6.0, premier chapitre après des défaites : voir SaveSlot.luckFor).
    this.#luck = clamp(Number(luck) || 0, 0, 0.3)
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
    this.#assist = this.#mode.aimAssist && level.id <= ASSIST_LEVELS
    // v6.1 : barres de vie des défenseurs (réglage, affichées par défaut).
    this.options = { trajectoryAid: trajectoryAid || this.#assist, reducedMotion, blood, screams: Boolean(screams), healthBars: healthBars !== false, startPower, trail: fx.trail || 'smoke' }
    /** Proposer un dernier tir contre une vidéo (campagne solo, portails). */
    this.continueOffer = Guard.boolean(continueOffer, 'continueOffer')
    const versus = this.#mode.twoCamps
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

    // Souffle du monde (v6.1) : le vent du chapitre (le Fort de pierre souffle en rafales à toutes les difficultés).
    this.windId = level.worldWind ?? worldWindFor(level.chapter)
    this.#element = WORLD_WINDS[this.windId] ?? WORLD_WINDS.breeze
    const profile = WIND_PROFILES[this.#difficulty]
    const windProfile = this.#element.gust ? { ...profile, gust: Math.max(profile.gust, this.#element.gust) } : profile
    this.world = new PhysicsWorld(this.#events, { seed: level.seed, windProfile, zones: level.zones ?? [], joints: true, jointToughness: this.#mode.fortify?.joints ?? 1 })
    this.world.setWorldWind(this.windId)
    // Le trébuchet est en retrait : le monde s'étend jusqu'à lui (un tir lâché trop tôt part en arrière).
    if (this.#engine === 'trebuchet') this.world.leftLimit = TREBUCHET_X - 700
    /** Zone cadrée par la caméra : de l'engin au bout du château. */
    this.focus = Object.freeze({
      left: this.#engine === 'trebuchet' ? TREBUCHET_X - 230 : level.focus.left,
      right: level.focus.right,
      top: level.focus.top,
    })
    // v6.1 : les moulins font face à l'engin ; l'Hiver gèle l'eau, la Tempête trempe tout.
    this.world.engineX = this.#engine === 'trebuchet' ? TREBUCHET_X : CATAPULT_X.left
    this.#drive = new EngineDrive(this.catapult.x)
    this.#focusLeft0 = this.focus.left
    this.world.weather = { wet: level.chapter === 9, winter: level.chapter === 8 }
    this.particles = new ParticleSystem()
    this.particles.surfaceAt = (x, y) => this.world.solidAt(x, y)
    this.particles.density = reducedMotion ? 0.35 : 1
    this.camera = new Camera()
    this.camera.follow = !reducedMotion
    this.camera.shakeEnabled = screenShake && !reducedMotion
    // Effets (v6.2) : ils lisent la partie sans rien y changer.
    const self = this
    this.#effects = new SessionEffects({
      particles: this.particles,
      camera: this.camera,
      emit: (event, payload) => this.emit(event, payload),
      options: this.options,
      feel: this.#feel,
      barkSeed: (level.seed * 7 + 3) >>> 0,
      port: {
        get time() {
          return self.#time
        },
        get flying() {
          return self.#state === STATE.FLYING
        },
        get targetsLeft() {
          return self.targetsLeft
        },
        engineSpot: () => self.#engineSpot(),
        get world() {
          return self.world
        },
        get condition() {
          return self.condition
        },
        get element() {
          return self.#element
        },
        get twoCamps() {
          return self.#mode.twoCamps
        },
      },
    })

    // Effets programmés (étapes, ordres des généraux) et déplacement de l'engin : au pas exact, avant la simulation.
    this.world.beforeStep = () => {
      this.#runScheduled()
      this.#stepDrive()
    }
    // État de l'engin (v5.8) : un pas après l'autre, en partie comme en relecture (v6.2 : en
    // partie, une fois par image pour tous ses pas ; la relecture différait d'un pas sur une longue brûlure).
    this.world.afterStep = () => this.#tickCondition(WORLD.STEP_MS)
    this.#spawnCastle(level)
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

  /** Grand siège (v6.0) : étape en cours (1 = le château du niveau) et nombre d'étapes. */
  get stage() {
    return this.#stageIndex + 1
  }

  get stageCount() {
    return this.#mode.grandSiege === false ? 1 : (this.#level.stageCount ?? 1)
  }

  /** Général de l'étape en cours (conseil de guerre), ou null. */
  get council() {
    return this.#council
  }

  /** Couvre-feu (ordre d'un général) : pas d'aide à la visée ni de repère du tir précédent. */
  get curfew() {
    return this.#curfew
  }

  /**
   * Relecture (« Bats mon tir ») : instants enregistrés des étapes et des ordres
   * des généraux. Appelé par le ReplayPlayer avant de rejouer.
   * @param {{ k: string, d: number }[]} actions
   */
  preloadRecorded(actions) {
    this.#recorded = {
      g: actions.filter((a) => a.k === 'g').map((a) => a.d),
      b: actions.filter((a) => a.k === 'b').map((a) => a.d),
      e: actions.filter((a) => a.k === 'e').map((a) => a.d),
      i: actions.filter((a) => a.k === 'i').map((a) => a.d),
    }
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
      score: this.#shownScore === null ? this.score.current : Math.round(this.#shownScore),
      shotsLeft: this.player.shotsLeft === null ? null : this.player.shotsLeft - this.#bonusPaid,
      shotsTotal: this.player.shotsTotal,
      // Pierres gagnées à la jauge de destruction (v6.0), et la jauge elle-même.
      bonusShots: this.player.bonusShots ?? 0,
      gauge: this.#gauge.goal ? { ratio: Math.min(1, this.#gauge.value / this.#gauge.goal), earned: this.#gauge.earned } : null,
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
      targetsTotal: Math.max(this.targetsLeft, this.#stageTargets + (this.#council?.summonCount ?? 0)),
      // Grand siège et général (v6.0).
      stage: this.#stageIndex + 1,
      stageCount: this.stageCount,
      general: this.#council?.view() ?? null,
      curfew: this.#curfew,
      wind: Math.round(this.world.wind * 100) / 100,
      ...this.#windView(),
      // v6.1 : le souffle du monde (son nom remplace « Vent » quand il porte un élément).
      worldWind: this.worldWind,
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
      drive: this.#driveView(),
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
    if (this.#mode.twoCamps) return null
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
    const half = extentOf(c.kind).front
    return { x: c.x, y: c.y, dir: c.dir, front: c.x + c.dir * half }
  }

  /** Avance l'état de l'engin et applique ses avaries à la puissance de tir. */
  #tickCondition(ms) {
    if (this.#mode.twoCamps) return
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

  /* ---------- Déplacement de l'engin (v6.2) ---------- */

  /** L'engin de cette partie roule-t-il ? (catapulte et baliste, hors face-à-face) */
  get drivable() {
    return this.#engine !== 'trebuchet' && !this.#mode.twoCamps && !(this.#level.id < this.#mode.driveFromLevel)
  }

  /** L'engin peut-il bouger maintenant ? Pas pendant un tir, ni entre deux étapes, ni après la fin. */
  get #driveOpen() {
    const s = this.#state
    return s !== STATE.FLYING && s !== STATE.STAGE && s !== STATE.ENDED && s !== STATE.OFFER
  }

  /**
   * Avancer (1), reculer (-1) ou s'arrêter (0). Le sens est noté dans le journal
   * au pas près (début et durée) : la relecture refait le même chemin.
   * @param {-1|0|1} dir
   * @returns {boolean} le sens a changé
   */
  drive(dir) {
    if (!this.drivable || this.#state === STATE.ENDED) return false
    const changed = this.#drive.request(dir, this.steps)
    if (!changed) return false
    if (changed.entry && !this.#replay) this.#log.push(changed.entry)
    this.emit('hud', this.hud)
    return true
  }

  /** Arrêt net (tir, fin de partie). */
  #stopDrive() {
    this.#drive.stop(this.steps)
  }

  /** Un pas : l'engin accélère, roule, freine, et s'arrête devant ce qui lui barre la route. */
  #stepDrive() {
    const step = this.#drive.step(this.catapult, this.world, this.drivable && this.#driveOpen)
    if (step.settled) {
      this.emit('hud', this.hud)
      return
    }
    if (step.dx !== 0) this.#moveEngine(step.dx)
    if (!step.hit) return
    // Une fois par poussée : un choc sourd, et ce qui arrête l'engin, dit et sous-titré.
    const c = this.catapult
    this.#feedback({ sound: 'wood', x: c.x + step.side * extentOf(c.kind).front, intensity: 0.35, caption: `drive.${step.hit}` })
    this.emit('announce', { key: `captions.drive.${step.hit}` })
    this.emit('hud', this.hud)
  }

  /** Déplace l'engin (et celui des autres joueurs, à la même place) ; le cadrage le suit. */
  #moveEngine(dx) {
    const shared = !this.#mode.twoCamps
    for (const p of this.players) {
      if (!shared && p !== this.player) continue
      p.catapult.x += dx
      p.catapult.roll = (p.catapult.roll ?? 0) + dx / DRIVE.WHEEL_R
    }
    const c = this.catapult
    this.world.engineX = c.x
    // Même composition autour de l'engin : la vue se resserre quand il avance.
    this.camera.setFocusLeft(this.#focusLeft0 + (c.x - this.#drive.home))
    const crossed = this.#drive.travel(dx, this.world.time)
    if (crossed.dust) {
      // Poussière (neige, sable, terre) soulevée derrière la roue qui suit.
      const x = c.x - Math.sign(dx) * (extentOf(c.kind).rear - 22)
      this.particles.dust(x, WORLD.GROUND_Y - 3, 2, this.#groundDust(x))
    }
    if (crossed.roll) this.#feedback({ sound: 'roll', x: c.x, intensity: 0.5 })
    if (crossed.creak) this.#feedback({ sound: 'creak', x: c.x, intensity: 0.4 })
  }

  /** Teinte de la poussière soulevée par les roues : neige, sable ou terre. */
  #groundDust(x) {
    const ch = this.#level.chapter
    if (this.world.terrain.at(x)?.kind === 'snow' || ch === 7 || ch === 8) return '236,241,248'
    return ch === 6 ? '222,198,152' : '176,156,124'
  }

  /** Commandes de déplacement pour l'interface (null : l'engin ne roule pas). */
  #driveView() {
    return this.drivable ? driveControls(this.#drive, this.catapult, this.world, this.#driveOpen) : null
  }

  /** Flèches plantées au sol à la portée des archers (voir DriveView.js). */
  #driveScene() {
    return this.drivable ? rangeMarker(this.#drive, this.catapult, this.world) : null
  }

  /** Avaries : son, sous-titre, annonce pour les lecteurs d'écran, et fin de partie si l'engin est détruit. */
  #onCondition(kind, data = {}) {
    this.#effects.engineCondition(kind, data, this.catapult.x, this.#engineSpot())
    if (kind === 'destroyed' && this.#state !== STATE.ENDED) this.#finish({ won: false, winner: null, reason: 'engine' })
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
    const air = this.#airOptions(ammo, calm)
    return (start, velocity) =>
      TrajectoryPredictor.predict(start, velocity, {
        wind: calm ? 0 : this.world.wind,
        windAccel: calm || !field.dynamic ? null : field.frozen(start.x, time, windage),
        ...air,
        obstacles,
        maxPoints,
        every,
      })
  }

  /**
   * Ce que l'air fait au tir en plus du vent (v6.1), tel que l'aide à la visée le
   * montre : rafales des moulins du moment, colonnes d'air chaud, et le point où
   * le souffle du monde marque le tir (le sable le freine alors).
   */
  #airOptions(type, calm = false) {
    const windage = windageOf({ type, radius: PROJECTILE_TYPES[type].radius })
    const mill = MILL.ACCEL * WORLD.WIND_RATIO * WORLD.GRAVITY * WORLD.GRAVITY_SCALE * windage
    const props = this.world.props
    const field = this.world.windField
    const element = calm ? null : this.world.exposureElement
    const t = this.world.time
    return {
      gustAccel: props.zones.length ? (x, y) => props.gustAt(x, y) * mill : null,
      lift: this.world.thermals.length ? (x, y) => this.world.liftAt(x, y) : null,
      expose: element ? { step: (x, y) => exposureStep(field.base === 0 ? 0 : field.at(x, y, t), props.gustAt(x, y), WORLD.STEP_MS), element, slow: element === 'sand' ? this.world.worldWind.slow : 0 } : null,
    }
  }

  /**
   * Course entière du tir tel qu'il est réglé, sans obstacles, avec tout ce que
   * l'aide à la visée prend en compte (v6.1). Pour les outils : le joueur
   * automatique de scripts/check-levels.mjs vise comme un joueur qui suit la courbe.
   * @param {string} [type] munition (par défaut, celle choisie)
   */
  predictShot(type = this.player.selectedAmmo, { maxPoints = 400, every = 1 } = {}) {
    const field = this.world.windField
    const start = this.catapult.launchPoint
    const windage = windageOf({ type, radius: PROJECTILE_TYPES[type].radius })
    return TrajectoryPredictor.predict(start, this.catapult.velocity, {
      wind: this.world.wind,
      windAccel: field.dynamic ? field.frozen(start.x, this.world.time, windage) : null,
      ...this.#airOptions(type),
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
    // Couvre-feu (v6.0) : la nuit cache la courbe (l'Œil du faucon, acheté, la montre quand même).
    if (this.#curfew && this.#pendingPower !== 'falcon') return null
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
      // v6.1 : rafales des moulins (celles du moment), colonnes d'air chaud, et repère du souffle du monde.
      ...this.#airOptions(projType, calm),
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
    return { hint: !this.#hintUsed && this.#mode.rewardVideos, freePower: !this.#freePowerUsed && this.#mode.rewardVideos }
  }

  /**
   * Indice (vidéo récompensée, campagne solo) : la trajectoire prévue s'affiche
   * pour le prochain tir. Une fois par niveau, sur présentation d'un ticket.
   */
  grantHint(ticket) {
    if (this.#hintUsed || !this.#mode.rewardVideos || this.#state !== STATE.AIMING || !RewardTicket.redeem(ticket, 'hint')) return false
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
    if (this.#freePowerUsed || !this.#mode.rewardVideos || this.#state !== STATE.AIMING || this.#powerUsedThisTurn || !this.#unlockedPowers.has(id)) return false
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
    this.#feel.newShot()
    this.#effects.newShot()
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
    // L'engin s'immobilise pour tirer (v6.2).
    this.#stopDrive()
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
      // v6.1 : carreau d'orage, carreau à fiole de poison, carreau à tampon (il pousse sans blesser).
      if (type === 'thunder') shot.mods.thunder = true
      if (type === 'poison') shot.mods.poison = true
      if (type === 'bale') shot.mods.soft = true
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
    // Les pillards ne courent qu'une étape par tir (v6.2) : la pression reste au tour par tour.
    this.world.units.grantMarch(RAID.LEG_MS)
    this.#downThisShot = 0
    this.#effects.bark('incoming')
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
    const timeScale = this.#feel.advance(dt, this.#suspense?.on && this.#suspense.slow ? SUSPENSE.SCALE : 1)
    if (this.#state !== STATE.ENDED || this.#stateT < 4000) this.world.step(dt, timeScale)
    this.catapult.update(dt)
    // La fumée et les flammes dérivent avec le vent du moment.
    this.particles.wind = this.world.windField.sample(this.catapult.x, this.world.time).value
    this.particles.update(dt * timeScale)
    this.#effects.ambient()
    this.#trackGhost()
    this.#watchSuspense(dt)
    if (this.#bonus) this.#tickBonus(dt)
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
      // v6.2 : son pas est noté (« i ») ; une relecture conclut au même pas (elle
      // s'arrêtait à la visée, journal épuisé, et le défi ne comptait pas la victoire).
      const recorded = this.#replay ? this.#recorded?.i : null
      if (recorded?.length) {
        if (this.steps >= recorded[0]) {
          recorded.shift()
          this.#idleWin()
        }
      } else {
        this.#idleWinT = this.#mode.evaluate(this)?.won ? this.#idleWinT + dt : 0
        if (this.#idleWinT >= IDLE_WIN_MS) {
          if (!this.#replay) this.#log.push({ k: 'i', d: this.steps })
          this.#idleWin()
        }
      }
    } else if (this.#state === STATE.ENEMY) {
      // Le général a donné son ordre et l'a mené à bien (repli, tirs à distance) : au joueur.
      const done = this.#enemy?.acted && !this.#council?.busy && !this.#scheduled.length
      const elapsed = (this.steps - (this.#enemy?.from ?? this.steps)) * WORLD.STEP_MS
      if ((done && elapsed >= ENEMY_MIN_MS) || (this.#enemy?.acted && elapsed > ENEMY_MAX_MS)) this.#nextTurn()
    } else if (this.#state === STATE.FLYING) {
      // Une cible en feu va succomber : on attend avant de rendre la main.
      // Au dernier tir, on laisse aussi le feu finir son œuvre (jusqu'à 20 s).
      const burning = this.world.filter((e) => e.alive && e.burning > 0 && e.kind !== 'projectile')
      const waitFire = burning.some((e) => e.kind === 'target') || (this.player.shotsLeft === 0 && burning.length > 0 && this.#stateT < FIRE_WAIT_MS)
      this.#restT = this.world.isAtRest() && !this.catapult.busy && !this.#pendingLaunch && !waitFire ? this.#restT + dt : 0
      const allDown = this.targetsLeft === 0
      // Relecture (v6.0) : le tour finit au pas enregistré. Ce pas fixe aussi la
      // marche des pillards (ils n'avancent que pendant le vol des tirs).
      const recorded = this.#replay ? this.#recorded?.e : null
      if (recorded?.length) {
        if (this.steps >= recorded[0]) {
          recorded.shift()
          this.#endTurn()
        }
      } else if (!this.#pendingLaunch && (this.#restT >= REST_CONFIRM_MS || (this.#stateT > MAX_TURN_MS && !waitFire) || this.#stateT > FIRE_WAIT_MS || (allDown && this.#stateT > 3500))) {
        if (!this.#replay) this.#log.push({ k: 'e', d: this.steps })
        this.#endTurn()
      }
    }
  }

  /** Victoire sans tir : l'étape est prise (la suivante arrive), ou la partie est gagnée. */
  #idleWin() {
    this.#idleWinT = 0
    if (this.#hasNextStage()) this.#beginStage()
    else this.#finish(this.#mode.evaluate(this))
  }

  /** Relecture (v6.2) : une victoire sans tir reste à rejouer (la relecture continue jusqu'à elle). */
  get idleWinPending() {
    return Boolean(this.#replay && this.#recorded?.i?.length)
  }

  /** Données de rendu pour le Renderer. */
  scene() {
    const loadType = this.#state === STATE.AIMING || this.#state === STATE.SETTLING || this.armed ? this.#loadedAmmo ?? this.player.selectedAmmo : null
    // Même emplacement pour tous (histoire, duel) : on ne dessine que la catapulte active.
    const shared = !this.#mode.twoCamps
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
          // Roues (v6.2) : elles tournent avec le chemin parcouru ; l'engin se cabre ou pique du nez.
          roll: p.catapult.roll ?? 0,
          tilt: mine && this.drivable ? this.#drive.tilt : 0,
          // Avaries (v5.8) : feu, givre, fissures, rouille, points de vie.
          condition: shared ? this.#conditionScene() : null,
        }
      })
    return {
      camera: this.camera,
      entities: this.world.entities(),
      // Assemblage du château (v6.2) : jonctions encore debout.
      joints: this.world.joints.list,
      // Déplacement de l'engin (v6.2) : flèches plantées à la portée des archers.
      drive: this.#driveScene(),
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
      // Mécanismes (v6.0) : cordes, chaînes, charnières.
      tethers: this.world.tethers.view(),
      // Nuages (v6.1) : poison, miasmes, farine.
      clouds: this.world.clouds,
      versus: this.#mode.twoCamps,
      // v6.1 : barres de vie au-dessus des défenseurs blessés (et des généraux).
      healthBars: this.options.healthBars,
      // Repères (v6.2) : le dernier défenseur debout, que le rendu désigne (voir rendering/TargetBeacons.js).
      // Pastilles du bord de l'écran : pendant la visée seulement (en vol, la caméra suit le tir).
      beacons: { lastId: this.#lastDefenderId(), edges: this.#state === STATE.AIMING && !this.#mode.twoCamps },
      wind: {
        field: this.world.windField,
        time: this.world.time,
        animate: !this.options.reducedMotion,
        catapults: catapults.map((c) => ({ x: c.x, y: c.y, dir: c.dir, offset: c.kind === 'trebuchet' ? 250 : 150 })),
        top: this.#mode.twoCamps ? null : this.#castleTop(),
      },
    }
  }

  /** Résistance des défenseurs : difficulté, coup de pouce, Campagne héroïque. */
  #defenderHpFactor() {
    return DIFFICULTY[this.#difficulty].targetHp * (1 - this.#luck) * (this.#mode.fortify?.targets ?? 1)
  }

  /** Le dernier défenseur debout (v6.2), s'il n'en reste qu'un (pas au face-à-face : deux camps). */
  #lastDefenderId() {
    if (this.#mode.twoCamps) return null
    const alive = this.world.filter((e) => e.kind === 'target' && e.alive)
    return alive.length === 1 ? alive[0].id : null
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
      // Le général annonce l'ordre qu'il donnera après ce tir (v6.0).
      this.#council?.plan()
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
    // Ordre d'un général (tempête, ouragan) : le vent du prochain tour est imposé.
    if (this.#windOverride !== null) {
      this.#baseWind = this.#windOverride
      this.#windOverride = null
      this.world.wind = Math.round(this.#baseWind * 100) / 100
      return
    }
    const max = this.#level.wind * DIFFICULTY[this.#difficulty].windFactor * (this.#mode.windFactor ?? 1) * (1 - this.#luck)
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
    if (this.#downThisShot === 0 && this.targetsLeft > 0) this.#effects.bark('missed')
    this.#turn++
    this.#restT = 0
    // Orage (v5.8) : la pluie rouille l'engin, une couche tous les trois tours.
    if (this.condition.raining && this.#turn % 3 === 0) this.condition.addRust()
    const verdict = this.#mode.evaluate(this)
    // Grand siège (v6.0) : l'étape est prise, on passe à la suivante.
    if (verdict?.won && this.#hasNextStage()) return this.#beginStage()
    if (verdict && !verdict.won && this.continueOffer && !this.#continued && this.#mode.lastShotOffer) {
      this.#pendingVerdict = verdict
      this.#setState(STATE.OFFER)
      this.emit('offer', { kind: 'extra-shot' })
      this.emit('hud', this.hud)
      return
    }
    if (verdict) return this.#finish(verdict)
    // Le général (v6.0) donne son ordre avant que le joueur ne vise à nouveau.
    if (this.#council?.alive) return this.#beginEnemyTurn()
    this.#nextTurn()
  }

  /** Tour suivant : joueur suivant, nouveau vent, engin rechargé, visée. */
  #nextTurn() {
    // Le général peut de nouveau perdre une vie (une au plus par tir).
    if (this.#council) this.#council.general.shielded = false
    const next = this.#mode.nextPlayer(this.#active, this)
    const changed = next !== this.#active
    this.#active = next
    this.#powerUsedThisTurn = false
    this.#pendingPower = null
    this.#rollWind()
    this.#applyStartPower()
    this.#loadEngine()
    this.#curfew = this.#curfewNext
    this.#curfewNext = false
    this.#setState(STATE.AIMING)
    if (changed) this.emit('turn', { player: next, name: this.player.name })
    this.emit('announce', { key: 'a11y.turn', params: { targets: this.targetsLeft, shots: this.player.shotsLeft ?? '∞', wind: Math.round(this.world.wind * 10) } })
  }

  /* ---------- Grand siège et généraux (v6.0) ---------- */

  /** Fait apparaître un château (celui du niveau ou d'une étape) et son éventuel général. */
  #spawnCastle(part) {
    const fortify = this.#mode.fortify
    const blocks = part.blocks.map((b) => this.world.add(new Block(b)))
    // Campagne héroïque (v6.2) : des murs plus solides (la roche du décor est déjà indestructible).
    if (fortify) {
      for (const b of blocks) {
        if (b.terrain || !Number.isFinite(b.maxHp)) continue
        b.maxHp *= fortify.blocks
        b.hp = b.maxHp
      }
    }
    const targetHp = this.#defenderHpFactor()
    // Jauge de destruction (v6.0) : la moitié de la valeur des blocs du château (hors roche).
    const worth = blocks.filter((e) => !e.terrain).reduce((sum, e) => sum + e.scoreValue, 0)
    const gauged = this.#mode.destructionGauge && this.player.shotsLeft !== null && gaugeTaught(this.#level)
    this.#gauge = { value: 0, goal: gauged ? Math.round(worth * GAUGE.SHARE) : 0, earned: false }
    // Mécanismes (v6.0) : potences (cordes) et ponts-levis (chaînes, charnières).
    for (const t of part.tethers ?? []) this.world.tethers.tie({ kind: t.kind, a: blocks[t.a], pointA: { x: t.ax, y: t.ay }, b: blocks[t.b], pointB: { x: t.bx, y: t.by } })
    for (const h of part.hinges ?? []) this.world.tethers.hinge(blocks[h.b], { x: h.x, y: h.y })
    for (const t of part.targets) {
      if (t.type === 'general') {
        const general = this.world.add(new General(t, targetHp, livesFor(t.general, this.#difficulty)))
        this.#council = new WarCouncil(this.#councilPort(), general)
      } else this.world.add(new Target(t, targetHp))
    }
    for (const b of part.barrels) this.world.add(new Barrel(b))
    for (const f of part.flyers ?? []) this.world.add(new Flyer(f))
    this.#stageTargets = part.targets.length
    this.#seedWorldWind(part)
    // Zone de jeu (v6.2) : un boulet qui roule au-delà n'a plus rien à y faire.
    const span = this.#castleSpan()
    this.world.playZone = { left: span.left - 220, right: span.right + 120 }
    // Portée des archers (v6.2) : l'engin n'approche pas plus près du château.
    this.#drive.limitTo(span.left)
  }

  /**
   * Souffle du monde (v6.1) : les poches de miasmes des Marais (au ras du sol,
   * entre les défenseurs) et les colonnes d'air chaud de la Montagne (le long
   * de la roche, ou devant le château). Placées d'après le château : identiques
   * à chaque partie.
   */
  #seedWorldWind(part) {
    const el = this.#element
    const xs = part.targets.map((t) => t.x).sort((a, b) => a - b)
    if (el.pockets && xs.length) {
      const lo = xs[0]
      const hi = xs.at(-1)
      for (let i = 0; i < el.pockets; i++) {
        const x = lo + ((hi - lo) * (i + 1)) / (el.pockets + 1)
        this.world.clouds.spawn('miasma', x, WORLD.GROUND_Y - 70 - (i % 2) * 90, this.world.time)
      }
    }
    if (el.columns) {
      const rock = part.blocks.filter((b) => b.material === 'rock' && b.shape === 'triangle').map((b) => b.x)
      const left = Math.min(...part.blocks.map((b) => b.x - b.w / 2))
      const at = rock.length ? rock.slice(0, el.columns) : [left - 220]
      this.world.thermals = at.map((x) => ({ x }))
    }
  }

  /** Souffle du monde du niveau (pour l'interface) : identifiant et élément. */
  get worldWind() {
    return { id: this.windId, element: this.#element?.element ?? null }
  }

  /** Ce que le conseil de guerre d'un général peut faire au monde (et rien d'autre). */
  #councilPort() {
    const self = this
    return {
      get world() {
        return self.world
      },
      get condition() {
        return self.condition
      },
      get particles() {
        return self.particles
      },
      // Renforts : aussi résistants que les défenseurs du château (v6.2 : coup de pouce et Campagne héroïque compris).
      get hpFactor() {
        return self.#defenderHpFactor()
      },
      // Rempart d'un général : aussi solide que les murs (Campagne héroïque, v6.2).
      get blockHpFactor() {
        return self.#mode.fortify?.blocks ?? 1
      },
      engineSpot: () => this.#engineSpot(),
      castleLeft: () => this.#castleLeft(),
      after: (steps, run) => this.#schedule(this.steps + steps, run),
      windNext: (v) => {
        this.#windOverride = clamp(v * DIFFICULTY[this.#difficulty].windFactor, -1, 1)
      },
      curfew: () => {
        this.#curfewNext = true
      },
      feedback: (fx) => this.#feedback(fx),
      emit: (kind, data) => this.#onGeneral(kind, data),
    }
  }

  /** Réaction aux événements d'un général : points d'une vie perdue, sous-titres, interface. */
  #onGeneral(kind, data) {
    if (kind === 'hurt') {
      const shooter = this.players[this.#shooter] ?? this.player
      this.#effects.generalHurt(data, shooter.score.registerGeneralHurt())
    }
    this.emit('general', { kind, ...data })
    this.emit('hud', this.hud)
  }

  #hasNextStage() {
    return this.#stageIndex < this.stageCount - 1
  }

  /** Programme un effet au pas `at` (exécuté avant la simulation de ce pas). */
  #schedule(at, run) {
    this.#scheduled.push({ at, run, seq: this.#seq++ })
    this.#scheduled.sort((a, b) => a.at - b.at || a.seq - b.seq)
  }

  /**
   * Programme un effet décidé par la partie (étape suivante, ordre d'un
   * général) : son pas est noté dans le journal ; en relecture, c'est le pas
   * enregistré qui fait foi.
   */
  #scheduleLogged(kind, delay, run) {
    let at = this.steps + delay
    if (this.#replay) {
      const rec = this.#recorded?.[kind]?.shift()
      if (rec !== undefined) at = Math.max(rec, this.steps)
    } else this.#log.push({ k: kind, d: at })
    this.#schedule(at, run)
  }

  /** Avant chaque pas de simulation : les effets dus (et la garde du général). */
  #runScheduled() {
    const now = this.steps
    while (this.#scheduled.length && this.#scheduled[0].at <= now) this.#scheduled.shift().run()
    this.#council?.step()
  }

  /** L'étape est prise : prime, annonce, et la suivante arrive (au pas enregistré). */
  #beginStage() {
    this.#setState(STATE.STAGE)
    const shooter = this.players[this.#shooter] ?? this.player
    const gained = shooter.score.registerStage()
    const mid = (this.#castleLeft() + this.focus.right) / 2
    if (gained) this.particles.text(mid, WORLD.GROUND_Y - 320, `+${gained}`)
    const next = this.#level.stages[this.#stageIndex]
    this.emit('stage', { phase: 'cleared', stage: this.#stageIndex + 1, total: this.stageCount, general: next.targets.find((t) => t.general)?.general ?? null })
    this.#feedback({ sound: 'horn', x: mid, intensity: 1, caption: 'stage.cleared' })
    this.emit('announce', { key: 'a11y.stageCleared', params: { stage: this.#stageIndex + 1, total: this.stageCount } })
    this.#scheduleLogged('g', STAGE_SWAP_STEPS, () => this.#swapStage())
  }

  /** Remplace le château pris par celui de l'étape suivante (même terrain, mêmes tirs). */
  #swapStage() {
    const stage = this.#level.stages[this.#stageIndex]
    // Tout ce qui appartient au château pris disparaît ; le terrain (roche, douves) reste.
    for (const e of [...this.world.entities()]) {
      if (e.kind === 'block' && e.terrain) continue
      this.world.remove(e)
    }
    this.world.resetStage()
    this.#council = null
    this.#stageIndex++
    this.#spawnCastle(stage)
    const left = this.#engine === 'trebuchet' ? TREBUCHET_X - 230 : stage.focus.left
    this.focus = Object.freeze({ left, right: stage.focus.right, top: stage.focus.top })
    this.particles.clear()
    this.#feel.newStage()
    this.emit('stage', { phase: 'begin', stage: this.#stageIndex + 1, total: this.stageCount, general: this.#council?.id ?? null })
    // Préparation du tour comme après un tir (même joueur en solo).
    const next = this.#mode.nextPlayer(this.#active, this)
    this.#active = next
    this.#powerUsedThisTurn = false
    this.#pendingPower = null
    this.#rollWind()
    this.#applyStartPower()
    this.#loadEngine()
    this.#setState(STATE.SETTLING)
  }

  /**
   * Suspense (v6.0) : un tir file vers la dernière cible (celle dont la chute
   * donne la victoire). Le temps ralentit (sauf en mouvement réduit), la
   * caméra se rapproche et le tambour roule ; un tir par tour, au plus.
   */
  #watchSuspense(dt) {
    const s = this.#suspense
    if (s?.on) {
      s.t += dt
      const p = this.#activeProjectiles().find((e) => !e.hasImpacted)
      const last = this.world.filter((e) => e.kind === 'target' && e.alive)[0]
      const closing = p && last && p.body.velocity.x * (last.x - p.x) + p.body.velocity.y * (last.y - p.y) > 0
      if (!closing || this.#state !== STATE.FLYING || s.t > SUSPENSE.MAX_MS) s.on = false
      else {
        s.x = (p.x + last.x) / 2
        s.y = (p.y + last.y) / 2
      }
      return
    }
    if (this.#state !== STATE.FLYING || s?.turn === this.#turn || this.targetsLeft !== 1 || this.#hasNextStage() || this.#mode.twoCamps) return
    const last = this.world.filter((e) => e.kind === 'target' && e.alive)[0]
    // Un général qui a encore plusieurs vies n'est pas un coup de grâce.
    if (!last || (last.type === 'general' && last.lives > 1)) return
    for (const p of this.#activeProjectiles()) {
      if (p.hasImpacted) continue
      const dx = last.x - p.x
      const dy = last.y - p.y
      if (Math.hypot(dx, dy) > SUSPENSE.RANGE || p.body.velocity.x * dx + p.body.velocity.y * dy <= 0) continue
      this.#suspense = { turn: this.#turn, t: 0, on: true, slow: !this.options.reducedMotion, x: (p.x + last.x) / 2, y: (p.y + last.y) / 2 }
      this.#feedback({ sound: 'drumroll', x: last.x, caption: 'suspense' })
      return
    }
  }

  /** Jauge de destruction : à la moitié du château abattue, une pierre de plus (une par étape). */
  #fillGauge(worth) {
    const g = this.#gauge
    // La partie finie, le château peut encore s'effondrer : plus de pierre à gagner.
    if (!g.goal || g.earned || this.#state === STATE.ENDED) return
    g.value += worth
    if (g.value < g.goal) return
    g.earned = true
    const p = this.players[this.#shooter] ?? this.player
    if (p.shotsLeft === null) return
    p.shotsLeft += 1
    p.shotsTotal += 1
    p.bonusShots = (p.bonusShots ?? 0) + 1
    this.emit('callout', { key: 'bonusStone', tier: 2, x: (this.#castleLeft() + this.focus.right) / 2, y: WORLD.GROUND_Y - 360 })
    this.#feedback({ sound: 'power', x: this.catapult.x, intensity: 0.8, caption: 'bonusStone' })
    this.emit('announce', { key: 'a11y.bonusStone' })
    this.emit('hud', this.hud)
  }

  /** Après la victoire : chaque tir restant éclate en points au-dessus de l'engin. */
  #tickBonus(dt) {
    const b = this.#bonus
    b.t += dt
    while (b.left > 0 && b.t >= b.next) {
      b.left--
      b.paid++
      this.#bonusPaid++
      b.next += BONUS_POP_MS
      const x = this.catapult.x + (this.catapult.dir || 1) * 20
      const y = this.catapult.y - 110 - (b.paid % 2) * 26
      this.particles.text(x, y, `+${Math.round(b.per)}`, '#ffe08a')
      if (!this.options.reducedMotion) this.particles.burst(x, y + 30, 10)
      this.#feedback({ sound: 'bonus', x, intensity: 0.5 + b.paid * 0.1 })
      this.#shownScore = Math.min(b.final, this.#shownScore + b.per)
      this.emit('hud', this.hud)
    }
    if (b.left === 0 && b.t >= b.next) {
      this.#shownScore = b.final
      this.#bonus = null
      this.emit('hud', this.hud)
    }
  }

  /** Tour du général : il annonce son ordre, puis le donne au pas enregistré. */
  #beginEnemyTurn() {
    const council = this.#council
    // Durées comptées en pas de simulation (v6.1) : la relecture, qui avance pas à
    // pas, rend la main au joueur exactement au même pas que la partie jouée.
    this.#enemy = { acted: false, from: this.steps }
    this.#setState(STATE.ENEMY)
    this.emit('general', { kind: 'turn', id: council.id, skill: council.intent })
    // Un bref appel de cor : le général donne son ordre.
    this.#feedback({ sound: 'horn', x: council.general.x, intensity: 0.6, caption: 'general.order' })
    this.emit('announce', { key: 'a11y.generalOrder', params: { general: council.id, skill: council.intent } })
    this.#scheduleLogged('b', ENEMY_ACT_STEPS, () => {
      if (council.alive && this.#state === STATE.ENEMY) council.act()
      this.#enemy.acted = true
      this.emit('hud', this.hud)
    })
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
    this.#stopDrive()
    const p = this.player
    // Seul le mode histoire produit un résultat authentifié (enregistrable).
    // Score commun (campagne à deux) : les tirs des deux joueurs comptent ensemble.
    const team = this.#mode.sharedScore ? this.players : [p]
    const shotsLeft = team.reduce((sum, pl) => sum + (pl.shotsLeft ?? 0), 0)
    // Les pierres gagnées à la jauge ne comptent pas pour les étoiles (v6.0).
    const regular = team.reduce((sum, pl) => sum + pl.shotsTotal - (pl.bonusShots ?? 0), 0)
    const shotsUsed = Math.min(regular, team.reduce((sum, pl) => sum + (pl.shotsTotal - pl.shotsLeft), 0))
    const result = this.#mode.recordsResult ? this.score.finalize({ won, shotsLeft, shotsUsed }) : null
    const scores = this.#mode.sharedScore
      ? this.players.map(() => (result ? result.score : p.score.finalScore({ won, shotsLeft })))
      : this.players.map((pl) => pl.score.finalScore({ won, shotsLeft: pl.shotsLeft ?? 0 }))
    const happy = this.players.length > 1 || won
    this.#setState(STATE.ENDED)
    this.#suspense = null
    // Château pris : confettis au-dessus des ruines.
    const left = this.#castleLeft()
    if (won && !this.#mode.twoCamps && !this.options.reducedMotion) {
      this.particles.confetti((left + this.focus.right) / 2, WORLD.GROUND_Y - 380, Math.max(300, this.focus.right - left))
    }
    this.#feedback({ sound: happy ? 'victory' : 'defeat', x: 1000, caption: happy ? 'victory' : 'defeat', haptic: happy ? 'victory' : 'defeat' })
    // Les tirs restants éclatent en points, un par un (une seule équipe de tirs : solo).
    const pops = won && !this.#mode.twoCamps && this.players.length === 1 ? Math.min(BONUS_POP_MAX, shotsLeft) : 0
    const final = result ? result.score : scores[0]
    if (pops > 0 && final > this.score.current) {
      this.#shownScore = this.score.current
      this.#bonus = { left: pops, paid: 0, t: 0, next: 650, per: (final - this.score.current) / pops, final }
      // La caméra recule une fois pour toutes : l'engin et le château, jusqu'au bilan.
      this.#wideEnd = true
    }
    // Titre de victoire (« Coup de grâce ! » quand un général est tombé) : au-dessus des
    // ruines, ou au milieu du champ quand la caméra recule pour le décompte.
    if (won && !this.#mode.twoCamps) {
      const castleMid = (left + this.focus.right) / 2
      const x = this.#wideEnd ? (this.catapult.x + castleMid) / 2 : castleMid
      this.emit('callout', { key: this.#council ? 'coupDeGrace' : 'victory', tier: 3, x, y: WORLD.GROUND_Y - 330 })
    }
    const celebrateMs = this.#bonus ? 650 + pops * BONUS_POP_MS : 0
    this.emit('end', { won, result, winner, scores, reason, renown: [...this.#renown], mode: this.#mode.id, celebrateMs })
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
    const flying = this.#activeProjectiles().filter((p) => this.#worthFollowing(p))
    const treb = this.#engine === 'trebuchet'
    const cam = this.camera
    // Gros plan sur le premier impact (hors face-à-face, où il y a deux
    // châteaux) : modéré (×1,4 au plus) pour ne pas donner le mal des transports.
    const solo = !this.#mode.twoCamps
    const close = Math.min(1.05, cam.fitScale * 1.4)
    const castle = () => cam.frame(this.#castleLeft() - 160, this.focus.right + 70, 0.95, this.#castleRoof())
    if (this.#feel.punch && this.#feel.punch.ms > 0 && solo) this.#feel.punch.ms -= dt
    if (treb && this.armed) {
      // Balancier : tout le terrain reste visible (le bras ET le château), pour choisir l'instant du lâcher.
      cam.overview()
    } else if (this.#suspense?.on && this.#suspense.slow && cam.follow) {
      // Suspense : entre le tir et la dernière cible.
      cam.focusOn(this.#suspense.x, this.#suspense.y, close)
    } else if (this.#wideEnd && this.#state === STATE.ENDED) {
      // Tirs restants qui éclatent en points : l'engin et le château, ensemble, jusqu'au bilan.
      cam.overview()
    } else if (this.#feel.punch && this.#feel.punch.ms > 0 && solo && cam.follow) {
      cam.focusOn(this.#feel.punch.x, this.#feel.punch.y, close)
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
    // Couvre-feu (v6.0) : le repère du tir précédent est caché aussi.
    return this.#curfew ? null : (this.player.lastShot ?? null)
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

  /** Étendue du château (blocs, défenseurs, barils), du côté de l'engin au bout. */
  #castleSpan() {
    let left = Infinity
    let right = -Infinity
    for (const e of this.world.entities()) {
      if (!e.alive || e.terrain || e.construct || e.x <= 600 || (e.kind !== 'block' && e.kind !== 'target' && e.kind !== 'barrel')) continue
      left = Math.min(left, e.x - e.width / 2)
      right = Math.max(right, e.x + e.width / 2)
    }
    return Number.isFinite(left) ? { left, right } : { left: this.focus.right - 800, right: this.focus.right }
  }

  /**
   * La caméra suit-elle ce tir ? (v6.2) En vol, toujours ; après l'impact, tant
   * qu'il laboure encore le château. Un boulet qui roule au loin ne vaut pas
   * qu'on quitte l'effondrement des yeux.
   */
  #worthFollowing(p) {
    if (!p.hasImpacted) return true
    const zone = this.world.playZone
    return p.speed > 3 && (!zone || (p.x >= zone.left + 220 && p.x <= zone.right - 120))
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
    const strike = RAID_STRIKE[raider.raid] ?? RAID_STRIKE.blow
    if (strike.burn) c.ignite(strike.burn)
    if (strike.freeze) c.freeze()
    c.hit(strike.hp)
    this.#effects.engineStruck(raider.raid, spot, x)
    this.emit('hud', this.hud)
  }

  /**
   * Un objet du monde est détruit : la partie compte (points, renommée, jauge de
   * destruction), puis les effets montrent (v6.2 : voir SessionEffects).
   */
  #onDestroyed(entity, cause) {
    // Pont des pillards rompu (v5.8) : ni points ni statistiques de château.
    if (entity.construct) {
      this.#effects.bridgeDown(entity)
      return
    }
    // Les points vont à l'auteur du tir, même si la chute finit pendant le tour suivant.
    const shooter = this.players[this.#shooter] ?? this.player
    const fell = entity.kind === 'target' && this.world.time - (entity.fallenAt ?? -Infinity) <= FREEFALL.WINDOW_MS
    const gained = shooter.score.registerDestroyed(entity, cause, { fell })
    if (entity.kind === 'target') {
      const own = this.#mode.teamOf(entity)
      // Au face-à-face, abattre un défenseur de son propre camp ne rapporte rien.
      if (!own || own !== this.#shooter + 1) this.#renown[this.#shooter] += renownOf(entity)
      if (this.#mode.coupDeGrace && this.targetsLeft === 0) this.#renown[this.#shooter] += COUP_DE_GRACE
      this.#downThisShot++
      this.#effects.targetDown(entity, cause, gained)
    } else if (entity.kind === 'flyer') {
      this.#effects.flyerDown(entity, gained)
    } else if (entity.kind === 'block') {
      if (!entity.terrain) this.#fillGauge(entity.scoreValue)
      this.#effects.blockDown(entity, cause, gained)
    }
    this.emit('hud', this.hud)
  }

  /** Les réactions du monde : la partie garde la logique, les effets font le reste. */
  #bindWorldEvents() {
    const ev = this.#events
    // Corde tranchée, chaîne rompue (v6.0) : la charge tombe, le tablier s'abat.
    ev.on('tether:cut', (e) => this.#effects.tetherCut(e))
    ev.on('entity:destroyed', ({ entity, cause }) => this.#onDestroyed(entity, cause))
    ev.on('impact', (e) => this.#effects.impact(e))
    // v6.1 : un défenseur encaisse un coup (il survit, ou pas) : son, secousse, arrêt sur image.
    ev.on('hurt', (e) => this.#effects.hurt(e))
    // v6.1 : orbe d'orage — arcs d'un défenseur à l'autre.
    ev.on('thunder', (e) => this.#effects.thunder(e))
    // v6.2 : combos d'éléments, annoncés par leur nom (une annonce par combo et par seconde et demie).
    ev.on('combo', (e) => this.#effects.combo(e))
    // v6.2 : assemblage du château. Une jonction qui se lézarde craque ; qui cède,
    // lâche poussière et éclats ; une clé de voûte qui cède fait trembler la scène.
    ev.on('joint:crack', (e) => this.#effects.jointCrack(e))
    ev.on('joint:break', (e) => this.#effects.jointBreak(e))
    ev.on('keystone', (e) => this.#effects.keystone(e))
    // v6.1 : le souffle du monde marque un tir (givre, braises, sable, orage) ; un tir givré éclate.
    ev.on('element', (e) => this.#effects.element(e))
    // v6.1 : moulins — les ailes s'emballent (préavis), puis la rafale.
    ev.on('mill', (e) => this.#effects.mill(e))
    // v6.1 : ouvrages brisés — inondation, braises.
    ev.on('prop', (e) => this.#effects.prop(e))
    // v6.1 : nuages — le pot éclate, le gaz s'embrase, le givre le fige.
    ev.on('cloud', (e) => this.#effects.cloud(e))
    // v6.1 : un tir puissant projette le bloc frappé — onde de choc et coup de boutoir.
    ev.on('power', (e) => this.#effects.power(e))
    ev.on('explosion', (e) => this.#effects.explosion(e))
    ev.on('structure:collapse', (e) => this.#effects.collapse(e))
    // v5.0 : percée, givre, vapeur, terrains et créatures volantes.
    ev.on('breach', (e) => this.#effects.breach(e))
    ev.on('frost', (e) => this.#effects.frost(e))
    ev.on('steam', (e) => this.#effects.steam(e))
    ev.on('terrain', (e) => this.#effects.terrain(e))
    ev.on('flyer:hit', (e) => this.#effects.flyerHit(e))
    ev.on('ogre', (e) => this.#effects.ogre(e))
    // v5.8 : capacités des défenseurs (voir ../ai/).
    ev.on('unit', (data) => (data.kind === 'strike' ? this.#engineStruck(data.entity, data.x) : this.#effects.unit(data)))
    ev.on('flyer:drop', (e) => this.#effects.flyerDrop(e))
    ev.on('lightning', (e) => this.#effects.lightning(e))
    ev.on('fire:start', (e) => this.#effects.fireStart(e))
    ev.on('projectile:spent', (e) => this.#effects.projectileSpent(e))
  }
}

export { AIM, WORLD }
