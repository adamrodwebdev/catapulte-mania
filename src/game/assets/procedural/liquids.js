/**
 * Lacs et lave réalistes (v5.1).
 *
 * Les matières sont calculées UNE fois dans des tuiles périodiques (bruit
 * fractal, cellules de Voronoï), puis peintes en motifs qui glissent lentement
 * dans le temps : deux couches de reflets qui défilent en sens contraire pour
 * l'eau, une croûte refroidie qui dérive sur un magma qui palpite pour la lave.
 * Aucune image à télécharger, et à chaque image seulement quelques motifs et
 * dégradés à recopier.
 */
import { tile, fbm, noise, pattern, TAU } from './realism.js'

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const mix = (a, b, t) => a + (b - a) * t

/* ---------- Tuiles ---------- */

/** Eau en profondeur : bleu-vert nuancé, taches de lumière (caustiques) diffuses. */
function waterTile() {
  return tile('water', 256, 128, (d, w, h) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / w
        const v = y / h
        const n = fbm(u * 4, v * 2, 41, 4, 2, 5)
        // Caustiques : crêtes du bruit (|bruit − 0,5| petit → lumière).
        const c1 = 1 - Math.abs(fbm(u * 6, v * 3, 43, 6, 3, 3) - 0.5) * 2
        const caustic = Math.pow(clamp01(c1), 14) * 0.3
        const k = (y * w + x) * 4
        d[k] = mix(30, 52, n) + caustic * 50
        d[k + 1] = mix(86, 112, n) + caustic * 60
        d[k + 2] = mix(104, 128, n) + caustic * 50
        d[k + 3] = 255
      }
    }
  })
}

/** Reflets de surface : traits clairs étirés à l'horizontale (transparence). */
function rippleTile() {
  return tile('ripples', 256, 64, (d, w, h) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / w
        const v = y / h
        const n = fbm(u * 8, v * 4, 47, 8, 4, 4)
        const crest = Math.pow(clamp01(1 - Math.abs(n - 0.5) * 7), 3)
        const k = (y * w + x) * 4
        d[k] = 235
        d[k + 1] = 246
        d[k + 2] = 255
        d[k + 3] = crest * 190
      }
    }
  })
}

/** Glace : blanc bleuté laiteux, bulles d'air et fissures fines. */
function iceTile() {
  return tile('ice-lake', 256, 64, (d, w, h) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / w
        const v = y / h
        const n = fbm(u * 6, v * 2, 53, 6, 2, 5)
        const crack = Math.pow(clamp01(1 - Math.abs(fbm(u * 5, v * 2, 59, 5, 2, 4) - 0.5) * 18), 2)
        const bubble = noise(u * 64, v * 16, 61, 64, 16) > 0.93 ? 30 : 0
        const k = (y * w + x) * 4
        d[k] = mix(170, 226, n) + bubble - crack * 60
        d[k + 1] = mix(204, 240, n) + bubble - crack * 40
        d[k + 2] = mix(222, 252, n) + bubble - crack * 20
        d[k + 3] = 255
      }
    }
  })
}

/** Points des cellules de Voronoï (périodiques) pour la croûte de lave. */
function cellPoints(n, seed) {
  const pts = []
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) pts.push([(i + noise(i * 3.1, j * 1.7, seed, 1e6, 1e6)) / n, (j + noise(i * 2.3, j * 4.1, seed + 1, 1e6, 1e6)) / n])
  }
  return pts
}

/** Distance aux deux points les plus proches (cellules périodiques), en unités de tuile. */
function voronoi(u, v, pts) {
  let d1 = 9
  let d2 = 9
  for (const [px, py] of pts) {
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const dx = u - (px + ox)
        const dy = v - (py + oy)
        const dd = dx * dx + dy * dy
        if (dd < d1) {
          d2 = d1
          d1 = dd
        } else if (dd < d2) d2 = dd
      }
    }
  }
  return [Math.sqrt(d1), Math.sqrt(d2)]
}

/** Magma : orange-jaune en fusion, tourbillons plus clairs et plus sombres. */
function magmaTile() {
  return tile('magma', 256, 128, (d, w, h) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / w
        const v = y / h
        const warp = fbm(u * 3, v * 2, 67, 3, 2, 3)
        const n = fbm(u * 5 + warp * 0.8, v * 3 + warp * 0.5, 71, 5, 3, 5)
        const t = clamp01(n * 1.3 - 0.1)
        const k = (y * w + x) * 4
        d[k] = mix(190, 255, t)
        d[k + 1] = mix(40, 205, t * t)
        d[k + 2] = mix(10, 90, t * t * t)
        d[k + 3] = 255
      }
    }
  })
}

/**
 * Croûte refroidie : plaques de basalte (cellules), plus sombres au centre,
 * séparées par des fissures transparentes où l'on voit le magma.
 */
function crustTile() {
  const pts = cellPoints(7, 73)
  return tile('crust', 256, 128, (d, w, h) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / w
        const v = y / h
        // La tuile est deux fois plus large que haute : on étire les cellules.
        const [d1, d2] = voronoi(u, (v * h) / w + 0.31, pts)
        const edge = d2 - d1
        const rough = fbm(u * 16, v * 8, 79, 16, 8, 3)
        const k = (y * w + x) * 4
        const g = mix(22, 58, rough) * (0.75 + 0.5 * clamp01(d1 * 4))
        // Bord de plaque encore rouge (refroidi de l'extérieur vers l'intérieur).
        const hot = edge < 0.06 ? 1 - (edge - 0.012) / 0.048 : 0
        d[k] = mix(g + 10, 235, hot * hot)
        d[k + 1] = mix(g * 0.82, 70, hot * hot)
        d[k + 2] = mix(g * 0.72, 18, hot * hot)
        // Fissure (bord de cellule) : transparente, on y voit le magma.
        d[k + 3] = edge < 0.012 ? 0 : edge < 0.02 ? ((edge - 0.012) / 0.008) * 245 : 245
      }
    }
  })
}

/** Prépare les tuiles (appelé au chargement : aucun calcul pendant la partie). */
export function warmLiquids() {
  waterTile()
  rippleTile()
  iceTile()
  magmaTile()
  crustTile()
}

/* ---------- Dessin ---------- */

/** Bassin : berges inclinées, fond arrondi. Le chemin est laissé ouvert pour remplir / découper. */
function basin(g, x0, x1, top, depth, bank) {
  g.beginPath()
  g.moveTo(x0 - bank, top + 3)
  g.quadraticCurveTo(x0, top - 2, x0 + bank * 0.6, top)
  g.lineTo(x1 - bank * 0.6, top)
  g.quadraticCurveTo(x1, top - 2, x1 + bank, top + 3)
  g.quadraticCurveTo(x1 - bank * 0.2, top + depth * 0.8, x1 - bank * 1.5, top + depth)
  g.lineTo(x0 + bank * 1.5, top + depth)
  g.quadraticCurveTo(x0 + bank * 0.2, top + depth * 0.8, x0 - bank, top + 3)
  g.closePath()
}

/** Pierres de berge, posées une fois pour toutes (graine = position du bassin). */
function bankStones(g, x, top, side, seed, color) {
  for (let i = 0; i < 4; i++) {
    const r = 3 + noise(i * 1.3, seed, 83, 1e6, 1e6) * 5
    const sx = x + side * (i * 7 - 4 + noise(i, seed * 0.7, 89, 1e6, 1e6) * 4)
    const sy = top + 1 + noise(i * 2.1, seed, 97, 1e6, 1e6) * 4
    g.beginPath()
    g.ellipse(sx, sy, r * 1.3, r, 0, 0, TAU)
    g.fillStyle = color
    g.fill()
    g.fillStyle = 'rgba(255,255,255,0.18)'
    g.beginPath()
    g.ellipse(sx - r * 0.3, sy - r * 0.35, r * 0.6, r * 0.35, 0, 0, TAU)
    g.fill()
  }
}

/**
 * Lac (ou lac gelé) entre x0 et x1, surface à `ground` (y monde).
 * @param {CanvasRenderingContext2D} g
 */
export function drawLake(g, z, ground, t, pixel, frozen = false) {
  const w = z.x1 - z.x0
  const depth = Math.min(54, 26 + w * 0.08)
  const top = ground - 3
  g.save()
  basin(g, z.x0, z.x1, top, depth, 14)
  g.save()
  g.clip()
  if (frozen) {
    g.fillStyle = pattern(g, iceTile(), { x: z.x0, y: top, unitsPerTile: 300 })
    g.fillRect(z.x0 - 20, top - 4, w + 40, depth + 8)
    // Reflet du ciel sur la glace, qui glisse à peine.
    const sheen = g.createLinearGradient(z.x0, top, z.x1, top + depth)
    const s = (t * 0.03) % 1
    sheen.addColorStop(0, 'rgba(255,255,255,0)')
    sheen.addColorStop(Math.max(0, s - 0.08), 'rgba(255,255,255,0)')
    sheen.addColorStop(s, 'rgba(255,255,255,0.35)')
    sheen.addColorStop(Math.min(1, s + 0.08), 'rgba(255,255,255,0)')
    sheen.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = sheen
    g.fillRect(z.x0 - 20, top - 4, w + 40, depth + 8)
  } else {
    // Eau : profondeur (motif), assombrie vers le fond.
    g.fillStyle = pattern(g, waterTile(), { x: z.x0 + t * 6, y: top, unitsPerTile: 320 })
    g.fillRect(z.x0 - 20, top - 4, w + 40, depth + 8)
    const deep = g.createLinearGradient(0, top, 0, top + depth)
    deep.addColorStop(0, 'rgba(170,215,240,0.35)')
    deep.addColorStop(0.25, 'rgba(20,60,80,0)')
    deep.addColorStop(1, 'rgba(6,24,34,0.65)')
    g.fillStyle = deep
    g.fillRect(z.x0 - 20, top - 4, w + 40, depth + 8)
    // Rayons de lumière obliques qui glissent lentement dans l'eau.
    g.globalCompositeOperation = 'lighter'
    for (let i = 0; i < Math.max(2, Math.floor(w / 60)); i++) {
      const rx = z.x0 + ((i * 61 + t * 5) % (w + 40)) - 20
      const ray = g.createLinearGradient(0, top, 0, top + depth)
      ray.addColorStop(0, 'rgba(180,230,255,0.16)')
      ray.addColorStop(1, 'rgba(180,230,255,0)')
      g.fillStyle = ray
      g.beginPath()
      g.moveTo(rx, top)
      g.lineTo(rx + 9, top)
      g.lineTo(rx + 9 + depth * 0.45, top + depth)
      g.lineTo(rx + depth * 0.45, top + depth)
      g.fill()
    }
    g.globalCompositeOperation = 'source-over'
    // Vase au fond.
    const silt = g.createLinearGradient(0, top + depth - 12, 0, top + depth)
    silt.addColorStop(0, 'rgba(70,60,40,0)')
    silt.addColorStop(1, 'rgba(70,60,40,0.7)')
    g.fillStyle = silt
    g.fillRect(z.x0 - 20, top + depth - 12, w + 40, 14)
    // Reflet du ciel en surface (bande claire), puis deux couches de reflets
    // qui défilent en sens contraire : l'eau ondule.
    const sky = g.createLinearGradient(0, top, 0, top + 7)
    sky.addColorStop(0, 'rgba(225,240,250,0.55)')
    sky.addColorStop(1, 'rgba(225,240,250,0)')
    g.fillStyle = sky
    g.fillRect(z.x0 - 20, top, w + 40, 7)
    g.globalAlpha = 0.6
    g.fillStyle = pattern(g, rippleTile(), { x: z.x0 + t * 14, y: top, unitsPerTile: 180 })
    g.fillRect(z.x0 - 20, top, w + 40, 6)
    g.globalAlpha = 0.22
    g.fillStyle = pattern(g, rippleTile(), { x: z.x0 - t * 9, y: top + 5, unitsPerTile: 120 })
    g.fillRect(z.x0 - 20, top + 5, w + 40, 9)
    g.globalAlpha = 1
  }
  g.restore()
  // Berges : terre mouillée sombre autour du bassin, ligne d'écume ou de givre.
  basin(g, z.x0, z.x1, top, depth, 14)
  g.lineWidth = 9
  g.strokeStyle = 'rgba(40,28,16,0.28)'
  g.stroke()
  g.lineWidth = 3 * pixel
  g.strokeStyle = frozen ? 'rgba(90,120,140,0.6)' : 'rgba(40,32,20,0.55)'
  g.stroke()
  g.lineWidth = 1.6 * pixel
  g.strokeStyle = frozen ? 'rgba(255,255,255,0.95)' : `rgba(240,250,255,${0.65 + 0.2 * Math.sin(t * 2.4)})`
  g.beginPath()
  g.moveTo(z.x0 + 6, top + 0.5)
  g.lineTo(z.x1 - 6, top + 0.5)
  g.stroke()
  bankStones(g, z.x0 - 4, top, -1, z.x0 * 0.013, '#6d675c')
  bankStones(g, z.x1 + 4, top, 1, z.x1 * 0.017, '#6d675c')
  if (!frozen) {
    // Roseaux et massettes, qui ondulent au vent.
    g.lineCap = 'round'
    for (const [bx, hgt] of [[z.x0 + 3, 30], [z.x0 + 10, 22], [z.x0 + 16, 34], [z.x1 - 5, 28], [z.x1 - 13, 36], [z.x1 - 19, 20]]) {
      const sway = Math.sin(t * 1.7 + bx * 0.3) * 3
      g.strokeStyle = '#4c6a33'
      g.lineWidth = 2 * pixel
      g.beginPath()
      g.moveTo(bx, top + 2)
      g.quadraticCurveTo(bx + sway * 0.4, top - hgt * 0.5, bx + sway, top - hgt)
      g.stroke()
      if (hgt > 26) {
        g.fillStyle = '#5b3a22'
        g.beginPath()
        g.ellipse(bx + sway * 0.95, top - hgt + 5, 2.4, 6, sway * 0.04, 0, TAU)
        g.fill()
      }
    }
  }
  g.restore()
}

/**
 * Lave entre x0 et x1. Magma qui palpite, croûte en plaques qui dérive,
 * fissures incandescentes, bulles qui crèvent, chaleur qui fait trembler l'air.
 */
export function drawLava(g, z, ground, t, pixel, animate) {
  const w = z.x1 - z.x0
  const depth = Math.min(52, 26 + w * 0.08)
  const top = ground - 4
  g.save()
  basin(g, z.x0, z.x1, top, depth, 12)
  g.save()
  g.clip()
  g.fillStyle = pattern(g, magmaTile(), { x: z.x0 - t * 4, y: top, unitsPerTile: 260 })
  g.fillRect(z.x0 - 20, top - 4, w + 40, depth + 8)
  // Pulsation : le magma s'avive et s'apaise.
  g.globalCompositeOperation = 'lighter'
  g.globalAlpha = 0.15 + 0.1 * Math.sin(t * 1.8)
  g.fillStyle = '#ff7a1a'
  g.fillRect(z.x0 - 20, top - 4, w + 40, depth + 8)
  g.globalCompositeOperation = 'source-over'
  g.globalAlpha = 1
  // Croûte qui dérive lentement (plus vite en surface que le magma dessous).
  g.fillStyle = pattern(g, crustTile(), { x: z.x0 + t * 5, y: top - 2, unitsPerTile: 150 })
  g.fillRect(z.x0 - 20, top - 4, w + 40, depth + 8)
  // Plus profond = plus sombre (la croûte s'épaissit vers les berges).
  const shade = g.createLinearGradient(0, top, 0, top + depth)
  shade.addColorStop(0, 'rgba(255,200,90,0.12)')
  shade.addColorStop(0.4, 'rgba(40,8,2,0)')
  shade.addColorStop(1, 'rgba(30,6,2,0.55)')
  g.fillStyle = shade
  g.fillRect(z.x0 - 20, top - 4, w + 40, depth + 8)
  g.restore()
  // Berges de roche noire vitrifiée, liseré incandescent.
  basin(g, z.x0, z.x1, top, depth, 12)
  g.lineWidth = 3 * pixel
  g.strokeStyle = 'rgba(20,10,8,0.85)'
  g.stroke()
  g.lineWidth = 1.5 * pixel
  g.strokeStyle = `rgba(255,190,90,${0.6 + 0.3 * Math.sin(t * 3.1)})`
  g.beginPath()
  g.moveTo(z.x0 + 5, top + 0.5)
  g.lineTo(z.x1 - 5, top + 0.5)
  g.stroke()
  bankStones(g, z.x0 - 4, top + 1, -1, z.x0 * 0.011, '#2a2220')
  bankStones(g, z.x1 + 4, top + 1, 1, z.x1 * 0.019, '#2a2220')
  // Halo de chaleur au-dessus (mélange additif).
  g.globalCompositeOperation = 'lighter'
  const glow = g.createLinearGradient(0, top - 80, 0, top + 4)
  glow.addColorStop(0, 'rgba(255,110,30,0)')
  glow.addColorStop(1, `rgba(255,110,30,${0.22 + 0.06 * Math.sin(t * 2.2)})`)
  g.fillStyle = glow
  g.fillRect(z.x0 - 30, top - 80, w + 60, 84)
  g.globalCompositeOperation = 'source-over'
  if (animate) {
    // Bulles qui gonflent puis crèvent (cycle déterministe par bulle).
    const n = Math.max(2, Math.floor(w / 70))
    for (let i = 0; i < n; i++) {
      const cycle = t * (0.5 + noise(i, 3, 101, 1e6, 1e6) * 0.5) + i * 0.37
      const k = cycle % 1
      const slot = Math.floor(cycle)
      const bx = z.x0 + 14 + noise(i * 7.3, slot, 103, 1e6, 1e6) * (w - 28)
      if (k < 0.8) {
        const r = 2 + (k / 0.8) * 6
        g.fillStyle = '#ffd36b'
        g.beginPath()
        g.arc(bx, top + 2 - r * 0.4, r, Math.PI, 0)
        g.fill()
        g.fillStyle = 'rgba(80,20,8,0.5)'
        g.beginPath()
        g.arc(bx - r * 0.3, top + 1 - r * 0.6, r * 0.3, 0, TAU)
        g.fill()
      } else {
        // Éclaboussure à l'éclatement.
        g.fillStyle = '#ffb347'
        const s = (k - 0.8) / 0.2
        for (const dx of [-1, 0, 1]) {
          g.beginPath()
          g.arc(bx + dx * 6 * s, top - 4 - 10 * s + 8 * s * s, 1.6, 0, TAU)
          g.fill()
        }
      }
    }
    // Air qui tremble : quelques ondulations claires qui montent.
    g.strokeStyle = 'rgba(255,220,180,0.12)'
    g.lineWidth = 2 * pixel
    for (let i = 0; i < Math.max(2, Math.floor(w / 90)); i++) {
      const k = (t * 0.6 + i * 0.29) % 1
      const hx = z.x0 + 20 + ((i * 97) % Math.max(20, w - 40))
      const hy = top - 6 - k * 60
      g.globalAlpha = 1 - k
      g.beginPath()
      g.moveTo(hx - 10, hy)
      g.bezierCurveTo(hx - 4, hy - 4, hx + 4, hy + 4, hx + 10, hy)
      g.stroke()
    }
    g.globalAlpha = 1
  }
  g.restore()
}
