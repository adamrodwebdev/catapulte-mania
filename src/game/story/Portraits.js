import { Guard } from '../../core/utils/Guard.js'
import { PORTRAIT_DATA } from './portraits.data.js'
import { CHARACTERS } from './Portraits.meta.js'

export { CHARACTERS }

/**
 * Les personnages de la Chronique, dessinés par le code.
 *
 * Aucun fichier image : chaque portrait est une palette et une suite de pixels
 * compressée (voir scripts/portraits/encode.py), décodée une seule fois puis
 * peinte dans un <canvas>. L'agrandissement se fait en CSS avec
 * `image-rendering: pixelated` : le pixel art reste net à toutes les tailles,
 * pour 16 Ko compressés au total (contre 14 Mo pour les illustrations d'origine).
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const TOKEN = /([A-Za-z.])(\d*)/g
const cache = new Map()

/**
 * Décode un portrait en pixels RGBA (mis en cache).
 * @param {string} id
 * @returns {{ w: number, h: number, pixels: Uint8ClampedArray }}
 */
export function decodePortrait(id) {
  Guard.oneOf(id, Object.keys(CHARACTERS), 'portrait id')
  if (cache.has(id)) return cache.get(id)
  const { w, h, palette, data } = PORTRAIT_DATA[id]
  Guard.int(w, 'portrait width', { min: 1, max: 512 })
  Guard.int(h, 'portrait height', { min: 1, max: 512 })
  if (!/^[A-Za-z.\d]+$/.test(data)) throw new Error(`portrait ${id}: invalid data`)
  const rgb = palette.map((hex) => {
    Guard.string(hex, 'portrait colour', { pattern: /^[0-9a-f]{6}$/ })
    const n = parseInt(hex, 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  })
  const pixels = new Uint8ClampedArray(w * h * 4)
  let p = 0
  for (const [, sym, count] of data.matchAll(TOKEN)) {
    const n = count ? Number(count) : 1
    if (sym === '.') {
      p += n
      continue
    }
    const c = rgb[ALPHABET.indexOf(sym)]
    if (!c) throw new Error(`portrait ${id}: unknown colour ${sym}`)
    for (let i = 0; i < n; i++, p++) {
      pixels[p * 4] = c[0]
      pixels[p * 4 + 1] = c[1]
      pixels[p * 4 + 2] = c[2]
      pixels[p * 4 + 3] = 255
    }
  }
  if (p !== w * h) throw new Error(`portrait ${id}: ${p} pixels for ${w}×${h}`)
  const out = Object.freeze({ w, h, pixels })
  cache.set(id, out)
  return out
}

/**
 * Peint un portrait dans un canevas (à sa taille réelle ; le CSS l'agrandit).
 * @param {HTMLCanvasElement} canvas
 * @param {string} id
 */
export function paintPortrait(canvas, id) {
  const { w, h, pixels } = decodePortrait(id)
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.putImageData(new ImageData(pixels, w, h), 0, 0)
}
