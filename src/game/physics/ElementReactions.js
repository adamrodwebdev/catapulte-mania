import { WORLD } from './constants.js'
import { FROST, THUNDER, POISON, TARGET_TYPES } from '../entities/catalog.js'
import { CLOUD_KINDS } from './Clouds.js'
import { hurtEvent } from './DefenderContacts.js'

/**
 * Ce que les réactions des éléments peuvent lire et faire du monde (fourni par PhysicsWorld, v6.2).
 * @typedef {object} ReactionPort
 * @property {number} time ms de monde
 * @property {boolean} armed vrai dès le premier tir
 * @property {import('../../core/utils/SeededRandom.js').SeededRandom} rng le hasard du monde (le même que les explosions et le séisme)
 * @property {() => Iterable<any>} entities
 * @property {(predicate: (e: any) => boolean) => any[]} filter
 * @property {(x: number, y: number, r: number) => any[]} queryRadius
 * @property {(x: number, y: number, spec: object) => void} queueExplosion souffle à déclencher au prochain passage
 * @property {(name: string, data: object) => void} emit
 * @property {import('./Clouds.js').Clouds} clouds
 * @property {import('./Props.js').Props} props
 * @property {import('./WindField.js').WindField} windField
 * @property {{ wet: boolean, winter: boolean }} weather
 * @property {object} worldWind souffle du monde (voir WorldWinds.js)
 * @property {import('./ElementCombos.js').ElementCombos} combos
 */

/**
 * Réactions des éléments (v6.2, sorties de PhysicsWorld) : le feu, le givre et
 * la vapeur, la foudre, les nuages.
 *  - le feu prend au bois et à la paille, se propage (le vent l'attise) ; ce
 *    qui est gelé éclate en vapeur, qui ébouillante les défenseurs proches ;
 *  - le givre gèle tout autour de l'impact et éteint ce qui brûlait ;
 *  - la décharge de l'orbe d'orage saute de défenseur en défenseur (le fer la
 *    relaie) et embrase les nuages qu'elle traverse ;
 *  - les nuages dérivent, rongent les défenseurs et s'embrasent au feu ;
 *  - un ouvrage brisé libère son contenu (eau, essaim, farine, braises).
 * Le monde physique décide quand (contacts, pas de simulation) ; les règles sont
 * ici. Le hasard est celui du monde : relectures identiques.
 */
export class ElementReactions {
  /** @type {ReactionPort} */
  #port
  #rng
  /** Vapeur en chaîne : blocs gelés voisins qui éclatent à leur tour, avec un court délai. */
  #steamQueue = []
  /** Pas depuis la dernière mise à feu par un jet de forge (v6.1). */
  #flameTick = 0

  /** @param {ReactionPort} port */
  constructor(port) {
    this.#port = port
    this.#rng = port.rng
  }

  /**
   * Feu au contact d'un objet : il s'enflamme… sauf s'il est gelé, auquel cas
   * il éclate en vapeur (voir steam).
   * @returns {boolean} vrai si un feu ou une vapeur a été déclenché
   */
  heat(e, ms) {
    if (!e || !e.alive) return false
    if (e.frozenMs > 0) {
      this.steam(e)
      return true
    }
    // Le fer ne brûle pas : il rougit (v6.2, voir ElementCombos.js).
    if (e.kind === 'block' && e.material === 'iron') {
      this.#port.combos.heatIron(e)
      return true
    }
    if (e.ignite(ms)) {
      this.#port.emit('fire:start', { entity: e })
      return true
    }
    return false
  }

  /**
   * Givre à l'impact : tout ce qui est proche gèle (devient cassant). Ce qui
   * brûlait s'éteint dans un jet de vapeur brûlante.
   */
  frostBurst(p) {
    const radius = FROST.RADIUS * (p.fireFactor ?? 1)
    this.#port.emit('frost', { x: p.x, y: p.y, radius })
    // Le givre fige les nuages (v6.1) : ils retombent en poussière gelée.
    for (const c of this.#port.clouds.list) {
      if (Math.hypot(c.x - p.x, c.y - p.y) <= radius + c.r * 0.5) {
        this.#port.clouds.remove(c)
        this.#port.emit('cloud', { kind: c.kind, x: c.x, y: c.y, r: c.r, event: 'freeze' })
      }
    }
    for (const e of this.#port.queryRadius(p.x, p.y, radius)) {
      if (e === p || e.kind === 'projectile' || e.kind === 'flyer' || e.terrain) continue
      if (e.burning > 0) {
        e.burning = 0
        this.scald(e.x, e.y, e)
      }
      // Fer rougi saisi par le givre : la trempe le fend (v6.2).
      this.#port.combos.quench(e)
      e.freeze(FROST.MS)
    }
  }

  /**
   * Vapeur : le feu touche un objet gelé. Il dégèle d'un coup, le choc thermique
   * le fend (FROST.SHOCK de sa résistance), l'eau bouillante ébouillante les
   * défenseurs proches, et les blocs gelés voisins éclatent à leur tour.
   */
  steam(e) {
    if (!e.alive || !(e.frozenMs > 0)) return
    e.frozenMs = 0
    e.burning = 0
    this.#port.emit('combo', { kind: 'steam', x: e.x, y: e.y, entity: e })
    if (e.kind === 'block' && Number.isFinite(e.maxHp)) e.damage(e.maxHp * FROST.SHOCK, 'impact')
    this.scald(e.x, e.y, e)
    const reach = Math.max(e.width, e.height) / 2 + 34
    for (const near of this.#port.queryRadius(e.x, e.y, reach + 30)) {
      if (near !== e && near.frozenMs > 0 && near.kind !== 'projectile') this.#steamQueue.push({ e: near, at: this.#port.time + 90 })
    }
  }

  /** Nuage de vapeur et eau bouillante autour de (x, y). */
  scald(x, y, source) {
    this.#port.emit('steam', { x, y, radius: FROST.STEAM_RADIUS, entity: source })
    if (!this.#port.armed) return
    for (const t of this.#port.queryRadius(x, y, FROST.STEAM_RADIUS)) {
      if (t.kind === 'target' && t.alive) t.kill('scald')
    }
  }

  /** Un pas : les blocs gelés voisins d'une vapeur éclatent à leur tour, à l'heure dite. */
  processSteam() {
    if (!this.#steamQueue.length) return
    const due = this.#steamQueue.filter((s) => s.at <= this.#port.time)
    if (!due.length) return
    this.#steamQueue = this.#steamQueue.filter((s) => s.at > this.#port.time)
    for (const s of due) this.steam(s.e)
  }

  /**
   * Flammes des ouvrages (v6.1) : un projectile qui traverse la colonne de feu
   * d'une forge s'enflamme (le givre, lui, y fond) ; le jet craché dans une
   * rafale met le feu à ce qu'il lèche (toutes les 0,3 s).
   */
  stepFlames() {
    const jetTick = ++this.#flameTick >= 36
    if (jetTick) this.#flameTick = 0
    for (const e of this.#port.entities()) {
      if (!e.alive) continue
      if (e.kind === 'projectile') {
        if (e.spent || !this.#port.props.flameAt(e.x, e.y, e.radius * 0.5)) continue
        if (e.frost) {
          e.frost = false
          this.#port.emit('steam', { x: e.x, y: e.y, radius: 30, entity: null })
        } else if (e.kindle()) this.#port.emit('fire:start', { entity: e })
        continue
      }
      if (!jetTick || e.kind === 'flyer' || e.burning > 0) continue
      const b = e.body.bounds
      const licked = this.#port.props.flames.some((f) => f.jet && b.max.x >= f.x0 && b.min.x <= f.x1 && b.max.y >= f.y0 && b.min.y <= f.y1)
      if (licked) this.heat(e, 5000)
    }
  }

  /**
   * Propagation du feu. En Difficile, le vent l'attise : sous le vent, le feu
   * va plus loin et prend plus facilement ; contre le vent, il peine.
   */
  spreadFire() {
    // Boulet brûlant immobilisé contre (ou sous) un matériau inflammable.
    for (const p of this.#port.filter((e) => e.kind === 'projectile' && e.hasImpacted && e.hot)) {
      for (const near of this.#port.queryRadius(p.x, p.y, p.radius + 22)) {
        if (near === p || near.burning !== 0) continue
        if (near.frozenMs > 0) this.heat(near, 6000)
        else if (near.flammable && this.#rng.chance(0.7)) this.heat(near, 6000)
      }
    }
    const burning = this.#port.filter((e) => e.burning > 0 && e.alive && e.kind !== 'projectile')
    // Forteresse (v6.1) : le vent porte les braises, quelle que soit la difficulté.
    const embers = this.#port.worldWind.fireReach ?? 0
    const base = this.#port.windField.profile.fire || embers ? this.#port.windField.base : 0
    for (const src of burning) {
      // La rafale d'un moulin (v6.1) attise le feu et le pousse dans son sens.
      const wind = Math.max(-1.5, Math.min(1.5, base + this.#port.props.gustAt(src.x, src.y) * 1.5))
      const reach = Math.max(src.width, src.height) / 2 + 26 + Math.abs(wind) * 45 * (embers || 1)
      for (const near of this.#port.queryRadius(src.x, src.y, reach + 30)) {
        // Un objet gelé au contact des flammes éclate en vapeur.
        if (near !== src && near.frozenMs > 0 && near.kind !== 'projectile' && Math.hypot(near.x - src.x, near.y - src.y) <= reach) {
          this.heat(near, 0)
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
        if (this.#rng.chance(chance)) this.heat(near, 5500)
      }
    }
  }

  /**
   * Nuages (v6.1) : ils dérivent au vent, rongent les défenseurs (le poison
   * agit encore POISON.LINGER_MS après qu'ils en sont sortis) et s'embrasent
   * au contact d'une flamme.
   */
  stepClouds() {
    const time = this.#port.time
    if (this.#port.clouds.size) {
      const targets = [...this.#port.entities()].filter((e) => e.kind === 'target' && e.alive)
      this.#port.clouds.step(WORLD.STEP_MS, {
        time,
        // Dérive : le vent du moment à cet endroit (1 = vent de base maximal ≈ 1 px par image),
        // et la rafale d'un moulin, qui pousse fort (v6.1).
        drift: (x, y) => this.#port.windField.at(x, y, time) + this.#port.props.gustAt(x, y) * 2.2,
        targets,
        // Rien ne s'embrase avant le premier tir, et les miasmes des marais ne
        // craignent pas les torches des veilleurs : seul le feu du joueur les allume.
        flameNear: (x, y, r, kind) => this.#port.armed && this.#flameNear(x, y, r, { torches: kind !== 'miasma' }),
        blast: (c, r) => this.cloudBlast(c, r),
        affect: (t, kind, dps, dtMs) => {
          if (!this.#port.armed) return
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
    for (const t of this.#port.entities()) {
      if (t.kind !== 'target' || !t.alive || !(t.poisonUntil > time)) continue
      t.damage((t.poisonDps ?? POISON.DPS) * (WORLD.STEP_MS / 1000), 'poison')
    }
  }

  /**
   * Un nuage naît (pot de poison, ruche, sac de farine) et s'annonce (v6.2 : le
   * même pour tous).
   * @param {string} kind voir CLOUD_KINDS
   * @param {{ scale?: number }} [opts]
   */
  spawnCloud(kind, x, y, opts) {
    const c = this.#port.clouds.spawn(kind, x, y, this.#port.time, opts)
    this.#port.emit('cloud', { kind, x: c.x, y: c.y, r: c.r, event: 'spawn' })
    return c
  }

  /** Ce qu'un ouvrage brisé libère : inondation, essaim, farine, braises (voir Props#destroyed). */
  propDestroyed(e) {
    this.#port.props.destroyed(e, {
      time: this.#port.time,
      winter: this.#port.weather.winter === true,
      queryRadius: (x, y, r) => this.#port.queryRadius(x, y, r),
      heat: (o, ms) => this.heat(o, ms),
      scald: (x, y, source) => this.scald(x, y, source),
      quench: (o) => this.#port.combos.quench(o),
      cloud: (kind, x, y) => {
        this.spawnCloud(kind, x, y)
      },
      emit: (name, data) => this.#port.emit(name, data),
    })
  }

  /** Une flamme dans ce disque ? (objet qui brûle, boulet ardent, forge ; torche d’un veilleur si `torches`) */
  #flameNear(x, y, r, { torches = true } = {}) {
    if (this.#port.props.flameAt(x, y, r * 0.7)) return true
    const r2 = r * r
    for (const e of this.#port.entities()) {
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
  cloudBlast(c, r = this.#port.clouds.radiusAt(c, this.#port.time)) {
    if (c.blasted) return
    c.blasted = true
    this.#port.clouds.remove(c)
    // Un essaim ne s'embrase pas : la fumée le disperse.
    this.#port.emit('cloud', { kind: c.kind, x: c.x, y: c.y, r, event: c.kind === 'bees' ? 'disperse' : 'blast' })
    const spec = CLOUD_KINDS[c.kind]?.blast
    if (spec) this.#port.queueExplosion(c.x, c.y, { radius: r * 1.1, ...spec, source: null })
  }

  /**
   * Orbe d'orage (v6.1, voir THUNDER) : la décharge frappe ce que l'orbe
   * touche, puis saute vers le défenseur le plus proche (au plus REACH px),
   * et ainsi de suite ; un bloc de fer la relaie sans compter comme un saut.
   * Elle fait sauter un baril, peut enflammer le bois, fait éclater la glace
   * en vapeur, et embrase les nuages qu'elle traverse.
   */
  discharge(p, first, { hops: baseHops = THUNDER.HOPS, scale = 1 } = {}) {
    const wet = this.#port.weather.wet === true
    const hops = baseHops + (wet ? THUNDER.RAIN_HOPS : 0)
    const reach = THUNDER.REACH * (wet ? THUNDER.RAIN_REACH : 1)
    if (first?.alive) {
      if (first.kind === 'barrel') first.kill('explosion')
      else if (first.frozenMs > 0 && first.kind !== 'target') this.steam(first)
      else if (first.kind === 'block' && first.flammable && this.#rng.chance(0.45)) this.heat(first, 5000)
      // Fer électrisé (v6.2) : il garde la charge un instant.
      else if (first.kind === 'block') this.#port.combos.charge(first)
    }
    const path = []
    const struck = new Set()
    const relays = new Set()
    let from = { x: p.x, y: p.y }
    let hop = 0
    for (let guard = 0; hop < hops && guard < 12; guard++) {
      let best = null
      let bestD = reach
      for (const e of this.#port.entities()) {
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
        for (const e of this.#port.entities()) {
          if (e.kind !== 'block' || e.material !== 'iron' || !e.alive || relays.has(e)) continue
          const d = Math.hypot(e.x - from.x, e.y - from.y)
          if (d < ironD) {
            ironD = d
            iron = e
          }
        }
        if (!iron || relays.size >= 3) break
        relays.add(iron)
        this.#port.combos.charge(iron)
        path.push({ x0: from.x, y0: from.y, x1: iron.x, y1: iron.y, relay: true })
        from = { x: iron.x, y: iron.y }
        continue
      }
      struck.add(best)
      path.push({ x0: from.x, y0: from.y, x1: best.x, y1: best.y - best.height * 0.2 })
      if (best.frozenMs > 0) this.steam(best)
      // Trempé (pluie, citerne) : l'eau conduit, le coup porte plus fort.
      const soaked = wet || best.wetMs > 0
      const dmg = THUNDER.DAMAGE[Math.min(hop, THUNDER.DAMAGE.length - 1)] * TARGET_TYPES.soldier.hp * (THUNDER.CONDUCT[best.type] ?? 1) * (soaked ? 1.35 : 1) * scale
      if (this.#port.armed) this.shock(best, dmg)
      from = { x: best.x, y: best.y }
      hop++
    }
    // Eau électrisée (v6.2) : un défenseur trempé touché, et la décharge court dans
    // l'eau jusqu'à tous les autres défenseurs trempés alentour.
    this.#port.combos.wetShock(p, struck, path, scale)
    for (const seg of path) {
      for (const c of this.#port.clouds.at((seg.x0 + seg.x1) / 2, (seg.y0 + seg.y1) / 2, this.#port.time)) this.cloudBlast(c)
    }
    for (const c of this.#port.clouds.at(p.x, p.y, this.#port.time)) this.cloudBlast(c)
    this.#port.emit('thunder', { x: p.x, y: p.y, path })
  }

  /** Un tir givré éclate à l'impact (v6.1) : éclats de glace, ce qu'il touche est saisi par le froid. */
  shatter(p) {
    p.kill('shatter')
    this.#port.emit('element', { kind: 'shatter', element: 'frost', x: p.x, y: p.y, entity: p })
    for (const e of this.#port.queryRadius(p.x, p.y, 45)) {
      if (e !== p && e.kind !== 'projectile' && e.kind !== 'flyer' && !e.terrain) e.freeze(4000)
    }
  }

  /** Décharge électrique : des points de vie en moins, et sonné (il tressaute). */
  shock(t, dmg) {
    const before = t.hp
    const died = t.damage(dmg, 'shock')
    if (t.alive) {
      t.stunUntil = Math.max(t.stunUntil, this.#port.time + THUNDER.STUN_MS)
      t.stunKind = 'shock'
    }
    this.#port.emit('hurt', hurtEvent(t, died ? before : Math.max(0, before - Math.max(0, t.hp)), 'shock', died, 0))
  }
}
