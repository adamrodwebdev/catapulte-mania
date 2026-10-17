import { TREB_TUNING } from '../aim/TrebuchetInput.js'

/**
 * Aides à la visée (v6.2, sorties du Renderer) : viseur de la catapulte et de
 * la baliste, fanion et cadran du trébuchet, courbe de l'aide à la trajectoire
 * et ses repères d'élément. Dessin seulement, en repère du monde ; tailles en
 * pixels d'écran (`pixel` = 1 / zoom). Aucun état d'une image à l'autre.
 */

/**
 * Trébuchet (v5.4) : fanion planté au point d'impact, courbe du tir en
 * direct pendant la jauge, et cadran de la jauge au-dessus de l'engin
 * (de la cloche au tir tendu). Tailles en pixels d'écran (`pixel` = 1 / zoom).
 */
export function drawTrebAim(ctx, a, time, pixel, highContrast) {
  const px = Math.max(0.6, pixel)
  const gold = highContrast ? '#ffd400' : '#e8b62c'
  const light = highContrast ? '#ffd400' : '#fff6dc'
  const col = a.reachable ? gold : '#8b8b8b'
  ctx.save()
  ctx.lineCap = 'round'
  // Courbe du tir : des points de plus en plus fins ; grisée si la cible est hors de portée.
  if (a.path?.length) {
    const n = a.path.length
    for (let i = 0; i < n; i++) {
      const p = a.path[i]
      const k = i / n
      ctx.globalAlpha = a.phase === 'fired' ? 0.45 : 1 - k * 0.45
      ctx.beginPath()
      ctx.arc(p.x, p.y, (4.2 - k * 1.6) * px, 0, Math.PI * 2)
      ctx.fillStyle = a.reachable ? light : '#b9b9b9'
      ctx.fill()
      ctx.lineWidth = 1.4 * px
      ctx.strokeStyle = '#1e1a2b'
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }
  drawFlag(ctx, a.x, a.y, col, px, time, a.reachable)
  if (a.phase === 'power' || a.phase === 'fired') drawGaugeDial(ctx, a, px, gold, light)
  ctx.restore()
}

/** Fanion-cible : anneaux au sol, mât et flamme ; croix rouge si hors de portée. */
function drawFlag(ctx, x, y, col, px, time, reachable) {
  const r = 15 * px
  ctx.lineWidth = 2.5 * px
  ctx.strokeStyle = 'rgba(30,26,43,0.55)'
  ctx.beginPath()
  ctx.ellipse(x, y, r + 2 * px, (r + 2 * px) * 0.42, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = col
  ctx.beginPath()
  ctx.ellipse(x, y, r, r * 0.4, 0, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(x, y, r * 0.42, r * 0.17, 0, 0, Math.PI * 2)
  ctx.stroke()
  const top = y - 46 * px
  ctx.strokeStyle = '#4a3420'
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x, top)
  ctx.stroke()
  const wave = Math.sin(time / 160) * 2 * px
  ctx.fillStyle = col
  ctx.strokeStyle = 'rgba(30,26,43,0.7)'
  ctx.lineWidth = 1.5 * px
  ctx.beginPath()
  ctx.moveTo(x, top)
  ctx.quadraticCurveTo(x + 12 * px, top + 3 * px + wave, x + 24 * px, top + 7 * px)
  ctx.quadraticCurveTo(x + 12 * px, top + 11 * px + wave, x, top + 15 * px)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  if (!reachable) {
    ctx.strokeStyle = '#c0392b'
    ctx.lineWidth = 3 * px
    ctx.beginPath()
    ctx.moveTo(x - 9 * px, y - 9 * px)
    ctx.lineTo(x + 9 * px, y + 9 * px)
    ctx.moveTo(x + 9 * px, y - 9 * px)
    ctx.lineTo(x - 9 * px, y + 9 * px)
    ctx.stroke()
  }
}

/**
 * Cadran de la jauge : un quart de cercle de l'arc le plus tendu à la
 * cloche, une aiguille qui va et vient, et deux pictogrammes (sans texte,
 * lisibles dans toutes les langues) : arc haut = cloche, trait plat = tendu.
 */
function drawGaugeDial(ctx, a, px, gold, light) {
  const { x, y } = a.origin
  const R = 72 * px
  const lob = (TREB_TUNING.LOB_ANGLE * Math.PI) / 180
  const flat = (TREB_TUNING.FLAT_ANGLE * Math.PI) / 180
  const at = (rad, r) => ({ x: x + Math.cos(rad) * r, y: y - Math.sin(rad) * r })
  // Fond du cadran.
  ctx.fillStyle = 'rgba(30,26,43,0.55)'
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.arc(x, y, R + 10 * px, -lob - 0.08, -flat + 0.08)
  ctx.closePath()
  ctx.fill()
  // Graduation : dégradé de la cloche (bleu) au tendu (rouge).
  const steps = 24
  for (let i = 0; i < steps; i++) {
    const u0 = i / steps
    const u1 = (i + 1) / steps
    const r0 = lob + (flat - lob) * u0
    const r1 = lob + (flat - lob) * u1
    ctx.strokeStyle = `hsl(${210 - 200 * u0}, 70%, 58%)`
    ctx.lineWidth = 8 * px
    ctx.lineCap = 'butt'
    ctx.beginPath()
    ctx.arc(x, y, R, -r0, -r1, false)
    ctx.stroke()
  }
  ctx.lineCap = 'round'
  // Aiguille : arc du moment.
  const rad = (a.angle * Math.PI) / 180
  const tip = at(rad, R + 6 * px)
  ctx.strokeStyle = a.phase === 'fired' ? gold : light
  ctx.lineWidth = 3.5 * px
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(tip.x, tip.y)
  ctx.stroke()
  ctx.fillStyle = a.phase === 'fired' ? gold : light
  ctx.beginPath()
  ctx.arc(tip.x, tip.y, 6 * px, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#1e1a2b'
  ctx.lineWidth = 1.5 * px
  ctx.stroke()
  // Pictogrammes : cloche (arc haut) côté haut, tendu (trait) côté bas.
  const icon = (rad0, draw) => {
    const c = at(rad0, R + 26 * px)
    ctx.save()
    ctx.translate(c.x, c.y)
    ctx.strokeStyle = light
    ctx.lineWidth = 2.5 * px
    ctx.beginPath()
    draw()
    ctx.stroke()
    ctx.restore()
  }
  icon(lob + 0.05, () => {
    ctx.moveTo(-10 * px, 6 * px)
    ctx.quadraticCurveTo(0, -18 * px, 10 * px, 6 * px)
  })
  icon(flat - 0.08, () => {
    ctx.moveTo(-10 * px, 2 * px)
    ctx.quadraticCurveTo(0, -4 * px, 12 * px, 2 * px)
  })
}

/**
 * Viseur (v5.2) : rapporteur d'angle, jauge de puissance, valeurs exactes,
 * repères du tir précédent, et la fronde pendant le geste.
 * Tailles exprimées en pixels d'écran (`pixel` = 1 / zoom) : le viseur garde
 * la même taille à l'écran quel que soit le cadrage.
 */
export function drawAim(ctx, aim, pixel, highContrast) {
  const { x, y, angle, power, dir = 1, min = 5, max = 80, last = null } = aim
  const px = Math.max(0.6, pixel)
  const R = 92 * px
  const rad = (deg) => (deg * Math.PI) / 180
  // Repère du viseur : x vers l'avant du tir, y vers le haut (angles trigonométriques).
  const at = (deg, r) => ({ x: x + Math.cos(rad(deg)) * r * dir, y: y - Math.sin(rad(deg)) * r })
  const off = aim.cancelling
  const ink = 'rgba(30,26,43,0.75)'
  const light = highContrast ? '#ffd400' : '#fff6dc'
  ctx.save()
  ctx.lineCap = 'round'
  ctx.globalAlpha = off ? 0.45 : 1

  // 1. Trajectoire du tir précédent (fantôme), en pointillés pâles.
  if (last?.path?.length > 1) {
    ctx.fillStyle = 'rgba(255,246,220,0.38)'
    for (let i = 1; i < last.path.length; i += 2) {
      const q = last.path[i]
      ctx.beginPath()
      ctx.arc(q.x, q.y, 2.2 * px, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // 2. Rapporteur : arc des angles permis, graduations tous les 5°, plus longues tous les 15°.
  ctx.lineWidth = 7 * px
  ctx.strokeStyle = 'rgba(30,26,43,0.35)'
  ctx.beginPath()
  ctx.arc(x, y, R, dir > 0 ? -rad(max) : Math.PI + rad(min), dir > 0 ? -rad(min) : Math.PI + rad(max))
  ctx.stroke()
  ctx.lineWidth = 1.6 * px
  ctx.strokeStyle = 'rgba(255,246,220,0.75)'
  for (let a = Math.ceil(min / 5) * 5; a <= max; a += 5) {
    const big = a % 15 === 0
    const p0 = at(a, R - (big ? 7 : 4) * px)
    const p1 = at(a, R + (big ? 7 : 4) * px)
    ctx.beginPath()
    ctx.moveTo(p0.x, p0.y)
    ctx.lineTo(p1.x, p1.y)
    ctx.stroke()
  }
  // Mode précision : graduations au degré autour de l'angle visé.
  if (aim.fine) {
    ctx.lineWidth = 1 * px
    for (let a = Math.ceil(angle) - 6; a <= Math.floor(angle) + 6; a++) {
      if (a < min || a > max) continue
      const p0 = at(a, R - 3 * px)
      const p1 = at(a, R + 3 * px)
      ctx.beginPath()
      ctx.moveTo(p0.x, p0.y)
      ctx.lineTo(p1.x, p1.y)
      ctx.stroke()
    }
  }
  // Angle du tir précédent : petit triangle creux sur l'arc.
  if (last && Number.isFinite(last.angle)) {
    const g = at(last.angle, R + 12 * px)
    const g1 = at(last.angle - 2.2, R + 20 * px)
    const g2 = at(last.angle + 2.2, R + 20 * px)
    ctx.beginPath()
    ctx.moveTo(g.x, g.y)
    ctx.lineTo(g1.x, g1.y)
    ctx.lineTo(g2.x, g2.y)
    ctx.closePath()
    ctx.lineWidth = 1.6 * px
    ctx.strokeStyle = 'rgba(255,246,220,0.8)'
    ctx.stroke()
  }

  // 3. Jauge de puissance, dans l'axe du tir : du vert au rouge.
  const r0 = 26 * px
  const L = 130 * px
  const tip = at(angle, r0 + L * power)
  const base = at(angle, r0)
  const end = at(angle, r0 + L)
  ctx.lineWidth = 10 * px
  ctx.strokeStyle = ink
  ctx.beginPath()
  ctx.moveTo(base.x, base.y)
  ctx.lineTo(end.x, end.y)
  ctx.stroke()
  if (power > 0.002) {
    const gr = ctx.createLinearGradient(base.x, base.y, end.x, end.y)
    gr.addColorStop(0, '#6fcf5b')
    gr.addColorStop(0.6, '#f2c94c')
    gr.addColorStop(1, '#e2553b')
    ctx.lineWidth = 6 * px
    ctx.strokeStyle = gr
    ctx.beginPath()
    ctx.moveTo(base.x, base.y)
    ctx.lineTo(tip.x, tip.y)
    ctx.stroke()
  }
  // Puissance du tir précédent : encoche sur la jauge.
  if (last && Number.isFinite(last.power)) {
    const n = at(angle, r0 + L * last.power)
    const nx = Math.sin(rad(angle)) * 8 * px
    const ny = Math.cos(rad(angle)) * 8 * px * dir
    ctx.lineWidth = 2 * px
    ctx.strokeStyle = light
    ctx.beginPath()
    ctx.moveTo(n.x - nx * dir, n.y - ny * dir)
    ctx.lineTo(n.x + nx * dir, n.y + ny * dir)
    ctx.stroke()
  }
  // Aiguille de l'angle (traverse le rapporteur) et pointe de la jauge.
  const needle0 = at(angle, R - 12 * px)
  const needle1 = at(angle, R + 12 * px)
  ctx.lineWidth = 4 * px
  ctx.strokeStyle = light
  ctx.beginPath()
  ctx.moveTo(needle0.x, needle0.y)
  ctx.lineTo(needle1.x, needle1.y)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(tip.x, tip.y, 6 * px, 0, Math.PI * 2)
  ctx.fillStyle = light
  ctx.fill()
  ctx.lineWidth = 2 * px
  ctx.strokeStyle = ink
  ctx.stroke()

  // 4. Valeurs exactes, dans une pastille au bout de la jauge.
  const fmt = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1))
  const label = `${fmt(Math.round(angle * 2) / 2)}°  ${fmt(Math.round(power * 200) / 2)} %`
  ctx.font = `700 ${Math.round(14 * px)}px Inter, system-ui, sans-serif`
  const w = ctx.measureText(label).width + 16 * px
  // Place fixe, au-dessus du rapporteur : l'œil la retrouve toujours au même endroit.
  const bx = x + dir * R * 0.15 - (dir > 0 ? 0 : w)
  const by = y - R - 44 * px
  ctx.fillStyle = 'rgba(30,26,43,0.82)'
  ctx.beginPath()
  ctx.roundRect?.(bx, by, w, 24 * px, 12 * px)
  if (!ctx.roundRect) ctx.rect(bx, by, w, 24 * px)
  ctx.fill()
  ctx.fillStyle = light
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, bx + 8 * px, by + 12.5 * px)
  if (aim.fine) {
    // Loupe : mode précision actif.
    const mx = bx + w + 14 * px
    const my = by + 12 * px
    ctx.lineWidth = 2.4 * px
    ctx.strokeStyle = light
    ctx.beginPath()
    ctx.arc(mx, my - 2 * px, 6 * px, 0, Math.PI * 2)
    ctx.moveTo(mx + 4 * px, my + 2.5 * px)
    ctx.lineTo(mx + 9 * px, my + 7.5 * px)
    ctx.stroke()
  }

  // 5. La fronde pendant le geste, là où le doigt s'est posé : deux brins
  //    tendus du point de départ jusqu'au doigt (le geste se fait n'importe où).
  if (aim.dragging && aim.pointer && aim.anchor) {
    const pt = aim.pointer
    const an0 = aim.anchor
    const k = 0.4 + power * 0.6
    const nx = -(pt.y - an0.y)
    const ny = pt.x - an0.x
    const nl = Math.hypot(nx, ny) || 1
    ctx.globalAlpha = off ? 0.5 : 0.9
    for (const side of [-1, 1]) {
      ctx.lineWidth = (3.4 - power * 1.4) * px
      ctx.strokeStyle = '#7a5a36'
      ctx.beginPath()
      ctx.moveTo(an0.x + (side * nx * 9 * px) / nl, an0.y + (side * ny * 9 * px) / nl)
      ctx.lineTo(pt.x, pt.y)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.arc(pt.x, pt.y, (9 + 5 * k) * px, 0, Math.PI * 2)
    ctx.fillStyle = off ? 'rgba(200,60,50,0.35)' : 'rgba(255,246,220,0.25)'
    ctx.fill()
    ctx.lineWidth = 2 * px
    ctx.strokeStyle = off ? '#d9534f' : light
    ctx.stroke()
    if (aim.fine) {
      ctx.setLineDash([4 * px, 4 * px])
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, 26 * px, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
    }
    // Point de départ du geste : y revenir annule le tir.
    if (aim.anchor) {
      const an = aim.anchor
      ctx.globalAlpha = off ? 1 : 0.6
      ctx.lineWidth = 2 * px
      ctx.strokeStyle = off ? '#d9534f' : light
      ctx.beginPath()
      ctx.arc(an.x, an.y, 12 * px, 0, Math.PI * 2)
      ctx.stroke()
      if (off) {
        ctx.beginPath()
        ctx.moveTo(an.x - 6 * px, an.y - 6 * px)
        ctx.lineTo(an.x + 6 * px, an.y + 6 * px)
        ctx.moveTo(an.x + 6 * px, an.y - 6 * px)
        ctx.lineTo(an.x - 6 * px, an.y + 6 * px)
        ctx.stroke()
      }
    }
  }
  ctx.restore()
}

/**
 * Repère d'élément sur la courbe de visée (v6.1) : une pastille de la couleur
 * de l'élément, avec son signe (flocon, flamme, éclair, grains de sable).
 */
function elementMark(ctx, x, y, element, pixel) {
  const px = Math.max(1, pixel)
  const r = 11 * px
  const color = { frost: '#bfe6ff', fire: '#ffb347', charge: '#cfe8ff', sand: '#e2c48c' }[element] ?? '#ffffff'
  ctx.save()
  ctx.globalAlpha = 0.95
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(20,16,30,0.82)'
  ctx.fill()
  ctx.lineWidth = 2 * px
  ctx.strokeStyle = color
  ctx.stroke()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 1.6 * px
  ctx.lineCap = 'round'
  ctx.beginPath()
  if (element === 'frost') {
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI) / 3
      ctx.moveTo(x - Math.cos(a) * r * 0.6, y - Math.sin(a) * r * 0.6)
      ctx.lineTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6)
    }
    ctx.stroke()
  } else if (element === 'fire') {
    ctx.moveTo(x, y - r * 0.65)
    ctx.quadraticCurveTo(x + r * 0.55, y, x, y + r * 0.55)
    ctx.quadraticCurveTo(x - r * 0.55, y, x, y - r * 0.65)
    ctx.fill()
  } else if (element === 'charge') {
    ctx.moveTo(x + r * 0.15, y - r * 0.65)
    ctx.lineTo(x - r * 0.3, y + r * 0.05)
    ctx.lineTo(x + r * 0.2, y + r * 0.05)
    ctx.lineTo(x - r * 0.15, y + r * 0.65)
    ctx.stroke()
  } else {
    for (const [dx, dy] of [[-0.35, -0.2], [0.3, -0.3], [0, 0.25], [-0.25, 0.4], [0.35, 0.3]]) {
      ctx.moveTo(x + dx * r + 1.5 * px, y + dy * r)
      ctx.arc(x + dx * r, y + dy * r, 1.5 * px, 0, Math.PI * 2)
    }
    ctx.fill()
  }
  ctx.restore()
}

/** Aide à la trajectoire : points de plus en plus fins, croix au point d'arrivée, repères d'élément. */
export function drawTrajectory(ctx, points, pixel, highContrast) {
  const n = points.length
  for (let i = 0; i < n; i++) {
    const p = points[i]
    // Repère du souffle du monde (v6.1) : ici, le vent marque le tir.
    if (p.mark) {
      elementMark(ctx, p.x, p.y, p.mark, pixel)
      continue
    }
    const t = i / n
    ctx.globalAlpha = 1 - t * 0.6
    ctx.beginPath()
    ctx.arc(p.x, p.y, (4.5 - t * 2) * Math.max(1, pixel * 0.9), 0, Math.PI * 2)
    ctx.fillStyle = highContrast ? '#ffd400' : '#fff6dc'
    ctx.fill()
    ctx.lineWidth = 1.5 * pixel
    ctx.strokeStyle = '#1e1a2b'
    ctx.stroke()
  }
  const last = points[n - 1]
  if (last) {
    ctx.globalAlpha = 0.9
    ctx.strokeStyle = highContrast ? '#ffd400' : '#fff6dc'
    ctx.lineWidth = 3 * pixel
    const r = 14 * Math.max(1, pixel * 0.8)
    ctx.beginPath()
    ctx.moveTo(last.x - r, last.y - r)
    ctx.lineTo(last.x + r, last.y + r)
    ctx.moveTo(last.x + r, last.y - r)
    ctx.lineTo(last.x - r, last.y + r)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}
