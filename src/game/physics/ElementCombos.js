import { deepFreeze } from '../../core/utils/Guard.js'
import { FROST, TARGET_TYPES } from '../entities/catalog.js'

/**
 * Combos d'éléments (v6.2) : des règles simples qui se répondent, à la manière
 * de la « chimie » de Breath of the Wild (les éléments changent l'état des
 * matériaux) et des surfaces de Divinity (l'eau conduit la foudre). Chaque
 * combo a un nom, annoncé dans le ciel quand il se produit.
 *
 * - FER ROUGI : le feu chauffe le fer au rouge (un tir enflammé, ou du bois qui
 *   brûle contre lui). Rougi, il enflamme le bois et la paille qui le touchent
 *   et brûle les défenseurs à son contact.
 * - TREMPE : du givre ou de l'eau sur du fer rougi : le choc thermique le fend
 *   (il perd l'essentiel de sa solidité). Le fer, si dur, cède ainsi.
 * - FER ÉLECTRISÉ : la foudre qui passe par du fer le laisse chargé un instant ;
 *   il électrise les défenseurs qui le touchent (dégâts, sonnés).
 * - EAU ÉLECTRISÉE : la décharge qui frappe un défenseur trempé court dans l'eau
 *   jusqu'aux autres défenseurs trempés alentour.
 * - ÉCLATS DE GLACE : la glace et ce qui est gelé, pris dans un souffle, volent
 *   en éclats qui blessent les défenseurs autour.
 *
 * Le monde physique déclenche les combos (feu, givre, foudre, explosion) ; leurs
 * règles et leurs effets sont ici, et passent par le port (v6.2).
 * Tout se décide au pas de simulation (relectures identiques).
 */
export const COMBO = deepFreeze({
  HOT_MS: 6000,
  TICK_MS: 400,
  TOUCH: 10,
  HOT_DPS: 18,
  QUENCH: 0.7,
  CHARGE_MS: 1800,
  // Le fer électrisé sonne comme la foudre (THUNDER.STUN_MS).
  CHARGE_DAMAGE: 10,
  SHARD_RADIUS: 95,
  SHARD_DAMAGE: 28,
  WET_RADIUS: 340,
  WET_SHARE: 0.55,
})

/** Deux boîtes englobantes se touchent-elles (à `pad` près) ? */
export function touching(a, b, pad = COMBO.TOUCH) {
  const p = a.body.bounds
  const q = b.body.bounds
  return p.min.x - pad <= q.max.x && q.min.x - pad <= p.max.x && p.min.y - pad <= q.max.y && q.min.y - pad <= p.max.y
}

/**
 * Ce que les combos peuvent faire au monde (fourni par PhysicsWorld, v6.2).
 * @typedef {object} ComboPort
 * @property {number} time ms de monde
 * @property {boolean} armed vrai dès le premier tir
 * @property {() => Iterable<any>} entities
 * @property {(x: number, y: number, r: number) => any[]} queryRadius
 * @property {(e: any) => void} ignite mise à feu (ou vapeur, si c'est gelé)
 * @property {(t: any, dmg: number) => void} burn brûlure d'un défenseur (après le premier tir)
 * @property {(t: any, dmg: number) => void} shock décharge sur un défenseur (après le premier tir)
 * @property {(t: any, dmg: number, cause: string, dir: number) => void} hurt blessure d'un défenseur
 * @property {(name: string, data: object) => void} emit
 */

export class ElementCombos {
  /** @type {ComboPort} */
  #port
  /** Fer rougi : bloc → fin (ms de monde). */
  #hot = new Map()
  /** Fer électrisé : bloc → fin. */
  #charged = new Map()
  #tick = 0

  /** @param {ComboPort} port */
  constructor(port) {
    this.#port = port
  }

  /** Le feu touche du fer : il rougit (« fer rougi » annoncé). @returns {boolean} vrai s'il vient de rougir */
  heatIron(block) {
    const time = this.#port.time
    if (block.material !== 'iron' || !block.alive || block.terrain) return false
    const fresh = !this.isHot(block, time)
    block.hotUntil = time + COMBO.HOT_MS
    this.#hot.set(block, block.hotUntil)
    if (fresh) this.#announce('redhot', block)
    return fresh
  }

  isHot(block, time) {
    return (this.#hot.get(block) ?? 0) > time
  }

  /**
   * Trempe : du givre ou de l'eau sur du fer rougi. Le choc thermique le fend :
   * il perd l'essentiel de sa solidité (COMBO.QUENCH), dans un jet de vapeur.
   * @returns {boolean} vrai si le fer s'est fendu
   */
  quench(e) {
    if (e.kind !== 'block' || !this.isHot(e, this.#port.time)) return false
    this.#hot.delete(e)
    e.hotUntil = 0
    this.#port.emit('steam', { x: e.x, y: e.y, radius: FROST.STEAM_RADIUS * 0.6, entity: e })
    this.#announce('quench', e)
    e.damage(e.maxHp * COMBO.QUENCH, 'impact')
    return true
  }

  /** La foudre passe par du fer : il reste chargé (« fer électrisé » annoncé). @returns {boolean} vrai s'il vient d'être chargé */
  charge(block) {
    const time = this.#port.time
    if (block.material !== 'iron' || !block.alive || block.terrain) return false
    const fresh = !((this.#charged.get(block) ?? 0) > time)
    block.chargedUntil = time + COMBO.CHARGE_MS
    this.#charged.set(block, block.chargedUntil)
    if (fresh) this.#announce('charged', block)
    return fresh
  }

  /**
   * Eau électrisée : si la décharge a frappé un défenseur trempé, elle court dans
   * l'eau jusqu'à tous les autres défenseurs trempés à moins de WET_RADIUS de p.
   * @param {{ x: number, y: number }} p d'où part la décharge
   * @param {Set<any>} struck défenseurs déjà frappés par l'éclair
   * @param {object[]} path segments de l'éclair (ceux de l'eau s'y ajoutent)
   * @param {number} scale force de la décharge
   */
  wetShock(p, struck, path, scale) {
    if (![...struck].some((t) => t.wetMs > 0)) return
    let spread = 0
    for (const t of this.#port.entities()) {
      if (t.kind !== 'target' || !t.alive || struck.has(t) || !(t.wetMs > 0) || Math.hypot(t.x - p.x, t.y - p.y) > COMBO.WET_RADIUS) continue
      const src = [...struck].find((s) => s.wetMs > 0) ?? { x: p.x, y: p.y, height: 0 }
      path.push({ x0: src.x, y0: src.y - (src.height ?? 0) * 0.2, x1: t.x, y1: t.y - t.height * 0.2, water: true })
      this.#port.shock(t, COMBO.WET_SHARE * TARGET_TYPES.soldier.hp * 1.35 * scale)
      spread++
    }
    if (spread) this.#port.emit('combo', { kind: 'wetshock', x: p.x, y: p.y })
  }

  /** Ce qui volera en éclats dans un souffle (x, y, radius) : la glace et ce qui est gelé. */
  brittleIn(x, y, radius) {
    return this.#port.queryRadius(x, y, radius * 0.9).filter((e) => e.kind === 'block' && e.alive && !e.terrain && (e.frozenMs > 0 || e.material === 'ice'))
  }

  /** Éclats de glace : chaque bloc gelé se brise et blesse les défenseurs autour. */
  shards(blocks) {
    for (const b of blocks) {
      if (b.alive) b.kill('shatter')
      if (!this.#port.armed) continue
      for (const t of this.#port.queryRadius(b.x, b.y, COMBO.SHARD_RADIUS)) {
        if (t.kind !== 'target' || !t.alive) continue
        const k = 1 - Math.hypot(t.x - b.x, t.y - b.y) / COMBO.SHARD_RADIUS
        if (k > 0) this.#port.hurt(t, COMBO.SHARD_DAMAGE * k, 'shard', Math.sign(t.x - b.x))
      }
    }
    this.#port.emit('combo', { kind: 'shards', x: blocks[0].x, y: blocks[0].y })
  }

  /**
   * Un pas : le fer rougi chauffe et brûle ce qui le touche, le fer électrisé
   * secoue les défenseurs à son contact, le bois en feu fait rougir le fer.
   * @param {number} dtMs
   */
  step(dtMs) {
    const port = this.#port
    const time = port.time
    for (const [b, until] of this.#hot) {
      if (until <= time || !b.alive) {
        this.#hot.delete(b)
        b.hotUntil = 0
      }
    }
    for (const [b, until] of this.#charged) {
      if (until <= time || !b.alive) {
        this.#charged.delete(b)
        b.chargedUntil = 0
      }
    }
    this.#tick += dtMs
    if (this.#tick < COMBO.TICK_MS) return
    this.#tick = 0
    const all = [...port.entities()].filter((e) => e.alive)
    // Du bois qui brûle contre du fer le fait rougir.
    const irons = all.filter((e) => e.kind === 'block' && e.material === 'iron' && !e.terrain)
    if (irons.length) {
      for (const f of all) {
        if (f.kind !== 'block' || !(f.burning > 0)) continue
        for (const iron of irons) if (touching(f, iron)) this.heatIron(iron)
      }
    }
    for (const b of this.#hot.keys()) {
      for (const e of all) {
        if (e === b || !touching(b, e)) continue
        if (e.kind === 'target') port.burn(e, (COMBO.HOT_DPS * COMBO.TICK_MS) / 1000)
        else if ((e.kind === 'block' || e.kind === 'barrel') && e.flammable && !(e.burning > 0)) port.ignite(e)
      }
    }
    for (const b of this.#charged.keys()) {
      for (const e of all) if (e.kind === 'target' && touching(b, e, 6)) port.shock(e, COMBO.CHARGE_DAMAGE)
    }
  }

  clear() {
    for (const b of this.#hot.keys()) b.hotUntil = 0
    for (const b of this.#charged.keys()) b.chargedUntil = 0
    this.#hot.clear()
    this.#charged.clear()
    this.#tick = 0
  }

  /** Annonce d'un combo sur un bloc (nom affiché dans le ciel). */
  #announce(kind, e) {
    this.#port.emit('combo', { kind, x: e.x, y: e.y, entity: e })
  }
}
