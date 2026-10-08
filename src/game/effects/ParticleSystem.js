import { SeededRandom } from '../../core/utils/SeededRandom.js'
import { WORLD } from '../physics/constants.js'

const MAX_PARTICLES = 900
const TAU = Math.PI * 2
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
  dirt: ['#7a5636', '#5e422a', '#94704a'],
})
/** Matériaux qui se fendent en échardes (plutôt qu'en morceaux) et ceux qui font des étincelles. */
const SPLINTERS = new Set(['wood', 'straw', 'barrel'])
const SPARKY = new Set(['stone', 'iron', 'marble', 'brick', 'sandstone'])
const CONFETTI = ['#d4a537', '#a3322b', '#2f4b7c', '#3d7a3a', '#f4efe6', '#ffb347']

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

/**
 * Système de particules purement visuel (éclats, échardes, fumée, feu,
 * étincelles, ondes de choc, confettis, scores flottants).
 *
 * v4.2 : rendu « moderne » : fumée et poussière en disques flous qui
 * gonflent, feu et étincelles en mélange additif (ils brillent), éclats qui
 * rebondissent sur le sol, boule de feu + onde de choc + suie au sol pour les
 * explosions, étincelles sur la pierre et le fer, confettis à la victoire.
 * Les particules sont plafonnées (les plus anciennes cèdent la place).
 */
export class ParticleSystem {
  /** @type {object[]} */
  #items = []
  #rng = new SeededRandom(99)
  /** Facteur de quantité (réduit si « animations réduites »). */
  density = 1
  /** Vent du moment (−1..1 et au-delà en Difficile) : pousse fumée et flammes. */
  wind = 0
  /**
   * Test « ce point est-il dans un bloc ? » fourni par la partie (facultatif).
   * Les gouttes de sang s'écrasent sur les murs au lieu de les traverser.
   * @type {((x: number, y: number) => boolean) | null}
   */
  surfaceAt = null

  get count() {
    return this.#items.length
  }

  /** Nombre de particules d'un type donné (diagnostic et tests). */
  countOf(kind) {
    let n = 0
    for (const p of this.#items) if (p.kind === kind) n++
    return n
  }

  #spawn(p) {
    if (this.#items.length >= MAX_PARTICLES) this.#items.shift()
    p.life = 0
    this.#items.push(p)
  }

  #n(base) {
    return Math.max(1, Math.round(base * this.density))
  }

  /* ---------- Émetteurs ---------- */

  /** Éclats d'un bloc détruit : morceaux ou échardes selon le matériau, plus un nuage. */
  debris(x, y, material, size = 30) {
    const palette = COLORS[material] || COLORS.stone
    const r = this.#rng
    const splinter = SPLINTERS.has(material)
    const count = this.#n(Math.min(18, 8 + size / 8))
    for (let i = 0; i < count; i++) {
      const s = r.range(4, 11) * (size > 60 ? 1.3 : 1)
      this.#spawn({
        kind: splinter ? 'shard' : 'chunk',
        x: x + r.range(-size / 3, size / 3), y: y + r.range(-size / 3, size / 3),
        vx: r.range(-3.5, 3.5), vy: r.range(-6, -1.5), max: r.range(1100, 1900),
        size: s, len: splinter ? s * r.range(1.8, 3) : s, color: r.pick(palette),
        rot: r.range(0, TAU), vr: r.range(-0.35, 0.35), floor: WORLD.GROUND_Y + r.range(-2, 6),
      })
    }
    this.dust(x, y, splinter ? 4 : 7, material === 'ice' ? '225,240,250' : material === 'straw' ? '232,210,140' : '210,200,180')
    if (material === 'ice' || material === 'glass') this.#glints(x, y, 8)
  }

  /** Nuage de poussière (disques flous qui gonflent). `color` : 'r,g,b' (ancien format accepté). */
  dust(x, y, amount = 6, color = '210,200,180') {
    const rgb = String(color).replace(/^rgba?\(/, '').replace(/,\s*$/, '').split(',').slice(0, 3).join(',')
    const r = this.#rng
    for (let i = 0; i < this.#n(amount); i++) {
      this.#spawn({
        kind: 'smoke', x: x + r.range(-14, 14), y: y + r.range(-8, 8), vx: r.range(-1, 1), vy: r.range(-1, -0.15),
        max: r.range(800, 1500), size: r.range(14, 26), grow: r.range(0.3, 0.6), rgb, opacity: 0.5,
      })
    }
  }

  /**
   * Choc sur un bloc (sans destruction) : étincelles sur la pierre et le fer,
   * copeaux sur le bois, et une bouffée de poussière, le tout selon la violence du choc.
   */
  impact(x, y, material, energy) {
    const r = this.#rng
    const k = Math.min(1, energy / 900)
    if (SPARKY.has(material)) {
      for (let i = 0; i < this.#n(4 + 10 * k); i++) {
        const a = r.range(0, TAU)
        const sp = r.range(3, 8 + 6 * k)
        this.#spawn({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, max: r.range(220, 480), size: r.range(1.5, 3), color: r.pick(['#fff1c4', '#ffd36b', '#ffb347']) })
      }
    }
    const palette = COLORS[material] || COLORS.stone
    for (let i = 0; i < this.#n(2 + 5 * k); i++) {
      const s = r.range(2.5, 6)
      this.#spawn({
        kind: SPLINTERS.has(material) ? 'shard' : 'chunk', x, y, vx: r.range(-3, 3), vy: r.range(-5, -1), max: r.range(700, 1200),
        size: s, len: s * 2, color: r.pick(palette), rot: r.range(0, TAU), vr: r.range(-0.4, 0.4), floor: WORLD.GROUND_Y + r.range(-2, 6),
      })
    }
    this.dust(x, y, 2 + 3 * k)
  }

  /** Projectile qui frappe le sol : gerbe de terre et poussière. */
  groundHit(x, energy) {
    const r = this.#rng
    const k = Math.min(1, energy / 900)
    const y = WORLD.GROUND_Y
    for (let i = 0; i < this.#n(6 + 10 * k); i++) {
      const s = r.range(3, 7)
      this.#spawn({
        kind: 'chunk', x: x + r.range(-10, 10), y: y - 2, vx: r.range(-3.5, 3.5), vy: r.range(-7, -2) * (0.6 + k), max: r.range(700, 1200),
        size: s, len: s, color: r.pick(COLORS.dirt), rot: r.range(0, TAU), vr: r.range(-0.4, 0.4), floor: y + r.range(0, 8),
      })
    }
    this.dust(x, y - 6, 4 + 6 * k, '160,130,95')
  }

  /**
   * Explosion : éclair, boule de feu qui gonfle, onde de choc, braises,
   * colonne de fumée et trace de suie si c'est au sol.
   */
  explosion(x, y, radius) {
    const r = this.#rng
    this.#spawn({ kind: 'flash', x, y, vx: 0, vy: 0, max: 220, size: radius * 1.6, rgb: '255,241,196' })
    this.#spawn({ kind: 'ring', x, y, vx: 0, vy: 0, max: 420, size: radius * 1.5 })
    for (let i = 0; i < this.#n(10); i++) {
      this.#spawn({
        kind: 'fireball', x: x + r.range(-radius / 4, radius / 4), y: y + r.range(-radius / 4, radius / 4),
        vx: r.range(-1.2, 1.2), vy: r.range(-1.8, -0.2), max: r.range(380, 650), size: r.range(radius * 0.25, radius * 0.5),
      })
    }
    for (let i = 0; i < this.#n(30); i++) {
      const a = r.range(0, TAU)
      const sp = r.range(3, 11)
      this.#spawn({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2.5, max: r.range(350, 750), size: r.range(1.8, 3.5), color: r.pick(['#ffd36b', '#ff8c3a', '#fff1c4']) })
    }
    for (let i = 0; i < this.#n(12); i++) {
      this.#spawn({ kind: 'ember', x: x + r.range(-radius / 3, radius / 3), y: y + r.range(-radius / 3, radius / 3), vx: r.range(-1.5, 1.5), vy: r.range(-3, -0.8), max: r.range(900, 1700), size: r.range(1.5, 2.8), color: r.pick(['#ff8c3a', '#ffd36b']) })
    }
    for (let i = 0; i < this.#n(16); i++) {
      this.#spawn({
        kind: 'smoke', x: x + r.range(-radius / 3, radius / 3), y: y + r.range(-radius / 4, radius / 4), vx: r.range(-1, 1), vy: r.range(-1.8, -0.5),
        max: r.range(1400, 2400), size: r.range(radius * 0.3, radius * 0.55), grow: r.range(0.5, 0.9), rgb: '58,52,58', opacity: 0.6, delay: r.range(60, 220),
      })
    }
    if (y > WORLD.GROUND_Y - radius) {
      const lobes = Array.from({ length: 7 }, () => ({ dx: r.range(-radius * 0.6, radius * 0.6), dy: r.range(-3, 3), r: r.range(radius * 0.18, radius * 0.35) }))
      this.#spawn({ kind: 'stain', x, y: WORLD.GROUND_Y - 1, vx: 0, vy: 0, max: 6000, size: 1, color: '#1d1610', lobes, opacity: 0.55 })
    }
  }

  /** Onde de choc seule (gros effondrement). */
  shockwave(x, y, size = 160) {
    this.#spawn({ kind: 'ring', x, y, vx: 0, vy: 0, max: 380, size })
  }

  /** Flammes au-dessus d'une entité en feu (appelé à chaque image). */
  flame(x, y, w) {
    const r = this.#rng
    if (r.next() > 0.6 * this.density) return
    this.#spawn({ kind: 'flame', x: x + r.range(-w / 2, w / 2), y, vx: r.range(-0.3, 0.3), vy: r.range(-1.8, -0.9), max: r.range(380, 720), size: r.range(7, 14) })
    if (r.next() < 0.18) this.#spawn({ kind: 'smoke', x: x + r.range(-w / 3, w / 3), y: y - 10, vx: r.range(-0.3, 0.3), vy: r.range(-1.1, -0.6), max: r.range(900, 1500), size: r.range(8, 14), grow: 0.5, rgb: '70,62,60', opacity: 0.4 })
    if (r.next() < 0.12) this.#spawn({ kind: 'ember', x: x + r.range(-w / 2, w / 2), y, vx: r.range(-0.6, 0.6), vy: r.range(-2.4, -1.2), max: r.range(700, 1200), size: r.range(1.4, 2.4), color: '#ffb347' })
  }

  /**
   * Traînée du projectile en vol. `style` vient de l'apparence choisie à l'atelier :
   * smoke (fumée), embers (braises), stars (étincelles dorées).
   */
  trail(x, y, burning, style = 'smoke') {
    if (this.#rng.next() > 0.75 * this.density) return
    const r = this.#rng
    if (burning) {
      this.#spawn({ kind: 'flame', x, y, vx: 0, vy: -0.3, max: 320, size: 10 })
      if (r.next() < 0.4) this.#spawn({ kind: 'smoke', x, y, vx: 0, vy: -0.4, max: 900, size: 8, grow: 0.4, rgb: '70,62,60', opacity: 0.35 })
    } else if (style === 'embers') {
      this.#spawn({ kind: 'ember', x, y, vx: r.range(-0.4, 0.4), vy: r.range(-0.6, 0), max: 480, size: r.range(1.6, 3), color: r.pick(['#ff8c3a', '#ffd36b', '#ff5a2a']) })
    } else if (style === 'pumpkin') {
      // Événement d'automne : étincelles orangées et petites ombres de chauves-souris.
      this.#spawn({ kind: 'ember', x, y, vx: r.range(-0.5, 0.5), vy: r.range(-0.7, 0), max: 480, size: r.range(2, 3.2), color: r.pick(['#ff7a1a', '#ffb347', '#3a2140']) })
    } else if (style === 'snow') {
      // Événement d'hiver : flocons qui tombent doucement.
      this.#spawn({ kind: 'dot', x: x + r.range(-5, 5), y: y + r.range(-5, 5), vx: r.range(-0.2, 0.2), vy: r.range(0.1, 0.4), max: 700, size: r.range(2, 3.5), color: r.pick(['#ffffff', '#e6f3ff', '#cfe6ff']) })
    } else if (style === 'stars') {
      this.#spawn({ kind: 'ember', x: x + r.range(-4, 4), y: y + r.range(-4, 4), vx: 0, vy: 0, max: 560, size: r.range(1.8, 3.2), color: r.pick(['#fff1c4', '#d4a537', '#ffffff']) })
    } else {
      this.#spawn({ kind: 'smoke', x, y, vx: 0, vy: -0.15, max: 650, size: 6, grow: 0.35, rgb: '235,230,220', opacity: 0.45 })
    }
  }

  /**
   * Mort d'une cible : gerbe de gouttes de sang projetées dans le sens du choc,
   * puis une tache au sol qui s'étale brièvement et s'efface en quelques secondes.
   */
  blood(x, y, _groundY = WORLD.GROUND_Y, dir = 0) {
    const r = this.#rng
    // Gerbe de gouttes : elles volent, retombent et tachent là où elles touchent
    // (le sol, ou un mur sur leur trajet). Aucune flaque n'est posée d'avance.
    for (let i = 0; i < this.#n(28); i++) {
      const a = -Math.PI / 2 + r.range(-1.25, 1.25) + dir * 0.55
      const sp = r.range(1.5, 7.5)
      this.#spawn({
        kind: 'drop', x: x + r.range(-5, 5), y: y + r.range(-16, 6),
        vx: Math.cos(a) * sp + dir * r.range(0.5, 2.2), vy: Math.sin(a) * sp, max: 2600,
        size: r.range(0.9, 3.2), color: r.pick(['#8e1414', '#a51c1c', '#6d0d0d', '#7d1010']), splat: true,
      })
    }
    // Fine brume rouge, très brève.
    for (let i = 0; i < this.#n(6); i++) {
      this.#spawn({
        kind: 'smoke', x: x + r.range(-6, 6), y: y + r.range(-14, 4), vx: r.range(-0.6, 0.6) + dir * 0.6, vy: r.range(-0.7, 0.1),
        max: r.range(300, 520), size: r.range(7, 13), grow: 0.45, rgb: '150,18,18', opacity: 0.32,
      })
    }
  }

  /** Une goutte touche une surface : petite tache, et parfois quelques éclaboussures. */
  #splat(p, onGround) {
    const r = this.#rng
    p.life = p.max
    const s = p.size
    if (onGround) {
      const lobes = [{ dx: 0, dy: 0, r: s * r.range(1.6, 2.6) }]
      if (s > 1.8) lobes.push({ dx: r.range(-1, 1) * s * 2.2, dy: r.range(-0.4, 0.4), r: s * r.range(0.6, 1.1) })
      this.#spawn({ kind: 'stain', x: p.x, y: WORLD.GROUND_Y - 1, vx: 0, vy: 0, max: 6000, size: 1, color: '#6d0d0d', lobes, opacity: 0.82 })
    } else {
      this.#spawn({ kind: 'dot', x: p.x, y: p.y, vx: 0, vy: 0, max: 1800, size: s * 0.9, color: '#6d0d0d' })
    }
    if (s > 2 && r.chance(0.6)) {
      for (let i = 0; i < 2; i++) {
        this.#spawn({ kind: 'drop', x: p.x, y: p.y - 1, vx: r.range(-1.6, 1.6), vy: r.range(-2.2, -0.8), max: 500, size: s * 0.35, color: p.color })
      }
    }
  }

  /** Victoire : pluie de confettis au-dessus du château, et quelques éclats dorés. */
  confetti(x, y, width = 500) {
    const r = this.#rng
    for (let i = 0; i < this.#n(70); i++) {
      this.#spawn({
        kind: 'confetti', x: x + r.range(-width / 2, width / 2), y: y + r.range(-120, 40), vx: r.range(-1.5, 1.5), vy: r.range(-5, -1),
        max: r.range(2200, 3400), size: r.range(5, 9), color: r.pick(CONFETTI), rot: r.range(0, TAU), vr: r.range(-0.25, 0.25), phase: r.range(0, TAU),
      })
    }
    this.#glints(x, y, 14)
  }

  /** Petites étoiles brillantes (glace, verre, victoire). */
  #glints(x, y, n) {
    const r = this.#rng
    for (let i = 0; i < this.#n(n); i++) {
      this.#spawn({ kind: 'glint', x: x + r.range(-40, 40), y: y + r.range(-40, 20), vx: r.range(-0.6, 0.6), vy: r.range(-1.2, -0.2), max: r.range(500, 900), size: r.range(4, 8) })
    }
  }

  /** Texte flottant (points gagnés) : apparaît en grossissant, puis monte et s'efface. */
  text(x, y, text, color = '#f6d98a') {
    this.#spawn({ kind: 'text', x, y, vx: 0, vy: -0.9, max: 1200, size: 28, color, text: String(text) })
  }

  clear() {
    this.#items.length = 0
  }

  /* ---------- Simulation ---------- */

  update(dtMs) {
    const k = dtMs / 16.67
    const drift = this.wind * 0.9
    for (const p of this.#items) {
      p.life += dtMs
      if (p.delay && p.life < p.delay) continue
      p.x += p.vx * k
      if (p.kind === 'smoke' || p.kind === 'flame' || p.kind === 'ember') p.x += drift * k * Math.min(1, p.life / 300)
      p.y += p.vy * k
      switch (p.kind) {
        case 'chunk':
        case 'shard':
          p.vy += 0.3 * k
          p.rot += p.vr * k
          // Rebond amorti sur le sol, puis glissade qui s'arrête.
          if (p.y > p.floor) {
            p.y = p.floor
            p.vy = Math.abs(p.vy) > 1.2 ? -p.vy * 0.35 : 0
            p.vx *= 0.6
            p.vr *= 0.5
          }
          break
        case 'spark':
          p.vy += 0.32 * k
          p.vx *= 0.98
          break
        case 'ember':
          p.vy += 0.03 * k
          p.vx += Math.sin((p.life + p.x) / 120) * 0.03 * k
          break
        case 'drop':
          p.vy += 0.28 * k
          p.vx *= 0.995
          if (p.y >= WORLD.GROUND_Y - 1) {
            p.y = WORLD.GROUND_Y - 1
            if (p.splat) this.#splat(p, true)
            else p.life = p.max
          } else if (p.splat && p.life > 70 && p.vy > 0 && this.surfaceAt && this.surfaceAt(p.x, p.y)) {
            this.#splat(p, false)
          }
          break
        case 'confetti':
          // Chute lente et oscillante, comme du papier.
          p.vy = Math.min(p.vy + 0.12 * k, 1.6)
          p.vx += Math.sin(p.life / 180 + p.phase) * 0.06 * k
          p.vx *= 0.97
          p.rot += p.vr * k
          break
        case 'smoke':
          p.size += (p.grow ?? 0.25) * k
          p.vy *= 0.995
          break
        case 'fireball':
          p.size += 0.9 * k
          p.vy -= 0.02 * k
          break
      }
    }
    this.#items = this.#items.filter((p) => p.life < p.max)
  }

  /* ---------- Rendu ---------- */

  /** @param {CanvasRenderingContext2D} ctx contexte en coordonnées monde */
  draw(ctx, pixel = 1) {
    // 1) Traces au sol, 2) matière (éclats, fumée), 3) lumière en mélange additif, 4) textes.
    ctx.save()
    for (const p of this.#items) if (p.kind === 'stain') this.#drawStain(ctx, p)
    for (const p of this.#items) {
      if (p.delay && p.life < p.delay) continue
      const t = (p.life - (p.delay || 0)) / (p.max - (p.delay || 0))
      switch (p.kind) {
        case 'smoke': {
          // Apparition rapide, disparition lente.
          const a = (t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88) * (p.opacity ?? 0.45)
          ctx.globalAlpha = Math.max(0, a)
          const s = p.size * 2
          ctx.drawImage(soft(p.rgb || '230,225,215'), p.x - s / 2, p.y - s / 2, s, s)
          break
        }
        case 'chunk':
        case 'shard': {
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
          ctx.lineWidth = pixel
          ctx.strokeRect(-w / 2, -h / 2, w, h)
          ctx.restore()
          break
        }
        case 'drop': {
          // Goutte étirée dans le sens de sa course.
          ctx.globalAlpha = p.splat ? 1 : Math.min(1, (1 - t) * 1.8)
          ctx.strokeStyle = p.color
          ctx.lineCap = 'round'
          ctx.lineWidth = p.size * 1.5
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(p.x - p.vx * 1.1, p.y - p.vy * 1.1)
          ctx.stroke()
          break
        }
        case 'dot':
          ctx.globalAlpha = 1 - t
          ctx.fillStyle = p.color
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size, 0, TAU)
          ctx.fill()
          break
        case 'confetti': {
          ctx.globalAlpha = t > 0.8 ? (1 - t) / 0.2 : 1
          ctx.save()
          ctx.translate(p.x, p.y)
          ctx.rotate(p.rot)
          // Le papier tourne sur lui-même : sa largeur apparente oscille.
          ctx.scale(Math.cos(p.life / 120 + p.phase), 1)
          ctx.fillStyle = p.color
          ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6)
          ctx.restore()
          break
        }
        case 'ring': {
          const e = 1 - Math.pow(1 - t, 3)
          ctx.globalAlpha = (1 - t) * 0.7
          ctx.strokeStyle = '#fff6dc'
          ctx.lineWidth = (10 * (1 - t) + 1) * Math.max(1, pixel)
          ctx.beginPath()
          ctx.ellipse(p.x, p.y, p.size * e, p.size * e * 0.55, 0, 0, TAU)
          ctx.stroke()
          break
        }
      }
    }
    // Lumière : feu, étincelles, éclairs (mélange additif, ça brille).
    ctx.globalCompositeOperation = 'lighter'
    for (const p of this.#items) {
      if (p.delay && p.life < p.delay) continue
      const t = p.life / p.max
      switch (p.kind) {
        case 'flame': {
          ctx.globalAlpha = (1 - t) * 0.85
          const s = p.size * 2 * (1 - t * 0.5)
          ctx.drawImage(soft(t < 0.35 ? '255,214,120' : '255,120,40'), p.x - s / 2, p.y - s / 2, s, s)
          break
        }
        case 'fireball': {
          ctx.globalAlpha = (1 - t) * 0.9
          const s = p.size * 2
          ctx.drawImage(soft(t < 0.3 ? '255,236,170' : t < 0.6 ? '255,150,50' : '170,60,30'), p.x - s / 2, p.y - s / 2, s, s)
          break
        }
        case 'flash': {
          ctx.globalAlpha = (1 - t) * 0.9
          const s = p.size * 2 * (0.7 + t * 0.6)
          ctx.drawImage(soft(p.rgb), p.x - s / 2, p.y - s / 2, s, s)
          break
        }
        case 'spark': {
          // Trait orienté selon la vitesse : l'œil lit une étincelle rapide.
          ctx.globalAlpha = 1 - t
          ctx.strokeStyle = p.color
          ctx.lineWidth = p.size * (1 - t * 0.5)
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
          ctx.lineTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2)
          ctx.stroke()
          break
        }
        case 'ember': {
          ctx.globalAlpha = (1 - t) * (0.6 + 0.4 * Math.sin(p.life / 40 + p.x))
          const s = p.size * 5
          ctx.drawImage(soft('255,170,70'), p.x - s / 2, p.y - s / 2, s, s)
          break
        }
        case 'bolt': {
          ctx.globalAlpha = t < 0.15 ? 1 : (1 - t) * (0.6 + 0.4 * Math.sin(p.life / 18))
          for (const [wdt, col] of [[9, 'rgba(150,190,255,0.5)'], [3.2, '#ffffff']]) {
            ctx.strokeStyle = col
            ctx.lineWidth = wdt * Math.max(1, pixel)
            ctx.lineJoin = 'round'
            ctx.beginPath()
            p.pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)))
            ctx.stroke()
          }
          break
        }
        case 'glint': {
          ctx.globalAlpha = Math.sin(t * Math.PI)
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1.6 * Math.max(1, pixel)
          const s = p.size
          ctx.beginPath()
          ctx.moveTo(p.x - s, p.y)
          ctx.lineTo(p.x + s, p.y)
          ctx.moveTo(p.x, p.y - s)
          ctx.lineTo(p.x, p.y + s)
          ctx.stroke()
          break
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over'
    for (const p of this.#items) {
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

  /* ---------- Terrains, givre et vapeur (v5.0) ---------- */

  /** Gerbe d'eau : ricochet (petite) ou boulet qui sombre (grande). */
  splash(x, big = false) {
    const r = this.#rng
    const y = WORLD.GROUND_Y - 2
    for (let i = 0; i < this.#n(big ? 26 : 14); i++) {
      this.#spawn({ kind: 'drop', x: x + r.range(-10, 10), y, vx: r.range(-2.6, 2.6), vy: r.range(-7.5, -2.5) * (big ? 1.1 : 0.8), max: r.range(500, 900), size: r.range(1.4, 2.6), color: r.pick(['#d9eefc', '#9fc9e6', '#ffffff']) })
    }
    this.#spawn({ kind: 'ring', x, y, vx: 0, vy: 0, max: 520, size: big ? 70 : 42 })
    if (big) this.dust(x, y - 10, 4, '230,242,250')
  }

  /** Vapeur et eau bouillante : nuage blanc qui monte, gouttelettes brûlantes. */
  steam(x, y, radius = 80) {
    const r = this.#rng
    for (let i = 0; i < this.#n(Math.min(22, 8 + radius / 8)); i++) {
      this.#spawn({
        kind: 'smoke', x: x + r.range(-radius / 2, radius / 2), y: y + r.range(-radius / 3, radius / 4), vx: r.range(-0.8, 0.8), vy: r.range(-2.4, -0.8),
        max: r.range(900, 1700), size: r.range(16, 30), grow: r.range(0.5, 0.9), rgb: '246,250,255', opacity: 0.62,
      })
    }
    for (let i = 0; i < this.#n(12); i++) {
      this.#spawn({ kind: 'drop', x, y, vx: r.range(-3.2, 3.2), vy: r.range(-5, -1.5), max: r.range(400, 700), size: r.range(1.2, 2), color: r.pick(['#e8f6ff', '#bfe3f7']) })
    }
  }

  /** Givre : éclat bleuté, cristaux qui scintillent, brume froide au sol. */
  frost(x, y, radius = 120) {
    const r = this.#rng
    this.#spawn({ kind: 'flash', x, y, vx: 0, vy: 0, max: 260, size: radius * 1.1, rgb: '190,230,255' })
    this.#spawn({ kind: 'ring', x, y, vx: 0, vy: 0, max: 460, size: radius })
    for (let i = 0; i < this.#n(18); i++) {
      const a = r.range(0, TAU)
      const sp = r.range(1.5, 5)
      this.#spawn({ kind: 'shard', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, max: r.range(600, 1100), size: r.range(3, 6), len: r.range(6, 12), color: r.pick(['#e6f6ff', '#bfe3f7', '#9fd0f0']), rot: r.range(0, TAU), vr: r.range(-0.3, 0.3), floor: WORLD.GROUND_Y + r.range(-2, 4) })
    }
    this.#glints(x, y, 10)
    this.dust(x, y, 6, '225,240,250')
  }

  /** Lave : le projectile fond (gerbe de braises, fumée noire). */
  melt(x) {
    const r = this.#rng
    const y = WORLD.GROUND_Y - 4
    this.#spawn({ kind: 'flash', x, y, vx: 0, vy: 0, max: 240, size: 70, rgb: '255,150,60' })
    for (let i = 0; i < this.#n(16); i++) {
      this.#spawn({ kind: 'ember', x: x + r.range(-12, 12), y, vx: r.range(-2.4, 2.4), vy: r.range(-6, -2), max: r.range(500, 1000), size: r.range(1.8, 3.2), color: r.pick(['#ff8c3a', '#ffd36b', '#ff5a2a']) })
    }
    for (let i = 0; i < this.#n(5); i++) {
      this.#spawn({ kind: 'smoke', x: x + r.range(-14, 14), y: y - 10, vx: r.range(-0.5, 0.5), vy: r.range(-1.6, -0.7), max: r.range(1000, 1700), size: r.range(12, 20), grow: 0.6, rgb: '50,40,38', opacity: 0.5 })
    }
  }

  /** Plumes (corbeau) ou écailles (vouivre) qui retombent en tournoyant. */
  feathers(x, y, color = '#20202a', amount = 12) {
    const r = this.#rng
    for (let i = 0; i < this.#n(amount); i++) {
      this.#spawn({ kind: 'confetti', x: x + r.range(-14, 14), y: y + r.range(-10, 10), vx: r.range(-2.5, 2.5), vy: r.range(-3, 0), max: r.range(1400, 2200), size: r.range(7, 12), color, rot: r.range(0, TAU), vr: r.range(-0.15, 0.15), phase: r.range(0, TAU) })
    }
  }

  /** Éclair (pouvoir Foudre) : tracé brisé du ciel jusqu'au point frappé. */
  lightning(x, y, top = -400) {
    const r = this.#rng
    const pts = [{ x: x + r.range(-60, 60), y: top }]
    const n = 9
    for (let i = 1; i < n; i++) pts.push({ x: x + r.range(-34, 34) * (1 - i / n), y: top + ((y - top) * i) / n })
    pts.push({ x, y })
    this.#spawn({ kind: 'bolt', x, y, vx: 0, vy: 0, max: 360, size: 1, pts })
    this.#spawn({ kind: 'flash', x, y, vx: 0, vy: 0, max: 300, size: 160, rgb: '220,235,255' })
  }

  /** Tache au sol (sang, suie) : s'étale vite, s'efface sur le dernier tiers. */
  #drawStain(ctx, p) {
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
}
