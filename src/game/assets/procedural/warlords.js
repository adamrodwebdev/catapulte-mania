/**
 * Les généraux de Mordrac en jeu (v6.0) : dix chefs de guerre que l'on
 * reconnaît au premier coup d'œil, même de loin, à leur coiffe, leur arme,
 * leur cape et leur carrure. Un signe commun les distingue de tous les autres
 * défenseurs : une cape agrafée d'une fibule d'or.
 *
 * Même facture que les autres personnages (calques détaillés mis en cache,
 * animés par de simples transformations, voir characters.js), sur le gabarit
 * du chevalier (30 × 54) agrandi à leur corps physique. Pièces et couleurs
 * viennent de `look` (bosses/generals.js). Quelques détails vivent à chaque
 * image : la mèche de la bombe, l'orbe du bâton, les arcs du marteau, la rune
 * de la lame noire, les ailes du faucon.
 * Repère : centre du corps physique ; il regarde vers la gauche.
 */
import { TAU, tone, roundRect, edge, lightOver, metalGradient, rivet, mailPattern, woodPattern, stitches } from './realism.js'
import { animated, boot, cloth, hand, head, limb, STEEL } from './characters.js'
import { GENERALS, GENERAL_IDS } from '../../bosses/generals.js'

/** Épaule du bras armé, cou, visage (gabarit du chevalier). */
const SHOULDER = [8.6, -6]
const NECK = [-1, -10.5]
const FACE = { x: -1, y: -17, r: 7 }
const GOLD = '#d2a53a'
const GARNET = '#b0202c'
const LEATHER = '#5a3a24'

/** Variante hexadécimale de tone() (les dégradés de métal attendent de l'hexadécimal). */
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16)
  const f = (c) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt))
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, '0')).join('')}`
}

/** Remplit le chemin courant d'un dégradé de mèches (cheveux, barbe, fourrure). */
function hairFill(g, color, x0, y0, x1, y1) {
  const gr = g.createLinearGradient(x0, y0, x1, y1)
  gr.addColorStop(0, tone(color, 0.28))
  gr.addColorStop(0.5, color)
  gr.addColorStop(1, tone(color, -0.42))
  g.fillStyle = gr
  g.fill()
  edge(g, 0.45)
}

/** Brins de cheveux : quelques traits sombres. */
function strands(g, lines, alpha = 0.28) {
  g.strokeStyle = `rgba(0,0,0,${alpha})`
  g.lineWidth = 0.35
  g.lineCap = 'round'
  for (const [x0, y0, x1, y1] of lines) {
    g.beginPath()
    g.moveTo(x0, y0)
    g.lineTo(x1, y1)
    g.stroke()
  }
}

/* ---------- Cape (calque du fond, ondule autour des épaules) ---------- */

/** Ourlet plissé de la cape, de l'arrière vers l'avant. */
const HEM = [[16.6, 21], [13.9, 23.3], [11.2, 21.7], [8.4, 23.6], [5.6, 21.9], [2.7, 23.4], [-0.2, 21.7], [-3.3, 23], [-6.4, 21.5]]

function traceHem(g, dy = 0) {
  for (let i = 1; i < HEM.length; i += 2) g.quadraticCurveTo(HEM[i][0], HEM[i][1] + dy, HEM[i + 1][0], HEM[i + 1][1] + dy)
}

function capeLayer(look) {
  return (g) => {
    g.save()
    g.scale(look.bulk, 1)
    // Doublure, plus sombre, visible sur le bord arrière.
    g.beginPath()
    g.moveTo(5, -11)
    g.quadraticCurveTo(15.6, -5, 17.8, 21.2)
    g.lineTo(12.6, 22.4)
    g.quadraticCurveTo(10.8, 3, 5, -8.6)
    g.closePath()
    g.fillStyle = tone(look.cape, -0.5)
    g.fill()
    // La cape, agrafée aux épaules.
    g.beginPath()
    g.moveTo(-7.6, -11.6)
    g.quadraticCurveTo(2, -14.2, 9.6, -10.6)
    g.quadraticCurveTo(15.4, -2, HEM[0][0], HEM[0][1])
    traceHem(g)
    g.lineTo(-8.6, -4)
    g.closePath()
    cloth(g, look.cape, -8.6, -14, 16.6, 23.6, 5)
    edge(g, 0.6)
    // Galon le long de l'ourlet.
    g.beginPath()
    g.moveTo(HEM[0][0] - 0.2, HEM[0][1] - 1.3)
    traceHem(g, -1.3)
    g.lineWidth = 0.9
    g.strokeStyle = look.trim
    g.stroke()
    g.restore()
  }
}

/* ---------- Corps : jambes, tenue, ceinture, bras avant, col ---------- */

function legs(g, look) {
  if (look.garb === 'robe') {
    // Robe longue jusqu'aux chevilles : seules les pointes des bottes dépassent.
    boot(g, 3.5, 27)
    boot(g, -3.8, 27)
    g.beginPath()
    g.moveTo(-10.2, 2)
    g.lineTo(10.2, 2)
    g.quadraticCurveTo(11.6, 14, 12.8, 23.4)
    g.quadraticCurveTo(0, 25.6, -12.8, 23.4)
    g.quadraticCurveTo(-11.4, 14, -10.2, 2)
    g.closePath()
    cloth(g, look.armor, -12.8, 2, 12.8, 25.6, 5)
    edge(g, 0.6)
    g.beginPath()
    g.moveTo(-12.3, 22.1)
    g.quadraticCurveTo(0, 24.3, 12.3, 22.1)
    stitches(g, look.trim, 0.7)
    return
  }
  const plate = look.garb === 'plate'
  const base = plate ? look.armor : look.garb === 'scale' ? '#e2d4b4' : '#463a2e'
  limb(g, [[3.2, 12], [3.4, 23]], 5, tone(base, -0.25), { shade: false })
  boot(g, 3.5, 27)
  limb(g, [[-3.8, 12], [-4, 23]], 5.2, base)
  if (plate) {
    // Genouillère.
    g.beginPath()
    g.ellipse(-3.8, 16, 3, 2.2, 0, 0, TAU)
    g.fillStyle = metalGradient(g, -6.8, 14, -0.8, 18, look.metal ?? look.armor)
    g.fill()
    edge(g, 0.45)
  }
  boot(g, -3.8, 27)
}

/** Silhouette d'une tunique (pourpoint, tablier, lamelles) jusqu'aux cuisses. */
function tunic(g) {
  g.beginPath()
  g.moveTo(-10.6, -6)
  g.quadraticCurveTo(-10.8, -11.2, -5, -11.2)
  g.lineTo(5, -11.2)
  g.quadraticCurveTo(10.8, -11.2, 10.6, -6)
  g.lineTo(10.4, 4)
  g.lineTo(11.6, 14.6)
  g.quadraticCurveTo(0, 16.4, -11.6, 14.6)
  g.lineTo(-10.4, 4)
  g.closePath()
}

const EMBLEMS = {
  /** L'éclair d'or de Baudouin. */
  bolt(g, look) {
    g.beginPath()
    g.moveTo(-0.6, -8.6)
    g.lineTo(-4.6, -2.2)
    g.lineTo(-2.2, -2.2)
    g.lineTo(-4.2, 3.2)
    g.lineTo(0.6, -3.6)
    g.lineTo(-1.8, -3.6)
    g.closePath()
    g.fillStyle = metalGradient(g, -5, -9, 1, 3, look.trim)
    g.fill()
    edge(g, 0.4)
  },
  /** Le flocon de givre d'Ulric. */
  flake(g, look) {
    g.lineCap = 'round'
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI + Math.PI / 2
      const dx = Math.cos(a) * 4
      const dy = Math.sin(a) * 4
      g.beginPath()
      g.moveTo(-2.2 - dx, -2.6 - dy)
      g.lineTo(-2.2 + dx, -2.6 + dy)
      g.lineWidth = 1.5
      g.strokeStyle = 'rgba(20,30,40,0.8)'
      g.stroke()
      g.lineWidth = 0.9
      g.strokeStyle = look.trim
      g.stroke()
    }
    rivet(g, -2.2, -2.6, 1, look.trim)
  },
  /** L'œil de grenat de Mordrac, serti d'or. */
  eye(g, look) {
    g.beginPath()
    g.moveTo(-7, -2.4)
    g.quadraticCurveTo(-2.4, -7, 2.2, -2.4)
    g.quadraticCurveTo(-2.4, 2.2, -7, -2.4)
    g.closePath()
    g.fillStyle = metalGradient(g, -7, -7, 2, 2, look.trim)
    g.fill()
    edge(g, 0.4)
    rivet(g, -2.4, -2.4, 1.6, GARNET)
  },
}

const TORSOS = {
  /** Plastron bombé sur trois lames de faudes. */
  plate(g, look) {
    const metal = look.metal ?? look.armor
    for (let i = 2; i >= 0; i--) {
      g.beginPath()
      roundRect(g, -11 - i * 0.4, 4.6 + i * 3, 22 + i * 0.8, 3.8, 1.2)
      g.fillStyle = metalGradient(g, -11, 0, 11, 0, metal)
      g.fill()
      edge(g, 0.45)
    }
    const chest = () => {
      g.beginPath()
      g.moveTo(-10.6, -6)
      g.quadraticCurveTo(-11, -11.2, -5, -11.2)
      g.lineTo(5, -11.2)
      g.quadraticCurveTo(10.8, -11.2, 10.6, -6)
      g.lineTo(9.8, 5.6)
      g.quadraticCurveTo(0, 7.8, -10, 5.6)
      g.closePath()
    }
    chest()
    g.fillStyle = metalGradient(g, -11, -6, 11, -2, look.armor)
    g.fill()
    lightOver(g, -11, -11, 11, 7, 0.2, 0.45)
    edge(g, 0.6)
    // Arête du plastron, liseré d'ornement sur le haut.
    g.beginPath()
    g.moveTo(-2.2, -10.6)
    g.quadraticCurveTo(-3.2, -2, -1.6, 6.4)
    g.lineWidth = 0.6
    g.strokeStyle = 'rgba(255,255,255,0.4)'
    g.stroke()
    g.beginPath()
    g.moveTo(-10.4, -6.4)
    g.quadraticCurveTo(-10.8, -10.8, -5, -10.8)
    g.lineTo(5, -10.8)
    g.quadraticCurveTo(10.4, -10.8, 10.4, -6.4)
    g.lineWidth = 0.9
    g.strokeStyle = look.trim
    g.stroke()
    EMBLEMS[look.emblem]?.(g, look)
  },

  /** Pourpoint de cuir épais, lacé devant. */
  leather(g, look) {
    tunic(g)
    g.fillStyle = look.armor
    g.fill()
    lightOver(g, -11.6, -11.2, 11.6, 16, 0.22, 0.45)
    edge(g, 0.6)
    g.beginPath()
    g.moveTo(-11.2, 13.4)
    g.quadraticCurveTo(0, 15.2, 11.2, 13.4)
    stitches(g, 'rgba(240,215,160,0.6)', 0.45)
    // Laçage croisé.
    g.strokeStyle = 'rgba(235,215,170,0.75)'
    g.lineWidth = 0.45
    for (let y = -9; y < 2; y += 2.4) {
      g.beginPath()
      g.moveTo(-3.6, y)
      g.lineTo(-1, y + 1.6)
      g.moveTo(-1, y)
      g.lineTo(-3.6, y + 1.6)
      g.stroke()
    }
    // Épaulettes de cuir rivetées.
    g.beginPath()
    g.ellipse(-8.4, -9.4, 3.6, 2.4, -0.3, Math.PI, TAU)
    g.closePath()
    g.fillStyle = shade(look.armor, -0.25)
    g.fill()
    edge(g, 0.45)
    rivet(g, -8.4, -9.8, 0.5, '#8a8f98')
  },

  /** Chemise de toile, tablier de cuir taché de suie, poches à mèches. */
  apron(g, look) {
    tunic(g)
    g.fillStyle = '#cdb48e'
    g.fill()
    lightOver(g, -11.6, -11.2, 11.6, 16, 0.2, 0.4)
    edge(g, 0.6)
    g.beginPath()
    g.moveTo(-9, -7.4)
    g.lineTo(-0.4, -7.8)
    g.lineTo(0.4, 2)
    g.lineTo(6.4, 4)
    g.lineTo(7.6, 15.6)
    g.quadraticCurveTo(-1, 17, -10.6, 15.4)
    g.lineTo(-10, 2)
    g.closePath()
    g.fillStyle = look.armor
    g.fill()
    lightOver(g, -10.6, -7.8, 7.6, 17, 0.2, 0.5)
    edge(g, 0.6)
    // Bavette nouée au cou, poche, traces de suie et de brûlure.
    g.beginPath()
    g.moveTo(-8.6, -7.4)
    g.lineTo(-6.6, -11.4)
    g.moveTo(-0.8, -7.8)
    g.lineTo(-1.8, -11.6)
    g.lineWidth = 0.9
    g.strokeStyle = shade(look.armor, -0.35)
    g.stroke()
    g.beginPath()
    roundRect(g, -8.4, 7, 6.2, 4.6, 0.8)
    g.fillStyle = shade(look.armor, -0.2)
    g.fill()
    g.beginPath()
    roundRect(g, -8.4, 7, 6.2, 4.6, 0.8)
    stitches(g, 'rgba(240,215,160,0.55)', 0.4)
    g.fillStyle = 'rgba(25,18,14,0.35)'
    for (const [x, y, rx, ry] of [[-3.4, -3, 2.2, 1.4], [2.4, 9.6, 1.8, 2.6], [-6.4, 13.4, 2.6, 1.2]]) {
      g.beginPath()
      g.ellipse(x, y, rx, ry, 0.4, 0, TAU)
      g.fill()
    }
    // Bouts de mèche qui dépassent de la poche.
    g.beginPath()
    g.moveTo(-6.6, 7.2)
    g.quadraticCurveTo(-7.4, 5.2, -6, 4.4)
    g.moveTo(-4.6, 7.2)
    g.quadraticCurveTo(-4.2, 5.4, -3, 5)
    g.lineWidth = 0.5
    g.strokeStyle = '#d9c39a'
    g.stroke()
  },

  /** Haut de la robe : col montant, bande brodée d'argent jusqu'à l'ourlet. */
  robe(g, look) {
    g.beginPath()
    g.moveTo(-9.8, -6.4)
    g.quadraticCurveTo(-10, -11, -5, -11.2)
    g.lineTo(5, -11.2)
    g.quadraticCurveTo(10, -11, 9.8, -6.4)
    g.lineTo(10.4, 4)
    g.lineTo(-10.4, 4)
    g.closePath()
    cloth(g, look.armor, -10.4, -11.2, 10.4, 4, 3)
    edge(g, 0.6)
    g.beginPath()
    g.moveTo(-3.4, -10.8)
    g.lineTo(-4.4, 24.2)
    g.lineWidth = 2.2
    g.strokeStyle = look.trim
    g.stroke()
    g.beginPath()
    g.moveTo(-3.4, -10.8)
    g.lineTo(-4.4, 24.2)
    stitches(g, shade(look.armor, -0.4), 0.5)
    // Améthystes sur la bande.
    for (const y of [-6, 0, 10, 18]) rivet(g, -3.4 - (y + 10.8) / 35, y, 0.7, '#9b59d0')
  },

  /** Tunique de lamelles de bronze, ceinte d'une écharpe. */
  scale(g, look) {
    tunic(g)
    g.fillStyle = look.armor
    g.fill()
    g.save()
    g.clip()
    let row = 0
    for (let y = -11.6; y < 16; y += 2.5, row++) {
      for (let x = -12.6 + (row % 2) * 1.6; x < 13; x += 3.2) {
        g.beginPath()
        g.arc(x, y, 1.75, 0, Math.PI)
        g.fillStyle = metalGradient(g, x - 1.8, y, x + 1.8, y + 1.8, look.armor)
        g.fill()
        g.lineWidth = 0.35
        g.strokeStyle = 'rgba(40,24,10,0.65)'
        g.stroke()
      }
    }
    g.restore()
    tunic(g)
    lightOver(g, -11.6, -11.2, 11.6, 16, 0.18, 0.45)
    edge(g, 0.6)
  },

  /** Haubert de mailles, cotte aux couleurs de sa cape, baudrier de cuir. */
  mail(g, look) {
    g.beginPath()
    g.moveTo(-11, -9)
    g.lineTo(11, -9)
    g.lineTo(11.6, 16)
    g.lineTo(-11.6, 16)
    g.closePath()
    g.fillStyle = mailPattern(g)
    g.fill()
    lightOver(g, -12, -9, 12, 16, 0.15, 0.5)
    edge(g, 0.5)
    g.beginPath()
    g.moveTo(-10.4, -5)
    g.quadraticCurveTo(-10.4, -10, -6, -10)
    g.lineTo(6, -10)
    g.quadraticCurveTo(10.4, -10, 10.4, -5)
    g.lineTo(10, 5)
    g.lineTo(11, 14.4)
    g.lineTo(1, 14.8)
    g.lineTo(0, 8)
    g.lineTo(-1, 14.8)
    g.lineTo(-11, 14.4)
    g.lineTo(-10, 5)
    g.closePath()
    cloth(g, look.cape, -11, -10, 11, 14.8, 4)
    edge(g, 0.6)
    g.beginPath()
    g.moveTo(-11, 13.9)
    g.lineTo(-1, 14.3)
    g.moveTo(1, 14.3)
    g.lineTo(11, 13.9)
    stitches(g, look.trim, 0.5)
    // Baudrier, de l'épaule arrière à la hanche avant.
    g.beginPath()
    g.moveTo(7.6, -10.6)
    g.lineTo(10, -8.6)
    g.lineTo(-7.8, 4.6)
    g.lineTo(-9.6, 2.6)
    g.closePath()
    g.fillStyle = LEATHER
    g.fill()
    edge(g, 0.4)
    for (const [x, y] of [[4.6, -6.6], [-1, -2.2], [-6.2, 1.6]]) rivet(g, x, y, 0.5, look.trim)
  },
}

/** Ceinturon à boucle d'ornement (écharpe nouée pour la tunique de lamelles). */
function belt(g, look) {
  if (look.garb === 'scale') {
    g.beginPath()
    g.moveTo(-10.8, 1.4)
    g.lineTo(10.8, 3)
    g.lineTo(10.8, 7.2)
    g.lineTo(-10.8, 5.8)
    g.closePath()
    cloth(g, look.cape, -10.8, 1.4, 10.8, 7.2, 3)
    edge(g, 0.45)
    // Nœud et pans qui pendent devant.
    g.beginPath()
    g.moveTo(-7.6, 4.4)
    g.quadraticCurveTo(-9.6, 9, -8.6, 13.6)
    g.lineTo(-6.6, 13.2)
    g.quadraticCurveTo(-7, 9, -5.4, 5)
    g.closePath()
    cloth(g, look.cape, -9.6, 4, -5.4, 13.6, 2)
    edge(g, 0.45)
    g.beginPath()
    g.ellipse(-6.8, 4.2, 1.8, 1.5, 0, 0, TAU)
    g.fillStyle = shade(look.cape, -0.2)
    g.fill()
    edge(g, 0.4)
    return
  }
  g.beginPath()
  g.moveTo(-10.4, 3)
  g.lineTo(10.4, 4.6)
  g.lineTo(10.4, 6.8)
  g.lineTo(-10.4, 5.2)
  g.closePath()
  g.fillStyle = '#33221a'
  g.fill()
  edge(g, 0.4)
  g.beginPath()
  roundRect(g, -4.6, 2.5, 4.6, 4.2, 0.8)
  g.fillStyle = metalGradient(g, -4.6, 2.5, 0, 6.7, look.trim)
  g.fill()
  edge(g, 0.4)
  g.beginPath()
  roundRect(g, -3.5, 3.5, 2.4, 2.2, 0.4)
  g.fillStyle = '#33221a'
  g.fill()
}

/** Manche selon la tenue. */
function sleeve(g, look, pts) {
  switch (look.garb) {
    case 'plate':
      limb(g, pts, 4.8, look.armor)
      break
    case 'mail':
      limb(g, pts, 4.5, '#7f8792')
      break
    case 'robe':
      limb(g, pts, 5.6, look.armor)
      break
    case 'scale':
      limb(g, pts, 4.4, '#e2d4b4')
      break
    case 'apron':
      // Manches retroussées : l'avant-bras nu.
      limb(g, pts.slice(0, 2), 4.4, '#cdb48e')
      limb(g, pts.slice(1), 3.4, look.skin)
      break
    default:
      limb(g, pts, 4.7, look.armor)
  }
}

/** Main : gantelet d'acier, gant de cuir, ou main nue. */
function glove(g, look, x, y, r = 2) {
  if (look.garb === 'plate') {
    g.beginPath()
    g.ellipse(x, y, r * 1.15, r * 1.05, 0, 0, TAU)
    g.fillStyle = metalGradient(g, x - r, y - r, x + r, y + r, look.metal ?? look.armor)
    g.fill()
    edge(g, 0.45)
  } else if (look.garb === 'robe' || look.garb === 'scale' || look.garb === 'apron') {
    hand(g, x, y, r * 0.95, look.skin)
  } else {
    g.beginPath()
    g.ellipse(x, y, r * 1.05, r, 0, 0, TAU)
    g.fillStyle = LEATHER
    g.fill()
    lightOver(g, x - r, y - r, x + r, y + r, 0.3, 0.4)
    edge(g, 0.45)
  }
}

/** Épaulière (tenues de plates). */
function pauldron(g, look, x, y, flip = 1) {
  if (look.garb !== 'plate') return
  g.beginPath()
  g.ellipse(x, y, 4.8, 3.6, 0.35 * flip, Math.PI * (flip > 0 ? 0.9 : 0.85), Math.PI * (flip > 0 ? 2.15 : 2.1))
  g.closePath()
  g.fillStyle = metalGradient(g, x - 5, y - 4, x + 5, y + 3, look.metal ?? look.armor)
  g.fill()
  edge(g, 0.55)
  g.beginPath()
  g.ellipse(x, y, 4.8, 3.6, 0.35 * flip, Math.PI * 1.1, Math.PI * 1.9)
  g.lineWidth = 0.7
  g.strokeStyle = look.trim
  g.stroke()
}

/** Dague (lame vers le bas, prise inversée), poignée en x, y. */
function dagger(g, look, x, y, dir = -1) {
  g.beginPath()
  g.moveTo(x - 0.8, y + 1)
  g.lineTo(x + dir * 2.4, y + 9.2)
  g.lineTo(x + 0.9, y + 1.2)
  g.closePath()
  g.fillStyle = metalGradient(g, x - 2, y, x + 2, y + 9, STEEL)
  g.fill()
  edge(g, 0.4)
  g.beginPath()
  g.moveTo(x - 2.2, y + 0.9)
  g.lineTo(x + 2.2, y + 1.3)
  g.lineWidth = 1
  g.strokeStyle = look.trim
  g.stroke()
}

/** Bras avant (côté joueur), le long du corps. */
function frontArm(g, look) {
  sleeve(g, look, [[-8.6, -6], [-10.6, 0.5], [-10.2, 6.5]])
  if (look.offhand === 'dagger') dagger(g, look, -10.2, 7.8)
  glove(g, look, -10.2, 7.6)
  pauldron(g, look, -8.4, -8, -1)
}

/** Fourrure épaisse sur les épaules : touffes superposées. */
function furMantle(g, fur) {
  const tufts = [[10.4, -8.2, 3], [7.8, -10.4, 3.2], [4.2, -11.6, 3.4], [0.4, -12, 3.4], [-3.6, -11.8, 3.4], [-7.4, -10.8, 3.4], [-10.4, -8.6, 3.2]]
  for (const [x, y, r] of tufts) {
    g.beginPath()
    g.arc(x, y, r, 0, TAU)
    const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.5, 0.3, x, y, r)
    gr.addColorStop(0, tone(fur, 0.35))
    gr.addColorStop(0.6, fur)
    gr.addColorStop(1, tone(fur, -0.35))
    g.fillStyle = gr
    g.fill()
    edge(g, 0.35)
  }
  strands(g, Array.from({ length: 14 }, (_, i) => [-11.6 + i * 1.7, -9 + (i % 3) * 0.7, -12 + i * 1.7, -6.6 + (i % 2) * 0.8]), 0.22)
}

/** Col, gorgerin ou fourrure. */
function collar(g, look) {
  if (look.fur) return furMantle(g, look.fur)
  if (look.garb === 'plate') {
    g.beginPath()
    g.moveTo(-7.4, -12.6)
    g.lineTo(6.6, -12.6)
    g.lineTo(8.8, -8.8)
    g.lineTo(-9.2, -8.8)
    g.closePath()
    g.fillStyle = metalGradient(g, -9, -12, 9, -9, look.metal ?? look.armor)
    g.fill()
    edge(g, 0.5)
    return
  }
  if (look.garb === 'mail') {
    g.beginPath()
    g.moveTo(-7.4, -12.4)
    g.lineTo(6.6, -12.4)
    g.lineTo(8.6, -8.6)
    g.lineTo(-9, -8.6)
    g.closePath()
    g.fillStyle = mailPattern(g)
    g.fill()
    lightOver(g, -9, -12, 9, -8, 0.2, 0.45)
    edge(g, 0.45)
    return
  }
  // Col montant (robe) ou simple col de toile.
  const high = look.garb === 'robe'
  g.beginPath()
  g.moveTo(-7, -9.6)
  g.lineTo(-7.6, high ? -14.6 : -12.2)
  g.quadraticCurveTo(-1, high ? -12.6 : -11.2, 6.6, high ? -14.6 : -12.2)
  g.lineTo(6.4, -9.6)
  g.closePath()
  g.fillStyle = high ? look.armor : look.garb === 'apron' || look.garb === 'scale' ? '#bda57e' : shade(look.armor, -0.2)
  g.fill()
  lightOver(g, -7.6, -14.6, 6.6, -9.6, 0.2, 0.45)
  edge(g, 0.5)
  if (high) {
    g.beginPath()
    g.moveTo(-7.6, -14.6)
    g.quadraticCurveTo(-1, -12.6, 6.6, -14.6)
    g.lineWidth = 0.7
    g.strokeStyle = look.trim
    g.stroke()
  }
}

function bodyLayer(look) {
  return (g) => {
    g.save()
    g.scale(look.bulk, 1)
    legs(g, look)
    TORSOS[look.garb](g, look)
    belt(g, look)
    frontArm(g, look)
    collar(g, look)
    // Fibule d'or sertie d'un grenat : le signe des généraux.
    g.beginPath()
    g.arc(-6.6, -9.4, 2, 0, TAU)
    g.fillStyle = metalGradient(g, -8.6, -11.4, -4.6, -7.4, GOLD)
    g.fill()
    edge(g, 0.45)
    rivet(g, -6.6, -9.4, 0.85, GARNET)
    g.restore()
  }
}

/* ---------- Tête : cheveux, visage, barbe, coiffe ---------- */

/** Cheveux sur le crâne, de la naissance du front à la nuque (l'oreille reste visible). */
function hairTop(g, look) {
  g.beginPath()
  g.moveTo(-6.6, -20.2)
  g.quadraticCurveTo(-6.6, -24.8, -1, -25)
  g.quadraticCurveTo(5.8, -25, 6.6, -18.6)
  g.quadraticCurveTo(6.9, -14.2, 4.9, -11.4)
  g.quadraticCurveTo(4.4, -13.4, 4.6, -15.4)
  g.quadraticCurveTo(4.6, -19.6, 0.6, -20.8)
  g.quadraticCurveTo(-3.2, -22, -6.6, -20.2)
  g.closePath()
  hairFill(g, look.hair, 0, -25, 0, -11)
  strands(g, [[-4, -23.6, -1, -21.4], [0, -24.4, 2.6, -20.6], [3.8, -23.4, 5.2, -17.6], [5.8, -17.6, 5.4, -13]])
}

function beard(g, look) {
  const kind = look.beard
  if (!kind || kind === 'none') return
  const c = look.hair
  g.beginPath()
  if (kind === 'full') {
    // Barbe touffue jusque sur la poitrine.
    g.moveTo(4.4, -19)
    g.quadraticCurveTo(6.2, -12.6, 2.6, -7.6)
    g.quadraticCurveTo(-1.8, -3, -6.6, -6.2)
    g.quadraticCurveTo(-9.4, -8.6, -7.8, -12.4)
    g.quadraticCurveTo(-5.8, -11.4, -4.2, -11.9)
    g.quadraticCurveTo(-1.4, -12.6, 0.8, -15.2)
    g.quadraticCurveTo(2.2, -17.4, 4.4, -19)
    g.closePath()
    hairFill(g, c, 0, -19, -2, -4)
    strands(g, [[-6, -9.6, -5, -6.8], [-3, -9.6, -2.4, -5.6], [0, -11, 0.4, -7.4], [2.8, -14, 3, -9.6]])
  } else if (kind === 'short') {
    // Barbe taillée court le long de la mâchoire.
    g.moveTo(4.2, -18.6)
    g.quadraticCurveTo(5, -12.4, 1.2, -10)
    g.quadraticCurveTo(-3.4, -8.4, -6.6, -10.2)
    g.quadraticCurveTo(-7.4, -11.2, -6.6, -12.2)
    g.quadraticCurveTo(-4.6, -11.2, -2.6, -11.8)
    g.quadraticCurveTo(0.8, -12.8, 2.6, -15.6)
    g.closePath()
    hairFill(g, c, 0, -18, -2, -9)
  } else {
    // Longue barbe et deux nattes baguées.
    g.moveTo(4.4, -19)
    g.quadraticCurveTo(6, -12.6, 2.4, -8.6)
    g.lineTo(-6.4, -8.6)
    g.quadraticCurveTo(-8.8, -9.6, -7.6, -12.4)
    g.quadraticCurveTo(-5.6, -11.4, -4.2, -11.9)
    g.quadraticCurveTo(-1.4, -12.6, 0.8, -15.2)
    g.quadraticCurveTo(2.2, -17.4, 4.4, -19)
    g.closePath()
    hairFill(g, c, 0, -19, -2, -8)
    for (const [x, len] of [[-5, 9], [-1.4, 7.6]]) {
      for (let i = 0; i < 4; i++) {
        g.beginPath()
        g.ellipse(x - i * 0.15, -8.6 + i * (len / 4) + len / 8, 1.55 - i * 0.12, len / 8 + 0.35, 0, 0, TAU)
        hairFill(g, c, x - 1.5, -9, x + 1.5, -9 + len)
      }
      g.beginPath()
      roundRect(g, x - 1.8, -8.6 + len - 1.2, 3.4, 1.4, 0.5)
      g.fillStyle = metalGradient(g, x - 1.8, 0, x + 1.6, 0, look.trim)
      g.fill()
      edge(g, 0.35)
    }
  }
  // Moustache (la bouche reste visible dessous).
  g.beginPath()
  g.moveTo(-6.6, -13.2)
  g.quadraticCurveTo(-5.4, -14.8, -3.4, -14.2)
  g.quadraticCurveTo(-1.8, -14.8, -0.6, -13.6)
  g.quadraticCurveTo(-2.2, -13.5, -3.4, -13.3)
  g.quadraticCurveTo(-5.2, -13.1, -6.6, -13.2)
  g.closePath()
  hairFill(g, c, -6, -15, -2, -13)
}

/** Grand heaume (même facture que le chevalier), aux couleurs du général. */
function greatHelm(g, look, state) {
  const metal = look.metal ?? look.armor
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
  g.fillStyle = metalGradient(g, -9, 0, 7, 0, metal)
  g.fill()
  const top = g.createLinearGradient(0, -29, 0, -11)
  top.addColorStop(0, 'rgba(255,255,255,0.25)')
  top.addColorStop(0.4, 'rgba(255,255,255,0)')
  top.addColorStop(1, 'rgba(0,0,0,0.3)')
  g.fillStyle = top
  g.fill()
  edge(g, 0.65)
  // Fente de vision : un regard clair au repos, rougeoyant quand il est touché.
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
  // Renforts en croix, à la couleur de son ornement.
  g.beginPath()
  g.rect(-8.7, -21.4, 15.4, 1.2)
  g.rect(-8.7, -18.5, 15.4, 1.1)
  g.rect(-2.4, -28.6, 1.7, 17)
  g.fillStyle = metalGradient(g, -9, -29, 7, -11, look.trim)
  g.fill()
  edge(g, 0.35)
  g.fillStyle = '#100c0d'
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 2; j++) {
      g.beginPath()
      g.arc(-7 + i * 1.5, -15.6 + j * 1.6, 0.42, 0, TAU)
      g.fill()
    }
  }
  for (const x of [-7.6, -4, 2.2, 5.6]) rivet(g, x, -12.2, 0.5, metal)
  g.beginPath()
  g.ellipse(-5.6, -24, 0.9, 3.4, 0.08, 0, TAU)
  g.fillStyle = 'rgba(255,255,255,0.5)'
  g.fill()
}

/** Corne effilée le long d'une courbe (base, contrôle, pointe). */
function horn(g, [[x0, y0], [cx, cy], [x1, y1]], w) {
  const at = (u) => [(1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * cx + u * u * x1, (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * cy + u * u * y1]
  const left = []
  const right = []
  const N = 10
  for (let i = 0; i <= N; i++) {
    const u = i / N
    const [x, y] = at(u)
    const [nx, ny] = at(Math.min(1, u + 0.01))
    const [px, py] = at(Math.max(0, u - 0.01))
    const len = Math.hypot(nx - px, ny - py) || 1
    const half = (w * (1 - u * 0.92)) / 2
    left.push([x - ((ny - py) / len) * half, y + ((nx - px) / len) * half])
    right.push([x + ((ny - py) / len) * half, y - ((nx - px) / len) * half])
  }
  const outline = () => {
    g.beginPath()
    left.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
    for (let i = right.length - 1; i >= 0; i--) g.lineTo(right[i][0], right[i][1])
    g.closePath()
  }
  outline()
  const gr = g.createLinearGradient(x0, y0, x1, y1)
  gr.addColorStop(0, '#d8cdb4')
  gr.addColorStop(0.7, '#f2ead6')
  gr.addColorStop(1, '#4a4038')
  g.fillStyle = gr
  g.fill()
  lightOver(g, Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1), 0.2, 0.4)
  edge(g, 0.5)
  // Anneaux de croissance.
  g.strokeStyle = 'rgba(90,70,50,0.45)'
  g.lineWidth = 0.4
  for (const u of [0.15, 0.3, 0.45]) {
    const i = Math.round(u * N)
    g.beginPath()
    g.moveTo(left[i][0], left[i][1])
    g.lineTo(right[i][0], right[i][1])
    g.stroke()
  }
}

/**
 * Coiffes : `front` est peint par-dessus le visage, `back` derrière ;
 * `covers` cache tout le visage (heaume), `hairless` : pas de cheveux visibles.
 */
const HELMS = {
  /** Rufus : calotte de cuir bordée de fourrure. */
  cap: {
    front(g, look) {
      g.beginPath()
      g.moveTo(-7.6, -20.6)
      g.quadraticCurveTo(-8, -27, -1, -27.2)
      g.quadraticCurveTo(6.4, -27, 6.8, -19.4)
      g.quadraticCurveTo(0, -22, -7.6, -20.6)
      g.closePath()
      g.fillStyle = '#5a3b22'
      g.fill()
      lightOver(g, -8, -27, 7, -19, 0.25, 0.4)
      edge(g, 0.55)
      g.beginPath()
      g.moveTo(-1, -27)
      g.quadraticCurveTo(0.4, -24, 0, -21.4)
      stitches(g, 'rgba(240,215,160,0.6)', 0.35)
      g.beginPath()
      g.moveTo(-8.4, -19.6)
      g.quadraticCurveTo(-0.6, -22.8, 7.6, -18.6)
      g.lineCap = 'round'
      g.lineWidth = 3.4
      g.strokeStyle = tone(look.fur ?? '#7a5a3e', -0.35)
      g.stroke()
      g.lineWidth = 2.8
      g.strokeStyle = look.fur ?? '#7a5a3e'
      g.stroke()
      strands(g, Array.from({ length: 9 }, (_, i) => {
        const x = -7.6 + i * 1.8
        const y = -19.8 - Math.sin((i / 8) * Math.PI) * 1.4
        return [x, y - 1.2, x + 0.4, y + 1.1]
      }), 0.3)
    },
  },

  /** Galeran : grand heaume et cimier en éventail aux couleurs de sa cape. */
  great: {
    covers: true,
    front(g, look, state) {
      const crest = () => {
        g.beginPath()
        g.moveTo(-5.4, -28.6)
        g.bezierCurveTo(-7.2, -39, 10.6, -40.6, 8.4, -27.4)
      }
      crest()
      g.closePath()
      cloth(g, look.cape, -7, -40, 10.6, -27, 3)
      edge(g, 0.5)
      crest()
      g.lineWidth = 0.9
      g.strokeStyle = look.trim
      g.stroke()
      greatHelm(g, look, state)
    },
  },

  /** Bertille : coiffe de cuir, lunettes de laiton relevées, chignon roux, suie. */
  goggles: {
    back(g, look) {
      g.beginPath()
      g.arc(5.6, -22.2, 3, 0, TAU)
      hairFill(g, look.hair, 3, -25, 8, -19)
      strands(g, [[4.4, -24.4, 6.8, -21], [6.6, -24.6, 8.4, -22]])
    },
    front(g, look) {
      g.beginPath()
      g.moveTo(-7, -20.8)
      g.quadraticCurveTo(-7.2, -26.2, -1, -26.4)
      g.quadraticCurveTo(5.4, -26.2, 6.2, -20)
      g.quadraticCurveTo(0, -22.4, -7, -20.8)
      g.closePath()
      g.fillStyle = '#6a4a30'
      g.fill()
      lightOver(g, -7, -26.4, 6.2, -20, 0.25, 0.4)
      edge(g, 0.5)
      g.beginPath()
      g.moveTo(-7.4, -22)
      g.quadraticCurveTo(-0.4, -24.8, 6.4, -21.6)
      g.lineWidth = 1.2
      g.strokeStyle = '#2e2018'
      g.stroke()
      for (const [x, y] of [[-5.6, -22.6], [-1.8, -23.6]]) {
        g.beginPath()
        g.arc(x, y, 1.9, 0, TAU)
        g.fillStyle = metalGradient(g, x - 2, y - 2, x + 2, y + 2, look.trim)
        g.fill()
        edge(g, 0.4)
        g.beginPath()
        g.arc(x, y, 1.25, 0, TAU)
        const lens = g.createRadialGradient(x - 0.5, y - 0.5, 0.1, x, y, 1.3)
        lens.addColorStop(0, '#e8f6ff')
        lens.addColorStop(0.5, '#6aa0b8')
        lens.addColorStop(1, '#1d3440')
        g.fillStyle = lens
        g.fill()
      }
      g.beginPath()
      g.ellipse(-2.4, -13.8, 1.8, 1, -0.3, 0, TAU)
      g.fillStyle = 'rgba(30,24,20,0.28)'
      g.fill()
    },
  },

  /** Morgane : longue chevelure noire, cercle d'argent et améthyste. */
  circlet: {
    back(g, look) {
      g.beginPath()
      g.moveTo(-5.6, -22.6)
      g.quadraticCurveTo(-2.4, -26.6, 3, -25.4)
      g.quadraticCurveTo(8.8, -23.4, 8.8, -14)
      g.quadraticCurveTo(9.4, -6.4, 11, -2.6)
      g.quadraticCurveTo(7.4, -1.8, 4.4, -3.4)
      g.quadraticCurveTo(5, -8.6, 3, -12)
      g.closePath()
      hairFill(g, look.hair, 0, -26, 8, -2)
      g.beginPath()
      g.moveTo(5.4, -22)
      g.quadraticCurveTo(7.6, -14, 8.4, -4.4)
      g.lineWidth = 0.7
      g.strokeStyle = 'rgba(190,170,230,0.35)'
      g.stroke()
    },
    front(g, look) {
      g.beginPath()
      g.moveTo(-6.9, -20.8)
      g.quadraticCurveTo(-1, -23.4, 6, -21.4)
      g.lineWidth = 1.1
      g.strokeStyle = metalGradient(g, -7, -23, 6, -20, look.trim)
      g.stroke()
      g.beginPath()
      g.moveTo(-5.8, -23.4)
      g.lineTo(-4.8, -21.6)
      g.lineTo(-5.8, -19.8)
      g.lineTo(-6.8, -21.6)
      g.closePath()
      const gem = g.createLinearGradient(-6.8, -23.4, -4.8, -19.8)
      gem.addColorStop(0, '#e6c8ff')
      gem.addColorStop(0.5, '#9b59d0')
      gem.addColorStop(1, '#3a1660')
      g.fillStyle = gem
      g.fill()
      edge(g, 0.35)
    },
  },

  /** Anselme : capuchon profond qui jette une ombre sur ses yeux. */
  hood: {
    hairless: true,
    front(g, look) {
      g.beginPath()
      g.moveTo(-8.2, -10.8)
      g.quadraticCurveTo(-10.4, -20, -7.4, -26.2)
      g.quadraticCurveTo(-2, -30.4, 5.4, -27.6)
      g.quadraticCurveTo(12.6, -23.2, 12.6, -11.2)
      g.quadraticCurveTo(8.4, -8.2, 1.6, -9)
      g.closePath()
      // L'ouverture du visage (tracée à rebours : elle reste vide).
      g.moveTo(-3.2 + 4.6 * Math.cos(0.1), -16.6 + 4.6 * Math.sin(0.1))
      g.ellipse(-3.2, -16.6, 4.6, 6.4, 0.1, 0, TAU, true)
      cloth(g, look.cape, -10.4, -30.4, 12.6, -8.2, 3)
      edge(g, 0.55)
      g.save()
      g.beginPath()
      g.ellipse(-3.2, -16.6, 4.6, 6.4, 0.1, 0, TAU)
      g.clip()
      const sh = g.createLinearGradient(0, -23, 0, -15.4)
      sh.addColorStop(0, 'rgba(10,8,6,0.78)')
      sh.addColorStop(1, 'rgba(10,8,6,0)')
      g.fillStyle = sh
      g.fillRect(-9, -24, 12, 10)
      g.restore()
    },
  },

  /** Ilsa : turban de lin bandé de rouge, voile sur le bas du visage. */
  veil: {
    hairless: true,
    front(g, look) {
      const linen = '#e9dcc0'
      g.beginPath()
      g.moveTo(6.6, -19)
      g.quadraticCurveTo(10.6, -14, 9.4, -6.6)
      g.lineTo(7, -7.4)
      g.quadraticCurveTo(7.8, -13, 5.2, -15.6)
      g.closePath()
      cloth(g, linen, 5, -19, 10.6, -6.6, 2)
      edge(g, 0.5)
      g.beginPath()
      g.moveTo(-7.4, -19.6)
      g.quadraticCurveTo(-8.6, -28.4, -0.6, -28.6)
      g.quadraticCurveTo(7.8, -28.2, 7.4, -18.4)
      g.quadraticCurveTo(7.6, -14.4, 5.6, -12.4)
      g.quadraticCurveTo(3, -15.4, 2.8, -19.4)
      g.quadraticCurveTo(-2.4, -21.4, -7.4, -19.6)
      g.closePath()
      cloth(g, linen, -8.6, -28.6, 7.8, -12.4, 3)
      edge(g, 0.55)
      g.strokeStyle = 'rgba(120,90,50,0.45)'
      g.lineWidth = 0.5
      for (const k of [0, 1, 2]) {
        g.beginPath()
        g.moveTo(-7.6 + k * 0.4, -21.4 - k * 2.2)
        g.quadraticCurveTo(0, -24 - k * 2.4, 7 - k * 0.6, -19.8 - k * 2.4)
        g.stroke()
      }
      g.beginPath()
      g.moveTo(-7.8, -22.6)
      g.quadraticCurveTo(-0.4, -25.8, 7.4, -21.8)
      g.lineWidth = 1.4
      g.strokeStyle = look.cape
      g.stroke()
      g.beginPath()
      g.moveTo(-7.4, -15.6)
      g.quadraticCurveTo(-3.6, -16.6, 2.6, -15.8)
      g.quadraticCurveTo(4.4, -12, 2.6, -8.6)
      g.quadraticCurveTo(-3, -7, -8.2, -9.6)
      g.quadraticCurveTo(-8.8, -12.6, -7.4, -15.6)
      g.closePath()
      cloth(g, look.cape, -8.8, -16.6, 4.4, -7, 3)
      edge(g, 0.5)
      for (let i = 0; i < 5; i++) rivet(g, -6.6 + i * 2, -15.6 - Math.sin((i / 4) * Math.PI) * 0.3, 0.45, look.trim)
    },
  },

  /** Hugues : chapeau de feutre et longue plume de faucon. */
  feathered: {
    front(g, look) {
      const plume = () => {
        g.beginPath()
        g.moveTo(2.6, -26.2)
        g.quadraticCurveTo(10, -33.4, 17.4, -31.6)
        g.quadraticCurveTo(10.4, -29.2, 3.8, -24.6)
        g.closePath()
      }
      plume()
      g.fillStyle = '#ecebe6'
      g.fill()
      edge(g, 0.4)
      g.save()
      plume()
      g.clip()
      g.strokeStyle = 'rgba(70,64,60,0.6)'
      g.lineWidth = 0.7
      for (let i = 0; i < 6; i++) {
        const x = 5 + i * 2.2
        g.beginPath()
        g.moveTo(x, -33)
        g.lineTo(x + 1.2, -24)
        g.stroke()
      }
      g.restore()
      g.beginPath()
      g.moveTo(2.8, -25.6)
      g.quadraticCurveTo(10, -31.4, 17.4, -31.6)
      g.lineWidth = 0.4
      g.strokeStyle = 'rgba(60,50,40,0.8)'
      g.stroke()
      g.beginPath()
      g.moveTo(-6.4, -22.4)
      g.quadraticCurveTo(-6.6, -29, 0, -29.2)
      g.quadraticCurveTo(6, -29, 6, -22.2)
      g.closePath()
      cloth(g, look.cape, -6.6, -29.2, 6, -22.2, 2)
      edge(g, 0.5)
      g.beginPath()
      roundRect(g, -6.5, -24.4, 12.6, 1.8, 0.6)
      g.fillStyle = look.trim
      g.fill()
      edge(g, 0.3)
      g.beginPath()
      g.moveTo(-10.4, -21.6)
      g.quadraticCurveTo(-1, -24.4, 8.6, -23.8)
      g.quadraticCurveTo(10.2, -24.8, 9.6, -22.2)
      g.quadraticCurveTo(-0.6, -20.8, -10.4, -21.6)
      g.closePath()
      g.fillStyle = tone(look.cape, -0.2)
      g.fill()
      edge(g, 0.5)
    },
  },

  /** Ulric : haute toque de fourrure blanche au fond de drap bleu, broche de givre. */
  fur: {
    front(g, look) {
      const fur = look.fur ?? '#eef2f6'
      // Fond de drap, qui dépasse en haut.
      g.beginPath()
      g.moveTo(-6.4, -28)
      g.quadraticCurveTo(-5.6, -32.4, -0.6, -32.6)
      g.quadraticCurveTo(4.8, -32.4, 5.6, -27.8)
      g.closePath()
      cloth(g, look.trim, -6.4, -32.6, 5.6, -27.8, 2)
      edge(g, 0.45)
      // Bonnet de fourrure : bords pelucheux en haut et en bas.
      const bumps = 7
      g.beginPath()
      g.moveTo(-8, -28.4)
      for (let i = 0; i < bumps; i++) {
        const x0 = -8 + (15.2 * i) / bumps
        const x1 = -8 + (15.2 * (i + 1)) / bumps
        g.quadraticCurveTo((x0 + x1) / 2, -30.2 + (i % 2) * 0.4, x1, -28.4 + (i === bumps - 1 ? 0.4 : 0))
      }
      g.lineTo(7.6, -20.2)
      for (let i = bumps; i > 0; i--) {
        const x0 = -8.4 + (16 * i) / bumps
        const x1 = -8.4 + (16 * (i - 1)) / bumps
        g.quadraticCurveTo((x0 + x1) / 2, -18.4 - (i % 2) * 0.4, x1, -20 - (i === 1 ? 0.2 : 0))
      }
      g.closePath()
      const gr = g.createLinearGradient(-8, -30, 7.6, -18.6)
      gr.addColorStop(0, tone(fur, 0.4))
      gr.addColorStop(0.55, fur)
      gr.addColorStop(1, tone(fur, -0.3))
      g.fillStyle = gr
      g.fill()
      lightOver(g, -8.4, -30.2, 7.6, -18.4, 0.15, 0.3)
      edge(g, 0.5)
      strands(g, Array.from({ length: 12 }, (_, i) => {
        const x = -7.2 + i * 1.3
        const y = -27.6 + (i % 3) * 2.4
        return [x, y, x + 0.5, y + 1.6]
      }), 0.16)
      rivet(g, -5.8, -24.4, 1.3, look.trim)
      g.beginPath()
      g.arc(-6.2, -24.8, 0.45, 0, TAU)
      g.fillStyle = 'rgba(255,255,255,0.9)'
      g.fill()
    },
  },

  /** Baudouin : casque à nasal cerclé d'or, deux grandes cornes. */
  horned: {
    front(g, look) {
      const metal = look.armor
      horn(g, [[4.6, -24], [10.4, -27], [12.6, -34.6]], 2.4)
      g.beginPath()
      g.moveTo(-8, -19.8)
      g.quadraticCurveTo(-8.2, -27.6, -1, -27.8)
      g.quadraticCurveTo(6.4, -27.6, 6.8, -19.6)
      g.closePath()
      g.fillStyle = metalGradient(g, -8, -28, 7, -19, metal)
      g.fill()
      lightOver(g, -8, -28, 7, -19, 0.25, 0.4)
      edge(g, 0.55)
      g.beginPath()
      roundRect(g, -8.4, -21.6, 15.6, 2.2, 0.6)
      g.fillStyle = metalGradient(g, -8.4, -21.6, 7.2, -19.4, look.trim)
      g.fill()
      edge(g, 0.35)
      g.beginPath()
      roundRect(g, -7.4, -21.2, 1.7, 6.8, 0.6)
      g.fillStyle = metalGradient(g, -7.4, 0, -5.7, 0, metal)
      g.fill()
      edge(g, 0.4)
      for (const x of [-4.4, -0.6, 3.2]) rivet(g, x, -20.5, 0.45, metal)
      horn(g, [[-5.6, -24.6], [-11.4, -26.8], [-12.2, -34.2]], 2.8)
    },
  },

  /** Mordrac : couronne de fer noir à pointes, grenats ; une cicatrice sur l'œil. */
  crown: {
    front(g, look) {
      g.beginPath()
      g.moveTo(-2.6, -20.8)
      g.lineTo(0.4, -13.4)
      g.lineWidth = 0.55
      g.strokeStyle = 'rgba(150,70,70,0.8)'
      g.stroke()
      const spikes = [-6.4, -3, 0.6, 4]
      const peaks = [-30.2, -32.6, -33, -30.8]
      g.beginPath()
      g.moveTo(-7.8, -21.4)
      g.lineTo(-7.8, -24.6)
      spikes.forEach((x, i) => {
        g.lineTo(x - 1.4, -24.6)
        g.lineTo(x, peaks[i])
        g.lineTo(x + 1.4, -24.6)
      })
      g.lineTo(6, -24.4)
      g.lineTo(6, -21.2)
      g.quadraticCurveTo(-1, -22.6, -7.8, -21.4)
      g.closePath()
      g.fillStyle = metalGradient(g, -8, -33, 6, -21, look.metal ?? '#4a4458')
      g.fill()
      edge(g, 0.5)
      g.beginPath()
      g.moveTo(-7.8, -21.6)
      g.quadraticCurveTo(-1, -23, 6, -21.4)
      g.lineWidth = 0.9
      g.strokeStyle = look.trim
      g.stroke()
      for (const [x, y] of [[-5, -23.1], [-1, -23.6], [3, -23.2]]) rivet(g, x, y, 0.75, GARNET)
    },
  },
}

function headLayer(look) {
  const helm = HELMS[look.helm]
  return (g, { state }) => {
    helm.back?.(g, look, state)
    if (!helm.covers) {
      head(g, FACE.x, FACE.y, FACE.r, state, { skin: look.skin, stubble: Boolean(look.beard) && look.beard !== 'none', old: Boolean(look.old) })
      if (!helm.hairless) hairTop(g, look)
      beard(g, look)
    }
    helm.front(g, look, state)
  }
}

/* ---------- Bras armé (et ce qu'il tient) ---------- */

/** Bras arrière : manche, épaulière, main serrée en x, y. */
function backArm(g, look, pts) {
  sleeve(g, look, pts)
  const [x, y] = pts[pts.length - 1]
  glove(g, look, x + 0.2, y + 0.5)
  pauldron(g, look, 9.4, -7.4)
}

/** Manche de bois (hache, marteau, bâton) de a à b. */
function haft(g, [x0, y0], [x1, y1], w, color = null) {
  const a = Math.atan2(y1 - y0, x1 - x0)
  const nx = -Math.sin(a) * (w / 2)
  const ny = Math.cos(a) * (w / 2)
  g.beginPath()
  g.moveTo(x0 + nx, y0 + ny)
  g.lineTo(x1 + nx, y1 + ny)
  g.lineTo(x1 - nx, y1 - ny)
  g.lineTo(x0 - nx, y0 - ny)
  g.closePath()
  g.fillStyle = color ?? woodPattern(g, { angle: Math.PI / 2, unitsPerTile: 120 })
  g.fill()
  g.fillStyle = 'rgba(0,0,0,0.16)'
  g.fill()
  edge(g, 0.5)
}

/** Lame droite (épée, lame noire) tenue en x, y. */
function blade(g, look, { x = 14.4, y = 3.6, len, w, metal }) {
  g.beginPath()
  g.moveTo(x - w / 2, y - 3.2)
  g.lineTo(x - w / 2, y - len + 3)
  g.lineTo(x, y - len)
  g.lineTo(x + w / 2, y - len + 3)
  g.lineTo(x + w / 2, y - 3.2)
  g.closePath()
  g.fillStyle = metalGradient(g, x - w, 0, x + w, 0, metal)
  g.fill()
  edge(g, 0.45)
  g.beginPath()
  g.moveTo(x, y - 4.2)
  g.lineTo(x, y - len + 5)
  g.lineWidth = Math.max(0.4, w * 0.22)
  g.strokeStyle = 'rgba(0,0,0,0.35)'
  g.stroke()
  // Garde, fusée de cuir, pommeau.
  g.beginPath()
  roundRect(g, x - 3.8 - w * 0.4, y - 3.4, 7.6 + w * 0.8, 1.5, 0.6)
  g.fillStyle = metalGradient(g, x - 4, y - 3.4, x + 4, y - 1.9, look.trim)
  g.fill()
  edge(g, 0.4)
  g.beginPath()
  roundRect(g, x - 0.8, y - 1.9, 1.6, 4.8, 0.6)
  g.fillStyle = '#3a2416'
  g.fill()
  rivet(g, x, y + 3.6, 1.15, look.trim)
}

const WEAPONS = {
  /** Hache à large fer en croissant, tournée vers l'ennemi. */
  axe(g, look) {
    const metal = look.metal ?? STEEL
    haft(g, [14, 19], [15.4, -20], 1.7)
    g.beginPath()
    g.moveTo(14.6, -17.6)
    g.quadraticCurveTo(11.4, -18.4, 8.6, -21.6)
    g.quadraticCurveTo(6.2, -14.6, 8.4, -7.4)
    g.quadraticCurveTo(11.2, -10.6, 14.8, -11.2)
    g.closePath()
    g.fillStyle = metalGradient(g, 7, -22, 15, -7, metal)
    g.fill()
    lightOver(g, 6, -22, 15, -7, 0.25, 0.35)
    edge(g, 0.55)
    g.beginPath()
    g.moveTo(8.6, -21.2)
    g.quadraticCurveTo(6.4, -14.6, 8.4, -7.8)
    g.lineWidth = 0.8
    g.strokeStyle = 'rgba(255,255,255,0.7)'
    g.stroke()
    g.beginPath()
    g.moveTo(16, -16.6)
    g.lineTo(19.2, -14.6)
    g.lineTo(16, -12.4)
    g.closePath()
    g.fillStyle = metalGradient(g, 16, -17, 19, -12, metal)
    g.fill()
    edge(g, 0.45)
    g.beginPath()
    roundRect(g, 13.8, -10.6, 2.4, 2.6, 0.5)
    g.fillStyle = LEATHER
    g.fill()
    edge(g, 0.35)
    backArm(g, look, [[8.6, -6], [12, -0.5], [14.1, 3]])
  },

  /** Épée longue, garde dorée, levée droite. */
  sword(g, look) {
    blade(g, look, { len: 30, w: 2, metal: look.metal ?? STEEL })
    backArm(g, look, [[8.6, -6], [12, -0.5], [14.1, 3]])
  },

  /** La lame noire de Mordrac : large, sombre, une rune rouge dans la gouttière. */
  blackblade(g, look) {
    blade(g, look, { len: 37, w: 3, metal: look.metal ?? '#4a4458' })
    backArm(g, look, [[8.6, -6], [12, -0.5], [14.1, 3]])
  },

  /** Bombe de fer levée au-dessus de l'épaule, mèche courte. */
  bomb(g, look) {
    g.beginPath()
    g.arc(14.8, -19.8, 4.4, 0, TAU)
    const iron = g.createRadialGradient(13.4, -21.4, 0.4, 14.8, -19.8, 4.6)
    iron.addColorStop(0, '#8a8f98')
    iron.addColorStop(0.35, '#3a3d44')
    iron.addColorStop(1, '#121317')
    g.fillStyle = iron
    g.fill()
    edge(g, 0.55)
    g.beginPath()
    roundRect(g, 16.4, -25.2, 2.6, 2.2, 0.5)
    g.fillStyle = metalGradient(g, 16.4, -25.2, 19, -23, look.trim)
    g.fill()
    edge(g, 0.35)
    g.beginPath()
    g.moveTo(17.7, -25)
    g.quadraticCurveTo(18.4, -27.4, 19.8, -27.8)
    g.lineWidth = 0.7
    g.strokeStyle = '#d9c39a'
    g.stroke()
    backArm(g, look, [[8.6, -6], [12.8, -9.6], [13.8, -14.4]])
  },

  /** Bâton de nuit : hampe sombre, croissant d'argent, orbe d'améthyste. */
  staff(g, look) {
    haft(g, [15.6, 25], [13.6, -29], 1.6, '#2a1f2e')
    g.beginPath()
    g.arc(13.5, -33, 5, Math.PI * 0.08, Math.PI * 0.92)
    g.arc(13.5, -34.4, 3.9, Math.PI * 0.95, Math.PI * 0.05, true)
    g.closePath()
    g.fillStyle = metalGradient(g, 8.5, -38, 18.5, -28, look.trim)
    g.fill()
    edge(g, 0.45)
    g.beginPath()
    g.arc(13.5, -33.6, 2.5, 0, TAU)
    const orb = g.createRadialGradient(12.7, -34.4, 0.3, 13.5, -33.6, 2.6)
    orb.addColorStop(0, '#f1e2ff')
    orb.addColorStop(0.45, '#a46ae0')
    orb.addColorStop(1, '#3a1660')
    g.fillStyle = orb
    g.fill()
    edge(g, 0.35)
    backArm(g, look, [[8.6, -6], [12, -0.5], [14.1, 3]])
  },

  /** Dague tenue lame en bas (l'autre main en tient une deuxième). */
  dagger(g, look) {
    backArm(g, look, [[8.6, -6], [11.4, 0], [12.6, 5.4]])
    dagger(g, look, 12.8, 6.6)
  },

  /** Cimeterre courbe, élargi vers la pointe. */
  saber(g, look) {
    g.beginPath()
    g.moveTo(13.6, 0.8)
    g.quadraticCurveTo(12.6, -12, 19.6, -21.4)
    g.quadraticCurveTo(19.2, -16.4, 17.6, -13.6)
    g.quadraticCurveTo(15.6, -8, 15.4, 0.8)
    g.closePath()
    g.fillStyle = metalGradient(g, 12.6, -21, 20, 1, look.metal ?? STEEL)
    g.fill()
    edge(g, 0.45)
    g.beginPath()
    g.moveTo(14.3, -0.4)
    g.quadraticCurveTo(13.6, -11, 19, -20.2)
    g.lineWidth = 0.4
    g.strokeStyle = 'rgba(255,255,255,0.6)'
    g.stroke()
    g.beginPath()
    roundRect(g, 10.8, 0.6, 7.2, 1.3, 0.6)
    g.fillStyle = metalGradient(g, 10.8, 0.6, 18, 1.9, look.trim)
    g.fill()
    edge(g, 0.35)
    rivet(g, 10.8, 1.25, 0.8, look.trim)
    rivet(g, 18, 1.25, 0.8, look.trim)
    g.beginPath()
    roundRect(g, 13.6, 1.9, 1.6, 4.4, 0.6)
    g.fillStyle = '#3a2416'
    g.fill()
    backArm(g, look, [[8.6, -6], [12, -0.5], [14.1, 3]])
  },

  /** Poing ganté levé, un faucon pèlerin perché dessus. */
  falcon(g, look) {
    backArm(g, look, [[8.6, -6], [12.6, -8.6], [14.4, -13.6]])
    // Gant épais de fauconnier.
    g.beginPath()
    roundRect(g, 12.6, -14.6, 4.4, 5.6, 1.2)
    g.fillStyle = '#7a5434'
    g.fill()
    edge(g, 0.45)
    perchedFalcon(g)
  },

  /** Grand marteau de guerre : masse de fer cerclée d'or, pointe arrière. */
  hammer(g, look) {
    haft(g, [13.8, 17], [15.4, -20.6], 1.9)
    const metal = look.metal ?? '#5b6170'
    g.beginPath()
    roundRect(g, 10.2, -26.4, 10, 6.8, 1.2)
    g.fillStyle = metalGradient(g, 10.2, -26.4, 20.2, -19.6, metal)
    g.fill()
    lightOver(g, 10.2, -26.4, 20.2, -19.6, 0.25, 0.4)
    edge(g, 0.55)
    g.beginPath()
    g.moveTo(20.2, -24.6)
    g.lineTo(23.6, -23)
    g.lineTo(20.2, -21.4)
    g.closePath()
    g.fillStyle = metalGradient(g, 20, -25, 24, -21, metal)
    g.fill()
    edge(g, 0.45)
    g.beginPath()
    g.rect(13.4, -26.4, 1.2, 6.8)
    g.rect(16, -26.4, 1.2, 6.8)
    g.fillStyle = metalGradient(g, 13, -26, 17, -19, look.trim)
    g.fill()
    g.beginPath()
    roundRect(g, 9.6, -25.6, 1.4, 5.2, 0.4)
    g.fillStyle = metalGradient(g, 9.6, -25.6, 11, -20.4, metal)
    g.fill()
    edge(g, 0.35)
    backArm(g, look, [[8.6, -6], [12, -0.5], [14.1, 3]])
  },
}

/** Faucon pèlerin perché sur le poing (ailes repliées ; elles s'ouvrent en direct). */
function perchedFalcon(g) {
  g.beginPath()
  g.moveTo(16.2, -16.6)
  g.lineTo(20.4, -10.8)
  g.lineTo(18.4, -10)
  g.lineTo(15.2, -15.4)
  g.closePath()
  g.fillStyle = '#4f4034'
  g.fill()
  edge(g, 0.4)
  g.beginPath()
  g.ellipse(15.4, -19.4, 3.2, 4.4, 0.35, 0, TAU)
  const chest = g.createLinearGradient(12.4, -22, 18, -16)
  chest.addColorStop(0, '#efe4cf')
  chest.addColorStop(0.45, '#cdb894')
  chest.addColorStop(1, '#5c4a3a')
  g.fillStyle = chest
  g.fill()
  edge(g, 0.45)
  g.strokeStyle = 'rgba(70,55,40,0.55)'
  g.lineWidth = 0.4
  for (const y of [-20.6, -19, -17.4]) {
    g.beginPath()
    g.moveTo(12.8, y)
    g.lineTo(14.6, y + 0.4)
    g.stroke()
  }
  g.beginPath()
  g.ellipse(16.8, -18.4, 2.4, 4.4, 0.5, 0, TAU)
  g.fillStyle = '#4a3a2c'
  g.fill()
  edge(g, 0.4)
  g.beginPath()
  g.arc(14.2, -23.6, 2.2, 0, TAU)
  g.fillStyle = '#2e2622'
  g.fill()
  edge(g, 0.4)
  g.beginPath()
  g.ellipse(13.6, -22.8, 1, 1.2, 0, 0, TAU)
  g.fillStyle = '#efe4cf'
  g.fill()
  g.beginPath()
  g.moveTo(12.4, -24.2)
  g.quadraticCurveTo(11, -24, 11.4, -22.6)
  g.lineTo(12.4, -23)
  g.closePath()
  g.fillStyle = '#e8b03a'
  g.fill()
  edge(g, 0.3)
  g.beginPath()
  g.arc(13.6, -24.2, 0.45, 0, TAU)
  g.fillStyle = '#0d0907'
  g.fill()
  g.strokeStyle = '#e8b03a'
  g.lineWidth = 0.5
  g.beginPath()
  g.moveTo(14.4, -15.4)
  g.lineTo(14, -14.2)
  g.moveTo(15.8, -15.2)
  g.lineTo(15.8, -14)
  g.stroke()
}

/* ---------- Détails vivants (redessinés à chaque image, jamais en cache) ---------- */

const LIVE = {
  /** Étincelle de la mèche : elle crépite. */
  bomb(ctx, look, { t, seed, still }) {
    const k = still ? 0.5 : 0.5 + 0.5 * Math.sin(t * 31 + seed)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const r = 1.6 + k * 1.2
    const gr = ctx.createRadialGradient(19.8, -27.8, 0, 19.8, -27.8, r * 2.2)
    gr.addColorStop(0, 'rgba(255,250,220,0.95)')
    gr.addColorStop(0.35, 'rgba(255,190,70,0.75)')
    gr.addColorStop(1, 'rgba(255,120,30,0)')
    ctx.fillStyle = gr
    ctx.beginPath()
    ctx.arc(19.8, -27.8, r * 2.2, 0, TAU)
    ctx.fill()
    if (!still) {
      ctx.fillStyle = 'rgba(255,220,120,0.9)'
      for (let i = 0; i < 3; i++) {
        const a = t * 9 + seed + i * 2.1
        const d = 1.6 + ((t * 7 + i * 0.37) % 1) * 3
        ctx.fillRect(19.8 + Math.cos(a) * d - 0.25, -27.8 + Math.sin(a) * d - 0.25, 0.5, 0.5)
      }
    }
    ctx.restore()
  },

  /** L'orbe d'améthyste respire. */
  staff(ctx, look, { t, seed, still }) {
    const k = still ? 0.5 : 0.5 + 0.5 * Math.sin(t * 2.4 + seed)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    const r = 5 + k * 2.4
    const gr = ctx.createRadialGradient(13.5, -33.6, 0, 13.5, -33.6, r)
    gr.addColorStop(0, `rgba(210,160,255,${0.5 + k * 0.3})`)
    gr.addColorStop(1, 'rgba(150,80,230,0)')
    ctx.fillStyle = gr
    ctx.beginPath()
    ctx.arc(13.5, -33.6, r, 0, TAU)
    ctx.fill()
    ctx.restore()
  },

  /** De brefs arcs d'orage autour de la masse. */
  hammer(ctx, look, { t, seed, still }) {
    if (still) return
    const beat = (t * 0.7 + seed * 0.13) % 1
    if (beat > 0.14) return
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (let i = 0; i < 2; i++) {
      const phase = Math.floor(t * 30) + i * 7 + Math.floor(seed)
      const pts = []
      for (let j = 0; j < 5; j++) {
        const u = j / 4
        const n = Math.sin(phase * 12.9898 + j * 78.233) * 43758.5453
        pts.push([10 + u * 12 + (n - Math.floor(n) - 0.5) * 2, -30 + i * 14 + (u - 0.5) * 4 * (i ? -1 : 1) + (n - Math.floor(n) - 0.5) * 3])
      }
      for (const [w, col] of [[2.2, 'rgba(120,170,255,0.5)'], [0.8, 'rgba(235,245,255,0.95)']]) {
        ctx.beginPath()
        pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
        ctx.lineWidth = w
        ctx.strokeStyle = col
        ctx.stroke()
      }
    }
    ctx.restore()
  },

  /** La rune de la lame noire rougeoie lentement. */
  blackblade(ctx, look, { t, seed, still }) {
    const k = still ? 0.6 : 0.5 + 0.5 * Math.sin(t * 1.8 + seed)
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.beginPath()
    ctx.moveTo(14.4, -2)
    ctx.lineTo(14.4, -27)
    ctx.lineWidth = 1.6
    ctx.strokeStyle = `rgba(255,40,40,${0.18 + k * 0.25})`
    ctx.stroke()
    ctx.lineWidth = 0.6
    ctx.strokeStyle = `rgba(255,140,120,${0.45 + k * 0.4})`
    ctx.stroke()
    ctx.restore()
  },

  /** Le faucon ouvre ses ailes de temps en temps (un battement, puis il les replie). */
  falcon(ctx, look, { t, seed, still }) {
    if (still) return
    const cycle = 5.2 + (seed % 1.4)
    const u = ((t + seed * 3) % cycle) / 0.7
    if (u >= 1) return
    const open = Math.sin(u * Math.PI)
    const flap = Math.sin(u * Math.PI * 4) * 0.25
    ctx.save()
    for (const side of [-1, 1]) {
      ctx.save()
      ctx.translate(16, -20.4)
      ctx.rotate(side * (0.4 + open * 0.9 + flap))
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.quadraticCurveTo(side * 3, -6 * open - 1, side * 8 * open, -7 * open)
      ctx.quadraticCurveTo(side * 5, -2, 0, 2)
      ctx.closePath()
      ctx.fillStyle = side > 0 ? '#3f3226' : '#5c4a3a'
      ctx.fill()
      ctx.lineWidth = 0.4
      ctx.strokeStyle = 'rgba(30,20,16,0.9)'
      ctx.stroke()
      ctx.restore()
    }
    ctx.restore()
  },
}

/* ---------- Écu de Galeran (calque à part : il le lève en garde) ---------- */

function shieldLayer(look) {
  return (g) => {
    g.save()
    g.translate((1 - look.bulk) * 9, 0)
    const shield = () => {
      g.beginPath()
      g.moveTo(-17, -8.4)
      g.lineTo(-1.2, -8.4)
      g.quadraticCurveTo(-1, 6.4, -9.1, 14.6)
      g.quadraticCurveTo(-17.2, 6.4, -17, -8.4)
      g.closePath()
    }
    shield()
    g.fillStyle = look.cape
    g.fill()
    g.save()
    g.clip()
    // Chevron d'or.
    g.beginPath()
    g.moveTo(-18, 7)
    g.lineTo(-9.1, -1.4)
    g.lineTo(-0.2, 7)
    g.lineTo(-0.2, 11.4)
    g.lineTo(-9.1, 3)
    g.lineTo(-18, 11.4)
    g.closePath()
    g.fillStyle = look.trim
    g.fill()
    g.fillStyle = 'rgba(90,60,30,0.3)'
    for (const [x, y, r] of [[-13, -5, 0.8], [-4, -3, 0.6], [-11, 9, 0.7]]) {
      g.beginPath()
      g.arc(x, y, r, 0, TAU)
      g.fill()
    }
    g.restore()
    shield()
    lightOver(g, -17, -8.4, -1, 14.6, 0.4, 0.45)
    g.lineWidth = 1.3
    g.strokeStyle = metalGradient(g, -17, -8, -1, 14, look.trim)
    g.stroke()
    shield()
    edge(g, 0.4)
    for (const x of [-15, -3.2]) rivet(g, x, -6.8, 0.55, look.trim)
    g.restore()
  }
}

/* ---------- Gabarits ---------- */

/** Gestes au repos selon l'arme (voir pose() dans characters.js). */
const ACTIONS = {
  axe: ['brandish', 'lookBack', 'nod'],
  sword: ['brandish', 'nod', 'lookBack'],
  blackblade: ['brandish', 'nod', 'lookBack'],
  bomb: ['raise', 'lookBack', 'nod'],
  staff: ['raise', 'scan', 'nod'],
  dagger: ['scan', 'lookBack', 'nod'],
  saber: ['brandish', 'scan', 'lookBack'],
  falcon: ['raise', 'lookUp', 'scan'],
  hammer: ['raise', 'lookUp', 'brandish'],
}

function rigFor(id) {
  const look = GENERALS[id].look
  const k = look.bulk
  const live = LIVE[look.weapon]
  const layers = [
    { name: 'cape', paint: capeLayer(look), pivot: [2 * k, -11] },
    { name: 'body', paint: bodyLayer(look) },
    {
      name: 'arm',
      paint: (g) => {
        g.save()
        g.translate((k - 1) * SHOULDER[0], 0)
        WEAPONS[look.weapon](g, look)
        g.restore()
      },
      pivot: [SHOULDER[0] * k, SHOULDER[1]],
      live: live
        ? (ctx, o) => {
            ctx.save()
            ctx.translate((k - 1) * SHOULDER[0], 0)
            live(ctx, look, o)
            ctx.restore()
          }
        : undefined,
    },
    { name: 'head', paint: headLayer(look), pivot: NECK, face: true },
  ]
  if (look.offhand === 'shield') layers.push({ name: 'shield', paint: shieldLayer(look), pivot: [-9 * k, -8] })
  return {
    size: [30, 54],
    box: { x: -24, y: -44, w: 50, h: 74 },
    layers,
    actions: look.offhand === 'shield' ? ['shield', 'lookBack', 'nod'] : ACTIONS[look.weapon],
    // Un projectile en vol : arme levée, écu en garde.
    brace: { arm: [-2.2, -0.12], shield: -3.4 },
  }
}

/** Un peintre par général ; `extra.general` dit lequel dessiner. */
const BY_ID = Object.freeze(Object.fromEntries(GENERAL_IDS.map((id) => [id, animated(`general-${id}`, rigFor(id))])))

export const GENERAL_PAINTERS = Object.freeze({
  'target.general': (ctx, s) => (BY_ID[s.extra?.general] ?? BY_ID.rufus)(ctx, s),
})
