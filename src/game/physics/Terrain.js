import { Guard, deepFreeze } from '../../core/utils/Guard.js'

/**
 * Terrains du champ de bataille (v5.0) : des bandes de sol aux règles propres.
 *
 *  - lac   : un boulet qui touche l'eau ricoche UNE fois, puis coule au second
 *            contact. Un défenseur qui y tombe se noie. Le givre le fige en
 *            glace (on ne s'y noie plus, on y glisse) ; le feu fait fondre la glace ;
 *  - lave  : tout projectile y fond, sauf le boulet de givre, qui la fige en
 *            une croûte d'obsidienne (une roche sur laquelle les tirs suivants
 *            rebondissent). Les défenseurs y brûlent, le bois s'y enflamme ;
 *  - neige : le boulet y roule sans s'arrêter et grossit en boule de neige
 *            (plus lourd, il frappe plus fort). Un boulet de feu la fait fondre
 *            là où il tombe : il s'y éteint dans un nuage de vapeur.
 *
 * Les montagnes, elles, sont de la roche (materials.rock) : fixes et indestructibles.
 */
export const ZONE_KINDS = Object.freeze(['lake', 'ice', 'lava', 'snow'])

/** Réglages des terrains. */
export const TERRAIN = deepFreeze({
  /** Lac : rebond (part de la vitesse gardée) et vitesse verticale minimale du rebond. */
  SKIP_KEEP_X: 0.82,
  SKIP_KEEP_Y: 0.55,
  SKIP_MIN_VY: 2.2,
  /** Neige : croissance de la boule (par unité parcourue) et taille maximale. */
  SNOW_GROWTH: 0.0011,
  SNOW_MAX: 1.7,
  /** Largeur de neige fondue par un boulet de feu, de glace fondue, de lave figée. */
  MELT_HALF: 70,
  CRUST_W: 96,
})

export class TerrainZones {
  /** @type {{ kind: string, x0: number, x1: number }[]} */
  #zones = []
  /** Compteur de modifications (le rendu redessine le sol quand il change). */
  version = 0

  /** @param {ReadonlyArray<{ kind: string, x0: number, x1: number }>} [zones] */
  constructor(zones = []) {
    if (!Array.isArray(zones) || zones.length > 12) throw new TypeError('zones: expected an array of at most 12 zones')
    for (const z of zones) this.#add(z.kind, z.x0, z.x1)
  }

  #add(kind, x0, x1) {
    Guard.oneOf(kind, ZONE_KINDS, 'zone kind')
    Guard.number(x0, 'zone x0', { min: -2000, max: 5000 })
    Guard.number(x1, 'zone x1', { min: -2000, max: 5000 })
    if (x1 - x0 >= 8) this.#zones.push({ kind, x0, x1 })
    this.#zones.sort((a, b) => a.x0 - b.x0)
  }

  /** Copie des bandes (pour le rendu). */
  get list() {
    return this.#zones.map((z) => ({ ...z }))
  }

  get empty() {
    return this.#zones.length === 0
  }

  /**
   * Terrain sous l'abscisse x.
   * @returns {{ kind: string, x0: number, x1: number } | null}
   */
  at(x) {
    if (!Number.isFinite(x)) return null
    return this.#zones.find((z) => x >= z.x0 && x <= z.x1) ?? null
  }

  /** Le lac entier se fige (givre) ou fond (feu). */
  convert(zone, kind) {
    Guard.oneOf(kind, ZONE_KINDS, 'zone kind')
    const z = this.#zones.find((it) => it.x0 === zone?.x0 && it.x1 === zone?.x1)
    if (!z || z.kind === kind) return false
    z.kind = kind
    this.version++
    return true
  }

  /**
   * Retire (ou remplace) une portion de terrain autour de x : la neige fond là
   * où tombe le feu. La bande est coupée en deux.
   */
  carve(x, half, kind = null) {
    const z = this.at(x)
    if (!z) return false
    const a = Math.max(z.x0, x - half)
    const b = Math.min(z.x1, x + half)
    this.#zones = this.#zones.filter((it) => it !== z)
    if (a - z.x0 >= 8) this.#zones.push({ kind: z.kind, x0: z.x0, x1: a })
    if (z.x1 - b >= 8) this.#zones.push({ kind: z.kind, x0: b, x1: z.x1 })
    if (kind) this.#zones.push({ kind, x0: a, x1: b })
    this.#zones.sort((p, q) => p.x0 - q.x0)
    this.version++
    return true
  }
}
