/**
 * Projectiles élémentaires et non létaux (v6.1) : botte de paille, orbe
 * d'orage, pot de poison. Même style que le reste (aplats, contour encre
 * indigo, ombrage doux) ; chaque dessin est centré sur l'objet, rayon s.w / 2.
 */
import { SeededRandom } from '../../../core/utils/SeededRandom.js'

const INK = '#1e1a2b'
const TAU = Math.PI * 2

function outline(ctx, s, width = 1.8) {
  ctx.lineWidth = width * (s.pixel ?? 1)
  ctx.strokeStyle = INK
  ctx.stroke()
}

/**
 * Botte de paille : un rouleau doré serré de deux liens, brins qui dépassent.
 * Elle tourne en vol (le Renderer applique l'angle du corps) : on lit sa rotation
 * aux liens et aux rayures.
 */
function bale(ctx, s) {
  const r = s.w / 2
  const px = s.pixel ?? 1
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.15, 0, 0, r)
  g.addColorStop(0, '#f6dc8c')
  g.addColorStop(0.6, '#dcb45a')
  g.addColorStop(1, '#a8803a')
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, TAU)
  ctx.fillStyle = g
  ctx.fill()
  // Brins enroulés : arcs concentriques irréguliers.
  const rnd = new SeededRandom(41)
  ctx.save()
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, TAU)
  ctx.clip()
  ctx.lineWidth = 1 * px
  for (let i = 0; i < 9; i++) {
    const rr = r * rnd.range(0.25, 0.95)
    const a0 = rnd.range(0, TAU)
    ctx.strokeStyle = i % 2 ? 'rgba(120,84,30,0.45)' : 'rgba(255,240,190,0.5)'
    ctx.beginPath()
    ctx.arc(0, 0, rr, a0, a0 + rnd.range(1.2, 2.6))
    ctx.stroke()
  }
  // Deux liens de chanvre.
  ctx.strokeStyle = '#6b4a26'
  ctx.lineWidth = 2.4 * px
  for (const x of [-r * 0.38, r * 0.38]) {
    ctx.beginPath()
    ctx.moveTo(x, -r)
    ctx.lineTo(x, r)
    ctx.stroke()
  }
  ctx.restore()
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, TAU)
  outline(ctx, s)
  // Brins qui dépassent.
  ctx.strokeStyle = '#c9a050'
  ctx.lineWidth = 1.2 * px
  for (let i = 0; i < 7; i++) {
    const a = rnd.range(0, TAU)
    const l = rnd.range(3, 7)
    ctx.beginPath()
    ctx.moveTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95)
    ctx.lineTo(Math.cos(a + 0.2) * (r + l), Math.sin(a + 0.2) * (r + l))
    ctx.stroke()
  }
}

/**
 * Orbe d'orage : une cage de fer autour d'un cœur bleu-blanc qui crépite ;
 * de petits arcs sautent d'un barreau à l'autre.
 */
function thunderOrb(ctx, s) {
  const r = s.w / 2
  const px = s.pixel ?? 1
  const t = (s.time ?? 0) / 1000
  const glow = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r * 1.5)
  glow.addColorStop(0, 'rgba(210,240,255,0.95)')
  glow.addColorStop(0.45, 'rgba(120,190,255,0.6)')
  glow.addColorStop(1, 'rgba(80,140,255,0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(0, 0, r * 1.5, 0, TAU)
  ctx.fill()
  const core = ctx.createRadialGradient(-r * 0.2, -r * 0.25, r * 0.05, 0, 0, r * 0.85)
  core.addColorStop(0, '#ffffff')
  core.addColorStop(0.5, '#bfe4ff')
  core.addColorStop(1, '#3d6fb8')
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.82, 0, TAU)
  ctx.fillStyle = core
  ctx.fill()
  // Cage : cerclage et méridiens de fer.
  ctx.strokeStyle = '#2b2f3a'
  ctx.lineWidth = 2.2 * px
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, TAU)
  ctx.stroke()
  for (const k of [0.55, 0.08]) {
    ctx.beginPath()
    ctx.ellipse(0, 0, r * k, r, 0, 0, TAU)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.moveTo(-r, 0)
  ctx.lineTo(r, 0)
  ctx.stroke()
  // Arcs : deux zigzags qui changent d'image en image.
  if (s.extra?.still !== true) {
    const rnd = new SeededRandom(Math.floor(t * 18) + 7)
    ctx.strokeStyle = 'rgba(235,248,255,0.95)'
    ctx.lineWidth = 1.3 * px
    for (let k = 0; k < 2; k++) {
      const a = rnd.range(0, TAU)
      ctx.beginPath()
      ctx.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3)
      for (let i = 1; i <= 3; i++) {
        const rr = r * (0.3 + i * 0.28)
        const aa = a + rnd.range(-0.5, 0.5)
        ctx.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr)
      }
      ctx.stroke()
    }
  }
}

/**
 * Pot de poison : une fiole ventrue de grès vert, bouchée de liège ; le liquide
 * y clapote et une volute verte s'échappe du goulot.
 */
function poisonPot(ctx, s) {
  const r = s.w / 2
  const px = s.pixel ?? 1
  const t = (s.time ?? 0) / 1000
  // Panse.
  ctx.beginPath()
  ctx.ellipse(0, r * 0.12, r * 0.95, r * 0.86, 0, 0, TAU)
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.2, r * 0.1, 0, r * 0.1, r)
  g.addColorStop(0, '#b9e67a')
  g.addColorStop(0.55, '#5f9e3a')
  g.addColorStop(1, '#2f5a22')
  ctx.fillStyle = g
  ctx.fill()
  outline(ctx, s)
  // Liquide qui clapote (vu par transparence).
  ctx.save()
  ctx.beginPath()
  ctx.ellipse(0, r * 0.12, r * 0.95, r * 0.86, 0, 0, TAU)
  ctx.clip()
  const slosh = Math.sin(t * 9) * r * 0.12
  ctx.beginPath()
  ctx.moveTo(-r, r * 0.15 + slosh)
  ctx.quadraticCurveTo(0, r * 0.05 - slosh, r, r * 0.15 + slosh)
  ctx.lineTo(r, r)
  ctx.lineTo(-r, r)
  ctx.closePath()
  ctx.fillStyle = 'rgba(160,255,90,0.45)'
  ctx.fill()
  ctx.restore()
  // Goulot et bouchon.
  ctx.beginPath()
  ctx.rect(-r * 0.28, -r * 0.95, r * 0.56, r * 0.32)
  ctx.fillStyle = '#4c7f2e'
  ctx.fill()
  outline(ctx, s, 1.4)
  ctx.beginPath()
  ctx.rect(-r * 0.22, -r * 1.2, r * 0.44, r * 0.3)
  ctx.fillStyle = '#b08850'
  ctx.fill()
  outline(ctx, s, 1.2)
  // Marque : deux os croisés, lisibles de loin.
  ctx.strokeStyle = 'rgba(245,250,230,0.9)'
  ctx.lineWidth = 2 * px
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-r * 0.32, r * 0.0)
  ctx.lineTo(r * 0.32, r * 0.45)
  ctx.moveTo(r * 0.32, r * 0.0)
  ctx.lineTo(-r * 0.32, r * 0.45)
  ctx.stroke()
  ctx.lineCap = 'butt'
  // Volute qui s'échappe.
  if (s.extra?.still !== true) {
    ctx.fillStyle = 'rgba(150,230,90,0.35)'
    for (let i = 0; i < 3; i++) {
      const u = (t * 1.3 + i / 3) % 1
      ctx.beginPath()
      ctx.arc(Math.sin(u * 6 + i) * r * 0.25, -r * 1.25 - u * r * 1.4, r * (0.18 + u * 0.22), 0, TAU)
      ctx.fill()
    }
  }
}

export const ELEMENT_PAINTERS = Object.freeze({
  'projectile.bale': bale,
  'projectile.thunder': thunderOrb,
  'projectile.poison': poisonPot,
})
