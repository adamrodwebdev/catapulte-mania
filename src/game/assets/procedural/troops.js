/**
 * Nouveaux défenseurs (v5.8) : éclaireur, pavoisier, porte-étendard, sapeur.
 *
 * Même facture que les personnages de characters.js (calques détaillés mis
 * en cache, animés par de simples transformations), et des silhouettes qui
 * disent leur rôle au premier coup d'œil :
 *  - l'éclaireur : capuche verte, carquois, silhouette fine (il court vite) ;
 *  - le pavoisier : un grand pavois aux couleurs de son camp (il arrête les tirs tendus) ;
 *  - le porte-étendard : une bannière qui flotte au-dessus de tous (abattez-le d'abord) ;
 *  - le sapeur : tablier de cuir et marteau (il répare entre deux tirs).
 * Repère : centre du corps physique ; ils regardent vers la gauche.
 */
import { TAU, edge, lightOver, metalGradient, rivet, roundRect, woodPattern, stitches, leather } from './realism.js'
import { animated, boot, cloth, GOLD, hand, head, limb, soldierBody, soldierHead, STEEL, TEAM, torchArm, torchFlame, TORCH_TIP } from './characters.js'

/* ---------- Éclaireur (24 × 46) ---------- */

function scoutBody(g, { team }) {
  const c = TEAM[team]
  // Carquois dans le dos, empenné.
  g.beginPath()
  roundRect(g, 5.5, -12, 4.6, 17, 1.6)
  g.fillStyle = '#6a4326'
  g.fill()
  lightOver(g, 5.5, -12, 10, 5)
  edge(g, 0.5)
  for (const [x, col] of [[6.6, '#e9e2d0'], [8, '#b33b2e'], [9.3, '#e9e2d0']]) {
    g.beginPath()
    g.moveTo(x, -12)
    g.lineTo(x - 0.9, -16.5)
    g.lineTo(x + 0.9, -16.5)
    g.closePath()
    g.fillStyle = col
    g.fill()
    edge(g, 0.3)
  }
  // Jambes fines en chausses vertes, bottes souples.
  limb(g, [[2.6, 8], [3, 18.5]], 3.8, '#3c4a2c')
  boot(g, 3.2, 23)
  limb(g, [[-2.8, 8], [-3.2, 18.5]], 4, '#46562f')
  boot(g, -3.2, 23)
  // Pourpoint de cuir lacé.
  g.beginPath()
  g.moveTo(-8.4, -6)
  g.quadraticCurveTo(-8.6, -9.4, -5, -9.4)
  g.lineTo(5, -9.4)
  g.quadraticCurveTo(8.4, -9.4, 8.2, -6)
  g.lineTo(8.6, 11)
  g.quadraticCurveTo(0, 12.6, -8.6, 11)
  g.closePath()
  leather(g, '#7a5232', [-9, -10, 9, 12])
  edge(g, 0.6)
  // Écharpe aux couleurs du camp, en travers.
  g.beginPath()
  g.moveTo(-7.8, -8)
  g.lineTo(-4.4, -9)
  g.lineTo(7.8, 7)
  g.lineTo(4.6, 8.4)
  g.closePath()
  cloth(g, c.cloth, -8, -9, 8, 8, 2)
  edge(g, 0.45)
  g.beginPath()
  g.moveTo(-1, -2.5)
  g.lineTo(1, 0.5)
  stitches(g, 'rgba(255,230,180,0.7)', 0.35)
  // Ceinture et dague.
  g.beginPath()
  g.rect(-8.5, 3.4, 17, 2)
  g.fillStyle = '#3d2716'
  g.fill()
  edge(g, 0.4)
  g.beginPath()
  g.moveTo(-6, 5.4)
  g.lineTo(-7.2, 11.5)
  g.lineTo(-5.6, 11.5)
  g.closePath()
  g.fillStyle = metalGradient(g, -7.2, 6, -5.4, 11, STEEL)
  g.fill()
  edge(g, 0.35)
  // Bras avant le long du corps.
  limb(g, [[-7.4, -5.5], [-9, 0.5], [-8.6, 5.5]], 3.8, '#46562f')
  hand(g, -8.6, 6.6, 1.7)
}

function scoutArm(g) {
  // Arc court tenu à bout de bras, corde tendue.
  g.beginPath()
  g.moveTo(12.6, -22)
  g.quadraticCurveTo(18.6, -6, 12.6, 10)
  g.lineWidth = 2
  g.strokeStyle = '#5b3a1f'
  g.stroke()
  g.lineWidth = 0.9
  g.strokeStyle = 'rgba(255,230,190,0.35)'
  g.stroke()
  g.beginPath()
  g.moveTo(12.6, -22)
  g.lineTo(12.6, 10)
  g.lineWidth = 0.35
  g.strokeStyle = '#e8e0cc'
  g.stroke()
  limb(g, [[7.4, -5.5], [11, -1], [14.4, -4]], 3.8, '#3c4a2c')
  hand(g, 14.8, -4.6, 1.8)
}

function scoutHead(g, { state, team }) {
  head(g, -1, -14.4, 6.3, state, { stubble: false })
  // Capuche et chaperon verts : seul le visage dépasse.
  g.beginPath()
  g.moveTo(-7.4, -12)
  g.quadraticCurveTo(-8.6, -22.6, -0.4, -22.8)
  g.quadraticCurveTo(7.6, -22.6, 8.2, -15)
  g.quadraticCurveTo(9.2, -10, 12.4, -6.6)
  g.quadraticCurveTo(6, -6.4, 4.4, -9.8)
  g.quadraticCurveTo(5.4, -16, 0, -17.4)
  g.quadraticCurveTo(-4.6, -18, -5.6, -11.6)
  g.closePath()
  cloth(g, '#3f6a34', -8, -23, 12, -6, 2)
  edge(g, 0.6)
  // Plume du camp.
  g.beginPath()
  g.moveTo(5.6, -21)
  g.quadraticCurveTo(11.6, -26, 13.6, -21.6)
  g.quadraticCurveTo(10, -22, 6.4, -19.6)
  g.closePath()
  g.fillStyle = TEAM[team].light
  g.fill()
  edge(g, 0.35)
}

/** Pot de givre (pillard d'hiver, v5.8) : terre cuite, glyphe de givre, brume froide. */
const POT_AT = [15, -27]

function frostPotArm(g) {
  limb(g, [[7.4, -5.5], [11.6, -10], [14.6, -20]], 3.8, '#3c4a2c')
  // Le pot, tenu à bout de bras au-dessus de l'épaule.
  const [x, y] = POT_AT
  g.beginPath()
  g.ellipse(x, y, 5.6, 5, 0, 0, TAU)
  const clay = g.createRadialGradient(x - 2, y - 2, 0.5, x, y, 6)
  clay.addColorStop(0, '#c58a5c')
  clay.addColorStop(1, '#6b3f22')
  g.fillStyle = clay
  g.fill()
  edge(g, 0.5)
  g.beginPath()
  g.rect(x - 2.4, y - 7, 4.8, 2.4)
  g.fillStyle = '#5a3520'
  g.fill()
  edge(g, 0.4)
  // Glyphe de givre peint en bleu pâle.
  g.strokeStyle = '#bfe6ff'
  g.lineWidth = 0.7
  g.beginPath()
  for (let a = 0; a < 3; a++) {
    const t = (a * Math.PI) / 3
    g.moveTo(x - Math.cos(t) * 2.8, y + 0.6 - Math.sin(t) * 2.8)
    g.lineTo(x + Math.cos(t) * 2.8, y + 0.6 + Math.sin(t) * 2.8)
  }
  g.stroke()
  hand(g, 14.6, -20.5, 1.8)
}

/** Brume glacée qui s'échappe du pot (dessinée à chaque image). */
function frostMist(ctx, { t, seed, still }) {
  const [x, y] = POT_AT
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 3; i++) {
    const k = still ? 0.3 : ((t * 0.9 + i / 3 + seed) % 1)
    ctx.globalAlpha = (1 - k) * 0.45
    ctx.fillStyle = '#9fd8ff'
    ctx.beginPath()
    ctx.arc(x + Math.sin(k * 6 + i) * 2, y - 8 - k * 9, 1.6 + k * 3, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
}

/* ---------- Pavoisier (32 × 52) ---------- */

/** Le pavois : grand bouclier droit, planches peintes, bords ferrés, emblème. */
function pavise(g, { team }) {
  const c = TEAM[team]
  const shape = () => {
    g.beginPath()
    g.moveTo(-20, 22)
    g.lineTo(-20, -18)
    g.quadraticCurveTo(-20, -25, -12, -25.6)
    g.quadraticCurveTo(-4, -25, -4, -18)
    g.lineTo(-4, 22)
    g.closePath()
  }
  // Étai de bois qui le cale au sol, derrière.
  g.beginPath()
  g.moveTo(-8, 4)
  g.lineTo(-1, 24)
  g.lineWidth = 1.8
  g.strokeStyle = '#5b3a1f'
  g.stroke()
  shape()
  g.fillStyle = woodPattern(g, { angle: Math.PI / 2, unitsPerTile: 90 })
  g.fill()
  g.save()
  g.clip()
  // Champ aux couleurs du camp, bande centrale plus claire (nervure).
  g.fillStyle = c.cloth
  g.globalAlpha = 0.92
  g.fillRect(-21, -27, 18, 50)
  g.globalAlpha = 1
  g.fillStyle = c.light
  g.fillRect(-14, -27, 4, 50)
  g.fillStyle = 'rgba(0,0,0,0.22)'
  g.fillRect(-10, -27, 1, 50)
  // Emblème : tour d'or.
  g.beginPath()
  g.rect(-15.4, -6, 6.8, 9)
  for (const x of [-15.4, -12.7, -10]) g.rect(x, -8.4, 1.6, 2.6)
  g.fillStyle = GOLD
  g.fill()
  g.beginPath()
  g.rect(-12.8, -1.2, 1.6, 4.2)
  g.fillStyle = c.dark
  g.fill()
  // Coups reçus : éraflures et entailles.
  g.strokeStyle = 'rgba(40,25,15,0.55)'
  g.lineWidth = 0.5
  for (const [x, y, dx, dy] of [[-17, -14, 3, 1.2], [-8, 9, 2.6, -1.4], [-15, 14, 2, 1]]) {
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + dx, y + dy)
    g.stroke()
  }
  g.restore()
  shape()
  lightOver(g, -20, -26, -4, 22, 0.35, 0.5)
  g.lineWidth = 1.4
  g.strokeStyle = metalGradient(g, -20, -26, -4, 22, STEEL)
  g.stroke()
  shape()
  edge(g, 0.45)
  for (const [x, y] of [[-18.4, -17], [-5.6, -17], [-18.4, 20], [-5.6, 20], [-12, -23.6]]) rivet(g, x, y, 0.6, STEEL)
}

/* ---------- Porte-étendard (28 × 54) ---------- */

function bannerArm(g) {
  // Hampe jusqu'au-dessus de la tête, et la pique dorée.
  g.beginPath()
  roundRect(g, 12.9, -62, 2.2, 88, 1)
  g.fillStyle = woodPattern(g, { angle: Math.PI / 2, unitsPerTile: 140 })
  g.fill()
  g.fillStyle = 'rgba(0,0,0,0.12)'
  g.fill()
  edge(g, 0.5)
  g.beginPath()
  g.moveTo(14, -68)
  g.lineTo(15.8, -62.4)
  g.lineTo(12.2, -62.4)
  g.closePath()
  g.fillStyle = metalGradient(g, 12, -68, 16, -62, GOLD)
  g.fill()
  edge(g, 0.4)
  g.beginPath()
  g.rect(12, -61, 4, 1.6)
  g.fillStyle = GOLD
  g.fill()
  edge(g, 0.35)
  limb(g, [[8.6, -6], [12, -3], [14, -6]], 4.4, '#c9b48a')
  hand(g, 14, -6.6, 2)
}

/**
 * Bannière à queue d'aronde, qui ondule au vent (dessinée à chaque image) :
 * champ aux couleurs du camp, liseré et emblème d'or.
 */
function bannerCloth(ctx, { t, seed, still, team }) {
  const c = TEAM[team]
  const k = still ? 0 : t
  const x0 = 15
  const top = -59
  const w = 26
  const h = 17
  const wave = (u) => Math.sin(u * 5 - k * 6 - seed) * 1.6 * u
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(x0, top)
  for (let i = 1; i <= 8; i++) {
    const u = i / 8
    ctx.lineTo(x0 + u * w, top + wave(u))
  }
  ctx.lineTo(x0 + w * 0.78, top + h * 0.5 + wave(0.78))
  ctx.lineTo(x0 + w, top + h + wave(1))
  for (let i = 8; i >= 0; i--) {
    const u = i / 8
    ctx.lineTo(x0 + u * w, top + h + wave(u))
  }
  ctx.closePath()
  ctx.fillStyle = c.cloth
  ctx.fill()
  ctx.lineWidth = 0.8
  ctx.strokeStyle = GOLD
  ctx.stroke()
  ctx.lineWidth = 0.45
  ctx.strokeStyle = 'rgba(30,26,43,0.8)'
  ctx.stroke()
  // Plis : ombre là où l'étoffe se creuse.
  ctx.globalAlpha = 0.25
  ctx.fillStyle = '#000000'
  for (let i = 0; i < 3; i++) {
    const u = 0.22 + i * 0.26
    const d = Math.cos(u * 5 - k * 6 - seed)
    if (d < 0) ctx.fillRect(x0 + u * w, top + wave(u), 3, h)
  }
  ctx.globalAlpha = 1
  // Emblème : couronne d'or.
  const ex = x0 + w * 0.36
  const ey = top + h * 0.5 + wave(0.36)
  ctx.beginPath()
  ctx.moveTo(ex - 4, ey + 2.6)
  ctx.lineTo(ex - 4, ey - 1.6)
  ctx.lineTo(ex - 2, ey + 0.4)
  ctx.lineTo(ex, ey - 2.8)
  ctx.lineTo(ex + 2, ey + 0.4)
  ctx.lineTo(ex + 4, ey - 1.6)
  ctx.lineTo(ex + 4, ey + 2.6)
  ctx.closePath()
  ctx.fillStyle = GOLD
  ctx.fill()
  ctx.restore()
}

function bannerHead(g, { state, team }) {
  soldierHead(g, { state })
  // Panache aux couleurs du camp, au sommet du chapeau de fer.
  g.beginPath()
  g.moveTo(-1, -27)
  g.quadraticCurveTo(4, -36, 9.6, -33)
  g.quadraticCurveTo(5, -31.4, 1, -26)
  g.closePath()
  g.fillStyle = TEAM[team].light
  g.fill()
  edge(g, 0.4)
}

/* ---------- Sapeur (28 × 48) ---------- */

function engineerBody(g, { team }) {
  const c = TEAM[team]
  limb(g, [[3, 8], [3.4, 19]], 4.6, '#4a4038')
  boot(g, 3.6, 24)
  limb(g, [[-3.5, 8], [-3.8, 19]], 4.8, '#554a40')
  boot(g, -3.6, 24)
  // Tunique aux couleurs du camp.
  g.beginPath()
  g.moveTo(-10, -5)
  g.quadraticCurveTo(-10, -9, -6, -9)
  g.lineTo(6, -9)
  g.quadraticCurveTo(10, -9, 10, -5)
  g.lineTo(10, 12)
  g.quadraticCurveTo(0, 13.6, -10, 12)
  g.closePath()
  cloth(g, c.cloth, -10, -9, 10, 13, 3)
  edge(g, 0.6)
  // Tablier de cuir épais, roussi.
  g.beginPath()
  g.moveTo(-7.4, -6.4)
  g.lineTo(5.4, -6.4)
  g.lineTo(6.6, 15)
  g.quadraticCurveTo(-0.6, 16.4, -8.4, 15)
  g.closePath()
  leather(g, '#8a5a34', [-9, -7, 7, 16])
  edge(g, 0.55)
  g.beginPath()
  g.moveTo(-7, -6)
  g.lineTo(5, -6)
  stitches(g, 'rgba(240,215,160,0.7)', 0.35)
  // Ceinture à outils : équerre et tenailles.
  g.beginPath()
  g.rect(-9.8, 3.2, 19.6, 2.2)
  g.fillStyle = '#3d2716'
  g.fill()
  edge(g, 0.4)
  g.beginPath()
  g.moveTo(-8, 5.4)
  g.lineTo(-8, 11)
  g.lineTo(-4.6, 11)
  g.lineWidth = 1
  g.strokeStyle = metalGradient(g, -8, 5, -4, 11, STEEL)
  g.stroke()
  g.beginPath()
  g.moveTo(3.6, 5.4)
  g.lineTo(5.2, 10.4)
  g.moveTo(5.6, 5.4)
  g.lineTo(4, 10.4)
  g.lineWidth = 0.8
  g.stroke()
  // Bras avant, manche retroussée.
  limb(g, [[-8.6, -6], [-10.4, 0.5], [-10, 6.5]], 4.4, c.dark)
  hand(g, -10, 7.6)
  g.beginPath()
  g.rect(-2.6, -12, 5, 4)
  g.fillStyle = '#c38a63'
  g.fill()
}

function engineerArm(g) {
  // Marteau de charpentier : manche de frêne et tête de fer.
  g.beginPath()
  roundRect(g, 13.3, -14, 2, 18, 1)
  g.fillStyle = woodPattern(g, { angle: Math.PI / 2, unitsPerTile: 100 })
  g.fill()
  edge(g, 0.45)
  g.beginPath()
  roundRect(g, 10.4, -18.6, 8.6, 4.6, 0.8)
  g.fillStyle = metalGradient(g, 10, -18.6, 19, -14, '#7b828d')
  g.fill()
  edge(g, 0.45)
  g.beginPath()
  g.rect(10.4, -18.6, 1.2, 4.6)
  g.fillStyle = 'rgba(255,255,255,0.35)'
  g.fill()
  limb(g, [[8.6, -6], [12, -1], [14.2, 1.6]], 4.4, '#5e1512')
  hand(g, 14.3, 2, 1.9)
}

function engineerHead(g, { state }) {
  head(g, -1, -15.6, 6.6, state)
  // Bonnet de feutre et mèche qui dépasse.
  g.beginPath()
  g.moveTo(-7.6, -17.4)
  g.quadraticCurveTo(-7.4, -25.6, 0, -25.4)
  g.quadraticCurveTo(7.4, -25, 6.8, -16.6)
  g.quadraticCurveTo(0, -19.6, -7.6, -17.4)
  g.closePath()
  cloth(g, '#6b5a40', -8, -26, 7, -16, 2)
  edge(g, 0.55)
  g.beginPath()
  g.ellipse(-0.6, -17.6, 7.6, 1.6, -0.05, 0, TAU)
  g.fillStyle = '#58492f'
  g.fill()
  edge(g, 0.45)
}

/* ---------- Gréements et animation ---------- */

const RIGS = {
  scout: {
    size: [24, 46],
    box: { x: -16, y: -40, w: 36, h: 66 },
    layers: [
      { name: 'body', paint: scoutBody },
      { name: 'arm', paint: scoutArm, pivot: [7.4, -5.5] },
      { name: 'head', paint: scoutHead, pivot: [-1, -9.5], face: true },
    ],
    torch: [
      { name: 'body', paint: scoutBody },
      { name: 'arm', paint: (g) => torchArm(g, { sleeve: '#3c4a2c' }), pivot: [8.6, -6], live: (ctx, o) => torchFlame(ctx, TORCH_TIP, o) },
      { name: 'head', paint: scoutHead, pivot: [-1, -9.5], face: true },
    ],
    pot: [
      { name: 'body', paint: scoutBody },
      { name: 'arm', paint: frostPotArm, pivot: [7.4, -5.5], live: frostMist },
      { name: 'head', paint: scoutHead, pivot: [-1, -9.5], face: true },
    ],
    actions: ['scan', 'lookBack', 'lookUp'],
  },
  shieldbearer: {
    size: [32, 52],
    box: { x: -23, y: -45, w: 42, h: 73 },
    layers: [
      { name: 'body', paint: soldierBody },
      { name: 'head', paint: (g, o) => soldierHead(g, o), pivot: [-1, -10.5], face: true },
      { name: 'shield', paint: pavise, pivot: [-12, 0] },
    ],
    actions: ['lookBack', 'shield', 'nod'],
  },
  bannerman: {
    size: [28, 54],
    box: { x: -18, y: -72, w: 64, h: 100 },
    layers: [
      { name: 'body', paint: soldierBody },
      { name: 'arm', paint: bannerArm, pivot: [8.6, -6], live: bannerCloth },
      { name: 'head', paint: bannerHead, pivot: [-1, -10.5], face: true },
    ],
    actions: ['raise', 'lookBack', 'nod'],
  },
  engineer: {
    size: [28, 48],
    box: { x: -18, y: -42, w: 40, h: 68 },
    layers: [
      { name: 'body', paint: engineerBody },
      { name: 'arm', paint: engineerArm, pivot: [8.6, -6] },
      { name: 'head', paint: engineerHead, pivot: [-1, -10.5], face: true },
    ],
    actions: ['lookBack', 'thump', 'nod'],
  },
}

export const TROOP_PAINTERS = Object.freeze({
  'target.scout': animated('scout', RIGS.scout),
  'target.shieldbearer': animated('shieldbearer', RIGS.shieldbearer),
  'target.bannerman': animated('bannerman', RIGS.bannerman),
  'target.engineer': animated('engineer', RIGS.engineer),
})
