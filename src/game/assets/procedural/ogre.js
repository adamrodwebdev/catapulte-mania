/**
 * L'ogre (v5.1) : unité lourde, dessinée par le code.
 *
 * Corps (jambes, ventre, tête) en cache ; le bras qui tient la massue est un
 * calque à part, animé : balancement au repos, revers rapide quand l'ogre
 * renvoie un projectile ou repousse un bloc (`extra.swing` : ms écoulées
 * depuis le dernier revers). Il regarde vers la gauche, comme les autres
 * défenseurs ; `extra.facing > 0` le retourne.
 * Repère : centre du corps physique (46 × 76) ; les pieds sont à y = +38.
 */
import { TAU, roundRect, lightOver, woodPattern, cached, tone } from './realism.js'

const W = 46
const H = 76
const BOX = { x: -48, y: -62, w: 96, h: 102 }
const SKIN = '#7d8f5a'
const SKIN_DARK = '#4f5e36'
const HIDE = '#6b4a2c'
const OUT = 'rgba(28,22,14,0.92)'

function outline(g, w = 1.3) {
  g.lineWidth = w
  g.strokeStyle = OUT
  g.stroke()
}

/** Jambes trapues, pagne de cuir, ventre rond, épaules massives, tête aux défenses. */
function body(g, hurt) {
  // Jambes
  for (const x of [-10, 8]) {
    g.beginPath()
    roundRect(g, x - 6, 14, 12, 24, 5)
    g.fillStyle = SKIN_DARK
    g.fill()
    lightOver(g, x - 6, 14, x + 6, 38, 0.15, 0.4)
    outline(g)
    // Pied
    g.beginPath()
    g.ellipse(x - 2, 36, 9, 4, 0, 0, TAU)
    g.fillStyle = tone(SKIN_DARK, -0.15)
    g.fill()
    outline(g)
  }
  // Ventre et buste
  g.beginPath()
  g.moveTo(-17, -16)
  g.bezierCurveTo(-26, -2, -24, 18, -10, 21)
  g.lineTo(10, 21)
  g.bezierCurveTo(24, 18, 25, -4, 16, -17)
  g.quadraticCurveTo(0, -24, -17, -16)
  g.closePath()
  const belly = g.createRadialGradient(-6, -2, 2, 0, 4, 26)
  belly.addColorStop(0, tone(SKIN, 0.2))
  belly.addColorStop(1, SKIN_DARK)
  g.fillStyle = belly
  g.fill()
  outline(g, 1.5)
  // Nombril et plis
  g.strokeStyle = 'rgba(40,50,25,0.6)'
  g.lineWidth = 0.8
  g.beginPath()
  g.arc(-2, 7, 1.4, 0, TAU)
  g.moveTo(-14, 0)
  g.quadraticCurveTo(-4, 4, 8, 0)
  g.stroke()
  // Pagne de peau, ceinture et boucle d'os
  g.beginPath()
  g.moveTo(-19, 11)
  g.lineTo(19, 11)
  g.lineTo(16, 24)
  g.lineTo(6, 20)
  g.lineTo(0, 27)
  g.lineTo(-7, 20)
  g.lineTo(-17, 24)
  g.closePath()
  g.fillStyle = HIDE
  g.fill()
  lightOver(g, -19, 11, 19, 27, 0.18, 0.35)
  outline(g)
  g.fillStyle = '#3a2a18'
  g.fillRect(-19, 9, 38, 4)
  g.fillStyle = '#e8e0c8'
  g.beginPath()
  g.ellipse(0, 11, 3.2, 2.2, 0, 0, TAU)
  g.fill()
  outline(g, 0.8)
  // Bras arrière (sans massue)
  g.beginPath()
  g.moveTo(14, -14)
  g.quadraticCurveTo(24, -2, 20, 12)
  g.lineWidth = 9
  g.strokeStyle = SKIN_DARK
  g.stroke()
  g.beginPath()
  g.arc(20, 13, 5, 0, TAU)
  g.fillStyle = SKIN_DARK
  g.fill()
  outline(g)
  // Tête (petite, enfoncée dans les épaules), arcade, défenses
  g.beginPath()
  g.ellipse(-3, -27, 11, 10, 0, 0, TAU)
  g.fillStyle = SKIN
  g.fill()
  lightOver(g, -14, -37, 8, -17, 0.25, 0.35)
  outline(g, 1.4)
  g.beginPath()
  g.ellipse(4, -29, 3, 4, 0.3, 0, TAU)
  g.fillStyle = SKIN_DARK
  g.fill()
  outline(g, 0.9)
  // Sourcils broussailleux et yeux
  g.fillStyle = '#2b2a1c'
  g.beginPath()
  g.moveTo(-14, -32)
  g.lineTo(-3, -30)
  g.lineTo(-3, -28)
  g.lineTo(-14, -29)
  g.fill()
  g.fillStyle = hurt ? '#ffffff' : '#f2e27a'
  g.beginPath()
  g.arc(-10, -27, 1.9, 0, TAU)
  g.arc(-4, -27, 1.6, 0, TAU)
  g.fill()
  g.fillStyle = '#1a1208'
  g.beginPath()
  g.arc(-10.6, -27, hurt ? 0.6 : 0.95, 0, TAU)
  g.arc(-4.6, -27, hurt ? 0.6 : 0.85, 0, TAU)
  g.fill()
  // Mâchoire et défenses
  g.beginPath()
  g.moveTo(-14, -22)
  g.quadraticCurveTo(-6, -15, 3, -21)
  g.strokeStyle = OUT
  g.lineWidth = 1
  g.stroke()
  g.fillStyle = '#efe6cc'
  for (const [x, lean] of [[-12, -0.3], [-1, 0.25]]) {
    g.beginPath()
    g.moveTo(x - 1.4, -21)
    g.lineTo(x + lean * 4, -26.5)
    g.lineTo(x + 1.4, -21)
    g.closePath()
    g.fill()
    outline(g, 0.7)
  }
}

/** Bras avant et massue (calque animé, pivot à l'épaule). */
function clubArm(g) {
  // Massue : bois noueux et clous de fer.
  g.save()
  g.translate(-16, 8)
  g.rotate(-0.35)
  g.scale(1.3, 1.25)
  g.beginPath()
  roundRect(g, -3, -38, 7, 40, 3)
  g.fillStyle = woodPattern(g, { angle: Math.PI / 2, unitsPerTile: 60 })
  g.fill()
  outline(g)
  g.beginPath()
  g.ellipse(0.5, -38, 8, 11, 0, 0, TAU)
  g.fillStyle = woodPattern(g, { angle: Math.PI / 2, unitsPerTile: 50 })
  g.fill()
  lightOver(g, -8, -49, 9, -27, 0.2, 0.45)
  outline(g, 1.3)
  g.fillStyle = '#9aa1ab'
  for (const [x, y] of [[-6, -42], [6, -40], [-3, -32], [5, -33], [0, -47]]) {
    g.beginPath()
    g.arc(x, y, 1.4, 0, TAU)
    g.fill()
  }
  g.restore()
  // Bras
  g.beginPath()
  g.moveTo(-13, -14)
  g.quadraticCurveTo(-24, -2, -17, 8)
  g.lineWidth = 10
  g.strokeStyle = SKIN
  g.stroke()
  g.lineWidth = 1.2
  g.strokeStyle = OUT
  g.stroke()
  // Poing serré sur le manche
  g.beginPath()
  g.arc(-16, 8, 5.5, 0, TAU)
  g.fillStyle = SKIN
  g.fill()
  outline(g)
}

export function drawOgre(ctx, s) {
  const ex = s.extra ?? {}
  const t = (s.time ?? 0) / 1000
  const still = Boolean(ex.still)
  const hurt = Boolean(ex.hurt)
  ctx.save()
  ctx.scale(s.w / W, s.h / H)
  if (!still && ex.facing > 0) ctx.scale(-1, 1)
  if (!still && ex.walking) {
    // Pas lourd : le corps tangue d'une jambe sur l'autre.
    const step = t * 6 + (s.seed ?? 0)
    ctx.translate(0, H / 2)
    ctx.rotate(Math.sin(step) * 0.06)
    ctx.translate(0, -H / 2 - Math.abs(Math.sin(step)) * 2)
  } else if (!still) {
    const b = Math.sin(t * 1.6 + (s.seed ?? 0)) * 0.018
    ctx.translate(0, H / 2)
    ctx.scale(1 + b * 0.5, 1 - b)
    ctx.translate(0, -H / 2)
  }
  if (hurt) ctx.translate(Math.sin(t * 50) * 0.8, 0)
  cached(ctx, `ogre.body.${hurt ? 'hurt' : 'idle'}`, BOX, (g) => body(g, hurt), 4)
  // Revers : la massue se lève puis balaie vers l'avant (0,45 s).
  const sw = Number.isFinite(ex.swing) ? ex.swing : Infinity
  let rot = still ? 0 : Math.sin(t * 1.3 + (s.seed ?? 0)) * 0.05
  if (sw >= 0 && sw < 450) {
    const u = sw / 450
    rot = u < 0.3 ? -1.1 * (u / 0.3) : -1.1 + 2.2 * Math.min(1, (u - 0.3) / 0.25) - 1.1 * Math.max(0, (u - 0.55) / 0.45)
  }
  ctx.save()
  ctx.translate(-13, -14)
  ctx.rotate(rot)
  ctx.translate(13, 14)
  cached(ctx, 'ogre.arm', BOX, clubArm, 4)
  ctx.restore()
  ctx.restore()
}
