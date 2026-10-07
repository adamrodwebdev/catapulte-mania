/**
 * Engins de siège réalistes (v4.4) : mangonneau (catapulte) et trébuchet.
 *
 * Chaque engin est découpé en couches :
 *  - flanc éloigné (assombri) et châssis : image en cache ;
 *  - bras : image en cache, tournée à chaque image (+ flou de mouvement) ;
 *  - contrepoids du trébuchet : image en cache, balancée selon la vitesse du bras ;
 *  - flanc proche, axe, roues : image en cache, par-dessus le bras ;
 *  - cordes, fronde et fanion : dessinés à chaque image (quelques traits).
 * La géométrie (pivot, longueur des bras) est celle de la physique : le
 * projectile part toujours exactement du godet ou de la poche.
 */
import { TREBUCHET_GEOMETRY } from '../../Trebuchet.js'
import { TAU, roundRect, edge, lightOver, timber, strap, rivet, rope, lashing, cached, resolution, sprite, blit, woodPattern, metalGradient } from './realism.js'

/** Repère : origine au centre de la base, au sol. */
export const CATAPULT_GEOMETRY = Object.freeze({ pivotX: 6, pivotY: -78, armLength: 118 })

/**
 * Apparences (atelier) : teinte posée sur le bois, ferrures, couleur du fanion.
 * `oak` = bois naturel, sans fanion.
 */
export const CATAPULT_SKINS = Object.freeze({
  oak: { tint: null, metal: '#4b515b', flag: null },
  royal: { tint: 'rgba(47,75,124,0.32)', metal: '#d4a537', flag: '#2f4b7c' },
  ebony: { tint: 'rgba(20,16,30,0.5)', metal: '#b9b3a6', flag: '#1e1a2b' },
  dragon: { tint: 'rgba(163,50,43,0.32)', metal: '#ffb347', flag: '#a3322b' },
})

const REST_ANGLE = Math.PI - 0.25
const FAR = 'rgba(12,8,6,0.38)'

/** Voiles du bois : teinte de l'apparence, puis assombrissement du flanc éloigné. */
function woodTint(look, far) {
  return far ? [look.tint, FAR] : look.tint
}

/* ---------- Roues ---------- */

/** Roue à rayons cerclée de fer (vue de côté). */
function spokedWheel(g, x, y, r, look, far = false, seed = 1) {
  const tint = look.tint
  // Rayons.
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + 0.26
    timber(g, x + Math.cos(a) * 3, y + Math.sin(a) * 3, x + Math.cos(a) * (r - 4), y + Math.sin(a) * (r - 4), 3.2, { w2: 2.6, tint, seed: seed + k, symmetric: true })
  }
  // Jante en bois.
  g.beginPath()
  g.arc(x, y, r - 1.5, 0, TAU)
  g.arc(x, y, r - 6, 0, TAU, true)
  g.fillStyle = woodPattern(g, { angle: 0.3, unitsPerTile: 160, x: seed * 13 })
  g.fill()
  if (look.tint) {
    g.fillStyle = look.tint
    g.fill()
  }
  const sh = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r)
  sh.addColorStop(0, 'rgba(255,236,200,0.18)')
  sh.addColorStop(1, 'rgba(0,0,0,0.35)')
  g.fillStyle = sh
  g.fill()
  edge(g, 0.7)
  // Joints des jantes (6 segments).
  g.strokeStyle = 'rgba(40,22,10,0.7)'
  g.lineWidth = 0.6
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU
    g.beginPath()
    g.moveTo(x + Math.cos(a) * (r - 6), y + Math.sin(a) * (r - 6))
    g.lineTo(x + Math.cos(a) * (r - 1.5), y + Math.sin(a) * (r - 1.5))
    g.stroke()
  }
  // Bandage de fer et clous.
  g.beginPath()
  g.arc(x, y, r, 0, TAU)
  g.arc(x, y, r - 2, 0, TAU, true)
  g.fillStyle = metalGradient(g, x - r, y - r, x + r * 0.4, y + r, look.metal)
  g.fill()
  edge(g, 0.5)
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * TAU
    rivet(g, x + Math.cos(a) * (r - 1), y + Math.sin(a) * (r - 1), 0.55, look.metal)
  }
  // Moyeu.
  g.beginPath()
  g.arc(x, y, 4.6, 0, TAU)
  g.fillStyle = woodPattern(g, { unitsPerTile: 80 })
  g.fill()
  lightOver(g, x - 5, y - 5, x + 5, y + 5)
  edge(g, 0.6)
  rivet(g, x, y, 2.3, look.metal)
  if (far) {
    g.beginPath()
    g.arc(x, y, r + 0.5, 0, TAU)
    g.fillStyle = FAR
    g.fill()
  }
}

/** Roue pleine (planches) du trébuchet. */
function plankWheel(g, x, y, r, look, far = false) {
  g.save()
  g.beginPath()
  g.arc(x, y, r, 0, TAU)
  g.clip()
  for (let i = -2; i <= 2; i++) {
    g.beginPath()
    g.rect(x - r, y + i * (r / 2.5) - r / 5, r * 2, r / 2.5)
    g.fillStyle = woodPattern(g, { x: i * 40, y: i * 9, unitsPerTile: 200 })
    g.fill()
    g.strokeStyle = 'rgba(40,22,10,0.6)'
    g.lineWidth = 0.6
    g.stroke()
  }
  if (look.tint) {
    g.fillStyle = look.tint
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  const sh = g.createRadialGradient(x - r * 0.35, y - r * 0.35, 1, x, y, r)
  sh.addColorStop(0, 'rgba(255,236,200,0.22)')
  sh.addColorStop(1, 'rgba(0,0,0,0.42)')
  g.fillStyle = sh
  g.fillRect(x - r, y - r, r * 2, r * 2)
  // Traverse cloutée.
  g.fillStyle = metalGradient(g, x - r, y - 1.5, x - r, y + 1.5, look.metal)
  g.fillRect(x - r, y - 1.4, r * 2, 2.8)
  g.restore()
  g.beginPath()
  g.arc(x, y, r, 0, TAU)
  g.lineWidth = 1.8
  g.strokeStyle = metalGradient(g, x - r, y - r, x + r, y + r, look.metal)
  g.stroke()
  g.beginPath()
  g.arc(x, y, r + 0.9, 0, TAU)
  edge(g, 0.5)
  for (let k = 0; k < 8; k++) rivet(g, x + Math.cos((k / 8) * TAU) * r, y + Math.sin((k / 8) * TAU) * r, 0.6, look.metal)
  rivet(g, x, y, 3, look.metal)
  if (far) {
    g.beginPath()
    g.arc(x, y, r + 1, 0, TAU)
    g.fillStyle = FAR
    g.fill()
  }
}

/** Bout de traverse vu de face : bois de bout à cernes. */
function endGrain(g, x, y, s, look) {
  g.beginPath()
  roundRect(g, x - s / 2, y - s / 2, s, s, 1)
  g.fillStyle = '#9a6a3c'
  g.fill()
  if (look.tint) {
    g.fillStyle = look.tint
    g.fill()
  }
  g.save()
  g.clip()
  g.strokeStyle = 'rgba(70,40,18,0.55)'
  g.lineWidth = 0.45
  for (let k = 1; k < 6; k++) {
    g.beginPath()
    g.arc(x + s * 0.18, y + s * 0.22, k * s * 0.17, 0, TAU)
    g.stroke()
  }
  g.beginPath()
  g.moveTo(x + s * 0.18, y + s * 0.22)
  g.lineTo(x - s * 0.4, y - s * 0.1)
  g.stroke()
  g.restore()
  g.beginPath()
  roundRect(g, x - s / 2, y - s / 2, s, s, 1)
  lightOver(g, x - s / 2, y - s / 2, x + s / 2, y + s / 2, 0.2, 0.35)
  edge(g, 0.6)
}

/* ---------- Fanion (animé) ---------- */

function pennant(ctx, x, yTop, yBase, color, time, px, dir = -1, length = 32) {
  // Hampe.
  ctx.beginPath()
  ctx.moveTo(x, yBase)
  ctx.lineTo(x, yTop - 2)
  ctx.lineWidth = 2.2
  ctx.strokeStyle = '#4a3220'
  ctx.stroke()
  ctx.lineWidth = 0.8
  ctx.strokeStyle = 'rgba(255,225,180,0.35)'
  ctx.beginPath()
  ctx.moveTo(x - 0.5, yBase)
  ctx.lineTo(x - 0.5, yTop - 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(x, yTop - 3, 1.8, 0, TAU)
  ctx.fillStyle = '#c9a24a'
  ctx.fill()
  // Étoffe : ondulation qui s'amplifie vers la pointe.
  const t = (time || 0) / 1000
  const n = 10
  const top = []
  const bottom = []
  for (let i = 0; i <= n; i++) {
    const u = i / n
    const wave = Math.sin(t * 6.5 - u * 5.2) * (1 + u * 4.2)
    const half = 7 * (1 - u * 0.92)
    top.push({ x: x + dir * u * length, y: yTop + 1 + wave })
    bottom.push({ x: x + dir * u * length, y: yTop + 1 + half * 2 + wave * 0.85 })
  }
  ctx.beginPath()
  top.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
  for (let i = n; i >= 0; i--) ctx.lineTo(bottom[i].x, bottom[i].y)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
  // Plis : ombre dans les creux de la vague.
  const gr = ctx.createLinearGradient(x, 0, x + dir * length, 0)
  for (let i = 0; i <= 8; i++) {
    const u = i / 8
    const s = Math.cos(t * 6.5 - u * 5.2)
    gr.addColorStop(u, s > 0 ? `rgba(255,240,220,${0.22 * s})` : `rgba(0,0,0,${-0.32 * s})`)
  }
  ctx.fillStyle = gr
  ctx.fill()
  ctx.lineWidth = Math.max(0.5, 0.7 * px)
  ctx.strokeStyle = 'rgba(30,20,16,0.85)'
  ctx.stroke()
}

/* ---------- Catapulte (mangonneau à torsion) ---------- */

const CAT_BOX_BACK = { x: -122, y: -150, w: 244, h: 160 }
const CAT_BOX_FRONT = { x: -84, y: -102, w: 168, h: 112 }
const CAT_BOX_ARM = { x: -20, y: -34, w: 166, h: 50 }

function catapultBack(g, look) {
  const { pivotX, pivotY } = CATAPULT_GEOMETRY
  // Flanc éloigné : roues et montants, décalés et assombris.
  spokedWheel(g, -53, -15, 18, look, true, 11)
  spokedWheel(g, 63, -15, 18, look, true, 17)
  const far = woodTint(look, true)
  timber(g, -36, -28, pivotX + 4, pivotY - 3, 11, { w2: 10, tint: far, seed: 3 })
  timber(g, 56, -28, pivotX + 6, pivotY - 3, 11, { w2: 10, tint: far, seed: 4 })
  // Poteau d'arrêt et contrefiche, traverse rembourrée.
  timber(g, pivotX + 32, -26, pivotX + 32, -126, 12, { tint: look.tint, seed: 5 })
  timber(g, 82, -26, pivotX + 36, -96, 9, { tint: look.tint, seed: 6 })
  lashing(g, pivotX + 37, -94, Math.PI / 2, 7, 13)
  timber(g, pivotX + 10, -128, pivotX + 54, -128, 12, { tint: look.tint, seed: 7 })
  strap(g, pivotX + 32, -128, 4, 13, look.metal)
  // Coussin de cuir bourré de paille (le bras vient y frapper).
  g.beginPath()
  g.ellipse(pivotX + 24, -119, 13, 5.5, -0.15, 0, TAU)
  g.fillStyle = '#6e4a2c'
  g.fill()
  lightOver(g, pivotX + 11, -125, pivotX + 37, -113, 0.3, 0.45)
  edge(g, 0.7)
  g.beginPath()
  g.ellipse(pivotX + 24, -119, 9.5, 2.6, -0.15, 0, TAU)
  g.setLineDash([1, 1])
  g.lineWidth = 0.45
  g.strokeStyle = 'rgba(240,210,150,0.7)'
  g.stroke()
  g.setLineDash([])
  // Châssis : longeron, bouts de traverses, treuil arrière.
  timber(g, -94, -22, 96, -22, 15, { tint: look.tint, seed: 8 })
  timber(g, -90, -33, 92, -33, 6, { tint: look.tint, seed: 9 })
  for (const x of [-84, 86]) endGrain(g, x, -22, 11, look)
  for (const x of [-60, -12, 40]) strap(g, x, -22, 3.4, 15, look.metal)
  // Treuil : tambour et barres de manœuvre.
  timber(g, -84, -46, -84, -30, 8, { tint: look.tint, seed: 10 })
  g.beginPath()
  g.ellipse(-76, -44, 7, 7, 0, 0, TAU)
  g.fillStyle = woodPattern(g, { unitsPerTile: 90 })
  g.fill()
  lightOver(g, -83, -51, -69, -37)
  edge(g, 0.7)
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + 0.4
    timber(g, -76, -44, -76 + Math.cos(a) * 15, -44 + Math.sin(a) * 15, 2.6, { w2: 2.2, tint: look.tint, seed: 20 + k, symmetric: true })
  }
  // Corde enroulée sur le tambour.
  for (let k = -2; k <= 2; k++) rope(g, [{ x: -80 + k * 1.6, y: -50.5 }, { x: -72 + k * 1.6, y: -37.5 }], 1.3)
  rivet(g, -76, -44, 2.2, look.metal)
}

function catapultFront(g, look) {
  const { pivotX, pivotY } = CATAPULT_GEOMETRY
  // Montants en A du flanc proche.
  timber(g, -40, -28, pivotX - 1, pivotY + 2, 12, { w2: 10, tint: look.tint, seed: 30 })
  timber(g, 52, -28, pivotX + 3, pivotY + 2, 12, { w2: 10, tint: look.tint, seed: 31 })
  timber(g, -24, -52, 36, -52, 8, { tint: look.tint, seed: 32 })
  lashing(g, -21, -52, 0.9, 6, 12)
  lashing(g, 33, -52, -0.9, 6, 12)
  // Sabots ferrés au pied des montants.
  strap(g, -38, -31, 13, 4, look.metal, { rivets: 0 })
  strap(g, 50, -31, 13, 4, look.metal, { rivets: 0 })
  for (const x of [-42, -34, 46, 54]) rivet(g, x, -31, 0.9, look.metal)
  // Écheveau de torsion (cordes tordues vues en bout) et rondelle de fer.
  const cx = pivotX
  const cy = pivotY
  g.beginPath()
  g.arc(cx, cy, 14, 0, TAU)
  g.fillStyle = metalGradient(g, cx - 14, cy - 14, cx + 10, cy + 14, look.metal)
  g.fill()
  edge(g, 0.8)
  for (let k = 0; k < 8; k++) rivet(g, cx + Math.cos((k / 8) * TAU) * 11.5, cy + Math.sin((k / 8) * TAU) * 11.5, 1.1, look.metal)
  g.beginPath()
  g.arc(cx, cy, 9, 0, TAU)
  g.fillStyle = '#6a5237'
  g.fill()
  g.save()
  g.clip()
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * TAU
    rope(g, [{ x: cx + Math.cos(a) * 1.5, y: cy + Math.sin(a) * 1.5 }, { x: cx + Math.cos(a + 0.9) * 9, y: cy + Math.sin(a + 0.9) * 9 }], 1.7, '#8d7350')
  }
  const sh = g.createRadialGradient(cx, cy, 1, cx, cy, 9)
  sh.addColorStop(0, 'rgba(0,0,0,0.45)')
  sh.addColorStop(0.6, 'rgba(0,0,0,0)')
  sh.addColorStop(1, 'rgba(0,0,0,0.35)')
  g.fillStyle = sh
  g.fillRect(cx - 9, cy - 9, 18, 18)
  g.restore()
  // Levier de serrage (barre carrée passée dans la rondelle).
  timber(g, cx - 16, cy + 9, cx + 17, cy - 10, 3.6, { tint: look.tint, seed: 33 })
  // Roues du flanc proche.
  spokedWheel(g, -58, -12, 18, look, false, 41)
  spokedWheel(g, 58, -12, 18, look, false, 47)
}

function catapultArm(g, look) {
  const { armLength } = CATAPULT_GEOMETRY
  timber(g, -16, 0, armLength - 4, 0, 13, { w2: 9, tint: look.tint, seed: 50, symmetric: true })
  for (const x of [14, 62]) strap(g, x, 0, 3.6, x < 30 ? 14 : 11.5, look.metal)
  lashing(g, armLength - 18, 0, 0, 8, 10.5)
  // Godet : cuvette taillée dans un bloc, cerclée de fer.
  const x = armLength
  const y = -10
  g.beginPath()
  g.moveTo(x - 19, y - 4)
  g.bezierCurveTo(x - 19, y + 10, x + 19, y + 10, x + 19, y - 4)
  g.lineTo(x + 15, y - 6)
  g.lineTo(x - 15, y - 6)
  g.closePath()
  g.fillStyle = woodPattern(g, { unitsPerTile: 140, x: 30 })
  g.fill()
  if (look.tint) {
    g.fillStyle = look.tint
    g.fill()
  }
  const sh = g.createLinearGradient(x - 19, 0, x + 19, 0)
  sh.addColorStop(0, 'rgba(0,0,0,0.42)')
  sh.addColorStop(0.3, 'rgba(255,236,200,0.18)')
  sh.addColorStop(0.7, 'rgba(0,0,0,0.05)')
  sh.addColorStop(1, 'rgba(0,0,0,0.5)')
  g.fillStyle = sh
  g.fill()
  edge(g, 0.9)
  // Creux du godet (intérieur sombre).
  g.beginPath()
  g.ellipse(x, y - 5, 15, 3.4, 0, 0, TAU)
  const inner = g.createLinearGradient(0, y - 8, 0, y - 2)
  inner.addColorStop(0, '#2a180c')
  inner.addColorStop(1, '#5a3a20')
  g.fillStyle = inner
  g.fill()
  edge(g, 0.5)
  // Cerclage.
  g.beginPath()
  g.moveTo(x - 18.5, y - 1)
  g.bezierCurveTo(x - 17, y + 6, x + 17, y + 6, x + 18.5, y - 1)
  g.lineWidth = 2.2
  g.strokeStyle = metalGradient(g, x - 18, y - 2, x + 18, y + 4, look.metal)
  g.stroke()
  for (const k of [-12, 0, 12]) rivet(g, x + k, y + 2.8 + (k ? -0.9 : 0.6), 0.8, look.metal)
  // Tourillon (bout du bras traversé par l'écheveau).
  g.beginPath()
  g.arc(0, 0, 7.5, 0, TAU)
  g.fillStyle = woodPattern(g, { unitsPerTile: 90 })
  g.fill()
  lightOver(g, -8, -8, 8, 8)
  edge(g, 0.7)
}

function catapult(ctx, s) {
  const { armAngle = REST_ANGLE, load = null, loadRadius = 16, registry = null, skin = 'oak', flag = null, armSpeed = 0, still = false } = s.extra ?? {}
  const look = CATAPULT_SKINS[skin] || CATAPULT_SKINS.oak
  const { pivotX, pivotY, armLength } = CATAPULT_GEOMETRY
  const px = s.pixel ?? 1
  cached(ctx, `cat.back.${skin}`, CAT_BOX_BACK, (g) => catapultBack(g, look), 3)
  // Corde de rappel : tendue entre le treuil et le bras tant qu'il est armé.
  if (Math.abs(armSpeed) < 1.5 && armAngle > REST_ANGLE - 0.04 && armAngle < REST_ANGLE + 0.45) {
    const ax = pivotX + Math.cos(armAngle) * 76
    const ay = pivotY + Math.sin(armAngle) * 76
    rope(ctx, [{ x: -74, y: -51 }, { x: ax, y: ay + 4 }], 1.5)
  }
  // Bras (flou de mouvement quand il fouette l'air).
  const res = resolution(ctx, 3)
  const armImg = sprite(`cat.arm.${skin}`, CAT_BOX_ARM, res, (g) => catapultArm(g, look))
  const drawArm = (angle, alpha) => {
    ctx.save()
    ctx.translate(pivotX, pivotY)
    ctx.rotate(angle)
    ctx.globalAlpha = alpha
    blit(ctx, armImg, CAT_BOX_ARM, res)
    ctx.restore()
  }
  if (Math.abs(armSpeed) > 4) {
    const step = Math.max(-0.22, Math.min(0.22, -armSpeed / 120))
    for (let k = 3; k >= 1; k--) drawArm(armAngle + step * k, 0.1 + (3 - k) * 0.06)
  }
  drawArm(armAngle, 1)
  if (load && registry) {
    ctx.save()
    ctx.translate(pivotX, pivotY)
    ctx.rotate(armAngle)
    ctx.translate(armLength, -14)
    ctx.rotate(-armAngle)
    registry.draw(ctx, load, { w: loadRadius * 2, h: loadRadius * 2, pixel: px, time: s.time })
    ctx.restore()
  }
  cached(ctx, `cat.front.${skin}`, CAT_BOX_FRONT, (g) => catapultFront(g, look), 3)
  const banner = flag || look.flag
  if (banner) pennant(ctx, pivotX + 32, -178, -134, banner, still ? 0 : s.time, px)
}

/* ---------- Trébuchet à contrepoids ---------- */

const TB_BOX_BACK = { x: -132, y: -166, w: 272, h: 172 }
const TB_BOX_FRONT = { x: -104, y: -166, w: 208, h: 172 }
const TB_BOX_ARM = { x: -TREBUCHET_GEOMETRY.armShort - 14, y: -14, w: TREBUCHET_GEOMETRY.armShort + TREBUCHET_GEOMETRY.armLong + 26, h: 28 }
const TB_BOX_WEIGHT = { x: -36, y: -6, w: 72, h: 84 }

function trebuchetBack(g, look) {
  const { pivotY } = TREBUCHET_GEOMETRY
  plankWheel(g, -79, -13, 13, look, true)
  plankWheel(g, 89, -13, 13, look, true)
  const far = woodTint(look, true)
  timber(g, -86, -24, -2, pivotY, 13, { w2: 11, tint: far, seed: 60 })
  timber(g, 98, -24, 12, pivotY, 13, { w2: 11, tint: far, seed: 61 })
  timber(g, -54, -74, 66, -74, 9, { tint: far, seed: 62 })
  // Socle : longerons, auge où glisse le projectile.
  timber(g, -124, -17, 124, -17, 18, { tint: look.tint, seed: 63 })
  for (const x of [-116, 118]) endGrain(g, x, -17, 13, look)
  for (const x of [-60, 0, 60]) strap(g, x, -17, 4, 18, look.metal)
  // Auge : planche de fond et rebord.
  timber(g, -72, -5, 132, -5, 8, { tint: look.tint, seed: 64 })
  g.beginPath()
  roundRect(g, -72, -10, 204, 2.4, 1)
  g.fillStyle = 'rgba(30,18,10,0.55)'
  g.fill()
}

function trebuchetFront(g, look) {
  const { pivotY } = TREBUCHET_GEOMETRY
  timber(g, -92, -20, -6, pivotY + 4, 14, { w2: 12, tint: look.tint, seed: 70 })
  timber(g, 92, -20, 6, pivotY + 4, 14, { w2: 12, tint: look.tint, seed: 71 })
  timber(g, -60, -70, 60, -70, 10, { tint: look.tint, seed: 72 })
  timber(g, -14, -20, -4, pivotY + 8, 11, { w2: 10, tint: look.tint, seed: 73 })
  // Assemblages : ligatures et équerres de fer.
  lashing(g, -56, -70, 1.05, 7, 15)
  lashing(g, 56, -70, -1.05, 7, 15)
  lashing(g, -9, -70, 1.5, 6, 13)
  for (const [x, a] of [[-88, -1.05], [88, 1.05]]) {
    g.save()
    g.translate(x, -24)
    g.rotate(a)
    strap(g, 0, 0, 16, 4.5, look.metal, { rivets: 0 })
    g.restore()
    rivet(g, x, -24, 1.2, look.metal)
  }
  // Palier de l'axe : bloc de bois et chapeau de fer.
  g.beginPath()
  roundRect(g, -13, pivotY - 6, 26, 18, 2)
  g.fillStyle = woodPattern(g, { unitsPerTile: 120 })
  g.fill()
  if (look.tint) {
    g.fillStyle = look.tint
    g.fill()
  }
  lightOver(g, -13, pivotY - 6, 13, pivotY + 12)
  edge(g, 0.8)
  g.beginPath()
  g.arc(0, pivotY, 8.5, 0, TAU)
  g.fillStyle = metalGradient(g, -8, pivotY - 8, 8, pivotY + 8, look.metal)
  g.fill()
  edge(g, 0.7)
  for (let k = 0; k < 6; k++) rivet(g, Math.cos((k / 6) * TAU) * 6, pivotY + Math.sin((k / 6) * TAU) * 6, 0.9, look.metal)
  rivet(g, 0, pivotY, 3, look.metal)
  plankWheel(g, -84, -10, 13, look)
  plankWheel(g, 84, -10, 13, look)
}

function trebuchetArm(g, look) {
  const { armLong, armShort } = TREBUCHET_GEOMETRY
  timber(g, -armShort - 8, 0, armLong, 0, 19, { w2: 8, tint: look.tint, seed: 80, symmetric: true })
  for (const x of [-armShort + 10, -14, 14, 60, 120]) strap(g, x, 0, 3.6, x < 0 ? 19 : x < 50 ? 16 : x < 100 ? 13 : 10.5, look.metal)
  lashing(g, armLong - 30, 0, 0, 8, 9)
  // Crochet de lâcher (fer recourbé en bout de bras).
  g.beginPath()
  g.moveTo(armLong - 2, -2)
  g.quadraticCurveTo(armLong + 9, -3, armLong + 8, -11)
  g.lineWidth = 2
  g.strokeStyle = metalGradient(g, armLong, -11, armLong + 9, 0, look.metal)
  g.stroke()
  rivet(g, armLong, 0, 1.6, look.metal)
  // Axe du contrepoids.
  rivet(g, -armShort, 0, 3.2, look.metal)
}

function trebuchetWeight(g, look) {
  // Étriers de fer.
  for (const sx of [-1, 1]) {
    g.beginPath()
    g.moveTo(sx * 3, 0)
    g.lineTo(sx * 22, 21)
    g.lineWidth = 2.6
    g.strokeStyle = metalGradient(g, sx * 3, 0, sx * 22, 21, look.metal)
    g.stroke()
    rivet(g, sx * 22, 22, 1.3, look.metal)
  }
  // Pierres entassées dépassant de la caisse.
  const stones = [[-22, 22, 7], [-10, 19, 8], [3, 20, 7.5], [15, 21, 7], [25, 23, 5], [-27, 25, 4.5], [-4, 17, 5]]
  for (const [x, y, r] of stones) {
    const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.5, r * 0.1, x, y, r)
    gr.addColorStop(0, '#b9b4ab')
    gr.addColorStop(0.6, '#7d786f')
    gr.addColorStop(1, '#4a463f')
    g.beginPath()
    g.ellipse(x, y, r, r * 0.8, 0.3, 0, TAU)
    g.fillStyle = gr
    g.fill()
    edge(g, 0.5)
  }
  // Caisse de planches verticales.
  g.beginPath()
  roundRect(g, -32, 24, 64, 50, 2)
  g.save()
  g.clip()
  for (let i = 0; i < 6; i++) {
    const x = -32 + i * (64 / 6)
    g.beginPath()
    g.rect(x, 24, 64 / 6, 50)
    g.fillStyle = woodPattern(g, { angle: Math.PI / 2, x: x * 7, unitsPerTile: 260 })
    g.fill()
    g.strokeStyle = 'rgba(40,22,10,0.65)'
    g.lineWidth = 0.6
    g.stroke()
  }
  if (look.tint) {
    g.fillStyle = look.tint
    g.fillRect(-32, 24, 64, 50)
  }
  const sh = g.createLinearGradient(-32, 24, 32, 74)
  sh.addColorStop(0, 'rgba(255,236,200,0.2)')
  sh.addColorStop(0.5, 'rgba(0,0,0,0.05)')
  sh.addColorStop(1, 'rgba(0,0,0,0.45)')
  g.fillStyle = sh
  g.fillRect(-32, 24, 64, 50)
  g.restore()
  g.beginPath()
  roundRect(g, -32, 24, 64, 50, 2)
  edge(g, 1)
  // Cerclages et cornières.
  for (const y of [30, 66]) {
    g.beginPath()
    g.rect(-32, y - 2.2, 64, 4.4)
    g.fillStyle = metalGradient(g, 0, y - 2.2, 0, y + 2.2, look.metal)
    g.fill()
    edge(g, 0.5)
    for (const x of [-26, -13, 0, 13, 26]) rivet(g, x, y, 0.9, look.metal)
  }
  for (const x of [-30, 30]) {
    g.beginPath()
    g.rect(x - 2, 24, 4, 50)
    g.fillStyle = metalGradient(g, x - 2, 0, x + 2, 0, look.metal)
    g.fill()
    edge(g, 0.4)
  }
}

/** Poche de la fronde (cuir), orientée selon la corde. */
function pouch(ctx, x, y, angle, r) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.moveTo(-r * 0.2, -r * 1.05)
  ctx.quadraticCurveTo(r * 1.25, -r * 0.6, r * 1.15, 0)
  ctx.quadraticCurveTo(r * 1.25, r * 0.6, -r * 0.2, r * 1.05)
  ctx.quadraticCurveTo(r * 0.35, 0, -r * 0.2, -r * 1.05)
  const gr = ctx.createLinearGradient(0, -r, 0, r)
  gr.addColorStop(0, '#8a6038')
  gr.addColorStop(0.5, '#6a4526')
  gr.addColorStop(1, '#3e2814')
  ctx.fillStyle = gr
  ctx.fill()
  ctx.lineWidth = 0.7
  ctx.strokeStyle = 'rgba(30,20,12,0.9)'
  ctx.stroke()
  ctx.restore()
}

function trebuchet(ctx, s) {
  const { theta = Math.PI * 0.8, sling = null, load = null, loadRadius = 14, registry = null, skin = 'oak', flag = null, thetaSpeed = 0, still = false } = s.extra ?? {}
  const look = CATAPULT_SKINS[skin] || CATAPULT_SKINS.oak
  const px = s.pixel ?? 1
  const { pivotY, armLong, armShort, sling: slingLen } = TREBUCHET_GEOMETRY
  const c = Math.cos(theta)
  const sn = Math.sin(theta)
  const tip = { x: armLong * c, y: pivotY + armLong * sn }
  const cw = { x: -armShort * c, y: pivotY - armShort * sn }
  const res = resolution(ctx, 3)

  cached(ctx, `treb.back.${skin}`, TB_BOX_BACK, (g) => trebuchetBack(g, look), 3)

  // Contrepoids : il pend sous son axe et se balance quand le bras accélère.
  const swing = Math.max(-0.45, Math.min(0.45, thetaSpeed * 0.07))
  ctx.save()
  ctx.translate(cw.x, cw.y)
  ctx.rotate(swing)
  blit(ctx, sprite(`treb.weight.${skin}`, TB_BOX_WEIGHT, res, (g) => trebuchetWeight(g, look)), TB_BOX_WEIGHT, res)
  ctx.restore()

  // Bras (avec flou de mouvement).
  const armImg = sprite(`treb.arm.${skin}`, TB_BOX_ARM, res, (g) => trebuchetArm(g, look))
  const drawArm = (angle, alpha) => {
    ctx.save()
    ctx.translate(0, pivotY)
    ctx.rotate(angle)
    ctx.globalAlpha = alpha
    blit(ctx, armImg, TB_BOX_ARM, res)
    ctx.restore()
  }
  if (Math.abs(thetaSpeed) > 3) {
    const step = Math.max(-0.16, Math.min(0.16, -thetaSpeed / 140))
    for (let k = 3; k >= 1; k--) drawArm(theta + step * k, 0.1 + (3 - k) * 0.06)
  }
  drawArm(theta, 1)

  // Fronde : deux cordes jusqu'à la poche. Vide, elle pend avec un léger mou.
  const end = sling ?? { x: tip.x + 6, y: tip.y + slingLen * 0.96 }
  const dx = end.x - tip.x
  const dy = end.y - tip.y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const sag = sling ? 0 : 3
  const spread = loadRadius * 0.8
  for (const side of [-1, 1]) {
    const ex = end.x + nx * spread * side * 0.9
    const ey = end.y + ny * spread * side * 0.9
    const mx = (tip.x + ex) / 2 + nx * sag * side
    const my = (tip.y + ey) / 2 + ny * sag * side + sag
    rope(ctx, [tip, { x: mx, y: my }, { x: ex, y: ey }], 1.3, side < 0 ? '#6f5535' : '#86684a')
  }
  pouch(ctx, end.x, end.y, Math.atan2(dy, dx), loadRadius * (sling ? 0.95 : 0.7))
  if (sling && load && registry) {
    ctx.save()
    ctx.translate(end.x, end.y)
    registry.draw(ctx, load, { w: loadRadius * 2, h: loadRadius * 2, pixel: px, time: s.time })
    ctx.restore()
  }

  cached(ctx, `treb.front.${skin}`, TB_BOX_FRONT, (g) => trebuchetFront(g, look), 3)
  const banner = flag || look.flag
  if (banner) pennant(ctx, -100, -98, -26, banner, still ? 0 : s.time, px)
}

export { catapult, trebuchet }
