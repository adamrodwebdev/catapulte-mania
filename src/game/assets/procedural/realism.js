/**
 * Boîte à outils du rendu « réaliste » (v4.4) : matières (bois veiné, acier,
 * corde, cuir, mailles) et cache d'images.
 *
 * Principe de performance : les engins et les personnages sont dessinés en
 * détail UNE fois dans des images hors écran (sprites), à la résolution utile
 * pour le zoom courant, puis simplement recopiés à chaque image. Seuls les
 * éléments animés (bras, contrepoids, fronde, fanion, respiration, clignement)
 * sont recomposés à chaque image, ce qui coûte quelques copies d'image.
 *
 * Éclairage commun : lumière venant d'en haut à gauche.
 */
import { makeCanvas } from './textures.js'

export const TAU = Math.PI * 2
/** Contour sombre (brun-noir) : plus naturel que l'encre indigo des aplats. */
export const EDGE = 'rgba(30,20,16,0.9)'

/* ---------- Couleurs ---------- */

function parse(color) {
  const hex = color.replace('#', '')
  const n = parseInt(hex.length === 3 ? hex.replace(/./g, '$&$&') : hex, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Éclaircit (amt > 0) ou assombrit (amt < 0) une couleur hexadécimale. */
export function tone(color, amt) {
  const [r, g, b] = parse(color)
  const f = (c) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt))
  return `rgb(${f(r)},${f(g)},${f(b)})`
}

/* ---------- Bruit (déterministe, périodique) ---------- */

function hash(x, y, seed) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

function noise(x, y, seed, px, py) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const wx = (i) => ((i % px) + px) % px
  const wy = (j) => ((j % py) + py) % py
  const a = hash(wx(xi), wy(yi), seed)
  const b = hash(wx(xi + 1), wy(yi), seed)
  const c = hash(wx(xi), wy(yi + 1), seed)
  const d = hash(wx(xi + 1), wy(yi + 1), seed)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

/** Bruit fractal périodique (px × py cellules à l'octave de base). */
function fbm(x, y, seed, px, py, octaves = 4) {
  let sum = 0
  let amp = 0.5
  let f = 1
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * f, y * f, seed + i * 31, px * f, py * f)
    f *= 2
    amp *= 0.5
  }
  return sum
}

/* ---------- Textures (générées une seule fois) ---------- */

const tiles = new Map()

function tile(name, w, h, paint) {
  if (!tiles.has(name)) {
    const c = makeCanvas(w, h)
    const g = c.getContext('2d')
    const img = g.createImageData(w, h)
    paint(img.data, w, h)
    g.putImageData(img, 0, 0)
    tiles.set(name, c)
  }
  return tiles.get(name)
}

/** Bois de charpente : veines longitudinales ondulées, fibres fines, nuances. */
function woodTile() {
  return tile('wood', 512, 128, (d, w, h) => {
    const light = [184, 128, 76]
    const dark = [118, 74, 40]
    const line = [70, 40, 20]
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / w
        const v = y / h
        const warp = fbm(u * 4, v * 2, 7, 4, 2) * 2 - 1
        const ring = Math.sin((v * 22 + warp * 3.2 + fbm(u * 8, v * 4, 3, 8, 4) * 1.4) * Math.PI)
        const vein = Math.pow(Math.abs(ring), 7)
        const broad = fbm(u * 2, v * 3, 11, 2, 3)
        const fibre = noise(u * 256, v * 24, 5, 256, 24)
        let t = 0.3 + broad * 0.6 + (fibre - 0.5) * 0.25
        t = Math.max(0, Math.min(1, t))
        const k = (y * w + x) * 4
        for (let c = 0; c < 3; c++) {
          const base = dark[c] + (light[c] - dark[c]) * t
          d[k + c] = base + (line[c] - base) * vein * 0.75
        }
        d[k + 3] = 255
      }
    }
  })
}

/** Fer forgé : grain fin et piqûres. */
function ironTile() {
  return tile('iron', 128, 128, (d, w, h) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const n = fbm(x / 32, y / 32, 19, 4, 4) * 0.7 + noise(x / 2, y / 2, 23, 64, 64) * 0.3
        const pit = noise(x / 3, y / 3, 29, 43, 43) > 0.86 ? -26 : 0
        const v = 90 + n * 70 + pit
        const k = (y * w + x) * 4
        d[k] = v
        d[k + 1] = v + 2
        d[k + 2] = v + 6
        d[k + 3] = 255
      }
    }
  })
}

/** Mailles de cotte : anneaux qui se chevauchent (motif 16 × 12). */
function mailTile() {
  const name = 'mail'
  if (!tiles.has(name)) {
    const c = makeCanvas(16, 12)
    const g = c.getContext('2d')
    g.fillStyle = '#2b2e35'
    g.fillRect(0, 0, 16, 12)
    for (const [x, y] of [[0, 0], [8, 6], [16, 0], [0, 12], [16, 12], [8, -6], [8, 18]]) {
      g.beginPath()
      g.arc(x, y, 5, 0, TAU)
      g.lineWidth = 2.2
      g.strokeStyle = '#9aa1ab'
      g.stroke()
      g.beginPath()
      g.arc(x - 0.8, y - 0.8, 5, Math.PI * 1.05, Math.PI * 1.55)
      g.lineWidth = 1
      g.strokeStyle = '#e4e8ee'
      g.stroke()
    }
    tiles.set(name, c)
  }
  return tiles.get(name)
}

/**
 * Motif d'une texture, orienté et mis à l'échelle (unités locales).
 * @param {number} unitsPerTile largeur couverte par une tuile, en unités du monde
 */
function pattern(g, canvas, { angle = 0, x = 0, y = 0, unitsPerTile = 256 } = {}) {
  const p = g.createPattern(canvas, 'repeat')
  const s = unitsPerTile / canvas.width
  if (p && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix().translateSelf(x, y).rotateSelf((angle * 180) / Math.PI).scaleSelf(s, s))
  return p
}

export const woodPattern = (g, opts) => pattern(g, woodTile(), opts)
export const ironPattern = (g, opts) => pattern(g, ironTile(), { unitsPerTile: 48, ...opts })
export const mailPattern = (g, opts) => pattern(g, mailTile(), { unitsPerTile: 3.2, ...opts })

/* ---------- Cache d'images (sprites) à plusieurs résolutions ---------- */

const sprites = new Map()
const LEVELS = [0.5, 0.75, 1, 1.5, 2, 3, 4]

/** Résolution (pixels par unité locale) de la transformation courante. */
export function resolution(ctx, max = 4) {
  const m = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null
  const k = m ? Math.hypot(m.a, m.b) : 1
  for (const level of LEVELS) if (level >= k * 0.95 && level <= max) return level
  return max
}

/**
 * Image en cache d'un élément statique.
 * @param {string} key identifiant (variante comprise)
 * @param {{x:number,y:number,w:number,h:number}} box cadre en unités locales
 * @param {number} res pixels par unité
 * @param {(g: CanvasRenderingContext2D) => void} paint dessin en unités locales
 */
export function sprite(key, box, res, paint) {
  const id = `${key}@${res}`
  let c = sprites.get(id)
  if (!c) {
    c = makeCanvas(Math.ceil(box.w * res) + 2, Math.ceil(box.h * res) + 2)
    const g = c.getContext('2d')
    g.scale(res, res)
    g.translate(-box.x + 1 / res, -box.y + 1 / res)
    g.lineJoin = 'round'
    g.lineCap = 'round'
    paint(g)
    sprites.set(id, c)
  }
  return c
}

/** Recopie un sprite à sa place (repère local courant). */
export function blit(ctx, canvas, box, res) {
  ctx.drawImage(canvas, box.x - 1 / res, box.y - 1 / res, canvas.width / res, canvas.height / res)
}

/** Dessine un élément statique via le cache (création au premier appel). */
export function cached(ctx, key, box, paint, maxRes = 4) {
  const res = resolution(ctx, maxRes)
  blit(ctx, sprite(key, box, res, paint), box, res)
}

/* ---------- Primitives de matière ---------- */

export function roundRect(g, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  g.moveTo(x + rr, y)
  g.arcTo(x + w, y, x + w, y + h, rr)
  g.arcTo(x + w, y + h, x, y + h, rr)
  g.arcTo(x, y + h, x, y, rr)
  g.arcTo(x, y, x + w, y, rr)
  g.closePath()
}

/** Contour fin et sombre. */
export function edge(g, width = 1) {
  g.lineWidth = width
  g.strokeStyle = EDGE
  g.stroke()
}

/** Voile de lumière (haut-gauche) et d'ombre (bas-droite) sur le chemin courant. */
export function lightOver(g, x0, y0, x1, y1, light = 0.28, dark = 0.4) {
  const gr = g.createLinearGradient(x0, y0, x0 + (x1 - x0) * 0.35, y1)
  gr.addColorStop(0, `rgba(255,244,225,${light})`)
  gr.addColorStop(0.45, 'rgba(255,255,255,0)')
  gr.addColorStop(1, `rgba(0,0,0,${dark})`)
  g.fillStyle = gr
  g.fill()
}

/**
 * Poutre équarrie de x1,y1 à x2,y2 (largeur w, w2 en bout si effilée).
 * `tint` : une teinte ou une liste de voiles successifs (apparence, flanc éloigné).
 * Bois veiné orienté dans le fil, arête éclairée côté lumière, arête d'ombre,
 * bouts plus sombres (bois de bout), quelques entailles.
 */
export function timber(g, x1, y1, x2, y2, w, { w2 = w, tint = null, seed = 0, symmetric = false } = {}) {
  const len = Math.hypot(x2 - x1, y2 - y1)
  const a = Math.atan2(y2 - y1, x2 - x1)
  // Côté éclairé : celui dont la normale pointe vers le haut de l'écran.
  const lightTop = symmetric || Math.cos(a) >= 0
  g.save()
  g.translate(x1, y1)
  g.rotate(a)
  const path = () => {
    g.beginPath()
    g.moveTo(0, -w / 2)
    g.lineTo(len, -w2 / 2)
    g.lineTo(len, w2 / 2)
    g.lineTo(0, w / 2)
    g.closePath()
  }
  path()
  g.fillStyle = woodPattern(g, { x: -seed * 37, y: -seed * 11 + w, unitsPerTile: 300 })
  g.fill()
  for (const t of Array.isArray(tint) ? tint : [tint]) {
    if (!t) continue
    g.fillStyle = t
    g.fill()
  }
  const wm = Math.max(w, w2) / 2
  const sh = g.createLinearGradient(0, -wm, 0, wm)
  if (symmetric) {
    sh.addColorStop(0, 'rgba(0,0,0,0.38)')
    sh.addColorStop(0.18, 'rgba(255,236,200,0.16)')
    sh.addColorStop(0.42, 'rgba(255,236,200,0.06)')
    sh.addColorStop(0.75, 'rgba(0,0,0,0.12)')
    sh.addColorStop(1, 'rgba(0,0,0,0.5)')
  } else {
    const [top, bottom] = lightTop ? [0, 1] : [1, 0]
    sh.addColorStop(top, 'rgba(255,236,200,0.3)')
    sh.addColorStop(0.3, 'rgba(255,236,200,0.04)')
    sh.addColorStop(0.65, 'rgba(0,0,0,0.08)')
    sh.addColorStop(bottom, 'rgba(0,0,0,0.48)')
  }
  g.fillStyle = sh
  g.fill()
  // Bois de bout assombri.
  const endW = Math.min(4, len * 0.08)
  const ends = g.createLinearGradient(0, 0, len, 0)
  ends.addColorStop(0, 'rgba(40,22,10,0.45)')
  ends.addColorStop(endW / len, 'rgba(40,22,10,0)')
  ends.addColorStop(1 - endW / len, 'rgba(40,22,10,0)')
  ends.addColorStop(1, 'rgba(40,22,10,0.45)')
  g.fillStyle = ends
  g.fill()
  // Arête chanfreinée qui accroche la lumière.
  g.beginPath()
  const ey = lightTop ? -w / 2 + 0.9 : w / 2 - 0.9
  const ey2 = lightTop ? -w2 / 2 + 0.9 : w2 / 2 - 0.9
  g.moveTo(1.5, ey)
  g.lineTo(len - 1.5, ey2)
  g.lineWidth = 0.7
  g.strokeStyle = 'rgba(255,226,180,0.45)'
  g.stroke()
  // Entailles et coups d'herminette.
  let r = (seed * 9301 + 49297) % 233280
  const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280
  g.strokeStyle = 'rgba(50,28,12,0.55)'
  g.lineWidth = 0.6
  for (let i = 0; i < Math.floor(len / 40); i++) {
    const x = 6 + rnd() * (len - 12)
    const y = (rnd() - 0.5) * w * 0.6
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + 3 + rnd() * 5, y + (rnd() - 0.5) * 1.2)
    g.stroke()
  }
  path()
  edge(g, 0.9)
  g.restore()
}

/** Dégradé de métal poli (reflets de cylindre) selon un axe. */
export function metalGradient(g, x0, y0, x1, y1, base) {
  const gr = g.createLinearGradient(x0, y0, x1, y1)
  gr.addColorStop(0, tone(base, -0.45))
  gr.addColorStop(0.18, tone(base, 0.55))
  gr.addColorStop(0.32, tone(base, 0.1))
  gr.addColorStop(0.62, tone(base, -0.3))
  gr.addColorStop(0.84, tone(base, 0.18))
  gr.addColorStop(1, tone(base, -0.5))
  return gr
}

/** Rivet : tête bombée avec reflet. */
export function rivet(g, x, y, r, base = '#4b515b') {
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r)
  gr.addColorStop(0, tone(base, 0.75))
  gr.addColorStop(0.5, tone(base, 0.05))
  gr.addColorStop(1, tone(base, -0.55))
  g.beginPath()
  g.arc(x, y, r, 0, TAU)
  g.fillStyle = gr
  g.fill()
  g.lineWidth = 0.35
  g.strokeStyle = 'rgba(20,16,14,0.8)'
  g.stroke()
}

/** Ferrure (bande de fer) dans le repère courant : rectangle w × h centré en x,y. */
export function strap(g, x, y, w, h, base = '#4b515b', { rivets = 2 } = {}) {
  g.beginPath()
  roundRect(g, x - w / 2, y - h / 2, w, h, Math.min(1, w / 4))
  g.fillStyle = ironPattern(g)
  g.fill()
  g.fillStyle = metalGradient(g, x - w / 2, y - h / 2, x + w / 2, y + h / 2, base)
  g.globalAlpha = 0.75
  g.fill()
  g.globalAlpha = 1
  edge(g, 0.6)
  const step = h / (rivets + 1)
  for (let i = 1; i <= rivets; i++) rivet(g, x, y - h / 2 + step * i, Math.min(w * 0.28, 1.4), base)
}

/**
 * Corde torsadée le long d'une polyligne (dessinée à chaque image si elle bouge :
 * quelques traits seulement).
 */
export function rope(g, pts, width = 2, color = '#7a5f3e') {
  g.lineCap = 'round'
  g.lineJoin = 'round'
  const line = (w, c) => {
    g.beginPath()
    pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)))
    g.lineWidth = w
    g.strokeStyle = c
    g.stroke()
  }
  line(width + 0.7, 'rgba(30,20,12,0.85)')
  line(width, color)
  // Torsade : petits traits obliques réguliers.
  g.beginPath()
  const step = Math.max(1.2, width * 1.1)
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (!len) continue
    const dx = (b.x - a.x) / len
    const dy = (b.y - a.y) / len
    for (let t = step / 2; t < len; t += step) {
      const cx = a.x + dx * t
      const cy = a.y + dy * t
      g.moveTo(cx - dy * width * 0.45 - dx * width * 0.35, cy + dx * width * 0.45 - dy * width * 0.35)
      g.lineTo(cx + dy * width * 0.45 + dx * width * 0.35, cy - dx * width * 0.45 + dy * width * 0.35)
    }
  }
  g.lineWidth = Math.max(0.35, width * 0.28)
  g.strokeStyle = 'rgba(40,26,14,0.55)'
  g.stroke()
  line(Math.max(0.3, width * 0.25), 'rgba(255,230,190,0.22)')
}

/** Ligature : plusieurs tours de corde autour d'un assemblage (repère local, axe x). */
export function lashing(g, x, y, angle, length = 6, thickness = 9, color = '#8a6d48') {
  g.save()
  g.translate(x, y)
  g.rotate(angle)
  const turns = Math.max(3, Math.round(length / 1.6))
  for (let i = 0; i < turns; i++) {
    const tx = -length / 2 + (i + 0.5) * (length / turns)
    rope(g, [{ x: tx - 0.8, y: -thickness / 2 }, { x: tx + 0.8, y: thickness / 2 }], 1.4, color)
  }
  g.restore()
}

/** Cuir : aplat brun, ombrage doux et coutures. */
export function leather(g, base = '#6b4628', bbox = [-5, -5, 5, 5]) {
  g.fillStyle = base
  g.fill()
  lightOver(g, ...bbox, 0.22, 0.45)
  edge(g, 0.7)
}

/** Couture pointillée le long d'un chemin déjà tracé (appel après beginPath + tracé). */
export function stitches(g, color = 'rgba(240,215,160,0.7)', width = 0.4) {
  g.save()
  g.setLineDash([1.1, 1])
  g.lineWidth = width
  g.strokeStyle = color
  g.stroke()
  g.restore()
}
