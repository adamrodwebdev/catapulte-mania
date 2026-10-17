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

/** Couleur des chiffres de dégâts selon leur cause (v6.1). */
const DAMAGE_COLORS = Object.freeze({ crush: '#ff7a66', fall: '#ffb08a', knockout: '#ffb08a', explosion: '#ff9c4a', fire: '#ffc14d', impact: '#ff7a66', poison: '#8fe26a', shock: '#9fdcff', scald: '#e8f4ff', sting: '#ffd54a' })

/** Éclats et échardes : pesanteur, rotation, rebond amorti sur le sol, puis glissade qui s'arrête. */
function tumble(p, k) {
  p.vy += 0.3 * k
  p.rot += p.vr * k
  if (p.y > p.floor) {
    p.y = p.floor
    p.vy = Math.abs(p.vy) > 1.2 ? -p.vy * 0.35 : 0
    p.vx *= 0.6
    p.vr *= 0.5
  }
}

/**
 * Mouvement propre à chaque sorte (v6.2, table), après la vitesse : pesanteur,
 * rebonds, flottement, croissance. `sys` : tacher une surface, laisser un sillage.
 */
const MOTION = new Map([
  [
    'knockout',
    (p, k) => {
      p.vy += 0.24 * k
      p.rot += p.spin * k
    },
  ],
  ['chunk', tumble],
  ['shard', tumble],
  [
    'spark',
    (p, k) => {
      p.vy += 0.32 * k
      p.vx *= 0.98
    },
  ],
  [
    'ember',
    (p, k) => {
      p.vy += 0.03 * k
      p.vx += Math.sin((p.life + p.x) / 120) * 0.03 * k
    },
  ],
  [
    'drop',
    (p, k, sys) => {
      p.vy += 0.28 * k
      p.vx *= 0.995
      if (p.y >= WORLD.GROUND_Y - 1) {
        p.y = WORLD.GROUND_Y - 1
        if (p.splat) sys.splat(p, true)
        else p.life = p.max
      } else if (p.splat && p.life > 70 && p.vy > 0 && sys.surfaceAt && sys.surfaceAt(p.x, p.y)) {
        sys.splat(p, false)
      }
    },
  ],
  [
    'confetti',
    (p, k) => {
      // Chute lente et oscillante, comme du papier.
      p.vy = Math.min(p.vy + 0.12 * k, 1.6)
      p.vx += Math.sin(p.life / 180 + p.phase) * 0.06 * k
      p.vx *= 0.97
      p.rot += p.vr * k
    },
  ],
  [
    'smoke',
    (p, k) => {
      p.size += (p.grow ?? 0.25) * k
      p.vy *= 0.995
    },
  ],
  [
    'fireball',
    (p, k) => {
      p.size += 0.9 * k
      p.vy -= 0.02 * k
    },
  ],
  [
    'shell',
    (p, k, sys) => {
      // Parabole fixe (indépendante du vent) : départ, sommet, arrivée sur l'engin.
      const t = Math.min(1, p.life / p.max)
      p.x = p.x0 + (p.x1 - p.x0) * t
      p.y = p.y0 + (p.y1 - p.y0) * t - p.apex * 4 * t * (1 - t)
      p.rot += 0.18 * k
      if (p.life - p.trailAt > 45 && t < 0.97) {
        p.trailAt = p.life
        sys.trails.push(p)
      }
    },
  ],
])

/**
 * Système de particules purement visuel (éclats, échardes, fumée, feu,
 * étincelles, ondes de choc, confettis, scores flottants).
 *
 * v4.2 : rendu « moderne » : fumée et poussière en disques flous qui
 * gonflent, feu et étincelles en mélange additif (ils brillent), éclats qui
 * rebondissent sur le sol, boule de feu + onde de choc + suie au sol pour les
 * explosions, étincelles sur la pierre et le fer, confettis à la victoire.
 * Les particules sont plafonnées (les plus anciennes cèdent la place).
 *
 * v6.2 : ce module simule (émetteurs, mouvement, durée de vie) ; le dessin est
 * celui du ParticlePainter, qui lit les particules vivantes (`items`).
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

  /**
   * Particules vivantes, pour le dessin (v6.2, voir ParticlePainter.js) : à lire
   * seulement, jamais à modifier.
   * @returns {ReadonlyArray<object>}
   */
  get items() {
    return this.#items
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

  /**
   * Flammes au-dessus d'une entité en feu (appelé à chaque image).
   * `scale` : taille des flammes (l'engin du joueur en feu, v5.8, brûle plus gros).
   */
  flame(x, y, w, scale = 1) {
    const r = this.#rng
    if (r.next() > 0.6 * this.density) return
    this.#spawn({ kind: 'flame', x: x + r.range(-w / 2, w / 2), y, vx: r.range(-0.3, 0.3), vy: r.range(-1.8, -0.9) * Math.sqrt(scale), max: r.range(380, 720), size: r.range(7, 14) * scale })
    if (r.next() < 0.18 * scale) this.#spawn({ kind: 'smoke', x: x + r.range(-w / 3, w / 3), y: y - 10 * scale, vx: r.range(-0.3, 0.3), vy: r.range(-1.1, -0.6), max: r.range(900, 1500), size: r.range(8, 14) * scale, grow: 0.5, rgb: '70,62,60', opacity: 0.4 })
    if (r.next() < 0.12) this.#spawn({ kind: 'ember', x: x + r.range(-w / 2, w / 2), y, vx: r.range(-0.6, 0.6), vy: r.range(-2.4, -1.2), max: r.range(700, 1200), size: r.range(1.4, 2.4), color: '#ffb347' })
  }

  /** Escarbille d'une torche (v5.8) : une petite braise qui monte et s'éteint. */
  spark(x, y) {
    const r = this.#rng
    if (r.next() > this.density) return
    this.#spawn({ kind: 'ember', x: x + r.range(-2, 2), y, vx: r.range(-0.3, 0.3), vy: r.range(-1.3, -0.6), max: r.range(500, 900), size: r.range(0.9, 1.6), color: '#ffb347' })
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
    } else if (style === 'comet') {
      // Maîtrise du royaume (v6.2) : une comète d'or (halo doré) et des étincelles nettes qui fusent.
      this.#spawn({ kind: 'ember', x, y, vx: 0, vy: 0, max: 1000, size: r.range(5.5, 8), glow: '255,206,80' })
      for (let i = 0; i < 2; i++) this.#spawn({ kind: 'dot', x: x + r.range(-4, 4), y: y + r.range(-4, 4), vx: r.range(-1.3, 1.3), vy: r.range(-1.3, 0.9), max: 650, size: r.range(1.8, 3), color: r.pick(['#ffffff', '#fff1b0', '#ffd24d', '#f2a91c']) })
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

  /** Éclat doré d'un tir restant changé en points (v6.0) : étincelles et étoiles. */
  burst(x, y, n = 10) {
    const r = this.#rng
    for (let i = 0; i < this.#n(n); i++) {
      const a = r.range(0, TAU)
      const v = r.range(1.2, 3.2)
      this.#spawn({ kind: 'ember', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, max: r.range(400, 700), size: r.range(1.4, 2.6), color: r.pick(['#ffe08a', '#ffd04d', '#fff6d8']) })
    }
    this.#glints(x, y, 5)
  }

  /**
   * Défenseur assommé (v6.0) : son dessin continue la chute qui l'a emporté.
   * Il bondit, tourne sur lui-même en se débattant, puis s'efface ; en
   * mouvement réduit (`still`), il s'efface seulement. Dessiné par le
   * ParticlePainter avec le dessin des personnages : rien ne change à la simulation.
   */
  knockout(x, y, { key, w, h, angle = 0, vx = 0, extra = {}, still = false }) {
    const r = this.#rng
    const dir = vx ? Math.sign(vx) : r.chance(0.5) ? 1 : -1
    this.#spawn({
      kind: 'knockout', key, w, h, extra, still, x, y, rot: angle,
      vx: still ? 0 : dir * r.range(0.8, 1.8) + vx * 0.3, vy: still ? 0 : r.range(-4.2, -3), spin: still ? 0 : dir * r.range(0.09, 0.15),
      max: still ? 600 : 950,
    })
  }

  /**
   * Bulle de parole (v6.0) au-dessus d'un personnage : une courte réplique,
   * lisible à toutes les échelles. Deux au plus à la fois (la plus ancienne s'efface).
   */
  bubble(x, y, text, { tone = 'ally' } = {}) {
    const bubbles = this.#items.filter((q) => q.kind === 'bubble')
    if (bubbles.length >= 2) this.#items = this.#items.filter((q) => q !== bubbles[0])
    this.#spawn({ kind: 'bubble', x, y, vx: 0, vy: 0, max: 1900, text: String(text), tone })
  }

  /** Petites étoiles brillantes (glace, verre, victoire). */
  #glints(x, y, n) {
    const r = this.#rng
    for (let i = 0; i < this.#n(n); i++) {
      this.#spawn({ kind: 'glint', x: x + r.range(-40, 40), y: y + r.range(-40, 20), vx: r.range(-0.6, 0.6), vy: r.range(-1.2, -0.2), max: r.range(500, 900), size: r.range(4, 8) })
    }
  }

  /** Texte flottant (points gagnés) : apparaît en grossissant, puis monte et s'efface. */
  text(x, y, text, color = '#f6d98a', { size = 28, vx = 0, max = 1200 } = {}) {
    this.#spawn({ kind: 'text', x, y, vx, vy: -0.9, max, size, color, text: String(text) })
  }

  /**
   * Dégâts encaissés par un défenseur (v6.1) : « −12 », de la couleur de la
   * cause (choc, feu, givre, orage, poison), plus gros quand le coup est rude,
   * légèrement de biais pour que deux chiffres ne se recouvrent pas.
   * @param {number} share part de ses points de vie que ce coup lui a coûté
   */
  damage(x, y, amount, cause = 'crush', share = 0.3) {
    const color = DAMAGE_COLORS[cause] ?? DAMAGE_COLORS.crush
    const size = Math.round(18 + Math.min(1, share) * 16)
    this.text(x, y, `−${Math.max(1, Math.round(amount))}`, color, { size, vx: this.#rng.range(-0.5, 0.5), max: 900 })
  }

  /**
   * Annonce d'enchaînement (« Doublé ! ») : grand titre doré qui claque en
   * grossissant, puis monte et s'efface. `tier` 1..3 : de plus en plus grand.
   * Une seule à la fois : la nouvelle remplace la précédente.
   */
  callout(x, y, text, tier = 1) {
    this.#items = this.#items.filter((p) => p.kind !== 'callout')
    this.#spawn({ kind: 'callout', x, y, y0: y, vx: 0, vy: -0.35, max: 1500, size: 44 + tier * 10, tier, text: String(text) })
    this.#glints(x, y, 6 + tier * 3)
  }

  clear() {
    this.#items.length = 0
  }

  /**
   * Tir d'un général (v6.0) : un projectile décoratif qui part du donjon et
   * retombe sur l'engin en `ms` (l'effet, lui, est appliqué par la partie au
   * pas prévu). `sub` : 'bomb' | 'firepot' | 'boulder' | 'arrows' | 'frost'.
   */
  shell(x0, y0, x1, y1, ms, sub = 'bomb') {
    const apex = Math.max(140, Math.min(420, Math.abs(x1 - x0) * 0.32))
    this.#spawn({ kind: 'shell', sub, x: x0, y: y0, x0, y0, x1, y1, apex, vx: 0, vy: 0, life: 0, max: Math.max(200, ms), rot: 0, trailAt: 0 })
  }

  /* ---------- Simulation ---------- */

  update(dtMs) {
    const k = dtMs / 16.67
    const drift = this.wind * 0.9
    const trails = []
    // Ce que certaines sortes demandent au système : tacher une surface, laisser un sillage.
    const sys = { splat: (p, onGround) => this.#splat(p, onGround), surfaceAt: this.surfaceAt, trails }
    for (const p of this.#items) {
      p.life += dtMs
      if (p.delay && p.life < p.delay) continue
      p.x += p.vx * k
      if (p.kind === 'smoke' || p.kind === 'flame' || p.kind === 'ember') p.x += drift * k * Math.min(1, p.life / 300)
      p.y += p.vy * k
      MOTION.get(p.kind)?.(p, k, sys)
    }
    // Sillage des tirs des généraux (ajouté après le parcours).
    for (const p of trails) {
      if (p.sub === 'firepot' || p.sub === 'arrows') this.#spawn({ kind: 'ember', x: p.x, y: p.y, vx: 0, vy: -0.4, size: 1.6, life: 0, max: 380 })
      else if (p.sub === 'frost') this.#spawn({ kind: 'smoke', x: p.x, y: p.y, vx: 0, vy: 0, size: 9, grow: 0.5, rgb: '206,236,255', opacity: 0.5, life: 0, max: 520 })
      else this.#spawn({ kind: 'smoke', x: p.x, y: p.y, vx: 0, vy: -0.1, size: 5, grow: 0.3, rgb: '120,112,104', opacity: 0.35, life: 0, max: 480 })
    }
    this.#items = this.#items.filter((p) => p.life < p.max)
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
  /**
   * Arc électrique (v6.1, orbe d'orage) : un zigzag bleu-blanc d'un point à
   * l'autre, bref, et un éclat à l'arrivée.
   */
  arc(x0, y0, x1, y1) {
    const r = this.#rng
    const len = Math.hypot(x1 - x0, y1 - y0)
    const n = Math.max(3, Math.min(9, Math.round(len / 22)))
    const nx = -(y1 - y0) / (len || 1)
    const ny = (x1 - x0) / (len || 1)
    const pts = [{ x: x0, y: y0 }]
    for (let i = 1; i < n; i++) {
      const k = i / n
      const off = r.range(-14, 14) * Math.sin(k * Math.PI)
      pts.push({ x: x0 + (x1 - x0) * k + nx * off, y: y0 + (y1 - y0) * k + ny * off })
    }
    pts.push({ x: x1, y: y1 })
    this.#spawn({ kind: 'bolt', x: x1, y: y1, vx: 0, vy: 0, max: 280, size: 0.7, pts })
    this.#spawn({ kind: 'flash', x: x1, y: y1, vx: 0, vy: 0, max: 200, size: 70, rgb: '200,230,255' })
    for (let i = 0; i < this.#n(5); i++) {
      const a = r.range(0, Math.PI * 2)
      this.#spawn({ kind: 'ember', x: x1, y: y1, vx: Math.cos(a) * r.range(1, 3), vy: Math.sin(a) * r.range(1, 3) - 0.5, max: r.range(200, 420), size: r.range(1.2, 2), color: r.pick(['#e8f6ff', '#9fdcff', '#ffffff']) })
    }
  }

  /** Nuage qui naît (v6.1) : le pot éclate, une bouffée de sa couleur jaillit. */
  puff(x, y, radius = 100, rgb = '120,200,70') {
    const r = this.#rng
    for (let i = 0; i < this.#n(10); i++) {
      const a = r.range(0, Math.PI * 2)
      const v = r.range(0.6, 2.2)
      this.#spawn({ kind: 'smoke', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.4, max: r.range(700, 1300), size: r.range(radius * 0.25, radius * 0.5), rgb, opacity: 0.55 })
    }
  }

  /**
   * Traînée de rafale (v6.1, moulin) : un trait clair qui file dans le sens du
   * souffle ; `rgb` prend la couleur de l'élément du monde (givre, braises…).
   */
  streak(x, y, dir, rgb = '245,248,255') {
    this.#spawn({ kind: 'streak', x, y, vx: dir * this.#rng.range(7, 10), vy: this.#rng.range(-0.3, 0.3), max: this.#rng.range(260, 420), size: this.#rng.range(26, 44), rgb })
  }

  /**
   * Citerne crevée (v6.1) : l'eau jaillit de la cuve, retombe en pluie et
   * tache le sol de flaques claires (ou de givre, en Hiver).
   */
  water(x, y, radius = 160, ice = false) {
    const r = this.#rng
    for (let i = 0; i < this.#n(44); i++) {
      const a = -Math.PI / 2 + r.range(-1.6, 1.6)
      const sp = r.range(1.5, 6.5)
      this.#spawn({
        kind: 'drop', x: x + r.range(-radius * 0.2, radius * 0.2), y: y + r.range(-10, 10),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, max: 2200,
        size: r.range(1.2, 3.4), color: ice ? r.pick(['#e8f6ff', '#bfe6ff', '#ffffff']) : r.pick(['#7fb6e6', '#5f9bd1', '#a8d0f2', '#4d86c0']), splat: true,
      })
    }
    for (let i = 0; i < this.#n(8); i++) {
      this.#spawn({ kind: 'smoke', x: x + r.range(-20, 20), y: y + r.range(-10, 10), vx: r.range(-0.8, 0.8), vy: r.range(-0.6, 0.2), max: r.range(400, 700), size: r.range(10, 18), grow: 0.5, rgb: ice ? '230,244,255' : '170,205,235', opacity: 0.4 })
    }
  }

  /** Bulles vertes qui montent (un défenseur empoisonné tousse). */
  cough(x, y) {
    const r = this.#rng
    for (let i = 0; i < this.#n(2); i++) {
      this.#spawn({ kind: 'smoke', x: x + r.range(-6, 6), y, vx: r.range(-0.3, 0.3), vy: r.range(-1.2, -0.6), max: r.range(450, 750), size: r.range(5, 9), rgb: '140,215,80', opacity: 0.6 })
    }
  }

  lightning(x, y, top = -400) {
    const r = this.#rng
    const pts = [{ x: x + r.range(-60, 60), y: top }]
    const n = 9
    for (let i = 1; i < n; i++) pts.push({ x: x + r.range(-34, 34) * (1 - i / n), y: top + ((y - top) * i) / n })
    pts.push({ x, y })
    this.#spawn({ kind: 'bolt', x, y, vx: 0, vy: 0, max: 360, size: 1, pts })
    this.#spawn({ kind: 'flash', x, y, vx: 0, vy: 0, max: 300, size: 160, rgb: '220,235,255' })
  }

}
