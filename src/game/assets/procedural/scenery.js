/**
 * Décor en profondeur (v5.7) : lointain montagneux, plan intermédiaire,
 * lumière du ciel (rayons, halo, lune) et poussières en suspension.
 *
 * Le paysage est découpé en plans qui défilent à des vitesses différentes
 * (parallaxe) : chaînes lointaines noyées dans la brume (0,2), collines du jeu
 * (0,45), haies et camp de siège (0,75), puis la scène. Plus un plan est loin,
 * plus il prend la couleur de l'horizon (perspective atmosphérique).
 *
 * Tout est déterministe (pas de hasard d'une image à l'autre) et sans
 * allocation dans les boucles : seules quelques formes par plan.
 */
import { SeededRandom } from '../../../core/utils/SeededRandom.js'
import { WORLD } from '../../physics/constants.js'

const TAU = Math.PI * 2
const LEFT = -1200
const RIGHT = WORLD.WIDTH + 1600

/* ---------- Couleurs ---------- */

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Mélange de deux couleurs « #rrggbb » (k = 0 → a, k = 1 → b). */
export function mix(a, b, k) {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  const c = ca.map((v, i) => Math.round(v + (cb[i] - v) * k))
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** Position de l'astre à l'écran : la même pour le ciel, les rayons et la lumière de la scène. */
export function sunPosition(theme, viewW, viewH) {
  return {
    x: viewW * (theme === 3 ? 0.78 : 0.82),
    y: viewH * (theme === 3 ? 0.42 : 0.18),
    r: Math.max(18, viewH * 0.06),
  }
}

/** Le ciel est-il assez dégagé pour des rayons de soleil ? */
export function hasSunRays(th) {
  return !th.night && !th.weather
}

/* ---------- Ciel ---------- */

const skyCache = new Map()

/** Dégradé du ciel en trois temps (zénith, milieu, horizon), mis en cache par thème et hauteur. */
export function skyGradient(ctx, th, theme, viewH) {
  const key = `${theme}:${Math.round(viewH)}`
  let g = skyCache.get(key)
  if (!g) {
    g = ctx.createLinearGradient(0, 0, 0, viewH)
    g.addColorStop(0, mix(th.skyTop, '#000000', th.night ? 0.25 : 0.08))
    g.addColorStop(0.35, th.skyTop)
    g.addColorStop(0.72, mix(th.skyTop, th.skyBottom, 0.7))
    g.addColorStop(1, th.skyBottom)
    if (skyCache.size > 40) skyCache.clear()
    skyCache.set(key, g)
  }
  return g
}

/**
 * Rayons de soleil : de longs pinceaux de lumière, en mélange additif, qui
 * tournent imperceptiblement. Très discrets : ils réchauffent le ciel sans
 * jamais gêner la lecture de la trajectoire.
 */
export function sunRays(ctx, th, sun, viewW, viewH, time) {
  const len = Math.hypot(viewW, viewH) * 0.9
  const spin = time / 60000
  const g = ctx.createRadialGradient(sun.x, sun.y, sun.r, sun.x, sun.y, len)
  g.addColorStop(0, th.sun + '1c')
  g.addColorStop(0.25, th.sun + '0a')
  g.addColorStop(1, th.sun + '00')
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = g
  ctx.beginPath()
  const rays = 11
  for (let i = 0; i < rays; i++) {
    const a = spin + (i / rays) * TAU + Math.sin(i * 7.3) * 0.18
    const w = 0.025 + 0.02 * Math.sin(i * 3.1 + time / 9000)
    ctx.moveTo(sun.x, sun.y)
    ctx.lineTo(sun.x + Math.cos(a - w) * len, sun.y + Math.sin(a - w) * len)
    ctx.lineTo(sun.x + Math.cos(a + w) * len, sun.y + Math.sin(a + w) * len)
    ctx.closePath()
  }
  ctx.fill()
  ctx.restore()
}

/** Astre : halo en deux couches, disque au bord adouci ; lune et ses mers la nuit. */
export function celestial(ctx, th, sun, skyTop) {
  for (const [k, a] of [[7, '22'], [3.2, '66']]) {
    const halo = ctx.createRadialGradient(sun.x, sun.y, sun.r * 0.6, sun.x, sun.y, sun.r * k)
    halo.addColorStop(0, th.sun + a)
    halo.addColorStop(1, th.sun + '00')
    ctx.fillStyle = halo
    ctx.fillRect(sun.x - sun.r * k, sun.y - sun.r * k, sun.r * k * 2, sun.r * k * 2)
  }
  const disk = ctx.createRadialGradient(sun.x - sun.r * 0.3, sun.y - sun.r * 0.3, sun.r * 0.1, sun.x, sun.y, sun.r)
  disk.addColorStop(0, '#ffffff')
  disk.addColorStop(0.7, th.sun)
  disk.addColorStop(1, mix(th.sun, th.night ? '#9aa3c0' : '#ffb347', 0.25))
  ctx.beginPath()
  ctx.arc(sun.x, sun.y, sun.r, 0, TAU)
  ctx.fillStyle = disk
  ctx.fill()
  if (th.night) {
    // Mers lunaires, puis l'ombre qui dessine le croissant.
    ctx.fillStyle = 'rgba(120,130,160,0.28)'
    for (const [dx, dy, rr] of [[-0.3, -0.2, 0.22], [0.1, 0.25, 0.16], [0.25, -0.35, 0.12]]) {
      ctx.beginPath()
      ctx.arc(sun.x + dx * sun.r, sun.y + dy * sun.r, rr * sun.r, 0, TAU)
      ctx.fill()
    }
    // L'ombre ne déborde pas du disque : le halo reste visible autour du croissant.
    ctx.save()
    ctx.beginPath()
    ctx.arc(sun.x, sun.y, sun.r + 0.5, 0, TAU)
    ctx.clip()
    ctx.beginPath()
    ctx.arc(sun.x + sun.r * 0.35, sun.y - sun.r * 0.15, sun.r * 0.85, 0, TAU)
    ctx.fillStyle = mix(skyTop, th.sun, 0.12)
    ctx.fill()
    ctx.restore()
  }
}

/** Étoiles qui scintillent (nuit) ; figées si les animations sont réduites. */
export function stars(ctx, viewW, viewH, time, animate) {
  const r = new SeededRandom(4)
  ctx.fillStyle = '#ffffff'
  for (let i = 0; i < 90; i++) {
    const x = r.range(0, viewW)
    const y = r.range(0, viewH * 0.62)
    const base = r.range(0.25, 0.9)
    const size = r.range(0.8, 2)
    const tw = animate ? 0.65 + 0.35 * Math.sin(time / r.range(300, 900) + i) : 1
    ctx.globalAlpha = base * tw * (1 - y / (viewH * 0.75))
    ctx.fillRect(x, y, size, size)
  }
  ctx.globalAlpha = 1
}

/* ---------- Lointain (parallaxe 0,2) ---------- */

/** Relief continu : somme de sinusoïdes (aucune répétition visible à l'écran). */
function ridge(x, seed, amp) {
  return (
    Math.sin(x * 0.0021 + seed) * 0.5 +
    Math.sin(x * 0.0047 + seed * 2.1) * 0.28 +
    Math.sin(x * 0.011 + seed * 3.7) * 0.14 +
    Math.abs(Math.sin(x * 0.0009 + seed)) * 0.4
  ) * amp
}

/** Chaînes lointaines, très pâles (elles se fondent dans l'horizon). */
export function distant(ctx, s) {
  const { th } = s.extra
  const base = WORLD.GROUND_Y
  const tall = th.peaks ? 1.9 : th.arid ? 0.7 : 1
  // Perspective atmosphérique : le lointain prend la teinte bleutée du ciel.
  const air = mix(th.skyTop, th.skyBottom, 0.55)
  const layers = [
    [mix(th.farDark, air, 0.78), 300 * tall, 7.1, 0.9],
    [mix(th.farDark, air, 0.62), 220 * tall, 2.3, 0.75],
  ]
  for (const [color, amp, seed, snow] of layers) {
    ctx.beginPath()
    ctx.moveTo(LEFT, base)
    let peakY = Infinity
    for (let x = LEFT; x <= RIGHT; x += 40) {
      const y = base - 200 - Math.max(0, ridge(x, seed, amp))
      ctx.lineTo(x, y)
      peakY = Math.min(peakY, y)
    }
    ctx.lineTo(RIGHT, base)
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()
    // Neiges éternelles : un liseré clair sur les plus hauts sommets.
    if ((th.peaks || th.weather === 'snow') && Number.isFinite(peakY)) {
      ctx.save()
      ctx.clip()
      ctx.fillStyle = 'rgba(250,252,255,0.55)'
      ctx.fillRect(LEFT, peakY - 10, RIGHT - LEFT, (base - 200 - peakY) * (1 - snow) + 60)
      ctx.restore()
    }
  }
  // Brume d'horizon par-dessus : le lointain recule encore.
  const v = ctx.createLinearGradient(0, base - 700, 0, base)
  v.addColorStop(0, th.skyBottom + '00')
  v.addColorStop(1, th.skyBottom + (th.night ? '55' : 'aa'))
  ctx.fillStyle = v
  ctx.fillRect(LEFT, base - 700, RIGHT - LEFT, 700)
}

/* ---------- Plan intermédiaire (parallaxe 0,75) ---------- */

/** Tente de siège rayée, avec son fanion (camp du joueur, à gauche). */
function tent(ctx, x, y, w, colors, ink) {
  const h = w * 0.75
  ctx.beginPath()
  ctx.moveTo(x - w / 2, y)
  ctx.quadraticCurveTo(x - w * 0.22, y - h * 0.55, x, y - h)
  ctx.quadraticCurveTo(x + w * 0.22, y - h * 0.55, x + w / 2, y)
  ctx.closePath()
  ctx.fillStyle = colors[0]
  ctx.fill()
  ctx.save()
  ctx.clip()
  ctx.fillStyle = colors[1]
  for (let k = -3; k <= 3; k += 2) {
    ctx.beginPath()
    ctx.moveTo(x, y - h)
    ctx.lineTo(x + (k * w) / 7, y)
    ctx.lineTo(x + ((k + 1) * w) / 7, y)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
  ctx.fillStyle = ink
  ctx.beginPath()
  ctx.moveTo(x - w * 0.08, y)
  ctx.lineTo(x, y - h * 0.45)
  ctx.lineTo(x + w * 0.08, y)
  ctx.fill()
  ctx.fillRect(x - 1.5, y - h - 26, 3, 28)
  ctx.fillStyle = colors[1]
  ctx.beginPath()
  ctx.moveTo(x + 1.5, y - h - 26)
  ctx.lineTo(x + 24, y - h - 20)
  ctx.lineTo(x + 1.5, y - h - 14)
  ctx.fill()
}

/**
 * Haies, bosquets et camp de siège, entre les collines et la scène. Teinte
 * rapprochée de l'horizon (le plan est à mi-distance), jamais sur le château.
 */
export function near(ctx, s) {
  const { th, versus } = s.extra
  const base = WORLD.GROUND_Y + 2
  const r = new SeededRandom(91)
  const leaf = mix(th.night ? th.farDark : mix(th.grass, th.farDark, 0.55), th.skyBottom, th.night ? 0.15 : 0.22)
  const leafLight = mix(leaf, th.skyBottom, 0.25)
  const snowy = th.weather === 'snow'
  // Bosquets en buttes arrondies.
  for (let x = LEFT; x < RIGHT; x += r.range(70, 140)) {
    if (th.arid && r.next() < 0.6) continue
    const w = r.range(40, 110) * (th.arid ? 0.6 : 1)
    const h = r.range(18, 46) * (th.arid ? 0.7 : 1)
    ctx.fillStyle = leaf
    ctx.beginPath()
    ctx.ellipse(x, base, w / 2, h, 0, Math.PI, TAU)
    ctx.ellipse(x + w * 0.35, base, w * 0.35, h * 0.7, 0, Math.PI, TAU)
    ctx.fill()
    ctx.fillStyle = snowy ? 'rgba(250,252,255,0.85)' : leafLight
    ctx.beginPath()
    ctx.ellipse(x - w * 0.08, base - h * 0.62, w * 0.28, h * (snowy ? 0.4 : 0.25), -0.2, 0, TAU)
    ctx.fill()
  }
  // Arbres isolés (feuillus ou sapins selon le climat).
  const conifer = th.peaks || snowy || th.weather === 'fog'
  for (let i = 0; i < 9; i++) {
    const x = r.range(LEFT + 200, RIGHT - 200)
    const h = r.range(90, 150)
    if (th.arid && !snowy) continue
    ctx.fillStyle = mix(leaf, '#000000', 0.12)
    ctx.fillRect(x - 3, base - h * 0.35, 6, h * 0.35)
    ctx.fillStyle = leaf
    ctx.beginPath()
    if (conifer) {
      ctx.moveTo(x, base - h)
      ctx.lineTo(x - h * 0.24, base - h * 0.22)
      ctx.lineTo(x + h * 0.24, base - h * 0.22)
      ctx.closePath()
    } else {
      ctx.arc(x, base - h * 0.62, h * 0.3, 0, TAU)
      ctx.arc(x - h * 0.18, base - h * 0.45, h * 0.2, 0, TAU)
      ctx.arc(x + h * 0.2, base - h * 0.48, h * 0.22, 0, TAU)
    }
    ctx.fill()
    if (snowy) {
      ctx.fillStyle = 'rgba(250,252,255,0.8)'
      ctx.beginPath()
      ctx.moveTo(x, base - h)
      ctx.lineTo(x - h * 0.1, base - h * 0.68)
      ctx.lineTo(x + h * 0.1, base - h * 0.68)
      ctx.fill()
    }
  }
  // Camp de siège du joueur : tentes rayées (pas en face-à-face, chacun son camp).
  if (!versus) {
    const ink = mix(leaf, '#000000', 0.45)
    const cloth = th.night ? ['#5a5266', '#3c3448'] : ['#e8dcc0', '#a3322b']
    const cloth2 = th.night ? ['#5a5266', '#2f3a52'] : ['#e8dcc0', '#2f4b7c']
    tent(ctx, -160, base, 120, cloth, ink)
    tent(ctx, -20, base, 90, cloth2, ink)
    tent(ctx, 190, base, 105, cloth, ink)
  }
  // Voile d'horizon : le plan intermédiaire se distingue de la scène.
  const v = ctx.createLinearGradient(0, base - 160, 0, base)
  v.addColorStop(0, th.skyBottom + '00')
  v.addColorStop(1, th.skyBottom + (th.night ? '22' : '44'))
  ctx.fillStyle = v
  ctx.fillRect(LEFT, base - 160, RIGHT - LEFT, 160)
}

/* ---------- Particules d'ambiance (repère écran) ---------- */

/** Type de poussière en suspension selon le chapitre (null : la météo suffit). */
export function moteKind(theme, th) {
  if (theme === 10) return 'ember'
  if (th.night) return 'firefly'
  if (th.weather === 'rain' || th.weather === 'snow') return null
  if (th.arid) return 'sand'
  return 'pollen'
}

/**
 * Poussières, pollen, lucioles ou braises qui flottent devant le décor.
 * Positions calculées à partir du temps (aucun état), décalées avec la caméra
 * pour un léger effet de profondeur.
 */
export function motes(ctx, kind, viewW, viewH, time, shiftX, glow) {
  const r = new SeededRandom(57)
  const n = kind === 'ember' ? 34 : kind === 'firefly' ? 26 : 30
  const s = time / 1000
  const spanW = viewW + 80
  ctx.save()
  ctx.globalCompositeOperation = kind === 'pollen' || kind === 'sand' ? 'source-over' : 'lighter'
  for (let i = 0; i < n; i++) {
    const seedX = r.range(0, spanW)
    const seedY = r.range(0, 1)
    const speed = r.range(0.4, 1)
    const size = r.range(1, 2.6) * Math.max(1, viewH / 700)
    const phase = r.range(0, TAU)
    let x
    let y
    let a
    if (kind === 'ember') {
      // Braises : montent en ondulant, s'éteignent en haut.
      const life = (s * 0.08 * speed + seedY) % 1
      x = seedX + Math.sin(s * 1.3 + phase) * 18 - shiftX * 0.9
      y = viewH * (1 - life)
      a = (1 - life) * (0.55 + 0.45 * Math.sin(s * 6 + phase))
    } else if (kind === 'firefly') {
      // Lucioles : vol erratique près du sol, clignotement lent.
      x = seedX + Math.sin(s * 0.5 * speed + phase) * 40 - shiftX * 0.9
      y = viewH * (0.55 + 0.35 * seedY) + Math.sin(s * 0.8 + phase * 2) * 20
      a = Math.max(0, Math.sin(s * 1.2 * speed + phase)) ** 3
    } else {
      // Pollen et sable : dérive lente avec le vent du décor.
      x = seedX + s * 14 * speed - shiftX * 0.9
      y = viewH * (0.15 + 0.75 * seedY) + Math.sin(s * 0.7 + phase) * 14
      a = (kind === 'sand' ? 0.28 : 0.4) * (0.6 + 0.4 * Math.sin(s + phase))
    }
    x = (((x % spanW) + spanW) % spanW) - 40
    if (a <= 0.01) continue
    if (kind === 'ember' || kind === 'firefly') {
      const rad = size * 5
      const g = glow(kind === 'ember' ? '255,150,60' : '210,255,120')
      ctx.globalAlpha = a * 0.9
      ctx.drawImage(g, x - rad, y - rad, rad * 2, rad * 2)
    } else {
      ctx.globalAlpha = a
      ctx.fillStyle = kind === 'sand' ? '#f3dfb4' : '#fff8e0'
      ctx.fillRect(x, y, size, size)
    }
  }
  ctx.restore()
}
