import { Guard } from '../../core/utils/Guard.js'
import { MATERIALS } from '../entities/materials.js'
import { TARGET_TYPES } from '../entities/catalog.js'
import { WORLD } from '../physics/constants.js'

/**
 * Outil de construction des niveaux (patron Builder).
 *
 * Les niveaux sont décrits avec des « préfabriqués » médiévaux (pièce, tour,
 * mur, palissade, toit…) qui calculent eux-mêmes les positions exactes des
 * blocs. Le résultat est une simple liste de données, validée puis gelée.
 *
 * Repère : x vers la droite, y vers le bas, `floorY` = niveau du sol d'une pièce.
 */
export class StructureBuilder {
  blocks = []
  targets = []
  barrels = []
  ground = WORLD.GROUND_Y

  #mat(m) {
    return Guard.oneOf(m, Object.keys(MATERIALS), 'material')
  }

  /** Bloc brut (centre x, y). */
  block(material, x, y, w, h, shape = 'rect') {
    this.blocks.push({ material: this.#mat(material), x, y, w, h, shape })
    return this
  }

  /**
   * Pièce : deux piliers et une dalle.
   * @returns {{ x: number, floorY: number, topY: number, w: number }} la pièce (pour y placer cibles et étages)
   */
  room(x, floorY = this.ground, { mat = 'wood', slab = mat, w = 120, h = 100, t = 20 } = {}) {
    const px = w / 2 - t / 2
    this.block(mat, x - px, floorY - h / 2, t, h)
    this.block(mat, x + px, floorY - h / 2, t, h)
    this.block(slab, x, floorY - h - t / 2, w + 10, t)
    return { x, floorY, topY: floorY - h - t, w }
  }

  /**
   * Tour de plusieurs étages. `mats` peut varier le matériau par étage
   * (ex. base en pierre, sommet en bois).
   * @returns {Array<{x:number,floorY:number,topY:number,w:number}>}
   */
  tower(x, { floors = 2, mat = 'wood', mats = null, slab = null, w = 120, h = 100, t = 20, roof = null, floorY = this.ground } = {}) {
    const rooms = []
    let y = floorY
    for (let i = 0; i < floors; i++) {
      const m = mats ? mats[Math.min(i, mats.length - 1)] : mat
      const r = this.room(x, y, { mat: m, slab: slab || m, w, h, t })
      rooms.push(r)
      y = r.topY
    }
    if (roof) this.roof(x, y, { mat: roof, w: w + 10 })
    return rooms
  }

  /** Toit triangulaire posé sur `topY`. */
  roof(x, topY, { mat = 'wood', w = 130, h = 60 } = {}) {
    // Le centre d'un triangle fromVertices est son centroïde (à 1/3 de la base).
    return this.block(mat, x, topY - h / 3, w, h, 'triangle')
  }

  /** Colonne pleine faite de `n` blocs empilés. */
  wall(x, { mat = 'stone', w = 30, h = 160, n = 4, floorY = this.ground } = {}) {
    const seg = h / n
    for (let i = 0; i < n; i++) this.block(mat, x, floorY - seg / 2 - i * seg, w, seg)
    return { x, topY: floorY - h }
  }

  /** Palissade de pieux en bois. */
  palisade(x, { count = 4, h = 130, gap = 26, mat = 'wood' } = {}) {
    for (let i = 0; i < count; i++) this.block(mat, x + i * gap, this.ground - h / 2, 16, h)
    return this
  }

  /** Planche horizontale reliant deux points (pont, passerelle). */
  plank(x1, x2, topY, { mat = 'wood', t = 20 } = {}) {
    return this.block(mat, (x1 + x2) / 2, topY - t / 2, Math.abs(x2 - x1), t)
  }

  /**
   * Pilotis : une plateforme portée par des pieds fins. Point de rupture idéal :
   * casser un pied (souvent en verre ou en paille) fait tomber tout ce qui est dessus.
   * @returns {{ x: number, floorY: number, topY: number, w: number }} la plateforme (comme une pièce)
   */
  stilts(x, { legs = 2, mat = 'wood', deck = 'wood', w = 140, h = 120, legW = 16, t = 20, floorY = this.ground } = {}) {
    const span = w - legW
    for (let i = 0; i < legs; i++) {
      const lx = legs === 1 ? x : x - span / 2 + (span * i) / (legs - 1)
      this.block(mat, lx, floorY - h / 2, legW, h)
    }
    this.block(deck, x, floorY - h - t / 2, w + 10, t)
    return { x, floorY: floorY - h - t, topY: floorY - h - t, w }
  }

  /** Point d'appui quelconque (planche, sommet de tour) où poser cible ou baril. */
  spot(x, floorY) {
    return { x, floorY, topY: floorY, w: 0 }
  }

  /** Socle plein (colline, soubassement) : renvoie le niveau du dessus. */
  base(x, { w = 260, h = 60, mat = 'stone', rows = 2 } = {}) {
    const rh = h / rows
    for (let r = 0; r < rows; r++) {
      const cols = Math.max(1, Math.round(w / 80))
      const cw = w / cols
      for (let c = 0; c < cols; c++) this.block(mat, x - w / 2 + cw / 2 + c * cw, this.ground - rh / 2 - r * rh, cw, rh)
    }
    return this.ground - h
  }

  /** Place une cible debout dans une pièce (dx = décalage horizontal). */
  target(room, type = 'soldier', dx = 0) {
    Guard.oneOf(type, Object.keys(TARGET_TYPES), 'target type')
    const t = TARGET_TYPES[type]
    this.targets.push({ type, x: room.x + dx, y: room.floorY - t.h / 2 - 1 })
    return this
  }

  /** Place un baril de poudre dans une pièce. */
  barrel(room, dx = 0) {
    this.barrels.push({ x: room.x + dx, y: room.floorY - 22 })
    return this
  }

  /** Emprise de la structure : utile pour cadrer la caméra. */
  bounds() {
    const xs = [...this.blocks, ...this.targets, ...this.barrels].map((b) => b.x + (b.w || 30) / 2)
    const ys = [...this.blocks, ...this.targets].map((b) => b.y - (b.h || 60) / 2)
    return { right: Math.max(...xs), top: Math.min(...ys) }
  }
}
