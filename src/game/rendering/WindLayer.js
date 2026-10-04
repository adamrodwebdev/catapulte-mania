import { WORLD } from '../physics/constants.js'
import { SeededRandom } from '../../core/utils/SeededRandom.js'
import { clamp } from '../../core/utils/math.js'

const TAU = Math.PI * 2
/** Nombre maximal de traînées (vent fort). */
const MAX_STREAKS = 64
/** Zone couverte par les traînées (repère monde). */
const SPAN = WORLD.WIDTH + 600
const TOP = WORLD.TOP + 120
const BOTTOM = WORLD.GROUND_Y - 30

/**
 * Représentation visuelle du vent (v3.6), dessinée dans le repère du monde.
 *
 * - Traînées : des filets d'air qui traversent le ciel. Leur nombre dit la
 *   force du vent, leur vitesse et leur longueur sa force LOCALE : plus haut,
 *   elles filent plus vite (le vent forcit en altitude) ; une rafale qui passe
 *   les rend plus longues et plus claires, en bande, et on la voit arriver.
 * - Manche à air près de la catapulte : molle par temps calme, à l'horizontale
 *   par grand vent, agitée par les rafales.
 * - Fanion au sommet du château, qui claque dans le sens du vent.
 *
 * Aucune image : tout est tracé. Mouvement réduit : traînées immobiles (avec
 * une pointe de flèche qui garde l'information de direction), sans flottement.
 */
export class WindLayer {
  #streaks

  constructor(seed = 3) {
    const r = new SeededRandom(seed)
    this.#streaks = Array.from({ length: MAX_STREAKS }, () => ({
      x: r.range(0, SPAN),
      y: r.range(TOP, BOTTOM),
      speed: r.range(0.8, 1.25),
      len: r.range(0.7, 1.3),
      wave: r.range(0, TAU),
    }))
  }

  /**
   * @param {CanvasRenderingContext2D} ctx repère monde
   * @param {{ field: import('../physics/WindField.js').WindField, time: number, animate: boolean, catapults: {x:number,y:number,dir:number}[], top: {x:number,y:number} | null }} wind
   * @param {number} pixel taille d'un pixel écran en unités monde
   */
  draw(ctx, wind, pixel) {
    const { field, time, animate } = wind
    const t = animate ? time : 0
    const base = field.base
    for (const c of wind.catapults) this.#windsock(ctx, field, c.x + 150 * c.dir, t, animate, pixel)
    if (wind.top) this.#pennant(ctx, field, wind.top, t, animate, pixel)
    if (Math.abs(base) < 0.05) return
    this.#drawStreaks(ctx, field, t, pixel)
  }

  #drawStreaks(ctx, field, t, pixel) {
    const base = field.base
    const dir = Math.sign(base)
    const count = Math.round(MAX_STREAKS * clamp(Math.abs(base) * 1.15, 0.15, 1))
    ctx.save()
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#ffffff'
    ctx.fillStyle = '#ffffff'
    for (let i = 0; i < count; i++) {
      const s = this.#streaks[i]
      // Vitesse de défilement : vent de base × altitude (les rafales jouent sur la longueur et l'éclat).
      const v = (0.12 + 0.55 * Math.abs(base) * field.shearAt(s.y)) * s.speed
      const x = ((((s.x + dir * t * v) % SPAN) + SPAN) % SPAN) - 300
      const local = Math.abs(field.at(x, s.y, t))
      const gust = Math.max(0, field.gustAt(x, t)) * field.profile.gust
      const len = (40 + 110 * clamp(local, 0, 1.8)) * s.len
      const alpha = clamp(0.1 + 0.22 * local + 0.45 * gust, 0.08, 0.6)
      const wob = Math.sin(t / 260 + s.wave) * 6
      ctx.globalAlpha = alpha
      ctx.lineWidth = Math.max(1.6 * pixel, 2.2 + 1.6 * gust)
      ctx.beginPath()
      ctx.moveTo(x - dir * len, s.y + wob)
      ctx.quadraticCurveTo(x - dir * len * 0.5, s.y - wob, x, s.y)
      ctx.stroke()
      // Pointe : la direction reste lisible même immobile (mouvement réduit).
      ctx.beginPath()
      ctx.moveTo(x + dir * 7, s.y)
      ctx.lineTo(x - dir * 3, s.y - 5)
      ctx.lineTo(x - dir * 3, s.y + 5)
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
  }

  /** Manche à air rayée rouge et blanc, au sol devant la catapulte. */
  #windsock(ctx, field, x, t, animate, pixel) {
    const ground = WORLD.GROUND_Y
    const poleTop = ground - 120
    const w = field.at(x, poleTop, t)
    const strength = clamp(Math.abs(w), 0, 1.3)
    const dir = w === 0 ? 1 : Math.sign(w)
    ctx.save()
    // Mât.
    ctx.strokeStyle = '#3b3128'
    ctx.lineWidth = Math.max(pixel, 4)
    ctx.beginPath()
    ctx.moveTo(x, ground)
    ctx.lineTo(x, poleTop - 6)
    ctx.stroke()
    ctx.fillStyle = '#d4a537'
    ctx.beginPath()
    ctx.arc(x, poleTop - 7, 4, 0, TAU)
    ctx.fill()
    // Manche : 5 anneaux, de la verticale (calme) à l'horizontale (grand vent).
    const lift = clamp(strength / 0.9, 0.06, 1) * (Math.PI / 2)
    let px = x
    let py = poleTop
    for (let i = 0; i < 5; i++) {
      const flutter = animate ? Math.sin(t / (70 + i * 12) + i * 1.7) * 0.12 * (0.3 + strength) : 0
      const a = Math.PI / 2 - lift + flutter + i * 0.05 * (1 - strength / 1.3)
      const seg = 13
      const nx = px + Math.cos(a) * seg * dir
      const ny = py + Math.sin(a) * seg
      const r0 = 9 - i * 1.2
      const r1 = 9 - (i + 1) * 1.2
      // Trapèze perpendiculaire au segment.
      const ox = -Math.sin(a) * dir
      const oy = Math.cos(a)
      ctx.beginPath()
      ctx.moveTo(px + ox * r0 * dir, py - oy * r0)
      ctx.lineTo(nx + ox * r1 * dir, ny - oy * r1)
      ctx.lineTo(nx - ox * r1 * dir, ny + oy * r1)
      ctx.lineTo(px - ox * r0 * dir, py + oy * r0)
      ctx.closePath()
      ctx.fillStyle = i % 2 ? '#f3ead7' : '#c0392b'
      ctx.fill()
      ctx.lineWidth = Math.max(pixel, 1)
      ctx.strokeStyle = 'rgba(40,20,10,0.55)'
      ctx.stroke()
      px = nx
      py = ny
    }
    ctx.restore()
  }

  /** Fanion au sommet du château (bloc le plus haut encore debout). */
  #pennant(ctx, field, top, t, animate, pixel) {
    const w = field.at(top.x, top.y - 40, t)
    const strength = clamp(Math.abs(w), 0, 1.3)
    const dir = w === 0 ? 1 : Math.sign(w)
    const poleTop = top.y - 46
    ctx.save()
    ctx.strokeStyle = '#3b3128'
    ctx.lineWidth = Math.max(pixel, 3)
    ctx.beginPath()
    ctx.moveTo(top.x, top.y)
    ctx.lineTo(top.x, poleTop)
    ctx.stroke()
    const len = 34 + 10 * strength
    const droop = (1 - clamp(strength / 0.8, 0.1, 1)) * 26
    const wave = animate ? Math.sin(t / 110) * (3 + 5 * strength) : 0
    ctx.beginPath()
    ctx.moveTo(top.x, poleTop)
    ctx.quadraticCurveTo(top.x + dir * len * 0.5, poleTop + wave + droop * 0.4, top.x + dir * len, poleTop + 9 + droop)
    ctx.quadraticCurveTo(top.x + dir * len * 0.45, poleTop + 14 - wave + droop * 0.5, top.x, poleTop + 18)
    ctx.closePath()
    ctx.fillStyle = '#5b2a86'
    ctx.fill()
    ctx.lineWidth = Math.max(pixel, 1)
    ctx.strokeStyle = 'rgba(20,10,30,0.6)'
    ctx.stroke()
    ctx.restore()
  }
}
