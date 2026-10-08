import Matter from 'matter-js'
import { WindField, WIND_PROFILES, windageOf } from './WindField.js'
import { WORLD, CATEGORY } from './constants.js'
import { Projectile } from '../entities/Projectile.js'
import { SeededRandom } from '../../core/utils/SeededRandom.js'
import { StructuralIntegrity } from './StructuralIntegrity.js'
import { TerrainZones, TERRAIN } from './Terrain.js'
import { Block } from '../entities/Block.js'
import { FROST } from '../entities/catalog.js'

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
 *   projectile:spent { entity }           projectile:split { entity }
 *   structure:collapse { entity, loads }  (mur porteur qui cède)
 *
 * Règles de jeu physiques :
 *  - une cible touchée par un bloc en mouvement (après le premier tir) meurt écrasée ;
 *  - une cible coincée (bloc posé sur elle, ou prise entre deux blocs) meurt aussi :
 *    un niveau ne peut jamais rester bloqué avec une cible emmurée ;
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

/** Rondes (v5.1) : vitesse de marche (px par pas à 60 Hz) et délai entre deux revers de l'ogre (ms). */
export const PATROL_SPEED = 0.55
export const OGRE_SWAT_MS = 900

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
    return this.#time >= WORLD.SETTLE_MS
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
    Engine.update(this.engine, WORLD.STEP_MS)
    this.#time += WORLD.STEP_MS
    for (const e of this.#entities.values()) e.update(WORLD.STEP_MS)
    this.#flushSpawns()
    this.#rollSnowballs()
    this.#processSteam()
    if (this.settled) this.#patrol()
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
      if (!e.alive || !e.body.isSleeping) continue
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

  /** Cible renversée trop longtemps : hors de combat. */
  #checkKnockouts(dtMs) {
    for (const t of this.#entities.values()) {
      if (t.kind !== 'target' || !t.alive) continue
      const tilt = Math.abs(Math.atan2(Math.sin(t.angle), Math.cos(t.angle)))
      t.downMs = tilt > WORLD.KNOCKOUT_ANGLE ? (t.downMs || 0) + dtMs : 0
      if (t.downMs >= WORLD.KNOCKOUT_MS) t.kill('knockout')
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
    for (const t of this.filter((e) => e.kind === 'target' && e.alive && e.type !== 'ogre')) {
      const b = t.body.bounds
      const w = b.max.x - b.min.x
      const h = b.max.y - b.min.y
      const near = Query.region(blocks, { min: { x: b.min.x - d * 2, y: b.min.y - d * 2 }, max: { x: b.max.x + d * 2, y: b.max.y + d * 2 } })
      if (!near.length) continue
      const hit = (pts) => near.some((body) => pts.some((p) => Vertices.contains(body.vertices, p)))
      const top = [0.3, 0.5, 0.7].map((k) => ({ x: b.min.x + w * k, y: b.min.y - d }))
      const left = [0.35, 0.65].map((k) => ({ x: b.min.x - d, y: b.min.y + h * k }))
      const right = [0.35, 0.65].map((k) => ({ x: b.max.x + d, y: b.min.y + h * k }))
      if (hit(top)) t.kill('pinned')
      else if (hit(left) && hit(right)) t.kill('squeezed')
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
    if (field.base === 0) return
    for (const e of this.#entities.values()) {
      if (e.kind !== 'projectile' || e.hasImpacted) continue
      e.windage ??= windageOf(e)
      e.body.force.x += e.body.mass * field.accel(e.x, e.y, this.#time, e.windage)
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

      // Premier contact d'un projectile : effets spéciaux (feu, givre, explosion).
      for (const [p, other] of [[a, b], [b, a]]) {
        if (p && p.kind === 'projectile' && !p.hasImpacted && p.alive) {
          p.hasImpacted = true
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

      this.#checkCrush(a, b, rel)
      // Chute : une cible qui retombe lourdement (sur le sol ou un bloc) meurt.
      if (this.#armed && rel >= WORLD.TARGET_FALL_SPEED) {
        for (const [t, o] of [[a, b], [b, a]]) {
          if (t?.kind === 'target' && t.alive && (!o || o.kind === 'block') && rel >= WORLD.TARGET_FALL_SPEED * Math.sqrt(t.toughness ?? 1) && t.speed >= WORLD.TARGET_FALL_SPEED * 0.8) t.kill('fall')
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
      if (energy < 1) continue

      const contact = pair.collision.supports[0] || bodyA.position
      // Percée : le bloc cède sous le choc, le projectile poursuit sa course.
      const struck = projectile && (a === projectile ? b : a)
      if (struck?.kind === 'block' && struck.alive && !struck.terrain && projectile.alive && this.#breach(projectile, struck, energy, projectile === a ? va : vb, pair, contact)) continue
      for (const [e, other] of [[a, b], [b, a]]) {
        if (!e || !e.alive) continue
        e.receiveImpact(energy, other)
        if (energy > 8) {
          this.#events.emit('impact', { entity: e, energy, x: contact.x, y: contact.y, material: e.material || e.kind })
        }
      }

      // Projectile contre mur porteur : le mur peut céder et entraîner les toits.
      const hitBlock = projectile && (a === projectile ? b : a)
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

  /**
   * Rondes : chaque défenseur qui patrouille marche à petite vitesse, debout,
   * et fait demi-tour au bout de sa ronde, devant un mur ou un objet, au bord
   * du vide, ou au bord d'un lac et de la lave. Gelé, renversé ou en l'air, il s'arrête.
   */
  #patrol() {
    for (const t of this.#entities.values()) {
      if (t.kind !== 'target' || !t.alive || !(t.patrol > 0)) continue
      const upright = Math.abs(Math.atan2(Math.sin(t.angle), Math.cos(t.angle))) < 0.25
      const v = Body.getVelocity(t.body)
      if (t.frozenMs > 0 || !upright || Math.abs(v.y) > 0.6 || t.burning > 0) {
        this.#stopWalking(t)
        continue
      }
      const dir = t.facing
      const halfW = t.width / 2
      const feet = t.y + t.height / 2
      const ahead = t.x + dir * (halfW + 7)
      const out = Math.abs(t.x + dir * 2 - t.home) > t.patrol
      const wall = this.#blocked(ahead, t.y, t) || this.#blocked(ahead, t.y - t.height * 0.3, t)
      const floor = feet >= WORLD.GROUND_Y - 3 ? !this.terrain.at(ahead) || this.terrain.at(ahead).kind === 'snow' : this.#blocked(ahead, feet + 6, t)
      if (out || wall || !floor) {
        t.facing = -dir
        Body.setVelocity(t.body, { x: 0, y: v.y })
        this.#stopWalking(t)
        continue
      }
      const speed = PATROL_SPEED / Math.sqrt(t.toughness ?? 1)
      Sleeping.set(t.body, false)
      // En marche, presque sans frottement : le défenseur n'entraîne pas le
      // plancher sous ses pas (sinon un étage posé sur des piliers glisserait).
      t.body.friction = 0.01
      t.body.frictionStatic = 0.05
      Body.setVelocity(t.body, { x: dir * speed, y: v.y })
      Body.setAngularVelocity(t.body, 0)
      t.walking = true
    }
  }

  #stopWalking(t) {
    if (!t.walking) return
    t.walking = false
    t.body.friction = 0.9
    t.body.frictionStatic = 1.5
  }

  /** Un bloc, un baril ou un autre défenseur occupe-t-il ce point ? */
  #blocked(x, y, self) {
    for (const e of this.#entities.values()) {
      if (e === self || !e.alive || (e.kind !== 'block' && e.kind !== 'barrel' && e.kind !== 'target')) continue
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
   * Personnages fragiles : la moindre collision avec un objet en mouvement tue.
   * Désactivé avant le premier tir (la structure se met en place).
   */
  #checkCrush(a, b, rel) {
    if (!this.#armed) return
    const target = a?.kind === 'target' ? a : b?.kind === 'target' ? b : null
    if (!target || !target.alive) return
    const other = target === a ? b : a
    if (!other || other.kind === 'target' || !other.alive) return
    const tough = target.toughness ?? 1
    if (rel < WORLD.CONTACT_KILL_REL * tough) return
    // L'objet qui touche bouge, ou c'est la cible qui est projetée contre lui.
    if (other.speed >= WORLD.CONTACT_KILL_SPEED * tough || target.speed >= WORLD.CONTACT_KILL_SPEED * 3 * tough) target.kill('crush')
  }

  /** Contacts prolongés : un objet déjà au contact qui se met à bouger tue aussi. */
  #handleActiveContacts(pairs) {
    if (!this.#armed) return
    for (const pair of pairs) {
      const a = this.#entityOf(pair.bodyA)
      const b = this.#entityOf(pair.bodyB)
      if (!a || !b || (a.kind !== 'target' && b.kind !== 'target')) continue
      const other = a.kind === 'target' ? b : a
      if (other.kind === 'target' || other.speed < WORLD.CONTACT_KILL_SPEED * 2) continue
      const va = Body.getVelocity(pair.bodyA.parent || pair.bodyA)
      const vb = Body.getVelocity(pair.bodyB.parent || pair.bodyB)
      const n = pair.collision.normal
      const rel = Math.abs((va.x - vb.x) * n.x + (va.y - vb.y) * n.y)
      this.#checkCrush(a, b, rel)
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
    const wind = this.windField.profile.fire ? this.windField.base : 0
    for (const src of burning) {
      const reach = Math.max(src.width, src.height) / 2 + 26 + Math.abs(wind) * 45
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
        }
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
