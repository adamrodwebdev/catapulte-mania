/**
 * Dessin des repères des défenseurs (v6.2, voir TargetBeacons.js) : le
 * chevron d'or du dernier défenseur, et les pastilles du bord droit de l'écran.
 * Contour sombre et halo clair : lisibles sur la neige comme de nuit. Ils
 * battent doucement ; immobiles en mouvement réduit. Taille fixe à l'écran.
 */
import { BEACON } from './TargetBeacons.js'

const GOLD = '#f2c94c'
const GOLD_DEEP = '#b98a17'
const IVORY = '#fff6dc'
const INK = '#1e1a2b'

/**
 * Chevron d'or pointé vers le bas, au-dessus du dernier défenseur (repère du monde).
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y pointe du chevron (au-dessus de la tête et de la barre de vie)
 * @param {{ px: number, time: number, animate: boolean, highContrast?: boolean }} o
 */
export function drawLastChevron(ctx, x, y, { px, time, animate, highContrast = false }) {
  const bob = animate ? Math.sin(time / 210) * 3.2 * px : 0
  const w = 12 * px
  const h = 11 * px
  const tip = y + bob
  ctx.save()
  // Halo : il se détache des murs comme du ciel.
  const halo = ctx.createRadialGradient(x, tip - h * 0.6, 0, x, tip - h * 0.6, w * 2.2)
  halo.addColorStop(0, 'rgba(255,236,160,0.55)')
  halo.addColorStop(1, 'rgba(255,236,160,0)')
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(x, tip - h * 0.6, w * 2.2, 0, Math.PI * 2)
  ctx.fill()
  // Le chevron : deux branches épaisses qui se rejoignent sur la cible.
  ctx.beginPath()
  ctx.moveTo(x - w, tip - h * 1.55)
  ctx.lineTo(x, tip - h * 0.55)
  ctx.lineTo(x + w, tip - h * 1.55)
  ctx.lineTo(x + w, tip - h * 0.95)
  ctx.lineTo(x, tip)
  ctx.lineTo(x - w, tip - h * 0.95)
  ctx.closePath()
  const fill = ctx.createLinearGradient(x, tip - h * 1.6, x, tip)
  fill.addColorStop(0, highContrast ? '#ffd400' : '#ffe28a')
  fill.addColorStop(1, highContrast ? '#ffd400' : GOLD_DEEP)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.lineJoin = 'round'
  ctx.lineWidth = (highContrast ? 3 : 2) * px
  ctx.strokeStyle = INK
  ctx.stroke()
  ctx.restore()
}

/**
 * Le dernier défenseur (v6.2) : son chevron, au-dessus de sa tête et de ce qui
 * la surmonte déjà (barre de vie, marque du pillard, cœurs du général).
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} e le défenseur
 * @param {{ px: number, time: number, animate: boolean, highContrast?: boolean }} o
 */
export function drawLastDefender(ctx, e, o) {
  const head = e.body?.bounds?.min.y ?? e.y - e.height / 2
  const lift = e.raiding ? 46 : e.type === 'general' ? 52 : 24
  drawLastChevron(ctx, e.x, head - lift * o.px, o)
}

/**
 * Pastille du bord droit de l'écran (repère de l'écran) : une étiquette ronde
 * dont la pointe montre où se tient le défenseur ; double chevron pour plusieurs.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ y: number, count: number, last: boolean, offscreen: boolean }} badge
 * @param {{ viewW: number, time: number, animate: boolean, highContrast?: boolean }} o
 */
export function drawEdgeBadge(ctx, badge, { viewW, time, animate, highContrast = false }) {
  const r = BEACON.BADGE_R
  const cx = viewW - BEACON.EDGE_INSET
  const cy = badge.y
  const pulse = animate ? 1 + Math.sin(time / 260) * 0.06 : 1
  const nudge = animate ? Math.max(0, Math.sin(time / 320)) * 2 : 0
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(pulse, pulse)
  // Encore visible dans la marge : un peu voilée, pour ne pas le cacher.
  if (!badge.offscreen) ctx.globalAlpha = 0.88
  // L'étiquette : un disque prolongé d'une pointe vers la droite.
  ctx.beginPath()
  ctx.arc(0, 0, r, Math.PI * 0.22, Math.PI * 1.78)
  ctx.lineTo(r + 9, 0)
  ctx.closePath()
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = 5
  ctx.fillStyle = badge.last ? GOLD : IVORY
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.lineWidth = highContrast ? 3 : 2
  ctx.strokeStyle = INK
  ctx.stroke()
  // Un chevron (un défenseur) ou deux (plusieurs), qui poussent vers le bord.
  ctx.lineWidth = highContrast ? 3.4 : 3
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = INK
  const marks = badge.count > 1 ? [-4, 3] : [0]
  for (const dx of marks) {
    ctx.beginPath()
    ctx.moveTo(dx - 3 + nudge, -6)
    ctx.lineTo(dx + 3 + nudge, 0)
    ctx.lineTo(dx - 3 + nudge, 6)
    ctx.stroke()
  }
  ctx.restore()
}
