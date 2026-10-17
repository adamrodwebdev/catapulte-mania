/**
 * Montagnes du décor (v6.2). Avant : des zigzags rectilignes coiffés de petits
 * triangles blancs de taille fixe, qui débordaient des pentes ou flottaient à
 * côté. Désormais :
 *
 * - une CRÊTE fractale (bruit « en arêtes » sur plusieurs octaves, modulé en
 *   massifs) : de vrais sommets, des épaulements, des cols ;
 * - des VERSANTS : éclairés côté soleil, à l'ombre de l'autre, séparés par une
 *   arête qui descend du sommet ;
 * - une NEIGE découpée dans la silhouette même (elle ne peut pas déborder), avec
 *   des coulées dans les ravines, bleutée sur le versant à l'ombre ;
 * - des PANACHES que le vent arrache aux crêtes (neige, sable ou poussière), dans
 *   le sens et à la force du vent du moment ; aucun en mouvement réduit.
 *
 * La géométrie est calculée une fois par chaîne (mémoïsée) ; chaque image ne
 * fait que remplir quelques tracés.
 */

const cache = new Map()

/** Crête « en arêtes » : 0..1, des sommets francs (rough ≥ 2) ou des collines rondes (rough ≈ 1). */
function ridgeHeight(x, seed, rough) {
  let h = 0
  let amp = 1
  let f = 0.0017
  let norm = 0
  for (let o = 0; o < 5; o++) {
    const n = 1 - Math.abs(Math.sin(x * f + seed * (o + 1.3) * 1.7))
    h += Math.pow(n, rough) * amp
    norm += amp
    amp *= 0.5
    f *= 2.07
  }
  const massif = 0.5 + 0.5 * Math.sin(x * 0.00085 + seed * 0.61)
  return (h / norm) * (0.45 + 0.55 * massif)
}

/** Pseudo-hasard déterministe 0..1. */
function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

/**
 * Géométrie d'une chaîne (mémoïsée).
 * @param {{ seed: number, left: number, right: number, base: number, height: number, rough?: number, step?: number }} o
 * @returns {{ pts: number[], peaks: Array<{x:number,y:number,left:number,right:number,seed:number}>, base: number, height: number }}
 */
export function range({ seed, left, right, base, height, rough = 2.2, step = 8 }) {
  const key = `${seed}|${left}|${right}|${base}|${height}|${rough}|${step}`
  const hit = cache.get(key)
  if (hit) return hit
  const pts = []
  for (let x = left; x <= right; x += step) pts.push(x, base - height * (0.22 + 0.78 * ridgeHeight(x, seed, rough)))
  // Sommets : maxima locaux nets (sur ±12 points), et leurs cols de part et d'autre.
  const n = pts.length / 2
  const y = (i) => pts[i * 2 + 1]
  const peaks = []
  for (let i = 12; i < n - 12; i++) {
    let top = true
    for (let k = i - 12; k <= i + 12 && top; k++) if (k !== i && y(k) < y(i)) top = false
    if (!top) continue
    let l = i
    while (l > 0 && y(l - 1) >= y(l)) l--
    let r = i
    while (r < n - 1 && y(r + 1) >= y(r)) r++
    if (Math.min(y(l), y(r)) - y(i) < height * 0.06) continue
    peaks.push({ x: pts[i * 2], y: y(i), left: pts[l * 2], right: pts[r * 2], i, l, r, seed: Math.round(hash(i + seed) * 1000) })
  }
  const geo = { pts, peaks, base, height, step }
  cache.set(key, geo)
  return geo
}

function silhouette(ctx, geo) {
  const { pts, base } = geo
  ctx.beginPath()
  ctx.moveTo(pts[0], base)
  for (let i = 0; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1])
  ctx.lineTo(pts[pts.length - 2], base)
  ctx.closePath()
}

/**
 * Dessine une chaîne : silhouette, neige découpée, versants à l'ombre, liseré de lumière.
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<typeof range>} geo
 * @param {{ body: string, shade: string, snow?: string|null, snowLine?: number|null, rim?: string|null, strata?: string|null }} look
 */
export function drawRange(ctx, geo, { body, shade, snow = null, snowLine = null, rim = null, strata = null }) {
  const { pts, peaks, base, height } = geo
  silhouette(ctx, geo)
  ctx.fillStyle = body
  ctx.fill()
  ctx.save()
  silhouette(ctx, geo)
  ctx.clip()
  // Strates : quelques lignes obliques, à peine marquées, sur la roche nue.
  if (strata) {
    ctx.strokeStyle = strata
    ctx.lineWidth = 1.2
    for (const p of peaks) {
      for (let k = 1; k <= 3; k++) {
        const yk = p.y + (base - p.y) * (0.18 * k)
        ctx.beginPath()
        ctx.moveTo(p.x - (p.x - p.left) * 0.9, yk + 14)
        ctx.lineTo(p.x + (p.right - p.x) * 0.9, yk - 10)
        ctx.stroke()
      }
    }
  }
  // Neige : au-dessus d'une ligne de neige déchiquetée, avec des coulées dans les ravines.
  if (snow && Number.isFinite(snowLine)) {
    ctx.beginPath()
    ctx.moveTo(pts[0], base - height * 2)
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i]
      const drip = hash(Math.floor(x / 26) + height) > 0.62 ? 18 + 34 * hash(Math.floor(x / 26) * 3.1) : 0
      ctx.lineTo(x, snowLine + Math.sin(x * 0.045) * 9 + Math.sin(x * 0.13) * 4 + drip * (0.5 + 0.5 * Math.sin((x % 26) / 26 * Math.PI)))
    }
    ctx.lineTo(pts[pts.length - 2], base - height * 2)
    ctx.closePath()
    ctx.fillStyle = snow
    ctx.fill()
  }
  // Versants à l'ombre (le soleil est à droite) : du col de gauche au sommet, puis
  // l'arête qui descend du sommet, légèrement brisée.
  ctx.fillStyle = shade
  for (const p of peaks) {
    ctx.beginPath()
    for (let i = p.l; i <= p.i; i++) ctx.lineTo(pts[i * 2], pts[i * 2 + 1])
    const drop = base - p.y
    let sx = p.x
    for (let k = 1; k <= 6; k++) {
      sx += (hash(p.seed + k) - 0.35) * drop * 0.05
      ctx.lineTo(sx, p.y + (drop * k) / 6)
    }
    ctx.lineTo(p.left, base)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
  // Liseré de lumière sur les crêtes éclairées (versants tournés vers le soleil).
  if (rim) {
    ctx.strokeStyle = rim
    ctx.lineWidth = 1.6
    for (const p of peaks) {
      ctx.beginPath()
      for (let i = p.i; i <= Math.min(p.r, p.i + 18); i++) ctx.lineTo(pts[i * 2], pts[i * 2 + 1] + 1)
      ctx.stroke()
    }
  }
}

/* ---------- Panaches de vent ---------- */

const puffs = new Map()

/** Flocon de fumée flou pré-rendu (une teinte), dessiné ensuite à l'échelle et en transparence. */
function puff(rgb) {
  let c = puffs.get(rgb)
  if (c) return c
  if (typeof document === 'undefined') return null
  c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32)
  gr.addColorStop(0, `rgba(${rgb},0.95)`)
  gr.addColorStop(0.45, `rgba(${rgb},0.45)`)
  gr.addColorStop(1, `rgba(${rgb},0)`)
  g.fillStyle = gr
  g.fillRect(0, 0, 64, 64)
  puffs.set(rgb, c)
  return c
}

/**
 * Panaches que le vent arrache aux crêtes : chaque sommet émet un voile qui
 * file dans le sens du vent, s'élargit et s'efface. Plus le vent est fort, plus
 * il porte loin. Rien sous un vent faible, rien en mouvement réduit.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{x:number,y:number,seed:number}>} peaks
 * @param {{ time: number, wind: number, rgb: string, animate: boolean, reach?: number, size?: number, alpha?: number }} o
 */
export function spindrift(ctx, peaks, { time, wind, rgb, animate, reach = 220, size = 1, alpha = 0.6 }) {
  if (!animate || !(Math.abs(wind) >= 0.15)) return
  const sprite = puff(rgb)
  if (!sprite) return
  const dir = Math.sign(wind)
  const k = Math.min(1.4, Math.abs(wind))
  ctx.save()
  for (const p of peaks) {
    const period = 1300 + (p.seed % 700)
    for (let i = 0; i < 10; i++) {
      const u = (time / period + i / 10 + p.seed / 1000) % 1
      const x = p.x + dir * u * reach * k
      const y = p.y + 2 + u * 26 * size - Math.sin(u * Math.PI) * 10 * size + Math.sin(time / 230 + i) * 2 * size
      const r = (8 + u * 30) * size
      ctx.globalAlpha = Math.min(1, (1 - u) * (u < 0.1 ? u / 0.1 : 1) * alpha * k)
      // Un voile étiré dans le sens du vent.
      ctx.drawImage(sprite, x - r * 1.3, y - r * 0.45, r * 2.6, r * 0.9)
    }
  }
  ctx.restore()
}
