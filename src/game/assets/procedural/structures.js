/**
 * Ouvrages des châteaux (v6.1) : moulin à vent, forge, citerne, ruche, sacs
 * de farine. Même style que les blocs (aplats, contour encre, ombrage doux) ;
 * chaque dessin est centré sur le bloc (s.w × s.h). Les ailes du moulin
 * tournent selon `extra.mill` (angle, en radians) ; `damage` assombrit.
 */
import { materialPattern } from './textures.js'
import { SeededRandom } from '../../../core/utils/SeededRandom.js'

const INK = '#1e1a2b'
const TAU = Math.PI * 2

function outline(ctx, s, width = 1.8) {
  ctx.lineWidth = width * (s.pixel ?? 1)
  ctx.strokeStyle = INK
  ctx.stroke()
}

/** Voile de dégâts : plus l'ouvrage est abîmé, plus il est sombre. */
function wear(ctx, s, path) {
  const d = s.damage ?? 0
  if (d <= 0.05) return
  ctx.save()
  path()
  ctx.fillStyle = `rgba(30,20,16,${Math.min(0.45, d * 0.5)})`
  ctx.fill()
  ctx.restore()
}

/** Moulin : cabine de planches au toit pentu, moyeu, quatre ailes de toile sur leur treillis. */
function windmill(ctx, s) {
  const w = s.w
  const h = s.h
  const px = s.pixel ?? 1
  const ex = s.extra ?? {}
  // Cabine.
  ctx.beginPath()
  ctx.rect(-w / 2, -h / 2 + h * 0.3, w, h * 0.7)
  ctx.fillStyle = materialPattern(ctx, 'wood')
  ctx.fill()
  outline(ctx, s)
  ctx.strokeStyle = 'rgba(30,20,16,0.35)'
  ctx.lineWidth = 1 * px
  for (let i = 1; i < 5; i++) {
    const x = -w / 2 + (w * i) / 5
    ctx.beginPath()
    ctx.moveTo(x, -h / 2 + h * 0.3)
    ctx.lineTo(x, h / 2)
    ctx.stroke()
  }
  // Toit.
  ctx.beginPath()
  ctx.moveTo(-w / 2 - 6, -h / 2 + h * 0.32)
  ctx.lineTo(0, -h / 2 - 6)
  ctx.lineTo(w / 2 + 6, -h / 2 + h * 0.32)
  ctx.closePath()
  ctx.fillStyle = '#7a3d2a'
  ctx.fill()
  outline(ctx, s)
  // Porte.
  ctx.beginPath()
  ctx.rect(-7, h / 2 - 20, 14, 20)
  ctx.fillStyle = '#3b2a20'
  ctx.fill()
  outline(ctx, s, 1.2)
  wear(ctx, s, () => {
    ctx.beginPath()
    ctx.rect(-w / 2, -h / 2 + h * 0.3, w, h * 0.7)
  })
  // Ailes : le moyeu au haut de la cabine, côté façade.
  const hub = { x: 0, y: -h / 2 + h * 0.42 }
  const a0 = ex.mill ?? 0
  const len = Math.max(w, h) * 1.15
  ctx.save()
  ctx.translate(hub.x, hub.y)
  for (let i = 0; i < 4; i++) {
    ctx.save()
    ctx.rotate(a0 + (i * TAU) / 4)
    // Bras.
    ctx.beginPath()
    ctx.rect(-2 * px, -len, 4 * px, len)
    ctx.fillStyle = '#5a3d28'
    ctx.fill()
    // Toile sur treillis (gelée : bleutée).
    ctx.beginPath()
    ctx.rect(2 * px, -len, len * 0.24, len * 0.82)
    ctx.fillStyle = ex.frozen ? 'rgba(210,235,255,0.9)' : 'rgba(240,226,196,0.92)'
    ctx.fill()
    ctx.lineWidth = 1.1 * px
    ctx.strokeStyle = INK
    ctx.stroke()
    ctx.strokeStyle = 'rgba(90,61,40,0.8)'
    ctx.lineWidth = 0.8 * px
    for (let k = 1; k < 5; k++) {
      ctx.beginPath()
      ctx.moveTo(2 * px, -len + (len * 0.82 * k) / 5)
      ctx.lineTo(2 * px + len * 0.24, -len + (len * 0.82 * k) / 5)
      ctx.stroke()
    }
    ctx.restore()
  }
  ctx.beginPath()
  ctx.arc(0, 0, 5 * px + 2, 0, TAU)
  ctx.fillStyle = '#3b2a20'
  ctx.fill()
  outline(ctx, s, 1.2)
  ctx.restore()
}

/** Forge : foyer de pierre, braises rougeoyantes dans sa gueule, soufflet de cuir sur le côté. */
function forge(ctx, s) {
  const w = s.w
  const h = s.h
  const t = (s.time ?? 0) / 1000
  const ex = s.extra ?? {}
  ctx.beginPath()
  ctx.rect(-w / 2, -h / 2, w, h)
  ctx.fillStyle = materialPattern(ctx, 'stone')
  ctx.fill()
  outline(ctx, s)
  // Gueule du foyer.
  ctx.beginPath()
  ctx.ellipse(0, -h * 0.05, w * 0.3, h * 0.28, 0, Math.PI, 0)
  ctx.lineTo(w * 0.3, h * 0.2)
  ctx.lineTo(-w * 0.3, h * 0.2)
  ctx.closePath()
  const lit = !ex.frozen && !ex.quenched
  const glow = ctx.createRadialGradient(0, h * 0.1, 2, 0, h * 0.05, w * 0.32)
  glow.addColorStop(0, lit ? '#fff1a8' : '#4a4a52')
  glow.addColorStop(0.5, lit ? `rgba(255,${130 + Math.sin(t * 11) * 25},40,1)` : '#2e2e36')
  glow.addColorStop(1, lit ? '#7a1f12' : '#1e1e24')
  ctx.fillStyle = glow
  ctx.fill()
  outline(ctx, s, 1.4)
  // Soufflet.
  ctx.beginPath()
  ctx.moveTo(w / 2, -h * 0.15)
  ctx.lineTo(w / 2 + 14, -h * 0.32)
  ctx.lineTo(w / 2 + 14, h * 0.05)
  ctx.closePath()
  ctx.fillStyle = '#7b5532'
  ctx.fill()
  outline(ctx, s, 1.2)
  wear(ctx, s, () => {
    ctx.beginPath()
    ctx.rect(-w / 2, -h / 2, w, h)
  })
}

/** Citerne : cuve de douelles cerclées de fer ; l'eau affleure en haut. */
function cistern(ctx, s) {
  const w = s.w
  const h = s.h
  const px = s.pixel ?? 1
  const t = (s.time ?? 0) / 1000
  ctx.beginPath()
  ctx.moveTo(-w / 2 + 3, -h / 2)
  ctx.lineTo(w / 2 - 3, -h / 2)
  ctx.lineTo(w / 2, h / 2)
  ctx.lineTo(-w / 2, h / 2)
  ctx.closePath()
  ctx.fillStyle = materialPattern(ctx, 'wood')
  ctx.fill()
  outline(ctx, s)
  // Douelles.
  ctx.strokeStyle = 'rgba(30,20,16,0.35)'
  ctx.lineWidth = 1 * px
  for (let i = 1; i < 6; i++) {
    const x = -w / 2 + (w * i) / 6
    ctx.beginPath()
    ctx.moveTo(x, -h / 2)
    ctx.lineTo(x, h / 2)
    ctx.stroke()
  }
  // Cercles de fer.
  ctx.strokeStyle = '#3a3d46'
  ctx.lineWidth = 3 * px
  for (const y of [-h * 0.25, h * 0.25]) {
    ctx.beginPath()
    ctx.moveTo(-w / 2 + 1, y)
    ctx.lineTo(w / 2 - 1, y)
    ctx.stroke()
  }
  // Eau qui affleure.
  ctx.beginPath()
  ctx.ellipse(0, -h / 2, w / 2 - 4, 4, 0, 0, TAU)
  ctx.fillStyle = `rgba(110,170,220,${0.85 + Math.sin(t * 3) * 0.05})`
  ctx.fill()
  outline(ctx, s, 1)
  wear(ctx, s, () => {
    ctx.beginPath()
    ctx.rect(-w / 2, -h / 2, w, h)
  })
}

/** Ruche : cloche de paille tressée en spirale, trou de vol, quelques abeilles autour. */
function hive(ctx, s) {
  const w = s.w
  const h = s.h
  const px = s.pixel ?? 1
  const t = (s.time ?? 0) / 1000
  ctx.beginPath()
  ctx.moveTo(-w / 2, h / 2)
  ctx.quadraticCurveTo(-w / 2 - 2, -h / 2, 0, -h / 2)
  ctx.quadraticCurveTo(w / 2 + 2, -h / 2, w / 2, h / 2)
  ctx.closePath()
  const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2)
  g.addColorStop(0, '#f0cf78')
  g.addColorStop(1, '#b8873a')
  ctx.fillStyle = g
  ctx.fill()
  outline(ctx, s)
  ctx.strokeStyle = 'rgba(110,70,20,0.55)'
  ctx.lineWidth = 1.1 * px
  for (let i = 1; i < 5; i++) {
    const y = -h / 2 + (h * i) / 5
    const half = (w / 2) * Math.min(1, 0.45 + i * 0.16)
    ctx.beginPath()
    ctx.moveTo(-half, y)
    ctx.quadraticCurveTo(0, y + 2, half, y)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.arc(0, h * 0.28, 3 * px + 1, 0, TAU)
  ctx.fillStyle = '#2b1d10'
  ctx.fill()
  if (s.extra?.still !== true) {
    const rnd = new SeededRandom((s.seed ?? 1) * 13)
    ctx.fillStyle = '#2b2414'
    for (let i = 0; i < 4; i++) {
      const a = t * rnd.range(2, 4) + rnd.range(0, TAU)
      ctx.beginPath()
      ctx.arc(Math.cos(a) * (w * 0.7), h * 0.1 + Math.sin(a * 1.3) * h * 0.4, 1.4 * px, 0, TAU)
      ctx.fill()
    }
  }
}

/** Sac de farine : toile de jute nouée, un épi marqué dessus, un peu de farine qui s'échappe. */
function flour(ctx, s) {
  const w = s.w
  const h = s.h
  const px = s.pixel ?? 1
  ctx.beginPath()
  ctx.moveTo(-w / 2 + 2, h / 2)
  ctx.quadraticCurveTo(-w / 2 - 3, 0, -w / 2 + 5, -h / 2 + 6)
  ctx.lineTo(-4, -h / 2)
  ctx.lineTo(4, -h / 2)
  ctx.lineTo(w / 2 - 5, -h / 2 + 6)
  ctx.quadraticCurveTo(w / 2 + 3, 0, w / 2 - 2, h / 2)
  ctx.closePath()
  ctx.fillStyle = '#d9c39a'
  ctx.fill()
  outline(ctx, s)
  ctx.strokeStyle = 'rgba(110,80,40,0.35)'
  ctx.lineWidth = 0.8 * px
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath()
    ctx.moveTo(i * 6, -h / 2 + 6)
    ctx.lineTo(i * 6.5, h / 2 - 2)
    ctx.stroke()
  }
  // Épi.
  ctx.strokeStyle = '#8a5a26'
  ctx.lineWidth = 1.4 * px
  ctx.beginPath()
  ctx.moveTo(0, h * 0.3)
  ctx.lineTo(0, -h * 0.1)
  ctx.stroke()
  ctx.fillStyle = '#8a5a26'
  for (let k = 0; k < 3; k++) {
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(side * 2.5, -h * 0.05 + k * 4, 2.2, 1.2, side * 0.6, 0, TAU)
      ctx.fill()
    }
  }
  // Farine qui s'échappe par le nœud.
  ctx.fillStyle = 'rgba(250,246,236,0.85)'
  ctx.beginPath()
  ctx.arc(0, -h / 2 - 1, 3 * px, 0, TAU)
  ctx.fill()
}

export const STRUCTURE_PAINTERS = Object.freeze({
  'prop.windmill': windmill,
  'prop.forge': forge,
  'prop.cistern': cistern,
  'prop.hive': hive,
  'prop.flour': flour,
})
