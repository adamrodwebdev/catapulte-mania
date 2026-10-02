import { WORLD } from '../physics/constants.js'

/**
 * Rendu Canvas 2D de la scène.
 * Ordre de dessin : ciel → lointain (parallaxe) → sol → structures → cibles →
 * projectiles → catapulte → particules → aide à la trajectoire.
 * Toute la partie graphique passe par l'AssetRegistry.
 */
export class Renderer {
  /** @type {CanvasRenderingContext2D} */
  #ctx
  #canvas
  #assets
  dpr = 1

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('../assets/AssetRegistry.js').AssetRegistry} assets
   */
  constructor(canvas, assets) {
    this.#canvas = canvas
    this.#ctx = canvas.getContext('2d', { alpha: false })
    this.#assets = assets
  }

  get assets() {
    return this.#assets
  }

  resize(cssW, cssH, dpr) {
    this.dpr = Math.min(2, Math.max(1, dpr || 1))
    this.#canvas.width = Math.round(cssW * this.dpr)
    this.#canvas.height = Math.round(cssH * this.dpr)
  }

  /**
   * @param {object} scene
   * @param {import('./Camera.js').Camera} scene.camera
   * @param {Iterable<any>} scene.entities
   * @param {object} scene.catapult { x, y, armAngle, load, loadRadius }
   * @param {import('../effects/ParticleSystem.js').ParticleSystem} scene.particles
   * @param {{x:number,y:number}[] | null} scene.trajectory
   * @param {number} scene.theme
   * @param {number} scene.time
   * @param {boolean} scene.animate
   */
  render(scene) {
    const ctx = this.#ctx
    const { camera, theme, time, animate } = scene
    const pixel = 1 / camera.scale
    const assets = this.#assets

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    assets.draw(ctx, 'scene.sky', { w: camera.viewW, h: camera.viewH, extra: { theme, viewW: camera.viewW, viewH: camera.viewH, time, animate } })

    camera.apply(ctx, this.dpr, 0.45)
    assets.draw(ctx, 'scene.far', { w: WORLD.WIDTH, h: 400, pixel, extra: { theme } })

    camera.apply(ctx, this.dpr)
    assets.draw(ctx, 'scene.ground', { w: WORLD.WIDTH, h: 200, pixel, extra: { theme } })

    const order = { block: 0, barrel: 1, target: 2, projectile: 3 }
    const list = [...scene.entities].sort((a, b) => order[a.kind] - order[b.kind])
    for (const e of list) {
      ctx.save()
      ctx.translate(e.x, e.y)
      ctx.rotate(e.angle)
      assets.draw(ctx, e.assetKey, {
        w: e.width, h: e.height, vertices: e.localVertices, shape: e.shape, damage: e.damageRatio,
        burning: e.burning > 0, time, seed: e.id, pixel,
        extra: e.kind === 'target' ? { hurt: time - e.hurtAt < 600 || e.damageRatio > 0.6, team: e.team } : undefined,
      })
      ctx.restore()
    }

    // Catapultes (une en solo, deux en face-à-face ; celle de droite est dessinée en miroir).
    for (const c of scene.catapults || []) {
      ctx.save()
      ctx.translate(c.x, c.y)
      if (c.dir === -1) ctx.scale(-1, 1)
      assets.draw(ctx, 'catapult', { w: 180, h: 140, pixel, time, extra: { armAngle: c.armAngle, load: c.load, loadRadius: c.loadRadius, registry: assets, skin: c.skin, flag: c.flag } })
      ctx.restore()
    }

    if (scene.aim) this.#drawAim(ctx, scene.aim, pixel)

    scene.particles.draw(ctx, pixel)

    if (scene.trajectory && scene.trajectory.length) this.#drawTrajectory(ctx, scene.trajectory, pixel, scene.highContrast)
  }

  /** Flèche de visée : direction = angle, longueur = puissance. */
  #drawAim(ctx, { x, y, angle, power, dir = 1 }, pixel) {
    const a = (-angle * Math.PI) / 180
    const len = 60 + power * 150
    ctx.save()
    ctx.translate(x, y)
    if (dir === -1) ctx.scale(-1, 1)
    ctx.rotate(a)
    ctx.lineCap = 'round'
    ctx.setLineDash([10 * Math.max(1, pixel), 8 * Math.max(1, pixel)])
    ctx.lineWidth = 7 * pixel
    ctx.strokeStyle = 'rgba(30,26,43,0.65)'
    ctx.beginPath()
    ctx.moveTo(24, 0)
    ctx.lineTo(len, 0)
    ctx.stroke()
    ctx.lineWidth = 3.5 * pixel
    ctx.strokeStyle = '#f6d98a'
    ctx.stroke()
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(len + 16, 0)
    ctx.lineTo(len - 4, -10)
    ctx.lineTo(len - 4, 10)
    ctx.closePath()
    ctx.fillStyle = '#f6d98a'
    ctx.fill()
    ctx.lineWidth = 2 * pixel
    ctx.strokeStyle = '#1e1a2b'
    ctx.stroke()
    ctx.restore()
  }

  #drawTrajectory(ctx, points, pixel, highContrast) {
    const n = points.length
    for (let i = 0; i < n; i++) {
      const p = points[i]
      const t = i / n
      ctx.globalAlpha = 1 - t * 0.6
      ctx.beginPath()
      ctx.arc(p.x, p.y, (4.5 - t * 2) * Math.max(1, pixel * 0.9), 0, Math.PI * 2)
      ctx.fillStyle = highContrast ? '#ffd400' : '#fff6dc'
      ctx.fill()
      ctx.lineWidth = 1.5 * pixel
      ctx.strokeStyle = '#1e1a2b'
      ctx.stroke()
    }
    const last = points[n - 1]
    if (last) {
      ctx.globalAlpha = 0.9
      ctx.strokeStyle = highContrast ? '#ffd400' : '#fff6dc'
      ctx.lineWidth = 3 * pixel
      const r = 14 * Math.max(1, pixel * 0.8)
      ctx.beginPath()
      ctx.moveTo(last.x - r, last.y - r)
      ctx.lineTo(last.x + r, last.y + r)
      ctx.moveTo(last.x + r, last.y - r)
      ctx.lineTo(last.x - r, last.y + r)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }
}
