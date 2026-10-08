/**
 * Personnages réalistes (v4.4) : soldat, chevalier, roi.
 *
 * Chaque personnage existe en trois états (repos, clignement, blessé) et deux
 * couleurs d'équipe, dessinés en détail une fois puis gardés en cache à la
 * résolution utile. À chaque image ne s'ajoutent que des transformations
 * légères : respiration, clignement d'yeux à intervalles irréguliers,
 * tremblement quand le personnage est touché.
 *
 * Les personnages regardent vers la gauche (vers l'engin du joueur).
 * Repère : centre du corps physique ; les pieds sont à y = +h/2.
 */
import { TAU, tone, roundRect, edge, lightOver, metalGradient, rivet, mailPattern, woodPattern, stitches, cached } from './realism.js'

const TEAM = {
  1: { cloth: '#9e2b25', light: '#c9483d', dark: '#5e1512' },
  2: { cloth: '#3a7436', light: '#5a9a50', dark: '#1f421d' },
}
const STEEL = '#8e96a3'
const GOLD = '#d2a53a'

/* ---------- Pièces communes ---------- */

/** Tissu : aplat + plis verticaux + volume. */
function cloth(g, base, x0, y0, x1, y1, folds = 4) {
  g.fillStyle = base
  g.fill()
  const gr = g.createLinearGradient(x0, 0, x1, 0)
  for (let i = 0; i <= folds * 2; i++) {
    const u = i / (folds * 2)
    gr.addColorStop(u, i % 2 ? 'rgba(255,240,225,0.10)' : 'rgba(0,0,0,0.16)')
  }
  g.fillStyle = gr
  g.fill()
  lightOver(g, x0, y0, x1, y1, 0.22, 0.42)
}

/** Membre (manche, jambe) : trait épais ombré suivant un chemin. */
function limb(g, pts, width, base, { shade = true } = {}) {
  const path = () => {
    g.beginPath()
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
  }
  g.lineCap = 'round'
  g.lineJoin = 'round'
  path()
  g.lineWidth = width + 1
  g.strokeStyle = 'rgba(30,20,16,0.9)'
  g.stroke()
  path()
  g.lineWidth = width
  g.strokeStyle = base
  g.stroke()
  if (shade) {
    path()
    g.lineWidth = width * 0.35
    g.strokeStyle = 'rgba(255,240,220,0.18)'
    g.save()
    g.translate(-width * 0.18, -width * 0.1)
    g.stroke()
    g.restore()
  }
}

function hand(g, x, y, r = 1.8) {
  const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.4, 0.2, x, y, r)
  gr.addColorStop(0, '#f2cfae')
  gr.addColorStop(1, '#a8704c')
  g.beginPath()
  g.ellipse(x, y, r, r * 0.9, 0, 0, TAU)
  g.fillStyle = gr
  g.fill()
  edge(g, 0.5)
}

function boot(g, x, y, toward = -1) {
  g.beginPath()
  g.moveTo(x - 2.6, y - 6)
  g.lineTo(x + 2.6, y - 6)
  g.lineTo(x + 2.8, y)
  g.lineTo(x + toward * 4.2, y)
  g.quadraticCurveTo(x + toward * 4.6, y - 2.4, x - 2.6 * -toward, y - 3)
  g.closePath()
  g.fillStyle = '#4a2f1c'
  g.fill()
  lightOver(g, x - 4, y - 6, x + 4, y, 0.3, 0.45)
  edge(g, 0.55)
}

/**
 * Tête de profil trois-quarts tournée vers la gauche.
 * state : 'idle' | 'blink' | 'hurt'.
 */
function head(g, cx, cy, r, state, { old = false, stubble = true } = {}) {
  // Oreille.
  g.beginPath()
  g.ellipse(cx + r * 0.62, cy + r * 0.05, r * 0.2, r * 0.3, 0.2, 0, TAU)
  g.fillStyle = '#c98f69'
  g.fill()
  edge(g, 0.45)
  // Visage.
  g.beginPath()
  g.ellipse(cx, cy, r * 0.86, r, 0, 0, TAU)
  const skin = g.createRadialGradient(cx - r * 0.4, cy - r * 0.35, r * 0.1, cx, cy, r * 1.1)
  skin.addColorStop(0, old ? '#f3d2b6' : '#f6d4b0')
  skin.addColorStop(0.55, old ? '#dca88a' : '#e0aa82')
  skin.addColorStop(1, '#9c6646')
  g.fillStyle = skin
  g.fill()
  // Joues.
  const blush = g.createRadialGradient(cx - r * 0.42, cy + r * 0.3, 0, cx - r * 0.42, cy + r * 0.3, r * 0.42)
  blush.addColorStop(0, state === 'hurt' ? 'rgba(214,70,60,0.55)' : 'rgba(214,105,85,0.3)')
  blush.addColorStop(1, 'rgba(214,105,85,0)')
  g.fillStyle = blush
  g.fill()
  // Barbe naissante (points déterministes sur la mâchoire).
  if (stubble) {
    g.fillStyle = 'rgba(70,45,30,0.35)'
    for (let i = 0; i < 26; i++) {
      const a = 0.25 * Math.PI + (i / 26) * 0.75 * Math.PI
      const rr = r * (0.62 + ((i * 7) % 5) * 0.06)
      g.fillRect(cx + Math.cos(a) * rr * 0.86 - 0.15, cy + Math.sin(a) * rr - 0.15, 0.32, 0.32)
    }
  }
  g.beginPath()
  g.ellipse(cx, cy, r * 0.86, r, 0, 0, TAU)
  edge(g, 0.6)
  // Rides (vieillard).
  if (old) {
    g.strokeStyle = 'rgba(110,60,40,0.45)'
    g.lineWidth = 0.3
    for (const dy of [-0.55, -0.42]) {
      g.beginPath()
      g.moveTo(cx - r * 0.55, cy + r * dy)
      g.quadraticCurveTo(cx - r * 0.1, cy + r * (dy - 0.06), cx + r * 0.3, cy + r * dy)
      g.stroke()
    }
  }
  // Yeux, sourcils.
  const eyes = [cx - r * 0.5, cx - r * 0.02]
  g.lineCap = 'round'
  for (const [i, ex] of eyes.entries()) {
    const ey = cy - r * 0.08
    const ew = r * (i ? 0.2 : 0.17)
    // Sourcil.
    g.beginPath()
    if (state === 'hurt') {
      g.moveTo(ex - ew, ey - r * 0.36 + (i ? -0.2 : 0.4))
      g.lineTo(ex + ew, ey - r * 0.36 + (i ? 0.4 : -0.2))
    } else {
      g.moveTo(ex - ew * 1.1, ey - r * 0.26)
      g.quadraticCurveTo(ex, ey - r * 0.4, ex + ew * 1.1, ey - r * 0.3)
    }
    g.lineWidth = r * 0.1
    g.strokeStyle = old ? '#d9d4cb' : '#4a2e1c'
    g.stroke()
    if (state === 'idle') {
      g.beginPath()
      g.ellipse(ex, ey, ew, r * 0.12, 0, 0, TAU)
      g.fillStyle = '#f1ebe0'
      g.fill()
      g.save()
      g.clip()
      g.beginPath()
      g.arc(ex - ew * 0.35, ey + r * 0.01, r * 0.1, 0, TAU)
      g.fillStyle = '#3d2a1a'
      g.fill()
      g.beginPath()
      g.arc(ex - ew * 0.35, ey + r * 0.01, r * 0.05, 0, TAU)
      g.fillStyle = '#0d0907'
      g.fill()
      g.fillStyle = 'rgba(0,0,0,0.25)'
      g.fillRect(ex - ew, ey - r * 0.12, ew * 2, r * 0.06)
      g.restore()
      g.beginPath()
      g.arc(ex - ew * 0.5, ey - r * 0.04, r * 0.03, 0, TAU)
      g.fillStyle = 'rgba(255,255,255,0.95)'
      g.fill()
      // Paupière supérieure.
      g.beginPath()
      g.ellipse(ex, ey, ew, r * 0.12, 0, Math.PI * 1.05, Math.PI * 1.95)
      g.lineWidth = r * 0.06
      g.strokeStyle = '#3b2418'
      g.stroke()
    } else if (state === 'blink') {
      g.beginPath()
      g.moveTo(ex - ew, ey)
      g.quadraticCurveTo(ex, ey + r * 0.07, ex + ew, ey)
      g.lineWidth = r * 0.06
      g.strokeStyle = '#3b2418'
      g.stroke()
    } else {
      // Yeux plissés de douleur.
      g.beginPath()
      g.moveTo(ex - ew, ey - r * 0.08)
      g.lineTo(ex + ew * 0.2, ey)
      g.lineTo(ex - ew, ey + r * 0.08)
      if (i) {
        g.moveTo(ex + ew, ey - r * 0.08)
        g.lineTo(ex - ew * 0.2, ey)
        g.lineTo(ex + ew, ey + r * 0.08)
      }
      g.lineWidth = r * 0.07
      g.strokeStyle = '#3b2418'
      g.stroke()
    }
  }
  // Nez.
  g.beginPath()
  g.moveTo(cx - r * 0.3, cy - r * 0.1)
  g.quadraticCurveTo(cx - r * 0.78, cy + r * 0.2, cx - r * 0.7, cy + r * 0.32)
  g.quadraticCurveTo(cx - r * 0.5, cy + r * 0.42, cx - r * 0.3, cy + r * 0.3)
  g.fillStyle = 'rgba(160,95,65,0.45)'
  g.fill()
  g.lineWidth = r * 0.05
  g.strokeStyle = 'rgba(110,60,40,0.7)'
  g.stroke()
  g.beginPath()
  g.arc(cx - r * 0.55, cy + r * 0.12, r * 0.06, 0, TAU)
  g.fillStyle = 'rgba(255,240,225,0.6)'
  g.fill()
  // Bouche.
  g.beginPath()
  if (state === 'hurt') {
    g.ellipse(cx - r * 0.32, cy + r * 0.6, r * 0.18, r * 0.13, 0, 0, TAU)
    g.fillStyle = '#3a1410'
    g.fill()
    g.fillStyle = '#efe6d8'
    g.fillRect(cx - r * 0.46, cy + r * 0.49, r * 0.28, r * 0.06)
  } else {
    g.moveTo(cx - r * 0.55, cy + r * 0.58)
    g.quadraticCurveTo(cx - r * 0.32, cy + r * 0.54, cx - r * 0.1, cy + r * 0.6)
    g.lineWidth = r * 0.07
    g.strokeStyle = '#6e3626'
    g.stroke()
  }
}

/* ---------- Soldat (26 × 50) ---------- */

function soldierBody(g, { team }) {
  const c = TEAM[team]
  // Jambe éloignée.
  limb(g, [[3, 9], [3.4, 20]], 4.6, '#35313b')
  boot(g, 3.6, 25)
  // Jambe proche.
  limb(g, [[-3.5, 9], [-3.8, 20]], 4.8, '#423c48')
  boot(g, -3.6, 25)
  // Gambison matelassé.
  g.beginPath()
  g.moveTo(-10, -5)
  g.quadraticCurveTo(-10, -9, -6, -9)
  g.lineTo(6, -9)
  g.quadraticCurveTo(10, -9, 10, -5)
  g.lineTo(9.5, 4)
  g.lineTo(10, 13)
  g.quadraticCurveTo(0, 14.5, -10, 13)
  g.lineTo(-9.5, 4)
  g.closePath()
  g.fillStyle = '#c9b48a'
  g.fill()
  g.save()
  g.clip()
  g.strokeStyle = 'rgba(90,70,40,0.35)'
  g.lineWidth = 0.4
  for (let x = -11; x <= 11; x += 2.4) {
    g.beginPath()
    g.moveTo(x, -9)
    g.lineTo(x * 1.1, 14)
    g.stroke()
  }
  g.restore()
  lightOver(g, -11, -9, 11, 14, 0.25, 0.45)
  edge(g, 0.6)
  // Tabard aux couleurs de l'équipe.
  g.beginPath()
  g.moveTo(-6.5, -8.5)
  g.lineTo(6.5, -8.5)
  g.lineTo(7.5, 15)
  g.quadraticCurveTo(0, 16.2, -7.5, 15)
  g.closePath()
  cloth(g, c.cloth, -7.5, -8.5, 7.5, 16, 3)
  edge(g, 0.6)
  // Croix brodée.
  g.beginPath()
  g.rect(-1.3, -5.5, 2.6, 14.5)
  g.rect(-5.2, -1.2, 10.4, 2.6)
  g.fillStyle = GOLD
  g.fill()
  lightOver(g, -5, -6, 5, 9, 0.35, 0.35)
  g.beginPath()
  g.rect(-1.3, -5.5, 2.6, 14.5)
  g.rect(-5.2, -1.2, 10.4, 2.6)
  stitches(g, 'rgba(110,70,10,0.8)', 0.3)
  // Ceinture et boucle.
  g.beginPath()
  g.rect(-9.8, 3.6, 19.6, 2.3)
  g.fillStyle = '#4a2f1c'
  g.fill()
  lightOver(g, -10, 3.6, 10, 6)
  edge(g, 0.45)
  g.beginPath()
  g.rect(-2, 3.2, 3.4, 3.1)
  g.lineWidth = 0.8
  g.strokeStyle = metalGradient(g, -2, 3, 1.4, 6.3, '#c9a24a')
  g.stroke()
  // Bras.
  limb(g, [[-8.6, -6], [-10.6, 0.5], [-10.2, 6.5]], 4.4, '#bfa97f')
  hand(g, -10.2, 7.6)
  // Cou et col matelassé.
  g.beginPath()
  g.rect(-2.6, -12, 5, 4)
  g.fillStyle = '#c38a63'
  g.fill()
  g.beginPath()
  g.ellipse(0, -8.6, 6, 1.8, 0, 0, TAU)
  g.fillStyle = '#b8a27a'
  g.fill()
  edge(g, 0.45)
}

function soldierArm(g) {
  // Hampe de la lance.
  g.beginPath()
  roundRect(g, 13.3, -31, 2, 56, 1)
  g.fillStyle = woodPattern(g, { angle: Math.PI / 2, unitsPerTile: 120 })
  g.fill()
  g.fillStyle = 'rgba(0,0,0,0.12)'
  g.fill()
  const sh = g.createLinearGradient(13.3, 0, 15.3, 0)
  sh.addColorStop(0, 'rgba(255,236,200,0.35)')
  sh.addColorStop(1, 'rgba(0,0,0,0.45)')
  g.fillStyle = sh
  g.fill()
  edge(g, 0.5)
  limb(g, [[8.6, -6], [12, -0.5], [14.1, 3]], 4.4, '#c9b48a')
  hand(g, 14.3, 3.4, 1.9)
  // Fer de lance en feuille.
  g.beginPath()
  g.moveTo(14.3, -41)
  g.quadraticCurveTo(17.4, -35, 15.6, -31)
  g.lineTo(13, -31)
  g.quadraticCurveTo(11.2, -35, 14.3, -41)
  g.fillStyle = metalGradient(g, 11.5, -36, 17, -36, '#b8c0ca')
  g.fill()
  edge(g, 0.5)
  g.beginPath()
  g.moveTo(14.3, -40)
  g.lineTo(14.3, -31.5)
  g.lineWidth = 0.4
  g.strokeStyle = 'rgba(255,255,255,0.7)'
  g.stroke()
  g.beginPath()
  g.rect(13.2, -31.2, 2.2, 2.6)
  g.fillStyle = metalGradient(g, 13, -31, 15.5, -28.5, '#6b717b')
  g.fill()
  edge(g, 0.4)
}

function soldierHead(g, { state }) {
  head(g, -1, -16, 6.8, state)
  // Chapeau de fer : ombre portée du bord sur le front.
  g.save()
  g.beginPath()
  g.ellipse(-1, -16, 6.8 * 0.86, 6.8, 0, 0, TAU)
  g.clip()
  const shadow = g.createLinearGradient(0, -21, 0, -15)
  shadow.addColorStop(0, 'rgba(30,15,10,0.55)')
  shadow.addColorStop(1, 'rgba(30,15,10,0)')
  g.fillStyle = shadow
  g.fillRect(-9, -21, 16, 6)
  g.restore()
  // Calotte.
  g.beginPath()
  g.ellipse(-1, -19.6, 7.4, 8.2, 0, Math.PI, TAU)
  g.closePath()
  g.fillStyle = metalGradient(g, -8.4, 0, 6.4, 0, STEEL)
  g.fill()
  edge(g, 0.6)
  g.beginPath()
  g.moveTo(-1, -27.6)
  g.lineTo(-1, -19.8)
  g.lineWidth = 0.7
  g.strokeStyle = 'rgba(255,255,255,0.45)'
  g.stroke()
  g.beginPath()
  g.ellipse(-4.2, -24, 1, 2.6, 0.5, 0, TAU)
  g.fillStyle = 'rgba(255,255,255,0.55)'
  g.fill()
  // Large bord.
  g.beginPath()
  g.ellipse(-1, -19.6, 11.6, 2.5, 0, 0, TAU)
  g.fillStyle = metalGradient(g, -12.6, -21, 10.6, -17, STEEL)
  g.fill()
  edge(g, 0.6)
  for (const x of [-7, -3, 1, 5]) rivet(g, x, -20.3, 0.45, STEEL)
}

/* ---------- Chevalier (30 × 54) ---------- */

function knightBody(g) {
  // Fourreau et épée (côté éloigné).
  g.beginPath()
  g.moveTo(9.5, 4)
  g.lineTo(14.8, 23)
  g.lineTo(13.2, 23.6)
  g.lineTo(8, 4.6)
  g.closePath()
  g.fillStyle = '#3d2616'
  g.fill()
  lightOver(g, 8, 4, 15, 24)
  edge(g, 0.5)
  // Jambe éloignée (jambière d'acier).
  limb(g, [[3.2, 12], [3.4, 23]], 5, tone(STEEL, -0.25), { shade: false })
  boot(g, 3.5, 27)
  // Jambe proche : grève et genouillère.
  limb(g, [[-3.8, 12], [-4, 23]], 5.2, tone(STEEL, -0.05))
  g.beginPath()
  g.ellipse(-3.8, 16, 3, 2.2, 0, 0, TAU)
  g.fillStyle = metalGradient(g, -6.8, 14, -0.8, 18, STEEL)
  g.fill()
  edge(g, 0.45)
  boot(g, -3.8, 27)
  // Haubert de mailles (dépasse sous la cotte).
  g.beginPath()
  g.moveTo(-11, 6)
  g.lineTo(11, 6)
  g.lineTo(11.6, 16.5)
  g.lineTo(-11.6, 16.5)
  g.closePath()
  g.fillStyle = mailPattern(g)
  g.fill()
  lightOver(g, -12, 6, 12, 17, 0.15, 0.5)
  edge(g, 0.5)
  // Cotte d'armes, fendue devant.
  g.beginPath()
  g.moveTo(-10.5, -5)
  g.quadraticCurveTo(-10.5, -10, -6, -10)
  g.lineTo(6, -10)
  g.quadraticCurveTo(10.5, -10, 10.5, -5)
  g.lineTo(10, 5)
  g.lineTo(11.2, 15)
  g.lineTo(1, 15.5)
  g.lineTo(0, 8)
  g.lineTo(-1, 15.5)
  g.lineTo(-11.2, 15)
  g.lineTo(-10, 5)
  g.closePath()
  cloth(g, '#2c4775', -11, -10, 11, 15.5, 4)
  edge(g, 0.6)
  g.beginPath()
  g.moveTo(-11.2, 14.6)
  g.lineTo(-1, 15.1)
  g.moveTo(1, 15.1)
  g.lineTo(11.2, 14.6)
  stitches(g, 'rgba(230,190,90,0.85)', 0.45)
  // Ceinturon.
  g.beginPath()
  g.moveTo(-10.2, 3)
  g.lineTo(10.2, 4.6)
  g.lineTo(10.2, 6.6)
  g.lineTo(-10.2, 5)
  g.closePath()
  g.fillStyle = '#3d2616'
  g.fill()
  edge(g, 0.4)
  for (const x of [-7, -3, 1, 5, 8.5]) rivet(g, x, 4.4 + x * 0.08, 0.45, GOLD)
  // Garde et pommeau de l'épée.
  g.beginPath()
  g.moveTo(6.2, 2.4)
  g.lineTo(11.6, 0.4)
  g.lineWidth = 1.4
  g.strokeStyle = metalGradient(g, 6, 0, 12, 3, GOLD)
  g.stroke()
  g.beginPath()
  g.moveTo(8.6, 1.4)
  g.lineTo(7.2, -2.6)
  g.lineWidth = 1.3
  g.strokeStyle = '#3a2416'
  g.stroke()
  rivet(g, 7, -3.4, 1, GOLD)
  // Bras droit : manche de mailles, gantelet, épaulière.
  limb(g, [[8.8, -6.5], [11.8, -0.5], [12.4, 5]], 4.4, '#7f8792')
  g.beginPath()
  g.ellipse(12.4, 6.2, 2.3, 2.1, 0, 0, TAU)
  g.fillStyle = metalGradient(g, 10, 4, 15, 8, STEEL)
  g.fill()
  edge(g, 0.45)
  g.beginPath()
  g.ellipse(9.4, -7.4, 4.6, 3.6, 0.35, Math.PI * 0.9, Math.PI * 2.15)
  g.closePath()
  g.fillStyle = metalGradient(g, 5, -11, 14, -4, STEEL)
  g.fill()
  edge(g, 0.55)
  // Camail (mailles du cou).
  g.beginPath()
  g.moveTo(-7.4, -12)
  g.lineTo(6.6, -12)
  g.lineTo(8.6, -8.4)
  g.lineTo(-9, -8.4)
  g.closePath()
  g.fillStyle = mailPattern(g)
  g.fill()
  lightOver(g, -9, -12, 9, -8, 0.2, 0.45)
  edge(g, 0.45)
}

function knightHead(g, { state, team }) {
  const c = TEAM[team]
  // Grand heaume.
  const helm = () => {
    g.beginPath()
    g.moveTo(-8.6, -11.4)
    g.lineTo(-8.8, -23.5)
    g.quadraticCurveTo(-8.4, -28.8, -1, -29)
    g.quadraticCurveTo(6.4, -28.8, 6.8, -23.5)
    g.lineTo(6.6, -11.4)
    g.quadraticCurveTo(-1, -9.6, -8.6, -11.4)
    g.closePath()
  }
  helm()
  g.fillStyle = metalGradient(g, -9, 0, 7, 0, STEEL)
  g.fill()
  const top = g.createLinearGradient(0, -29, 0, -11)
  top.addColorStop(0, 'rgba(255,255,255,0.25)')
  top.addColorStop(0.4, 'rgba(255,255,255,0)')
  top.addColorStop(1, 'rgba(0,0,0,0.3)')
  g.fillStyle = top
  g.fill()
  edge(g, 0.65)
  // Fente de vision et renfort en croix (laiton).
  g.beginPath()
  g.rect(-8.6, -20.2, 15.2, 1.7)
  g.fillStyle = '#0d0b0e'
  g.fill()
  if (state === 'hurt') {
    const glow = g.createLinearGradient(-8, 0, 2, 0)
    glow.addColorStop(0, 'rgba(255,70,40,0.95)')
    glow.addColorStop(1, 'rgba(255,70,40,0.2)')
    g.fillStyle = glow
    g.fillRect(-8.4, -19.9, 9, 1.1)
  } else if (state === 'idle') {
    g.fillStyle = 'rgba(245,235,215,0.85)'
    g.fillRect(-6.6, -19.8, 1.4, 0.8)
    g.fillRect(-2.9, -19.8, 1.4, 0.8)
  }
  g.beginPath()
  g.rect(-8.7, -21.4, 15.4, 1.2)
  g.rect(-8.7, -18.5, 15.4, 1.1)
  g.rect(-2.4, -28.6, 1.7, 17)
  g.fillStyle = metalGradient(g, -9, -29, 7, -11, '#c49a3e')
  g.fill()
  edge(g, 0.35)
  // Trous d'aération (côté visage, vers la gauche).
  g.fillStyle = '#100c0d'
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    g.beginPath()
    g.arc(-7 + i * 1.5, -15.6 + j * 1.6, 0.42, 0, TAU)
    g.fill()
  }
  for (const x of [-7.6, -4, 2.2, 5.6]) rivet(g, x, -12.2, 0.5, STEEL)
  g.beginPath()
  g.ellipse(-5.6, -24, 0.9, 3.4, 0.08, 0, TAU)
  g.fillStyle = 'rgba(255,255,255,0.5)'
  g.fill()
  if (state === 'hurt') {
    // Bosse et éraflure toute fraîche.
    g.beginPath()
    g.moveTo(1.5, -26)
    g.lineTo(4.6, -23.2)
    g.lineWidth = 0.5
    g.strokeStyle = 'rgba(255,255,255,0.8)'
    g.stroke()
  }
  // Plumet (plumes superposées).
  for (let k = 0; k < 5; k++) {
    g.beginPath()
    g.moveTo(0.5, -28.6)
    g.bezierCurveTo(2 + k, -35 - k * 0.6, 8 + k * 1.2, -36 + k * 0.4, 11 + k * 0.8, -30 + k * 1.3)
    g.lineWidth = 2.4 - k * 0.25
    g.strokeStyle = k % 2 ? c.light : c.cloth
    g.stroke()
  }
  g.beginPath()
  g.moveTo(0.5, -28.6)
  g.bezierCurveTo(2, -35, 8, -36, 11, -30)
  g.lineWidth = 0.4
  g.strokeStyle = c.dark
  g.stroke()
}

function knightShield(g, { team }) {
  const c = TEAM[team]
  // Écu (bras gauche, devant le corps).
  const shield = () => {
    g.beginPath()
    g.moveTo(-16.4, -7.6)
    g.lineTo(-1.6, -7.6)
    g.quadraticCurveTo(-1.4, 6, -9, 13.6)
    g.quadraticCurveTo(-16.6, 6, -16.4, -7.6)
    g.closePath()
  }
  shield()
  g.fillStyle = GOLD
  g.fill()
  g.save()
  g.clip()
  g.beginPath()
  g.moveTo(-17, 6)
  g.lineTo(-9, -1.6)
  g.lineTo(-1, 6)
  g.lineTo(-1, 10.6)
  g.lineTo(-9, 3)
  g.lineTo(-17, 10.6)
  g.closePath()
  g.fillStyle = c.cloth
  g.fill()
  // Usure de la peinture.
  g.fillStyle = 'rgba(90,60,30,0.35)'
  for (const [x, y, r] of [[-13, -5, 0.8], [-4, -3, 0.6], [-11, 9, 0.7], [-6.5, 1, 0.5]]) {
    g.beginPath()
    g.arc(x, y, r, 0, TAU)
    g.fill()
  }
  g.restore()
  shield()
  lightOver(g, -17, -8, -1, 14, 0.4, 0.45)
  g.lineWidth = 1.2
  g.strokeStyle = metalGradient(g, -17, -8, -1, 14, STEEL)
  g.stroke()
  shield()
  edge(g, 0.4)
  rivet(g, -14.5, -6.1, 0.55, STEEL)
  rivet(g, -3.5, -6.1, 0.55, STEEL)
  // Épaulière gauche au-dessus de l'écu.
  g.beginPath()
  g.ellipse(-9.6, -8.4, 4.4, 2.8, -0.3, Math.PI, TAU)
  g.closePath()
  g.fillStyle = metalGradient(g, -14, -11, -5, -6, STEEL)
  g.fill()
  edge(g, 0.5)
}

/* ---------- Roi (32 × 58) ---------- */

function ermine(g, x0, y0, x1, y1) {
  g.fillStyle = '#f3eee4'
  g.fill()
  g.save()
  g.clip()
  // Poils.
  g.strokeStyle = 'rgba(150,140,125,0.35)'
  g.lineWidth = 0.25
  for (let x = x0; x < x1; x += 0.9) {
    for (let y = y0; y < y1; y += 1.6) {
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + 0.3, y + 0.9)
      g.stroke()
    }
  }
  // Queues d'hermine.
  g.fillStyle = '#16120f'
  let k = 0
  for (let y = y0 + 1.6; y < y1; y += 3.4, k++) {
    for (let x = x0 + (k % 2 ? 2.2 : 0.6); x < x1; x += 3.6) {
      g.beginPath()
      g.moveTo(x, y - 0.9)
      g.quadraticCurveTo(x + 0.7, y + 0.6, x, y + 1.2)
      g.quadraticCurveTo(x - 0.7, y + 0.6, x, y - 0.9)
      g.fill()
    }
  }
  g.restore()
  lightOver(g, x0, y0, x1, y1, 0.15, 0.3)
  edge(g, 0.5)
}

function kingBody(g) {
  // Chaussures pointues.
  for (const x of [-5, 3.5]) {
    g.beginPath()
    g.moveTo(x + 2.4, 26)
    g.lineTo(x + 2.6, 29)
    g.lineTo(x - 4.6, 29)
    g.quadraticCurveTo(x - 3, 26.4, x - 2.4, 26)
    g.closePath()
    g.fillStyle = '#5a1c1c'
    g.fill()
    lightOver(g, x - 5, 26, x + 3, 29)
    edge(g, 0.45)
  }
  // Robe de velours.
  const robe = () => {
    g.beginPath()
    g.moveTo(-11, -9)
    g.lineTo(11, -9)
    g.quadraticCurveTo(14, 8, 15.6, 27)
    g.quadraticCurveTo(0, 28.6, -15.6, 27)
    g.quadraticCurveTo(-14, 8, -11, -9)
    g.closePath()
  }
  robe()
  g.fillStyle = '#4e2163'
  g.fill()
  const velvet = g.createLinearGradient(-16, 0, 16, 0)
  for (const [u, a] of [[0, -0.5], [0.12, 0.08], [0.22, -0.2], [0.36, 0.14], [0.5, -0.1], [0.64, 0.12], [0.78, -0.22], [0.9, 0.06], [1, -0.55]]) {
    velvet.addColorStop(u, a > 0 ? `rgba(220,170,255,${a})` : `rgba(0,0,0,${-a})`)
  }
  g.fillStyle = velvet
  g.fill()
  lightOver(g, -16, -9, 16, 28, 0.15, 0.4)
  edge(g, 0.6)
  // Tunique de brocart d'or (devant).
  g.beginPath()
  g.moveTo(-2.8, -4)
  g.lineTo(2.8, -4)
  g.lineTo(3.6, 24)
  g.lineTo(-3.6, 24)
  g.closePath()
  g.fillStyle = metalGradient(g, -3.6, 0, 3.6, 0, '#c99a34')
  g.fill()
  g.save()
  g.clip()
  g.strokeStyle = 'rgba(110,60,10,0.55)'
  g.lineWidth = 0.3
  for (let y = -4; y < 26; y += 2.2) {
    g.beginPath()
    g.moveTo(-4, y)
    g.lineTo(0, y + 1.1)
    g.lineTo(4, y)
    g.stroke()
  }
  g.restore()
  edge(g, 0.45)
  // Ourlet d'hermine.
  g.beginPath()
  g.moveTo(-15.4, 23.2)
  g.quadraticCurveTo(0, 25, 15.4, 23.2)
  g.lineTo(15.6, 27)
  g.quadraticCurveTo(0, 28.6, -15.6, 27)
  g.closePath()
  ermine(g, -16, 23, 16, 29)
  // Bras : manches de velours, mains, sceptre.
  limb(g, [[-9.6, -6], [-12, 1], [-11, 6.5]], 4.6, '#532269')
  hand(g, -10.8, 7.6)
  // Pèlerine d'hermine sur les épaules.
  g.beginPath()
  g.moveTo(-12.6, -6)
  g.quadraticCurveTo(-12, -11, -6, -11)
  g.lineTo(6, -11)
  g.quadraticCurveTo(12, -11, 12.6, -6)
  g.quadraticCurveTo(12.4, -1.6, 9, -1)
  g.quadraticCurveTo(0, 0.6, -9, -1)
  g.quadraticCurveTo(-12.4, -1.6, -12.6, -6)
  g.closePath()
  ermine(g, -13, -11, 13, 0.6)
  // Chaîne d'or et médaillon.
  g.beginPath()
  g.moveTo(-7, -9)
  g.quadraticCurveTo(-1, 2, 5.6, -9)
  g.setLineDash([0.9, 0.5])
  g.lineWidth = 0.9
  g.strokeStyle = GOLD
  g.stroke()
  g.setLineDash([])
  rivet(g, -0.8, -3.2, 1.6, GOLD)
}

function kingArm(g) {
  // Sceptre d'or surmonté d'un globe crucigère.
  g.beginPath()
  g.moveTo(11.4, 15)
  g.lineTo(14.6, -19)
  g.lineWidth = 1.5
  g.strokeStyle = metalGradient(g, 11, 0, 15, 0, GOLD)
  g.stroke()
  for (const t of [0.3, 0.62]) rivet(g, 11.4 + 3.2 * t, 15 - 34 * t, 1, GOLD)
  const ox = 14.8
  const oy = -21.4
  const orb = g.createRadialGradient(ox - 0.9, oy - 0.9, 0.2, ox, oy, 2.6)
  orb.addColorStop(0, '#fff3c4')
  orb.addColorStop(0.45, GOLD)
  orb.addColorStop(1, '#6e4a10')
  g.beginPath()
  g.arc(ox, oy, 2.6, 0, TAU)
  g.fillStyle = orb
  g.fill()
  edge(g, 0.4)
  g.beginPath()
  g.moveTo(ox, oy - 2.6)
  g.lineTo(ox, oy - 6.2)
  g.moveTo(ox - 1.5, oy - 4.6)
  g.lineTo(ox + 1.5, oy - 4.6)
  g.lineWidth = 0.9
  g.strokeStyle = GOLD
  g.stroke()
  limb(g, [[9.6, -6], [12.4, 0.5], [12.6, 6]], 4.6, '#5b2a72')
  hand(g, 12.8, 6.6, 1.9)
}

function kingHead(g, { state }) {
  // Cheveux blancs (derrière la tête).
  g.beginPath()
  g.moveTo(-1, -24)
  g.quadraticCurveTo(8.2, -23, 7.4, -12)
  g.quadraticCurveTo(4, -9.4, 3, -13)
  g.closePath()
  g.fillStyle = '#e4e0d8'
  g.fill()
  lightOver(g, -1, -24, 8, -9)
  edge(g, 0.4)
  // Tête.
  head(g, -1, -17, 7, state, { old: true, stubble: false })
  // Barbe et moustache.
  g.beginPath()
  g.moveTo(-6.6, -16)
  g.quadraticCurveTo(-7.4, -9, -4.2, -4.4)
  g.quadraticCurveTo(-2.4, -2.8, -1.4, -5)
  g.quadraticCurveTo(2.6, -9, 4.6, -15)
  g.quadraticCurveTo(2, -10.6, -1.4, -11)
  g.quadraticCurveTo(-4.2, -11.2, -6.6, -16)
  g.closePath()
  const beard = g.createLinearGradient(0, -16, 0, -3)
  beard.addColorStop(0, '#f4f1ea')
  beard.addColorStop(1, '#b9b3a8')
  g.fillStyle = beard
  g.fill()
  g.save()
  g.clip()
  g.strokeStyle = 'rgba(120,110,100,0.5)'
  g.lineWidth = 0.25
  for (let x = -7; x < 5; x += 0.8) {
    g.beginPath()
    g.moveTo(x, -15)
    g.quadraticCurveTo(x - 0.4, -9, x * 0.5 - 2, -3)
    g.stroke()
  }
  g.restore()
  edge(g, 0.45)
  if (state === 'hurt') {
    g.beginPath()
    g.ellipse(-3.2, -12.6, 1.4, 1, 0, 0, TAU)
    g.fillStyle = '#3a1410'
    g.fill()
  }
  g.beginPath()
  g.moveTo(-6.4, -12.6)
  g.quadraticCurveTo(-4.4, -14.4, -2.4, -13.4)
  g.quadraticCurveTo(-0.6, -14.4, 1.2, -12.8)
  g.quadraticCurveTo(-0.6, -12.8, -2.4, -12.4)
  g.quadraticCurveTo(-4.4, -12, -6.4, -12.6)
  g.fillStyle = '#ebe7df'
  g.fill()
  edge(g, 0.35)
  // Couronne (de travers quand le roi est touché).
  g.save()
  if (state === 'hurt') {
    g.translate(2, -23)
    g.rotate(0.28)
    g.translate(-2, 23)
  }
  // Toque de velours rouge sous les fleurons.
  g.beginPath()
  g.ellipse(-1, -24.6, 6.4, 4.8, 0, Math.PI, TAU)
  g.fillStyle = '#8c1d24'
  g.fill()
  lightOver(g, -7.4, -29.4, 5.4, -24.6, 0.3, 0.3)
  const crown = () => {
    g.beginPath()
    g.moveTo(-8.4, -21.2)
    g.lineTo(-8.6, -25)
    for (const [x, peak] of [[-7.7, -30.4], [-4.4, -27], [-1, -31.6], [2.4, -27], [5.7, -30.4]]) {
      g.lineTo(x - 0.9, -25.4)
      g.lineTo(x, peak)
      g.lineTo(x + 0.9, -25.4)
    }
    g.lineTo(6.6, -25)
    g.lineTo(6.4, -21.2)
    g.quadraticCurveTo(-1, -20, -8.4, -21.2)
    g.closePath()
  }
  crown()
  g.fillStyle = metalGradient(g, -9, 0, 7, 0, GOLD)
  g.fill()
  const sheen = g.createLinearGradient(0, -31, 0, -20)
  sheen.addColorStop(0, 'rgba(255,250,220,0.4)')
  sheen.addColorStop(1, 'rgba(80,40,0,0.35)')
  g.fillStyle = sheen
  g.fill()
  edge(g, 0.5)
  // Perles et pierres.
  for (const [x, y] of [[-7.7, -30.4], [-1, -31.6], [5.7, -30.4]]) {
    const pg = g.createRadialGradient(x - 0.3, y - 0.4, 0.1, x, y, 0.9)
    pg.addColorStop(0, '#ffffff')
    pg.addColorStop(1, '#bdb5aa')
    g.beginPath()
    g.arc(x, y, 0.9, 0, TAU)
    g.fillStyle = pg
    g.fill()
  }
  for (const [x, col] of [[-5.4, '#2a5bd0'], [-1, '#c0182c'], [3.4, '#1f8a4a']]) {
    const jg = g.createRadialGradient(x - 0.4, -23.4, 0.1, x, -23, 1.3)
    jg.addColorStop(0, '#ffffff')
    jg.addColorStop(0.35, col)
    jg.addColorStop(1, tone(col, -0.6))
    g.beginPath()
    g.ellipse(x, -23, x === -1 ? 1.3 : 1, 1.1, 0, 0, TAU)
    g.fillStyle = jg
    g.fill()
    edge(g, 0.3)
  }
  g.restore()
}

/* ---------- Animation (à chaque image) ---------- */

/**
 * Chaque personnage est découpé en calques mis en cache séparément (corps,
 * tête, bras ou écu) : on les anime par de simples transformations autour
 * d'un pivot (cou, épaule), sans redessiner le détail.
 */
const RIGS = {
  soldier: {
    size: [26, 50],
    box: { x: -17, y: -43, w: 36, h: 70 },
    layers: [
      { name: 'body', paint: soldierBody },
      { name: 'arm', paint: soldierArm, pivot: [8.6, -6] },
      { name: 'head', paint: soldierHead, pivot: [-1, -10.5], face: true },
    ],
    // Gestes au repos : regarder derrière soi, soulever puis reposer la lance, lever les yeux.
    actions: ['lookBack', 'thump', 'lookUp'],
  },
  knight: {
    size: [30, 54],
    box: { x: -19, y: -38, w: 38, h: 67 },
    layers: [
      { name: 'body', paint: knightBody },
      { name: 'head', paint: knightHead, pivot: [-1, -10.5], face: true },
      { name: 'shield', paint: knightShield, pivot: [-9, -8] },
    ],
    actions: ['lookBack', 'shield', 'nod'],
  },
  king: {
    size: [32, 58],
    box: { x: -19, y: -37, w: 38, h: 68 },
    layers: [
      { name: 'body', paint: kingBody },
      { name: 'arm', paint: kingArm, pivot: [9.6, -6] },
      { name: 'head', paint: kingHead, pivot: [-1, -10.5], face: true },
    ],
    actions: ['brandish', 'lookBack', 'nod'],
  },
}

const smooth = (u) => u * u * (3 - 2 * u)
/** Enveloppe d'un geste : monte, tient, redescend (u dans [0, 1]). */
const envelope = (u, a = 0.12, b = 0.55) => (u < a || u > b ? 0 : u < a + 0.07 ? smooth((u - a) / 0.07) : u > b - 0.07 ? smooth((b - u) / 0.07) : 1)

/** Vigilance lissée par personnage (ils se tournent vers le ciel puis se détendent). */
const alertness = new Map()
function alertLevel(id, alert, t) {
  const prev = alertness.get(id)
  let v = alert ? 1 : 0
  if (prev && t >= prev.t && t - prev.t < 0.5) {
    const k = Math.min(1, (t - prev.t) * (alert ? 6 : 1.6))
    v = prev.v + ((alert ? 1 : 0) - prev.v) * k
  }
  if (alertness.size > 400) alertness.clear()
  alertness.set(id, { v, t })
  return v
}

/** Pose de chaque calque à l'instant t. */
function pose(type, t, seed, { hurt, alert }) {
  const rig = RIGS[type]
  const P = { body: { dx: 0, dy: 0 }, head: { rot: 0, flip: 1, dy: 0 }, arm: { rot: 0, dy: 0 }, shield: { rot: 0, dx: 0, dy: 0 } }
  // Report du poids d'une jambe sur l'autre.
  P.body.dx = Math.sin(t * 0.7 + seed * 3) * 0.35
  if (hurt) {
    P.head.rot = -0.22 + Math.sin(t * 31 + seed) * 0.08
    P.arm.rot = Math.sin(t * 24 + seed) * 0.25
    P.shield.dy = -2
    return P
  }
  // Geste du moment : un par cycle, choisi d'après l'identité du personnage.
  const cycle = 3.6 + (seed % 2.4)
  const k = (t + seed * 7) / cycle
  const action = rig.actions[Math.floor(k + seed * 13) % rig.actions.length]
  const u = k - Math.floor(k)
  const e = envelope(u)
  // Micro-mouvements permanents : la tête et le bras ne sont jamais tout à fait figés.
  P.head.rot = Math.sin(t * 0.9 + seed * 2) * 0.035
  P.arm.rot = Math.sin(t * 1.1 + seed) * 0.03
  switch (action) {
    case 'lookBack':
      // La tête pivote : on « écrase » puis retourne le calque (le visage passe de gauche à droite).
      P.head.flip = Math.cos(Math.PI * e)
      break
    case 'lookUp':
      P.head.rot += 0.16 * e
      break
    case 'nod':
      P.head.rot += Math.sin(u * 40) * 0.07 * e
      break
    case 'thump': {
      // Soulève la lance puis la repose d'un coup sec.
      const lift = u < 0.3 ? smooth(Math.max(0, (u - 0.15) / 0.15)) : u < 0.34 ? 1 - (u - 0.3) / 0.04 : 0
      P.arm.dy = -3.2 * lift
      break
    }
    case 'shield':
      P.shield.dy = -1.6 * e
      P.shield.rot = 0.07 * e
      break
    case 'brandish':
      P.arm.dy = -3 * e
      P.arm.rot += (-0.16 + Math.sin(u * 30) * 0.05) * e
      break
  }
  // Un projectile en vol : tous lèvent les yeux et se préparent.
  if (alert > 0) {
    P.head.rot = P.head.rot * (1 - alert) + 0.15 * alert
    P.head.flip = P.head.flip * (1 - alert) + alert
    if (type === 'soldier') P.arm.rot += -0.22 * alert
    if (type === 'knight') {
      P.shield.dy += -3.6 * alert
      P.shield.dx += -1 * alert
    }
    if (type === 'king') {
      P.arm.dy += -2.5 * alert
      P.arm.rot += -0.12 * alert
    }
  }
  return P
}

function animated(type) {
  const rig = RIGS[type]
  const [W, H] = rig.size
  return (ctx, s) => {
    const ex = s.extra ?? {}
    const t = (s.time ?? 0) / 1000
    const seed = ((s.seed ?? 1) * 0.618) % 97
    const team = ex.team === 2 ? 2 : 1
    // Clignement : ~0,13 s toutes les 3,4 à 5 s selon le personnage.
    const period = 3.4 + (seed % 1.6)
    const state = ex.hurt ? 'hurt' : !ex.still && (t + seed * 3) % period < 0.13 ? 'blink' : 'idle'
    const still = Boolean(ex.still)
    const alert = still ? 0 : alertLevel(s.seed ?? 0, Boolean(ex.alert), t)
    const P = still ? null : pose(type, t, seed, { hurt: Boolean(ex.hurt), alert })
    ctx.save()
    ctx.scale(s.w / W, s.h / H)
    // Ronde (v5.1) : le personnage se tourne dans le sens de la marche et
    // avance d'un pas balancé (léger rebond, buste qui oscille).
    if (ex.walking && !still) {
      if (ex.facing > 0) ctx.scale(-1, 1)
      const step = t * 9 + seed
      ctx.translate(0, H / 2)
      ctx.rotate(Math.sin(step) * 0.05)
      ctx.translate(0, -H / 2 - Math.abs(Math.sin(step)) * 1.6)
    } else if (ex.facing > 0 && !still) {
      ctx.scale(-1, 1)
    }
    if (P) {
      if (ex.hurt) ctx.translate(Math.sin(t * 55 + seed) * 0.7, 0)
      else {
        // Respiration : le buste se soulève très légèrement, les pieds restent au sol.
        const b = Math.sin(t * 2.3 + seed * 5) * 0.014
        ctx.translate(P.body.dx, H / 2)
        ctx.scale(1 - b * 0.4, 1 + b)
        ctx.translate(0, -H / 2)
      }
    }
    for (const layer of rig.layers) {
      const key = `chr.${type}.${layer.name}.${team}.${layer.face ? state : 'any'}`
      const paint = (g) => layer.paint(g, { state, team })
      const q = P && layer.pivot ? P[layer.name] : null
      if (!q) {
        cached(ctx, key, rig.box, paint, 4)
        continue
      }
      const [px, py] = layer.pivot
      ctx.save()
      ctx.translate(px + (q.dx ?? 0), py + (q.dy ?? 0))
      if (q.rot) ctx.rotate(q.rot)
      if (q.flip !== undefined && q.flip !== 1) ctx.scale(Math.abs(q.flip) < 0.08 ? 0.08 * Math.sign(q.flip || 1) : q.flip, 1)
      ctx.translate(-px, -py)
      cached(ctx, key, rig.box, paint, 4)
      ctx.restore()
    }
    ctx.restore()
  }
}

export const CHARACTER_PAINTERS = Object.freeze({
  'target.soldier': animated('soldier'),
  'target.knight': animated('knight'),
  'target.king': animated('king'),
})
