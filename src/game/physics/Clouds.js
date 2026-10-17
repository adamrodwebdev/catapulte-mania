import { deepFreeze, Guard } from '../../core/utils/Guard.js'
import { POISON } from '../entities/catalog.js'

/**
 * Nuages du champ de bataille (v6.1) : gaz du pot de poison, miasmes des
 * marais, farine d'un sac éventré. Un nuage :
 *  - dérive avec le vent local (rafales et moulins compris) et s'étale un peu ;
 *  - agit sur les défenseurs qui y sont (poison : il les ronge et les fait tousser) ;
 *  - s'embrase au contact d'une flamme (pot de feu, bois qui brûle, éclair) :
 *    le gaz et la farine explosent d'un coup (règle « feu + gaz = souffle ») ;
 *  - se dissipe au givre.
 * Tout est déterministe (pas de hasard ici) : une partie rejouée est identique.
 */
export const CLOUD_KINDS = deepFreeze({
  // Pot de poison : il ronge (dps) et brûle d'un coup au contact du feu.
  poison: { radius: POISON.RADIUS, ms: POISON.MS, drift: POISON.DRIFT, dps: POISON.DPS, blast: { power: 7, damage: 150 }, rgb: '120,200,70' },
  // Miasmes des marais : ils piquent à peine, mais s'embrasent de même.
  miasma: { radius: 90, ms: Infinity, drift: 0.55, dps: 3, blast: { power: 6, damage: 120 }, rgb: '150,175,90' },
  // Farine : inoffensive à respirer… mais une étincelle et tout saute.
  flour: { radius: 100, ms: 6000, drift: 1.3, dps: 0, blast: { power: 9, damage: 220 }, rgb: '244,238,222' },
  // Essaim d'une ruche (v6.1) : il fond sur le défenseur le plus proche, le pique
  // et le fait fuir ; le feu (la fumée) le disperse, sans souffle.
  bees: { radius: 55, ms: 8000, drift: 0.5, dps: 5, seek: 1.5, blast: null, rgb: '52,42,24' },
})

/** Croissance du rayon (de 70 % à 100 %) pendant les premières ms, et fondu final. */
const GROW_MS = 600
const FADE_MS = 1500

let nextId = 1

export class Clouds {
  /** @type {Array<{ id: number, kind: string, x: number, y: number, r: number, born: number, until: number, blasted?: boolean }>} */
  #list = []

  /** Nuages présents (copie, pour le rendu et les tests). */
  get list() {
    return this.#list.map((c) => ({ ...c }))
  }

  get size() {
    return this.#list.length
  }

  /**
   * @param {'poison'|'miasma'|'flour'} kind
   * @param {number} x
   * @param {number} y
   * @param {number} time ms de monde
   * @param {{ scale?: number }} [opts] taille (×), pour un pot plus gros ou un sac plus plein
   */
  spawn(kind, x, y, time, { scale = 1 } = {}) {
    const k = CLOUD_KINDS[Guard.oneOf(kind, Object.keys(CLOUD_KINDS), 'cloud kind')]
    const c = { id: nextId++, kind, x: Guard.number(x, 'cloud x'), y: Guard.number(y, 'cloud y'), r: k.radius * scale, born: time, until: time + k.ms }
    this.#list.push(c)
    if (this.#list.length > 24) this.#list.shift()
    return c
  }

  clear() {
    this.#list = []
  }

  /** Rayon effectif d'un nuage à l'instant t (il s'étale à sa naissance). */
  radiusAt(c, time) {
    const g = Math.min(1, (time - c.born) / GROW_MS)
    return c.r * (0.7 + 0.3 * g)
  }

  /** Opacité (rendu) : pleine, puis fondu dans la dernière seconde et demie. */
  alphaAt(c, time) {
    if (!Number.isFinite(c.until)) return 1
    return Math.max(0, Math.min(1, (c.until - time) / FADE_MS))
  }

  /** Nuages qui contiennent le point (x, y), du plus proche au plus lointain. */
  at(x, y, time) {
    return this.#list.filter((c) => Math.hypot(c.x - x, c.y - y) <= this.radiusAt(c, time))
  }

  /** Retire un nuage (embrasé, gelé, consumé). */
  remove(c) {
    this.#list = this.#list.filter((o) => o.id !== c.id)
  }

  /**
   * Un pas de simulation.
   * @param {number} dtMs
   * @param {object} port
   * @param {number} port.time ms de monde
   * @param {(x: number, y: number) => number} port.drift dérive horizontale (px par image de 16,7 ms) pour une prise au vent de 1
   * @param {Iterable<any>} port.targets défenseurs vivants
   * @param {(x: number, y: number, r: number, kind: string) => boolean} port.flameNear une flamme dans ce disque (pour ce nuage) ?
   * @param {(c: object) => void} port.blast le nuage s'embrase (ou, sans souffle, se disperse)
   * @param {(t: any, kind: string, dps: number, dtMs: number) => void} port.affect un défenseur est dans le nuage
   */
  step(dtMs, port) {
    if (!this.#list.length) return
    const time = port.time
    const k = dtMs / (1000 / 60)
    for (const c of [...this.#list]) {
      const kind = CLOUD_KINDS[c.kind]
      if (time >= c.until) {
        this.remove(c)
        continue
      }
      c.x += port.drift(c.x, c.y) * kind.drift * k
      // Essaim : il fond sur le défenseur le plus proche (à 400 px au plus).
      if (kind.seek) {
        let best = null
        let bestD = 400
        for (const t of port.targets) {
          const d = Math.hypot(t.x - c.x, t.y - c.y)
          if (t.alive && d < bestD) {
            bestD = d
            best = t
          }
        }
        if (best && bestD > 6) {
          c.x += ((best.x - c.x) / bestD) * kind.seek * k
          c.y += ((best.y - best.height * 0.2 - c.y) / bestD) * kind.seek * k
        }
      }
      const r = this.radiusAt(c, time)
      // Une flamme dans le nuage : il s'embrase d'un coup (l'essaim, lui, se disperse).
      if (port.flameNear(c.x, c.y, r, c.kind)) {
        this.remove(c)
        port.blast(c, r)
        continue
      }
      if (kind.dps > 0) {
        for (const t of port.targets) {
          if (t.alive && Math.hypot(t.x - c.x, t.y - c.y) <= r + t.width / 2) port.affect(t, c.kind, kind.dps, dtMs)
        }
      }
    }
  }
}
