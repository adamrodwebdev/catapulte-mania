import { SeededRandom } from '../../core/utils/SeededRandom.js'

const MAX_PARTICLES = 700
const COLORS = Object.freeze({
  wood: ['#b07a43', '#8a5a2b', '#c99660'],
  straw: ['#d6b04f', '#e8c867', '#b8902f'],
  stone: ['#9e988c', '#7f796f', '#bdb6a8'],
  iron: ['#6c7480', '#8b93a0', '#4b515b'],
  brick: ['#9e4632', '#b85a40', '#d8cbb3'],
  sandstone: ['#d6b076', '#c09a62', '#e8cf9c'],
  ice: ['#d8f0fb', '#a9d6ee', '#ffffff'],
  marble: ['#efe9df', '#d8d0c4', '#c9a65a'],
  glass: ['#3e6fb5', '#b2413a', '#d9a93a', '#e8eef7'],
  target: ['#a3322b', '#d4a537', '#f0c8a0'],
  barrel: ['#7a3d22', '#4b515b', '#b07a43'],
})

/**
 * Système de particules purement visuel (débris, fumée, flammes, étincelles,
 * scores flottants). Les particules sont recyclées : pas d'allocation en jeu.
 */
export class ParticleSystem {
  /** @type {object[]} */
  #items = []
  #rng = new SeededRandom(99)
  /** Facteur de quantité (réduit si « animations réduites »). */
  density = 1

  get count() {
    return this.#items.length
  }

  #spawn(p) {
    if (this.#items.length >= MAX_PARTICLES) this.#items.shift()
    this.#items.push(p)
  }

  #n(base) {
    return Math.max(1, Math.round(base * this.density))
  }

  /** Éclats d'un bloc détruit. */
  debris(x, y, material, size = 30) {
    const palette = COLORS[material] || COLORS.stone
    const r = this.#rng
    for (let i = 0; i < this.#n(9); i++) {
      this.#spawn({
        kind: 'chunk', x: x + r.range(-size / 3, size / 3), y: y + r.range(-size / 3, size / 3),
        vx: r.range(-3, 3), vy: r.range(-5, -1), life: 0, max: r.range(700, 1300),
        size: r.range(4, 10), color: r.pick(palette), rot: r.range(0, 6), vr: r.range(-0.3, 0.3),
      })
    }
    this.dust(x, y, 4)
  }

  dust(x, y, amount = 6, color = 'rgba(210,200,180,') {
    const r = this.#rng
    for (let i = 0; i < this.#n(amount); i++) {
      this.#spawn({
        kind: 'smoke', x: x + r.range(-10, 10), y: y + r.range(-6, 6), vx: r.range(-0.8, 0.8), vy: r.range(-0.9, -0.2),
        life: 0, max: r.range(600, 1100), size: r.range(8, 18), color,
      })
    }
  }

  explosion(x, y, radius) {
    const r = this.#rng
    for (let i = 0; i < this.#n(26); i++) {
      const a = r.range(0, Math.PI * 2)
      const sp = r.range(2, 9)
      this.#spawn({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, life: 0, max: r.range(300, 650), size: r.range(2, 5), color: r.pick(['#ffd36b', '#ff8c3a', '#fff1c4']) })
    }
    for (let i = 0; i < this.#n(14); i++) {
      this.#spawn({ kind: 'smoke', x: x + r.range(-radius / 4, radius / 4), y: y + r.range(-radius / 4, radius / 4), vx: r.range(-1, 1), vy: r.range(-1.6, -0.4), life: 0, max: r.range(900, 1700), size: r.range(20, 40), color: 'rgba(60,55,60,' })
    }
    this.#spawn({ kind: 'flash', x, y, vx: 0, vy: 0, life: 0, max: 260, size: radius, color: '#fff1c4' })
  }

  /** Flammes au-dessus d'une entité en feu (appelé à chaque image). */
  flame(x, y, w) {
    const r = this.#rng
    if (r.next() > 0.55 * this.density) return
    this.#spawn({ kind: 'flame', x: x + r.range(-w / 2, w / 2), y, vx: r.range(-0.3, 0.3), vy: r.range(-1.6, -0.8), life: 0, max: r.range(350, 700), size: r.range(5, 11), color: r.pick(['#ffb347', '#ff7a2f', '#ffd36b']) })
  }

  /**
   * Traînée du projectile en vol. `style` vient de l'apparence choisie à l'atelier :
   * smoke (fumée), embers (braises), stars (étincelles dorées).
   */
  trail(x, y, burning, style = 'smoke') {
    if (this.#rng.next() > 0.6 * this.density) return
    const r = this.#rng
    if (burning) {
      this.#spawn({ kind: 'flame', x, y, vx: 0, vy: -0.2, life: 0, max: 300, size: 7, color: '#ffb347' })
    } else if (style === 'embers') {
      this.#spawn({ kind: 'spark', x, y, vx: r.range(-0.4, 0.4), vy: r.range(-0.6, 0), life: 0, max: 420, size: r.range(2, 3.5), color: r.pick(['#ff8c3a', '#ffd36b', '#ff5a2a']) })
    } else if (style === 'pumpkin') {
      // Événement d'automne : étincelles orangées et petites ombres de chauves-souris.
      this.#spawn({ kind: 'spark', x, y, vx: r.range(-0.5, 0.5), vy: r.range(-0.7, 0), life: 0, max: 460, size: r.range(2.5, 4), color: r.pick(['#ff7a1a', '#ffb347', '#3a2140']) })
    } else if (style === 'snow') {
      // Événement d'hiver : flocons qui tombent doucement.
      this.#spawn({ kind: 'flame', x: x + r.range(-5, 5), y: y + r.range(-5, 5), vx: r.range(-0.2, 0.2), vy: r.range(0.1, 0.4), life: 0, max: 700, size: r.range(2, 3.5), color: r.pick(['#ffffff', '#e6f3ff', '#cfe6ff']) })
    } else if (style === 'stars') {
      this.#spawn({ kind: 'flame', x: x + r.range(-4, 4), y: y + r.range(-4, 4), vx: 0, vy: 0, life: 0, max: 520, size: r.range(2, 4), color: r.pick(['#fff1c4', '#d4a537', '#ffffff']) })
    } else {
      this.#spawn({ kind: 'smoke', x, y, vx: 0, vy: -0.2, life: 0, max: 450, size: 5, color: 'rgba(230,225,215,' })
    }
  }

  /**
   * Mort d'une cible : gerbe de gouttes de sang projetées dans le sens du choc,
   * puis une tache au sol qui s'étale brièvement et s'efface en quelques secondes.
   * @param {number} x
   * @param {number} y centre de la cible
   * @param {number} groundY hauteur où la tache se dépose (pied de la cible)
   * @param {number} dir sens de projection (-1 gauche, 1 droite, 0 indifférent)
   */
  blood(x, y, groundY, dir = 0) {
    const r = this.#rng
    for (let i = 0; i < this.#n(16); i++) {
      const a = -Math.PI / 2 + r.range(-1.1, 1.1) + dir * 0.5
      const sp = r.range(2, 6.5)
      this.#spawn({
        kind: 'drop', x: x + r.range(-6, 6), y: y + r.range(-14, 6),
        vx: Math.cos(a) * sp + dir * r.range(0.5, 2), vy: Math.sin(a) * sp, life: 0, max: r.range(450, 850),
        size: r.range(2, 4.5), color: r.pick(['#8e1414', '#a51c1c', '#6d0d0d']), floor: groundY,
      })
    }
    // Tache : quelques lobes irréguliers, posés au sol.
    const lobes = Array.from({ length: 6 }, () => ({ dx: r.range(-22, 22), dy: r.range(-3, 3), r: r.range(6, 14) }))
    this.#spawn({ kind: 'stain', x, y: groundY - 2, vx: 0, vy: 0, life: 0, max: 3600, size: 1, color: '#7a1010', lobes })
  }

  /** Texte flottant (points gagnés). */
  text(x, y, text, color = '#f6d98a') {
    this.#spawn({ kind: 'text', x, y, vx: 0, vy: -0.9, life: 0, max: 1200, size: 28, color, text: String(text) })
  }

  clear() {
    this.#items.length = 0
  }

  /** Vent du moment (−1..1 et au-delà en Difficile) : pousse fumée et flammes. */
  wind = 0

  update(dtMs) {
    const k = dtMs / 16.67
    const drift = this.wind * 0.9
    for (const p of this.#items) {
      p.life += dtMs
      p.x += p.vx * k
      if (p.kind === 'smoke' || p.kind === 'flame') p.x += drift * k * Math.min(1, p.life / 300)
      p.y += p.vy * k
      if (p.kind === 'chunk' || p.kind === 'spark' || p.kind === 'drop') p.vy += 0.28 * k
      // Les gouttes s'arrêtent au sol au lieu de le traverser.
      if (p.kind === 'drop' && p.y > p.floor) {
        p.y = p.floor
        p.vx = 0
        p.vy = 0
      }
      if (p.kind === 'chunk') p.rot += p.vr * k
      if (p.kind === 'smoke') p.size += 0.25 * k
    }
    this.#items = this.#items.filter((p) => p.life < p.max)
  }

  /** @param {CanvasRenderingContext2D} ctx contexte en coordonnées monde */
  draw(ctx, pixel = 1) {
    for (const p of this.#items) {
      const t = p.life / p.max
      const alpha = 1 - t
      switch (p.kind) {
        case 'chunk':
          ctx.save()
          ctx.translate(p.x, p.y)
          ctx.rotate(p.rot)
          ctx.globalAlpha = Math.min(1, alpha * 1.6)
          ctx.fillStyle = p.color
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7)
          ctx.strokeStyle = '#1e1a2b'
          ctx.lineWidth = pixel
          ctx.strokeRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7)
          ctx.restore()
          break
        case 'smoke':
          ctx.globalAlpha = 1
          ctx.fillStyle = `${p.color}${(alpha * 0.45).toFixed(3)})`
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          ctx.fill()
          break
        case 'flame':
        case 'spark':
          ctx.globalAlpha = alpha
          ctx.fillStyle = p.color
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size * (1 - t * 0.5), 0, Math.PI * 2)
          ctx.fill()
          break
        case 'flash': {
          ctx.globalAlpha = alpha * 0.8
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size)
          g.addColorStop(0, p.color)
          g.addColorStop(1, 'rgba(255,140,60,0)')
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          ctx.fill()
          break
        }
        case 'drop':
          ctx.globalAlpha = Math.min(1, alpha * 1.8)
          ctx.fillStyle = p.color
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          ctx.fill()
          break
        case 'stain': {
          // Étalement rapide (200 ms) puis disparition progressive sur le dernier tiers.
          const grow = Math.min(1, p.life / 200)
          ctx.globalAlpha = t < 0.65 ? 0.85 : 0.85 * (1 - (t - 0.65) / 0.35)
          ctx.fillStyle = p.color
          ctx.beginPath()
          for (const l of p.lobes) {
            ctx.moveTo(p.x + l.dx * grow + l.r * grow, p.y + l.dy)
            ctx.ellipse(p.x + l.dx * grow, p.y + l.dy, l.r * grow, l.r * grow * 0.38, 0, 0, Math.PI * 2)
          }
          ctx.fill()
          break
        }
        case 'text':
          ctx.globalAlpha = Math.min(1, alpha * 2)
          ctx.font = `700 ${p.size}px Cinzel, Georgia, serif`
          ctx.textAlign = 'center'
          ctx.lineWidth = 5 * pixel
          ctx.strokeStyle = '#1e1a2b'
          ctx.strokeText(p.text, p.x, p.y)
          ctx.fillStyle = p.color
          ctx.fillText(p.text, p.x, p.y)
          break
      }
    }
    ctx.globalAlpha = 1
  }
}
