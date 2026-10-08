import { WORLD } from '../physics/constants.js'
import { WindLayer } from './WindLayer.js'
import { drawLake, drawLava } from '../assets/procedural/liquids.js'

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

    // Terrains (v5.0) : lacs, glace, lave, neige, posés sur le sol.
    if (scene.terrain && !scene.terrain.empty) this.#drawZones(ctx, scene.terrain.list, time, animate, pixel)

    const order = { block: 0, barrel: 1, target: 2, projectile: 3, flyer: 4 }
    const list = [...scene.entities].sort((a, b) => order[a.kind] - order[b.kind])
    this.#drawShadows(ctx, list.filter((e) => e.kind !== 'flyer'), scene.catapults || [])
    // Un projectile en vol : les défenseurs lèvent les yeux (animation seulement).
    const alert = list.some((e) => e.kind === 'projectile' && !e.hasImpacted && e.alive !== false)
    for (const e of list) {
      ctx.save()
      ctx.translate(e.x, e.y)
      ctx.rotate(e.angle)
      if (e.kind === 'flyer') ctx.rotate(-e.angle)
      // Carreau de baliste : toujours pointé dans le sens de sa course.
      if (e.bolt) ctx.rotate(Math.atan2(e.body.velocity.y, e.body.velocity.x) - e.angle)
      assets.draw(ctx, e.assetKey, {
        w: e.width, h: e.height, vertices: e.localVertices, shape: e.shape, damage: e.damageRatio,
        burning: e.burning > 0, time, seed: e.id, pixel,
        extra:
          e.kind === 'target'
            ? { hurt: time - e.hurtAt < 600 || e.damageRatio > 0.6, team: e.team, still: animate === false, alert, frozen: e.frozenMs > 0, walking: e.walking && e.frozenMs <= 0, facing: e.facing, swing: (scene.worldTime ?? 0) - (e.swatAt ?? -Infinity) }
            : e.kind === 'flyer'
              ? { flap: animate === false ? 0.25 : e.flap, facing: e.facing, carrying: e.carrying }
              : undefined,
      })
      if (e.frozenMs > 0) this.#drawFrost(ctx, e, time, pixel)
      if (e.kind === 'projectile' && e.snowScale > 1.04) this.#drawSnowball(ctx, e, pixel)
      ctx.restore()
    }

    // Vent : traînées, manche à air, fanion du château.
    if (scene.wind) this.#wind.draw(ctx, scene.wind, pixel)

    // Catapultes (une en solo, deux en face-à-face ; celle de droite est dessinée en miroir).
    for (const c of scene.catapults || []) {
      ctx.save()
      ctx.translate(c.x, c.y)
      if (c.dir === -1) ctx.scale(-1, 1)
      if (c.kind === 'ballista') {
        assets.draw(ctx, 'ballista', { w: 170, h: 120, pixel, time, extra: { angle: c.angle, tension: c.tension, load: c.load, skin: c.skin, still: animate === false } })
      } else if (c.kind === 'trebuchet') {
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
    if (scene.landing) this.#drawLanding(ctx, scene.landing, time, pixel)

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

  /**
   * Terrains (v5.0). Dessin léger (quelques dégradés et traits), animé :
   * vaguelettes du lac, veines de la lave qui palpitent, scintillement de la neige.
   */
  #drawZones(ctx, zones, time, animate, pixel) {
    const G = WORLD.GROUND_Y
    const t = animate ? time / 1000 : 0
    ctx.save()
    for (const z of zones) {
      if (z.kind === 'lake' || z.kind === 'ice') {
        // Eau et glace réalistes (v5.1, voir liquids.js).
        drawLake(ctx, z, G, t, pixel, z.kind === 'ice')
      } else if (z.kind === 'lava') {
        drawLava(ctx, z, G, t, pixel, animate)
      } else if (z.kind === 'snow') {
        ctx.fillStyle = this.#zoneGradient(ctx, 'snow', G - 14, G + 10, ['#ffffff', '#cfdeeb'], [0, 1])
        ctx.beginPath()
        ctx.moveTo(z.x0 - 8, G + 4)
        for (let x = z.x0; x <= z.x1; x += 24) ctx.quadraticCurveTo(x + 12, G - 13 - ((x * 13) % 5), Math.min(z.x1, x + 24), G - 9)
        ctx.lineTo(z.x1 + 8, G + 4)
        ctx.lineTo(z.x1 + 8, G + 12)
        ctx.lineTo(z.x0 - 8, G + 12)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = 'rgba(120,150,180,0.45)'
        ctx.lineWidth = 1.2 * pixel
        ctx.stroke()
        if (animate) {
          ctx.fillStyle = '#ffffff'
          for (let x = z.x0 + 10; x < z.x1; x += 33) {
            ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 3 + x)
            ctx.fillRect(x, G - 10 + ((x * 7) % 6), 2, 2)
          }
          ctx.globalAlpha = 1
        }
      }
    }
    ctx.restore()
  }

  /** Dégradés verticaux des terrains : créés une fois (ils ne dépendent que de la hauteur du sol). */
  #gradients = new Map()
  #zoneGradient(ctx, key, y0, y1, colors, stops) {
    let g = this.#gradients.get(key)
    if (!g) {
      g = ctx.createLinearGradient(0, y0, 0, y1)
      colors.forEach((c, i) => g.addColorStop(stops[i], c))
      this.#gradients.set(key, g)
    }
    return g
  }

  /** Objet gelé : voile bleuté, liseré de givre et reflets. */
  #drawFrost(ctx, e, time, pixel) {
    ctx.save()
    ctx.beginPath()
    if (e.kind === 'block' && e.localVertices?.length) {
      e.localVertices.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)))
      ctx.closePath()
    } else if (e.kind === 'barrel') {
      ctx.rect(-e.width / 2, -e.height / 2, e.width, e.height)
    } else {
      // Personnage pris dans un bloc de glace.
      const w = e.width * 1.2
      const h = e.height * 1.06
      const r = Math.min(6, w / 5)
      ctx.moveTo(-w / 2 + r, -h / 2)
      ctx.arcTo(w / 2, -h / 2, w / 2, h / 2, r)
      ctx.arcTo(w / 2, h / 2, -w / 2, h / 2, r)
      ctx.arcTo(-w / 2, h / 2, -w / 2, -h / 2, r)
      ctx.arcTo(-w / 2, -h / 2, w / 2, -h / 2, r)
      ctx.closePath()
    }
    // Le gel s'estompe sur ses deux dernières secondes.
    const fade = Math.min(1, e.frozenMs / 2000)
    ctx.globalAlpha = 0.42 * fade
    ctx.fillStyle = '#bfe6ff'
    ctx.fill()
    ctx.globalAlpha = 0.9 * fade
    ctx.lineWidth = 2.2 * pixel
    ctx.strokeStyle = '#eaf8ff'
    ctx.stroke()
    ctx.globalAlpha = (0.5 + 0.5 * Math.sin(time / 260 + e.id)) * fade
    ctx.fillStyle = '#ffffff'
    const s = Math.min(e.width, e.height) * 0.18
    ctx.fillRect(-e.width * 0.25, -e.height * 0.3, s, 1.6 * pixel)
    ctx.fillRect(-e.width * 0.25 + s * 0.4, -e.height * 0.3 - s * 0.4, 1.6 * pixel, s)
    ctx.restore()
  }

  /** Boule de neige : le boulet s'enrobe de neige en roulant. */
  #drawSnowball(ctx, e, pixel) {
    const r = e.radius
    ctx.save()
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r)
    g.addColorStop(0, '#ffffff')
    g.addColorStop(1, '#c9d9e8')
    ctx.globalAlpha = Math.min(1, (e.snowScale - 1) * 3)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.lineWidth = 1.6 * pixel
    ctx.strokeStyle = 'rgba(60,80,100,0.6)'
    ctx.stroke()
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

  /**
   * Trébuchet (v5.1) : repère du point d'impact si l'on lâchait maintenant.
   * Une colonne de lumière et une cible au sol qui balaient le terrain pendant
   * le balancier ; verte et plus vive quand elle est sur le château. Sa largeur
   * traduit l'incertitude (rafales), plus grande en Difficile.
   */
  #drawLanding(ctx, l, time, pixel) {
    const on = l.onCastle
    const col = on ? '120,230,120' : '255,246,220'
    const r = 16 + l.spread
    ctx.save()
    // Colonne de lumière.
    const g = ctx.createLinearGradient(0, l.y - 420, 0, l.y)
    g.addColorStop(0, `rgba(${col},0)`)
    g.addColorStop(1, `rgba(${col},${on ? 0.35 : 0.18})`)
    ctx.fillStyle = g
    ctx.fillRect(l.x - r * 0.6, l.y - 420, r * 1.2, 420)
    // Cible au point d'impact (ellipse au sol, qui pulse).
    const pulse = 1 + 0.12 * Math.sin(time / 90)
    ctx.lineWidth = 3 * pixel
    ctx.strokeStyle = `rgba(${col},0.95)`
    ctx.beginPath()
    ctx.ellipse(l.x, l.y, r * pulse, r * 0.4 * pulse, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.lineWidth = 2 * pixel
    ctx.beginPath()
    ctx.moveTo(l.x, l.y - 10)
    ctx.lineTo(l.x, l.y + 6)
    ctx.moveTo(l.x - 8, l.y)
    ctx.lineTo(l.x + 8, l.y)
    ctx.stroke()
    ctx.restore()
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
