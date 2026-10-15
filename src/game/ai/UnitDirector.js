import Matter from 'matter-js'
import { CATEGORY, WORLD } from '../physics/constants.js'
import { NavGraph } from './NavGraph.js'
import { Perception } from './Perception.js'
import { UnitBrain, REPAIR } from './UnitBrain.js'

const { Body, Sleeping } = Matter

/**
 * Chef d'orchestre des défenseurs (v5.8) : remplace l'ancienne ronde
 * (aller-retour aveugle) par une vraie navigation.
 *
 * À chaque pas de simulation, une fois la structure en place :
 *  1. reconstruit le graphe de navigation si la structure a bougé (NavGraph) ;
 *  2. observe le ciel (Perception) et repère les feux et les blocs abîmés ;
 *  3. fait penser et marcher chaque défenseur (UnitBrain → Pathfinder → Steering) ;
 *  4. applique les capacités de groupe : l'étendard galvanise les défenseurs
 *     proches, la torche d'un veilleur qui tombe met le feu.
 *
 * Il ne touche au monde que par le « port » que lui donne le PhysicsWorld
 * (incendier, détecter un obstacle, émettre un événement) : pas d'accès aux
 * détails internes de la physique.
 */

/** Pas entre deux contrôles de la structure (reconstruction du graphe si elle a bougé). */
const NAV_CHECK_EVERY = 15
/** Rayon de l'étendard et bonus de résistance qu'il donne. */
export const BANNER = Object.freeze({ RADIUS: 240, BOOST: 1.7 })
/** Torche lâchée : rayon dans lequel le bois et la poudre prennent feu. */
export const TORCH = Object.freeze({ RADIUS: 80, BURN_MS: 7000 })
/**
 * Ouvrages (v5.8) : temps de construction (ms de vol des tirs ; le sapeur va
 * deux fois plus vite), vitesse d'escalade (px par pas), largeur de prise
 * d'une échelle (un projectile qui passe plus près la renverse), et poussée
 * qui jette le grimpeur loin de la paroi quand l'échelle bascule (px par pas,
 * sous CONTACT_KILL_SPEED × 3 : la chute est visible avant l'impact).
 */
export const WORKS_TIMING = Object.freeze({ BUILD_MS: { bridge: 4000, ladder: 3000 }, CLIMB_SPEED: 0.55, LADDER_HIT: 12, FALL_PUSH: { x: 1.1, y: 0.7 } })
/** Délai (ms) avant qu'un pont commandé soit bien posé dans le monde. */
const BRIDGE_SPAWN_MS = 500
/** Pillard qui se relève : rotation vers la verticale, par pas de simulation (≈ 1,4 rad/s). */
const GET_UP_RATE = 0.012
/** Calme (le sapeur se met au travail) : délai après le dernier projectile (ms). */
const CALM_AFTER_MS = 700
/** Pas entre deux relevés du terrain partagés par les cerveaux. */
const SHARED_EVERY = 4

/** Distance d'un point à un itinéraire (suite de segments). */
function distToRoute(route, x, y) {
  let best = Infinity
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]
    const b = route[i]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy || 1
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2))
    best = Math.min(best, Math.hypot(x - (a.x + dx * t), y - (a.y + dy * t)))
  }
  return best
}

/** Triangle posé pointe en haut (talus, montagne, toit) : pointe et base, pour la navigation. */
function triangleOf(e) {
  if (e.shape !== 'triangle' || Math.abs(Math.sin(e.angle)) > 0.05) return undefined
  const v = e.body.vertices
  if (v.length !== 3) return undefined
  const sorted = [...v].sort((p, q) => p.y - q.y)
  const apex = sorted[0]
  const base = sorted.slice(1)
  return { ax: apex.x, ay: apex.y, bx0: Math.min(base[0].x, base[1].x), bx1: Math.max(base[0].x, base[1].x), by: Math.max(base[0].y, base[1].y) }
}

const spanKey = (link) => `${Math.round(link.span.x0)}:${Math.round(link.span.x1)}`

export class UnitDirector {
  /** @type {NavGraph | null} */
  nav = null
  perception = new Perception()
  /** @type {Map<import('../entities/Target.js').Target, UnitBrain>} */
  #brains = new Map()
  #port
  #signature = null
  /** Version du graphe : change à chaque reconstruction (les numéros de corniche aussi). */
  #navVersion = 0
  #steps = 0
  #lastProjectileAt = -Infinity
  /** Dernier relevé du terrain (voir #survey). */
  #shared = null
  /** Échelles dressées (v5.8) : { route, x0, y0, x1, y1 }. */
  #ladders = []
  /** Chantiers en cours : défenseur → { link, done, at }. */
  #jobs = new Map()
  /** Ponts bâtis : portée → instant de la construction (un seul pont debout par portée). */
  #bridges = new Map()
  /** Engins du joueur que les pillards peuvent attaquer (fourni par la partie). */
  #engines = () => []
  /** Vrai pendant le vol des tirs : les pillards avancent (fixé par la partie). */
  marching = false
  /** Défenseurs au contact du sol pendant ce pas (vitesse appliquée), pour l'arrêt propre. */
  #vx = new WeakMap()

  /**
   * @param {object} port
   * @param {() => Iterable<any>} port.entities
   * @param {() => number} port.time
   * @param {() => { x0: number, x1: number }[]} port.hazards
   * @param {() => number} port.hazardsVersion compteur de modifications du terrain
   * @param {number} port.groundY
   * @param {number} port.width
   * @param {(x: number, y: number, self: any) => boolean} port.blockedAt
   * @param {(e: any, ms: number) => void} port.heat
   * @param {(name: string, data: object) => void} port.emit
   * @param {() => boolean} port.armed premier tir parti (les pillards chargent)
   * @param {() => number} [port.left] bord gauche praticable (l'engin peut être en retrait)
   */
  constructor(port) {
    this.#port = port
  }

  /**
   * Engins du joueur, pour les pillards (v5.8).
   * @param {() => { x: number, y: number, dir: number, front: number }[]} provider
   */
  setEngines(provider) {
    this.#engines = typeof provider === 'function' ? provider : () => []
  }

  /**
   * Ouvrages pour le rendu : échelles dressées, et chantiers en cours (fantôme
   * qui se construit, avec son avancement de 0 à 1).
   */
  get works() {
    const out = this.#ladders.map((l) => ({ kind: 'ladder', route: l.route, progress: 1 }))
    for (const [u, job] of this.#jobs) {
      if (!u.alive) continue
      const k = job.link.kind
      out.push({ kind: k, route: job.link.route, span: job.link.span, progress: Math.min(1, job.done / WORKS_TIMING.BUILD_MS[k]), building: true })
    }
    return out
  }

  /** Une explosion renverse les échelles qu'elle touche (v5.8). */
  onBlast(x, y, radius) {
    for (const l of [...this.#ladders]) if (distToRoute(l.route, x, y) <= radius) this.#dropLadder(l)
  }

  /** Pillards en route ou à l'assaut (pour l'interface). */
  get raiders() {
    let n = 0
    for (const [u, b] of this.#brains) if (u.alive && b.raiding) n++
    return n
  }

  /** Cerveau d'un défenseur (tests, rendu). */
  brainOf(unit) {
    return this.#brains.get(unit) ?? null
  }

  /** Un pas de simulation (structure en place). */
  step() {
    const port = this.#port
    // Un seul passage sur les entités : défenseurs, projectiles, feux.
    const units = []
    const flying = []
    const fires = []
    let shooting = false
    for (const e of port.entities()) {
      if (e.kind === 'target') {
        if (e.alive) units.push(e)
      } else if (e.kind === 'projectile') {
        if (!e.alive) continue
        shooting = true
        if (!e.hasImpacted) flying.push(e)
      } else if (e.alive && e.burning > 0) fires.push(e)
    }
    for (const u of units) if (!this.#brains.has(u)) this.#brains.set(u, new UnitBrain(u, this.#brains.size))
    const time = port.time()
    // Un projectile qui passe sur une échelle la renverse (v5.8).
    if (this.#ladders.length) {
      for (const p of flying) {
        for (const l of [...this.#ladders]) if (distToRoute(l.route, p.x, p.y) <= (p.radius ?? 16) + WORKS_TIMING.LADDER_HIT) this.#dropLadder(l, p)
      }
    }
    if (this.#steps % NAV_CHECK_EVERY === 0 || !this.nav) this.#refreshNav()
    this.perception.observe(flying)
    if (shooting) this.#lastProjectileAt = time
    if (this.#steps % 10 === 0) this.#banners(units)
    // Ce qui change lentement (qui est sur quelle corniche, feux, blocs abîmés) : tous les 4 pas.
    if (this.#steps % SHARED_EVERY === 0 || !this.#shared) this.#shared = this.#survey(units, fires, flying.length > 0 || shooting, time)
    this.#steps++
    const ctx = this.#ctx
    ctx.nav = this.nav
    ctx.navVersion = this.#navVersion
    ctx.time = time
    ctx.threatened = flying.length > 0
    ctx.marching = this.marching
    ctx.armed = port.armed()
    ctx.engines = this.#engines()
    for (const u of units) this.#move(u, ctx)
  }

  /* ---------- Navigation ---------- */

  #refreshNav() {
    const solids = []
    let sig = 0
    for (const e of this.#port.entities()) {
      if (!e.alive || (e.kind !== 'block' && e.kind !== 'barrel')) continue
      const b = e.body.bounds
      // Posé à plat : rectangle à 0°, 90° ou 180° près (|sin 2θ| petit).
      const flat = e.kind === 'block' && e.shape !== 'triangle' && Math.abs(Math.sin(2 * e.angle)) < 0.06
      solids.push({ minX: b.min.x, maxX: b.max.x, minY: b.min.y, maxY: b.max.y, flat, terrain: Boolean(e.terrain), tri: triangleOf(e), entity: e })
      // Signature grossière (au demi-pixel près, les blocs « respirent ») : on ne
      // reconstruit le graphe que si la structure a vraiment bougé.
      sig = (sig * 31 + Math.round(b.min.x / 6) * 7 + Math.round(b.min.y / 6) + (flat ? 1 : 0)) % 2147483647
    }
    sig = (sig * 31 + this.#port.hazardsVersion()) % 2147483647
    sig = (sig * 31 + this.#ladders.length * 977) % 2147483647
    this.solids = solids
    if (this.nav && sig === this.#signature) return
    this.#signature = sig
    this.#navVersion++
    this.nav = NavGraph.build({
      solids,
      groundY: this.#port.groundY,
      hazards: this.#port.hazards(),
      left: this.#port.left?.() ?? -300,
      right: this.#port.width + 300,
      works: true,
      ladders: this.#ladders,
    })
  }

  /* ---------- Contexte partagé par les cerveaux ---------- */

  /** Relevé du terrain (tous les SHARED_EVERY pas) : corniches occupées, feux, blocs à réparer. */
  #survey(units, fires, busy, time) {
    const nav = this.nav
    const byLedge = new Map()
    for (const u of units) {
      const l = nav.ledgeAt(u.x, u.y + u.height / 2)
      if (!l) continue
      if (!byLedge.has(l.id)) byLedge.set(l.id, [])
      byLedge.get(l.id).push(u)
    }
    const calm = !busy && time - this.#lastProjectileAt >= CALM_AFTER_MS
    const damaged = calm
      ? (this.solids ?? []).filter((s) => s.entity.kind === 'block' && s.entity.alive && !s.entity.terrain && !(s.entity.burning > 0) && s.entity.damageRatio >= REPAIR.MIN_DAMAGE)
      : []
    // Corniches dangereuses (feu tout près) : on les évite si on peut.
    const hot = new Set()
    for (const f of fires) {
      for (const l of nav.ledges) if (f.x > l.x0 - 40 && f.x < l.x1 + 40 && Math.abs(f.y - l.y) < 80) hot.add(l.id)
    }
    return { byLedge, fires, calm, damaged, hot }
  }

  /** Contexte lu par les cerveaux : un seul objet, réutilisé à chaque pas (pas d'allocation). */
  #ctx = (() => {
    const self = this
    return {
      nav: null,
      navVersion: 0,
      time: 0,
      threatened: false,
      marching: false,
      armed: false,
      engines: [],
      get groundY() {
        return self.#port.groundY
      },
      perception: this.perception,
      get fires() {
        return self.#shared.fires
      },
      get calm() {
        return self.#shared.calm
      },
      get damaged() {
        return self.#shared.damaged
      },
      penalty: (l) => (self.#shared.hot.has(l.id) ? 250 : 0),
      vx: (u) => self.#vx.get(u) ?? 0,
      alliesOn: (id, me) => {
        const list = self.#shared.byLedge.get(id)
        if (!list) return []
        const out = []
        for (const o of list) if (o !== me && o.alive) out.push(o.x)
        return out
      },
      blocked: (u, dir) => {
        const ahead = u.x + dir * (u.width / 2 + 6)
        // Un pillard qui charge se faufile entre ses camarades (jamais à travers un mur).
        const allies = !u.raiding
        return self.#port.blockedAt(ahead, u.y, u, allies) || self.#port.blockedAt(ahead, u.y - u.height * 0.3, u, allies)
      },
      passThrough: (u) => {
        u.body.collisionFilter.mask &= ~CATEGORY.TARGET
      },
      // Ouvrages (v5.8).
      build: (u, link) => self.#build(u, link),
      climb: (u, link) => self.#startClimb(u, link),
      frontOf: (u) => (u.x > self.#port.width / 2 ? -1 : 1),
      repair: (u, block) => {
        block.hp = Math.min(block.maxHp, block.hp + block.maxHp * REPAIR.AMOUNT)
        self.#port.emit('unit', { kind: 'repaired', entity: u, block, x: block.x, y: block.y })
      },
      emit: (kind, data) => self.#port.emit('unit', { kind, ...data, x: data.entity?.x, y: data.entity?.y }),
      // Pillards (v5.8) : un coup porté à l'engin, puis les servants le repoussent.
      strike: (u) => self.#port.emit('unit', { kind: 'strike', entity: u, x: u.x, y: u.y }),
      repel: (u) => {
        self.#port.emit('unit', { kind: 'crew', entity: u, x: u.x, y: u.y })
        u.kill('crew')
      },
    }
  })()

  /* ---------- Mouvement ---------- */

  #move(u, ctx) {
    const brain = this.#brains.get(u)
    // À l'échelle : la montée suit l'itinéraire, la physique ne s'en mêle pas.
    if (u.climbing) {
      this.#climb(u)
      return
    }
    const v = Body.getVelocity(u.body)
    const upright = Math.abs(Math.atan2(Math.sin(u.angle), Math.cos(u.angle))) < 0.25
    // Gelé, renversé ou en l'air : il ne marche pas (et ne pense pas).
    if (u.frozenMs > 0 || !upright || Math.abs(v.y) > 0.6) {
      u.working = false
      this.#stop(u, v)
      // Pillard tombé de travers mais posé (appuyé contre la roche) : il se relève.
      if (!upright && u.raiding && !(u.frozenMs > 0) && Math.hypot(v.x, v.y) < 0.3) this.#getUp(u)
      return
    }
    const vx = brain.step(ctx)
    u.working = brain.working || this.#jobs.get(u)?.at === ctx.time
    if (!vx) {
      this.#stop(u, v)
      // Pillard perché hors de toute corniche (flanc d'une montagne, après une
      // chute ou un souffle) : il ne s'accroche pas à la roche, il glisse
      // jusqu'à un appui d'où il peut repartir.
      if (u.raiding && !this.nav.ledgeAt(u.x, u.y + u.height / 2)) this.#slip(u)
      return
    }
    Sleeping.set(u.body, false)
    // En marche, presque sans frottement : le défenseur n'entraîne pas le
    // plancher sous ses pas (sinon un étage posé sur des piliers glisserait).
    u.body.friction = 0.01
    u.body.frictionStatic = 0.05
    Body.setVelocity(u.body, { x: vx, y: v.y })
    Body.setAngularVelocity(u.body, 0)
    u.walking = true
    u.sprinting = Math.abs(vx) > 0.9
    this.#vx.set(u, vx)
  }

  #stop(u, v) {
    if (!u.walking) {
      this.#vx.set(u, 0)
      return
    }
    u.walking = false
    u.sprinting = false
    u.body.friction = 0.9
    u.body.frictionStatic = 1.5
    Body.setVelocity(u.body, { x: 0, y: v.y })
    this.#vx.set(u, 0)
  }

  /* ---------- Ouvrages (v5.8) ---------- */

  /** Un pas de chantier : le pont ou l'échelle avance (pendant le vol des tirs seulement). */
  #build(u, link) {
    if (!this.marching) return
    const time = this.#port.time()
    if (link.kind === 'bridge' && this.#bridgeStands(link)) return
    let job = this.#jobs.get(u)
    if (!job || job.link.stand !== link.stand || job.link.kind !== link.kind) {
      job = { link, done: 0, at: time }
      this.#jobs.set(u, job)
      this.#port.emit('unit', { kind: 'build', work: link.kind, entity: u, x: u.x, y: u.y })
    }
    job.at = time
    job.done += WORLD.STEP_MS * (u.type === 'engineer' ? 2 : 1)
    if (job.done < WORKS_TIMING.BUILD_MS[link.kind]) return
    this.#jobs.delete(u)
    if (link.kind === 'bridge') {
      this.#bridges.set(spanKey(link), time)
      this.#port.spawnBridge(link.span.x0 - 16, link.span.x1 + 16)
    } else {
      const route = link.route.map((p) => ({ x: p.x, y: p.y }))
      const a = route[0]
      const b = route[route.length - 1]
      if (!this.#ladders.some((l) => Math.abs(Math.min(l.x0, l.x1) - Math.min(a.x, b.x)) < 16 && Math.abs(Math.max(l.x0, l.x1) - Math.max(a.x, b.x)) < 16)) {
        this.#ladders.push({ route, x0: a.x, y0: a.y, x1: b.x, y1: b.y })
      }
      this.#refreshNav()
    }
    this.#port.emit('unit', { kind: 'built', work: link.kind, entity: u, x: u.x, y: u.y })
  }

  /**
   * Il pose le pied sur l'échelle : il traverse la roche (pas ses camarades ni
   * les tirs). Il suit l'échelle dressée elle-même (celle qu'on voit, celle
   * qu'un tir renverse), même si un camarade l'a bâtie depuis l'autre versant.
   */
  #startClimb(u, link) {
    const ladder = this.#ladderFor(link.route)
    const route = (ladder?.route ?? link.route).map((p) => ({ x: p.x, y: p.y }))
    // L'itinéraire est rangé de gauche à droite : on le prend dans le bon sens.
    if (Math.abs(route[0].x - u.x) > Math.abs(route[route.length - 1].x - u.x)) route.reverse()
    u.climbing = { route, seg: 1, pos: { x: u.x, y: u.y + u.height / 2 }, ladder }
    u.body.collisionFilter.mask &= ~CATEGORY.TERRAIN
    Sleeping.set(u.body, false)
  }

  /**
   * Un pont tient-il déjà sur cette portée ? Rompu (plus aucune planche), il se
   * rebâtit, comme une échelle renversée : sinon un pillard arrivé après la
   * rupture attendrait sur la berge pour toujours. (Délai : le pont commandé
   * n'apparaît qu'au pas suivant.)
   */
  #bridgeStands(link) {
    const key = spanKey(link)
    const at = this.#bridges.get(key)
    if (at === undefined) return false
    if (this.#port.time() - at < BRIDGE_SPAWN_MS) return true
    for (const e of this.#port.entities()) if (e.construct && e.alive && e.x > link.span.x0 - 20 && e.x < link.span.x1 + 20) return true
    this.#bridges.delete(key)
    return false
  }

  /** Échelle dressée qui couvre cet itinéraire (mêmes bouts, à 16 px près), ou null. */
  #ladderFor(route) {
    let lo = Infinity
    let hi = -Infinity
    for (const p of route) {
      lo = Math.min(lo, p.x)
      hi = Math.max(hi, p.x)
    }
    return this.#ladders.find((l) => Math.abs(Math.min(l.x0, l.x1) - lo) < 16 && Math.abs(Math.max(l.x0, l.x1) - hi) < 16) ?? null
  }

  /**
   * Se relever : il pivote vers la verticale à vitesse d'homme, sans bondir.
   * Couché (au-delà de l'angle de mise hors de combat), il reste à terre : la
   * règle du K.-O. s'applique comme à tout défenseur.
   */
  #getUp(u) {
    const tilt = Math.atan2(Math.sin(u.angle), Math.cos(u.angle))
    if (Math.abs(tilt) >= WORLD.KNOCKOUT_ANGLE) return
    Sleeping.set(u.body, false)
    Body.setAngle(u.body, Math.sign(tilt) * Math.max(0, Math.abs(tilt) - GET_UP_RATE))
    Body.setAngularVelocity(u.body, 0)
  }

  /** Un pas d'escalade : la position suit l'échelle ; à l'arrêt hors du vol des tirs. */
  #climb(u) {
    const c = u.climbing
    if (this.marching) {
      let left = WORKS_TIMING.CLIMB_SPEED
      while (left > 0 && c.seg < c.route.length) {
        const t = c.route[c.seg]
        const dx = t.x - c.pos.x
        const dy = t.y - c.pos.y
        const d = Math.hypot(dx, dy)
        if (d <= left) {
          c.pos = { x: t.x, y: t.y }
          c.seg++
          left -= d
        } else {
          c.pos = { x: c.pos.x + (dx / d) * left, y: c.pos.y + (dy / d) * left }
          if (Math.abs(dx) > 0.5) u.facing = Math.sign(dx)
          left = 0
        }
      }
    }
    Body.setPosition(u.body, { x: c.pos.x, y: c.pos.y - u.height / 2 })
    Body.setVelocity(u.body, { x: 0, y: 0 })
    Body.setAngle(u.body, 0)
    Body.setAngularVelocity(u.body, 0)
    u.walking = this.marching
    if (c.seg >= c.route.length) this.#release(u)
  }

  /**
   * Fin de l'escalade (ou échelle renversée) : la physique reprend la main.
   * `fell` : l'échelle bascule, le grimpeur est jeté loin de la paroi et tombe
   * (la chute le met hors de combat si elle est haute, voir PhysicsWorld).
   */
  #release(u, fell = false) {
    const c = u.climbing
    if (!c) return
    u.climbing = null
    u.walking = false
    u.body.collisionFilter.mask |= CATEGORY.TERRAIN
    this.#vx.set(u, 0)
    // Le frottement « à l'arrêt » (pris au pied de l'échelle) le collerait à la roche.
    this.#slip(u)
    if (!fell) return
    // Côté de la paroi : le point le plus haut de l'échelle ; on tombe à l'opposé.
    let top = c.route[0]
    for (const p of c.route) if (p.y < top.y) top = p
    const away = Math.sign(c.pos.x - top.x) || Math.sign(c.route[0].x - top.x) || -u.facing || 1
    // Une poussée douce (sous le seuil de contact mortel) : on le voit basculer et
    // tomber ; c'est l'arrivée, sur la roche ou au sol, qui décide de son sort.
    Body.setVelocity(u.body, { x: away * WORKS_TIMING.FALL_PUSH.x, y: -WORKS_TIMING.FALL_PUSH.y })
    Body.setAngularVelocity(u.body, away * 0.02)
  }

  /** Plus d'appui : frottement de marche (il glisse au lieu de rester collé), corps réveillé. */
  #slip(u) {
    u.body.friction = 0.01
    u.body.frictionStatic = 0.05
    Sleeping.set(u.body, false)
  }

  /** Échelle renversée : ceux qui y étaient tombent. */
  #dropLadder(l, by = null) {
    this.#ladders = this.#ladders.filter((o) => o !== l)
    for (const u of this.#brains.keys()) if (u.climbing?.ladder === l) this.#release(u, true)
    const mid = l.route[Math.floor(l.route.length / 2)]
    this.#port.emit('unit', { kind: 'ladderDown', x: mid.x, y: mid.y, by })
    this.#refreshNav()
  }

  /* ---------- Capacités de groupe ---------- */

  /** Étendard : tant que le porte-étendard tient debout, ses voisins sont galvanisés. */
  #banners(units) {
    const bearers = units.filter((u) => u.alive && u.type === 'bannerman')
    for (const u of units) {
      if (u.type === 'bannerman' || !u.alive) continue
      const near = bearers.some((b) => Math.hypot(b.x - u.x, b.y - u.y) <= BANNER.RADIUS)
      u.aura = near ? BANNER.BOOST : 1
    }
  }

  /**
   * Un défenseur est hors de combat (appelé par le monde avant de le retirer).
   * Veilleur : sa torche roule et met le feu au bois et à la poudre tout autour.
   */
  onDown(u) {
    this.#brains.delete(u)
    this.#jobs.delete(u)
    u.climbing = null
    if (!u.torch || u.torchDropped) return
    u.torchDropped = true
    // Un veilleur noyé ou gelé : la torche s'éteint.
    if (u.deathCause === 'drown' || u.deathCause === 'freeze' || u.frozenMs > 0) return
    let lit = 0
    for (const e of this.#port.entities()) {
      if (!e.alive || (e.kind !== 'block' && e.kind !== 'barrel') || !e.flammable) continue
      if (Math.hypot(e.x - u.x, e.y - u.y) > TORCH.RADIUS + Math.max(e.width, e.height) / 2) continue
      this.#port.heat(e, TORCH.BURN_MS)
      lit++
    }
    this.#port.emit('unit', { kind: 'torchDrop', entity: u, x: u.x, y: u.y + u.height / 2, lit })
  }
}
