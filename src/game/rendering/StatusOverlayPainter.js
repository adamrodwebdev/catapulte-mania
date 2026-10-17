/**
 * États visibles sur les objets et les personnages (v6.2, sortis du Renderer) :
 * clé de voûte, fer rougi, fer électrisé, givre, boule de neige, et cercles des
 * étendards et des cris de guerre au pied des défenseurs. Dessin seulement :
 * les règles (qui est rougi, gelé, galvanisé…) sont lues sur les entités.
 */

/**
 * Fer rougi (v6.2) : il luit du cœur vers les bords, vacille, et refroidit
 * (la lueur s'éteint dans la dernière seconde et demie).
 */
export function drawRedHot(ctx, e, left, time, animate, pixel) {
  const k = Math.min(1, left)
  const w = e.width
  const h = e.height
  const flicker = animate === false ? 1 : 0.85 + 0.15 * Math.sin(time / 47 + e.id)
  ctx.save()
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(w, h) * 0.65)
  g.addColorStop(0, `rgba(255,214,120,${0.75 * k * flicker})`)
  g.addColorStop(0.5, `rgba(255,96,28,${0.6 * k * flicker})`)
  g.addColorStop(1, `rgba(170,30,10,${0.35 * k})`)
  ctx.fillStyle = g
  ctx.fillRect(-w / 2, -h / 2, w, h)
  ctx.shadowColor = `rgba(255,90,20,${0.8 * k})`
  ctx.shadowBlur = 10 * Math.max(1, pixel)
  ctx.lineWidth = 1.5 * Math.max(1, pixel)
  ctx.strokeStyle = `rgba(255,150,60,${0.7 * k})`
  ctx.strokeRect(-w / 2, -h / 2, w, h)
  ctx.restore()
}

/** Fer électrisé (v6.2) : teinte bleue et petits arcs qui courent sur le métal. */
export function drawCharged(ctx, e, time, animate, pixel) {
  const px = Math.max(1, pixel)
  const w = e.width
  const h = e.height
  ctx.save()
  ctx.fillStyle = 'rgba(120,190,255,0.28)'
  ctx.fillRect(-w / 2, -h / 2, w, h)
  ctx.shadowColor = 'rgba(140,200,255,0.9)'
  ctx.shadowBlur = 8 * px
  ctx.strokeStyle = 'rgba(225,242,255,0.95)'
  ctx.lineWidth = 1.3 * px
  const frame = animate === false ? 0 : Math.floor(time / 70)
  let seed = (e.id * 31 + frame * 7) % 233280
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
  for (let a = 0; a < 2; a++) {
    ctx.beginPath()
    let x = -w / 2 + rnd() * w
    let y = -h / 2
    ctx.moveTo(x, y)
    for (let i = 0; i < 5; i++) {
      x = Math.max(-w / 2, Math.min(w / 2, x + (rnd() - 0.5) * w * 0.5))
      y += h / 5
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * Clé de voûte (v6.2) : une lézarde qui court sur toute la pierre, des éclats
 * aux coins, et un liseré chaud qui bat doucement (fixe en mouvement réduit) :
 * on la repère au premier regard.
 */
export function drawKeystone(ctx, e, time, animate, pixel) {
  if (e.keystoneGone) return
  const px = Math.max(1, pixel)
  const w = e.width
  const h = e.height
  ctx.save()
  const glow = animate === false ? 0.7 : 0.5 + 0.3 * Math.sin(time / 260)
  ctx.shadowColor = `rgba(255,170,60,${glow})`
  ctx.shadowBlur = 9 * px
  ctx.lineWidth = 2.4 * px
  ctx.strokeStyle = `rgba(255,190,90,${glow})`
  ctx.strokeRect(-w / 2 + 1.2 * px, -h / 2 + 1.2 * px, w - 2.4 * px, h - 2.4 * px)
  ctx.shadowBlur = 0
  ctx.shadowColor = 'transparent'
  // La lézarde : du haut vers le bas, en zigzag, avec une branche.
  let seed = (e.id * 104729) % 233280
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
  const tall = h >= w
  const n = 6
  const pts = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const wob = (rnd() - 0.5) * (tall ? w : h) * 0.42
    pts.push(tall ? { x: wob, y: -h / 2 + h * t } : { x: -w / 2 + w * t, y: wob })
  }
  for (const [color, off] of [['rgba(255,236,200,0.45)', 1.1], ['rgba(24,16,10,0.92)', 0]]) {
    ctx.beginPath()
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x + off * px, p.y + off * px) : ctx.moveTo(p.x + off * px, p.y + off * px)))
    ctx.lineWidth = (off ? 1.2 : 2.2) * px
    ctx.strokeStyle = color
    ctx.stroke()
  }
  const m = pts[Math.floor(n / 2)]
  ctx.beginPath()
  ctx.moveTo(m.x, m.y)
  ctx.lineTo(m.x + (tall ? w * 0.32 : 4 * px), m.y + (tall ? h * 0.12 : h * 0.3))
  ctx.lineWidth = 1.1 * px
  ctx.strokeStyle = 'rgba(24,16,10,0.85)'
  ctx.stroke()
  // Éclats aux coins.
  ctx.fillStyle = 'rgba(24,16,10,0.55)'
  for (const [sx, sy] of [[-1, -1], [1, 1]]) {
    ctx.beginPath()
    ctx.moveTo((sx * w) / 2, (sy * h) / 2)
    ctx.lineTo((sx * w) / 2 - sx * 4 * px, (sy * h) / 2)
    ctx.lineTo((sx * w) / 2, (sy * h) / 2 - sy * 4 * px)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

/**
 * Étendard (v5.8) : un cercle d'or pâle au pied de chaque défenseur
 * galvanisé, qui pulse doucement. On voit d'un coup d'œil qui il protège.
 * Cri de guerre d'un général (v6.0) : un cercle rouge qui bat plus vite.
 */
export function drawAuras(ctx, list, time, animate, pixel) {
  const k = animate === false ? 0.5 : 0.5 + 0.5 * Math.sin(time / 380)
  const fast = animate === false ? 0.5 : 0.5 + 0.5 * Math.sin(time / 150)
  ctx.save()
  ctx.lineWidth = 2.4 * Math.max(1, pixel)
  for (const e of list) {
    if (e.kind !== 'target' || e.alive === false) continue
    const feet = e.y + e.height / 2
    if (e.aura > 1 || e.type === 'bannerman') {
      ctx.globalAlpha = e.type === 'bannerman' ? 0.75 : 0.35 + 0.35 * k
      ctx.strokeStyle = '#f2c94c'
      ctx.beginPath()
      ctx.ellipse(e.x, feet - 1, e.width * 0.75 + k * 3, 5 + k, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    if (e.buff > 1) {
      ctx.globalAlpha = 0.45 + 0.4 * fast
      ctx.strokeStyle = '#ff6a3d'
      ctx.beginPath()
      ctx.ellipse(e.x, feet - 1, e.width * 0.9 + fast * 4, 6 + fast, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
  ctx.restore()
}

/** Objet gelé : voile bleuté, liseré de givre et reflets. */
export function drawFrost(ctx, e, time, pixel) {
  ctx.save()
  ctx.beginPath()
  if (e.kind === 'block' && e.localVertices?.length) {
    e.localVertices.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)))
    ctx.closePath()
  } else if (e.kind === 'barrel') {
    ctx.rect(-e.width / 2, -e.height / 2, e.width, e.height)
  } else {
    // Personnage pris dans un bloc de glace.
    const w = e.width * 1.2
    const h = e.height * 1.06
    const r = Math.min(6, w / 5)
    ctx.moveTo(-w / 2 + r, -h / 2)
    ctx.arcTo(w / 2, -h / 2, w / 2, h / 2, r)
    ctx.arcTo(w / 2, h / 2, -w / 2, h / 2, r)
    ctx.arcTo(-w / 2, h / 2, -w / 2, -h / 2, r)
    ctx.arcTo(-w / 2, -h / 2, w / 2, -h / 2, r)
    ctx.closePath()
  }
  // Le gel s'estompe sur ses deux dernières secondes.
  const fade = Math.min(1, e.frozenMs / 2000)
  ctx.globalAlpha = 0.42 * fade
  ctx.fillStyle = '#bfe6ff'
  ctx.fill()
  ctx.globalAlpha = 0.9 * fade
  ctx.lineWidth = 2.2 * pixel
  ctx.strokeStyle = '#eaf8ff'
  ctx.stroke()
  ctx.globalAlpha = (0.5 + 0.5 * Math.sin(time / 260 + e.id)) * fade
  ctx.fillStyle = '#ffffff'
  const s = Math.min(e.width, e.height) * 0.18
  ctx.fillRect(-e.width * 0.25, -e.height * 0.3, s, 1.6 * pixel)
  ctx.fillRect(-e.width * 0.25 + s * 0.4, -e.height * 0.3 - s * 0.4, 1.6 * pixel, s)
  ctx.restore()
}

/** Boule de neige : le boulet s'enrobe de neige en roulant. */
export function drawSnowball(ctx, e, pixel) {
  const r = e.radius
  ctx.save()
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(1, '#c9d9e8')
  ctx.globalAlpha = Math.min(1, (e.snowScale - 1) * 3)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.lineWidth = 1.6 * pixel
  ctx.strokeStyle = 'rgba(60,80,100,0.6)'
  ctx.stroke()
  ctx.restore()
}
