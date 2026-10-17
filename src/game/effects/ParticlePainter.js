/**
 * Dessin des particules (v6.2, sorti du ParticleSystem) : le système simule
 * (émetteurs, mouvement, durée de vie), le peintre dessine ce qu'il lui montre.
 *
 * Six passes, dans cet ordre : 1) traces au sol (sang, suie), 2) matière
 * (éclats, fumée, gouttes, confettis, ondes), 3) lumière en mélange additif
 * (feu, étincelles, éclairs ; tirs des généraux et défenseurs assommés y sont
 * dessinés en mélange normal), 4) bulles de parole, 5) annonces, 6) textes.
 * Chaque sorte de particule a son dessin (tables MATTER et LIGHT).
 */
const TAU = Math.PI * 2

/* ---------- Sprites (rendu doux, mis en cache) ---------- */

const sprites = new Map()

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/**
 * Disque flou d'une couleur donnée (64 px), centre plein et bord qui s'efface :
 * la base de la fumée, de la poussière, des lueurs et du feu.
 * @param {string} rgb ex. '230,225,215'
 */
function soft(rgb) {
  let c = sprites.get(rgb)
  if (!c) {
    c = makeCanvas(64, 64)
    const g = c.getContext('2d')
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, `rgba(${rgb},1)`)
    grad.addColorStop(0.45, `rgba(${rgb},0.7)`)
    grad.addColorStop(1, `rgba(${rgb},0)`)
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 64)
    sprites.set(rgb, c)
  }
  return c
}

/* ---------- Matière (passe 2) ---------- */

/** Éclat ou écharde : un rectangle qui tourne, reflet sur le dessus. */
function chip(ctx, p, t, o) {
  ctx.globalAlpha = Math.min(1, (1 - t) * 2.2)
  ctx.save()
  ctx.translate(p.x, p.y)
  ctx.rotate(p.rot)
  const w = p.kind === 'shard' ? p.len : p.size
  const h = p.kind === 'shard' ? p.size * 0.45 : p.size * 0.75
  ctx.fillStyle = p.color
  ctx.fillRect(-w / 2, -h / 2, w, h)
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  ctx.fillRect(-w / 2, -h / 2, w, h * 0.35)
  ctx.strokeStyle = '#1e1a2b'
  ctx.lineWidth = o.pixel
  ctx.strokeRect(-w / 2, -h / 2, w, h)
  ctx.restore()
}

/** Dessin de la matière, par sorte (t : 0 → 1 sur la vie, délai déduit). */
const MATTER = new Map([
  [
    'smoke',
    (ctx, p, t) => {
      // Apparition rapide, disparition lente.
      const a = (t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88) * (p.opacity ?? 0.45)
      ctx.globalAlpha = Math.max(0, a)
      const s = p.size * 2
      ctx.drawImage(soft(p.rgb || '230,225,215'), p.x - s / 2, p.y - s / 2, s, s)
    },
  ],
  ['chunk', chip],
  ['shard', chip],
  [
    'drop',
    (ctx, p, t) => {
      // Goutte étirée dans le sens de sa course.
      ctx.globalAlpha = p.splat ? 1 : Math.min(1, (1 - t) * 1.8)
      ctx.strokeStyle = p.color
      ctx.lineCap = 'round'
      ctx.lineWidth = p.size * 1.5
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x - p.vx * 1.1, p.y - p.vy * 1.1)
      ctx.stroke()
    },
  ],
  [
    'dot',
    (ctx, p, t) => {
      ctx.globalAlpha = 1 - t
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, TAU)
      ctx.fill()
    },
  ],
  [
    'confetti',
    (ctx, p, t) => {
      ctx.globalAlpha = t > 0.8 ? (1 - t) / 0.2 : 1
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      // Le papier tourne sur lui-même : sa largeur apparente oscille.
      ctx.scale(Math.cos(p.life / 120 + p.phase), 1)
      ctx.fillStyle = p.color
      ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6)
      ctx.restore()
    },
  ],
  [
    'ring',
    (ctx, p, t, o) => {
      const e = 1 - Math.pow(1 - t, 3)
      ctx.globalAlpha = (1 - t) * 0.7
      ctx.strokeStyle = '#fff6dc'
      ctx.lineWidth = (10 * (1 - t) + 1) * Math.max(1, o.pixel)
      ctx.beginPath()
      ctx.ellipse(p.x, p.y, p.size * e, p.size * e * 0.55, 0, 0, TAU)
      ctx.stroke()
    },
  ],
])

/* ---------- Lumière (passe 3, mélange additif) ---------- */

/** Dessin de la lumière, par sorte (t : 0 → 1 sur la vie). */
const LIGHT = new Map([
  [
    'flame',
    (ctx, p, t) => {
      ctx.globalAlpha = (1 - t) * 0.85
      const s = p.size * 2 * (1 - t * 0.5)
      ctx.drawImage(soft(t < 0.35 ? '255,214,120' : '255,120,40'), p.x - s / 2, p.y - s / 2, s, s)
    },
  ],
  [
    'fireball',
    (ctx, p, t) => {
      ctx.globalAlpha = (1 - t) * 0.9
      const s = p.size * 2
      ctx.drawImage(soft(t < 0.3 ? '255,236,170' : t < 0.6 ? '255,150,50' : '170,60,30'), p.x - s / 2, p.y - s / 2, s, s)
    },
  ],
  [
    'flash',
    (ctx, p, t) => {
      ctx.globalAlpha = (1 - t) * 0.9
      const s = p.size * 2 * (0.7 + t * 0.6)
      ctx.drawImage(soft(p.rgb), p.x - s / 2, p.y - s / 2, s, s)
    },
  ],
  [
    'spark',
    (ctx, p, t) => {
      // Trait orienté selon la vitesse : l'œil lit une étincelle rapide.
      ctx.globalAlpha = 1 - t
      ctx.strokeStyle = p.color
      ctx.lineWidth = p.size * (1 - t * 0.5)
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2)
      ctx.stroke()
    },
  ],
  [
    'ember',
    (ctx, p, t) => {
      ctx.globalAlpha = (1 - t) * (0.6 + 0.4 * Math.sin(p.life / 40 + p.x))
      const s = p.size * 5
      ctx.drawImage(soft(p.glow ?? '255,170,70'), p.x - s / 2, p.y - s / 2, s, s)
    },
  ],
  [
    'streak',
    (ctx, p, t, o) => {
      ctx.globalAlpha = Math.sin(t * Math.PI) * 0.75
      ctx.strokeStyle = `rgb(${p.rgb})`
      ctx.lineWidth = 2 * Math.max(1, o.pixel)
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x - Math.sign(p.vx) * p.size, p.y - p.vy * 3)
      ctx.stroke()
      ctx.lineCap = 'butt'
    },
  ],
  [
    'bolt',
    (ctx, p, t, o) => {
      ctx.globalAlpha = t < 0.15 ? 1 : (1 - t) * (0.6 + 0.4 * Math.sin(p.life / 18))
      for (const [wdt, col] of [[9, 'rgba(150,190,255,0.5)'], [3.2, '#ffffff']]) {
        ctx.strokeStyle = col
        ctx.lineWidth = wdt * (p.size ?? 1) * Math.max(1, o.pixel)
        ctx.lineJoin = 'round'
        ctx.beginPath()
        p.pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)))
        ctx.stroke()
      }
    },
  ],
  ['shell', (ctx, p, t, o) => drawShell(ctx, p, o.pixel)],
  ['knockout', (ctx, p, t, o) => drawKnockout(ctx, p, t, o.drawSprite, o.memory)],
  [
    'glint',
    (ctx, p, t, o) => {
      ctx.globalAlpha = Math.sin(t * Math.PI)
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.6 * Math.max(1, o.pixel)
      const s = p.size
      ctx.beginPath()
      ctx.moveTo(p.x - s, p.y)
      ctx.lineTo(p.x + s, p.y)
      ctx.moveTo(p.x, p.y - s)
      ctx.lineTo(p.x, p.y + s)
      ctx.stroke()
    },
  ],
])

/** Dessin des particules (voir ParticleSystem pour la simulation). */
export class ParticlePainter {
  /** Mémoire des défenseurs assommés (v6.2) : celle de leur dessin de personnage, d'une image à l'autre. */
  #memory = new Map()

  /**
   * @param {CanvasRenderingContext2D} ctx contexte en coordonnées monde
   * @param {ReadonlyArray<object>} items particules vivantes (voir ParticleSystem#items)
   * @param {number} [pixel] taille d'un pixel écran en unités monde
   * @param {number} [viewWidth] largeur de la vue (px écran) : borne la largeur des titres
   * @param {number | null} [skyY] ordonnée du monde de la bande de ciel des annonces (v6.2)
   * @param {((ctx: CanvasRenderingContext2D, key: string, state: object) => void) | null} [drawSprite]
   *   dessin d'un personnage (défenseurs assommés, v6.0)
   */
  draw(ctx, items, pixel = 1, viewWidth = 0, skyY = null, drawSprite = null) {
    const o = { pixel, viewWidth, skyY, drawSprite, memory: this.#memory }
    // 1) Traces au sol, 2) matière (éclats, fumée), 3) lumière en mélange additif, 4) textes.
    ctx.save()
    for (const p of items) if (p.kind === 'stain') drawStain(ctx, p)
    for (const p of items) {
      if (p.delay && p.life < p.delay) continue
      const t = (p.life - (p.delay || 0)) / (p.max - (p.delay || 0))
      MATTER.get(p.kind)?.(ctx, p, t, o)
    }
    // Lumière : feu, étincelles, éclairs (mélange additif, ça brille).
    ctx.globalCompositeOperation = 'lighter'
    for (const p of items) {
      if (p.delay && p.life < p.delay) continue
      const t = p.life / p.max
      LIGHT.get(p.kind)?.(ctx, p, t, o)
    }
    ctx.globalCompositeOperation = 'source-over'
    for (const p of items) if (p.kind === 'bubble') drawBubble(ctx, p, o)
    for (const p of items) if (p.kind === 'callout') drawCallout(ctx, p, o)
    for (const p of items) {
      if (p.kind !== 'text') continue
      const t = p.life / p.max
      const pop = p.life < 160 ? 0.6 + (p.life / 160) * 0.6 : p.life < 260 ? 1.2 - ((p.life - 160) / 100) * 0.2 : 1
      ctx.globalAlpha = Math.min(1, (1 - t) * 2)
      ctx.font = `700 ${Math.round(p.size * pop)}px Cinzel, Georgia, serif`
      ctx.textAlign = 'center'
      ctx.lineJoin = 'round'
      ctx.lineWidth = 6 * pixel
      ctx.strokeStyle = '#1e1a2b'
      ctx.strokeText(p.text, p.x, p.y)
      ctx.fillStyle = p.color
      ctx.fillText(p.text, p.x, p.y)
    }
    ctx.restore()
    ctx.globalAlpha = 1
  }
}

/** Le défenseur assommé : son dessin du jeu (visage crispé), tourné, qui s'efface. */
function drawKnockout(ctx, p, t, drawSprite, memory) {
  if (!drawSprite) return
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = t < 0.55 ? 1 : Math.max(0, 1 - (t - 0.55) / 0.45)
  ctx.translate(p.x, p.y)
  ctx.rotate(p.rot)
  drawSprite(ctx, p.key, { w: p.w, h: p.h, time: p.life, seed: 7, extra: { ...p.extra, hurt: true, still: p.still, walking: false }, memory })
  ctx.restore()
}

/**
 * Bulle de parole : cartouche clair à bord sombre, petite pointe vers le
 * personnage ; taille constante à l'écran (`pixel`), apparition en rebond.
 */
function drawBubble(ctx, p, { pixel, viewWidth }) {
  const t = p.life / p.max
  const s = Math.max(1, pixel)
  const pop = p.life < 140 ? 0.7 + (p.life / 140) * 0.3 : 1
  const size = 15 * s * pop
  ctx.save()
  ctx.globalAlpha = t > 0.82 ? (1 - t) / 0.18 : 1
  ctx.font = `700 ${Math.round(size)}px system-ui, -apple-system, 'Segoe UI', sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const maxW = viewWidth > 0 ? viewWidth * 0.5 * pixel : 1e6
  const w = Math.min(maxW, ctx.measureText(p.text).width) + 18 * s * pop
  const h = size + 12 * s * pop
  const x = p.x
  const y = p.y - h / 2 - 8 * s
  const enemy = p.tone === 'enemy'
  ctx.beginPath()
  const r = Math.min(10 * s, h / 2)
  ctx.moveTo(x - w / 2 + r, y - h / 2)
  ctx.arcTo(x + w / 2, y - h / 2, x + w / 2, y + h / 2, r)
  ctx.arcTo(x + w / 2, y + h / 2, x - w / 2, y + h / 2, r)
  ctx.lineTo(x + 4 * s, y + h / 2)
  ctx.lineTo(x, y + h / 2 + 7 * s)
  ctx.lineTo(x - 4 * s, y + h / 2)
  ctx.arcTo(x - w / 2, y + h / 2, x - w / 2, y - h / 2, r)
  ctx.arcTo(x - w / 2, y - h / 2, x + w / 2, y - h / 2, r)
  ctx.closePath()
  ctx.fillStyle = enemy ? '#fbeee8' : '#fbf6ea'
  ctx.fill()
  ctx.lineWidth = 2 * s
  ctx.strokeStyle = enemy ? '#7a1f1a' : '#1e1a2b'
  ctx.stroke()
  ctx.fillStyle = enemy ? '#5a1612' : '#1e1a2b'
  ctx.fillText(p.text, x, y + 1 * s, maxW)
  ctx.restore()
}

/** Tir d'un général en vol : bombe à mèche, pot de feu, rocher, volée de flèches ou nuée de givre. */
function drawShell(ctx, p, pixel) {
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.translate(p.x, p.y)
  const lw = Math.max(1, pixel)
  if (p.sub === 'arrows') {
    // Cinq flèches en éventail, la pointe en feu, orientées selon la course.
    const t = Math.min(1, p.life / p.max)
    const dx = p.x1 - p.x0
    const dy = p.y1 - p.y0 - p.apex * 4 * (1 - 2 * t)
    ctx.rotate(Math.atan2(dy, dx))
    for (let i = 0; i < 5; i++) {
      const ox = -i * 9
      const oy = (i - 2) * 7
      ctx.strokeStyle = '#4a3220'
      ctx.lineWidth = 2 * lw
      ctx.beginPath()
      ctx.moveTo(ox - 16, oy)
      ctx.lineTo(ox + 6, oy)
      ctx.stroke()
      ctx.fillStyle = '#ffb347'
      ctx.beginPath()
      ctx.arc(ox + 8, oy, 3.2, 0, TAU)
      ctx.fill()
    }
  } else if (p.sub === 'frost') {
    ctx.globalAlpha = 0.85
    const s = 46
    ctx.drawImage(soft('214,240,255'), -s / 2, -s / 2, s, s)
    ctx.fillStyle = '#ffffff'
    for (let i = 0; i < 4; i++) {
      const a = p.rot + (i * TAU) / 4
      ctx.fillRect(Math.cos(a) * 9 - 1.5, Math.sin(a) * 9 - 1.5, 3, 3)
    }
  } else if (p.sub === 'boulder') {
    ctx.rotate(p.rot)
    ctx.fillStyle = '#7f796f'
    ctx.strokeStyle = '#4b463f'
    ctx.lineWidth = 2 * lw
    ctx.beginPath()
    for (let i = 0; i < 7; i++) {
      const a = (i * TAU) / 7
      const r = 13 + ((i * 5) % 3)
      i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  } else {
    // Bombe (noire, mèche qui crépite) ou pot de feu (terre cuite, flammes).
    const pot = p.sub === 'firepot'
    ctx.fillStyle = pot ? '#a5533d' : '#1f1b28'
    ctx.strokeStyle = pot ? '#5e2a1c' : '#000000'
    ctx.lineWidth = 2 * lw
    ctx.beginPath()
    ctx.arc(0, 0, pot ? 9 : 10, 0, TAU)
    ctx.fill()
    ctx.stroke()
    const flick = 0.7 + 0.3 * Math.sin(p.life / 30)
    ctx.globalCompositeOperation = 'lighter'
    const s = (pot ? 34 : 16) * flick
    ctx.drawImage(soft(pot ? '255,150,60' : '255,210,120'), (pot ? 0 : 6) - s / 2, (pot ? -8 : -9) - s / 2, s, s)
  }
  ctx.restore()
}

/**
 * Titre d'enchaînement : taille constante à l'écran (`pixel`), rebond
 * élastique à l'apparition, dégradé or et contour encre, léger penché.
 */
function drawCallout(ctx, p, { pixel, viewWidth, skyY }) {
  const t = p.life / p.max
  // Rebond « ease-out back » : dépasse sa taille puis se pose (220 ms).
  const u = Math.min(1, p.life / 220) - 1
  const pop = 0.3 + 0.7 * (1 + 2.70158 * u * u * u + 1.70158 * u * u)
  const size = p.size * pop * Math.max(1, pixel)
  // Dans le ciel, sous le bandeau (v6.2), jamais par-dessus la partie.
  const y = skyY === null ? p.y : Math.min(p.y0, skyY + size / 2) + (p.y - p.y0)
  ctx.save()
  ctx.translate(p.x, y)
  ctx.rotate(-0.06)
  ctx.globalAlpha = t > 0.75 ? (1 - t) / 0.25 : 1
  ctx.font = `700 ${Math.round(size)}px Cinzel, Georgia, serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = size * 0.2
  ctx.strokeStyle = '#1e1a2b'
  // Jamais plus large que 80 % de l'écran (langues aux mots longs, téléphone en portrait).
  const maxW = viewWidth > 0 ? viewWidth * 0.8 * pixel : 1e6
  ctx.strokeText(p.text, 0, 0, maxW)
  const g = ctx.createLinearGradient(0, -size / 2, 0, size / 2)
  g.addColorStop(0, '#fff3c4')
  g.addColorStop(0.5, p.tier >= 3 ? '#ffb347' : '#f2c94c')
  g.addColorStop(1, p.tier >= 3 ? '#d4552b' : '#c98f1e')
  ctx.fillStyle = g
  ctx.fillText(p.text, 0, 0, maxW)
  ctx.restore()
}

/** Tache au sol (sang, suie) : s'étale vite, s'efface sur le dernier tiers. */
function drawStain(ctx, p) {
  const t = p.life / p.max
  const grow = Math.min(1, p.life / 200)
  const base = p.opacity ?? 0.85
  ctx.globalAlpha = t < 0.65 ? base : base * (1 - (t - 0.65) / 0.35)
  ctx.fillStyle = p.color
  ctx.beginPath()
  for (const l of p.lobes) {
    ctx.moveTo(p.x + l.dx * grow + l.r * grow, p.y + l.dy)
    ctx.ellipse(p.x + l.dx * grow, p.y + l.dy, l.r * grow, l.r * grow * 0.38, 0, 0, TAU)
  }
  ctx.fill()
}
