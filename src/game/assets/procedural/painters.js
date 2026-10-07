/**
 * Dessins vectoriels de tous les éléments du jeu (Canvas 2D).
 *
 * Style : illustration à aplats, contour « encre » indigo, ombrage doux.
 * Chaque fonction reçoit le contexte DÉJÀ placé au centre de l'objet (et tourné),
 * et dessine dans un repère local de taille `state.w × state.h`.
 *
 * Pour remplacer un visuel par une image, il suffit de changer sa clé dans
 * assets.config.js : ce fichier n'a pas besoin d'être modifié.
 */
import { materialPattern } from './textures.js'
import { SeededRandom } from '../../../core/utils/SeededRandom.js'
import { WORLD } from '../../physics/constants.js'
import { TREBUCHET_GEOMETRY } from '../../Trebuchet.js'

const INK = '#1e1a2b'
const TAU = Math.PI * 2

/** Palettes de décor par chapitre : la progression se lit aussi dans le ciel. */
export const THEMES = Object.freeze({
  1: { skyTop: '#7fb2dc', skyBottom: '#f5dcae', sun: '#fff1c4', far: '#86a873', farDark: '#6b8c5c', grass: '#5c8a3b', dirt: '#7a5636', castle: '#8fa58a', night: false },
  2: { skyTop: '#93acc4', skyBottom: '#e3e6e2', sun: '#fffdf0', far: '#8e97a6', farDark: '#727c8d', grass: '#5f7d45', dirt: '#6d5a48', castle: '#9097a4', night: false },
  3: { skyTop: '#3f2c5c', skyBottom: '#ef9653', sun: '#ffd27a', far: '#5b3a5a', farDark: '#432a47', grass: '#4d5e32', dirt: '#5a3f2c', castle: '#4b2f4c', night: false },
  4: { skyTop: '#0d1430', skyBottom: '#3c3c6e', sun: '#e9edf7', far: '#1f2446', farDark: '#161a36', grass: '#2f4a30', dirt: '#3b2e28', castle: '#262b52', night: true },
  // v3 : chapitres 5 à 10, chacun avec son climat (brume, sable, neige, pluie…).
  5: { skyTop: '#7f9a8f', skyBottom: '#d9e0c8', sun: '#f4f1d0', far: '#5f7a5a', farDark: '#4b6347', grass: '#4e6b3a', dirt: '#4a3d2e', castle: '#6f7f6a', night: false, weather: 'fog' },
  6: { skyTop: '#4f93cf', skyBottom: '#f7e3b0', sun: '#fff5d6', far: '#d8b47a', farDark: '#c09a62', grass: '#c9ad6a', dirt: '#a9824f', castle: '#c9a36b', night: false, arid: true },
  7: { skyTop: '#5f86b5', skyBottom: '#dfe8f0', sun: '#ffffff', far: '#8a96a8', farDark: '#5f6a7c', grass: '#6f8a5a', dirt: '#5d5248', castle: '#7c8597', night: false, peaks: true },
  8: { skyTop: '#9db8d4', skyBottom: '#eef3f8', sun: '#ffffff', far: '#dfe7ef', farDark: '#c3cfdc', grass: '#f4f7fb', dirt: '#8a8f99', castle: '#aab6c6', night: false, arid: true, weather: 'snow' },
  9: { skyTop: '#2f3646', skyBottom: '#7f8898', sun: '#c9cfda', far: '#4a5262', farDark: '#353c4a', grass: '#3f5a3a', dirt: '#3a312a', castle: '#2f3542', night: false, weather: 'rain' },
  10: { skyTop: '#22132f', skyBottom: '#b8464f', sun: '#ffcc66', far: '#4a2440', farDark: '#331a30', grass: '#3d4a2c', dirt: '#3b2a22', castle: '#2b1a2e', night: true },
})

/* ---------- Outils communs ---------- */

function outline(ctx, s, width = 1.8) {
  ctx.lineWidth = width * (s.pixel ?? 1)
  ctx.strokeStyle = INK
  ctx.lineJoin = 'round'
  ctx.stroke()
}

function shapePath(ctx, s) {
  ctx.beginPath()
  if (s.vertices && s.shape === 'triangle') {
    s.vertices.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)))
    ctx.closePath()
  } else {
    roundRect(ctx, -s.w / 2, -s.h / 2, s.w, s.h, Math.min(3, s.w / 5, s.h / 5))
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Fissures déterministes, de plus en plus nombreuses avec les dégâts. */
function cracks(ctx, s) {
  const dmg = s.damage ?? 0
  if (dmg < 0.12) return
  const r = new SeededRandom(((s.seed ?? 1) * 2654435761) >>> 0)
  const count = Math.ceil(dmg * 5)
  ctx.save()
  ctx.clip()
  ctx.strokeStyle = 'rgba(25,20,30,0.75)'
  ctx.lineWidth = 1.4 * (s.pixel ?? 1)
  for (let i = 0; i < count; i++) {
    let x = r.range(-s.w / 2, s.w / 2)
    let y = r.range(-s.h / 2, s.h / 2)
    ctx.beginPath()
    ctx.moveTo(x, y)
    const steps = 3 + r.int(0, 3)
    const dir = r.range(0, TAU)
    for (let k = 0; k < steps; k++) {
      x += Math.cos(dir + r.range(-0.9, 0.9)) * (6 + dmg * 10)
      y += Math.sin(dir + r.range(-0.9, 0.9)) * (6 + dmg * 10)
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  ctx.restore()
}

function scorch(ctx, s) {
  if (!s.burning) return
  ctx.save()
  ctx.globalCompositeOperation = 'source-atop'
  ctx.fillStyle = 'rgba(255,110,30,0.28)'
  ctx.fill()
  ctx.restore()
}

/* ---------- Blocs ---------- */

function blockPainter(material) {
  return (ctx, s) => {
    shapePath(ctx, s)
    ctx.fillStyle = materialPattern(ctx, material)
    ctx.fill()
    // Volume : lumière en haut à gauche, ombre en bas.
    const g = ctx.createLinearGradient(0, -s.h / 2, 0, s.h / 2)
    g.addColorStop(0, 'rgba(255,255,255,0.18)')
    g.addColorStop(1, 'rgba(0,0,0,0.22)')
    ctx.fillStyle = g
    ctx.fill()
    if (material === 'glass') {
      ctx.fillStyle = 'rgba(255,255,255,0.08)'
      ctx.fill()
    }
    // Biseau : arête éclairée en haut et à gauche, arête sombre en bas et à droite.
    if (s.shape !== 'triangle') {
      const px = s.pixel ?? 1
      const bw = Math.min(4, Math.max(1.5 * px, Math.min(s.w, s.h) * 0.12))
      ctx.save()
      ctx.clip()
      ctx.fillStyle = 'rgba(255,255,255,0.28)'
      ctx.fillRect(-s.w / 2, -s.h / 2, s.w, bw)
      ctx.fillRect(-s.w / 2, -s.h / 2, bw, s.h)
      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      ctx.fillRect(-s.w / 2, s.h / 2 - bw, s.w, bw)
      ctx.fillRect(s.w / 2 - bw, -s.h / 2, bw, s.h)
      ctx.restore()
      shapePath(ctx, s)
    }
    scorch(ctx, s)
    cracks(ctx, s)
    shapePath(ctx, s)
    outline(ctx, s)
  }
}

/* ---------- Personnages ---------- */

function face(ctx, s, cx, cy, r, { beard = false } = {}) {
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, TAU)
  ctx.fillStyle = '#f0c8a0'
  ctx.fill()
  outline(ctx, s, 1.4)
  const hurt = s.extra?.hurt
  ctx.fillStyle = INK
  ctx.strokeStyle = INK
  ctx.lineWidth = 1.3 * (s.pixel ?? 1)
  // Les yeux regardent vers la catapulte (à gauche).
  for (const ex of [cx - r * 0.55, cx - r * 0.05]) {
    if (hurt) {
      ctx.beginPath()
      ctx.moveTo(ex - 2, cy - 2)
      ctx.lineTo(ex + 2, cy + 2)
      ctx.moveTo(ex + 2, cy - 2)
      ctx.lineTo(ex - 2, cy + 2)
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.arc(ex, cy - 1, 1.7, 0, TAU)
      ctx.fill()
    }
  }
  ctx.beginPath()
  if (hurt) ctx.arc(cx - r * 0.3, cy + r * 0.5, 2.2, 0, TAU)
  else ctx.arc(cx - r * 0.3, cy + r * 0.25, r * 0.35, 0.15 * Math.PI, 0.85 * Math.PI)
  ctx.stroke()
  if (beard) {
    ctx.beginPath()
    ctx.moveTo(cx - r, cy + r * 0.2)
    ctx.quadraticCurveTo(cx - r * 0.3, cy + r * 2.1, cx + r * 0.6, cy + r * 0.3)
    ctx.fillStyle = '#e9e4da'
    ctx.fill()
    outline(ctx, s, 1.2)
  }
}

function legs(ctx, s, color) {
  const { w, h } = s
  ctx.fillStyle = color
  for (const lx of [-w * 0.28, w * 0.04]) {
    ctx.beginPath()
    roundRect(ctx, lx, h * 0.28, w * 0.24, h * 0.22, 2)
    ctx.fill()
    outline(ctx, s, 1.2)
  }
}

/** Couleur de l'équipe du joueur 2 (face-à-face). */
const TEAM2 = '#3d7a3a'

function soldier(ctx, s) {
  const { w, h } = s
  legs(ctx, s, '#3b3346')
  // Tunique (tabard) aux couleurs du château (vert pour le joueur 2 en face-à-face).
  ctx.beginPath()
  roundRect(ctx, -w / 2, -h * 0.12, w, h * 0.44, 5)
  ctx.fillStyle = s.extra?.team === 2 ? TEAM2 : '#a3322b'
  ctx.fill()
  outline(ctx, s)
  ctx.fillStyle = '#d4a537'
  ctx.fillRect(-w * 0.06, -h * 0.08, w * 0.12, h * 0.36)
  ctx.fillRect(-w * 0.28, h * 0.02, w * 0.56, h * 0.07)
  face(ctx, s, 0, -h * 0.25, w * 0.34)
  // Chapeau de fer.
  ctx.beginPath()
  ctx.ellipse(0, -h * 0.36, w * 0.52, h * 0.06, 0, 0, TAU)
  ctx.fillStyle = '#8b93a0'
  ctx.fill()
  outline(ctx, s, 1.4)
  ctx.beginPath()
  ctx.arc(0, -h * 0.37, w * 0.3, Math.PI, 0)
  ctx.fill()
  outline(ctx, s, 1.4)
  // Lance.
  ctx.strokeStyle = '#6b4a2b'
  ctx.lineWidth = 2.4 * (s.pixel ?? 1)
  ctx.beginPath()
  ctx.moveTo(w * 0.55, h * 0.45)
  ctx.lineTo(w * 0.55, -h * 0.55)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(w * 0.55, -h * 0.68)
  ctx.lineTo(w * 0.47, -h * 0.54)
  ctx.lineTo(w * 0.63, -h * 0.54)
  ctx.closePath()
  ctx.fillStyle = '#c4cad3'
  ctx.fill()
  outline(ctx, s, 1)
}

function knight(ctx, s) {
  const { w, h } = s
  legs(ctx, s, '#7d8592')
  ctx.beginPath()
  roundRect(ctx, -w / 2, -h * 0.14, w, h * 0.46, 6)
  ctx.fillStyle = '#2f4b7c'
  ctx.fill()
  outline(ctx, s)
  // Écu doré.
  ctx.beginPath()
  ctx.moveTo(-w * 0.2, -h * 0.06)
  ctx.lineTo(w * 0.2, -h * 0.06)
  ctx.lineTo(w * 0.2, h * 0.08)
  ctx.quadraticCurveTo(0, h * 0.22, -w * 0.2, h * 0.08)
  ctx.closePath()
  ctx.fillStyle = '#d4a537'
  ctx.fill()
  outline(ctx, s, 1.1)
  // Heaume.
  ctx.beginPath()
  roundRect(ctx, -w * 0.36, -h * 0.5, w * 0.72, h * 0.38, 7)
  ctx.fillStyle = '#9aa2ae'
  ctx.fill()
  outline(ctx, s)
  ctx.fillStyle = INK
  ctx.fillRect(-w * 0.3, -h * 0.34, w * 0.5, h * 0.04)
  ctx.fillStyle = s.extra?.hurt ? '#a3322b' : '#f3e7c0'
  ctx.fillRect(-w * 0.26, -h * 0.335, w * 0.08, h * 0.03)
  ctx.fillRect(-w * 0.08, -h * 0.335, w * 0.08, h * 0.03)
  // Plumet.
  ctx.beginPath()
  ctx.ellipse(w * 0.1, -h * 0.56, w * 0.18, h * 0.07, -0.4, 0, TAU)
  ctx.fillStyle = s.extra?.team === 2 ? TEAM2 : '#a3322b'
  ctx.fill()
  outline(ctx, s, 1)
}

function king(ctx, s) {
  const { w, h } = s
  // Robe pourpre bordée d'hermine.
  ctx.beginPath()
  ctx.moveTo(-w * 0.42, -h * 0.12)
  ctx.lineTo(w * 0.42, -h * 0.12)
  ctx.lineTo(w * 0.52, h * 0.5)
  ctx.lineTo(-w * 0.52, h * 0.5)
  ctx.closePath()
  ctx.fillStyle = '#5b2a72'
  ctx.fill()
  outline(ctx, s)
  ctx.fillStyle = '#f4efe6'
  ctx.fillRect(-w * 0.5, h * 0.4, w, h * 0.09)
  ctx.fillRect(-w * 0.07, -h * 0.12, w * 0.14, h * 0.52)
  ctx.fillStyle = INK
  for (const x of [-0.35, -0.12, 0.12, 0.35]) ctx.fillRect(w * x, h * 0.43, 1.6, 2.6)
  face(ctx, s, 0, -h * 0.26, w * 0.32, { beard: true })
  // Couronne.
  ctx.beginPath()
  const cy = -h * 0.38
  ctx.moveTo(-w * 0.3, cy)
  ctx.lineTo(-w * 0.3, cy - h * 0.12)
  ctx.lineTo(-w * 0.15, cy - h * 0.05)
  ctx.lineTo(0, cy - h * 0.15)
  ctx.lineTo(w * 0.15, cy - h * 0.05)
  ctx.lineTo(w * 0.3, cy - h * 0.12)
  ctx.lineTo(w * 0.3, cy)
  ctx.closePath()
  ctx.fillStyle = '#e2b13c'
  ctx.fill()
  outline(ctx, s, 1.3)
  ctx.fillStyle = '#b2413a'
  ctx.beginPath()
  ctx.arc(0, cy - h * 0.04, 2.2, 0, TAU)
  ctx.fill()
}

/* ---------- Baril et projectiles ---------- */

function barrel(ctx, s) {
  const { w, h } = s
  ctx.beginPath()
  ctx.moveTo(-w * 0.42, -h / 2)
  ctx.quadraticCurveTo(-w * 0.58, 0, -w * 0.42, h / 2)
  ctx.lineTo(w * 0.42, h / 2)
  ctx.quadraticCurveTo(w * 0.58, 0, w * 0.42, -h / 2)
  ctx.closePath()
  ctx.fillStyle = materialPattern(ctx, 'wood')
  ctx.fill()
  ctx.fillStyle = 'rgba(120,40,20,0.35)'
  ctx.fill()
  scorch(ctx, s)
  cracks(ctx, s)
  ctx.beginPath()
  ctx.moveTo(-w * 0.42, -h / 2)
  ctx.quadraticCurveTo(-w * 0.58, 0, -w * 0.42, h / 2)
  ctx.lineTo(w * 0.42, h / 2)
  ctx.quadraticCurveTo(w * 0.58, 0, w * 0.42, -h / 2)
  ctx.closePath()
  outline(ctx, s)
  ctx.fillStyle = '#4b515b'
  for (const y of [-0.32, 0.26]) ctx.fillRect(-w * 0.52, h * y, w * 1.04, h * 0.08)
  // Pictogramme de danger : flamme dorée sur disque.
  ctx.beginPath()
  ctx.arc(0, 0, w * 0.22, 0, TAU)
  ctx.fillStyle = '#1e1a2b'
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(0, -w * 0.15)
  ctx.quadraticCurveTo(w * 0.14, 0, 0, w * 0.14)
  ctx.quadraticCurveTo(-w * 0.14, 0, 0, -w * 0.15)
  ctx.fillStyle = '#e9a23b'
  ctx.fill()
}

function ball(ctx, s, base, light) {
  const r = s.w / 2
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, TAU)
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r)
  g.addColorStop(0, light)
  g.addColorStop(1, base)
  ctx.fillStyle = g
  ctx.fill()
  outline(ctx, s)
}

const projectiles = {
  'projectile.stone': (ctx, s) => {
    ball(ctx, s, '#6f6a63', '#c9c3b7')
    ctx.fillStyle = 'rgba(30,26,43,0.25)'
    ctx.beginPath()
    ctx.arc(s.w * 0.12, s.w * 0.1, s.w * 0.1, 0, TAU)
    ctx.fill()
  },
  'projectile.boulder': (ctx, s) => {
    const r = s.w / 2
    const rnd = new SeededRandom(97)
    ctx.beginPath()
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU
      const rr = r * rnd.range(0.86, 1.02)
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
    }
    ctx.closePath()
    ctx.fillStyle = materialPattern(ctx, 'stone')
    ctx.fill()
    ctx.fillStyle = 'rgba(0,0,0,0.15)'
    ctx.fill()
    outline(ctx, s, 2.2)
  },
  'projectile.fire': (ctx, s) => {
    const r = s.w / 2
    ctx.beginPath()
    ctx.moveTo(-r * 0.5, -r * 0.8)
    ctx.lineTo(r * 0.5, -r * 0.8)
    ctx.quadraticCurveTo(r * 1.25, 0, r * 0.6, r)
    ctx.lineTo(-r * 0.6, r)
    ctx.quadraticCurveTo(-r * 1.25, 0, -r * 0.5, -r * 0.8)
    ctx.closePath()
    ctx.fillStyle = '#b8643a'
    ctx.fill()
    outline(ctx, s)
    ctx.fillStyle = '#7a3d22'
    ctx.fillRect(-r * 0.75, -r * 0.1, r * 1.5, r * 0.25)
    const t = (s.time ?? 0) / 90
    ctx.beginPath()
    ctx.moveTo(-r * 0.45, -r * 0.8)
    ctx.quadraticCurveTo(-r * 0.2, -r * (1.9 + Math.sin(t) * 0.25), 0, -r * 1.25)
    ctx.quadraticCurveTo(r * 0.25, -r * (2.1 + Math.cos(t) * 0.25), r * 0.45, -r * 0.8)
    ctx.fillStyle = '#ffb347'
    ctx.fill()
  },
  'projectile.bomb': (ctx, s) => {
    ball(ctx, s, '#22252c', '#6c7480')
    const r = s.w / 2
    ctx.strokeStyle = '#8a6a3c'
    ctx.lineWidth = 2 * (s.pixel ?? 1)
    ctx.beginPath()
    ctx.moveTo(r * 0.4, -r * 0.8)
    ctx.quadraticCurveTo(r * 0.9, -r * 1.4, r * 0.6, -r * 1.6)
    ctx.stroke()
    const flick = 0.7 + 0.3 * Math.sin((s.time ?? 0) / 40)
    ctx.beginPath()
    ctx.arc(r * 0.6, -r * 1.65, 3.4 * flick, 0, TAU)
    ctx.fillStyle = '#ffd36b'
    ctx.fill()
  },
  'projectile.split': (ctx, s) => {
    const r = s.w / 2
    for (const [x, y] of [[-r * 0.42, r * 0.25], [r * 0.42, r * 0.25], [0, -r * 0.42]]) {
      ctx.save()
      ctx.translate(x, y)
      ball(ctx, { ...s, w: r * 1.15 }, '#5b5750', '#bdb6a8')
      ctx.restore()
    }
    ctx.strokeStyle = '#8a6a3c'
    ctx.lineWidth = 1.6 * (s.pixel ?? 1)
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.75, 0, TAU)
    ctx.stroke()
  },
}

/* ---------- Catapulte ---------- */

/**
 * Catapulte (mangonneau). Repère : origine au centre de la base, au sol.
 * `extra.armAngle` : angle du bras (radians, repère écran) ;
 * `extra.load` : clé du projectile chargé dans le godet (ou null).
 */
export const CATAPULT_GEOMETRY = Object.freeze({ pivotX: 6, pivotY: -78, armLength: 118 })

/**
 * Apparences de catapulte (atelier) : teinte posée sur le bois, ferrures,
 * couleur du fanion. `oak` = bois naturel, sans fanion.
 */
export const CATAPULT_SKINS = Object.freeze({
  oak: { tint: null, metal: '#4b515b', flag: null },
  royal: { tint: 'rgba(47,75,124,0.32)', metal: '#d4a537', flag: '#2f4b7c' },
  ebony: { tint: 'rgba(20,16,30,0.5)', metal: '#b9b3a6', flag: '#1e1a2b' },
  dragon: { tint: 'rgba(163,50,43,0.32)', metal: '#ffb347', flag: '#a3322b' },
})

function catapult(ctx, s) {
  const { armAngle = Math.PI - 0.25, load = null, loadRadius = 16, registry = null, skin = 'oak', flag = null } = s.extra ?? {}
  const look = CATAPULT_SKINS[skin] || CATAPULT_SKINS.oak
  const baseWood = materialPattern(ctx, 'wood')
  // Bois teinté selon l'apparence : on remplit puis on voile chaque pièce.
  const wood = baseWood
  const tintFill = () => {
    if (!look.tint) return
    ctx.fillStyle = look.tint
    ctx.fill()
  }
  const banner = flag || look.flag
  const { pivotX, pivotY, armLength } = CATAPULT_GEOMETRY
  // Châssis.
  ctx.beginPath()
  roundRect(ctx, -86, -30, 172, 16, 3)
  ctx.fillStyle = wood
  ctx.fill()
  tintFill()
  outline(ctx, s)
  // Montants en A.
  for (const [x1, x2] of [[-40, pivotX], [52, pivotX]]) {
    ctx.beginPath()
    ctx.moveTo(x1 - 6, -26)
    ctx.lineTo(x2 - 5, pivotY)
    ctx.lineTo(x2 + 5, pivotY)
    ctx.lineTo(x1 + 6, -26)
    ctx.closePath()
    ctx.fillStyle = wood
    ctx.fill()
    tintFill()
    outline(ctx, s)
  }
  // Traverse d'arrêt.
  ctx.beginPath()
  roundRect(ctx, pivotX + 26, -128, 12, 100, 3)
  ctx.fillStyle = wood
  ctx.fill()
  tintFill()
  outline(ctx, s)
  ctx.beginPath()
  roundRect(ctx, pivotX + 14, -134, 36, 12, 3)
  ctx.fillStyle = '#8a5a2b'
  ctx.fill()
  outline(ctx, s)
  // Bras + godet.
  ctx.save()
  ctx.translate(pivotX, pivotY)
  ctx.rotate(armAngle)
  ctx.beginPath()
  roundRect(ctx, -14, -6, armLength + 14, 12, 4)
  ctx.fillStyle = wood
  ctx.fill()
  tintFill()
  outline(ctx, s)
  ctx.beginPath()
  ctx.ellipse(armLength, -10, 18, 11, 0, 0, TAU)
  ctx.fillStyle = '#6b4a2b'
  ctx.fill()
  outline(ctx, s)
  if (load && registry) {
    ctx.save()
    ctx.translate(armLength, -14)
    ctx.rotate(-armAngle)
    registry.draw(ctx, load, { w: loadRadius * 2, h: loadRadius * 2, pixel: s.pixel, time: s.time })
    ctx.restore()
  }
  ctx.restore()
  // Fanion (apparence ou couleur du joueur en face-à-face).
  if (banner) {
    const px = pivotX + 32
    ctx.strokeStyle = INK
    ctx.lineWidth = 2 * (s.pixel ?? 1)
    ctx.beginPath()
    ctx.moveTo(px, -134)
    ctx.lineTo(px, -178)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(px, -178)
    ctx.lineTo(px - 30, -170)
    ctx.lineTo(px, -160)
    ctx.closePath()
    ctx.fillStyle = banner
    ctx.fill()
    outline(ctx, s)
  }
  // Moyeu.
  ctx.beginPath()
  ctx.arc(pivotX, pivotY, 7, 0, TAU)
  ctx.fillStyle = look.metal
  ctx.fill()
  outline(ctx, s)
  // Roues.
  for (const x of [-58, 58]) {
    ctx.beginPath()
    ctx.arc(x, -12, 18, 0, TAU)
    ctx.fillStyle = '#7a5230'
    ctx.fill()
    outline(ctx, s)
    ctx.strokeStyle = INK
    ctx.lineWidth = 1.4 * (s.pixel ?? 1)
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI
      ctx.beginPath()
      ctx.moveTo(x + Math.cos(a) * 16, -12 + Math.sin(a) * 16)
      ctx.lineTo(x - Math.cos(a) * 16, -12 - Math.sin(a) * 16)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.arc(x, -12, 4, 0, TAU)
    ctx.fillStyle = '#4b515b'
    ctx.fill()
  }
}

/* ---------- Trébuchet ---------- */

/**
 * Trébuchet à contrepoids. Repère : origine au pied de l'engin, au sol, x vers l'avant.
 * `extra.theta` : angle du grand bras (radians, repère écran) ;
 * `extra.sling` : extrémité de la fronde (repère local) ou null si la fronde est vide ;
 * `extra.load`  : clé du projectile dans la fronde (ou null).
 */
function trebuchet(ctx, s) {
  const { theta = Math.PI * 0.8, sling = null, load = null, loadRadius = 14, registry = null, skin = 'oak', flag = null } = s.extra ?? {}
  const look = CATAPULT_SKINS[skin] || CATAPULT_SKINS.oak
  const wood = materialPattern(ctx, 'wood')
  const px = s.pixel ?? 1
  const { pivotY, armLong, armShort, sling: slingLen } = TREBUCHET_GEOMETRY
  const piece = (draw, fill = wood) => {
    ctx.beginPath()
    draw()
    ctx.fillStyle = fill
    ctx.fill()
    if (look.tint && fill === wood) {
      ctx.fillStyle = look.tint
      ctx.fill()
    }
    outline(ctx, s)
  }
  const beam = (x1, y1, x2, y2, w) => {
    const a = Math.atan2(y2 - y1, x2 - x1)
    const nx = (-Math.sin(a) * w) / 2
    const ny = (Math.cos(a) * w) / 2
    piece(() => {
      ctx.moveTo(x1 + nx, y1 + ny)
      ctx.lineTo(x2 + nx, y2 + ny)
      ctx.lineTo(x2 - nx, y2 - ny)
      ctx.lineTo(x1 - nx, y1 - ny)
      ctx.closePath()
    })
  }
  // Auge (le projectile y glisse avant de décoller) et socle.
  piece(() => roundRect(ctx, -70, -10, 200, 10, 2), '#6b4a2b')
  piece(() => roundRect(ctx, -120, -26, 240, 18, 3))
  // Montants en A et jambes de force.
  beam(-92, -20, -6, pivotY + 4, 14)
  beam(92, -20, 6, pivotY + 4, 14)
  beam(-60, -70, 60, -70, 10)
  beam(-14, -20, -4, pivotY + 8, 12)
  // Grand bras (côté fronde) et petit bras (côté contrepoids), d'une seule poutre effilée.
  const c = Math.cos(theta)
  const sn = Math.sin(theta)
  const tip = { x: armLong * c, y: pivotY + armLong * sn }
  const cw = { x: -armShort * c, y: pivotY - armShort * sn }
  piece(() => {
    const nx = -sn
    const ny = c
    ctx.moveTo(cw.x + nx * 9, cw.y + ny * 9)
    ctx.lineTo(tip.x + nx * 4, tip.y + ny * 4)
    ctx.lineTo(tip.x - nx * 4, tip.y - ny * 4)
    ctx.lineTo(cw.x - nx * 9, cw.y - ny * 9)
    ctx.closePath()
  })
  // Contrepoids : caisse cerclée de fer, suspendue (elle reste verticale).
  ctx.strokeStyle = INK
  ctx.lineWidth = 2.4 * px
  ctx.beginPath()
  ctx.moveTo(cw.x - 14, cw.y)
  ctx.lineTo(cw.x - 22, cw.y + 22)
  ctx.moveTo(cw.x + 14, cw.y)
  ctx.lineTo(cw.x + 22, cw.y + 22)
  ctx.stroke()
  piece(() => roundRect(ctx, cw.x - 32, cw.y + 20, 64, 52, 5), '#6f6a63')
  ctx.fillStyle = look.metal
  ctx.fillRect(cw.x - 32, cw.y + 30, 64, 5)
  ctx.fillRect(cw.x - 32, cw.y + 56, 64, 5)
  // Fronde : deux cordes jusqu'à la poche (pleine), ou pendante (vide).
  const end = sling ?? { x: tip.x + 6, y: tip.y + slingLen * 0.96 }
  ctx.strokeStyle = '#4a3a28'
  ctx.lineWidth = 2 * px
  ctx.beginPath()
  ctx.moveTo(tip.x, tip.y)
  ctx.lineTo(end.x, end.y)
  ctx.stroke()
  if (sling && load && registry) {
    ctx.save()
    ctx.translate(end.x, end.y)
    registry.draw(ctx, load, { w: loadRadius * 2, h: loadRadius * 2, pixel: px, time: s.time })
    ctx.restore()
  }
  ctx.beginPath()
  ctx.ellipse(end.x, end.y + (sling ? loadRadius * 0.55 : 0), loadRadius * 0.9, loadRadius * 0.45, 0, 0, TAU)
  ctx.fillStyle = '#7a5a3a'
  ctx.fill()
  outline(ctx, s, 1.4)
  // Axe et crochet de lâcher.
  ctx.beginPath()
  ctx.arc(0, pivotY, 8, 0, TAU)
  ctx.fillStyle = look.metal
  ctx.fill()
  outline(ctx, s)
  ctx.beginPath()
  ctx.arc(tip.x, tip.y, 4, 0, TAU)
  ctx.fillStyle = look.metal
  ctx.fill()
  // Fanion (apparence ou couleur du joueur).
  const banner = flag || look.flag
  if (banner) {
    ctx.strokeStyle = INK
    ctx.lineWidth = 2 * px
    ctx.beginPath()
    ctx.moveTo(-100, -26)
    ctx.lineTo(-100, -96)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-100, -96)
    ctx.lineTo(-70, -88)
    ctx.lineTo(-100, -78)
    ctx.closePath()
    ctx.fillStyle = banner
    ctx.fill()
    outline(ctx, s)
  }
  // Roues pleines du socle.
  for (const x of [-84, 84]) {
    ctx.beginPath()
    ctx.arc(x, -10, 13, 0, TAU)
    ctx.fillStyle = '#7a5230'
    ctx.fill()
    outline(ctx, s)
    ctx.beginPath()
    ctx.arc(x, -10, 3.5, 0, TAU)
    ctx.fillStyle = look.metal
    ctx.fill()
  }
}

/* ---------- Décor de saison (v4.0) ---------- */

/** Citrouille sculptée, posée au sol (origine au pied), lueur de bougie. */
function pumpkin(ctx, s) {
  const w = s.w
  const h = s.h
  const px = s.pixel ?? 1
  for (const [dx, sc] of [[-w * 0.22, 0.8], [w * 0.22, 0.8], [0, 1]]) {
    ctx.beginPath()
    ctx.ellipse(dx, -h / 2, (w / 2.6) * sc, h / 2, 0, 0, TAU)
    ctx.fillStyle = sc === 1 ? '#e8731c' : '#cf5f12'
    ctx.fill()
    outline(ctx, s, 1.6)
  }
  ctx.fillStyle = '#4f6b3a'
  ctx.fillRect(-2.5, -h - 6, 5, 8)
  // Visage éclairé de l'intérieur.
  const flick = 0.75 + 0.25 * Math.sin((s.time ?? 0) / 120)
  ctx.fillStyle = `rgba(255, 214, 102, ${flick})`
  ctx.beginPath()
  ctx.moveTo(-w * 0.2, -h * 0.62)
  ctx.lineTo(-w * 0.1, -h * 0.75)
  ctx.lineTo(-w * 0.02, -h * 0.62)
  ctx.moveTo(w * 0.02, -h * 0.62)
  ctx.lineTo(w * 0.1, -h * 0.75)
  ctx.lineTo(w * 0.2, -h * 0.62)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(-w * 0.24, -h * 0.4)
  ctx.quadraticCurveTo(0, -h * 0.18, w * 0.24, -h * 0.4)
  ctx.quadraticCurveTo(0, -h * 0.3, -w * 0.24, -h * 0.4)
  ctx.fill()
  ctx.lineWidth = 1 * px
}

/** Neige au sol (repère monde). */
function snowcap(ctx) {
  const y = WORLD.GROUND_Y
  ctx.fillStyle = '#f4f8fc'
  ctx.beginPath()
  ctx.moveTo(-1500, y + 6)
  for (let x = -1500; x <= WORLD.WIDTH + 1500; x += 60) ctx.lineTo(x + 30, y - 6 - ((x / 60) % 3) * 2)
  ctx.lineTo(WORLD.WIDTH + 1500, y + 6)
  ctx.closePath()
  ctx.fill()
}

/* ---------- Décor ---------- */

/** Ciel (repère écran) : dégradé, astre, nuages qui dérivent. */
function sky(ctx, s) {
  const { theme = 1, viewW, viewH, time = 0, animate = true, wind = 0 } = s.extra
  const th = THEMES[theme]
  const g = ctx.createLinearGradient(0, 0, 0, viewH)
  g.addColorStop(0, th.skyTop)
  g.addColorStop(1, th.skyBottom)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, viewW, viewH)
  const sx = viewW * (theme === 3 ? 0.78 : 0.82)
  const sy = viewH * (theme === 3 ? 0.42 : 0.18)
  const sr = Math.max(18, viewH * 0.06)
  const halo = ctx.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * 4)
  halo.addColorStop(0, th.sun + 'aa')
  halo.addColorStop(1, th.sun + '00')
  ctx.fillStyle = halo
  ctx.fillRect(sx - sr * 4, sy - sr * 4, sr * 8, sr * 8)
  ctx.beginPath()
  ctx.arc(sx, sy, sr, 0, TAU)
  ctx.fillStyle = th.sun
  ctx.fill()
  if (th.night) {
    const r = new SeededRandom(4)
    ctx.fillStyle = '#ffffff'
    for (let i = 0; i < 70; i++) {
      ctx.globalAlpha = r.range(0.3, 0.9)
      ctx.fillRect(r.range(0, viewW), r.range(0, viewH * 0.6), 1.5, 1.5)
    }
    ctx.globalAlpha = 1
    ctx.beginPath()
    ctx.arc(sx + sr * 0.35, sy - sr * 0.15, sr * 0.85, 0, TAU)
    ctx.fillStyle = th.skyTop
    ctx.fill()
  }
  weather(ctx, th, viewW, viewH, animate ? time : 0)
  // Brume claire à l'horizon : profondeur atmosphérique.
  const haze = ctx.createLinearGradient(0, viewH * 0.45, 0, viewH)
  haze.addColorStop(0, th.skyBottom + '00')
  haze.addColorStop(1, th.skyBottom + (th.night ? '33' : '88'))
  ctx.fillStyle = haze
  ctx.fillRect(0, viewH * 0.45, viewW, viewH * 0.55)
  const r = new SeededRandom(11 + theme)
  const light = th.night ? 'rgba(200,210,255,0.10)' : th.weather === 'rain' ? 'rgba(110,118,135,0.75)' : 'rgba(255,255,255,0.82)'
  const shade = th.night ? 'rgba(120,130,180,0.08)' : th.weather === 'rain' ? 'rgba(60,66,80,0.6)' : 'rgba(170,185,210,0.45)'
  for (let i = 0; i < 7; i++) {
    // Les nuages suivent le vent : sens et vitesse (brise lente par temps calme).
    const speed = r.range(0.004, 0.012) * (wind === 0 ? 1 : Math.sign(wind) * (0.6 + 4 * Math.abs(wind)))
    const span = viewW + 300
    const cx = ((((r.range(0, span) + (animate ? time * speed : 0)) % span) + span) % span) - 150
    const cy = r.range(viewH * 0.06, viewH * 0.4)
    const cw = r.range(60, 150) * (viewH / 600)
    const puffs = Array.from({ length: 5 }, (_, k) => [cx + (k - 2) * cw * 0.28, cy - Math.sin((k / 4) * Math.PI) * cw * 0.16, cw * (0.2 + 0.1 * Math.sin((k / 4) * Math.PI))])
    // Dessous ombré, puis dessus éclairé, légèrement décalé vers le haut.
    ctx.fillStyle = shade
    for (const [x, y, rr] of puffs) {
      ctx.beginPath()
      ctx.ellipse(x, y + rr * 0.25, rr * 1.15, rr * 0.75, 0, 0, TAU)
      ctx.fill()
    }
    ctx.fillStyle = light
    for (const [x, y, rr] of puffs) {
      ctx.beginPath()
      ctx.ellipse(x, y - rr * 0.08, rr * 1.05, rr * 0.68, 0, 0, TAU)
      ctx.fill()
    }
  }
  // Oiseaux au loin (jour, sans pluie) : quelques « v » qui battent des ailes.
  if (!th.night && th.weather !== 'rain' && animate !== false) {
    ctx.strokeStyle = 'rgba(40,38,52,0.55)'
    ctx.lineWidth = Math.max(1.2, viewH / 500)
    ctx.lineCap = 'round'
    const span = viewW + 400
    for (let i = 0; i < 4; i++) {
      const bx = ((r.range(0, span) + time * r.range(0.02, 0.04)) % span) - 200
      const by = r.range(viewH * 0.12, viewH * 0.32) + Math.sin(time / 900 + i) * 6
      const flap = Math.sin(time / 110 + i * 1.7) * 0.6
      const w = r.range(6, 10) * (viewH / 600)
      ctx.beginPath()
      ctx.moveTo(bx - w, by - w * flap)
      ctx.quadraticCurveTo(bx - w * 0.4, by - w * 0.3, bx, by)
      ctx.quadraticCurveTo(bx + w * 0.4, by - w * 0.3, bx + w, by - w * flap)
      ctx.stroke()
    }
  }
}

/**
 * Météo (repère écran) : neige qui tombe, pluie oblique, brume au ras du sol.
 * Purement décoratif ; figée si les animations sont réduites (time = 0).
 */
function weather(ctx, th, viewW, viewH, time) {
  if (!th.weather) return
  const r = new SeededRandom(77)
  if (th.weather === 'snow') {
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    for (let i = 0; i < 90; i++) {
      const x = (r.range(0, viewW) + Math.sin(time / 900 + i) * 12) % viewW
      const y = (r.range(0, viewH) + time * r.range(0.02, 0.05)) % viewH
      ctx.beginPath()
      ctx.arc(x, y, r.range(1, 2.6), 0, TAU)
      ctx.fill()
    }
  } else if (th.weather === 'rain') {
    ctx.strokeStyle = 'rgba(200,215,235,0.35)'
    ctx.lineWidth = 1.2
    for (let i = 0; i < 120; i++) {
      const x = (r.range(0, viewW + 200) - time * 0.15) % (viewW + 200)
      const y = (r.range(0, viewH) + time * r.range(0.5, 0.8)) % viewH
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x - 6, y + 16)
      ctx.stroke()
    }
  } else if (th.weather === 'fog') {
    const g = ctx.createLinearGradient(0, viewH * 0.45, 0, viewH)
    g.addColorStop(0, 'rgba(235,240,225,0)')
    g.addColorStop(1, 'rgba(235,240,225,0.35)')
    ctx.fillStyle = g
    ctx.fillRect(0, viewH * 0.45, viewW, viewH * 0.55)
  }
}

/** Lointain (repère monde, parallaxe) : collines et silhouette de château. */
function far(ctx, s) {
  const { theme = 1, castle = true } = s.extra
  const th = THEMES[theme]
  const r = new SeededRandom(23 + theme)
  const left = -1200
  const right = WORLD.WIDTH + 1600
  const base = WORLD.GROUND_Y
  const layers = th.peaks ? [[th.farDark, 620, 260], [th.far, 300, 150]] : [[th.farDark, 330, 170], [th.far, 210, 120]]
  layers.forEach(([color, height, step], li) => {
    const pts = []
    for (let x = left; x <= right; x += step) pts.push([x, base - height * r.range(0.45, 1)])
    ctx.beginPath()
    ctx.moveTo(left, base)
    for (const [x, y] of pts) ctx.lineTo(x, y)
    ctx.lineTo(right, base)
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()
    // Montagnes : sommets enneigés.
    if (th.peaks && height > 400) {
      ctx.fillStyle = 'rgba(245,248,252,0.9)'
      for (const [x, y] of pts) {
        if (base - y < height * 0.75) continue
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x - step * 0.22, y + 70)
        ctx.lineTo(x + step * 0.22, y + 70)
        ctx.closePath()
        ctx.fill()
      }
    }
    // Voile de brume sur la couche du fond : elle recule.
    if (li === 0) {
      const v = ctx.createLinearGradient(0, base - height, 0, base)
      v.addColorStop(0, th.skyBottom + '00')
      v.addColorStop(1, th.skyBottom + (th.night ? '22' : '55'))
      ctx.fillStyle = v
      ctx.fillRect(left, base - height, right - left, height)
    }
    // Rangée d'arbres sur la couche proche (sauf désert et neige).
    if (li === layers.length - 1 && !th.arid) {
      ctx.fillStyle = th.farDark
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, y0] = pts[i]
        const [x1, y1] = pts[i + 1]
        for (let k = 0; k < 3; k++) {
          const f = r.range(0.1, 0.9)
          const tx = x0 + (x1 - x0) * f
          const ty = y0 + (y1 - y0) * f
          const tr = r.range(10, 18)
          if (th.peaks || th.weather === 'fog') {
            ctx.beginPath()
            ctx.moveTo(tx, ty - tr * 2.6)
            ctx.lineTo(tx - tr, ty + 4)
            ctx.lineTo(tx + tr, ty + 4)
            ctx.closePath()
            ctx.fill()
          } else {
            ctx.beginPath()
            ctx.arc(tx, ty - tr * 0.6, tr, 0, TAU)
            ctx.arc(tx + tr * 0.7, ty - tr * 0.2, tr * 0.75, 0, TAU)
            ctx.fill()
          }
        }
      }
    }
  })
  // Château lointain sur une colline (masqué en face-à-face : il prêterait à confusion).
  if (!castle) return
  const cx = 1450
  const cy = base - 250
  ctx.fillStyle = th.castle
  ctx.fillRect(cx - 120, cy, 240, 90)
  for (const [tx, tw, th2] of [[-130, 40, 120], [90, 40, 120], [-25, 50, 170]]) {
    ctx.fillRect(cx + tx, cy - th2 + 90, tw, th2)
    for (let k = 0; k < tw; k += 14) ctx.fillRect(cx + tx + k, cy - th2 + 80, 8, 12)
    ctx.beginPath()
    ctx.moveTo(cx + tx - 4, cy - th2 + 80)
    ctx.lineTo(cx + tx + tw / 2, cy - th2 + 30)
    ctx.lineTo(cx + tx + tw + 4, cy - th2 + 80)
    ctx.fill()
  }
  if (th.night) {
    ctx.fillStyle = '#ffcf6b'
    for (const [wx, wy] of [[-110, 30], [100, 20], [-12, -40], [10, 10], [40, 40]]) ctx.fillRect(cx + wx, cy + wy, 6, 10)
  }
}

/** Sol (repère monde) : terre, herbe, cailloux et fleurs. */
function ground(ctx, s) {
  const { theme = 1 } = s.extra
  const th = THEMES[theme]
  const y = WORLD.GROUND_Y
  const left = -1500
  const right = WORLD.WIDTH + 1500
  const g = ctx.createLinearGradient(0, y, 0, y + 400)
  g.addColorStop(0, th.dirt)
  g.addColorStop(1, '#2a2019')
  ctx.fillStyle = g
  ctx.fillRect(left, y, right - left, 900)
  // Couches de terre plus sombres en profondeur, et la lisière d'herbe qui projette son ombre.
  ctx.fillStyle = 'rgba(0,0,0,0.12)'
  ctx.fillRect(left, y + 12, right - left, 10)
  const r = new SeededRandom(5)
  ctx.strokeStyle = 'rgba(255,240,210,0.07)'
  ctx.lineWidth = 3
  for (let band = 0; band < 3; band++) {
    ctx.beginPath()
    const by = y + 60 + band * 70
    ctx.moveTo(left, by)
    for (let x = left; x <= right; x += 140) ctx.lineTo(x, by + r.range(-8, 8))
    ctx.stroke()
  }
  ctx.fillStyle = th.grass
  ctx.fillRect(left, y - 4, right - left, 16)
  // Brins d'herbe en deux tons (clair devant, foncé derrière).
  const dark = 'rgba(0,0,0,0.22)'
  for (let pass = 0; pass < 2; pass++) {
    ctx.fillStyle = pass === 0 ? th.grass : th.grass
    for (let x = left + pass * 4; x < right; x += 9) {
      const hh = r.range(5, 13) * (pass === 0 ? 1.15 : 0.85)
      ctx.beginPath()
      ctx.moveTo(x, y + 2)
      ctx.lineTo(x + 3 + r.range(-1.5, 1.5), y - hh)
      ctx.lineTo(x + 6, y + 2)
      ctx.fill()
      if (pass === 0) {
        ctx.fillStyle = dark
        ctx.fill()
        ctx.fillStyle = th.grass
      }
    }
  }
  ctx.fillStyle = 'rgba(255,255,230,0.18)'
  ctx.fillRect(left, y - 4, right - left, 3)
  for (let i = 0; i < 90; i++) {
    const x = r.range(left, right)
    const yy = y + r.range(24, 140)
    ctx.fillStyle = `rgba(20,15,10,${r.range(0.15, 0.35)})`
    ctx.beginPath()
    ctx.ellipse(x, yy, r.range(4, 12), r.range(2, 6), 0, 0, TAU)
    ctx.fill()
  }
  if (!th.night && !th.arid) {
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = r.pick(['#f4efe6', '#e2b13c', '#c55b8a'])
      ctx.beginPath()
      ctx.arc(r.range(left, right), y - r.range(2, 8), 2.2, 0, TAU)
      ctx.fill()
    }
  }
  ctx.strokeStyle = 'rgba(30,26,43,0.5)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(left, y + 12)
  ctx.lineTo(right, y + 12)
  ctx.stroke()
}

/** Registre clé → fonction de dessin. */
export const PAINTERS = Object.freeze({
  'block.straw': blockPainter('straw'),
  'block.wood': blockPainter('wood'),
  'block.glass': blockPainter('glass'),
  'block.stone': blockPainter('stone'),
  'block.iron': blockPainter('iron'),
  'block.brick': blockPainter('brick'),
  'block.sandstone': blockPainter('sandstone'),
  'block.ice': blockPainter('ice'),
  'block.marble': blockPainter('marble'),
  'target.soldier': soldier,
  'target.knight': knight,
  'target.king': king,
  barrel,
  ...projectiles,
  catapult,
  trebuchet,
  'deco.pumpkin': pumpkin,
  'deco.snow': snowcap,
  'scene.sky': sky,
  'scene.far': far,
  'scene.ground': ground,
})
