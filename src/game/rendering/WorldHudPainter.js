import { HealthBarTracker, drawHealthBar } from './HealthBar.js'
import { ENGINE_FRAME } from './EnginePainter.js'

/**
 * Repères du monde au-dessus des personnages et de l'engin (v6.2, sortis du
 * Renderer) : barre de vie de l'engin et ses pastilles d'avaries, panneau des
 * pillards, cœurs des généraux, barres de vie des défenseurs. Taille fixe à
 * l'écran (`pixel` = 1 / zoom). Garde la mémoire des barres de vie (coups,
 * traînée) d'une image à l'autre.
 */
export class WorldHudPainter {
  /** Barres de vie : leur état d'animation (voir HealthBar.js). */
  #bars = new HealthBarTracker()

  /**
   * Points de vie de l'engin (v5.8) : barre au-dessus de lui, couleur qui
   * passe du vert au rouge, et une pastille par avarie (forme et couleur : la
   * couleur n'est jamais seule à porter l'information). Taille fixe à l'écran.
   */
  drawEngineBar(ctx, c, pixel, highContrast, view, time, animate) {
    const w = c.condition
    const f = ENGINE_FRAME[c.kind] ?? ENGINE_FRAME.catapult
    const px = Math.max(0.6, pixel)
    const bw = 110 * px
    const bh = 10 * px
    // Place des pastilles à droite (quatre au plus) : la barre ne sort jamais de l'écran.
    const tail = 4 * 22 * px + 10 * px
    const x = Math.max(view.left + 8 * px, Math.min(view.right - bw - tail, c.x - bw / 2))
    const y = c.y + f.y0 - 34 * px
    const ratio = Math.max(0, Math.min(1, w.hp))
    ctx.save()
    // v6.2 : même barre que les défenseurs (voir HealthBar.js), en quarts.
    const s = this.#bars.trackEngine(ratio, 1, time, animate !== false)
    const state = w.heat > 0 ? 'fire' : w.frozen ? 'frost' : null
    drawHealthBar(ctx, s, { x: x + bw / 2, y, w: bw, h: bh, maxHp: 1, cell: 0.25, px, time, animate: animate !== false, state, highContrast, idleFade: false })
    // Pastilles d'avaries.
    const pips = []
    if (w.heat > 0) pips.push('fire')
    if (w.frozen) pips.push('frost')
    if (w.crack) pips.push('crack')
    if (w.rust) pips.push('rust')
    pips.forEach((kind, i) => this.#pip(ctx, x + bw + (14 + i * 22) * px, y + bh / 2, 9 * px, kind, w))
    ctx.restore()
  }

  #pip(ctx, x, y, r, kind, w) {
    const fill = { fire: '#e8742c', frost: '#7fc8f0', crack: '#8a6a4a', rust: '#a8552a' }[kind]
    ctx.fillStyle = 'rgba(30,26,43,0.85)'
    ctx.beginPath()
    ctx.arc(x, y, r + r * 0.25, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = fill
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#fff6dc'
    ctx.fillStyle = '#fff6dc'
    ctx.lineWidth = r * 0.22
    ctx.lineCap = 'round'
    ctx.beginPath()
    if (kind === 'fire') {
      // Flamme : plus haute avec l'intensité.
      const h = r * (0.5 + 0.18 * Math.min(3, Math.ceil(w.heat)))
      ctx.moveTo(x - r * 0.4, y + r * 0.45)
      ctx.quadraticCurveTo(x - r * 0.5, y - h * 0.3, x, y - h)
      ctx.quadraticCurveTo(x + r * 0.5, y - h * 0.3, x + r * 0.4, y + r * 0.45)
      ctx.closePath()
      ctx.fill()
    } else if (kind === 'frost') {
      for (let a = 0; a < 3; a++) {
        const t = (a * Math.PI) / 3
        ctx.moveTo(x - Math.cos(t) * r * 0.6, y - Math.sin(t) * r * 0.6)
        ctx.lineTo(x + Math.cos(t) * r * 0.6, y + Math.sin(t) * r * 0.6)
      }
      ctx.stroke()
    } else if (kind === 'crack') {
      ctx.moveTo(x - r * 0.15, y - r * 0.6)
      ctx.lineTo(x + r * 0.2, y - r * 0.1)
      ctx.lineTo(x - r * 0.2, y + r * 0.15)
      ctx.lineTo(x + r * 0.15, y + r * 0.6)
      ctx.stroke()
    } else {
      // Rouille : un boulon écaillé.
      ctx.arc(x, y, r * 0.38, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillRect(x + r * 0.25, y - r * 0.55, r * 0.22, r * 0.22)
    }
  }

  /**
   * Pillards (v5.8) : un panneau « ! » au-dessus de ceux qui chargent l'engin,
   * qui rebondit doucement. On les repère d'un coup d'œil, même de loin.
   */
  drawRaiders(ctx, list, time, animate, pixel) {
    const px = Math.max(1, pixel)
    for (const e of list) {
      if (e.kind !== 'target' || !e.raiding || e.alive === false) continue
      const bob = animate === false ? 0 : Math.sin(time / 140 + e.id) * 3 * px
      const x = e.x
      const y = e.y - e.height / 2 - 22 * px + bob
      const s = 11 * px
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(x, y - s)
      ctx.lineTo(x + s, y + s * 0.8)
      ctx.lineTo(x - s, y + s * 0.8)
      ctx.closePath()
      ctx.fillStyle = '#e2553b'
      ctx.fill()
      ctx.lineWidth = 2 * px
      ctx.strokeStyle = '#1e1a2b'
      ctx.stroke()
      ctx.fillStyle = '#fff6dc'
      ctx.fillRect(x - 1.4 * px, y - s * 0.45, 2.8 * px, s * 0.75)
      ctx.fillRect(x - 1.4 * px, y + s * 0.42, 2.8 * px, 2.8 * px)
      ctx.restore()
    }
  }

  /**
   * Généraux (v6.0) : leurs vies en cœurs au-dessus de la tête. Le cœur qu'il
   * vient de perdre enfle puis se vide pendant qu'il se relève.
   */
  drawGenerals(ctx, list, time, animate, pixel) {
    const px = Math.max(1, pixel)
    for (const e of list) {
      if (e.kind !== 'target' || e.type !== 'general' || e.alive === false) continue
      const n = e.maxLives
      const s = 5.5 * px
      const step = s * 2.4
      const x0 = e.x - ((n - 1) * step) / 2
      const y = e.y - e.height / 2 - 16 * px
      const lost = e.guardProgress
      for (let i = 0; i < n; i++) {
        const full = i < e.lives
        const fresh = i === e.lives && lost < 1
        const k = fresh && animate !== false ? 1 + 0.5 * Math.sin(lost * Math.PI) : 1
        this.#heart(ctx, x0 + i * step, y, s * k, full || (fresh && lost < 0.6), px)
      }
    }
  }

  /**
   * Barres de vie des défenseurs (v6.1 ; v6.2, voir HealthBar.js) : dès le premier coup
   * (toujours pour un général), au-dessus de la tête ; cellules de 10 points de
   * vie (50 pour les gros), liseré d'acier pour l'armure, teinte de l'état.
   */
  drawHealth(ctx, list, worldTime, time, animate, pixel, highContrast) {
    const px = Math.max(1, pixel)
    const anim = animate !== false
    for (const e of list) {
      if (e.kind !== 'target' || e.alive === false || !Number.isFinite(e.maxHp)) continue
      const general = e.type === 'general'
      const hp = Math.max(0, e.hp)
      const s = this.#bars.track(e, hp, e.maxHp, time, anim)
      if (!general && hp >= e.maxHp - 0.5 && s.lag >= e.maxHp - 0.5) {
        // Pas encore touché : la barre apparaîtra en fondu au premier coup.
        s.shownAt = time
        continue
      }
      const big = general || e.maxHp > 120
      const top = general ? e.y - e.height / 2 - 10 * px : e.body.bounds.min.y - 11 * px
      const state = e.poisonedAt(worldTime) ? 'poison' : e.burning > 0 ? 'fire' : e.frozenMs > 0 ? 'frost' : null
      drawHealthBar(ctx, s, {
        x: e.x, y: top, w: (big ? 40 : 30) * px, h: (big ? 6.5 : 5.5) * px, maxHp: e.maxHp, cell: e.maxHp > 120 ? 50 : 10,
        px, time, animate: anim, state, armored: e.armored, highContrast,
      })
    }
  }

  #heart(ctx, x, y, s, full, px) {
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(x, y + s * 0.9)
    ctx.bezierCurveTo(x - s * 1.3, y + s * 0.1, x - s * 1.1, y - s * 1, x, y - s * 0.35)
    ctx.bezierCurveTo(x + s * 1.1, y - s * 1, x + s * 1.3, y + s * 0.1, x, y + s * 0.9)
    ctx.closePath()
    ctx.fillStyle = full ? '#e2453b' : 'rgba(30,26,43,0.55)'
    ctx.fill()
    ctx.lineWidth = 1.6 * px
    ctx.strokeStyle = full ? '#1e1a2b' : 'rgba(255,246,220,0.85)'
    ctx.stroke()
    if (full) {
      ctx.beginPath()
      ctx.arc(x - s * 0.45, y - s * 0.25, s * 0.22, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.fill()
    }
    ctx.restore()
  }
}
