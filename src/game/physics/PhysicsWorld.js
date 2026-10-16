import Matter from 'matter-js'
import { UnitDirector } from '../ai/UnitDirector.js'
import { WindField, WIND_PROFILES, windageOf } from './WindField.js'
import { WORLD, CATEGORY } from './constants.js'
import { Projectile } from '../entities/Projectile.js'
import { SeededRandom } from '../../core/utils/SeededRandom.js'
import { StructuralIntegrity } from './StructuralIntegrity.js'
import { TerrainZones, TERRAIN } from './Terrain.js'
import { Block } from '../entities/Block.js'
import { FROST, ELEMENT_HIT_CAP, THUNDER, POISON, TARGET_TYPES } from '../entities/catalog.js'
import { Clouds, CLOUD_KINDS } from './Clouds.js'
import { Props } from './Props.js'
import { MILL } from '../entities/props.js'
import { WORLD_WINDS, EXPOSURE_ELEMENTS, THERMAL, exposureStep, applyElement } from './WorldWinds.js'
import { Tethers } from './Tethers.js'
import { canPush, hitDamage, fallDamage } from './FallingObjects.js'

const { Engine, Composite, Bodies, Body, Events, Sleeping, Query, Vertices } = Matter

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
 */
/** Durée pendant laquelle un boulet enflammé reste brûlant après son premier choc (ms). */
export const HOT_BALL_MS = 4500

/**
 * Percée (v5.0) : un projectile dont le choc suffit à détruire le bloc qu'il
 * frappe le traverse au lieu de s'y arrêter, en gardant l'énergie qui reste
 * (vitesse × √(1 − résistance / choc), un peu amortie). Un boulet lourd perce
 * ainsi plusieurs murs d'affilée ; une pierre légère s'arrête au premier.
 */
export const BREACH_DAMPING = 0.9
/** Matériaux légers (résistance ≤ ce seuil) : n'importe quel projectile peut les percer. */
export const BREACH_LIGHT_HP = 300
/** Masse à partir de laquelle un projectile perce aussi la pierre (rocher : ≈ 29, pierre : ≈ 8). */
export const BREACH_HEAVY_MASS = 20

/** Délai entre deux revers de l'ogre (ms). La marche des défenseurs : voir ../ai/. */
export const OGRE_SWAT_MS = 900

/** Un objet repoussé par un défenseur ne blesse personne pendant ce délai (ms, v6.1). */
export const PUSHED_SAFE_MS = 700
/** Même objet, même défenseur : un seul coup par contact prolongé dans ce délai (ms). */
const RESTRIKE_MS = 250
/** Renversé (v6.1) : part de ses points de vie qu'il perd en tombant, avant de se relever. */
export const KNOCKDOWN_SHARE = 0.35
/**
 * Puissance d'un tir (v6.1) : au-delà de MIN_ENERGY, le bloc frappé reçoit en
 * plus SHARE de la quantité de mouvement du projectile, dans le sens du tir (les
 * murs encaissent le coup, les blocs volent). Jamais vers le bas : un tir en
 * cloche n'enfonce pas le bloc dans le sol.
 */
export const POWER = Object.freeze({ MIN_ENERGY: 150, SHARE: 0.3 })

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
  /** Début de la stabilisation en cours (0 au départ ; une nouvelle étape la relance, v6.0). */
  #settleFrom = 0
  /** Appelé avant chaque pas de simulation (effets programmés de la partie, v6.0). */
  beforeStep = null
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
  /** Vapeur en chaîne : blocs gelés voisins qui éclatent à leur tour, avec un court délai. */
  #steamQueue = []
  /** Dernier coup reçu par chaque défenseur (contacts prolongés) : { o, at }. */
  #struckAt = new WeakMap()
  /** Pas depuis la dernière mise à feu par un jet de forge (v6.1). */
  #flameTick = 0

  /**
   * @param {import('../../core/utils/EventBus.js').EventBus} events
   * @param {{ wind?: number, seed?: number, windProfile?: object }} [opts] wind ∈ [-1, 1] ;
   *   graine du hasard (feu, éclats, rafales) ; profil de vent de la difficulté
   */
  constructor(events, { wind = 0, seed = 1, windProfile = WIND_PROFILES.normal, zones = [] } = {}) {
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
      heat: (e, ms) => this.#heat(e, ms),
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

  add(entity) {
    if (entity.kind === 'projectile') this.arm()
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
    // Ouvrages (v6.1) : rafales des moulins, flammes des forges.
    this.props.step(this.#entities.values(), this.#time, WORLD.STEP_MS, { engineX: () => this.engineX, emit: (name, data) => this.#events.emit(name, data) })
    if (this.props.flames.length) this.#stepFlames()
    this.#flushSpawns()
    this.#rollSnowballs()
    this.#processSteam()
    // Défenseurs (v5.8) : navigation, esquives, réparations (voir ../ai/UnitDirector.js).
    if (this.settled) this.units.step()
    // Nuages et poison (v6.1).
    this.#stepClouds()
    this.#fireTick += WORLD.STEP_MS
    if (this.#fireTick >= 400) {
      this.#fireTick = 0
      this.#spreadFire()
    }
    this.#processExplosions()
    if (this.#armed && ++this.#pinTick >= WORLD.PIN_CHECK_EVERY) {
      this.#pinTick = 0
      this.#checkPinned()
      this.#checkKnockouts(WORLD.STEP_MS * WORLD.PIN_CHECK_EVERY)
    }
    if (++this.#supportTick >= WORLD.SUPPORT_CHECK_EVERY) {
      this.#supportTick = 0
      this.#checkSupports()
    }
    this.#cleanup()
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

  /**
   * Cible renversée (v6.1) : au bout de KNOCKOUT_MS à terre, elle perd une part
   * de ses points de vie (KNOCKDOWN_SHARE), puis se relève (UnitDirector) ; si
   * c'était de trop, elle est hors de combat.
   */
  #checkKnockouts(dtMs) {
    for (const t of this.#entities.values()) {
      if (t.kind !== 'target' || !t.alive || t.climbing) continue
      const tilt = Math.abs(Math.atan2(Math.sin(t.angle), Math.cos(t.angle)))
      t.downMs = tilt > WORLD.KNOCKOUT_ANGLE ? (t.downMs || 0) + dtMs : 0
      if (tilt <= WORLD.KNOCKOUT_ANGLE * 0.6) t.knockedDown = false
      if (t.downMs >= WORLD.KNOCKOUT_MS && !t.knockedDown) {
        t.knockedDown = true
        this.#hurt(t, t.maxHp * KNOCKDOWN_SHARE, 'knockout', 0, { knock: false })
      }
    }
  }

  /**
   * Cibles coincées. On place des points de contrôle juste au-dessus et de part
   * et d'autre de chaque cible (dans le repère du monde) :
   *  - un bloc qui occupe un point du dessus repose sur la cible → écrasée ;
   *  - des blocs qui occupent à la fois la gauche et la droite → prise en étau.
   */
  #checkPinned() {
    const blocks = this.filter((e) => e.kind === 'block' && e.alive).map((e) => e.body)
    if (!blocks.length) return
    const d = WORLD.PIN_PROBE
    // À l'échelle (v5.8), un défenseur longe la roche : il n'y est pas coincé.
    for (const t of this.filter((e) => e.kind === 'target' && e.alive && e.type !== 'ogre' && !e.climbing)) {
      const b = t.body.bounds
      const w = b.max.x - b.min.x
      const h = b.max.y - b.min.y
      const near = Query.region(blocks, { min: { x: b.min.x - d * 2, y: b.min.y - d * 2 }, max: { x: b.max.x + d * 2, y: b.max.y + d * 2 } })
      if (!near.length) continue
      const hit = (pts) => near.some((body) => pts.some((p) => Vertices.contains(body.vertices, p)))
      const top = [0.3, 0.5, 0.7].map((k) => ({ x: b.min.x + w * k, y: b.min.y - d }))
      const left = [0.35, 0.65].map((k) => ({ x: b.min.x - d, y: b.min.y + h * k }))
      const right = [0.35, 0.65].map((k) => ({ x: b.max.x + d, y: b.min.y + h * k }))
      const load = near.find((body) => top.some((p) => Vertices.contains(body.vertices, p)))
      if (load) {
        // Une charge assez légère (v6.1) : il la soulève et la rejette de côté (sonné,
        // il attend d'avoir repris ses esprits ; elle ne l'écrase pas pour autant).
        const e = this.#entityOf(load)
        // Un tablier sur sa charnière, une charge à sa corde : on ne les soulève pas.
        const liftable = e && e.mass <= t.pushCapacity && !e.hinged && !(e.tethered > 0) && !e.body.isStatic
        if (liftable) {
          if (t.ableAt(this.#time)) this.#push(t, e, null)
        } else t.kill('pinned')
      } else if (hit(left) && hit(right)) t.kill('squeezed')
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
      if (Math.hypot(c.x - x, c.y - y) <= radius + this.clouds.radiusAt(c, this.#time) * 0.6) this.#cloudBlast(c)
    }
    this.units.onBlast(x, y, radius)
    this.tethers.blast(x, y, radius, this.#time)
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
        if (falloff > 0.35) this.#heat(e, 5000)
      }
    }
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
      else if (e.frozenMs > 0) this.#steam(e)
      else e.damage((e.material === 'iron' ? 0.55 : 1.05) * e.maxHp, 'explosion')
      for (const near of this.queryRadius(e.x, top + 30, 60)) {
        if (near === e || near.kind === 'flyer' || near.kind === 'projectile') continue
        near.damage(near.kind === 'target' ? 999 : 160, 'explosion')
        this.#heat(near, 6000)
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
   * Flammes des ouvrages (v6.1) : un projectile qui traverse la colonne de feu
   * d'une forge s'enflamme (le givre, lui, y fond) ; le jet craché dans une
   * rafale met le feu à ce qu'il lèche (toutes les 0,3 s).
   */
  #stepFlames() {
    const jetTick = ++this.#flameTick >= 36
    if (jetTick) this.#flameTick = 0
    for (const e of this.#entities.values()) {
      if (!e.alive) continue
      if (e.kind === 'projectile') {
        if (e.spent || !this.props.flameAt(e.x, e.y, e.radius * 0.5)) continue
        if (e.frost) {
          e.frost = false
          this.#events.emit('steam', { x: e.x, y: e.y, radius: 30, entity: null })
        } else if (e.kindle()) this.#events.emit('fire:start', { entity: e })
        continue
      }
      if (!jetTick || e.kind === 'flyer' || e.burning > 0) continue
      const b = e.body.bounds
      const licked = this.props.flames.some((f) => f.jet && b.max.x >= f.x0 && b.min.x <= f.x1 && b.max.y >= f.y0 && b.min.y <= f.y1)
      if (licked) this.#heat(e, 5000)
    }
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
      if (ogre && this.#ogreReacts(ogre, ogre === a ? b : a, pair)) continue
      // Pavoisier (v5.8) : son pavois arrête les tirs tendus qui le frappent de face.
      const shield = a?.shield ? a : b?.shield ? b : null
      if (shield && this.#shieldReacts(shield, shield === a ? b : a, pair)) continue

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
      if (this.#armed && (a?.kind === 'target' || b?.kind === 'target')) this.#targetContact(a, b, rel, pair)

      // Premier contact d'un projectile : effets spéciaux (feu, givre, explosion).
      for (const [p, other] of [[a, b], [b, a]]) {
        // Botte de paille (v6.1) contre ce qui brûle : elle s'enflamme et devient un brandon.
        if (p?.kind === 'projectile' && p.soft && other && (other.burning > 0 || other.hot) && p.kindle()) this.#events.emit('fire:start', { entity: p })
        if (p && p.kind === 'projectile' && !p.hasImpacted && p.alive) {
          p.hasImpacted = true
          // Orbe d'orage et pot de poison (v6.1). Un tir chargé par l'orage décharge à l'impact.
          if (p.thunder || p.charged) this.#discharge(p, other, { hops: p.thunder ? THUNDER.HOPS + (p.charged ? this.worldWind.hops ?? 2 : 0) : this.worldWind.hops ?? 2, scale: p.thunder ? 1 : 0.6 })
          if (p.poison) {
            const c = this.clouds.spawn('poison', p.x, p.y, this.#time, { scale: p.fireFactor ?? 1 })
            this.#events.emit('cloud', { kind: 'poison', x: c.x, y: c.y, r: c.r, event: 'spawn' })
            // Un pot qui brûle (vent de braises, forge) : le gaz s'embrase aussitôt.
            if (p.ignites) this.#cloudBlast(c)
            p.kill('shatter')
          }
          if (p.ignites) p.heatMs = HOT_BALL_MS * p.fireFactor
          if (p.ignites && other) this.#heat(other, 7000)
          if (p.ignites) {
            for (const near of this.queryRadius(p.x, p.y, 95 * p.fireFactor)) {
              if (near !== p && near !== other) this.#heat(near, 6000)
            }
          }
          if (p.frost) this.#frostBurst(p)
          // Météore : le piqué s'achève en onde de choc.
          if (p.diving) this.#pendingExplosions.push({ at: this.#time, x: p.x, y: p.y, spec: { radius: 135, power: 10, damage: 900, source: p } })
          if (p.explodes) {
            this.#pendingExplosions.push({ at: this.#time, x: p.x, y: p.y, spec: { radius: 150 * p.blastFactor, power: 12 * Math.sqrt(p.blastFactor), damage: 800 * p.blastFactor, source: p } })
            p.kill('explosion')
          }
        } else if (p && p.kind === 'projectile' && p.hasImpacted && p.hot && other && (other.flammable || other.frozenMs > 0)) {
          // Boulet encore brûlant qui rebondit, roule ou retombe sur du bois, de la paille… ou sur de la glace.
          this.#heat(other, 6000)
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
        if (projectile.alive) this.#shatter(projectile)
      }
      if (energy < 1) continue

      const contact = pair.collision.supports[0] || bodyA.position
      // Percée : le bloc cède sous le choc, le projectile poursuit sa course.
      const struck = projectile && (a === projectile ? b : a)
      if (struck?.kind === 'block' && struck.alive && !struck.terrain && projectile.alive && this.#breach(projectile, struck, energy, projectile === a ? va : vb, pair, contact)) continue
      for (const [e, other] of [[a, b], [b, a]]) {
        // Les défenseurs ont leurs propres règles (#targetContact).
        if (!e || !e.alive || e.kind === 'target') continue
        e.receiveImpact(energy, other)
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

  /**
   * Feu au contact d'un objet : il s'enflamme… sauf s'il est gelé, auquel cas
   * il éclate en vapeur (voir #steam).
   * @returns {boolean} vrai si un feu ou une vapeur a été déclenché
   */
  #heat(e, ms) {
    if (!e || !e.alive) return false
    if (e.frozenMs > 0) {
      this.#steam(e)
      return true
    }
    if (e.ignite(ms)) {
      this.#events.emit('fire:start', { entity: e })
      return true
    }
    return false
  }

  /**
   * Givre à l'impact : tout ce qui est proche gèle (devient cassant). Ce qui
   * brûlait s'éteint dans un jet de vapeur brûlante.
   */
  #frostBurst(p) {
    const radius = FROST.RADIUS * (p.fireFactor ?? 1)
    this.#events.emit('frost', { x: p.x, y: p.y, radius })
    // Le givre fige les nuages (v6.1) : ils retombent en poussière gelée.
    for (const c of this.clouds.list) {
      if (Math.hypot(c.x - p.x, c.y - p.y) <= radius + c.r * 0.5) {
        this.clouds.remove(c)
        this.#events.emit('cloud', { kind: c.kind, x: c.x, y: c.y, r: c.r, event: 'freeze' })
      }
    }
    for (const e of this.queryRadius(p.x, p.y, radius)) {
      if (e === p || e.kind === 'projectile' || e.kind === 'flyer' || e.terrain) continue
      if (e.burning > 0) {
        e.burning = 0
        this.#scald(e.x, e.y, e)
      }
      e.freeze(FROST.MS)
    }
  }

  /**
   * Vapeur : le feu touche un objet gelé. Il dégèle d'un coup, le choc thermique
   * le fend (FROST.SHOCK de sa résistance), l'eau bouillante ébouillante les
   * défenseurs proches, et les blocs gelés voisins éclatent à leur tour.
   */
  #steam(e) {
    if (!e.alive || !(e.frozenMs > 0)) return
    e.frozenMs = 0
    e.burning = 0
    if (e.kind === 'block' && Number.isFinite(e.maxHp)) e.damage(e.maxHp * FROST.SHOCK, 'impact')
    this.#scald(e.x, e.y, e)
    const reach = Math.max(e.width, e.height) / 2 + 34
    for (const near of this.queryRadius(e.x, e.y, reach + 30)) {
      if (near !== e && near.frozenMs > 0 && near.kind !== 'projectile') this.#steamQueue.push({ e: near, at: this.#time + 90 })
    }
  }

  /** Nuage de vapeur et eau bouillante autour de (x, y). */
  #scald(x, y, source) {
    this.#events.emit('steam', { x, y, radius: FROST.STEAM_RADIUS, entity: source })
    if (!this.#armed) return
    for (const t of this.queryRadius(x, y, FROST.STEAM_RADIUS)) {
      if (t.kind === 'target' && t.alive) t.kill('scald')
    }
  }

  #processSteam() {
    if (!this.#steamQueue.length) return
    const due = this.#steamQueue.filter((s) => s.at <= this.#time)
    if (!due.length) return
    this.#steamQueue = this.#steamQueue.filter((s) => s.at > this.#time)
    for (const s of due) this.#steam(s.e)
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

  /**
   * L'ogre (v5.1) réagit à ce qui le heurte :
   *  - un projectile LÉGER (pierre, mitraille ; ni bombe, ni feu, ni givre, ni
   *    boulet lourd) est renvoyé d'un revers, sans lui faire de mal ;
   *  - un bloc qui lui tombe dessus est repoussé de côté (il ne meurt pas écrasé).
   * Gelé, il ne réagit plus. Un revers par OGRE_SWAT_MS.
   * @returns {boolean} vrai si le contact est entièrement traité ici
   */
  #ogreReacts(ogre, other, pair) {
    if (!ogre.alive || !other || !other.alive || ogre.frozenMs > 0 || this.#time < ogre.swatReady) return false
    if (other.kind === 'projectile') {
      if (other.explodes || other.ignites || other.frost || other.diving || other.mass >= BREACH_HEAVY_MASS) return false
      const v = Body.getVelocity(other.body)
      const side = Math.sign(other.x - ogre.x) || -1
      pair.isActive = false
      Body.setVelocity(other.body, { x: side * Math.max(5, Math.abs(v.x) * 0.75), y: -Math.max(4, Math.abs(v.y) * 0.45) })
      other.hasImpacted = true
      this.#swatted(ogre, 'swat', other)
      return true
    }
    if (other.kind === 'block' && !other.terrain && other.y < ogre.y - ogre.height * 0.25 && other.speed > 0.3) {
      const side = Math.sign(other.x - ogre.x) || 1
      pair.isActive = false
      Sleeping.set(other.body, false)
      Body.setVelocity(other.body, { x: side * Math.max(3, 9 / Math.sqrt(Math.max(1, other.mass / 20))), y: -2.5 })
      Body.setAngularVelocity(other.body, side * 0.08)
      this.#swatted(ogre, 'shove', other)
      return true
    }
    return false
  }

  /**
   * Pavois (v5.8) : un projectile léger (pierre, mitraille) qui frappe le
   * pavoisier DE FACE et de biais (moins de 50° sous l'horizontale) ricoche
   * sur le pavois. Un tir plongeant, un tir dans le dos, un boulet lourd, la
   * poudre, le feu ou le givre passent : il faut le prendre par le haut.
   * @returns {boolean} vrai si le choc est entièrement traité ici
   */
  #shieldReacts(bearer, other, pair) {
    if (!bearer.alive || bearer.frozenMs > 0 || other?.kind !== 'projectile' || !other.alive) return false
    if (other.explodes || other.ignites || other.frost || other.diving || other.mass >= BREACH_HEAVY_MASS) return false
    const v = Body.getVelocity(other.body)
    const front = bearer.facing || -1
    const fromFront = Math.sign(other.x - bearer.x) === front && Math.sign(v.x) === -front
    const flat = Math.abs(v.y) < Math.abs(v.x) * Math.tan((50 * Math.PI) / 180)
    if (!fromFront || !flat) return false
    pair.isActive = false
    Body.setVelocity(other.body, { x: front * Math.max(2, Math.abs(v.x) * 0.3), y: -Math.max(1.5, Math.abs(v.y) * 0.3) })
    other.hasImpacted = true
    this.#events.emit('unit', { kind: 'shieldBlock', entity: bearer, x: bearer.x + front * bearer.width * 0.5, y: bearer.y - bearer.height * 0.15 })
    return true
  }

  #swatted(ogre, kind, other) {
    ogre.swatAt = this.#time
    ogre.swatReady = this.#time + OGRE_SWAT_MS
    ogre.facing = Math.sign(other.x - ogre.x) || -1
    this.#events.emit('ogre', { kind, entity: ogre, other, x: ogre.x, y: ogre.y - ogre.height / 2 })
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
    else if (zone.kind === 'lava' && (e.kind === 'block' || e.kind === 'barrel') && e.flammable) this.#heat(e, 8000)
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
   * Nuages (v6.1) : ils dérivent au vent, rongent les défenseurs (le poison
   * agit encore POISON.LINGER_MS après qu'ils en sont sortis) et s'embrasent
   * au contact d'une flamme.
   */
  #stepClouds() {
    const time = this.#time
    if (this.clouds.size) {
      const targets = [...this.#entities.values()].filter((e) => e.kind === 'target' && e.alive)
      this.clouds.step(WORLD.STEP_MS, {
        time,
        // Dérive : le vent du moment à cet endroit (1 = vent de base maximal ≈ 1 px par image),
        // et la rafale d'un moulin, qui pousse fort (v6.1).
        drift: (x, y) => this.windField.at(x, y, time) + this.props.gustAt(x, y) * 2.2,
        targets,
        // Rien ne s'embrase avant le premier tir, et les miasmes des marais ne
        // craignent pas les torches des veilleurs : seul le feu du joueur les allume.
        flameNear: (x, y, r, kind) => this.#armed && this.#flameNear(x, y, r, { torches: kind !== 'miasma' }),
        blast: (c, r) => this.#cloudBlast(c, r),
        affect: (t, kind, dps, dtMs) => {
          if (!this.#armed) return
          if (kind === 'bees') {
            // Piqûres : des points de vie en moins, et il fuit en courant.
            t.damage(dps * (dtMs / 1000), 'sting')
            t.panicUntil = time + 1500
            return
          }
          const still = t.poisonUntil > time
          t.poisonDps = Math.max(still ? t.poisonDps ?? 0 : 0, dps)
          t.poisonUntil = time + POISON.LINGER_MS
        },
      })
    }
    // Le poison ronge ceux qui l'ont respiré, encore un peu après qu'ils en sont sortis.
    for (const t of this.#entities.values()) {
      if (t.kind !== 'target' || !t.alive || !(t.poisonUntil > time)) continue
      t.damage((t.poisonDps ?? POISON.DPS) * (WORLD.STEP_MS / 1000), 'poison')
    }
  }

  /** Ce qu'un ouvrage brisé libère (voir Props#destroyed). */
  #propDestroyed(e) {
    this.props.destroyed(e, {
      time: this.#time,
      winter: this.weather.winter === true,
      queryRadius: (x, y, r) => this.queryRadius(x, y, r),
      heat: (o, ms) => this.#heat(o, ms),
      scald: (x, y, source) => this.#scald(x, y, source),
      cloud: (kind, x, y) => {
        const c = this.clouds.spawn(kind, x, y, this.#time)
        this.#events.emit('cloud', { kind, x: c.x, y: c.y, r: c.r, event: 'spawn' })
      },
      emit: (name, data) => this.#events.emit(name, data),
    })
  }

  /** Une flamme dans ce disque ? (objet qui brûle, boulet ardent, forge ; torche d’un veilleur si `torches`) */
  #flameNear(x, y, r, { torches = true } = {}) {
    if (this.props.flameAt(x, y, r * 0.7)) return true
    const r2 = r * r
    for (const e of this.#entities.values()) {
      if (!e.alive) continue
      const hot = (e.kind === 'projectile' && e.hot) || (e.kind !== 'projectile' && e.burning > 0)
      if (hot && (e.x - x) ** 2 + (e.y - y) ** 2 <= r2) return true
      if (torches && e.kind === 'target' && e.torch && !e.torchDropped) {
        const tip = e.torchTip
        if ((tip.x - x) ** 2 + (tip.y - y) ** 2 <= r2) return true
      }
    }
    return false
  }

  /** Le nuage s'embrase (gaz, farine) : un souffle de sa taille, qui met le feu au bois. */
  #cloudBlast(c, r = this.clouds.radiusAt(c, this.#time)) {
    if (c.blasted) return
    c.blasted = true
    this.clouds.remove(c)
    // Un essaim ne s'embrase pas : la fumée le disperse.
    this.#events.emit('cloud', { kind: c.kind, x: c.x, y: c.y, r, event: c.kind === 'bees' ? 'disperse' : 'blast' })
    const spec = CLOUD_KINDS[c.kind]?.blast
    if (spec) this.#pendingExplosions.push({ at: this.#time, x: c.x, y: c.y, spec: { radius: r * 1.1, ...spec, source: null } })
  }

  /**
   * Orbe d'orage (v6.1, voir THUNDER) : la décharge frappe ce que l'orbe
   * touche, puis saute vers le défenseur le plus proche (au plus REACH px),
   * et ainsi de suite ; un bloc de fer la relaie sans compter comme un saut.
   * Elle fait sauter un baril, peut enflammer le bois, fait éclater la glace
   * en vapeur, et embrase les nuages qu'elle traverse.
   */
  #discharge(p, first, { hops: baseHops = THUNDER.HOPS, scale = 1 } = {}) {
    const wet = this.weather.wet === true
    const hops = baseHops + (wet ? THUNDER.RAIN_HOPS : 0)
    const reach = THUNDER.REACH * (wet ? THUNDER.RAIN_REACH : 1)
    if (first?.alive) {
      if (first.kind === 'barrel') first.kill('explosion')
      else if (first.frozenMs > 0 && first.kind !== 'target') this.#steam(first)
      else if (first.kind === 'block' && first.flammable && this.#rng.chance(0.45)) this.#heat(first, 5000)
    }
    const path = []
    const struck = new Set()
    const relays = new Set()
    let from = { x: p.x, y: p.y }
    let hop = 0
    for (let guard = 0; hop < hops && guard < 12; guard++) {
      let best = null
      let bestD = reach
      for (const e of this.#entities.values()) {
        if (e.kind !== 'target' || !e.alive || struck.has(e)) continue
        const d = Math.hypot(e.x - from.x, e.y - from.y)
        if (d < bestD) {
          bestD = d
          best = e
        }
      }
      if (!best) {
        // Relais : un bloc de fer à portée prolonge la décharge (trois au plus).
        let iron = null
        let ironD = reach
        for (const e of this.#entities.values()) {
          if (e.kind !== 'block' || e.material !== 'iron' || !e.alive || relays.has(e)) continue
          const d = Math.hypot(e.x - from.x, e.y - from.y)
          if (d < ironD) {
            ironD = d
            iron = e
          }
        }
        if (!iron || relays.size >= 3) break
        relays.add(iron)
        path.push({ x0: from.x, y0: from.y, x1: iron.x, y1: iron.y, relay: true })
        from = { x: iron.x, y: iron.y }
        continue
      }
      struck.add(best)
      path.push({ x0: from.x, y0: from.y, x1: best.x, y1: best.y - best.height * 0.2 })
      if (best.frozenMs > 0) this.#steam(best)
      // Trempé (pluie, citerne) : l'eau conduit, le coup porte plus fort.
      const soaked = wet || best.wetMs > 0
      const dmg = THUNDER.DAMAGE[Math.min(hop, THUNDER.DAMAGE.length - 1)] * TARGET_TYPES.soldier.hp * (THUNDER.CONDUCT[best.type] ?? 1) * (soaked ? 1.35 : 1) * scale
      if (this.#armed) this.#shock(best, dmg)
      from = { x: best.x, y: best.y }
      hop++
    }
    for (const seg of path) {
      for (const c of this.clouds.at((seg.x0 + seg.x1) / 2, (seg.y0 + seg.y1) / 2, this.#time)) this.#cloudBlast(c)
    }
    for (const c of this.clouds.at(p.x, p.y, this.#time)) this.#cloudBlast(c)
    this.#events.emit('thunder', { x: p.x, y: p.y, path })
  }

  /** Un tir givré éclate à l'impact (v6.1) : éclats de glace, ce qu'il touche est saisi par le froid. */
  #shatter(p) {
    p.kill('shatter')
    this.#events.emit('element', { kind: 'shatter', element: 'frost', x: p.x, y: p.y, entity: p })
    for (const e of this.queryRadius(p.x, p.y, 45)) {
      if (e !== p && e.kind !== 'projectile' && e.kind !== 'flyer' && !e.terrain) e.freeze(4000)
    }
  }

  /** Décharge électrique : des points de vie en moins, et sonné (il tressaute). */
  #shock(t, dmg) {
    const before = t.hp
    const died = t.damage(dmg, 'shock')
    if (t.alive) {
      t.stunUntil = Math.max(t.stunUntil, this.#time + THUNDER.STUN_MS)
      t.stunKind = 'shock'
    }
    this.#events.emit('hurt', { entity: t, amount: died ? before : Math.max(0, before - Math.max(0, t.hp)), cause: 'shock', lethal: died || !t.alive, x: t.x, y: t.y - t.height * 0.35, dir: 0 })
  }


  /**
   * Contact d'un défenseur (v6.1, voir FallingObjects.js), après le premier tir.
   * Celui qui va le plus vite frappe : un objet qui arrive sur le défenseur le
   * blesse (ou il le repousse, s'il est lent) ; un défenseur projeté contre un
   * obstacle immobile (sol, mur, roche) encaisse sa chute.
   */
  #targetContact(a, b, rel, pair) {
    if (rel <= WORLD.HIT.SAFE) return
    for (const [t, o] of [[a, b], [b, a]]) {
      if (t?.kind !== 'target' || !t.alive) continue
      // Défenseur contre défenseur, ou contre une créature volante : rien.
      if (o?.kind === 'target' || o?.kind === 'flyer') continue
      const striker = o && o.alive !== false && !o.body.isStatic && o.speed >= t.speed * 0.6
      if (striker) this.#struck(t, o, rel, pair)
      else this.#slam(t, rel)
    }
  }

  /** Un objet frappe un défenseur : il le repousse s'il le peut, sinon il encaisse. */
  #struck(t, o, rel, pair) {
    // Rejeté par un camarade il y a un instant : il ne blesse personne.
    if (this.#time - (o.pushedAt ?? -Infinity) < PUSHED_SAFE_MS) return
    const last = this.#struckAt.get(t)
    if (last && last.o === o && this.#time - last.at < RESTRIKE_MS) return
    this.#struckAt.set(t, { o, at: this.#time })
    if (canPush(t, o, rel, this.#time)) {
      this.#push(t, o, pair)
      return
    }
    let dmg = hitDamage(o, rel)
    // Tir élémentaire : il frappe mou, c'est l'élément qui agit (et on le voit).
    if (o.kind === 'projectile' && o.element) dmg = Math.min(dmg, t.maxHp * ELEMENT_HIT_CAP)
    if (dmg < 1) return
    const v = Body.getVelocity(o.body)
    this.#hurt(t, dmg, 'crush', Math.sign(t.x - o.x) || Math.sign(v.x) || 1)
  }

  /** Défenseur projeté contre un obstacle immobile, ou qui retombe : dégâts de chute. */
  #slam(t, rel) {
    const dmg = fallDamage(t, rel)
    if (dmg >= 1) this.#hurt(t, dmg, 'fall', 0, { knock: false })
  }

  /**
   * Blessure d'un défenseur : points de vie, puis (s'il tient debout) il est
   * repoussé dans le sens du coup et sonné un instant.
   * @param {number} dir sens du recul (-1, 0, 1)
   */
  #hurt(t, dmg, cause, dir, { knock = true } = {}) {
    const before = t.hp
    const lives = t.lives
    const died = t.damage(dmg, cause)
    const lost = before - Math.max(0, t.hp)
    if (!died && lost <= 0 && t.lives === lives) return
    this.#events.emit('hurt', { entity: t, amount: died ? before : lost > 0 ? lost : dmg, cause, lethal: died || !t.alive, x: t.x, y: t.y - t.height * 0.35, dir })
    if (died || !t.alive || t.lives !== lives) return
    t.stunUntil = Math.max(t.stunUntil, this.#time + WORLD.STAGGER_MS)
    t.stunKind = 'hit'
    if (!knock || !dir) return
    const kick = Math.min(WORLD.KNOCK_MAX, WORLD.KNOCK * Math.min(1, dmg / t.maxHp))
    if (kick < 0.3) return
    Sleeping.set(t.body, false)
    const v = Body.getVelocity(t.body)
    Body.setVelocity(t.body, { x: v.x + dir * kick, y: Math.min(v.y, 0) - kick * 0.45 })
  }

  /**
   * Le défenseur repousse un objet lent (v6.1) : il le rejette de côté (et
   * vers le haut s'il lui tombait dessus), sans dégâts ; l'objet ne blessera
   * personne pendant PUSHED_SAFE_MS.
   * @param {Matter.Pair | null} pair contact à ignorer pour ce pas
   */
  #push(t, o, pair) {
    if (pair) pair.isActive = false
    const dir = Math.sign(o.x - t.x) || t.facing || 1
    const above = o.y < t.y - t.height * 0.25
    const k = WORLD.PUSH.SHOVE / Math.sqrt(Math.max(1, o.mass / 8))
    const v = Body.getVelocity(o.body)
    Sleeping.set(o.body, false)
    Body.setVelocity(o.body, { x: dir * Math.max(Math.abs(v.x) * 0.4, k), y: above ? Math.min(v.y * 0.2, -k * 0.55) : Math.min(v.y, -k * 0.2) })
    Body.setAngularVelocity(o.body, dir * Math.min(0.12, 0.6 / Math.sqrt(Math.max(1, o.mass))))
    o.pushedAt = this.#time
    t.pushReady = this.#time + WORLD.PUSH.COOLDOWN_MS
    t.pushAt = this.#time
    t.facing = dir
    this.#events.emit('unit', { kind: 'push', entity: t, other: o, x: (t.x + o.x) / 2, y: Math.min(t.y - t.height * 0.3, o.y) })
  }

  /**
   * Contacts prolongés : un objet déjà au contact qui se met à bouger frappe
   * aussi ; s'il presse doucement, le défenseur le repousse.
   */
  #handleActiveContacts(pairs) {
    if (!this.#armed) return
    for (const pair of pairs) {
      const a = this.#entityOf(pair.bodyA)
      const b = this.#entityOf(pair.bodyB)
      if (!a || !b || (a.kind !== 'target' && b.kind !== 'target')) continue
      const t = a.kind === 'target' ? a : b
      const o = t === a ? b : a
      if (!t.alive || !o.alive || o.kind === 'target' || o.kind === 'flyer' || o.speed < 0.6) continue
      const va = Body.getVelocity(pair.bodyA.parent || pair.bodyA)
      const vb = Body.getVelocity(pair.bodyB.parent || pair.bodyB)
      const n = pair.collision.normal
      const rel = Math.abs((va.x - vb.x) * n.x + (va.y - vb.y) * n.y)
      if (rel <= WORLD.HIT.SAFE) {
        // Il presse doucement : le défenseur le repousse, s'il le peut.
        if (o.speed <= WORLD.PUSH.SPEED && this.#time - (o.pushedAt ?? -Infinity) >= PUSHED_SAFE_MS && canPush(t, o, o.speed, this.#time)) this.#push(t, o, pair)
        continue
      }
      if (o.speed >= t.speed * 0.6) this.#struck(t, o, rel, pair)
    }
  }


  /** Réveille les corps proches d'un point (appui disparu, choc). */
  #wakeAround(x, y, radius) {
    for (const e of this.queryRadius(x, y, radius)) Sleeping.set(e.body, false)
  }

  /**
   * Propagation du feu. En Difficile, le vent l'attise : sous le vent, le feu
   * va plus loin et prend plus facilement ; contre le vent, il peine.
   */
  #spreadFire() {
    // Boulet brûlant immobilisé contre (ou sous) un matériau inflammable.
    for (const p of this.filter((e) => e.kind === 'projectile' && e.hasImpacted && e.hot)) {
      for (const near of this.queryRadius(p.x, p.y, p.radius + 22)) {
        if (near === p || near.burning !== 0) continue
        if (near.frozenMs > 0) this.#heat(near, 6000)
        else if (near.flammable && this.#rng.chance(0.7)) this.#heat(near, 6000)
      }
    }
    const burning = this.filter((e) => e.burning > 0 && e.alive && e.kind !== 'projectile')
    // Forteresse (v6.1) : le vent porte les braises, quelle que soit la difficulté.
    const embers = this.worldWind.fireReach ?? 0
    const base = this.windField.profile.fire || embers ? this.windField.base : 0
    for (const src of burning) {
      // La rafale d'un moulin (v6.1) attise le feu et le pousse dans son sens.
      const wind = Math.max(-1.5, Math.min(1.5, base + this.props.gustAt(src.x, src.y) * 1.5))
      const reach = Math.max(src.width, src.height) / 2 + 26 + Math.abs(wind) * 45 * (embers || 1)
      for (const near of this.queryRadius(src.x, src.y, reach + 30)) {
        // Un objet gelé au contact des flammes éclate en vapeur.
        if (near !== src && near.frozenMs > 0 && near.kind !== 'projectile' && Math.hypot(near.x - src.x, near.y - src.y) <= reach) {
          this.#heat(near, 0)
          continue
        }
        if (near === src || !near.flammable || near.burning !== 0) continue
        let chance = near.catchChance ?? 0.3
        if (wind !== 0) {
          const downwind = Math.sign(near.x - src.x) === Math.sign(wind)
          chance = downwind ? Math.min(0.95, chance * (1 + Math.abs(wind) * 1.4)) : chance * (1 - Math.abs(wind) * 0.6)
          // Contre le vent, la portée habituelle seulement.
          if (!downwind && Math.hypot(near.x - src.x, near.y - src.y) > Math.max(src.width, src.height) / 2 + 56) continue
        }
        if (this.#rng.chance(chance)) this.#heat(near, 5500)
      }
    }
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
      const out = e.y > WORLD.BOTTOM + WORLD.KILL_MARGIN || e.x < this.leftLimit - WORLD.KILL_MARGIN || e.x > WORLD.WIDTH + WORLD.KILL_MARGIN
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
          if (e.prop) this.#propDestroyed(e)
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
