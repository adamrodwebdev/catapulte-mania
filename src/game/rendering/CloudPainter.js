import { CLOUD_KINDS } from '../physics/Clouds.js'

/**
 * Nuages du champ de bataille (v6.2, sortis du Renderer ; voir physics/Clouds.js) :
 * poison, miasmes, farine, essaim d'abeilles. Dessin seulement, en repère du monde.
 */

/**
 * Nuages (v6.1) : des volutes douces qui tournent lentement (poison vert,
 * miasmes ternes, farine blanche) ; ils s'estompent avant de disparaître.
 */
export function drawClouds(ctx, clouds, worldTime, time, animate) {
  const spin = animate === false ? 0 : time / 2400
  for (const c of clouds.list) {
    const r = clouds.radiusAt(c, worldTime)
    const alpha = clouds.alphaAt(c, worldTime)
    const rgb = CLOUD_KINDS[c.kind]?.rgb ?? '200,200,200'
    // Essaim : des abeilles qui tournoient, pas une nappe.
    if (c.kind === 'bees') {
      ctx.save()
      ctx.fillStyle = `rgba(${rgb},${0.95 * alpha})`
      const t = animate === false ? 0 : time / 1000
      for (let i = 0; i < 26; i++) {
        const a = i * 2.39996 + t * (1.5 + (i % 5) * 0.4)
        const d = r * (0.25 + ((i * 37) % 70) / 100)
        ctx.beginPath()
        ctx.arc(c.x + Math.cos(a) * d, c.y + Math.sin(a * 1.31) * d * 0.7, 2.2, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
      continue
    }
    ctx.save()
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + spin * (i % 2 ? 1 : -1)
      const d = i === 6 ? 0 : r * 0.42
      const x = c.x + Math.cos(a) * d
      const y = c.y + Math.sin(a) * d * 0.7
      const rr = r * (i === 6 ? 0.75 : 0.55)
      const g = ctx.createRadialGradient(x, y, rr * 0.1, x, y, rr)
      g.addColorStop(0, `rgba(${rgb},${0.42 * alpha})`)
      g.addColorStop(1, `rgba(${rgb},0)`)
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, rr, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
}
