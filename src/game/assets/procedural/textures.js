/**
 * Textures procédurales (motifs répétables) générées une seule fois puis mises en cache.
 * Chaque motif est une petite toile de 128×128 dessinée avec un hasard déterministe.
 */
import { SeededRandom } from '../../../core/utils/SeededRandom.js'

const SIZE = 128
/** @type {Map<string, HTMLCanvasElement | OffscreenCanvas>} */
const tiles = new Map()
/** @type {WeakMap<CanvasRenderingContext2D, Map<string, CanvasPattern>>} */
const patterns = new WeakMap()

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

const PAINT = {
  wood(g, r) {
    g.fillStyle = '#b07a43'
    g.fillRect(0, 0, SIZE, SIZE)
    // Planches horizontales de 32 unités avec un léger décalage de teinte.
    for (let row = 0; row < 4; row++) {
      const y = row * 32
      g.fillStyle = ['#b07a43', '#a5703b', '#ba8550', '#a87440'][row]
      g.fillRect(0, y, SIZE, 32)
      g.strokeStyle = 'rgba(80,45,18,0.35)'
      g.lineWidth = 1
      for (let i = 0; i < 5; i++) {
        const gy = y + 4 + r.range(0, 24)
        g.beginPath()
        g.moveTo(0, gy)
        for (let x = 0; x <= SIZE; x += 16) g.lineTo(x, gy + Math.sin(x / 19 + i) * 1.6)
        g.stroke()
      }
      if (r.chance(0.6)) {
        g.fillStyle = 'rgba(70,38,14,0.55)'
        g.beginPath()
        g.ellipse(r.range(10, SIZE - 10), y + 16, 4, 2.5, 0, 0, Math.PI * 2)
        g.fill()
      }
      g.fillStyle = 'rgba(60,32,12,0.6)'
      g.fillRect(0, y + 31, SIZE, 1.5)
    }
  },
  straw(g, r) {
    g.fillStyle = '#d6b04f'
    g.fillRect(0, 0, SIZE, SIZE)
    for (let i = 0; i < 260; i++) {
      const x = r.range(0, SIZE)
      const y = r.range(0, SIZE)
      g.strokeStyle = r.pick(['#b8902f', '#e8c867', '#c49b38', '#f1d98a'])
      g.lineWidth = r.range(0.8, 1.8)
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + r.range(-3, 3), y + r.range(10, 22))
      g.stroke()
    }
  },
  stone(g, r) {
    g.fillStyle = '#6f6a63'
    g.fillRect(0, 0, SIZE, SIZE)
    const rowH = 32
    for (let row = 0; row < 4; row++) {
      const offset = row % 2 ? 0 : 32
      for (let col = -1; col < 3; col++) {
        const x = col * 64 + offset
        const y = row * rowH
        const tone = r.int(-14, 14)
        g.fillStyle = `rgb(${158 + tone},${152 + tone},${140 + tone})`
        g.fillRect(x + 2, y + 2, 60, rowH - 4)
        g.fillStyle = 'rgba(255,255,255,0.12)'
        g.fillRect(x + 2, y + 2, 60, 4)
        g.fillStyle = 'rgba(0,0,0,0.12)'
        g.fillRect(x + 2, y + rowH - 7, 60, 5)
        for (let k = 0; k < 6; k++) {
          g.fillStyle = `rgba(60,55,50,${r.range(0.08, 0.2)})`
          g.beginPath()
          g.arc(x + r.range(6, 58), y + r.range(6, 26), r.range(1, 3), 0, Math.PI * 2)
          g.fill()
        }
      }
    }
  },
  iron(g, r) {
    const grad = g.createLinearGradient(0, 0, 0, SIZE)
    grad.addColorStop(0, '#6c7480')
    grad.addColorStop(0.5, '#59606b')
    grad.addColorStop(1, '#4b515b')
    g.fillStyle = grad
    g.fillRect(0, 0, SIZE, SIZE)
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(255,255,255,${r.range(0.02, 0.07)})`
      g.fillRect(r.range(0, SIZE), r.range(0, SIZE), r.range(10, 40), 1)
    }
    g.fillStyle = 'rgba(30,26,43,0.45)'
    for (const y of [0, 64]) g.fillRect(0, y + 28, SIZE, 8)
    for (let x = 8; x < SIZE; x += 32) {
      for (const y of [32, 96]) {
        g.fillStyle = '#8b93a0'
        g.beginPath()
        g.arc(x, y, 3.2, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = 'rgba(0,0,0,0.35)'
        g.beginPath()
        g.arc(x + 0.8, y + 0.8, 3.2, 0, Math.PI)
        g.fill()
      }
    }
  },
  glass(g, r) {
    g.fillStyle = '#2b2a3a'
    g.fillRect(0, 0, SIZE, SIZE)
    const colors = ['#3e6fb5', '#b2413a', '#d9a93a', '#4d8a5b', '#6c4fa1']
    const cell = 32
    for (let y = 0; y < SIZE; y += cell) {
      for (let x = 0; x < SIZE; x += cell) {
        g.fillStyle = r.pick(colors)
        g.globalAlpha = 0.85
        g.beginPath()
        g.moveTo(x + 2, y + 2)
        g.lineTo(x + cell - 2, y + 2 + r.range(0, 6))
        g.lineTo(x + cell - 2, y + cell - 2)
        g.lineTo(x + 2, y + cell - 2 - r.range(0, 6))
        g.closePath()
        g.fill()
        g.globalAlpha = 0.3
        g.fillStyle = '#fff'
        g.fillRect(x + 5, y + 5, 6, 3)
        g.globalAlpha = 1
      }
    }
  },
}

/**
 * Motif répétable d'un matériau, utilisable comme `fillStyle`.
 * @param {CanvasRenderingContext2D} ctx
 * @param {'wood'|'straw'|'stone'|'iron'|'glass'} name
 */
export function materialPattern(ctx, name) {
  let cache = patterns.get(ctx)
  if (!cache) {
    cache = new Map()
    patterns.set(ctx, cache)
  }
  if (!cache.has(name)) {
    if (!tiles.has(name)) {
      const c = makeCanvas(SIZE, SIZE)
      PAINT[name](c.getContext('2d'), new SeededRandom(name.length * 7919))
      tiles.set(name, c)
    }
    cache.set(name, ctx.createPattern(tiles.get(name), 'repeat'))
  }
  return cache.get(name)
}

export { makeCanvas }
