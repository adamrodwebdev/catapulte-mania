/**
 * Baliste (v5.1), dessinée par le code.
 *
 * Repère : origine au pied de l'engin, au sol, x vers l'avant (sens du tir).
 * Affût fixe (tréteau en A et traverse) en cache ; partie mobile (arbrier,
 * arcs de fer, corde, treuil, carreau) inclinée selon l'angle de tir et
 * redessinée à chaque image : la corde recule quand l'engin est armé
 * (`extra.tension` : 1 = armée, 0 = détendue juste après le tir).
 */
import { TAU, roundRect, lightOver, woodPattern, metalGradient, rivet, cached, EDGE } from './realism.js'
import { BALLISTA_GEOMETRY } from '../../Ballista.js'

const { pivotY: PY, stock: STOCK } = BALLISTA_GEOMETRY
const BASE_BOX = { x: -70, y: -80, w: 140, h: 84 }

function outline(g, w = 1.4) {
  g.lineWidth = w
  g.strokeStyle = EDGE
  g.stroke()
}

/** Affût : deux pieds en A, une traverse, des patins ferrés. */
function base(g) {
  // Pieds : poutres équarries, en A, jusqu'au pivot.
  for (const [x0, x1] of [[-46, -5], [38, 5]]) {
    g.save()
    g.translate(x0, 0)
    const len = Math.hypot(x1 - x0, PY)
    g.rotate(Math.atan2(PY, x1 - x0))
    g.beginPath()
    roundRect(g, 0, -4, len, 8, 2)
    g.fillStyle = woodPattern(g, { unitsPerTile: 90 })
    g.fill()
    lightOver(g, 0, -4, len, 4, 0.2, 0.42)
    outline(g)
    g.restore()
  }
  g.beginPath()
  roundRect(g, -40, -26, 74, 9, 2)
  g.fillStyle = woodPattern(g, { unitsPerTile: 80 })
  g.fill()
  lightOver(g, -40, -26, 34, -17, 0.2, 0.4)
  outline(g)
  for (const x of [-46, 38]) {
    g.beginPath()
    roundRect(g, x - 9, -5, 18, 5, 1.5)
    g.fillStyle = metalGradient(g, x - 9, -5, x + 9, 0, '#5b616b')
    g.fill()
    outline(g, 1)
  }
  // Moyeu du pivot.
  g.beginPath()
  g.arc(0, PY, 7, 0, TAU)
  g.fillStyle = metalGradient(g, -7, PY - 7, 7, PY + 7, '#6b717c')
  g.fill()
  outline(g)
  rivet(g, 0, PY, 2.2)
}

/** Teinte du carreau selon la munition chargée (feu, givre, poudre…). */
const BOLT_TINT = {
  'projectile.fire': '#ff9a3a',
  'projectile.frost': '#9fd8ff',
  'projectile.bomb': '#2b2b33',
  'projectile.split': '#c9c3b7',
  'projectile.boulder': '#8a8478',
}

function bolt(g, x0, x1, tint) {
  // Hampe de frêne, pointe de fer forgé, empennage de cuir.
  g.beginPath()
  roundRect(g, x0, -2, x1 - x0 - 12, 4, 1.5)
  g.fillStyle = woodPattern(g, { unitsPerTile: 60 })
  g.fill()
  outline(g, 0.9)
  g.beginPath()
  g.moveTo(x1 - 14, -5)
  g.lineTo(x1, 0)
  g.lineTo(x1 - 14, 5)
  g.closePath()
  g.fillStyle = metalGradient(g, x1 - 14, -5, x1, 5, '#7a808b')
  g.fill()
  outline(g, 1)
  if (tint) {
    g.beginPath()
    g.arc(x1 - 10, 0, 4, 0, TAU)
    g.fillStyle = tint
    g.fill()
  }
  g.fillStyle = '#8a5a34'
  for (const s of [-1, 1]) {
    g.beginPath()
    g.moveTo(x0 + 2, 0)
    g.lineTo(x0 + 14, 0)
    g.lineTo(x0 + 8, s * 7)
    g.lineTo(x0 - 2, s * 7)
    g.closePath()
    g.fill()
    outline(g, 0.8)
  }
}

export function drawBallista(ctx, s) {
  const ex = s.extra ?? {}
  const angle = ((Number(ex.angle) || 0) * Math.PI) / 180
  const tension = Math.max(0, Math.min(1.1, Number.isFinite(ex.tension) ? ex.tension : 1))
  cached(ctx, 'ballista.base', BASE_BOX, base, 4)
  ctx.save()
  ctx.translate(0, PY)
  ctx.rotate(-angle)
  // Arbrier (poutre de tir), du treuil (arrière) à la tête (avant).
  ctx.beginPath()
  roundRect(ctx, -54, -6, STOCK + 54, 12, 3)
  ctx.fillStyle = woodPattern(ctx, { unitsPerTile: 110 })
  ctx.fill()
  lightOver(ctx, -54, -6, STOCK, 6, 0.22, 0.42)
  outline(ctx)
  // Glissière ferrée
  ctx.fillStyle = 'rgba(40,40,46,0.55)'
  ctx.fillRect(-30, -7.5, STOCK + 20, 2)
  // Treuil à l'arrière : roue à rayons.
  ctx.beginPath()
  ctx.arc(-46, 0, 11, 0, TAU)
  ctx.fillStyle = woodPattern(ctx, { unitsPerTile: 50 })
  ctx.fill()
  outline(ctx)
  ctx.strokeStyle = EDGE
  ctx.lineWidth = 1.2
  const turn = (1 - tension) * 2
  for (let i = 0; i < 4; i++) {
    const a = turn + (i * Math.PI) / 4
    ctx.beginPath()
    ctx.moveTo(-46 - Math.cos(a) * 10, -Math.sin(a) * 10)
    ctx.lineTo(-46 + Math.cos(a) * 10, Math.sin(a) * 10)
    ctx.stroke()
  }
  rivet(ctx, -46, 0, 2)
  // Arcs de fer à la tête, qui plient selon la tension.
  const head = STOCK - 30
  const bend = 6 + 10 * tension
  const tips = []
  for (const side of [-1, 1]) {
    const tip = { x: head - bend, y: side * 40 }
    tips.push(tip)
    ctx.beginPath()
    ctx.moveTo(head, side * 5)
    ctx.quadraticCurveTo(head + 6, side * 24, tip.x, tip.y)
    ctx.lineWidth = 6
    ctx.strokeStyle = '#5b616b'
    ctx.stroke()
    ctx.lineWidth = 2
    ctx.strokeStyle = '#9aa1ab'
    ctx.stroke()
  }
  ctx.beginPath()
  roundRect(ctx, head - 6, -9, 12, 18, 2)
  ctx.fillStyle = metalGradient(ctx, head - 6, -9, head + 6, 9, '#5b616b')
  ctx.fill()
  outline(ctx, 1)
  // Corde : tendue vers l'arrière quand l'engin est armé.
  const nut = head - 8 - 48 * Math.min(1, tension)
  ctx.beginPath()
  ctx.moveTo(tips[0].x, tips[0].y)
  ctx.lineTo(nut, 0)
  ctx.lineTo(tips[1].x, tips[1].y)
  ctx.lineWidth = 1.6
  ctx.strokeStyle = '#e8dcc0'
  ctx.stroke()
  // Carreau chargé.
  if (ex.load && tension > 0.95) bolt(ctx, nut, STOCK + 8, BOLT_TINT[ex.load] ?? null)
  ctx.restore()
}
