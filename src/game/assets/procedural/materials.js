/**
 * Matériaux réalistes des châteaux (v4.5).
 *
 * Chaque bloc reçoit un appareillage AJUSTÉ à ses dimensions (assises de
 * pierre, briques en quinconce, planches, bottes de chaume, vitrail au plomb,
 * tôles rivetées…), peint à partir de textures générées pixel par pixel.
 * L'image d'un bloc est fabriquée une fois (par matériau, taille et variante),
 * puis recopiée ; fissures, brûlures et contours restent dessinés à chaque image.
 */
import { SeededRandom } from '../../../core/utils/SeededRandom.js'
import { TAU, EDGE, roundRect, lightOver, metalGradient, rivet, rope, woodPattern, ironPattern, noise, fbm, tile, pattern, cachedBudget } from './realism.js'

/* ---------- Textures de base (256 × 256 pixels = 128 unités) ---------- */

const SIZE = 256
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v)

function grain(name, fn) {
  return tile(`mat.${name}`, SIZE, SIZE, (d, w, h) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const [r, g, b, a = 255] = fn(x / w, y / h)
        const k = (y * w + x) * 4
        d[k] = clamp(r)
        d[k + 1] = clamp(g)
        d[k + 2] = clamp(b)
        d[k + 3] = a
      }
    }
  })
}

const GRAINS = {
  stone: () =>
    grain('stone', (u, v) => {
      const m = fbm(u * 4, v * 4, 41, 4, 4, 3)
      const f = noise(u * 128, v * 128, 43, 128, 128) - 0.5
      const pit = noise(u * 48, v * 48, 47, 48, 48) > 0.84 ? -28 : 0
      const t = fbm(u * 2, v * 2, 53, 2, 2, 2) - 0.5
      const l = 0.78 + m * 0.42
      return [138 * l + f * 22 + pit + t * 16, 132 * l + f * 22 + pit, 122 * l + f * 22 + pit - t * 16]
    }),
  brick: () =>
    grain('brick', (u, v) => {
      const m = fbm(u * 6, v * 6, 141, 6, 6, 3)
      const f = noise(u * 160, v * 160, 143, 160, 160) - 0.5
      const speck = noise(u * 64, v * 64, 147, 64, 64) > 0.86 ? 30 : 0
      const l = 0.82 + m * 0.34
      return [166 * l + f * 26 + speck, 84 * l + f * 18 + speck * 0.8, 54 * l + f * 14 + speck * 0.6]
    }),
  sandstone: () =>
    grain('sandstone', (u, v) => {
      const band = Math.sin((v * 16 + fbm(u * 3, v * 3, 61, 3, 3, 3) * 1.8) * Math.PI) * 0.5 + 0.5
      const f = noise(u * 140, v * 140, 63, 140, 140) - 0.5
      const pit = noise(u * 40, v * 40, 67, 40, 40) > 0.87 ? -22 : 0
      return [182 + band * 34 + f * 20 + pit, 140 + band * 36 + f * 18 + pit, 90 + band * 30 + f * 14 + pit]
    }),
  marble: () =>
    grain('marble', (u, v) => {
      const t = fbm(u * 3, v * 3, 71, 3, 3, 5)
      const vein = Math.pow(1 - Math.abs(Math.sin((u * 4 + v * 2 + t * 5) * Math.PI)), 14)
      const fine = Math.pow(1 - Math.abs(Math.sin((u * 9 - v * 5 + t * 7) * Math.PI)), 30) * 0.5
      const m = fbm(u * 5, v * 5, 73, 5, 5, 2) - 0.5
      const k = Math.min(1, vein + fine)
      return [236 + m * 10 - k * 120, 233 + m * 10 - k * 116, 226 + m * 8 - k * 112]
    }),
  straw: () =>
    grain('straw', (u, v) => {
      const n = noise(u * 6, v * 110, 81, 6, 110)
      const n2 = noise(u * 14, v * 60, 83, 14, 60)
      const gap = n < 0.22 ? -60 : 0
      const l = 0.75 + n * 0.3 + n2 * 0.15
      return [232 * l + gap, 192 * l + gap, 98 * l + gap * 0.6]
    }),
  ice: () =>
    grain('ice', (u, v) => {
      const c = fbm(u * 3, v * 3, 91, 3, 3, 4)
      const crack = Math.abs(noise(u * 10, v * 10, 93, 10, 10) - 0.5) < 0.012 ? 60 : 0
      return [176 + c * 50 + crack, 214 + c * 34 + crack, 238 + c * 16 + crack * 0.3]
    }),
  glass: () =>
    grain('glass', (u, v) => {
      const c = fbm(u * 2, v * 2, 101, 2, 2, 3)
      return [140 + c * 40, 190 + c * 30, 206 + c * 24]
    }),
}

const grainCache = new Map()

/** Prépare la texture d'un matériau à l'avance (pendant le chargement du jeu). */
export function warmMaterial(name) {
  if (GRAINS[name] && !grainCache.has(name)) grainCache.set(name, GRAINS[name]())
}

function grainPattern(g, name, { x = 0, y = 0, angle = 0 } = {}) {
  if (!grainCache.has(name)) grainCache.set(name, GRAINS[name]())
  return pattern(g, grainCache.get(name), { x, y, angle, unitsPerTile: 128 })
}

/* ---------- Outils ---------- */

/** Pierre taillée : texture, teinte propre, arêtes éclairées et ombrées, éclats. */
function cutStone(g, x0, y0, x1, y1, name, r, { bevel = 1.3, chips = true, radius = 1.2 } = {}) {
  const w = x1 - x0
  const h = y1 - y0
  if (w < 1 || h < 1) return
  g.beginPath()
  roundRect(g, x0, y0, w, h, radius)
  g.fillStyle = grainPattern(g, name, { x: r.range(0, 128), y: r.range(0, 128) })
  g.fill()
  const tone = r.range(-0.14, 0.12)
  g.fillStyle = tone > 0 ? `rgba(255,248,235,${tone})` : `rgba(20,14,8,${-tone})`
  g.fill()
  lightOver(g, x0, y0, x1, y1, 0.16, 0.28)
  // Arêtes : lumière en haut à gauche, ombre en bas à droite.
  g.save()
  g.clip()
  g.fillStyle = 'rgba(255,250,235,0.32)'
  g.fillRect(x0, y0, w, bevel)
  g.fillRect(x0, y0, bevel, h)
  g.fillStyle = 'rgba(0,0,0,0.3)'
  g.fillRect(x0, y1 - bevel, w, bevel)
  g.fillRect(x1 - bevel, y0, bevel, h)
  // Coups de ciseau et éclats.
  if (chips) {
    g.strokeStyle = 'rgba(255,250,235,0.22)'
    g.lineWidth = 0.4
    for (let i = 0; i < Math.round(w * h / 160); i++) {
      const cx = r.range(x0 + 2, x1 - 2)
      const cy = r.range(y0 + 2, y1 - 2)
      g.beginPath()
      g.moveTo(cx, cy)
      g.lineTo(cx + 1.6, cy - 1)
      g.stroke()
    }
    if (r.chance(0.35)) {
      const cx = r.chance(0.5) ? x0 : x1
      const cy = r.chance(0.5) ? y0 : y1
      g.beginPath()
      g.moveTo(cx, cy)
      g.lineTo(cx + (cx === x0 ? 3.5 : -3.5), cy)
      g.lineTo(cx, cy + (cy === y0 ? 2.8 : -2.8))
      g.closePath()
      g.fillStyle = 'rgba(40,34,28,0.55)'
      g.fill()
    }
  }
  g.restore()
}

/** Appareillage en assises : rangées de pierres (ou briques) en quinconce. */
function coursed(g, w, h, r, { name, mortar, courseH, minLen, maxLen, gap, bevel, radius, chips = true }) {
  g.fillStyle = mortar
  g.fillRect(-w / 2, -h / 2, w, h)
  const rows = Math.max(1, Math.round(h / courseH))
  const ch = h / rows
  for (let j = 0; j < rows; j++) {
    const y0 = -h / 2 + j * ch
    let x = -w / 2
    // Quinconce : une rangée sur deux commence par une demi-pierre.
    let first = j % 2 ? r.range(minLen * 0.35, minLen * 0.7) : r.range(minLen, maxLen)
    while (x < w / 2 - 0.5) {
      let len = first
      first = r.range(minLen, maxLen)
      if (w / 2 - (x + len) < minLen * 0.45) len = w / 2 - x
      cutStone(g, x + gap / 2, y0 + gap / 2, Math.min(w / 2, x + len) - gap / 2, y0 + ch - gap / 2, name, r, { bevel, radius, chips })
      x += len
    }
  }
}

/** Les matériaux « en long » (bois, chaume, fer) suivent le grand côté du bloc. */
function alongLength(g, w, h, draw) {
  if (h > w) {
    g.save()
    g.rotate(Math.PI / 2)
    draw(h, w)
    g.restore()
  } else draw(w, h)
}

/* ---------- Matériaux ---------- */

const PAINT = {
  stone(g, w, h, r) {
    coursed(g, w, h, r, { name: 'stone', mortar: '#5f5a52', courseH: 22, minLen: 26, maxLen: 46, gap: 1.6, bevel: 1.4, radius: 1.4 })
    // Salissures : coulures plus sombres vers le bas.
    const dirt = g.createLinearGradient(0, -h / 2, 0, h / 2)
    dirt.addColorStop(0, 'rgba(0,0,0,0)')
    dirt.addColorStop(1, 'rgba(40,36,26,0.18)')
    g.fillStyle = dirt
    g.fillRect(-w / 2, -h / 2, w, h)
  },
  brick(g, w, h, r) {
    coursed(g, w, h, r, { name: 'brick', mortar: '#b8ae9c', courseH: 8.5, minLen: 18, maxLen: 18, gap: 1.2, bevel: 0.8, radius: 0.6, chips: false })
    // Briques plus cuites (sombres) ou plus claires, au hasard.
    g.fillStyle = 'rgba(60,18,8,0.22)'
    for (let i = 0; i < Math.round((w * h) / 300); i++) g.fillRect(r.range(-w / 2, w / 2 - 8), r.range(-h / 2, h / 2 - 4), 8, 3.6)
  },
  sandstone(g, w, h, r) {
    coursed(g, w, h, r, { name: 'sandstone', mortar: '#9a7f57', courseH: 26, minLen: 38, maxLen: 62, gap: 1.1, bevel: 1.6, radius: 2.2 })
  },
  marble(g, w, h, r) {
    coursed(g, w, h, r, { name: 'marble', mortar: '#c4beb2', courseH: 44, minLen: 54, maxLen: 80, gap: 0.6, bevel: 1, radius: 0.8, chips: false })
    // Poli : reflet diagonal.
    const gloss = g.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2)
    gloss.addColorStop(0, 'rgba(255,255,255,0)')
    gloss.addColorStop(0.42, 'rgba(255,255,255,0)')
    gloss.addColorStop(0.5, 'rgba(255,255,255,0.28)')
    gloss.addColorStop(0.58, 'rgba(255,255,255,0)')
    gloss.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gloss
    g.fillRect(-w / 2, -h / 2, w, h)
  },
  wood(g, w, h, r) {
    alongLength(g, w, h, (L, T) => {
      g.fillStyle = '#2a1a0e'
      g.fillRect(-L / 2, -T / 2, L, T)
      const n = Math.max(1, Math.round(T / 10))
      const pw = T / n
      for (let i = 0; i < n; i++) {
        const y0 = -T / 2 + i * pw
        // Une planche peut être aboutée à une autre sur les grands blocs.
        const cuts = L > 80 ? [r.range(-L * 0.2, L * 0.2)] : []
        const xs = [-L / 2, ...cuts, L / 2]
        for (let k = 0; k < xs.length - 1; k++) {
          const a = xs[k] + (k ? 0.5 : 0)
          const b = xs[k + 1] - (k < xs.length - 2 ? 0.5 : 0)
          g.beginPath()
          roundRect(g, a, y0 + 0.45, b - a, pw - 0.9, 0.8)
          g.fillStyle = woodPattern(g, { x: r.range(0, 300), y: r.range(0, 100), unitsPerTile: 240 })
          g.fill()
          const t = r.range(-0.12, 0.1)
          g.fillStyle = t > 0 ? `rgba(255,230,190,${t})` : `rgba(30,15,5,${-t})`
          g.fill()
          const sh = g.createLinearGradient(0, y0, 0, y0 + pw)
          sh.addColorStop(0, 'rgba(255,230,190,0.28)')
          sh.addColorStop(0.25, 'rgba(255,230,190,0)')
          sh.addColorStop(1, 'rgba(0,0,0,0.32)')
          g.fillStyle = sh
          g.fill()
          // Clous aux extrémités.
          for (const nx of [a + 2.6, b - 2.6]) if (b - a > 8) rivet(g, nx, y0 + pw / 2, Math.min(0.75, pw * 0.12), '#5a5550')
        }
      }
    })
  },
  straw(g, w, h, r) {
    alongLength(g, w, h, (L, T) => {
      g.fillStyle = grainPattern(g, 'straw', { x: r.range(0, 128), y: r.range(0, 128) })
      g.fillRect(-L / 2, -T / 2, L, T)
      const sh = g.createLinearGradient(0, -T / 2, 0, T / 2)
      sh.addColorStop(0, 'rgba(255,240,190,0.25)')
      sh.addColorStop(0.5, 'rgba(0,0,0,0)')
      sh.addColorStop(1, 'rgba(60,35,0,0.35)')
      g.fillStyle = sh
      g.fillRect(-L / 2, -T / 2, L, T)
      // Liens de ficelle : la paille y est serrée (plus sombre de part et d'autre).
      const n = Math.max(1, Math.round(L / 28))
      for (let i = 0; i < n; i++) {
        const x = -L / 2 + (i + 0.5) * (L / n) + r.range(-2, 2)
        const shade = g.createLinearGradient(x - 6, 0, x + 6, 0)
        shade.addColorStop(0, 'rgba(60,35,0,0)')
        shade.addColorStop(0.5, 'rgba(60,35,0,0.35)')
        shade.addColorStop(1, 'rgba(60,35,0,0)')
        g.fillStyle = shade
        g.fillRect(x - 6, -T / 2, 12, T)
        rope(g, [{ x: x - 0.6, y: -T / 2 }, { x: x + 0.6, y: T / 2 }], 1.3, '#8a6a3c')
      }
      // Brins qui dépassent.
      g.strokeStyle = 'rgba(250,220,130,0.7)'
      g.lineWidth = 0.4
      for (let i = 0; i < Math.round(L / 4); i++) {
        const x = r.range(-L / 2, L / 2)
        const y = r.chance(0.5) ? -T / 2 + 0.6 : T / 2 - 0.6
        g.beginPath()
        g.moveTo(x, y)
        g.lineTo(x + r.range(-4, 4), y + r.range(-1.2, 1.2))
        g.stroke()
      }
    })
  },
  iron(g, w, h, r) {
    alongLength(g, w, h, (L, T) => {
      const n = Math.max(1, Math.round(L / 40))
      const pl = L / n
      for (let i = 0; i < n; i++) {
        const x0 = -L / 2 + i * pl
        g.beginPath()
        g.rect(x0, -T / 2, pl, T)
        g.fillStyle = ironPattern(g, { x: r.range(0, 48), y: r.range(0, 48) })
        g.fill()
        g.globalAlpha = 0.55
        g.fillStyle = metalGradient(g, 0, -T / 2, 0, T / 2, '#6b717b')
        g.fill()
        g.globalAlpha = 1
        g.strokeStyle = 'rgba(10,10,12,0.75)'
        g.lineWidth = 0.7
        g.stroke()
        // Rivets le long des bords et coulures de rouille.
        for (let x = x0 + 3; x < x0 + pl - 2; x += 6) {
          for (const y of [-T / 2 + 2.4, T / 2 - 2.4]) {
            if (T < 6 && y > 0) continue
            rivet(g, x, y, 0.85, '#6b717b')
            if (r.chance(0.25)) {
              const rust = g.createLinearGradient(0, y, 0, y + 9)
              rust.addColorStop(0, 'rgba(150,72,28,0.55)')
              rust.addColorStop(1, 'rgba(150,72,28,0)')
              g.fillStyle = rust
              g.fillRect(x - 0.7, y + 0.8, 1.4, 9)
            }
          }
        }
      }
    })
  },
  glass(g, w, h, r) {
    // Vitrail : losanges sertis de plomb, verre translucide légèrement teinté.
    g.globalAlpha = 0.62
    g.fillStyle = grainPattern(g, 'glass', { x: r.range(0, 128), y: r.range(0, 128) })
    g.fillRect(-w / 2, -h / 2, w, h)
    g.globalAlpha = 1
    const step = 9
    for (let i = -Math.ceil((w + h) / step); i <= Math.ceil((w + h) / step); i++) {
      if (r.chance(0.3)) {
        // Quelques losanges d'une autre teinte.
        g.save()
        g.beginPath()
        const cx = i * step * 0.5
        g.moveTo(cx, -step * 0.6)
        g.lineTo(cx + step * 0.5, 0)
        g.lineTo(cx, step * 0.6)
        g.lineTo(cx - step * 0.5, 0)
        g.closePath()
        g.fillStyle = r.pick(['rgba(255,230,150,0.25)', 'rgba(150,220,180,0.22)', 'rgba(255,255,255,0.18)'])
        g.translate(0, r.range(-h / 2, h / 2))
        g.fill()
        g.restore()
      }
    }
    g.strokeStyle = '#3b3e46'
    g.lineWidth = 1.1
    g.beginPath()
    for (let x = -w / 2 - h; x < w / 2 + h; x += step) {
      g.moveTo(x, -h / 2)
      g.lineTo(x + h * 0.7, h / 2)
      g.moveTo(x, h / 2)
      g.lineTo(x + h * 0.7, -h / 2)
    }
    g.stroke()
    g.strokeStyle = 'rgba(200,210,220,0.4)'
    g.lineWidth = 0.35
    g.stroke()
    // Reflet.
    const gl = g.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2)
    gl.addColorStop(0.2, 'rgba(255,255,255,0)')
    gl.addColorStop(0.32, 'rgba(255,255,255,0.4)')
    gl.addColorStop(0.4, 'rgba(255,255,255,0)')
    g.fillStyle = gl
    g.fillRect(-w / 2, -h / 2, w, h)
    // Cadre de plomb.
    g.strokeStyle = '#2d3036'
    g.lineWidth = 2
    g.strokeRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2)
  },
  ice(g, w, h, r) {
    g.globalAlpha = 0.86
    g.fillStyle = grainPattern(g, 'ice', { x: r.range(0, 128), y: r.range(0, 128) })
    g.fillRect(-w / 2, -h / 2, w, h)
    g.globalAlpha = 1
    // Fractures internes et bulles prises dans la glace.
    g.strokeStyle = 'rgba(255,255,255,0.55)'
    g.lineWidth = 0.45
    for (let i = 0; i < Math.max(2, Math.round((w * h) / 500)); i++) {
      let x = r.range(-w / 2, w / 2)
      let y = r.range(-h / 2, h / 2)
      g.beginPath()
      g.moveTo(x, y)
      for (let k = 0; k < 3; k++) {
        x += r.range(-8, 8)
        y += r.range(-6, 6)
        g.lineTo(x, y)
      }
      g.stroke()
    }
    g.fillStyle = 'rgba(255,255,255,0.5)'
    for (let i = 0; i < Math.round((w * h) / 120); i++) {
      g.beginPath()
      g.arc(r.range(-w / 2, w / 2), r.range(-h / 2, h / 2), r.range(0.3, 0.9), 0, TAU)
      g.fill()
    }
    // Bords givrés et reflet.
    g.strokeStyle = 'rgba(255,255,255,0.55)'
    g.lineWidth = 2.2
    g.strokeRect(-w / 2 + 1.1, -h / 2 + 1.1, w - 2.2, h - 2.2)
    const gl = g.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2)
    gl.addColorStop(0.15, 'rgba(255,255,255,0)')
    gl.addColorStop(0.3, 'rgba(255,255,255,0.45)')
    gl.addColorStop(0.42, 'rgba(255,255,255,0)')
    g.fillStyle = gl
    g.fillRect(-w / 2, -h / 2, w, h)
  },
}

/* ---------- Bloc complet (mis en cache) ---------- */

function outlinePath(g, s) {
  g.beginPath()
  if (s.vertices && s.shape === 'triangle') {
    s.vertices.forEach((v, i) => (i ? g.lineTo(v.x, v.y) : g.moveTo(v.x, v.y)))
    g.closePath()
  } else roundRect(g, -s.w / 2, -s.h / 2, s.w, s.h, Math.min(2, s.w / 6, s.h / 6))
}

function paintBlock(g, material, s, variant) {
  const r = new SeededRandom(((variant + 1) * 2654435761 + Math.round(s.w * 31 + s.h)) >>> 0)
  outlinePath(g, s)
  g.save()
  g.clip()
  ;(PAINT[material] ?? PAINT.stone)(g, s.w, s.h, r)
  // Volume d'ensemble.
  g.restore()
  outlinePath(g, s)
  lightOver(g, -s.w / 2, -s.h / 2, s.w / 2, s.h / 2, 0.1, 0.22)
  g.lineWidth = 0.9
  g.strokeStyle = EDGE
  g.stroke()
}

/** Cadre de l'image d'un bloc (ses sommets peuvent dépasser w × h pour un triangle). */
function boxOf(s) {
  if (s.vertices && s.shape === 'triangle') {
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const v of s.vertices) {
      x0 = Math.min(x0, v.x)
      y0 = Math.min(y0, v.y)
      x1 = Math.max(x1, v.x)
      y1 = Math.max(y1, v.y)
    }
    return { x: x0 - 1, y: y0 - 1, w: x1 - x0 + 2, h: y1 - y0 + 2 }
  }
  return { x: -s.w / 2 - 1, y: -s.h / 2 - 1, w: s.w + 2, h: s.h + 2 }
}

/**
 * Dessine un bloc : image en cache (4 variantes par taille et matériau).
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} material
 * @param {object} s état de dessin (w, h, shape, vertices, seed)
 */
export function drawBlockBody(ctx, material, s) {
  const variant = Math.abs(Math.round(s.seed ?? 0)) % 4
  const shapeKey = s.vertices && s.shape === 'triangle' ? s.vertices.map((v) => `${v.x.toFixed(1)},${v.y.toFixed(1)}`).join(';') : 'rect'
  const key = `blk.${material}.${Math.round(s.w * 10)}x${Math.round(s.h * 10)}.${shapeKey}.${variant}`
  cachedBudget(ctx, key, boxOf(s), (g) => paintBlock(g, material, s, variant), 3)
}

/* ---------- Baril de poudre ---------- */

export function drawBarrelBody(ctx, s) {
  const { w, h } = s
  const box = { x: -w * 0.62, y: -h / 2 - 1, w: w * 1.24, h: h + 2 }
  cachedBudget(ctx, `barrel.${Math.round(w * 10)}x${Math.round(h * 10)}`, box, (g) => {
    const shape = () => {
      g.beginPath()
      g.moveTo(-w * 0.42, -h / 2)
      g.quadraticCurveTo(-w * 0.6, 0, -w * 0.42, h / 2)
      g.lineTo(w * 0.42, h / 2)
      g.quadraticCurveTo(w * 0.6, 0, w * 0.42, -h / 2)
      g.closePath()
    }
    shape()
    g.save()
    g.clip()
    // Douelles verticales.
    const n = 6
    for (let i = 0; i < n; i++) {
      const x0 = -w * 0.55 + (i * w * 1.1) / n
      g.beginPath()
      g.rect(x0, -h / 2, (w * 1.1) / n, h)
      g.fillStyle = woodPattern(g, { angle: Math.PI / 2, x: i * 40, unitsPerTile: 200 })
      g.fill()
      g.fillStyle = 'rgba(110,40,20,0.28)'
      g.fill()
      g.strokeStyle = 'rgba(30,15,5,0.7)'
      g.lineWidth = 0.6
      g.stroke()
    }
    // Rondeur : clair au centre, sombre sur les flancs.
    const round = g.createLinearGradient(-w * 0.6, 0, w * 0.6, 0)
    round.addColorStop(0, 'rgba(0,0,0,0.55)')
    round.addColorStop(0.35, 'rgba(255,230,190,0.18)')
    round.addColorStop(0.55, 'rgba(255,230,190,0.05)')
    round.addColorStop(1, 'rgba(0,0,0,0.6)')
    g.fillStyle = round
    g.fillRect(-w * 0.6, -h / 2, w * 1.2, h)
    g.restore()
    // Cercles de fer (bombés).
    for (const y of [-0.36, -0.22, 0.22, 0.36]) {
      const yy = h * y
      const half = w * (0.44 + 0.12 * (1 - Math.abs(y) / 0.5))
      g.beginPath()
      g.moveTo(-half, yy - 1.4)
      g.quadraticCurveTo(0, yy + 0.8, half, yy - 1.4)
      g.lineTo(half, yy + 1.4)
      g.quadraticCurveTo(0, yy + 3.6, -half, yy + 1.4)
      g.closePath()
      g.fillStyle = metalGradient(g, -half, 0, half, 0, '#555b64')
      g.fill()
      g.lineWidth = 0.4
      g.strokeStyle = EDGE
      g.stroke()
    }
    // Marque peinte : flamme sur disque (poudre !).
    g.beginPath()
    g.arc(0, 0, w * 0.2, 0, TAU)
    g.fillStyle = 'rgba(25,20,18,0.85)'
    g.fill()
    g.beginPath()
    g.moveTo(0, -w * 0.14)
    g.quadraticCurveTo(w * 0.13, 0, 0, w * 0.13)
    g.quadraticCurveTo(-w * 0.13, 0, 0, -w * 0.14)
    g.fillStyle = '#e9a23b'
    g.fill()
    shape()
    g.lineWidth = 0.9
    g.strokeStyle = EDGE
    g.stroke()
  }, 3)
}
