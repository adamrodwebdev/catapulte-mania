/**
 * Créatures volantes et boulet de givre (v5.0), dessinés par le code.
 *
 * Les créatures sont dessinées dans leur repère (origine au centre du corps),
 * tournées vers la droite puis retournées selon `facing`. Le battement d'ailes
 * suit `flap` (0 → 1, un cycle), fourni par l'entité Flyer.
 */
import { drawOgre } from './ogre.js'
import { drawBallista } from './ballista.js'

const TAU = Math.PI * 2

function wingSpan(flap) {
  // Aile haute → basse → haute : une sinusoïde aplatie au sommet.
  return Math.sin(flap * TAU)
}

/** Corbeau : silhouette noire bleutée, œil clair, bec. */
function crow(ctx, s) {
  const px = s.pixel ?? 1
  const e = s.extra || {}
  const w = s.w
  const k = wingSpan(e.flap ?? 0)
  ctx.save()
  if ((e.facing ?? 1) < 0) ctx.scale(-1, 1)
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#0c0b12'
  ctx.lineWidth = 1.6 * px
  // Aile arrière (plus sombre).
  ctx.fillStyle = '#15141d'
  ctx.beginPath()
  ctx.moveTo(-2, -2)
  ctx.quadraticCurveTo(-w * 0.18, -w * 0.42 * k - 4, -w * 0.46, -w * 0.3 * k - 2)
  ctx.quadraticCurveTo(-w * 0.2, -w * 0.06 * k, 4, 2)
  ctx.closePath()
  ctx.fill()
  // Corps.
  ctx.fillStyle = '#23222f'
  ctx.beginPath()
  ctx.ellipse(0, 0, w * 0.24, w * 0.11, -0.1, 0, TAU)
  ctx.fill()
  ctx.stroke()
  // Queue en éventail.
  ctx.beginPath()
  ctx.moveTo(-w * 0.2, -2)
  ctx.lineTo(-w * 0.42, -6)
  ctx.lineTo(-w * 0.44, 4)
  ctx.lineTo(-w * 0.2, 3)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  // Tête, bec, œil.
  ctx.beginPath()
  ctx.arc(w * 0.22, -3, w * 0.1, 0, TAU)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#c9a54a'
  ctx.beginPath()
  ctx.moveTo(w * 0.3, -4)
  ctx.lineTo(w * 0.45, -1)
  ctx.lineTo(w * 0.3, 1)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#e8e2d0'
  ctx.fillRect(w * 0.23, -6, 2.2 * px, 2.2 * px)
  // Aile avant (reflet bleuté).
  ctx.fillStyle = '#2e3346'
  ctx.beginPath()
  ctx.moveTo(-4, -1)
  ctx.quadraticCurveTo(w * 0.02, -w * 0.5 * k - 6, -w * 0.3, -w * 0.42 * k - 2)
  ctx.quadraticCurveTo(-w * 0.12, -w * 0.1 * k, 8, 1)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

/** Vouivre : petit dragon vert, ailes membraneuses, pot de feu grégeois aux griffes. */
function wyvern(ctx, s) {
  const px = s.pixel ?? 1
  const e = s.extra || {}
  const w = s.w
  const k = wingSpan(e.flap ?? 0)
  const t = (s.time ?? 0) / 1000
  ctx.save()
  if ((e.facing ?? 1) < 0) ctx.scale(-1, 1)
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#14200f'
  ctx.lineWidth = 2 * px
  const wing = (dx, shade, lift) => {
    ctx.fillStyle = shade
    ctx.beginPath()
    ctx.moveTo(dx, -4)
    ctx.lineTo(dx - w * 0.08, -w * 0.46 * lift - 10)
    ctx.quadraticCurveTo(dx - w * 0.26, -w * 0.3 * lift - 6, dx - w * 0.42, -w * 0.18 * lift)
    ctx.quadraticCurveTo(dx - w * 0.22, -w * 0.08 * lift + 2, dx - w * 0.16, 2)
    ctx.quadraticCurveTo(dx - w * 0.08, -2, dx + 6, 2)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    // Nervures.
    ctx.beginPath()
    ctx.moveTo(dx - w * 0.08, -w * 0.46 * lift - 10)
    ctx.lineTo(dx - w * 0.2, 0)
    ctx.moveTo(dx - w * 0.08, -w * 0.46 * lift - 10)
    ctx.lineTo(dx - w * 0.32, -w * 0.1 * lift)
    ctx.stroke()
  }
  wing(-2, '#3c5a2c', k)
  // Queue ondulante terminée par une pointe.
  ctx.fillStyle = '#4f7a37'
  ctx.beginPath()
  ctx.moveTo(-w * 0.16, -4)
  ctx.quadraticCurveTo(-w * 0.32, 6 + Math.sin(t * 4) * 6, -w * 0.48, Math.sin(t * 4 + 1) * 8)
  ctx.lineTo(-w * 0.52, Math.sin(t * 4 + 1) * 8 - 6)
  ctx.lineTo(-w * 0.44, Math.sin(t * 4 + 1) * 8 + 6)
  ctx.quadraticCurveTo(-w * 0.3, 12, -w * 0.12, 6)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  // Corps et ventre clair.
  ctx.fillStyle = '#5b8a3e'
  ctx.beginPath()
  ctx.ellipse(0, 0, w * 0.2, w * 0.1, -0.15, 0, TAU)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#c9c27a'
  ctx.beginPath()
  ctx.ellipse(2, w * 0.04, w * 0.13, w * 0.04, -0.15, 0, Math.PI)
  ctx.fill()
  // Cou et tête cornue.
  ctx.fillStyle = '#5b8a3e'
  ctx.beginPath()
  ctx.moveTo(w * 0.14, -6)
  ctx.quadraticCurveTo(w * 0.26, -w * 0.2, w * 0.34, -w * 0.18)
  ctx.lineTo(w * 0.46, -w * 0.14)
  ctx.lineTo(w * 0.36, -w * 0.08)
  ctx.quadraticCurveTo(w * 0.24, -w * 0.06, w * 0.16, 4)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#d8c79a'
  ctx.beginPath()
  ctx.moveTo(w * 0.32, -w * 0.2)
  ctx.lineTo(w * 0.27, -w * 0.3)
  ctx.lineTo(w * 0.35, -w * 0.21)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#ffcf4a'
  ctx.fillRect(w * 0.36, -w * 0.17, 2.6 * px, 2.6 * px)
  // Pot de feu grégeois tenu dans les griffes, mèche allumée.
  if (e.carrying) {
    ctx.strokeStyle = '#14200f'
    ctx.beginPath()
    ctx.moveTo(w * 0.02, w * 0.08)
    ctx.lineTo(w * 0.04, w * 0.17)
    ctx.stroke()
    ctx.fillStyle = '#b8643a'
    ctx.beginPath()
    ctx.ellipse(w * 0.04, w * 0.24, 9, 10, 0, 0, TAU)
    ctx.fill()
    ctx.stroke()
    const flick = 0.7 + 0.3 * Math.sin(t * 22)
    ctx.fillStyle = '#ffb347'
    ctx.beginPath()
    ctx.arc(w * 0.04, w * 0.24 - 13, 4 * flick, 0, TAU)
    ctx.fill()
  }
  wing(4, '#4f7a37', k * 0.9 + 0.1)
  ctx.restore()
}

/** Boulet de givre : sphère de glace facettée, cœur lumineux, éclats de froid. */
function frostBall(ctx, s) {
  const r = s.w / 2
  const px = s.pixel ?? 1
  const t = (s.time ?? 0) / 1000
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.45, '#bfe6ff')
  g.addColorStop(1, '#4f95c7')
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2
    const rr = r * (i % 2 ? 0.92 : 1)
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
  }
  ctx.closePath()
  ctx.fillStyle = g
  ctx.fill()
  ctx.lineWidth = 1.8 * px
  ctx.strokeStyle = '#1e3a55'
  ctx.stroke()
  // Facettes.
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'
  ctx.lineWidth = 1.1 * px
  ctx.beginPath()
  ctx.moveTo(-r * 0.6, -r * 0.1)
  ctx.lineTo(0, -r * 0.55)
  ctx.lineTo(r * 0.55, 0)
  ctx.moveTo(0, -r * 0.55)
  ctx.lineTo(r * 0.05, r * 0.6)
  ctx.stroke()
  // Scintillement.
  ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 9)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(-r * 0.45, -r * 0.5, 2 * px, 2 * px)
  ctx.globalAlpha = 1
}

/** Carreau de baliste en vol (orienté selon sa vitesse par le Renderer). */
function boltProjectile(ctx, s) {
  const px = s.pixel ?? 1
  ctx.save()
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#7b5532'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(-34, 0)
  ctx.lineTo(10, 0)
  ctx.stroke()
  ctx.fillStyle = '#8e96a3'
  ctx.beginPath()
  ctx.moveTo(8, -5)
  ctx.lineTo(24, 0)
  ctx.lineTo(8, 5)
  ctx.closePath()
  ctx.fill()
  ctx.lineWidth = 1.2 * px
  ctx.strokeStyle = 'rgba(30,20,16,0.9)'
  ctx.stroke()
  ctx.fillStyle = '#a8673a'
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(-34, 0)
    ctx.lineTo(-22, 0)
    ctx.lineTo(-28, side * 7)
    ctx.lineTo(-38, side * 7)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

export const CREATURE_PAINTERS = Object.freeze({
  'target.ogre': drawOgre,
  'projectile.bolt': boltProjectile,
  ballista: drawBallista,
  'flyer.crow': crow,
  'flyer.wyvern': wyvern,
  'projectile.frost': frostBall,
})
