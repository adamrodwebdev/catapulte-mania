import Matter from 'matter-js'
import { UnitDirector } from '../ai/UnitDirector.js'
import { WindField, WIND_PROFILES, windageOf } from './WindField.js'
import { WORLD, CATEGORY } from './constants.js'
import { Projectile } from '../entities/Projectile.js'
import { SeededRandom } from '../../core/utils/SeededRandom.js'
import { StructuralIntegrity } from './StructuralIntegrity.js'
import { TerrainZones, TERRAIN } from './Terrain.js'
import { Block } from '../entities/Block.js'
import { FROST, THUNDER } from '../entities/catalog.js'
import { Clouds } from './Clouds.js'
import { Props } from './Props.js'
import { CastleJoints } from './CastleJoints.js'
import { KEYSTONE } from './castleRules.js'
import { ElementCombos } from './ElementCombos.js'
import { MILL } from '../entities/props.js'
import { WORLD_WINDS, EXPOSURE_ELEMENTS, THERMAL, exposureStep, applyElement } from './WorldWinds.js'
import { Tethers } from './Tethers.js'
import { HOT_BALL_MS, BREACH_DAMPING, BREACH_LIGHT_HP, BREACH_HEAVY_MASS, POWER } from './physicsRules.js'
import { DefenderContacts } from './DefenderContacts.js'
import { ElementReactions } from './ElementReactions.js'

const { Engine, Composite, Bodies, Body, Events, Sleeping, Vertices } = Matter

/** Règles physiques (v6.2 : voir physicsRules.js), réexportées sous leurs noms d'origine. */
export { HOT_BALL_MS, BREACH_DAMPING, BREACH_LIGHT_HP, BREACH_HEAVY_MASS, OGRE_SWAT_MS, PUSHED_SAFE_MS, KNOCKDOWN_SHARE, POWER } from './physicsRules.js'

/**
 * Monde physique : encapsule Matter.js et applique les règles du jeu.
 *
 * - Pas de temps FIXE (120 Hz) : la simulation est identique sur un téléphone
 *   à 30 images/s et sur un écran à 144 Hz.
 * - Calcul des dégâts à partir de l'énergie de choc (masse réduite × vitesse²).
 * - Explosions, feu et réactions en chaîne.
 * - Vent appliqué aux projectiles.
 *
 * Événements émis sur `events` :
 *   entity:destroyed { entity, cause }   impact { entity, energy, x, y, material }
 *   explosion { x, y, radius }            fire:start { entity }
 *   hurt { entity, amount, cause, lethal }  thunder { x, y, path }   (v6.1)
 *   cloud { kind, x, y, r, event: 'spawn'|'blast'|'freeze' }        (v6.1)
 *   projectile:spent { entity }           projectile:split { entity }
 *   structure:collapse { entity, loads }  (mur porteur qui cède)
 *
 * Règles de jeu physiques :
 *  - v6.1 : les défenseurs ont des points de vie. Ce qui leur arrive dessus
 *    lentement, ils le repoussent ; le reste les blesse selon l'énergie du coup,
 *    les repousse et les sonne ; une chute coûte selon sa vitesse ; renversés,
 *    ils perdent des points de vie et se relèvent (voir FallingObjects.js) ;
 *  - une cible coincée sous une charge qu'elle ne peut soulever, ou prise entre
 *    deux blocs, meurt écrasée : un niveau ne peut jamais rester bloqué avec une
 *    cible emmurée ;
 *  - un mur porteur frappé assez fort cède et fait s'effondrer ce qu'il soutient ;
 *  - rien ne reste suspendu dans le vide quand son appui disparaît.
 *
 * Organisation (v6.2) : le monde garde l'ordre du pas de simulation, l'aiguillage
 * des contacts, le registre des entités et le nettoyage. Les règles vivent dans
 * des collaborateurs, chacun avec un port étroit vers le monde :
 * physicsRules.js (seuils et délais), DefenderContacts.js (défenseurs au contact),
 * ElementReactions.js (feu, givre, vapeur, foudre, nuages) et ElementCombos.js
 * (combos d'éléments).
 */
export class PhysicsWorld {
  /** @type {Map<number, import('../entities/Entity.js').Entity>} */
  #entities = new Map()
  #accumulator = 0
  #time = 0
  #pendingExplosions = []
  #events
  #fireTick = 0
  #rng
  /** Vrai dès le premier tir : avant, la structure se met en place sans conséquence. */
  #armed = false
  /** Clés de voûte du château en place (v6.2), surveillées à chaque pas. */
  #keystones = []
  /** Assemblage (v6.2) : demandé par la partie, et à faire au pas où le château est posé. */
  #jointsEnabled = false
  #jointsPending = false
  /** Solidité des jonctions (v6.2 : châteaux renforcés de la Campagne héroïque). */
  #jointToughness = 1
  /** Le monde a-t-il reçu des défenseurs ? (voir #retireStrays) */
  #hadTargets = false
  /** Début de la stabilisation en cours (0 au départ ; une nouvelle étape la relance, v6.0). */
  #settleFrom = 0
  /** Appelé avant chaque pas de simulation (effets programmés de la partie, v6.0). */
  beforeStep = null
  /** Appelé à la fin de chaque pas (v6.2 : état de l'engin, au pas, en partie comme en relecture). */
  afterStep = null
  #pinTick = 0
  #supportTick = 0
  #ground
  structure = new StructuralIntegrity()
  /** Bord gauche du monde (plus loin quand le trébuchet tire depuis l'arrière). */
  leftLimit = 0
  /** Terrains du sol : lacs, lave, neige (v5.0). */
  terrain
  /** Objets créés pendant un pas (pot lâché par une vouivre, croûte de lave) : ajoutés après le pas. */
  #spawns = []
  /** Règles des défenseurs au contact (v6.2, voir DefenderContacts.js). */
  #defenders
  /** Réactions des éléments (v6.2) : feu, givre, vapeur, foudre, nuages (voir ElementReactions.js). */
  #reactions

  /**
   * @param {import('../../core/utils/EventBus.js').EventBus} events
   * @param {{ wind?: number, seed?: number, windProfile?: object }} [opts] wind ∈ [-1, 1] ;
   *   graine du hasard (feu, éclats, rafales) ; profil de vent de la difficulté
   */
  constructor(events, { wind = 0, seed = 1, windProfile = WIND_PROFILES.normal, zones = [], joints = false, jointToughness = 1 } = {}) {
    this.#events = events
    this.terrain = new TerrainZones(zones)
    this.#rng = new SeededRandom(seed)
    /** Champ de vent (base du tour, altitude, rafales). */
    this.windField = new WindField(windProfile, seed)
    /** Navigation et comportements des défenseurs (v5.8). */
    this.units = new UnitDirector({
      entities: () => this.#entities.values(),
      time: () => this.#time,
      hazards: () => this.terrain.list.filter((z) => z.kind === 'lake' || z.kind === 'lava' || z.kind === 'ice'),
      hazardsVersion: () => this.terrain.version,
      groundY: WORLD.GROUND_Y,
      width: WORLD.WIDTH,
      blockedAt: (x, y, self, withTargets = true) => this.#blocked(x, y, self, withTargets),
      heat: (e, ms) => this.#reactions.heat(e, ms),
      emit: (name, data) => this.#events.emit(name, data),
      armed: () => this.#armed,
      left: () => Math.min(-300, this.leftLimit - 100),
      // Pont jeté par les pillards (v5.8) : une planche fixe, au ras du sol,
      // sur laquelle on marche sans toucher l'eau ni la lave. Elle casse sous les tirs.
      spawnBridge: (x0, x1) =>
        this.#spawns.push(() => {
          const w = Math.min(600, Math.max(40, x1 - x0))
          const bridge = new Block({ material: 'wood', x: (x0 + x1) / 2, y: WORLD.GROUND_Y + 2, w, h: 10 })
          Body.setStatic(bridge.body, true)
          // Cordes et planches : un bon tir le rompt (les pillards dessus tombent à l'eau).
          bridge.maxHp = bridge.hp = 80
          bridge.construct = true
          bridge.assetKey = 'construct.bridge'
          this.add(bridge)
        }),
    })
    this.engine = Engine.create({ enableSleeping: true, positionIterations: 8, velocityIterations: 6 })
    this.engine.gravity.y = WORLD.GRAVITY
    this.engine.gravity.scale = WORLD.GRAVITY_SCALE
    this.wind = wind

    const ground = Bodies.rectangle(WORLD.WIDTH / 2, WORLD.GROUND_Y + 100, WORLD.WIDTH * 3, 200, {
      isStatic: true,
      // Sol très adhérent : un mur posé au sol ne glisse pas sous un simple boulet.
      friction: 1,
      frictionStatic: 8,
      label: 'ground',
      collisionFilter: { category: CATEGORY.STATIC },
    })
    Composite.add(this.engine.world, ground)
    this.#ground = ground
    /** Mécanismes des châteaux (v6.0) : cordes, chaînes, charnières. */
    this.tethers = new Tethers(this.engine.world, events)
    /** Assemblage du château (v6.2) : jonctions, clés de voûte (voir CastleJoints.js). */
    this.joints = new CastleJoints(this.engine.world, events)
    /** Combos d'éléments (v6.2) : fer rougi, trempe, fer électrisé, eau électrisée, éclats de glace (voir ElementCombos.js). */
    this.combos = new ElementCombos(this.#makeComboPort())
    this.#defenders = new DefenderContacts(this.#makeDefenderPort())
    this.#reactions = new ElementReactions(this.#makeReactionPort())
    // Soudé au pas où le château est posé (horloge du monde : relectures identiques).
    this.#jointsEnabled = Boolean(joints)
    this.#jointsPending = this.#jointsEnabled
    this.#jointToughness = Math.max(1, Number(jointToughness) || 1)
    /** Nuages (v6.1) : poison, miasmes, farine, essaims (voir Clouds.js). */
    this.clouds = new Clouds()
    /** Ouvrages (v6.1) : moulins, forges, citernes, ruches, farine (voir Props.js). */
    this.props = new Props(seed)
    /** Position de l'engin du joueur (les moulins lui font face), réglée par la partie. */
    this.engineX = 200
    /**
     * Temps qu'il fait (v6.1, réglé par la partie selon le chapitre) : `wet`
     * (pluie : la décharge de l'orbe d'orage porte plus loin), `winter` (l'eau gèle).
     */
    this.weather = { wet: false, winter: false }
    /** Souffle du monde (v6.1, voir WorldWinds.js) et colonnes d'air chaud (Montagne). */
    this.worldWind = WORLD_WINDS.breeze
    this.thermals = []
    /**
     * Zone de jeu (v6.2), fixée par la partie à l'arrivée du château : un boulet
     * qui roule au-delà, après l'impact, n'a plus rien à y faire (voir #retireStrays).
     * @type {{ left: number, right: number } | null}
     */
    this.playZone = null

    this._onCollision = (e) => this.#handleCollisions(e.pairs)
    this._onActive = (e) => this.#handleActiveContacts(e.pairs)
    this._onBeforeUpdate = () => this.#applyWind()
    Events.on(this.engine, 'collisionStart', this._onCollision)
    Events.on(this.engine, 'collisionActive', this._onActive)
    Events.on(this.engine, 'beforeUpdate', this._onBeforeUpdate)
  }

  get time() {
    return this.#time
  }

  /**
   * Souffle du monde (v6.1) : l'élément que le vent porte dans ce chapitre.
   * @param {string} id voir WORLD_WINDS
   */
  setWorldWind(id) {
    this.worldWind = WORLD_WINDS[id] ?? WORLD_WINDS.breeze
  }

  /** Élément qui marque les projectiles exposés au vent (ou null). */
  get exposureElement() {
    const e = this.worldWind.element
    return EXPOSURE_ELEMENTS.includes(e) ? e : null
  }

  /** Poussée verticale des colonnes d'air chaud en un point (accélération Matter, vers le haut < 0). */
  liftAt(x, y) {
    if (!this.thermals.length || y < WORLD.GROUND_Y - THERMAL.TOP) return 0
    for (const c of this.thermals) {
      const d = Math.abs(x - c.x)
      if (d < THERMAL.HALF_W) return -THERMAL.LIFT * WORLD.GRAVITY * WORLD.GRAVITY_SCALE * (1 - (d / THERMAL.HALF_W) ** 2)
    }
    return 0
  }

  /** Vent de base du tour, ∈ [-1, 1]. */
  get wind() {
    return this.windField.base
  }

  set wind(v) {
    this.windField.base = v
  }

  /** @returns {IterableIterator<import('../entities/Entity.js').Entity>} */
  entities() {
    return this.#entities.values()
  }

  /** @param {(e: any) => boolean} predicate */
  filter(predicate) {
    return [...this.#entities.values()].filter(predicate)
  }

  /**
   * Arme les règles de mort (écrasement, chute, renversement) et relève les
   * appuis de la structure stabilisée. Appelé au premier projectile, mais aussi
   * par un pouvoir immédiat (séisme) : sans cela, une cible renversée avant
   * tout tir n'était pas comptée comme éliminée.
   */
  arm() {
    if (this.#armed) return
    this.structure.map(this.#entities.values())
    this.#armed = true
  }

  get armed() {
    return this.#armed
  }

  /**
   * Assemblage (v6.2, voir CastleJoints.js) : soude le château posé. Fait de
   * lui-même au pas où le monde est posé (option `joints` de la partie).
   */
  buildJoints() {
    this.#keystones = this.filter((e) => e.kind === 'block' && e.keystone && e.alive)
    this.joints.build(this.#entities.values(), { groundY: WORLD.GROUND_Y, keystones: new Set(this.#keystones), toughness: this.#jointToughness })
  }

  /**
   * Ce que les combos d'éléments peuvent faire au monde (v6.2, voir
   * ElementCombos.js : leurs règles et leurs effets y sont tous).
   * @returns {import('./ElementCombos.js').ComboPort}
   */
  #makeComboPort() {
    const world = this
    return {
      get time() {
        return world.#time
      },
      get armed() {
        return world.#armed
      },
      entities: () => world.#entities.values(),
      queryRadius: (x, y, r) => world.queryRadius(x, y, r),
      ignite: (e) => world.#reactions.heat(e, 6000),
      burn: (t, dmg) => {
        if (world.#armed) world.#defenders.hurt(t, dmg, 'fire', 0, { knock: false })
      },
      shock: (t, dmg) => {
        if (world.#armed) world.#reactions.shock(t, dmg)
      },
      hurt: (t, dmg, cause, dir) => world.#defenders.hurt(t, dmg, cause, dir),
      emit: (name, data) => world.#events.emit(name, data),
    }
  }

  /**
   * Ce que les règles des défenseurs peuvent lire et faire du monde (v6.2,
   * voir DefenderContacts.js).
   * @returns {import('./DefenderContacts.js').DefenderPort}
   */
  #makeDefenderPort() {
    const world = this
    return {
      get time() {
        return world.#time
      },
      entities: () => world.#entities.values(),
      filter: (predicate) => world.filter(predicate),
      entityOf: (body) => world.#entityOf(body),
      emit: (name, data) => world.#events.emit(name, data),
    }
  }

  /**
   * Ce que les réactions des éléments peuvent lire et faire du monde (v6.2,
   * voir ElementReactions.js). Le hasard est celui du monde (même suite de tirages).
   * @returns {import('./ElementReactions.js').ReactionPort}
   */
  #makeReactionPort() {
    const world = this
    return {
      get time() {
        return world.#time
      },
      get armed() {
        return world.#armed
      },
      get rng() {
        return world.#rng
      },
      entities: () => world.#entities.values(),
      filter: (predicate) => world.filter(predicate),
      queryRadius: (x, y, r) => world.queryRadius(x, y, r),
      queueExplosion: (x, y, spec) => world.#pendingExplosions.push({ at: world.#time, x, y, spec }),
      emit: (name, data) => world.#events.emit(name, data),
      get clouds() {
        return world.clouds
      },
      get props() {
        return world.props
      },
      get windField() {
        return world.windField
      },
      get weather() {
        return world.weather
      },
      get worldWind() {
        return world.worldWind
      },
      get combos() {
        return world.combos
      },
    }
  }

  /**
   * Point sensible (v6.2) : une clé de voûte entamée (KEYSTONE.GIVE de sa vie) se
   * désagrège ; tout ce qu'elle portait s'effondre.
   */
  #checkKeystones() {
    for (const e of this.#keystones) {
      if (!e.alive || e.keystoneGone || e.hp > e.maxHp * (1 - KEYSTONE.GIVE)) continue
      e.keystoneGone = true
      this.joints.release(e)
      this.#events.emit('keystone', { entity: e, x: e.x, y: e.y, material: e.material })
      e.kill('crumble')
    }
  }

  add(entity) {
    if (entity.kind === 'projectile') this.arm()
    if (entity.kind === 'target') this.#hadTargets = true
    this.#entities.set(entity.body.id, entity)
    Composite.add(this.engine.world, entity.body)
    return entity
  }

  remove(entity) {
    if (!this.#entities.has(entity.body.id)) return
    this.#entities.delete(entity.body.id)
    Composite.remove(this.engine.world, entity.body)
  }

  /** La structure a-t-elle fini de se stabiliser (période sans dégâts) ? */
  get settled() {
    return this.#time - this.#settleFrom >= WORLD.SETTLE_MS
  }

  /**
   * Grand siège (v6.0) : un nouveau château vient d'être posé. Il se stabilise
   * sans dégâts, les règles de mort attendent le prochain tir, et les
   * défenseurs repartent de zéro (navigation, ouvrages).
   */
  resetStage() {
    this.#settleFrom = this.#time
    this.#armed = false
    this.#pendingExplosions = []
    this.structure.clear()
    this.units.reset()
    this.tethers.clear()
    this.joints.clear()
    this.combos.clear()
    this.#keystones = []
    this.#jointsPending = this.#jointsEnabled
    this.clouds.clear()
    this.props.clear()
  }

  /**
   * Avance la simulation du temps réel écoulé (ms), par pas fixes.
   * @param {number} frameMs
   * @param {number} [timeScale] ralenti éventuel
   */
  step(frameMs, timeScale = 1) {
    this.#accumulator += Math.min(frameMs, 100) * timeScale
    let steps = 0
    while (this.#accumulator >= WORLD.STEP_MS && steps < WORLD.MAX_STEPS_PER_FRAME) {
      this.stepOnce()
      this.#accumulator -= WORLD.STEP_MS
      steps++
    }
    if (steps === WORLD.MAX_STEPS_PER_FRAME) this.#accumulator = 0
    return steps
  }

  /** Un pas de simulation (utilisé aussi par les tests et le solveur de niveaux). */
  stepOnce() {
    this.beforeStep?.()
    Engine.update(this.engine, WORLD.STEP_MS)
    this.#time += WORLD.STEP_MS
    for (const e of this.#entities.values()) e.update(WORLD.STEP_MS)
    this.tethers.step(this.#entities.values(), this.#time)
    // Assemblage (v6.2) : soudure du château posé, usure des jonctions, clés de voûte.
    if (this.#jointsPending && this.settled) {
      this.#jointsPending = false
      this.buildJoints()
    }
    this.joints.step(WORLD.STEP_MS)
    if (this.#keystones.length) this.#checkKeystones()
    this.combos.step(WORLD.STEP_MS)
    // Ouvrages (v6.1) : rafales des moulins, flammes des forges.
    this.props.step(this.#entities.values(), this.#time, WORLD.STEP_MS, { engineX: () => this.engineX, emit: (name, data) => this.#events.emit(name, data) })
    if (this.props.flames.length) this.#reactions.stepFlames()
    this.#flushSpawns()
    this.#rollSnowballs()
    this.#reactions.processSteam()
    // Défenseurs (v5.8) : navigation, esquives, réparations (voir ../ai/UnitDirector.js).
    if (this.settled) this.units.step()
    // Nuages et poison (v6.1).
    this.#reactions.stepClouds()
    this.#fireTick += WORLD.STEP_MS
    if (this.#fireTick >= 400) {
      this.#fireTick = 0
      this.#reactions.spreadFire()
    }
    this.#processExplosions()
    if (this.#armed && ++this.#pinTick >= WORLD.PIN_CHECK_EVERY) {
      this.#pinTick = 0
      this.#defenders.checkPinned()
      this.#defenders.checkKnockouts(WORLD.STEP_MS * WORLD.PIN_CHECK_EVERY)
    }
    if (++this.#supportTick >= WORLD.SUPPORT_CHECK_EVERY) {
      this.#supportTick = 0
      this.#checkSupports()
    }
    this.#retireStrays()
    this.#cleanup()
    this.afterStep?.()
  }

  /**
   * Boulets hors jeu (v6.2) : après l'impact, un tir qui file au-delà du château,
   * repart vers l'engin ou survit à la dernière cible ne fait plus rien pour la
   * partie. Il s'efface (petit nuage de poussière) au lieu de retenir la caméra
   * et le tour jusqu'à ce qu'il s'arrête. Décidé au pas de simulation : les
   * relectures restent identiques.
   */
  #retireStrays() {
    const zone = this.playZone
    let standing = null
    for (const e of this.#entities.values()) {
      if (e.kind !== 'projectile' || !e.alive || e.spent || !e.hasImpacted) continue
      // « Plus personne debout » ne vaut que pour un château qui avait des défenseurs.
      standing ??= !this.#hadTargets || this.filter((t) => t.kind === 'target' && t.alive).length > 0
      const vx = Body.getVelocity(e.body).x
      const away = zone && ((e.x > zone.right && vx >= 0) || (e.x < zone.left && vx < -0.3))
      if (!standing || away) e.spent = true
    }
  }

  /**
   * Appuis réels : un corps endormi (immobile) dont le dessous ne touche plus
   * rien (ni sol, ni bloc, ni personnage) est réveillé. Le moteur, qui ne
   * réveille un corps que lorsqu'on le heurte, laissait sinon des personnages
   * et des toits suspendus dans le vide quand leur appui disparaissait.
   */
  #checkSupports() {
    const bodies = [this.#ground, ...[...this.#entities.values()].filter((e) => e.alive && e.kind !== 'projectile').map((e) => e.body)]
    for (const e of this.#entities.values()) {
      // Une charge pendue à sa corde, un tablier sur sa charnière : rien ne les porte par-dessous.
      if (!e.alive || !e.body.isSleeping || e.tethered > 0 || e.hinged) continue
      const b = e.body.bounds
      const w = b.max.x - b.min.x
      const probes = [0.2, 0.5, 0.8].map((k) => ({ x: b.min.x + w * k, y: b.max.y + 4 }))
      const supported = probes.some((p) => bodies.some((o) => o !== e.body && Vertices.contains(o.vertices, p)))
      if (!supported) this.#wakeColumn(b)
    }
  }

  /** Réveille un corps et tout ce qui se trouve au-dessus de lui (même colonne). */
  #wakeColumn(bounds) {
    for (const e of this.#entities.values()) {
      const o = e.body.bounds
      const overlapX = Math.min(o.max.x, bounds.max.x + 30) - Math.max(o.min.x, bounds.min.x - 30)
      if (overlapX > 0 && o.min.y <= bounds.max.y + 5) Sleeping.set(e.body, false)
    }
  }

  /** Tous les corps sont-ils (quasi) immobiles ? */
  isAtRest(threshold = 0.12) {
    for (const e of this.#entities.values()) {
      if (e.kind === 'projectile') return false
      // Un défenseur qui fait sa ronde n'empêche pas le tour de se terminer.
      if (e.walking && e.alive) continue
      if (!e.body.isSleeping && e.speed > threshold) return false
    }
    return this.#pendingExplosions.length === 0
  }

  /** Entités dont le centre est dans le rayon donné. */
  /**
   * Le point (x, y) est-il à l'intérieur d'un bloc ou d'un baril ? (effets visuels)
   * @param {number} x
   * @param {number} y
   */
  solidAt(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false
    for (const e of this.#entities.values()) {
      if (!e.alive || (e.kind !== 'block' && e.kind !== 'barrel')) continue
      const b = e.body.bounds
      if (x < b.min.x || x > b.max.x || y < b.min.y || y > b.max.y) continue
      if (Vertices.contains(e.body.vertices, { x, y })) return true
    }
    return false
  }

  queryRadius(x, y, radius) {
    const r2 = radius * radius
    return this.filter((e) => e.alive && (e.x - x) ** 2 + (e.y - y) ** 2 <= r2)
  }

  /**
   * Explosion : souffle radial + dégâts dégressifs + mise à feu des matériaux inflammables.
   * @param {number} x
   * @param {number} y
   * @param {{ radius: number, power: number, damage: number, source?: any }} spec
   */
  explode(x, y, { radius, power, damage, source = null }) {
    this.#events.emit('explosion', { x, y, radius, source })
    // Un nuage de gaz ou de farine pris dans le souffle s'embrase à son tour (v6.1).
    for (const c of this.clouds.list) {
      if (Math.hypot(c.x - x, c.y - y) <= radius + this.clouds.radiusAt(c, this.#time) * 0.6) this.#reactions.cloudBlast(c)
    }
    this.units.onBlast(x, y, radius)
    this.tethers.blast(x, y, radius, this.#time)
    this.joints.blast(x, y, radius)
    // Éclats de glace (v6.2) : la glace et ce qui est gelé, pris dans le souffle, volent en éclats.
    const icy = this.combos.brittleIn(x, y, radius)
    for (const e of this.queryRadius(x, y, radius + 30)) {
      if (e === source) continue
      const dx = e.x - x
      const dy = e.y - y
      const d = Math.max(1, Math.hypot(dx, dy) - Math.max(e.width, e.height) / 3)
      const falloff = Math.max(0, 1 - d / radius)
      if (falloff <= 0) continue
      // Une créature volante prise dans le souffle tombe.
      if (e.kind === 'flyer') {
        if (falloff > 0.15) e.kill('explosion')
        continue
      }
      Sleeping.set(e.body, false)
      const v = Body.getVelocity(e.body)
      const kick = (power * falloff) / Math.sqrt(Math.max(0.5, e.mass))
      Body.setVelocity(e.body, { x: v.x + (dx / (d || 1)) * kick, y: v.y + (dy / (d || 1)) * kick - kick * 0.35 })
      Body.setAngularVelocity(e.body, e.body.angularVelocity + (this.#rng.next() - 0.5) * 0.2 * falloff)
      if (e.kind !== 'projectile') {
        e.damage(damage * falloff, 'explosion')
        if (falloff > 0.35) this.#reactions.heat(e, 5000)
      }
    }
    if (icy.length) this.combos.shards(icy)
  }

  /**
   * Séisme : secoue tous les corps posés et inflige des dégâts légers.
   * @param {number} intensity 0..1
   */
  quake(intensity = 1) {
    this.#events.emit('quake', { intensity })
    for (const e of this.#entities.values()) {
      if (e.kind === 'projectile' || e.kind === 'flyer' || e.terrain) continue
      Sleeping.set(e.body, false)
      const v = Body.getVelocity(e.body)
      const k = intensity * (2.4 + this.#rng.range(0, 1.6)) * (e.y < WORLD.GROUND_Y - 150 ? 1.4 : 1)
      Body.setVelocity(e.body, { x: v.x + (this.#rng.next() < 0.5 ? -k : k), y: v.y - k * 0.6 })
      e.damage(e.maxHp * 0.12 * intensity, 'impact')
    }
  }

  /**
   * Météore (pouvoir) : le projectile pique droit vers le sol, très vite.
   * @returns {boolean}
   */
  dive(p) {
    if (!(p instanceof Projectile) || !p.canActivate || !p.diveable) return false
    p.diving = true
    const v = Body.getVelocity(p.body)
    Body.setVelocity(p.body, { x: v.x * 0.12, y: Math.max(22, Math.abs(v.y) + 14) })
    this.#events.emit('projectile:dive', { entity: p })
    return true
  }

  /**
   * Foudre (pouvoir) : `count` éclairs frappent les points les plus hauts du
   * champ de bataille (blocs, défenseurs, barils ; jamais deux fois au même
   * endroit). Un éclair pulvérise le bloc frappé (le fer y résiste à moitié),
   * foudroie le défenseur, met le feu au bois… et fait éclater la glace.
   */
  lightning(count = 3) {
    this.arm()
    const struck = []
    const candidates = this.filter((e) => e.alive && !e.terrain && (e.kind === 'block' || e.kind === 'target' || e.kind === 'barrel'))
      .map((e) => ({ e, top: e.y - e.height / 2 }))
      .sort((a, b) => a.top - b.top)
    for (const { e, top } of candidates) {
      if (struck.length >= count) break
      if (struck.some((s) => Math.abs(s.x - e.x) < 90)) continue
      struck.push({ x: e.x, y: top })
      this.#events.emit('lightning', { x: e.x, y: top, entity: e })
      if (e.kind === 'target') e.kill('lightning')
      else if (e.kind === 'barrel') e.kill('explosion')
      else if (e.frozenMs > 0) this.#reactions.steam(e)
      else e.damage((e.material === 'iron' ? 0.55 : 1.05) * e.maxHp, 'explosion')
      for (const near of this.queryRadius(e.x, top + 30, 60)) {
        if (near === e || near.kind === 'flyer' || near.kind === 'projectile') continue
        near.damage(near.kind === 'target' ? 999 : 160, 'explosion')
        this.#reactions.heat(near, 6000)
        Sleeping.set(near.body, false)
      }
    }
    return struck
  }

  /** Divise un projectile en trois (mitraille). */
  splitProjectile(p) {
    if (!(p instanceof Projectile) || !p.canActivate) return []
    p.hasSplit = true
    const v = Body.getVelocity(p.body)
    const speed = Math.hypot(v.x, v.y)
    const base = Math.atan2(v.y, v.x)
    const shards = [-0.14, 0, 0.14].map((da) => {
      const shard = new Projectile('stone', p.x, p.y, { radius: 11 })
      shard.splittable = false
      this.add(shard)
      Body.setVelocity(shard.body, { x: Math.cos(base + da) * speed, y: Math.sin(base + da) * speed })
      return shard
    })
    p.kill('split')
    this.#events.emit('projectile:split', { entity: p, shards })
    return shards
  }

  /**
   * Le vent pousse les projectiles en vol. En Difficile, sa force dépend de
   * l'altitude, des rafales et de la prise au vent du projectile (WindField).
   */
  #applyWind() {
    this.#steerHoming()
    const field = this.windField
    // Rafales des moulins (v6.1) : elles soufflent même par temps calme.
    const gusts = this.props.zones.length > 0
    const element = this.exposureElement
    if (field.base === 0 && !gusts && !this.thermals.length) return
    const g = MILL.ACCEL * WORLD.WIND_RATIO * WORLD.GRAVITY * WORLD.GRAVITY_SCALE
    for (const e of this.#entities.values()) {
      if (e.kind !== 'projectile' || e.hasImpacted) continue
      e.windage ??= windageOf(e)
      const gust = gusts ? this.props.gustAt(e.x, e.y) : 0
      let a = field.base === 0 ? 0 : field.accel(e.x, e.y, this.#time, e.windage)
      if (gust) a += gust * g * e.windage
      e.body.force.x += e.body.mass * a
      // Colonnes d'air chaud (Montagne) : elles portent les tirs vers le haut.
      if (this.thermals.length) e.body.force.y += e.body.mass * this.liftAt(e.x, e.y)
      // Matter ne recalcule pas le mouvement (`motion`) d'un corps soumis à une
      // force : sans cela, un tir dans le vent ne réveillerait pas ce qu'il touche
      // et rebondirait sur un bloc ou un baril endormi comme sur un mur (v6.1).
      const speed = Body.getSpeed(e.body)
      const spin = Body.getAngularSpeed(e.body)
      e.body.motion = speed * speed + spin * spin
      // Souffle du monde : exposition, puis l'élément marque le tir (une fois).
      if (element && !e.exposed && e.alive) {
        e.exposure = (e.exposure ?? 0) + exposureStep(field.base === 0 ? 0 : field.at(e.x, e.y, this.#time), gust, WORLD.STEP_MS)
        if (e.exposure >= 1) this.#expose(e, element)
      }
    }
  }

  /** L'élément du monde marque un projectile en vol (voir WorldWinds.applyElement). */
  #expose(p, element) {
    p.exposed = true
    const what = applyElement(element, p)
    if (!what) return
    // Le sable freine le tir (il tombe court).
    if (element === 'sand') {
      const v = Body.getVelocity(p.body)
      const k = this.worldWind.slow ?? 0.82
      Body.setVelocity(p.body, { x: v.x * k, y: v.y * k })
    }
    this.#events.emit('element', { kind: what, element, x: p.x, y: p.y, entity: p })
  }

  /**
   * Pierre d'aimant : avant son premier choc, le projectile infléchit sa course
   * vers le défenseur vivant le plus proche devant lui (virage borné à chaque
   * pas : on peut encore le rater si on vise trop mal).
   */
  #steerHoming() {
    for (const p of this.#entities.values()) {
      if (p.kind !== 'projectile' || !p.homing || p.hasImpacted || !p.alive) continue
      let best = null
      let bestD = 900
      for (const t of this.#entities.values()) {
        if (t.kind !== 'target' || !t.alive) continue
        const d = Math.hypot(t.x - p.x, t.y - p.y)
        if (d < bestD) {
          bestD = d
          best = t
        }
      }
      if (!best) continue
      const v = Body.getVelocity(p.body)
      const speed = Math.hypot(v.x, v.y)
      if (speed < 1) continue
      const want = Math.atan2(best.y - p.y, best.x - p.x)
      const cur = Math.atan2(v.y, v.x)
      let d = want - cur
      d = Math.atan2(Math.sin(d), Math.cos(d))
      // Plus la cible est proche, plus l'aimant tire fort.
      const turn = Math.max(-1, Math.min(1, d)) * (0.012 + 0.03 * (1 - bestD / 900))
      const a = cur + turn
      Body.setVelocity(p.body, { x: Math.cos(a) * speed, y: Math.sin(a) * speed })
    }
  }

  #entityOf(body) {
    const b = body.parent || body
    return b.plugin && b.plugin.entity ? b.plugin.entity : null
  }

  #handleCollisions(pairs) {
    for (const pair of pairs) {
      const a = this.#entityOf(pair.bodyA)
      const b = this.#entityOf(pair.bodyB)
      if (!a && !b) continue
      const bodyA = pair.bodyA.parent || pair.bodyA
      const bodyB = pair.bodyB.parent || pair.bodyB
      const va = Body.getVelocity(bodyA)
      const vb = Body.getVelocity(bodyB)
      const n = pair.collision.normal
      const rel = Math.abs((va.x - vb.x) * n.x + (va.y - vb.y) * n.y)

      // Ogre : il renvoie les projectiles légers et repousse les blocs qui lui tombent dessus.
      const ogre = a?.type === 'ogre' ? a : b?.type === 'ogre' ? b : null
      if (ogre && this.#defenders.ogreReacts(ogre, ogre === a ? b : a, pair)) continue
      // Pavoisier (v5.8) : son pavois arrête les tirs tendus qui le frappent de face.
      const shield = a?.shield ? a : b?.shield ? b : null
      if (shield && this.#defenders.shieldReacts(shield, shield === a ? b : a, pair)) continue

      // Créature volante : elle stoppe le projectile (capteur, pas de rebond).
      if (a?.kind === 'flyer' || b?.kind === 'flyer') {
        const flyer = a?.kind === 'flyer' ? a : b
        const p = flyer === a ? b : a
        if (p?.kind === 'projectile') this.#hitFlyer(flyer, p)
        continue
      }
      // Contact avec le sol : lacs, lave, neige.
      const onGround = bodyA === this.#ground ? b : bodyB === this.#ground ? a : null
      if (onGround && this.#touchGround(onGround, pair)) continue

      // Défenseurs (v6.1) : repousser, encaisser, chuter. Avant les effets du
      // projectile : le givre ne rend pas cassant celui qu'il vient de frapper.
      if (this.#armed && (a?.kind === 'target' || b?.kind === 'target')) this.#defenders.contact(a, b, rel, pair)

      // Premier contact d'un projectile : effets spéciaux (feu, givre, explosion).
      for (const [p, other] of [[a, b], [b, a]]) {
        // Botte de paille (v6.1) contre ce qui brûle : elle s'enflamme et devient un brandon.
        if (p?.kind === 'projectile' && p.soft && other && (other.burning > 0 || other.hot) && p.kindle()) this.#events.emit('fire:start', { entity: p })
        if (p && p.kind === 'projectile' && !p.hasImpacted && p.alive) {
          p.hasImpacted = true
          // Orbe d'orage et pot de poison (v6.1). Un tir chargé par l'orage décharge à l'impact.
          if (p.thunder || p.charged) this.#reactions.discharge(p, other, { hops: p.thunder ? THUNDER.HOPS + (p.charged ? this.worldWind.hops ?? 2 : 0) : this.worldWind.hops ?? 2, scale: p.thunder ? 1 : 0.6 })
          if (p.poison) {
            const c = this.#reactions.spawnCloud('poison', p.x, p.y, { scale: p.fireFactor ?? 1 })
            // Un pot qui brûle (vent de braises, forge) : le gaz s'embrase aussitôt.
            if (p.ignites) this.#reactions.cloudBlast(c)
            p.kill('shatter')
          }
          if (p.ignites) p.heatMs = HOT_BALL_MS * p.fireFactor
          if (p.ignites && other) this.#reactions.heat(other, 7000)
          if (p.ignites) {
            for (const near of this.queryRadius(p.x, p.y, 95 * p.fireFactor)) {
              if (near !== p && near !== other) this.#reactions.heat(near, 6000)
            }
          }
          if (p.frost) this.#reactions.frostBurst(p)
          // Météore : le piqué s'achève en onde de choc.
          if (p.diving) this.#pendingExplosions.push({ at: this.#time, x: p.x, y: p.y, spec: { radius: 135, power: 10, damage: 900, source: p } })
          if (p.explodes) {
            this.#pendingExplosions.push({ at: this.#time, x: p.x, y: p.y, spec: { radius: 150 * p.blastFactor, power: 12 * Math.sqrt(p.blastFactor), damage: 800 * p.blastFactor, source: p } })
            p.kill('explosion')
          }
        } else if (p && p.kind === 'projectile' && p.hasImpacted && p.hot && other && (other.flammable || other.frozenMs > 0)) {
          // Boulet encore brûlant qui rebondit, roule ou retombe sur du bois, de la paille… ou sur de la glace.
          this.#reactions.heat(other, 6000)
        }
      }


      if (!this.settled || rel < WORLD.IMPACT_THRESHOLD) continue
      const ma = bodyA.isStatic ? Infinity : bodyA.mass
      const mb = bodyB.isStatic ? Infinity : bodyB.mass
      const reduced = ma === Infinity ? mb : mb === Infinity ? ma : (ma * mb) / (ma + mb)
      const v = rel - WORLD.IMPACT_THRESHOLD
      let energy = 0.5 * reduced * v * v
      const projectile = a?.kind === 'projectile' ? a : b?.kind === 'projectile' ? b : null
      if (projectile) energy *= projectile.impactFactor
      // Givré par la bise (v6.1) : il cogne moins les murs, puis éclate.
      if (projectile?.rimed) {
        energy *= this.worldWind.wall ?? 0.5
        if (projectile.alive) this.#reactions.shatter(projectile)
      }
      if (energy < 1) continue

      const contact = pair.collision.supports[0] || bodyA.position
      // Percée : le bloc cède sous le choc, le projectile poursuit sa course.
      const struck = projectile && (a === projectile ? b : a)
      if (struck?.kind === 'block' && struck.alive && !struck.terrain && projectile.alive && this.#breach(projectile, struck, energy, projectile === a ? va : vb, pair, contact)) continue
      for (const [e, other] of [[a, b], [b, a]]) {
        // Les défenseurs ont leurs propres règles (DefenderContacts#contact).
        if (!e || !e.alive || e.kind === 'target') continue
        e.receiveImpact(energy, other)
        // Le choc use les jonctions du bloc, et un peu celles de ses voisins (v6.2).
        if (e.kind === 'block' && !e.terrain) this.joints.hit(e, energy)
        if (energy > 8) {
          this.#events.emit('impact', { entity: e, energy, x: contact.x, y: contact.y, material: e.material || e.kind })
        }
      }

      // Projectile contre mur porteur : le mur peut céder et entraîner les toits.
      const hitBlock = projectile && (a === projectile ? b : a)
      // Puissance (v6.1) : un gros coup projette le bloc frappé dans le sens du tir.
      if (hitBlock?.kind === 'block' && hitBlock.alive && !hitBlock.terrain && !hitBlock.body.isStatic && energy >= POWER.MIN_ENERGY && projectile.impactFactor >= 0.5) {
        const pv = projectile === a ? va : vb
        const k = (POWER.SHARE * projectile.mass) / Math.max(1, hitBlock.mass)
        const bv = Body.getVelocity(hitBlock.body)
        Sleeping.set(hitBlock.body, false)
        Body.setVelocity(hitBlock.body, { x: bv.x + pv.x * k, y: bv.y + Math.min(0, pv.y * k) })
        this.#events.emit('power', { entity: hitBlock, energy, x: contact.x, y: contact.y, vx: pv.x, vy: pv.y })
      }
      if (hitBlock?.kind === 'block' && hitBlock.alive && !hitBlock.terrain) {
        const loads = this.structure.onProjectileHit(hitBlock, energy * (hitBlock.armor ?? 1), Body.getVelocity(projectile.body), n)
        if (loads.length) this.#events.emit('structure:collapse', { entity: hitBlock, loads })
      }
    }
  }

  /**
   * Percée d'un bloc (voir BREACH_DAMPING). Le choc est comparé à la résistance
   * restante du bloc (blindage du fer compris, ou fragilité s'il est gelé).
   * @returns {boolean} vrai si le bloc a cédé et que le projectile le traverse
   */
  #breach(p, block, energy, v, pair, contact) {
    const frozen = block.frozenMs > 0
    // Seuls les projectiles lourds (rocher, boulet du Titan) percent les murs
    // solides ; une pierre ordinaire ne traverse que le bois, la paille, le verre…
    // ou un bloc gelé, devenu cassant.
    if (!frozen && block.maxHp > BREACH_LIGHT_HP && p.mass < BREACH_HEAVY_MASS) return false
    const effective = energy * (frozen ? FROST.BRITTLE : block.armor ?? 1)
    const hp = block.hp
    if (!(effective >= hp) || !Number.isFinite(hp)) return false
    // Le bloc vole en éclats ; le projectile ne rebondit pas (contact ignoré pour ce pas).
    pair.isActive = false
    block.kill('impact')
    const keep = Math.sqrt(Math.max(0, 1 - hp / effective)) * BREACH_DAMPING
    Body.setVelocity(p.body, { x: v.x * keep, y: v.y * keep })
    this.#events.emit('impact', { entity: block, energy, x: contact.x, y: contact.y, material: block.material })
    this.#events.emit('breach', { entity: block, x: contact.x, y: contact.y, material: block.material, keep })
    this.structure.onProjectileHit(block, effective, v, pair.collision.normal)
    return true
  }

  /** Un bloc, un baril ou (au choix) un autre défenseur occupe-t-il ce point ? */
  #blocked(x, y, self, withTargets = true) {
    for (const e of this.#entities.values()) {
      if (e === self || !e.alive || (e.kind !== 'block' && e.kind !== 'barrel' && (e.kind !== 'target' || !withTargets))) continue
      const b = e.body.bounds
      if (x < b.min.x || x > b.max.x || y < b.min.y || y > b.max.y) continue
      if (Vertices.contains(e.body.vertices, { x, y })) return true
    }
    return false
  }

  /** Une créature volante est touchée : elle tombe et stoppe le projectile. */
  #hitFlyer(flyer, p) {
    if (!flyer.alive || !p.alive || p.spent) return
    flyer.kill('shot')
    const v = Body.getVelocity(p.body)
    Body.setVelocity(p.body, { x: v.x * flyer.brake, y: v.y * flyer.brake })
    // La vouivre lâche son pot de feu grégeois, qui tombe sur ce qui est dessous.
    if (flyer.carrying) {
      flyer.carrying = false
      this.#spawns.push(() => {
        const pot = new Projectile('fire', flyer.x, flyer.y + 24)
        this.add(pot)
        Body.setVelocity(pot.body, { x: v.x * 0.15, y: 1.5 })
        this.#events.emit('flyer:drop', { entity: pot, x: flyer.x, y: flyer.y })
      })
    }
    this.#events.emit('flyer:hit', { entity: flyer, x: flyer.x, y: flyer.y })
  }

  #flushSpawns() {
    if (!this.#spawns.length) return
    const list = this.#spawns
    this.#spawns = []
    for (const fn of list) fn()
  }

  /**
   * Contact avec le sol sur un terrain particulier.
   * @returns {boolean} vrai si le contact est entièrement traité ici (le reste des règles est ignoré)
   */
  #touchGround(e, pair) {
    if (!e.alive) return false
    const zone = this.terrain.at(e.x)
    if (!zone) {
      if (e.onSnow) this.#leaveSnow(e)
      return false
    }
    if (e.kind === 'projectile') return this.#projectileOnTerrain(e, zone, pair)
    if (e.kind === 'target' && this.#armed && (zone.kind === 'lake' || zone.kind === 'lava')) e.kill(zone.kind === 'lake' ? 'drown' : 'burn')
    else if (zone.kind === 'lava' && (e.kind === 'block' || e.kind === 'barrel') && e.flammable) this.#reactions.heat(e, 8000)
    return false
  }

  #extinguish(p) {
    if (!p.ignites && !(p.heatMs > 0)) return false
    p.ignites = false
    p.heatMs = 0
    p.burning = 0
    return true
  }

  #projectileOnTerrain(p, zone, pair) {
    const v = Body.getVelocity(p.body)
    const at = { x: p.x, y: WORLD.GROUND_Y }
    if (zone.kind === 'lake') {
      if (p.frost) {
        // Le givre fige le lac : on y glisse désormais.
        this.terrain.convert(zone, 'ice')
        this.#events.emit('terrain', { kind: 'freeze', ...at, zone })
        return false
      }
      if (this.#extinguish(p)) this.#events.emit('steam', { ...at, radius: 40, entity: null })
      if ((p.skips ?? 0) < 1 && Math.abs(v.x) > 1) {
        // Ricochet : un seul.
        p.skips = (p.skips ?? 0) + 1
        pair.isActive = false
        Body.setVelocity(p.body, { x: v.x * TERRAIN.SKIP_KEEP_X, y: -Math.max(TERRAIN.SKIP_MIN_VY, Math.abs(v.y) * TERRAIN.SKIP_KEEP_Y) })
        this.#events.emit('terrain', { kind: 'skip', ...at, zone })
        return true
      }
      pair.isActive = false
      p.kill('drown')
      this.#events.emit('terrain', { kind: 'drown', ...at, zone })
      return true
    }
    if (zone.kind === 'ice') {
      if (p.hot) {
        // Le feu fait fondre la glace : le lac revient, le boulet y sombre.
        this.terrain.convert(zone, 'lake')
        this.#extinguish(p)
        pair.isActive = false
        p.kill('drown')
        this.#events.emit('steam', { ...at, radius: 60, entity: null })
        this.#events.emit('terrain', { kind: 'thaw', ...at, zone })
        return true
      }
      p.body.friction = 0.001
      return false
    }
    if (zone.kind === 'lava') {
      pair.isActive = false
      if (p.frost) {
        // Croûte d'obsidienne : une roche posée sur la lave.
        p.kill('freeze')
        const x = Math.round(p.x)
        this.#spawns.push(() => this.add(new Block({ material: 'rock', x, y: WORLD.GROUND_Y - 8, w: TERRAIN.CRUST_W, h: 16 })))
        this.#events.emit('terrain', { kind: 'crust', ...at, zone })
      } else {
        p.kill('melt')
        this.#events.emit('terrain', { kind: 'melt', ...at, zone })
      }
      return true
    }
    // Neige.
    if (p.hot) {
      this.terrain.carve(p.x, TERRAIN.MELT_HALF)
      this.#extinguish(p)
      Body.setVelocity(p.body, { x: v.x * 0.3, y: v.y * 0.3 })
      this.#events.emit('steam', { ...at, radius: 50, entity: null })
      this.#events.emit('terrain', { kind: 'thaw', ...at, zone })
      return false
    }
    if (!p.onSnow) {
      p.onSnow = true
      p.body.friction = 0.001
      p.body.frictionAir = 0
      p.body.restitution = 0
      this.#events.emit('terrain', { kind: 'snow', ...at, zone })
    }
    return false
  }

  #leaveSnow(p) {
    p.onSnow = false
    p.body.friction = 0.4
    p.body.frictionAir = 0.0006
  }

  /** Boules de neige : un boulet qui roule dans la neige grossit (et s'alourdit). */
  #rollSnowballs() {
    for (const p of this.#entities.values()) {
      if (p.kind !== 'projectile' || !p.onSnow || !p.alive) continue
      const zone = this.terrain.at(p.x)
      if (zone?.kind !== 'snow') {
        if (p.y + p.radius < WORLD.GROUND_Y - 4 || !zone) this.#leaveSnow(p)
        continue
      }
      if (p.y + p.radius < WORLD.GROUND_Y - 4) continue
      const v = Body.getVelocity(p.body)
      const d = Math.abs(v.x)
      if (d < 0.3) continue
      p.restMs = 0
      const grow = 1 + TERRAIN.SNOW_GROWTH * d
      if ((p.snowScale ?? 1) * grow > TERRAIN.SNOW_MAX) continue
      Body.scale(p.body, grow, grow)
      p.snowScale = (p.snowScale ?? 1) * grow
      p.radius *= grow
      p.width = p.height = p.radius * 2
    }
  }

  /**
   * Contacts prolongés : un objet déjà au contact qui se met à bouger frappe
   * aussi ; s'il presse doucement, le défenseur le repousse (v6.2 : règles dans
   * DefenderContacts#activeContact).
   */
  #handleActiveContacts(pairs) {
    if (!this.#armed) return
    for (const pair of pairs) {
      const a = this.#entityOf(pair.bodyA)
      const b = this.#entityOf(pair.bodyB)
      if (!a || !b || (a.kind !== 'target' && b.kind !== 'target')) continue
      this.#defenders.activeContact(a, b, pair)
    }
  }

  /** Réveille les corps proches d'un point (appui disparu, choc). */
  #wakeAround(x, y, radius) {
    for (const e of this.queryRadius(x, y, radius)) Sleeping.set(e.body, false)
  }

  #processExplosions() {
    const ready = this.#pendingExplosions.filter((x) => this.#time - x.at >= 0)
    if (!ready.length) return
    this.#pendingExplosions = this.#pendingExplosions.filter((x) => !ready.includes(x))
    for (const x of ready) this.explode(x.x, x.y, x.spec)
  }

  /** Retire les entités détruites, sorties du monde ou épuisées, et déclenche les barils. */
  #cleanup() {
    for (const e of [...this.#entities.values()]) {
      const out = e.y > WORLD.BOTTOM + WORLD.KILL_MARGIN || e.x < this.leftLimit - WORLD.KILL_MARGIN || e.x > WORLD.WIDTH + (e.kind === 'target' ? WORLD.FIELD_MARGIN : WORLD.KILL_MARGIN)
      if (out && e.alive) e.kill(e.kind === 'projectile' ? 'out' : 'fall')
      if (e.kind === 'projectile' && e.alive && e.spent) {
        this.remove(e)
        this.#events.emit('projectile:spent', { entity: e })
        continue
      }
      if (!e.alive) {
        this.remove(e)
        // Tout ce qui reposait (même indirectement) sur l'objet disparu se réveille.
        this.#wakeColumn(e.body.bounds)
        if (e.kind === 'block') {
          this.structure.onRemoved(e)
          this.#wakeAround(e.x, e.y, Math.max(e.width, e.height) + 80)
          // Un ouvrage cède (v6.1) : inondation, essaim, farine, braises.
          if (e.prop) this.#reactions.propDestroyed(e)
        }
        if (e.kind === 'target') this.units.onDown(e)
        if (e.kind === 'barrel') {
          this.#pendingExplosions.push({ at: this.#time + 110, x: e.x, y: e.y, spec: { ...e.explosion, source: e } })
        }
        if (e.kind === 'projectile') this.#events.emit('projectile:spent', { entity: e })
        else this.#events.emit('entity:destroyed', { entity: e, cause: e.deathCause || 'impact' })
      }
    }
  }

  destroy() {
    Events.off(this.engine, 'collisionStart', this._onCollision)
    Events.off(this.engine, 'collisionActive', this._onActive)
    this.structure.clear()
    Events.off(this.engine, 'beforeUpdate', this._onBeforeUpdate)
    Composite.clear(this.engine.world, false)
    Engine.clear(this.engine)
    this.#entities.clear()
  }
}
