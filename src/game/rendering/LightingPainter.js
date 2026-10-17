import { WORLD } from '../physics/constants.js'
import { THEMES } from '../assets/procedural/painters.js'
import { hasSunRays, moteKind, motes, sunPosition } from '../assets/procedural/scenery.js'

/**
 * Lumière de la scène (v6.2, sortie du Renderer) : ombres de contact, lueur des
 * feux, étalonnage du jour ou de la nuit, poussières d'ambiance et vignette.
 * Dégradés et halos mis en cache.
 */

/** Halo lumineux doux (mis en cache par couleur) : feux, lucioles, braises. */
const glows = new Map()
export function glow(rgb) {
  let c = glows.get(rgb)
  if (!c) {
    c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(128, 128) : Object.assign(document.createElement('canvas'), { width: 128, height: 128 })
    const g = c.getContext('2d')
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    grad.addColorStop(0, `rgba(${rgb},1)`)
    grad.addColorStop(0.3, `rgba(${rgb},0.45)`)
    grad.addColorStop(1, `rgba(${rgb},0)`)
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 128)
    glows.set(rgb, c)
  }
  return c
}

/** Lumière de la scène : ombres, feux, étalonnage, poussières, vignette. */
export class LightingPainter {
  /**
   * Lumière des feux (v5.7) : chaque objet qui brûle, chaque boulet enflammé
   * éclaire ce qui l'entoure (halo additif qui vacille). Bien plus marqué la
   * nuit, où les incendies deviennent les vraies sources de lumière.
   */
  drawFireLight(ctx, list, theme, time, animate, engines = []) {
    const night = THEMES[theme]?.night
    const strength = night ? 0.75 : 0.32
    let any = false
    // L'engin en feu (v5.8) : la lueur grandit avec l'intensité.
    for (const c of engines) {
      const heat = c.condition?.heat ?? 0
      if (heat <= 0) continue
      if (!any) {
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        any = true
      }
      const f = animate === false ? 1 : 0.85 + 0.15 * Math.sin(time / 61) * Math.sin(time / 29)
      const r = (110 + heat * 55) * f
      ctx.globalAlpha = Math.min(0.9, strength * (0.6 + heat * 0.25)) * f
      ctx.drawImage(glow('255,130,40'), c.x - r, c.y - 60 - r * 0.85, r * 2, r * 2)
    }
    for (const e of list) {
      // Qui éclaire (règles lues sur les entités, v6.2) : la torche d'un veilleur, ce qui brûle.
      const torch = e.torchLit
      const hot = e.alight
      if (!hot && !torch) continue
      if (!any) {
        ctx.save()
        ctx.globalCompositeOperation = 'lighter'
        any = true
      }
      if (torch && !hot) {
        // Torche d'un veilleur : un halo chaud qui vacille, qui éclaire les murs autour.
        const tip = e.torchTip
        const f = animate === false ? 1 : 0.88 + 0.12 * Math.sin(time / 53 + e.id * 2.3) * Math.sin(time / 31 + e.id)
        const r = (night ? 120 : 60) * f
        ctx.globalAlpha = (night ? 0.6 : 0.22) * f
        ctx.drawImage(glow('255,150,60'), tip.x - r, tip.y - r, r * 2, r * 2)
        continue
      }
      const flicker = animate === false ? 1 : 0.85 + 0.15 * Math.sin(time / 70 + e.id * 1.7) * Math.sin(time / 37 + e.id)
      const r = (110 + Math.max(e.width ?? 0, e.height ?? 0) * 1.4) * flicker
      ctx.globalAlpha = strength * flicker
      ctx.drawImage(glow('255,140,50'), e.x - r, e.y - r * 0.85, r * 2, r * 2)
    }
    if (any) ctx.restore()
  }

  /**
   * Ombres de contact au sol (v4.2) : une ellipse douce sous chaque objet,
   * plus pâle et plus large à mesure qu'il s'élève. Donne du poids à la scène.
   */
  drawShadows(ctx, entities, catapults) {
    const ground = WORLD.GROUND_Y
    ctx.save()
    ctx.fillStyle = '#1d1408'
    const shadow = (x, halfW, height) => {
      if (height > 420 || halfW <= 0) return
      const k = 1 - height / 420
      ctx.globalAlpha = 0.28 * k
      ctx.beginPath()
      ctx.ellipse(x, ground + 3, halfW * (1.15 - 0.3 * k + 0.3), 7 + 5 * (1 - k), 0, 0, Math.PI * 2)
      ctx.fill()
    }
    for (const e of entities) {
      if (e.kind === 'projectile' && e.y > ground - 2) continue
      const bottom = e.y + Math.max(e.width, e.height) / 2
      shadow(e.x, Math.max(e.width, 12) / 2, Math.max(0, ground - bottom))
    }
    for (const c of catapults) shadow(c.x + (c.kind === 'trebuchet' ? 0 : 10 * c.dir), c.kind === 'trebuchet' ? 120 : 85, 0)
    ctx.restore()
  }

  /**
   * Étalonnage de la lumière (repère écran) : le jour, une lumière chaude
   * descend de l'astre sur la scène ; la nuit, un voile froid assombrit le
   * haut de l'image. Dégradés mis en cache (ils ne changent qu'au redimensionnement).
   */
  #gradeCache = { key: '', fill: null, mode: 'source-over' }
  drawGrade(ctx, camera, theme) {
    const th = THEMES[theme] ?? THEMES[1]
    const w = camera.viewW
    const h = camera.viewH
    const key = `${theme}:${w}:${h}`
    const c = this.#gradeCache
    if (c.key !== key) {
      if (th.night) {
        const g = ctx.createLinearGradient(0, 0, 0, h)
        g.addColorStop(0, 'rgba(10,14,40,0.28)')
        g.addColorStop(0.6, 'rgba(10,14,40,0.06)')
        g.addColorStop(1, 'rgba(10,14,40,0.18)')
        Object.assign(c, { fill: g, mode: 'source-over' })
      } else if (hasSunRays(th)) {
        const sun = sunPosition(theme, w, h)
        const g = ctx.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, Math.hypot(w, h) * 0.9)
        g.addColorStop(0, th.sun + '30')
        g.addColorStop(0.5, th.sun + '10')
        g.addColorStop(1, th.sun + '00')
        Object.assign(c, { fill: g, mode: 'lighter' })
      } else {
        Object.assign(c, { fill: null })
      }
      c.key = key
    }
    if (!c.fill) return
    ctx.save()
    ctx.globalCompositeOperation = c.mode
    ctx.fillStyle = c.fill
    ctx.fillRect(0, 0, w, h)
    ctx.restore()
  }

  /** Poussières, pollen, lucioles ou braises qui flottent devant le décor (repère écran). */
  drawMotes(ctx, camera, theme, time) {
    const kind = moteKind(theme, THEMES[theme] ?? THEMES[1])
    if (kind) motes(ctx, kind, camera.viewW, camera.viewH, time, camera.x * camera.scale, glow)
  }

  /** Vignette légère : resserre le regard sur la scène (repère écran). */
  drawVignette(ctx, w, h) {
    ctx.fillStyle = this.#vignette(ctx, w, h)
    ctx.fillRect(0, 0, w, h)
  }

  #vignetteCache = { w: 0, h: 0, g: null }
  #vignette(ctx, w, h) {
    const c = this.#vignetteCache
    if (c.w !== w || c.h !== h || !c.g) {
      const g = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.45, w / 2, h * 0.45, Math.hypot(w, h) * 0.62)
      g.addColorStop(0, 'rgba(20, 12, 4, 0)')
      g.addColorStop(1, 'rgba(20, 12, 4, 0.28)')
      Object.assign(c, { w, h, g })
    }
    return c.g
  }
}
