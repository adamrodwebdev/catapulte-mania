import Matter from 'matter-js'
import { WindField, WIND_PROFILES, windageOf } from './WindField.js'
import { WORLD, CATEGORY } from './constants.js'
import { Guard } from '../../core/utils/Guard.js'
import { Projectile } from '../entities/Projectile.js'
import { SeededRandom } from '../../core/utils/SeededRandom.js'
import { StructuralIntegrity } from './StructuralIntegrity.js'

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

  /**
   * @param {import('../../core/utils/EventBus.js').EventBus} events
   * @param {{ wind?: number, seed?: number, windProfile?: object }} [opts] wind ∈ [-1, 1] ;
   *   graine du hasard (feu, éclats, rafales) ; profil de vent de la difficulté
   */
  constructor(events, { wind = 0, seed = 1, windProfile = WIND_PROFILES.normal } = {}) {
    this.#events = events
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
    for (const t of this.filter((e) => e.kind === 'target' && e.alive)) {
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
      if (!e.body.isSleeping && e.speed > threshold) return false
    }
    return this.#pendingExplosions.length === 0
  }

  /** Entités dont le centre est dans le rayon donné. */
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
      Sleeping.set(e.body, false)
      const v = Body.getVelocity(e.body)
      const kick = (power * falloff) / Math.sqrt(Math.max(0.5, e.mass))
      Body.setVelocity(e.body, { x: v.x + (dx / (d || 1)) * kick, y: v.y + (dy / (d || 1)) * kick - kick * 0.35 })
      Body.setAngularVelocity(e.body, e.body.angularVelocity + (this.#rng.next() - 0.5) * 0.2 * falloff)
      if (e.kind !== 'projectile') {
        e.damage(damage * falloff, 'explosion')
        if (falloff > 0.35 && e.ignite(5000)) this.#events.emit('fire:start', { entity: e })
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
      if (e.kind === 'projectile') continue
      Sleeping.set(e.body, false)
      const v = Body.getVelocity(e.body)
      const k = intensity * (2.4 + this.#rng.range(0, 1.6)) * (e.y < WORLD.GROUND_Y - 150 ? 1.4 : 1)
      Body.setVelocity(e.body, { x: v.x + (this.#rng.next() < 0.5 ? -k : k), y: v.y - k * 0.6 })
      e.damage(e.maxHp * 0.12 * intensity, 'impact')
    }
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
    const field = this.windField
    if (field.base === 0) return
    for (const e of this.#entities.values()) {
      if (e.kind !== 'projectile' || e.hasImpacted) continue
      e.windage ??= windageOf(e)
      e.body.force.x += e.body.mass * field.accel(e.x, e.y, this.#time, e.windage)
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

      // Premier contact d'un projectile : effets spéciaux (feu, explosion).
      for (const [p, other] of [[a, b], [b, a]]) {
        if (p && p.kind === 'projectile' && !p.hasImpacted && p.alive) {
          p.hasImpacted = true
          if (p.ignites && other && other.ignite(7000)) this.#events.emit('fire:start', { entity: other })
          if (p.ignites) {
            for (const near of this.queryRadius(p.x, p.y, 95 * p.fireFactor)) {
              if (near !== p && near.ignite(6000)) this.#events.emit('fire:start', { entity: near })
            }
          }
          if (p.explodes) {
            this.#pendingExplosions.push({ at: this.#time, x: p.x, y: p.y, spec: { radius: 150 * p.blastFactor, power: 12 * Math.sqrt(p.blastFactor), damage: 800 * p.blastFactor, source: p } })
            p.kill('explosion')
          }
        }
      }

      this.#checkCrush(a, b, rel)
      // Chute : une cible qui retombe lourdement (sur le sol ou un bloc) meurt.
      if (this.#armed && rel >= WORLD.TARGET_FALL_SPEED) {
        for (const [t, o] of [[a, b], [b, a]]) {
          if (t?.kind === 'target' && t.alive && (!o || o.kind === 'block') && t.speed >= WORLD.TARGET_FALL_SPEED * 0.8) t.kill('fall')
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
      for (const [e, other] of [[a, b], [b, a]]) {
        if (!e || !e.alive) continue
        e.receiveImpact(energy, other)
        if (energy > 8) {
          this.#events.emit('impact', { entity: e, energy, x: contact.x, y: contact.y, material: e.material || e.kind })
        }
      }

      // Projectile contre mur porteur : le mur peut céder et entraîner les toits.
      const hitBlock = projectile && (a === projectile ? b : a)
      if (hitBlock?.kind === 'block' && hitBlock.alive) {
        const loads = this.structure.onProjectileHit(hitBlock, energy * (hitBlock.armor ?? 1), Body.getVelocity(projectile.body), n)
        if (loads.length) this.#events.emit('structure:collapse', { entity: hitBlock, loads })
      }
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
    if (rel < WORLD.CONTACT_KILL_REL) return
    // L'objet qui touche bouge, ou c'est la cible qui est projetée contre lui.
    if (other.speed >= WORLD.CONTACT_KILL_SPEED || target.speed >= WORLD.CONTACT_KILL_SPEED * 3) target.kill('crush')
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
    const burning = this.filter((e) => e.burning > 0 && e.alive && e.kind !== 'projectile')
    const wind = this.windField.profile.fire ? this.windField.base : 0
    for (const src of burning) {
      const reach = Math.max(src.width, src.height) / 2 + 26 + Math.abs(wind) * 45
      for (const near of this.queryRadius(src.x, src.y, reach + 30)) {
        if (near === src || !near.flammable || near.burning !== 0) continue
        let chance = near.catchChance ?? 0.3
        if (wind !== 0) {
          const downwind = Math.sign(near.x - src.x) === Math.sign(wind)
          chance = downwind ? Math.min(0.95, chance * (1 + Math.abs(wind) * 1.4)) : chance * (1 - Math.abs(wind) * 0.6)
          // Contre le vent, la portée habituelle seulement.
          if (!downwind && Math.hypot(near.x - src.x, near.y - src.y) > Math.max(src.width, src.height) / 2 + 56) continue
        }
        if (this.#rng.chance(chance) && near.ignite(5500)) this.#events.emit('fire:start', { entity: near })
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
      const out = e.y > WORLD.BOTTOM + WORLD.KILL_MARGIN || e.x < -WORLD.KILL_MARGIN || e.x > WORLD.WIDTH + WORLD.KILL_MARGIN
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
