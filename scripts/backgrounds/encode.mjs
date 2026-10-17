#!/usr/bin/env node
/**
 * Fonds peints des chapitres (v6.2) :
 *   art/backgrounds/chapter-N.png → src/game/assets/backgrounds/chapter-N.webp
 *
 * - la bande du bas est rognée : le jeu y dessine son propre sol (et c'est là
 *   que le générateur d'images pose sa marque) ;
 * - l'image est ramenée à 2560 px de large et encodée en WebP.
 *
 * Après un nouvel encodage, vérifiez dans src/game/assets/backgrounds.js la
 * ligne de sol de chaque peinture (`ground`) et ses sommets (`peaks`).
 *
 * L'encodage passe par Chrome sans interface (Node ne sait pas écrire de
 * WebP) : Chrome doit être installé (ou son chemin donné par CHROME_PATH).
 * Les PNG d'origine, lourds, ne sont pas versionnés ; les WebP le sont.
 *
 * Usage : npm run backgrounds [-- --crop 0.885 --width 2560 --quality 0.84 --boxes]
 * (--boxes : affiche les boîtes des flocons trouvés, pour les vérifier)
 */
/* global fetch, WebSocket */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = join(ROOT, 'art', 'backgrounds')
const OUT = join(ROOT, 'src', 'game', 'assets', 'backgrounds')
const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? Number(args[i + 1]) : fallback
}
/** Part de la hauteur gardée (le reste, en bas, est rogné). */
const CROP = opt('crop', 0.885)
const WIDTH = opt('width', 2560)
const QUALITY = opt('quality', 0.84)

/**
 * Oiseaux peints (v6.2) : le jeu dessine les siens, qui volent ; ceux des
 * peintures, figés, sont effacés à l'encodage. Boîtes [x, y, largeur, hauteur]
 * en px d'une image de 2560 px de large (rapportées à --width), relevées sur
 * les peintures d'origine. Chaque boîte est comblée depuis son bord : surface
 * de Coons puis lissage harmonique (ciel, nuage, crête restent continus).
 * 'mask' (5e valeur) : seuls les pixels qui tranchent nettement sur ce fond
 * lissé (l'oiseau, son bec) sont repeints ; le reste de la boîte (une crête,
 * la pluie) garde la peinture.
 * Les feuilles soufflées du désert (chapitre 6) restent : on les lit comme du vent.
 */
const ERASE = {
  1: [[645, 227, 42, 19], [878, 241, 47, 23], [285, 295, 42, 16], [1769, 206, 46, 19], [1688, 348, 18, 15], [1730, 448, 30, 19]],
  3: [[703, 161, 38, 16], [651, 312, 30, 21], [1103, 244, 34, 17], [611, 345, 19, 16]],
  6: [[1850, 442, 41, 22]],
  7: [[646, 229, 43, 17], [882, 242, 45, 21], [289, 294, 40, 16], [1390, 272, 56, 30], [1734, 232, 46, 20], [2387, 229, 31, 16]],
  8: [[642, 229, 44, 19], [881, 245, 43, 22], [294, 297, 36, 16], [1763, 208, 43, 18], [1683, 350, 23, 16]],
  9: [[1346, 282, 66, 27], [1306, 303, 23, 14], [1290, 330, 42, 18], [1439, 295, 43, 27], [1128, 558, 38, 22], [1048, 680, 56, 42, 'mask'], [886, 936, 37, 30], [1491, 303, 14, 13], [1481, 317, 12, 12], [1160, 444, 22, 15]],
  10: [[1723, 448, 34, 22], [1085, 678, 25, 19]],
}

/**
 * Traits peints (v6.2) : la pluie de l'orage (chapitre 9), que le jeu fait
 * tomber (figée dans la peinture, elle faisait double emploi), et les étoiles
 * filantes figées de la nuit (chapitre 4). Un pixel est un trait s'il est plus clair que
 * ses DEUX voisins de part et d'autre du trait (un bord n'en a qu'un), et si le
 * trait se prolonge dans son sens (le long de `dir`, sur au moins trois des six
 * points pris à ±3, ±6 et ±9 px : un éclair, brisé, n'y suffit pas). Il prend
 * alors la couleur du fond, de part et d'autre.
 *  - `dir` : sens du trait ; `side` : demi-largeur sondée (px, à 2560 de large) ;
 *  - `contrast` : écart de luminance minimal avec le fond ;
 *  - `area` : zone traitée [gauche, haut, droite, bas], en part de l'image ;
 *  - `keep` : disques épargnés [x, y, rayon] en part de la largeur (la lune) ;
 *  - `heads` : la tête de chaque trait (au début, dans le sens de `dir`) est effacée aussi.
 */
const STREAKS = {
  4: { dir: [1, -0.07], side: 4, contrast: 16, area: [0, 0, 1, 0.5], keep: [[0.8205, 0.2035, 0.035]], heads: true },
  9: { dir: [-0.375, 0.927], side: 3, contrast: 12, area: [0, 0, 1, 1], keep: [] },
}

/**
 * Flocons peints (v6.2) : la neige de l'hiver (chapitre 8), que le jeu fait
 * tomber. Un flocon est un point clair isolé dans le ciel : plus clair que tout
 * son voisinage (5 × 5), et ses voisins (huit à `ring` px, huit à 1,6 fois
 * plus loin) sont du ciel bleu, uni et nettement plus sombre. Il est comblé
 * depuis le bord d'une boîte de `box` px de côté, comme un oiseau.
 *  - `area` : zone traitée [gauche, haut, droite, bas], en part de l'image ;
 *  - `min` : luminance minimale du flocon ; `contrast` : écart minimal avec le ciel ;
 *  - `blue` : de combien le bleu du ciel dépasse son rouge, au moins ;
 *  - `spread` : écart de luminance maximal entre ces voisins (ciel uni).
 */
const DOTS = {
  8: { area: [0, 0, 1, 0.55], min: 200, contrast: 22, blue: 30, spread: 18, ring: 9, box: 18 },
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean)
  const found = candidates.find((p) => existsSync(p))
  if (!found) throw new Error('Chrome introuvable : indiquez son chemin dans CHROME_PATH.')
  return found
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const files = existsSync(SRC) ? readdirSync(SRC).filter((f) => /^chapter-\d+\.png$/.test(f)) : []
if (!files.length) {
  console.log(`Aucune peinture dans ${SRC} (chapter-1.png … chapter-10.png).`)
  process.exit(0)
}
mkdirSync(OUT, { recursive: true })

const profile = mkdtempSync(join(tmpdir(), 'ctc-backgrounds-'))
const port = 9500 + Math.floor(Math.random() * 400)
const chrome = spawn(findChrome(), ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' })
try {
  let pages = null
  for (let i = 0; i < 60 && !pages; i++) {
    try {
      pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    } catch {
      await sleep(200)
    }
  }
  const page = pages?.find((t) => t.type === 'page')
  if (!page) throw new Error('Chrome ne répond pas.')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener('open', r))
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
    }
  })
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const n = ++id
      pending.set(n, resolve)
      ws.send(JSON.stringify({ id: n, method, params }))
    })

  for (const file of files.sort((a, b) => parseInt(a.slice(8), 10) - parseInt(b.slice(8), 10))) {
    const src = `data:image/png;base64,${readFileSync(join(SRC, file)).toString('base64')}`
    const boxes = ERASE[parseInt(file.slice(8), 10)] ?? []
    const streaks = STREAKS[parseInt(file.slice(8), 10)] ?? null
    const dots = DOTS[parseInt(file.slice(8), 10)] ?? null
    const expression = `(async () => {
      const img = new Image()
      img.src = ${JSON.stringify(src)}
      await img.decode()
      const keep = Math.round(img.height * ${CROP})
      const w = Math.min(${WIDTH}, img.width)
      const h = Math.round((keep * w) / img.width)
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const g = c.getContext('2d', { willReadFrequently: true })
      g.imageSmoothingQuality = 'high'
      g.drawImage(img, 0, 0, img.width, keep, 0, 0, w, h)
      const s = w / 2560
      // Traits peints (pluie, étoiles filantes) : voir STREAKS.
      const st = ${JSON.stringify(streaks)}
      let streakCount = 0
      const heads = []
      if (st) {
        const im = g.getImageData(0, 0, w, h)
        const d = im.data
        const L = new Float32Array(w * h)
        for (let i = 0; i < w * h; i++) L[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]
        const n = Math.hypot(st.dir[0], st.dir[1])
        const ax = st.dir[0] / n
        const ay = st.dir[1] / n
        const px = -ay
        const py = ax
        const off = st.side * s
        const lum = (x, y) => {
          const xi = Math.round(x)
          const yi = Math.round(y)
          return xi < 0 || yi < 0 || xi >= w || yi >= h ? -1 : L[yi * w + xi]
        }
        const bright = (x, y) => {
          const l = lum(x, y)
          const a = lum(x + px * off, y + py * off)
          const b = lum(x - px * off, y - py * off)
          return l < 0 || a < 0 || b < 0 ? -Infinity : l - Math.max(a, b)
        }
        const kept = (x, y) => st.keep.some(([u, v, r]) => Math.hypot(x / w - u, (y - v * h) / w) < r)
        const mask = new Uint8Array(w * h)
        const [l0, t0, r0, b0] = st.area
        for (let y = Math.round(t0 * h); y < Math.round(b0 * h); y++) {
          for (let x = Math.round(l0 * w); x < Math.round(r0 * w); x++) {
            if (bright(x, y) < st.contrast) continue
            let along = 0
            for (const k of [-9, -6, -3, 3, 6, 9]) if (bright(x + ax * k * s, y + ay * k * s) > st.contrast * 0.5) along++
            if (along >= 3 && !kept(x, y)) mask[y * w + x] = 1
          }
        }
        // Têtes des étoiles filantes : au début de chaque trait, effacées comme un oiseau.
        if (st.heads) {
          const seen = new Uint8Array(w * h)
          for (let i0 = 0; i0 < w * h; i0++) {
            if (!mask[i0] || seen[i0]) continue
            const stack = [i0]
            seen[i0] = 1
            let n = 0
            let best = i0
            let bestP = Infinity
            while (stack.length) {
              const i = stack.pop()
              n++
              const x = i % w
              const y = (i - x) / w
              const p = x * ax + y * ay
              if (p < bestP) { bestP = p; best = i }
              for (let dy = -2; dy <= 2; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                  const xi = x + dx
                  const yi = y + dy
                  const j = yi * w + xi
                  if (xi >= 0 && yi >= 0 && xi < w && yi < h && mask[j] && !seen[j]) { seen[j] = 1; stack.push(j) }
                }
              }
            }
            if (n < 20) continue
            // La tête déborde le trait des deux côtés de son début : boîte centrée, assez large.
            const hx = best % w
            const hy = (best - hx) / w
            heads.push([(hx - 14 * s) / s, (hy - 10 * s) / s, 30, 20])
          }
        }
        // Le liseré du trait (anticrénelage, contour sombre) : deux pixels de part et d'autre.
        const wide = mask.slice()
        for (let i = 0; i < w * h; i++) {
          if (!mask[i]) continue
          const x = i % w
          const y = (i - x) / w
          for (const sg of [-2, -1, 1, 2]) {
            const xi = Math.round(x + px * sg)
            const yi = Math.round(y + py * sg)
            if (xi >= 0 && yi >= 0 && xi < w && yi < h) wide[yi * w + xi] = 1
          }
        }
        // Chaque pixel du trait prend la couleur du fond, de part et d'autre.
        const src = d.slice()
        for (let i = 0; i < w * h; i++) {
          if (!wide[i]) continue
          streakCount++
          const x = i % w
          const y = (i - x) / w
          const pick = []
          for (const far of [off + 3 * s, off + 5 * s, off + 8 * s]) {
            for (const sg of [-1, 1]) {
              const xi = Math.round(x + px * far * sg)
              const yi = Math.round(y + py * far * sg)
              if (xi >= 0 && yi >= 0 && xi < w && yi < h && !wide[yi * w + xi]) pick.push((yi * w + xi) * 4)
            }
            if (pick.length >= 2) break
          }
          if (!pick.length) continue
          for (let c = 0; c < 3; c++) d[i * 4 + c] = Math.round(pick.reduce((sum, j) => sum + src[j + c], 0) / pick.length)
        }
        g.putImageData(im, 0, 0)
      }
      // Flocons peints : voir DOTS ; chacun devient une boîte, comblée comme un oiseau.
      const dt = ${JSON.stringify(dots)}
      const flakes = []
      if (dt) {
        const d = g.getImageData(0, 0, w, h).data
        const lumAt = (x, y) => { const i = (y * w + x) * 4; return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] }
        const R = Math.round(dt.ring * s)
        const B = dt.box * s
        const ring = [1, 1.6].flatMap((k) => [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]].map(([a, b]) => [Math.round(a * k * R), Math.round(b * k * R)]))
        const [l0, t0, r0, b0] = dt.area
        const M = Math.ceil(1.6 * R)
        for (let y = Math.max(M, Math.round(t0 * h)); y < Math.min(h - M, Math.round(b0 * h)); y++) {
          for (let x = Math.max(M, Math.round(l0 * w)); x < Math.min(w - M, Math.round(r0 * w)); x++) {
            const l = lumAt(x, y)
            if (l < dt.min) continue
            let peak = true
            for (let dy = -2; dy <= 2 && peak; dy++) for (let dx = -2; dx <= 2; dx++) if ((dx || dy) && lumAt(x + dx, y + dy) > l) { peak = false; break }
            if (!peak) continue
            const around = ring.map(([dx, dy]) => lumAt(x + dx, y + dy))
            const sky = ring.every(([dx, dy], k) => { const i = ((y + dy) * w + x + dx) * 4; return d[i + 2] - d[i] >= dt.blue && around[k] <= l - dt.contrast })
            // Ciel uni tout autour : un sommet, de la roche ou un bord de nuage y échouent.
            if (!sky || Math.max(...around) - Math.min(...around) > dt.spread || flakes.some(([fx, fy]) => Math.abs(fx + dt.box / 2 - x / s) < dt.box / 2 && Math.abs(fy + dt.box / 2 - y / s) < dt.box / 2)) continue
            flakes.push([(x - B / 2) / s, (y - B / 2) / s, dt.box, dt.box])
          }
        }
      }
      // Oiseaux peints : chaque boîte comblée depuis son bord (voir ERASE).
      for (const [bx, by, bw, bh, mode] of [...${JSON.stringify(boxes)}, ...heads, ...flakes]) {
        const x = Math.max(0, Math.round(bx * s) - 1)
        const y = Math.max(0, Math.round(by * s) - 1)
        const W = Math.min(w - x, Math.round(bw * s) + 2)
        const H = Math.min(h - y, Math.round(bh * s) + 2)
        if (W < 3 || H < 3) continue
        const im = g.getImageData(x, y, W, H)
        const d = im.data
        const inside = (i, j) => i > 0 && j > 0 && i < W - 1 && j < H - 1
        // Fond lissé, par canal : surface de Coons (les quatre bords mêlés, moins
        // les coins), puis lissage harmonique de l'intérieur (le bord reste tel quel).
        const fill = [0, 1, 2].map((ch) => {
          const at = (i, j) => d[(j * W + i) * 4 + ch]
          const f = new Float32Array(W * H)
          for (let j = 0; j < H; j++) {
            for (let i = 0; i < W; i++) {
              const u = i / (W - 1)
              const t = j / (H - 1)
              f[j * W + i] = (1 - t) * at(i, 0) + t * at(i, H - 1) + (1 - u) * at(0, j) + u * at(W - 1, j) - ((1 - u) * (1 - t) * at(0, 0) + u * (1 - t) * at(W - 1, 0) + (1 - u) * t * at(0, H - 1) + u * t * at(W - 1, H - 1))
            }
          }
          for (let it = 0; it < 80; it++) {
            for (let j = 1; j < H - 1; j++) {
              for (let i = 1; i < W - 1; i++) f[j * W + i] = (f[j * W + i - 1] + f[j * W + i + 1] + f[(j - 1) * W + i] + f[(j + 1) * W + i]) / 4
            }
          }
          return f
        })
        // Pixels à repeindre : toute la boîte, ou ('mask') ceux qui tranchent
        // nettement sur le fond lissé, élargis de deux pixels.
        const lum = (r, gg, b) => 0.299 * r + 0.587 * gg + 0.114 * b
        let paint = new Uint8Array(W * H)
        for (let j = 1; j < H - 1; j++) {
          for (let i = 1; i < W - 1; i++) {
            const k = j * W + i
            paint[k] = mode !== 'mask' || Math.abs(lum(d[k * 4], d[k * 4 + 1], d[k * 4 + 2]) - lum(fill[0][k], fill[1][k], fill[2][k])) > 45 ? 1 : 0
          }
        }
        if (mode === 'mask') {
          for (let pass = 0; pass < 2; pass++) {
            const grown = paint.slice()
            for (let j = 1; j < H - 1; j++) {
              for (let i = 1; i < W - 1; i++) if (paint[j * W + i - 1] || paint[j * W + i + 1] || paint[(j - 1) * W + i] || paint[(j + 1) * W + i]) grown[j * W + i] = 1
            }
            paint = grown
          }
        }
        for (let ch = 0; ch < 3; ch++) {
          const f = fill[ch]
          if (mode === 'mask') {
            // Repeints depuis leurs voisins gardés : la crête et la pluie autour restent.
            const v = new Float32Array(W * H)
            for (let k = 0; k < W * H; k++) v[k] = paint[k] ? f[k] : d[k * 4 + ch]
            for (let it = 0; it < 120; it++) {
              for (let j = 1; j < H - 1; j++) {
                for (let i = 1; i < W - 1; i++) if (paint[j * W + i]) v[j * W + i] = (v[j * W + i - 1] + v[j * W + i + 1] + v[(j - 1) * W + i] + v[(j + 1) * W + i]) / 4
              }
            }
            for (let k = 0; k < W * H; k++) if (paint[k]) d[k * 4 + ch] = Math.max(0, Math.min(255, Math.round(v[k])))
          } else {
            for (let j = 1; j < H - 1; j++) {
              for (let i = 1; i < W - 1; i++) if (inside(i, j)) d[(j * W + i) * 4 + ch] = Math.max(0, Math.min(255, Math.round(f[j * W + i])))
            }
          }
        }
        g.putImageData(im, x, y)
      }
      return { w, h, streakCount, flakes: flakes.map((f) => f.map(Math.round)), data: c.toDataURL('image/webp', ${QUALITY}) }
    })()`
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    const v = r.result?.result?.value
    if (!v?.data?.startsWith('data:image/webp')) throw new Error(`${file} : encodage impossible`)
    const out = join(OUT, file.replace('.png', '.webp'))
    const buf = Buffer.from(v.data.split(',')[1], 'base64')
    writeFileSync(out, buf)
    console.log(`${file} → ${v.w}×${v.h}, ${(buf.length / 1024).toFixed(0)} Ko${boxes.length ? `, ${boxes.length} oiseau(x) peint(s) effacé(s)` : ''}${v.streakCount ? `, ${v.streakCount} px de traits peints effacés` : ''}${v.flakes.length ? `, ${v.flakes.length} flocon(s) peint(s) effacé(s)` : ''}`)
    if (args.includes('--boxes') && v.flakes.length) console.log(`  flocons : ${JSON.stringify(v.flakes)}`)
  }
  ws.close()
} finally {
  chrome.kill()
  await sleep(300)
  try {
    rmSync(profile, { recursive: true, force: true })
  } catch {
    /* profil temporaire : le système le nettoiera */
  }
}
