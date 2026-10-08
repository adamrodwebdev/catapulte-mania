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

    // Viseur un peu plus petit sur les écrans bas (téléphone à l'horizontale).
    if (scene.aim) this.#drawAim(ctx, scene.aim, pixel * Math.max(0.72, Math.min(1, camera.viewH / 720)), scene.highContrast)
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

  /**
   * Viseur (v5.2) : rapporteur d'angle, jauge de puissance, valeurs exactes,
   * repères du tir précédent, et la fronde pendant le geste.
   * Tailles exprimées en pixels d'écran (`pixel` = 1 / zoom) : le viseur garde
   * la même taille à l'écran quel que soit le cadrage.
   */
  #drawAim(ctx, aim, pixel, highContrast) {
    const { x, y, angle, power, dir = 1, min = 5, max = 80, last = null } = aim
    const px = Math.max(0.6, pixel)
    const R = 92 * px
    const rad = (deg) => (deg * Math.PI) / 180
    // Repère du viseur : x vers l'avant du tir, y vers le haut (angles trigonométriques).
    const at = (deg, r) => ({ x: x + Math.cos(rad(deg)) * r * dir, y: y - Math.sin(rad(deg)) * r })
    const off = aim.cancelling
    const ink = 'rgba(30,26,43,0.75)'
    const light = highContrast ? '#ffd400' : '#fff6dc'
    ctx.save()
    ctx.lineCap = 'round'
    ctx.globalAlpha = off ? 0.45 : 1

    // 1. Trajectoire du tir précédent (fantôme), en pointillés pâles.
    if (last?.path?.length > 1) {
      ctx.fillStyle = 'rgba(255,246,220,0.38)'
      for (let i = 1; i < last.path.length; i += 2) {
        const q = last.path[i]
        ctx.beginPath()
        ctx.arc(q.x, q.y, 2.2 * px, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // 2. Rapporteur : arc des angles permis, graduations tous les 5°, plus longues tous les 15°.
    ctx.lineWidth = 7 * px
    ctx.strokeStyle = 'rgba(30,26,43,0.35)'
    ctx.beginPath()
    ctx.arc(x, y, R, dir > 0 ? -rad(max) : Math.PI + rad(min), dir > 0 ? -rad(min) : Math.PI + rad(max))
    ctx.stroke()
    ctx.lineWidth = 1.6 * px
    ctx.strokeStyle = 'rgba(255,246,220,0.75)'
    for (let a = Math.ceil(min / 5) * 5; a <= max; a += 5) {
      const big = a % 15 === 0
      const p0 = at(a, R - (big ? 7 : 4) * px)
      const p1 = at(a, R + (big ? 7 : 4) * px)
      ctx.beginPath()
      ctx.moveTo(p0.x, p0.y)
      ctx.lineTo(p1.x, p1.y)
      ctx.stroke()
    }
    // Mode précision : graduations au degré autour de l'angle visé.
    if (aim.fine) {
      ctx.lineWidth = 1 * px
      for (let a = Math.ceil(angle) - 6; a <= Math.floor(angle) + 6; a++) {
        if (a < min || a > max) continue
        const p0 = at(a, R - 3 * px)
        const p1 = at(a, R + 3 * px)
        ctx.beginPath()
        ctx.moveTo(p0.x, p0.y)
        ctx.lineTo(p1.x, p1.y)
        ctx.stroke()
      }
    }
    // Angle du tir précédent : petit triangle creux sur l'arc.
    if (last && Number.isFinite(last.angle)) {
      const g = at(last.angle, R + 12 * px)
      const g1 = at(last.angle - 2.2, R + 20 * px)
      const g2 = at(last.angle + 2.2, R + 20 * px)
      ctx.beginPath()
      ctx.moveTo(g.x, g.y)
      ctx.lineTo(g1.x, g1.y)
      ctx.lineTo(g2.x, g2.y)
      ctx.closePath()
      ctx.lineWidth = 1.6 * px
      ctx.strokeStyle = 'rgba(255,246,220,0.8)'
      ctx.stroke()
    }

    // 3. Jauge de puissance, dans l'axe du tir : du vert au rouge.
    const r0 = 26 * px
    const L = 130 * px
    const tip = at(angle, r0 + L * power)
    const base = at(angle, r0)
    const end = at(angle, r0 + L)
    ctx.lineWidth = 10 * px
    ctx.strokeStyle = ink
    ctx.beginPath()
    ctx.moveTo(base.x, base.y)
    ctx.lineTo(end.x, end.y)
    ctx.stroke()
    if (power > 0.002) {
      const gr = ctx.createLinearGradient(base.x, base.y, end.x, end.y)
      gr.addColorStop(0, '#6fcf5b')
      gr.addColorStop(0.6, '#f2c94c')
      gr.addColorStop(1, '#e2553b')
      ctx.lineWidth = 6 * px
      ctx.strokeStyle = gr
      ctx.beginPath()
      ctx.moveTo(base.x, base.y)
      ctx.lineTo(tip.x, tip.y)
      ctx.stroke()
    }
    // Puissance du tir précédent : encoche sur la jauge.
    if (last && Number.isFinite(last.power)) {
      const n = at(angle, r0 + L * last.power)
      const nx = Math.sin(rad(angle)) * 8 * px
      const ny = Math.cos(rad(angle)) * 8 * px * dir
      ctx.lineWidth = 2 * px
      ctx.strokeStyle = light
      ctx.beginPath()
      ctx.moveTo(n.x - nx * dir, n.y - ny * dir)
      ctx.lineTo(n.x + nx * dir, n.y + ny * dir)
      ctx.stroke()
    }
    // Aiguille de l'angle (traverse le rapporteur) et pointe de la jauge.
    const needle0 = at(angle, R - 12 * px)
    const needle1 = at(angle, R + 12 * px)
    ctx.lineWidth = 4 * px
    ctx.strokeStyle = light
    ctx.beginPath()
    ctx.moveTo(needle0.x, needle0.y)
    ctx.lineTo(needle1.x, needle1.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(tip.x, tip.y, 6 * px, 0, Math.PI * 2)
    ctx.fillStyle = light
    ctx.fill()
    ctx.lineWidth = 2 * px
    ctx.strokeStyle = ink
    ctx.stroke()

    // 4. Valeurs exactes, dans une pastille au bout de la jauge.
    const fmt = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1))
    const label = `${fmt(Math.round(angle * 2) / 2)}°  ${fmt(Math.round(power * 200) / 2)} %`
    ctx.font = `700 ${Math.round(14 * px)}px Inter, system-ui, sans-serif`
    const w = ctx.measureText(label).width + 16 * px
    // Place fixe, au-dessus du rapporteur : l'œil la retrouve toujours au même endroit.
    const bx = x + dir * R * 0.15 - (dir > 0 ? 0 : w)
    const by = y - R - 44 * px
    ctx.fillStyle = 'rgba(30,26,43,0.82)'
    ctx.beginPath()
    ctx.roundRect?.(bx, by, w, 24 * px, 12 * px)
    if (!ctx.roundRect) ctx.rect(bx, by, w, 24 * px)
    ctx.fill()
    ctx.fillStyle = light
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, bx + 8 * px, by + 12.5 * px)
    if (aim.fine) {
      // Loupe : mode précision actif.
      const mx = bx + w + 14 * px
      const my = by + 12 * px
      ctx.lineWidth = 2.4 * px
      ctx.strokeStyle = light
      ctx.beginPath()
      ctx.arc(mx, my - 2 * px, 6 * px, 0, Math.PI * 2)
      ctx.moveTo(mx + 4 * px, my + 2.5 * px)
      ctx.lineTo(mx + 9 * px, my + 7.5 * px)
      ctx.stroke()
    }

    // 5. La fronde pendant le geste, là où le doigt s'est posé : deux brins
    //    tendus du point de départ jusqu'au doigt (le geste se fait n'importe où).
    if (aim.dragging && aim.pointer && aim.anchor) {
      const pt = aim.pointer
      const an0 = aim.anchor
      const k = 0.4 + power * 0.6
      const nx = -(pt.y - an0.y)
      const ny = pt.x - an0.x
      const nl = Math.hypot(nx, ny) || 1
      ctx.globalAlpha = off ? 0.5 : 0.9
      for (const side of [-1, 1]) {
        ctx.lineWidth = (3.4 - power * 1.4) * px
        ctx.strokeStyle = '#7a5a36'
        ctx.beginPath()
        ctx.moveTo(an0.x + (side * nx * 9 * px) / nl, an0.y + (side * ny * 9 * px) / nl)
        ctx.lineTo(pt.x, pt.y)
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, (9 + 5 * k) * px, 0, Math.PI * 2)
      ctx.fillStyle = off ? 'rgba(200,60,50,0.35)' : 'rgba(255,246,220,0.25)'
      ctx.fill()
      ctx.lineWidth = 2 * px
      ctx.strokeStyle = off ? '#d9534f' : light
      ctx.stroke()
      if (aim.fine) {
        ctx.setLineDash([4 * px, 4 * px])
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, 26 * px, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
      }
      // Point de départ du geste : y revenir annule le tir.
      if (aim.anchor) {
        const an = aim.anchor
        ctx.globalAlpha = off ? 1 : 0.6
        ctx.lineWidth = 2 * px
        ctx.strokeStyle = off ? '#d9534f' : light
        ctx.beginPath()
        ctx.arc(an.x, an.y, 12 * px, 0, Math.PI * 2)
        ctx.stroke()
        if (off) {
          ctx.beginPath()
          ctx.moveTo(an.x - 6 * px, an.y - 6 * px)
          ctx.lineTo(an.x + 6 * px, an.y + 6 * px)
          ctx.moveTo(an.x + 6 * px, an.y - 6 * px)
          ctx.lineTo(an.x - 6 * px, an.y + 6 * px)
          ctx.stroke()
        }
      }
    }
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
