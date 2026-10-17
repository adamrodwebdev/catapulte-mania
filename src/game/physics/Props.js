import { SeededRandom } from '../../core/utils/SeededRandom.js'
import { MILL, FORGE, CISTERN } from '../entities/props.js'

const TAU = Math.PI * 2

/**
 * Ouvrages des châteaux (v6.1, voir entities/props.js) : leur comportement à
 * chaque pas (rafales des moulins, flammes des forges) et ce qu'ils libèrent
 * en cédant (inondation, essaim, nuage de farine, braises).
 *
 * Le PhysicsWorld lui donne un « port » (enflammer, ébouillanter, créer un
 * nuage, émettre un événement…) : rien d'autre de la physique. Le hasard
 * (rythme des rafales) vient de la graine du niveau : une partie rejouée est
 * identique.
 *
 * À chaque pas, `zones` (rafales actives) et `flames` (colonnes et jets de
 * feu) sont recalculées ; `gustAt(x, y)` donne la poussée des moulins en un
 * point (signée, 1 = rafale franche juste devant le moulin).
 */
export class Props {
  #rng
  /** @type {Array<{ x: number, y: number, dir: number, k: number, mill: any }>} */
  zones = []
  /** @type {Array<{ x0: number, x1: number, y0: number, y1: number, source: any, jet?: boolean }>} */
  flames = []

  /** @param {number} seed graine du niveau */
  constructor(seed = 1) {
    this.#rng = new SeededRandom(((seed ^ 0x9e3779b9) >>> 0) || 7)
  }

  clear() {
    this.zones = []
    this.flames = []
  }

  /**
   * Un pas de simulation.
   * @param {Iterable<any>} entities
   * @param {number} time ms de monde
   * @param {number} dtMs
   * @param {{ engineX: () => number, emit: (name: string, data: object) => void }} port
   */
  step(entities, time, dtMs, port) {
    this.zones.length = 0
    this.flames.length = 0
    const forges = []
    for (const e of entities) {
      if (e.kind !== 'block' || !e.prop || !e.alive) continue
      if (e.prop === 'windmill') this.#mill(e, time, dtMs, port)
      else if (e.prop === 'forge') forges.push(e)
    }
    // Les forges après les moulins : un jet de feu suit la rafale du même pas.
    for (const e of forges) this.#forge(e, time)
  }

  /** Moulin à vent : calme → préavis (les ailes s'emballent) → rafale. */
  #mill(e, time, dtMs, port) {
    const m = (e.mill ??= { phase: 'calm', until: time + this.#rng.range(...MILL.CALM_MS), strength: 1, spin: 0.6, angle: this.#rng.range(0, TAU), dir: -1 })
    m.dir = Math.sign(port.engineX() - e.x) || -1
    // Ailes gelées : le moulin se tait (il reprend une fois dégelé).
    if (e.frozenMs > 0) {
      m.phase = 'calm'
      m.until = Math.max(m.until, time + 600)
    } else if (time >= m.until) {
      if (m.phase === 'calm') {
        m.phase = 'warn'
        m.until = time + MILL.WARN_MS
        m.strength = this.#rng.range(0.75, 1.2)
        port.emit('mill', { kind: 'warn', entity: e, x: e.x, y: e.y, dir: m.dir })
      } else if (m.phase === 'warn') {
        m.phase = 'gust'
        m.until = time + this.#rng.range(...MILL.GUST_MS)
        port.emit('mill', { kind: 'gust', entity: e, x: e.x, y: e.y, dir: m.dir, strength: m.strength })
      } else {
        m.phase = 'calm'
        m.until = time + this.#rng.range(...MILL.CALM_MS)
      }
    }
    // Vitesse des ailes (dessin) : au ralenti, puis de plus en plus vite pendant le préavis.
    const warn = m.phase === 'warn' ? 1 - (m.until - time) / MILL.WARN_MS : 0
    const want = e.frozenMs > 0 ? 0 : m.phase === 'gust' ? 7.5 * m.strength : m.phase === 'warn' ? 0.6 + 5 * warn : 0.6
    m.spin += (want - m.spin) * Math.min(1, dtMs / 220)
    m.angle = (m.angle + (m.spin * dtMs) / 1000) % TAU
    if (m.phase === 'gust') this.zones.push({ x: e.x, y: e.y + MILL.HUB_DY, dir: m.dir, k: m.strength, mill: e })
  }

  /** Forge : une colonne de flammes ; dans une rafale, un jet de feu dans son sens. */
  #forge(e, time) {
    if (e.frozenMs > 0 || e.quenchedAt(time)) return
    const top = e.y - e.height / 2
    this.flames.push({ x0: e.x - FORGE.HALF_W, x1: e.x + FORGE.HALF_W, y0: top - FORGE.HEIGHT, y1: top, source: e })
    const g = this.gustAt(e.x, top - 40)
    if (Math.abs(g) > 0.25) {
      const len = FORGE.JET * Math.min(1.3, Math.abs(g))
      const dir = Math.sign(g)
      this.flames.push({ x0: dir > 0 ? e.x : e.x - len, x1: dir > 0 ? e.x + len : e.x, y0: top - 75, y1: top - 8, source: e, jet: true })
      e.jetAt = time
    }
  }

  /**
   * Poussée des moulins en un point : signée (sens de la rafale), 1 = rafale
   * franche au ras du moulin ; elle faiblit en s'éloignant et sur les bords.
   */
  gustAt(x, y) {
    let a = 0
    for (const z of this.zones) {
      const d = (x - z.x) * z.dir
      if (d < 10 || d > MILL.REACH) continue
      const dy = Math.abs(y - z.y)
      if (dy > MILL.HALF_H) continue
      a += z.dir * z.k * ((1 - d / MILL.REACH) * 0.75 + 0.25) * (1 - (dy / MILL.HALF_H) ** 2)
    }
    return a
  }

  /** Le point est-il dans une flamme d'ouvrage ? */
  flameAt(x, y, pad = 0) {
    return this.flames.some((f) => x >= f.x0 - pad && x <= f.x1 + pad && y >= f.y0 - pad && y <= f.y1 + pad)
  }

  /**
   * Un ouvrage cède : ce qu'il contenait se répand.
   * @param {any} e le bloc détruit
   * @param {object} port
   * @param {number} port.time
   * @param {(x: number, y: number, r: number) => any[]} port.queryRadius
   * @param {(e: any, ms: number) => boolean} port.heat
   * @param {(x: number, y: number, source: any) => void} port.scald
   * @param {(kind: string, x: number, y: number) => void} port.cloud
   * @param {(name: string, data: object) => void} port.emit
   * @param {boolean} port.winter l'eau gèle (monde d'hiver)
   */
  destroyed(e, port) {
    if (!e.prop) return
    if (e.prop === 'cistern') this.#flood(e, port)
    else if (e.prop === 'hive') port.cloud('bees', e.x, e.y)
    else if (e.prop === 'flour') port.cloud('flour', e.x, e.y)
    else if (e.prop === 'forge') {
      // Les braises se répandent : le bois et la paille autour s'enflamment.
      port.emit('prop', { kind: 'embers', entity: e, x: e.x, y: e.y, r: FORGE.EMBERS })
      for (const o of port.queryRadius(e.x, e.y, FORGE.EMBERS)) if (o !== e && o.kind !== 'projectile') port.heat(o, 6000)
    }
  }

  /** Citerne crevée : l'eau éteint, trempe (ou gèle, en Hiver), et noie la forge en vapeur. */
  #flood(e, port) {
    const r = CISTERN.RADIUS
    const cy = e.y + r * 0.35
    port.emit('prop', { kind: 'flood', entity: e, x: e.x, y: e.y, r, winter: port.winter })
    for (const o of port.queryRadius(e.x, cy, r)) {
      if (o === e || !o.alive || o.kind === 'projectile' || o.kind === 'flyer') continue
      if (o.burning > 0) o.burning = 0
      if (o.prop === 'forge') {
        o.quenchedUntil = port.time + 8000
        port.scald(o.x, o.y - 20, o)
      }
      if (o.kind === 'target') {
        if (port.winter) o.freeze(5000)
        else o.wetMs = Math.max(o.wetMs ?? 0, CISTERN.WET_MS)
      }
      // Fer rougi sous l'eau : la trempe (v6.2).
      if (o.kind === 'block') port.quench?.(o)
    }
  }
}
