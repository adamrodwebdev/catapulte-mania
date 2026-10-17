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
import { catapult, trebuchet } from './engines.js'
import { CHARACTER_PAINTERS } from './characters.js'
import { TROOP_PAINTERS } from './troops.js'
import { GENERAL_PAINTERS } from './warlords.js'
import { drawBlockBody, drawBarrelBody } from './materials.js'
import { range, drawRange, spindrift } from './mountains.js'

export { CATAPULT_GEOMETRY, CATAPULT_SKINS } from './engines.js'
/** Palettes de décor par chapitre (v6.2 : voir themes.js). */
export { THEMES } from './themes.js'
import { CREATURE_PAINTERS } from './creatures.js'
import { ELEMENT_PAINTERS } from './elements.js'
import { STRUCTURE_PAINTERS } from './structures.js'
import { THEMES } from './themes.js'
import { celestial, distant, hasSunRays, near, skyGradient, stars, sunPosition, sunRays } from './scenery.js'

const INK = '#1e1a2b'
const TAU = Math.PI * 2


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

/** Fissures déterministes, de plus en plus nombreuses et larges avec les dégâts. */
function cracks(ctx, s) {
  const dmg = s.damage ?? 0
  if (dmg < 0.12) return
  const r = new SeededRandom(((s.seed ?? 1) * 2654435761) >>> 0)
  const count = Math.ceil(dmg * 5)
  const lines = []
  for (let i = 0; i < count; i++) {
    let x = r.range(-s.w / 2, s.w / 2)
    let y = r.range(-s.h / 2, s.h / 2)
    const pts = [[x, y]]
    const steps = 3 + r.int(0, 3)
    const dir = r.range(0, TAU)
    for (let k = 0; k < steps; k++) {
      x += Math.cos(dir + r.range(-0.9, 0.9)) * (6 + dmg * 10)
      y += Math.sin(dir + r.range(-0.9, 0.9)) * (6 + dmg * 10)
      pts.push([x, y])
    }
    lines.push(pts)
  }
  const stroke = (dx, dy, width, color) => {
    ctx.beginPath()
    for (const pts of lines) pts.forEach(([x, y], k) => (k ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy)))
    ctx.lineWidth = width
    ctx.strokeStyle = color
    ctx.stroke()
  }
  ctx.save()
  ctx.clip()
  ctx.lineJoin = 'round'
  // Bord éclaté (clair) décalé, puis la fente sombre.
  stroke(0.6, 0.6, 0.9 + dmg, 'rgba(255,248,235,0.28)')
  stroke(0, 0, 0.7 + dmg * 1.4, 'rgba(18,12,10,0.85)')
  ctx.restore()
}

/** Bloc en feu : le bois noircit par le bas, lueur de braise qui palpite. */
function scorch(ctx, s) {
  if (!s.burning) return
  const t = (s.time ?? 0) / 1000
  const h = s.h ?? 20
  ctx.save()
  ctx.globalCompositeOperation = 'source-atop'
  const char = ctx.createLinearGradient(0, h / 2, 0, -h / 2)
  char.addColorStop(0, 'rgba(20,10,4,0.62)')
  char.addColorStop(1, 'rgba(20,10,4,0.25)')
  ctx.fillStyle = char
  ctx.fill()
  ctx.fillStyle = `rgba(255,${90 + Math.round(30 * Math.sin(t * 9 + (s.seed ?? 0)))},20,${0.2 + 0.1 * Math.sin(t * 13 + (s.seed ?? 0) * 2)})`
  ctx.fill()
  ctx.restore()
}

/* ---------- Blocs ---------- */

function blockPainter(material) {
  return (ctx, s) => {
    // Corps du bloc : appareillage réaliste en cache (voir materials.js).
    drawBlockBody(ctx, material, s)
    // Par-dessus, à chaque image : brûlure et fissures selon les dégâts.
    shapePath(ctx, s)
    scorch(ctx, s)
    cracks(ctx, s)
  }
}

/* ---------- Baril et projectiles ---------- */

function barrel(ctx, s) {
  const { w, h } = s
  drawBarrelBody(ctx, s)
  ctx.beginPath()
  ctx.moveTo(-w * 0.42, -h / 2)
  ctx.quadraticCurveTo(-w * 0.6, 0, -w * 0.42, h / 2)
  ctx.lineTo(w * 0.42, h / 2)
  ctx.quadraticCurveTo(w * 0.6, 0, w * 0.42, -h / 2)
  ctx.closePath()
  scorch(ctx, s)
  cracks(ctx, s)
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

/**
 * Ciel (repère écran) : dégradé en trois temps, rayons de soleil, astre,
 * étoiles qui scintillent, nuages qui dérivent (v5.7, voir scenery.js).
 */
function sky(ctx, s) {
  // `overlay` (v6.2) : par-dessus un fond peint, seulement ce qui vit (météo, nuages
  // qui montrent le vent, oiseaux) : ni dégradé, ni étoiles, ni brume, ni astre (la
  // peinture a son soleil ou sa lune).
  const { theme = 1, viewW, viewH, time = 0, animate = true, wind = 0, overlay = false } = s.extra
  const th = THEMES[theme]
  if (!overlay) {
    ctx.fillStyle = skyGradient(ctx, th, theme, viewH)
    ctx.fillRect(0, 0, viewW, viewH)
  }
  const sun = sunPosition(theme, viewW, viewH)
  if (th.night && !overlay) stars(ctx, viewW, viewH, time, animate)
  if (!overlay) {
    if (hasSunRays(th)) sunRays(ctx, th, sun, viewW, viewH, animate ? time : 0)
    celestial(ctx, th, sun, th.skyTop)
  }
  weather(ctx, th, viewW, viewH, animate ? time : 0)
  // Brume claire à l'horizon : profondeur atmosphérique (la peinture a la sienne).
  if (!overlay) {
    const haze = ctx.createLinearGradient(0, viewH * 0.45, 0, viewH)
    haze.addColorStop(0, th.skyBottom + '00')
    haze.addColorStop(1, th.skyBottom + (th.night ? '33' : '88'))
    ctx.fillStyle = haze
    ctx.fillRect(0, viewH * 0.45, viewW, viewH * 0.55)
  }
  const r = new SeededRandom(11 + theme)
  const light = th.night ? 'rgba(200,210,255,0.10)' : th.weather === 'rain' ? 'rgba(110,118,135,0.75)' : 'rgba(255,255,255,0.82)'
  const shade = th.night ? 'rgba(120,130,180,0.08)' : th.weather === 'rain' ? 'rgba(60,66,80,0.6)' : 'rgba(170,185,210,0.45)'
  // Sur une peinture, quelques nuages légers suffisent à montrer le vent, et
  // seulement dans un ciel clair (la nuit, la pluie et la brume ont les leurs).
  if (overlay) ctx.globalAlpha = 0.55
  const clouds = !overlay ? 7 : th.night || th.weather === 'rain' || th.weather === 'fog' ? 0 : 4
  for (let i = 0; i < clouds; i++) {
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
  ctx.globalAlpha = 1
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

/**
 * Lointain (repère monde, parallaxe) : la chaîne du fond, des contreforts
 * boisés devant, et la silhouette d'un château. v6.2 : montagnes refaites
 * (crêtes fractales, versants éclairés et à l'ombre, neige découpée dans la
 * silhouette, panaches que le vent arrache aux crêtes ; voir mountains.js).
 */
function far(ctx, s) {
  const { theme = 1, castle = true, time = 0, animate = true, wind = 0 } = s.extra
  const th = THEMES[theme]
  const r = new SeededRandom(23 + theme)
  const left = -1200
  const right = WORLD.WIDTH + 1600
  const base = WORLD.GROUND_Y
  const snowy = Boolean(th.peaks || th.weather === 'snow')
  const shade = th.night ? 'rgba(6,8,20,0.32)' : 'rgba(22,28,48,0.26)'
  const rim = th.night ? null : 'rgba(255,248,232,0.4)'
  // La chaîne du fond : de vrais sommets en montagne, des collines ailleurs.
  const back = range({ seed: 3.1 + theme, left, right, base, height: th.peaks ? 640 : th.arid ? 280 : 330, rough: th.peaks ? 2.6 : snowy ? 2 : th.arid ? 1.3 : 1.25 })
  drawRange(ctx, back, {
    body: th.farDark,
    shade,
    snow: snowy ? 'rgba(246,249,253,0.96)' : null,
    snowLine: snowy ? base - back.height * (th.peaks ? 0.46 : 0.5) : null,
    rim,
    strata: th.peaks ? 'rgba(30,34,44,0.12)' : null,
  })
  // Voile de brume sur la chaîne du fond : elle recule.
  const v = ctx.createLinearGradient(0, base - back.height, 0, base)
  v.addColorStop(0, th.skyBottom + '00')
  v.addColorStop(1, th.skyBottom + (th.night ? '22' : '55'))
  ctx.fillStyle = v
  ctx.fillRect(left, base - back.height, right - left, back.height)
  // Panaches : neige sur les sommets, sable au désert, voile de brume ailleurs (par grand vent).
  const plume = snowy ? { rgb: '250,252,255', alpha: 0.8 } : th.arid ? { rgb: '236,212,168', alpha: 0.5 } : Math.abs(wind) > 0.5 ? { rgb: '236,240,244', alpha: 0.22 } : null
  if (plume) spindrift(ctx, back.peaks.filter((pk) => pk.y < base - back.height * 0.46), { time, wind, rgb: plume.rgb, animate, alpha: plume.alpha, reach: 260, size: 1.3 })
  // Contreforts devant : plus bas, plus ronds, boisés (sauf désert et neige).
  const front = range({ seed: 7.7 + theme, left, right, base, height: th.peaks ? 320 : 210, rough: th.peaks ? 1.7 : 1.05 })
  drawRange(ctx, front, { body: th.far, shade, snow: th.weather === 'snow' ? 'rgba(244,247,251,0.9)' : null, snowLine: th.weather === 'snow' ? base - front.height * 0.55 : null, rim })
  if (!th.arid) {
    ctx.fillStyle = th.farDark
    const pts = front.pts
    for (let i = 0; i < pts.length - 2; i += 6) {
      for (let k = 0; k < 2; k++) {
        const f = r.range(0, 1)
        const tx = pts[i] + (pts[i + 2] - pts[i]) * f * 3
        const ty = pts[i + 1] + 3
        const tr = r.range(9, 16)
        if (th.peaks || th.weather === 'fog' || th.weather === 'snow') {
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

/**
 * Pont jeté par les pillards (v5.8) : planches à claire-voie liées par des
 * cordes, rambarde de corde qui ploie, piquets aux deux bouts. Il se fendille
 * avec les dégâts (il cède vite).
 */
function bridge(ctx, s) {
  const { w, h } = s
  const px = s.pixel ?? 1
  const x0 = -w / 2
  // Planches.
  for (let x = x0; x < w / 2 - 2; x += 13) {
    ctx.beginPath()
    roundRect(ctx, x, -h / 2, 11, h, 2)
    ctx.fillStyle = (Math.round(x / 13) % 2 ? '#8a6238' : '#9b7044')
    ctx.fill()
    outline(ctx, s, 1.1)
  }
  // Cordes de liaison et rambarde.
  ctx.strokeStyle = '#d9c08a'
  ctx.lineWidth = 1.6 * px
  ctx.beginPath()
  ctx.moveTo(x0, -h / 2 + 2)
  ctx.lineTo(w / 2, -h / 2 + 2)
  ctx.stroke()
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#5e4128'
    ctx.beginPath()
    roundRect(ctx, side * (w / 2 - 4) - 3, -h / 2 - 30, 6, 32, 2)
    ctx.fill()
    outline(ctx, s, 1.2)
  }
  ctx.beginPath()
  ctx.moveTo(x0 + 4, -h / 2 - 27)
  ctx.quadraticCurveTo(0, -h / 2 - 8, w / 2 - 4, -h / 2 - 27)
  ctx.lineWidth = 2 * px
  ctx.strokeStyle = '#c9ad78'
  ctx.stroke()
  cracks(ctx, s)
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
  'block.rock': blockPainter('rock'),
  ...CHARACTER_PAINTERS,
  ...TROOP_PAINTERS,
  ...GENERAL_PAINTERS,
  barrel,
  ...projectiles,
  ...CREATURE_PAINTERS,
  ...ELEMENT_PAINTERS,
  ...STRUCTURE_PAINTERS,
  catapult,
  trebuchet,
  'deco.pumpkin': pumpkin,
  'deco.snow': snowcap,
  'construct.bridge': bridge,
  'scene.sky': sky,
  'scene.distant': (ctx, st) => distant(ctx, { ...st, extra: { th: THEMES[st.extra?.theme ?? 1], time: st.extra?.time ?? 0, animate: st.extra?.animate !== false, wind: st.extra?.wind ?? 0 } }),
  'scene.far': far,
  'scene.near': (ctx, st) => near(ctx, { ...st, extra: { th: THEMES[st.extra?.theme ?? 1], versus: st.extra?.versus, art: st.extra?.art } }),
  'scene.ground': ground,
})
