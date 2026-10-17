/**
 * Ciels vivants (v6.3) : ce que l'on lit dans une peinture pour l'animer.
 *
 * Fonctions pures sur des pixels RVBA (`{ w, h, data }`, comme un ImageData) :
 * aucune dépendance au navigateur, donc testées sous Node. Elles rendent des
 * masques (RVBA, prêts à devenir des images) ou des listes de points, en part
 * de l'image (u, v ∈ [0, 1]). Le dessin est ailleurs (voir SkyLibrary.js).
 *
 * Toutes travaillent sur une peinture ramenée à 1280 px de large (ou 640 pour
 * les relevés sur une grille) : assez fin pour les rayons, assez léger pour
 * tenir en quelques dizaines de millisecondes au chargement du chapitre.
 */

const TAU = Math.PI * 2
const clamp01 = (v) => Math.max(0, Math.min(1, v))
/** Luminance perçue d'un pixel (indice du rouge dans `data`). */
export const lumAt = (data, i) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]

/**
 * Étoiles : points nettement plus clairs que leur entourage, dans le ciel (au
 * plus 90, les plus brillantes d'abord).
 * @param {{ w: number, h: number, data: Uint8ClampedArray }} px peinture à 1280 px de large
 * @param {number} ground ligne de sol de la peinture (part de la hauteur)
 * @param {() => number} rand hasard (phases du scintillement)
 */
export function findStars({ w, h, data }, ground, rand) {
  const lum = (x, y) => lumAt(data, (y * w + x) * 4)
  const out = []
  for (let y = 4; y < h * ground * 0.62; y++) {
    for (let x = 4; x < w - 4; x++) {
      const l = lum(x, y)
      if (l < 150) continue
      let max = true
      for (let dy = -2; dy <= 2 && max; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if ((dx || dy) && lum(x + dx, y + dy) > l) {
            max = false
            break
          }
        }
      }
      if (!max) continue
      const ring = (lum(x - 4, y) + lum(x + 4, y) + lum(x, y - 4) + lum(x, y + 4)) / 4
      if (l - ring < 55) continue
      out.push({ u: x / w, v: y / h, b: clamp01((l - ring) / 150), ph: rand() * TAU, f: 0.25 + 0.65 * rand() })
    }
  }
  return out.sort((a, b) => b.b - a.b).slice(0, 90)
}

/**
 * Lave : les pixels chauds (rouge fort, bleu faible), en masque lumineux, et
 * quelques points d'où partent les braises.
 * @returns {{ w: number, h: number, rgba: Uint8ClampedArray, spots: Array<{u:number,v:number}> }}
 */
export function lavaMask({ w, h, data }) {
  const rgba = new Uint8ClampedArray(w * h * 4)
  const spots = []
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    const score = clamp01((r - b - 95) / 110) * clamp01((r - 150) / 70)
    if (score <= 0) continue
    rgba[i * 4] = 255
    rgba[i * 4 + 1] = Math.min(255, 110 + g * 0.55)
    rgba[i * 4 + 2] = 40
    rgba[i * 4 + 3] = Math.round(255 * score)
    if (score > 0.55 && i % 7 === 0) spots.push({ u: (i % w) / w, v: Math.floor(i / w) / h })
  }
  return { w, h, rgba, spots }
}

/**
 * Soleil : le disque le plus clair près de sa place peinte.
 * @param {{ w: number, h: number, data: Uint8ClampedArray }} px peinture (640 px de large suffisent)
 * @param {[number, number]} at place approximative (u, v)
 * @returns {{ u: number, v: number, r: number }} centre et rayon, en part de la largeur pour r
 */
export function findSun({ w, h, data }, [u, v]) {
  const R = 0.06 * w
  let n = 0
  let sx = 0
  let sy = 0
  for (let y = Math.max(0, Math.floor(v * h - R)); y < Math.min(h, Math.ceil(v * h + R)); y++) {
    for (let x = Math.max(0, Math.floor(u * w - R)); x < Math.min(w, Math.ceil(u * w + R)); x++) {
      if (lumAt(data, (y * w + x) * 4) >= 250) {
        n++
        sx += x
        sy += y
      }
    }
  }
  return n ? { u: sx / n / w, v: sy / n / h, r: Math.sqrt(n / Math.PI) / w } : { u, v, r: 0.02 }
}

/**
 * Rayons peints : les traits clairs qui partent du soleil (plus clairs que
 * leurs deux voisins de part et d'autre, et prolongés vers lui). Trois masques
 * par secteurs entrelacés, pour qu'ils scintillent chacun à son tour : la
 * peinture s'anime, sans rayon ajouté.
 * @param {{ w: number, h: number, data: Uint8ClampedArray }} px peinture à 1280 px de large
 * @param {{ u: number, v: number, r: number }} sun
 * @param {[number, number, number]} tint couleur de la lumière
 * @param {{ side?: number, spread?: number, reach?: number, cone?: [number, number] | null }} [opts]
 *  side, spread : demi-largeur sondée (px, plus spread × distance) ; reach : portée (part de la
 *  largeur) ; cone : éventail gardé, en degrés (axe des y vers le bas)
 * @returns {{ w: number, h: number, reach: number, layers: Uint8ClampedArray[], box: number[] } | null}
 */
export function rayMasks({ w, h, data }, sun, tint, { side = 5, spread = 0.012, reach = 0.42, cone = null } = {}, groups = 3) {
  const L = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) L[i] = lumAt(data, i * 4)
  const at = (x, y) => {
    const xi = Math.round(x)
    const yi = Math.round(y)
    return xi < 0 || yi < 0 || xi >= w || yi >= h ? 999 : L[yi * w + xi]
  }
  const sides = (x, y, px, py, off) => Math.max(at(x + px * off, y + py * off), at(x - px * off, y - py * off))
  const cx = sun.u * w
  const cy = sun.v * h
  const r0 = Math.max(12, sun.r * w * 1.6)
  const R = reach * w
  const layers = Array.from({ length: groups }, () => new Uint8ClampedArray(w * h * 4))
  let bx0 = w
  let by0 = h
  let bx1 = 0
  let by1 = 0
  for (let y = Math.max(0, Math.floor(cy - R)); y < Math.min(h, Math.ceil(cy + R)); y++) {
    for (let x = Math.max(0, Math.floor(cx - R)); x < Math.min(w, Math.ceil(cx + R)); x++) {
      const dx = x - cx
      const dy = y - cy
      const d = Math.hypot(dx, dy)
      if (d < r0 || d > R) continue
      if (cone) {
        const deg = (Math.atan2(dy, dx) * 180) / Math.PI
        if (deg < cone[0] || deg > cone[1]) continue
      }
      const ax = dx / d
      const ay = dy / d
      const off = side + d * spread
      const c = L[y * w + x] - sides(x, y, -ay, ax, off)
      if (c < 7) continue
      let along = 0
      for (const s of [-12, -6, 6, 12]) {
        const xx = x + ax * s
        const yy = y + ay * s
        if (at(xx, yy) - sides(xx, yy, -ay, ax, off) > 3) along++
      }
      if (along < 3) continue
      const strength = clamp01((c - 7) / 16) * clamp01((R - d) / (0.3 * R)) * clamp01((d - r0) / (0.5 * r0))
      if (strength <= 0) continue
      const o = layers[Math.floor(((Math.atan2(dy, dx) + Math.PI) / TAU) * 27) % groups]
      const i = (y * w + x) * 4
      o[i] = tint[0]
      o[i + 1] = tint[1]
      o[i + 2] = tint[2]
      o[i + 3] = Math.round(255 * strength)
      if (x < bx0) bx0 = x
      if (x > bx1) bx1 = x
      if (y < by0) by0 = y
      if (y > by1) by1 = y
    }
  }
  return bx1 > bx0 ? { w, h, reach, layers, box: [bx0, by0, bx1 + 1, by1 + 1] } : null
}

/**
 * Herbe (vert franc), bruyère (pourpre) et herbe dorée (ocre) : là où passent
 * les risées, en masque teinté de la lumière qui les traverse.
 * @param {{ from: number, tint: number[], kinds: string[] }} cfg from : haut de la zone (part de la hauteur)
 * @returns {{ w: number, h: number, top: number, rgba: Uint8ClampedArray }}
 */
export function grassMask({ w, h, data }, cfg) {
  const rgba = new Uint8ClampedArray(w * h * 4)
  const y0 = Math.floor(cfg.from * h)
  const grass = cfg.kinds.includes('grass')
  const heather = cfg.kinds.includes('heather')
  const gold = cfg.kinds.includes('gold')
  for (let y = y0; y < h; y++) {
    const fade = clamp01((y - y0) / (0.06 * h))
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      let s = 0
      if (grass) s = Math.max(s, clamp01((g - Math.max(r, b) - 6) / 30) * clamp01((g - 70) / 60))
      if (heather) s = Math.max(s, clamp01((Math.min(r, b) - g - 6) / 26) * clamp01((r - 70) / 60))
      if (gold) s = Math.max(s, clamp01((Math.min(r, g) - b - 40) / 50) * clamp01((g - 110) / 60) * clamp01((70 - Math.abs(r - g)) / 30))
      if (s <= 0) continue
      rgba[i] = cfg.tint[0]
      rgba[i + 1] = cfg.tint[1]
      rgba[i + 2] = cfg.tint[2]
      rgba[i + 3] = Math.round(255 * s * fade)
    }
  }
  return { w, h, top: y0, rgba }
}

/**
 * Points d'une matière, relevés sur une grille (un tous les 3 px, une ligne sur deux).
 * @param {{ from: number, to?: number, maxU?: number }} zone en part de l'image
 * @param {(lum: number, sat: number, near: (dx: number, dy: number) => number) => boolean} test
 * @returns {Array<{ u: number, v: number }>}
 */
export function spotsWhere({ w, h, data }, { from, to = 1, maxU = 1 }, test) {
  const lum = (x, y) => lumAt(data, (y * w + x) * 4)
  const out = []
  for (let y = Math.max(3, Math.floor(from * h)); y < Math.min(h - 3, to * h); y += 2) {
    for (let x = 3; x < Math.min(w - 3, maxU * w); x += 3) {
      const i = (y * w + x) * 4
      const sat = Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2])
      if (test(lum(x, y), sat, (dx, dy) => lum(x + dx, y + dy))) out.push({ u: x / w, v: y / h })
    }
  }
  return out
}

/** Eau calme : claire, grise, lisse (de part et d'autre comme dessus et dessous). */
export const isWater = (l, sat, near) => l >= 170 && l <= 248 && sat <= 30 && Math.abs(near(3, 0) - l) <= 6 && Math.abs(near(-3, 0) - l) <= 6 && Math.abs(near(0, 2) - l) <= 8 && Math.abs(near(0, -2) - l) <= 8
/** Neige au soleil : très claire et grise. */
export const isSnow = (l, sat) => l >= 232 && sat <= 26

/**
 * Cascade : l'eau claire de la peinture, dans sa boîte.
 * @param {[number, number, number, number]} box [u0, v0, u1, v1]
 * @returns {{ w: number, x0: number, y0: number, bw: number, bh: number, rgba: Uint8ClampedArray }}
 */
export function fallsMask({ w, h, data }, [u0, v0, u1, v1]) {
  const x0 = Math.floor(u0 * w)
  const y0 = Math.floor(v0 * h)
  const bw = Math.min(w, Math.ceil(u1 * w)) - x0
  const bh = Math.min(h, Math.ceil(v1 * h)) - y0
  const rgba = new Uint8ClampedArray(bw * bh * 4)
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const i = ((y0 + y) * w + x0 + x) * 4
      const l = lumAt(data, i)
      const sat = Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2])
      const s = clamp01((l - 170) / 40) * clamp01((70 - sat) / 30)
      if (s <= 0) continue
      const o = (y * bw + x) * 4
      rgba[o] = rgba[o + 1] = rgba[o + 2] = 255
      rgba[o + 3] = Math.round(255 * s)
    }
  }
  return { w, x0, y0, bw, bh, rgba }
}
