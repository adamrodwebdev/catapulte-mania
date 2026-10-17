import { WORLD } from '../physics/constants.js'
import { ENGINE_GOLD } from '../assets/procedural/palette.js'

/**
 * Engins de siège (v6.2, sortis du Renderer) : dessin de l'engin du joueur et
 * de ce qui s'y rapporte (avaries, portée des archers, éclats de l'engin d'or).
 */

/** Emprise du bâti de chaque engin (repère local, avant le miroir) : là où se voient les avaries. */
export const ENGINE_FRAME = Object.freeze({
  catapult: { x0: -84, x1: 84, y0: -100 },
  trebuchet: { x0: -125, x1: 130, y0: -160 },
  ballista: { x0: -70, x1: 70, y0: -80 },
})

/**
 * Vue de chaque engin (v6.2) : sa clé de dessin et sa taille, l'angle dont on
 * suit la vitesse (`motion` : flou du bras, balancier), un geste avant le dessin
 * (`before`) et ce que son dessin lit de lui (`extra`). Un engin d'une autre
 * sorte est dessiné en catapulte.
 */
const ENGINE_VIEWS = new Map([
  [
    'ballista',
    {
      key: 'ballista',
      w: 170,
      h: 120,
      before: (ctx, c, animate) => {
        // v6.2 : traînée sur ses patins, l'affût tangue un peu.
        if (c.roll && animate !== false) ctx.rotate(Math.sin(c.roll * 2.2) * 0.012)
      },
      extra: (c, assets, still) => ({ angle: c.angle, tension: c.tension, load: c.load, skin: c.skin, still }),
    },
  ],
  [
    'trebuchet',
    {
      key: 'trebuchet',
      w: 260,
      h: 260,
      motion: (c) => c.rig.theta,
      extra: (c, assets, still, thetaSpeed) => {
        // Repère local de l'engin : la fronde est donnée en coordonnées monde.
        const sling = c.rig.sling ? { x: (c.rig.sling.x - c.x) * c.dir, y: c.rig.sling.y - c.y } : null
        return { theta: c.rig.theta, sling, load: c.loaded ? c.load : null, loadRadius: c.loadRadius, registry: assets, skin: c.skin, flag: c.flag, thetaSpeed, still }
      },
    },
  ],
  [
    'catapult',
    {
      key: 'catapult',
      w: 180,
      h: 140,
      motion: (c) => c.armAngle,
      extra: (c, assets, still, armSpeed) => ({ armAngle: c.armAngle, load: c.load, loadRadius: c.loadRadius, registry: assets, skin: c.skin, flag: c.flag, armSpeed, still, roll: c.roll ?? 0 }),
    },
  ],
])

/** Dessin des engins : l'engin, ses avaries, et la vitesse de son bras d'une image à l'autre. */
export class EnginePainter {
  /**
   * Dernier angle de bras connu par engin, pour en déduire la vitesse (flou, balancement).
   * v6.2 : la clé est l'engin lui-même (sorte et côté), pas l'objet de la scène, refait à
   * chaque image : hier, la vitesse restait nulle (ni flou du bras, ni balancier).
   */
  #motion = new Map()

  /**
   * L'engin lui-même (catapulte, trébuchet ou baliste), dans son repère : le
   * Renderer l'a déjà placé, retourné (face-à-face) et cabré.
   */
  draw(ctx, c, assets, pixel, time, animate) {
    const view = ENGINE_VIEWS.get(c.kind) ?? ENGINE_VIEWS.get('catapult')
    view.before?.(ctx, c, animate)
    const speed = view.motion ? this.#angularSpeed(`${c.kind}:${c.dir}`, view.motion(c), time) : 0
    assets.draw(ctx, view.key, { w: view.w, h: view.h, pixel, time, extra: view.extra(c, assets, animate === false, speed) })
  }

  /**
   * Avaries visibles sur l'engin (v5.8), dans son repère : croûte de givre et
   * stalactites, fissures et éclats de bois, taches de rouille. (Le feu, lui,
   * vient des particules et de la lueur.)
   */
  drawWear(ctx, c, time, animate, pixel) {
    const w = c.condition
    const f = ENGINE_FRAME[c.kind] ?? ENGINE_FRAME.catapult
    const px = Math.max(1, pixel)
    ctx.save()
    if (w.rust > 0) {
      // Rouille : des taches orangées sur les ferrures, plus nombreuses à chaque couche.
      for (let i = 0; i < w.rust * 7; i++) {
        const x = f.x0 + ((i * 53) % 100) / 100 * (f.x1 - f.x0)
        const y = f.y0 * 0.15 + ((i * 37) % 100) / 100 * f.y0 * 0.8
        const r = (5 + ((i * 7) % 5)) * 1.2
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        g.addColorStop(0, 'rgba(150,70,25,0.75)')
        g.addColorStop(1, 'rgba(150,70,25,0)')
        ctx.fillStyle = g
        ctx.fillRect(x - r, y - r, r * 2, r * 2)
      }
    }
    if (w.crack > 0) {
      // Fissures : traits brisés sombres ; disloqué, une planche pend.
      ctx.strokeStyle = 'rgba(25,15,10,0.85)'
      ctx.lineWidth = 2 * px
      ctx.lineJoin = 'round'
      const n = w.crack === 1 ? 3 : 6
      for (let i = 0; i < n; i++) {
        let x = f.x0 + ((i * 41 + 13) % 100) / 100 * (f.x1 - f.x0)
        let y = f.y0 * (0.25 + ((i * 29) % 50) / 100)
        ctx.beginPath()
        ctx.moveTo(x, y)
        for (let k = 0; k < 4; k++) {
          x += (((i + k) * 17) % 13) - 6
          y += 7 + ((i * k) % 5)
          ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
      if (w.crack >= 2) {
        ctx.save()
        ctx.translate(f.x0 * 0.4, f.y0 * 0.45)
        ctx.rotate(0.9)
        ctx.fillStyle = '#7a5530'
        ctx.fillRect(-4, 0, 8, 46)
        ctx.strokeStyle = '#1e1a2b'
        ctx.lineWidth = 1.4 * px
        ctx.strokeRect(-4, 0, 8, 46)
        ctx.restore()
      }
    }
    if (w.frozen) {
      // Givre : voile bleuté, liseré blanc, stalactites, reflets qui scintillent.
      ctx.globalAlpha = 0.38
      ctx.fillStyle = '#bfe6ff'
      ctx.beginPath()
      ctx.roundRect?.(f.x0, f.y0, f.x1 - f.x0, -f.y0, 12)
      if (!ctx.roundRect) ctx.rect(f.x0, f.y0, f.x1 - f.x0, -f.y0)
      ctx.fill()
      ctx.globalAlpha = 0.9
      ctx.lineWidth = 2.2 * px
      ctx.strokeStyle = '#eaf8ff'
      ctx.stroke()
      ctx.fillStyle = '#e6f6ff'
      for (let x = f.x0 + 10; x < f.x1 - 6; x += 19) {
        const h = 9 + ((x * 7) % 8)
        ctx.beginPath()
        ctx.moveTo(x - 4, f.y0 * 0.45)
        ctx.lineTo(x + 4, f.y0 * 0.45)
        ctx.lineTo(x, f.y0 * 0.45 + h)
        ctx.closePath()
        ctx.fill()
      }
      ctx.globalAlpha = animate === false ? 0.8 : 0.5 + 0.5 * Math.sin(time / 260)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(f.x0 * 0.5, f.y0 * 0.7, 10, 1.6 * px)
      ctx.fillRect(f.x0 * 0.5 + 4, f.y0 * 0.7 - 4, 1.6 * px, 10)
    }
    ctx.restore()
  }

  /**
   * Vitesse angulaire du bras (rad/s), lissée. Purement visuelle : elle ne lit
   * que l'angle déjà calculé par la physique.
   */
  #angularSpeed(engine, angle, time) {
    if (!Number.isFinite(angle) || !Number.isFinite(time)) return 0
    const prev = this.#motion.get(engine)
    let speed = 0
    if (prev) {
      const dt = (time - prev.time) / 1000
      if (dt <= 0) speed = prev.speed
      else if (dt < 0.25) speed = prev.speed * 0.4 + ((angle - prev.angle) / dt) * 0.6
    }
    this.#motion.set(engine, { angle, time, speed })
    return Math.max(-60, Math.min(60, speed))
  }
}

/**
 * Portée des archers (v6.2) : une volée de flèches tombées court, fichées en
 * terre de biais, empennage rouge. Visible quand l'engin s'en approche.
 * @param {{ x: number, alpha: number }} d
 */
export function drawRangeArrows(ctx, d, pixel) {
  const y = WORLD.GROUND_Y
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, d.alpha))
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (let i = 0; i < 6; i++) {
    // Fichées de biais, la pointe en terre, l'empennage tourné vers le château d'où elles viennent.
    const x = d.x + (i - 2.5) * 13 + ((i * 7) % 5) - 2
    const lean = 0.5 + ((i * 13) % 7) * 0.04
    const len = 36 + ((i * 5) % 4) * 4
    const ux = Math.sin(lean)
    const uy = -Math.cos(lean)
    const tx = x + ux * len
    const ty = y + uy * len
    // Ombre portée au sol, puis la hampe de frêne.
    ctx.strokeStyle = 'rgba(20,14,8,0.28)'
    ctx.lineWidth = 2.2
    ctx.beginPath()
    ctx.moveTo(x, y + 1)
    ctx.lineTo(x + len * 0.6, y + 1)
    ctx.stroke()
    ctx.strokeStyle = '#5f3f24'
    ctx.lineWidth = Math.max(2.4, 1.6 * pixel)
    ctx.beginPath()
    ctx.moveTo(x, y + 2)
    ctx.lineTo(tx, ty)
    ctx.stroke()
    // Empennage : deux plumes rouges, de part et d'autre de la hampe.
    const nx = -uy
    const ny = ux
    ctx.fillStyle = i % 2 ? '#c0392b' : '#a8281f'
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(tx - ux * 2, ty - uy * 2)
      ctx.lineTo(tx - ux * 12 + nx * s * 4.5, ty - uy * 12 + ny * s * 4.5)
      ctx.lineTo(tx - ux * 15, ty - uy * 15)
      ctx.closePath()
      ctx.fill()
    }
  }
  ctx.restore()
}

/** Éclats d'or (étoiles à quatre branches) qui scintillent tour à tour sur l'engin doré. */
export function drawGoldGlints(ctx, kind, time) {
  const spots = kind === 'trebuchet' ? [[-70, -60], [10, -150], [80, -40]] : kind === 'ballista' ? [[-30, -30], [20, -60], [55, -20]] : [[-48, -40], [6, -88], [60, -34]]
  ctx.save()
  ctx.fillStyle = ENGINE_GOLD.glint
  spots.forEach(([x, y], i) => {
    const s = Math.sin(time / 520 + i * 2.1)
    if (s <= 0.55) return
    const k = (s - 0.55) / 0.45
    const r = 2 + 5 * k
    ctx.globalAlpha = k
    ctx.beginPath()
    ctx.moveTo(x, y - r)
    ctx.quadraticCurveTo(x, y, x + r, y)
    ctx.quadraticCurveTo(x, y, x, y + r)
    ctx.quadraticCurveTo(x, y, x - r, y)
    ctx.quadraticCurveTo(x, y, x, y - r)
    ctx.fill()
  })
  ctx.restore()
}
