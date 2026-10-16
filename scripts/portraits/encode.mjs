#!/usr/bin/env node
/**
 * Encode les portraits pixel art (art/portraits/*.png) en données JavaScript.
 *
 * Pourquoi : le jeu n'embarque aucune image pour ses personnages. Chaque
 * portrait est décrit par une palette (au plus 52 couleurs) et une suite de
 * pixels compressée par plages (« RLE »), puis redessiné par le code dans un
 * <canvas>. Résultat : quelques kilo-octets, aucun téléchargement d'image, et
 * un rendu net à toutes les tailles (agrandissement « pixelated »).
 *
 * Format d'un portrait : { w, h, palette: ['rrggbb', …], data: 'A3B.12C…' }
 *  - une lettre (A–Z puis a–z) = l'indice de la couleur dans la palette ;
 *  - '.' = pixel transparent (alpha < 128) ;
 *  - un nombre après le symbole = le nombre de répétitions (absent = 1).
 * Les pixels sont lus ligne par ligne, de gauche à droite.
 *
 * Usage : node scripts/portraits/encode.mjs (ou npm run portraits)
 * Les « maîtres » art/portraits/*.png se retouchent dans n'importe quel éditeur
 * de pixel art (Aseprite, Piskel, LibreSprite…) ; ce script régénère
 * src/game/story/portraits.data.js. Aucune dépendance : le PNG est décodé ici
 * (8 bits par canal, non entrelacé).
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = join(ROOT, 'art', 'portraits')
const OUT = join(ROOT, 'src', 'game', 'story', 'portraits.data.js')
const ALPH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

/** Décode un PNG en pixels RGBA (8 bits, non entrelacé). */
export function decodePng(buf, name = 'png') {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${name} : ce n'est pas un PNG`)
  let off = 8
  let w = 0
  let h = 0
  let depth = 0
  let type = 0
  let interlace = 0
  let palette = null
  let trns = null
  const idat = []
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const kind = buf.toString('latin1', off + 4, off + 8)
    const body = buf.subarray(off + 8, off + 8 + len)
    if (kind === 'IHDR') {
      w = body.readUInt32BE(0)
      h = body.readUInt32BE(4)
      depth = body[8]
      type = body[9]
      interlace = body[12]
    } else if (kind === 'PLTE') palette = body
    else if (kind === 'tRNS') trns = body
    else if (kind === 'IDAT') idat.push(body)
    else if (kind === 'IEND') break
    off += 12 + len
  }
  if (depth !== 8 || !(type in CHANNELS) || interlace) throw new Error(`${name} : PNG 8 bits non entrelacé attendu (profondeur ${depth}, type ${type})`)
  const bpp = CHANNELS[type]
  const stride = w * bpp
  const raw = inflateSync(Buffer.concat(idat))
  const rows = Buffer.alloc(stride * h)
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)]
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const row = rows.subarray(y * stride, (y + 1) * stride)
    const up = y ? rows.subarray((y - 1) * stride, y * stride) : null
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp] : 0
      const b = up ? up[i] : 0
      const c = up && i >= bpp ? up[i - bpp] : 0
      let v = src[i]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      row[i] = v & 255
    }
  }
  const px = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    const s = rows.subarray(i * bpp, i * bpp + bpp)
    let rgba
    if (type === 6) rgba = [s[0], s[1], s[2], s[3]]
    else if (type === 2) rgba = [s[0], s[1], s[2], 255]
    else if (type === 4) rgba = [s[0], s[0], s[0], s[1]]
    else if (type === 0) rgba = [s[0], s[0], s[0], 255]
    else rgba = [palette[s[0] * 3], palette[s[0] * 3 + 1], palette[s[0] * 3 + 2], trns && s[0] < trns.length ? trns[s[0]] : 255]
    px.set(rgba, i * 4)
  }
  return { w, h, px }
}

/** Palette et plages d'un portrait (même format que Portraits.js décode). */
export function encode(file) {
  const name = basename(file)
  const { w, h, px } = decodePng(readFileSync(file), name)
  const palette = []
  const index = new Map()
  const chars = []
  for (let i = 0; i < w * h; i++) {
    if (px[i * 4 + 3] < 128) {
      chars.push('.')
      continue
    }
    const key = [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')
    if (!index.has(key)) {
      if (palette.length === ALPH.length) throw new Error(`${name} : plus de ${ALPH.length} couleurs, réduisez la palette`)
      index.set(key, palette.length)
      palette.push(key)
    }
    chars.push(ALPH[index.get(key)])
  }
  let data = ''
  for (let i = 0; i < chars.length; ) {
    let j = i
    while (j < chars.length && chars[j] === chars[i]) j++
    data += chars[i] + (j - i > 1 ? String(j - i) : '')
    i = j
  }
  return { w, h, palette, data }
}

function main() {
  const files = readdirSync(SRC)
    .filter((f) => f.endsWith('.png'))
    .sort()
  const portraits = files.map((f) => [basename(f, '.png'), encode(join(SRC, f))])
  const lines = [
    '// Fichier généré par scripts/portraits/encode.mjs à partir de art/portraits/*.png.',
    '// Ne pas modifier à la main : retoucher le PNG puis relancer le script.',
    '/* eslint-disable */',
    'export const PORTRAIT_DATA = Object.freeze({',
    ...portraits.map(([id, p]) => `  ${id}: ${JSON.stringify(p)},`),
    '})',
  ]
  writeFileSync(OUT, `${lines.join('\n')}\n`, 'utf8')
  for (const [id, p] of portraits) console.log(`${id.padEnd(8)} ${p.w}×${p.h}  ${p.palette.length} couleurs  ${p.data.length} caractères`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
