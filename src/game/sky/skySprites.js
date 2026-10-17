import { SeededRandom } from '../../core/utils/SeededRandom.js'

/**
 * Ciels vivants (v6.3) : les petites images des effets (halos, nuées, bandes de
 * brume, voiles, filets d'eau…), tracées une fois au premier besoin, puis
 * réutilisées à chaque image. Navigateur seulement (canevas).
 */

const TAU = Math.PI * 2

function canvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/** Halo rond : dégradé radial du centre au bord. */
function sprite(size, stops) {
  const c = canvas(size, size)
  const g = c.getContext('2d')
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  for (const [o, col] of stops) gr.addColorStop(o, col)
  g.fillStyle = gr
  g.fillRect(0, 0, size, size)
  return c
}

/** Nuée : quatorze halos mêlés (fumée, nuages bas, ombres, écume). */
function puff(size, seed, tint) {
  const c = canvas(size, size)
  const g = c.getContext('2d')
  const r = new SeededRandom(seed)
  for (let i = 0; i < 14; i++) {
    const x = size * (0.3 + 0.4 * r.next())
    const y = size * (0.3 + 0.4 * r.next())
    const rad = size * (0.18 + 0.2 * r.next())
    const gr = g.createRadialGradient(x, y, 0, x, y, rad)
    gr.addColorStop(0, tint(0.22))
    gr.addColorStop(1, tint(0))
    g.fillStyle = gr
    g.fillRect(0, 0, size, size)
  }
  return c
}

/**
 * Bande de nappes elliptiques qui se raccorde à elle-même (chaque nappe est
 * recopiée d'un bord à l'autre) : brume, bancs de brume, voiles de sable.
 */
function strip(w, h, seed, { count, y: [ya, yb], rx: [rxa, rxb], ry: [rya, ryb], alpha: [aa, ab], rgb = [255, 255, 255], mid = null }) {
  const c = canvas(w, h)
  const g = c.getContext('2d')
  const r = new SeededRandom(seed)
  const [cr, cg, cb] = rgb
  for (let i = 0; i < count; i++) {
    const x = r.next() * w
    const y = h * (ya + (yb - ya) * r.next())
    const rx = rxa + (rxb - rxa) * r.next()
    const ry = rya + (ryb - rya) * r.next()
    const a = aa + (ab - aa) * r.next()
    for (const dx of [-w, 0, w]) {
      const gr = g.createRadialGradient(x + dx, y, 0, x + dx, y, rx)
      gr.addColorStop(0, `rgba(${cr},${cg},${cb},${a})`)
      if (mid) gr.addColorStop(mid, `rgba(${cr},${cg},${cb},${a * 0.45})`)
      gr.addColorStop(1, `rgba(${cr},${cg},${cb},0)`)
      g.save()
      g.translate(x + dx, y)
      g.scale(1, ry / rx)
      g.translate(-(x + dx), -y)
      g.fillStyle = gr
      g.beginPath()
      g.arc(x + dx, y, rx, 0, TAU)
      g.fill()
      g.restore()
    }
  }
  return c
}

/** Traînée horizontale du reflet du soleil : fine, chaude, fondue aux deux bouts. */
function streak() {
  const c = canvas(512, 24)
  const g = c.getContext('2d')
  const gx = g.createLinearGradient(0, 0, 512, 0)
  gx.addColorStop(0, 'rgba(255,236,200,0)')
  gx.addColorStop(0.5, 'rgba(255,250,236,1)')
  gx.addColorStop(1, 'rgba(255,236,200,0)')
  g.fillStyle = gx
  g.fillRect(0, 0, 512, 24)
  g.globalCompositeOperation = 'destination-in'
  const gy = g.createLinearGradient(0, 0, 0, 24)
  gy.addColorStop(0, 'rgba(0,0,0,0)')
  gy.addColorStop(0.5, 'rgba(0,0,0,1)')
  gy.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = gy
  g.fillRect(0, 0, 512, 24)
  return c
}

/** Filets d'eau : traits verticaux fondus, raccordés en haut et en bas (la texture défile). */
function fallStreaks(w, h, seed) {
  const c = canvas(w, h)
  const g = c.getContext('2d')
  const r = new SeededRandom(seed)
  for (let i = 0; i < 90; i++) {
    const x = r.next() * w
    const y = r.next() * h
    const len = 14 + 46 * r.next()
    const lw = 0.8 + 1.6 * r.next()
    const a = 0.25 + 0.45 * r.next()
    for (const dy of [-h, 0, h]) {
      const gr = g.createLinearGradient(0, y + dy, 0, y + dy + len)
      gr.addColorStop(0, 'rgba(255,255,255,0)')
      gr.addColorStop(0.5, `rgba(255,255,255,${a})`)
      gr.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = gr
      g.fillRect(x - lw / 2, y + dy, lw, len)
    }
  }
  return c
}

function build() {
  return {
    glow: sprite(64, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]),
    sunGlow: sprite(128, [[0, 'rgba(255,250,232,1)'], [0.18, 'rgba(255,244,210,0.55)'], [0.5, 'rgba(255,236,190,0.16)'], [1, 'rgba(255,230,180,0)']]),
    sunsetGlow: sprite(128, [[0, 'rgba(255,238,196,1)'], [0.2, 'rgba(255,196,120,0.5)'], [0.55, 'rgba(255,150,80,0.14)'], [1, 'rgba(255,120,60,0)']]),
    gold: sprite(32, [[0, 'rgba(255,246,210,1)'], [0.3, 'rgba(255,214,130,0.55)'], [1, 'rgba(255,180,80,0)']]),
    wisp: sprite(64, [[0, 'rgba(236,255,226,0.9)'], [0.22, 'rgba(184,240,196,0.42)'], [1, 'rgba(120,200,160,0)']]),
    firefly: sprite(32, [[0, 'rgba(246,255,200,1)'], [0.25, 'rgba(206,255,120,0.6)'], [1, 'rgba(150,220,60,0)']]),
    emberHot: sprite(32, [[0, 'rgba(255,240,180,1)'], [0.3, 'rgba(255,170,60,0.75)'], [1, 'rgba(255,90,20,0)']]),
    emberCool: sprite(32, [[0, 'rgba(255,170,90,0.9)'], [0.35, 'rgba(220,70,30,0.5)'], [1, 'rgba(160,30,20,0)']]),
    haloRing: sprite(256, [[0, 'rgba(255,255,255,0)'], [0.74, 'rgba(255,255,255,0)'], [0.82, 'rgba(255,214,176,0.55)'], [0.87, 'rgba(206,255,214,0.45)'], [0.92, 'rgba(176,206,255,0.45)'], [1, 'rgba(176,206,255,0)']]),
    ghostWarm: sprite(64, [[0, 'rgba(255,232,190,0.45)'], [0.72, 'rgba(255,222,170,0.3)'], [0.86, 'rgba(255,214,160,0.55)'], [1, 'rgba(255,204,150,0)']]),
    ghostCool: sprite(64, [[0, 'rgba(190,240,255,0.4)'], [0.72, 'rgba(180,230,255,0.28)'], [0.86, 'rgba(170,220,255,0.5)'], [1, 'rgba(160,210,255,0)']]),
    oval: sprite(128, [[0, 'rgba(0,0,0,1)'], [0.45, 'rgba(0,0,0,0.7)'], [1, 'rgba(0,0,0,0)']]),
    dustSoft: sprite(64, [[0, 'rgba(186,142,96,0.9)'], [0.5, 'rgba(198,156,106,0.35)'], [1, 'rgba(210,170,120,0)']]),
    streak: streak(),
    smoke: [puff(160, 3, (a) => `rgba(42,32,52,${a})`), puff(160, 9, (a) => `rgba(52,38,60,${a})`)],
    scud: [puff(220, 5, (a) => `rgba(14,20,32,${a * 1.6})`), puff(220, 12, (a) => `rgba(22,30,44,${a * 1.6})`)],
    shadow: [puff(256, 31, (a) => `rgba(14,24,42,${a})`), puff(256, 44, (a) => `rgba(18,28,46,${a})`)],
    fogPuff: [puff(256, 61, (a) => `rgba(244,250,244,${a})`), puff(256, 67, (a) => `rgba(236,246,238,${a})`)],
    dust: puff(128, 17, (a) => `rgba(214,174,124,${a})`),
    dustLow: puff(128, 23, (a) => `rgba(176,128,82,${a})`),
    mist: strip(1024, 180, 21, { count: 70, y: [0.35, 0.75], rx: [60, 200], ry: [14, 40], alpha: [0.05, 0.11] }),
    banks: strip(1024, 200, 55, { count: 34, y: [0.32, 0.68], rx: [110, 360], ry: [18, 48], alpha: [0.1, 0.24], rgb: [250, 255, 250], mid: 0.6 }),
    veils: {
      sand: strip(1024, 90, 41, { count: 60, y: [0.25, 0.75], rx: [80, 340], ry: [2.5, 9.5], alpha: [0.08, 0.2], rgb: [238, 206, 152] }),
      snow: strip(1024, 90, 43, { count: 60, y: [0.25, 0.75], rx: [80, 340], ry: [2.5, 9.5], alpha: [0.08, 0.2] }),
    },
    fallStreaks: fallStreaks(64, 128, 71),
  }
}

let cache = null

/** Les images des effets (tracées au premier appel). */
export function skySprites() {
  cache ??= build()
  return cache
}

/** Un canevas de travail (tampon d'un effet). */
export function scratchCanvas() {
  return canvas(1, 1)
}

/** Un masque RVBA (voir paintingAnalysis.js) devenu image. */
export function maskCanvas(rgba, w, h) {
  const c = canvas(w, h)
  c.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0)
  return c
}
