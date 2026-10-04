import { Schema, ValidationError, deepFreeze } from '../../core/utils/Guard.js'
import { MATERIAL_NAMES } from '../entities/materials.js'
import { TARGET_TYPES } from '../entities/catalog.js'
import { WORLD } from '../physics/constants.js'
import { buildLevel } from '../levels/LevelRepository.js'

/**
 * Atelier de châteaux (v4.0) : un château fait de pièces préfabriquées
 * (étage, mur, poutre, toit, socle), de défenseurs et de barils.
 *
 * Chaque pièce se pose sur ce qui se trouve dessous (ou sur le sol) : on
 * construit en empilant, comme avec de vrais blocs. Le château se partage
 * par un code (lien), validé champ par champ à la lecture, puis reconstruit
 * et contrôlé par le même schéma que les 100 niveaux du jeu.
 */

/** Pièces disponibles : emprise au sol, hauteur, et peut-on poser quelque chose dessus ? */
export const PARTS = deepFreeze({
  room: { w: 130, h: 120, support: true, material: true },
  wall: { w: 30, h: 120, support: true, material: true },
  plank: { w: 160, h: 20, support: true, material: true },
  base: { w: 200, h: 60, support: true, material: true },
  roof: { w: 130, h: 60, support: false, material: true },
  soldier: { w: 26, h: TARGET_TYPES.soldier.h + 1, support: false, target: true },
  knight: { w: 30, h: TARGET_TYPES.knight.h + 1, support: false, target: true },
  king: { w: 32, h: TARGET_TYPES.king.h + 1, support: false, target: true },
  barrel: { w: 30, h: 44, support: false },
})
const KINDS = Object.keys(PARTS)

/** Zone constructible (devant : la catapulte ; derrière : le bord du terrain). */
export const ZONE = Object.freeze({ left: 950, right: 2250, top: 230 })
export const LIMITS = Object.freeze({ parts: 60, targets: 12, barrels: 8 })
const AMMO = Object.freeze(['boulder', 'fire', 'bomb', 'split'])

/** Château vide, prêt à construire. */
export function emptyDesign() {
  return { name: '', theme: 1, shots: 4, wind: 0.3, ammo: { boulder: 1, fire: 0, bomb: 1, split: 0 }, parts: [] }
}

const footprint = (p) => ({ left: p.x - PARTS[p.kind].w / 2, right: p.x + PARTS[p.kind].w / 2 })
const topOf = (p) => p.y - PARTS[p.kind].h

/**
 * Hauteur de pose (niveau du sol de la pièce) en x : le dessus de la plus
 * haute pièce porteuse sous son emprise, ou le sol.
 */
export function surfaceAt(design, kind, x) {
  const half = PARTS[kind].w / 2
  let y = WORLD.GROUND_Y
  for (const p of design.parts) {
    if (!PARTS[p.kind].support) continue
    const f = footprint(p)
    // Il faut un vrai recouvrement (au moins 8 px) pour reposer dessus.
    if (Math.min(f.right, x + half) - Math.max(f.left, x - half) >= 8) y = Math.min(y, topOf(p))
  }
  return y
}

/**
 * Ajoute une pièce posée en x (sur ce qui est dessous). Renvoie la pièce, ou
 * null si c'est impossible (hors zone, trop haut, limites atteintes).
 */
export function placePart(design, kind, x, material = 'wood', tapY = null) {
  if (!KINDS.includes(kind) || design.parts.length >= LIMITS.parts) return null
  const def = PARTS[kind]
  const cx = Math.round(Math.min(ZONE.right - def.w / 2, Math.max(ZONE.left + def.w / 2, x)) / 10) * 10
  if (def.target && design.parts.filter((p) => PARTS[p.kind].target).length >= LIMITS.targets) return null
  if (kind === 'barrel' && design.parts.filter((p) => p.kind === 'barrel').length >= LIMITS.barrels) return null
  let y = surfaceAt(design, kind, cx)
  if (!def.support && kind !== 'roof') {
    // Défenseur ou baril : dans l'étage visé s'il y en a un sous le doigt, sinon tout en haut.
    const room = Number.isFinite(tapY) ? design.parts.find((p) => p.kind === 'room' && Math.abs(cx - p.x) <= 45 && tapY <= p.y && tapY >= p.y - 100) : null
    if (room) y = room.y
    else if (design.parts.some((p) => p.kind === 'roof' && Math.abs(cx - p.x) < 60 && p.y === y)) return null // un toit occupe déjà le dessus
    if (design.parts.some((p) => !PARTS[p.kind].support && p.kind !== 'roof' && p.y === y && Math.abs(p.x - cx) < 28)) return null // place déjà prise
  }
  if (y - def.h < ZONE.top) return null
  const part = { kind, x: cx, y, m: def.material ? material : null }
  design.parts.push(part)
  return part
}

/** Retire la pièce la plus haute sous le point (x, y), et tout ce qui reposait dessus. */
export function removeAt(design, x, y) {
  const hit = design.parts
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => {
      const f = footprint(p)
      return x >= f.left && x <= f.right && y <= p.y + 4 && y >= topOf(p) - 4
    })
    .sort((a, b) => topOf(a.p) - topOf(b.p))[0]
  if (!hit) return false
  design.parts.splice(hit.i, 1)
  // Ce qui reposait dessus retombe : on repose tout dans l'ordre de construction.
  const rest = design.parts.splice(0)
  for (const p of rest) placePart(design, p.kind, p.x, p.m ?? 'wood', p.y - 1)
  return true
}

/** Construit le château dans un StructureBuilder (blocs, cibles, barils). */
export function buildInto(b, design) {
  for (const p of design.parts) {
    const m = p.m
    switch (p.kind) {
      case 'room':
        b.room(p.x, p.y, { mat: m, w: 120, h: 100, t: 20 })
        break
      case 'wall':
        b.wall(p.x, { mat: m, w: 30, h: 120, n: 3, floorY: p.y })
        break
      case 'plank':
        b.block(m, p.x, p.y - 10, 160, 20)
        break
      case 'base':
        for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) b.block(m, p.x - 50 + c * 100, p.y - 15 - r * 30, 100, 30)
        break
      case 'roof':
        b.roof(p.x, p.y, { mat: m, w: 130, h: 60 })
        break
      case 'barrel':
        b.barrel(b.spot(p.x, p.y))
        break
      default:
        b.target(b.spot(p.x, p.y), p.kind)
    }
  }
}

/**
 * Niveau jouable à partir d'un château (validé par le schéma des niveaux).
 * @throws si le château est invalide (aucun défenseur, trop de blocs…)
 */
export function buildCustomLevel(design) {
  const ammo = {}
  for (const a of AMMO) if (design.ammo[a] > 0) ammo[a] = design.ammo[a]
  // Graine propre au château : vent et rafales identiques pour tous ceux qui le jouent.
  const salt = design.parts.reduce((h, p) => (Math.imul(h ^ (p.x * 31 + p.y), 16777619) >>> 0) % 100000, 7)
  return buildLevel({ shots: design.shots, wind: design.wind, ammo, par: 1, build: (b) => buildInto(b, design) }, 1, design.theme, salt)
}

/* ---------- Code de partage ---------- */

const KIND_CODE = Object.freeze({ room: 'r', wall: 'w', plank: 'p', base: 'b', roof: 'f', soldier: 's', knight: 'c', king: 'k', barrel: 'o' })
const CODE_KIND = Object.freeze(Object.fromEntries(Object.entries(KIND_CODE).map(([k, v]) => [v, k])))
export const MAX_CASTLE_CODE = 4000

const designSchema = Schema.object(
  {
    v: Schema.enum([1]),
    n: Schema.string({ minLength: 0, maxLength: 16, pattern: /^(?:|[\p{L}\p{N}][\p{L}\p{N} _'-]{0,15})$/u }),
    th: Schema.int({ min: 1, max: 10 }),
    s: Schema.int({ min: 1, max: 12 }),
    w: Schema.int({ min: 0, max: 20 }),
    a: Schema.array(Schema.int({ min: 0, max: 5 }), { maxLength: AMMO.length }),
    p: Schema.array((raw) => raw, { maxLength: LIMITS.parts }),
  },
  { strict: true },
)

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function fromBase64Url(code) {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

export class CastleCode {
  /** @returns {string} code base64url du château */
  static encode(design) {
    const data = {
      v: 1,
      n: design.name || '',
      th: design.theme,
      s: design.shots,
      w: Math.round(design.wind * 20),
      a: AMMO.map((x) => design.ammo[x] || 0),
      p: design.parts.map((p) => (PARTS[p.kind].material ? [KIND_CODE[p.kind], p.x, p.y, MATERIAL_NAMES.indexOf(p.m)] : [KIND_CODE[p.kind], p.x, p.y])),
    }
    const code = toBase64Url(JSON.stringify(data))
    CastleCode.decode(code, { draft: true }) // même contrôle qu'à la lecture
    return code
  }

  /**
   * Décode et valide un château reçu (donnée non fiable).
   * @returns {{ name, theme, shots, wind, ammo, parts }}
   */
  static decode(code, { draft = false } = {}) {
    if (typeof code !== 'string' || !code || code.length > MAX_CASTLE_CODE || !/^[A-Za-z0-9_-]+$/.test(code)) throw new ValidationError('castle', 'invalid format')
    let raw
    try {
      raw = JSON.parse(fromBase64Url(code))
    } catch {
      throw new ValidationError('castle', 'unreadable')
    }
    const d = designSchema(raw, 'castle')
    const parts = d.p.map((x, i) => {
      if (!Array.isArray(x) || x.length < 3 || x.length > 4) throw new ValidationError(`castle.p.${i}`, 'part expected')
      const kind = CODE_KIND[x[0]]
      if (!kind) throw new ValidationError(`castle.p.${i}`, 'unknown part')
      const def = PARTS[kind]
      const px = Schema.int({ min: ZONE.left, max: ZONE.right })(x[1], `castle.p.${i}.x`)
      const py = Schema.int({ min: ZONE.top, max: WORLD.GROUND_Y })(x[2], `castle.p.${i}.y`)
      if (Boolean(def.material) !== (x.length === 4)) throw new ValidationError(`castle.p.${i}`, 'material mismatch')
      const m = def.material ? MATERIAL_NAMES[Schema.int({ min: 0, max: MATERIAL_NAMES.length - 1 })(x[3], `castle.p.${i}.m`)] : null
      return { kind, x: px, y: py, m }
    })
    const design = { name: d.n, theme: d.th, shots: d.s, wind: d.w / 20, ammo: Object.fromEntries(AMMO.map((x, i) => [x, d.a[i] ?? 0])), parts }
    if (draft) return design // brouillon de l'atelier : il peut ne pas encore avoir de défenseur
    if (!parts.some((p) => PARTS[p.kind].target)) throw new ValidationError('castle', 'no defender')
    if (parts.filter((p) => PARTS[p.kind].target).length > LIMITS.targets || parts.filter((p) => p.kind === 'barrel').length > LIMITS.barrels) throw new ValidationError('castle', 'too many')
    buildCustomLevel(design) // le schéma des niveaux a le dernier mot (nombre de blocs, coordonnées…)
    return design
  }
}
