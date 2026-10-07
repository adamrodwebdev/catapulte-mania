import { WORLD } from '../physics/constants.js'
import { WindLayer } from './WindLayer.js'

/**
 * Rendu Canvas 2D de la scène.
 * Ordre de dessin : ciel → lointain (parallaxe) → sol → structures → cibles →
 * projectiles → vent → catapulte → particules → aide à la trajectoire.
 * Toute la partie graphique passe par l'AssetRegistry.
 */
export class Renderer {
  /** @type {CanvasRenderingContext2D} */
  #ctx
  #canvas
  #assets
  #wind = new WindLayer()
  /** Dernier angle de bras connu par engin, pour en déduire la vitesse (flou, balancement). */
  #motion = new WeakMap()
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
    assets.draw(ctx, 'scene.sky', { w: camera.viewW, h: camera.viewH, extra: { theme, viewW: camera.viewW, viewH: camera.viewH, time, animate, wind: scene.wind?.field.base ?? 0 } })

    camera.apply(ctx, this.dpr, 0.45)
    assets.draw(ctx, 'scene.far', { w: WORLD.WIDTH, h: 400, pixel, extra: { theme, castle: !scene.versus } })

    camera.apply(ctx, this.dpr)
    assets.draw(ctx, 'scene.ground', { w: WORLD.WIDTH, h: 200, pixel, extra: { theme } })
    // Événements saisonniers : citrouilles d'automne, neige d'hiver.
    if (scene.season === 'winter') assets.draw(ctx, 'deco.snow', { w: WORLD.WIDTH, h: 20, pixel })
    if (scene.season === 'halloween') {
      for (const x of [380, 1080, 1340, 1660, 2010, 2240]) {
        ctx.save()
        ctx.translate(x, WORLD.GROUND_Y + 2)
        assets.draw(ctx, 'deco.pumpkin', { w: 54, h: 42, pixel, time })
        ctx.restore()
      }
    }

    const order = { block: 0, barrel: 1, target: 2, projectile: 3 }
    const list = [...scene.entities].sort((a, b) => order[a.kind] - order[b.kind])
    this.#drawShadows(ctx, list, scene.catapults || [])
    for (const e of list) {
      ctx.save()
      ctx.translate(e.x, e.y)
      ctx.rotate(e.angle)
      assets.draw(ctx, e.assetKey, {
        w: e.width, h: e.height, vertices: e.localVertices, shape: e.shape, damage: e.damageRatio,
        burning: e.burning > 0, time, seed: e.id, pixel,
        extra: e.kind === 'target' ? { hurt: time - e.hurtAt < 600 || e.damageRatio > 0.6, team: e.team, still: animate === false } : undefined,
      })
      ctx.restore()
    }

    // Vent : traînées, manche à air, fanion du château.
    if (scene.wind) this.#wind.draw(ctx, scene.wind, pixel)

    // Catapultes (une en solo, deux en face-à-face ; celle de droite est dessinée en miroir).
    for (const c of scene.catapults || []) {
      ctx.save()
      ctx.translate(c.x, c.y)
      if (c.dir === -1) ctx.scale(-1, 1)
      if (c.kind === 'trebuchet') {
        // Repère local de l'engin : la fronde est donnée en coordonnées monde.
        const sling = c.rig.sling ? { x: (c.rig.sling.x - c.x) * c.dir, y: c.rig.sling.y - c.y } : null
        const thetaSpeed = this.#angularSpeed(c, c.rig.theta, time)
        assets.draw(ctx, 'trebuchet', { w: 260, h: 260, pixel, time, extra: { theta: c.rig.theta, sling, load: c.loaded ? c.load : null, loadRadius: c.loadRadius, registry: assets, skin: c.skin, flag: c.flag, thetaSpeed, still: animate === false } })
      } else {
        const armSpeed = this.#angularSpeed(c, c.armAngle, time)
        assets.draw(ctx, 'catapult', { w: 180, h: 140, pixel, time, extra: { armAngle: c.armAngle, load: c.load, loadRadius: c.loadRadius, registry: assets, skin: c.skin, flag: c.flag, armSpeed, still: animate === false } })
      }
      ctx.restore()
    }

    if (scene.aim) this.#drawAim(ctx, scene.aim, pixel)

    scene.particles.draw(ctx, pixel)

    if (scene.trajectory && scene.trajectory.length) this.#drawTrajectory(ctx, scene.trajectory, pixel, scene.highContrast)

    // Vignette légère : resserre le regard sur la scène (en coordonnées écran).
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.fillStyle = this.#vignette(ctx, camera.viewW, camera.viewH)
    ctx.fillRect(0, 0, camera.viewW, camera.viewH)
  }

  /**
   * Vitesse angulaire du bras (rad/s), lissée. Purement visuelle : elle ne lit
   * que l'angle déjà calculé par la physique.
   */
  #angularSpeed(engine, angle, time) {
    if (typeof engine !== 'object' || engine === null || !Number.isFinite(angle) || !Number.isFinite(time)) return 0
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

  /**
   * Ombres de contact au sol (v4.2) : une ellipse douce sous chaque objet,
   * plus pâle et plus large à mesure qu'il s'élève. Donne du poids à la scène.
   */
  #drawShadows(ctx, entities, catapults) {
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
