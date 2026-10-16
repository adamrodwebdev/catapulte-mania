import { TREB_TUNING } from '../aim/TrebuchetInput.js'
import { WORLD } from '../physics/constants.js'
import { WindLayer } from './WindLayer.js'
import { drawLake, drawLava } from '../assets/procedural/liquids.js'
import { THEMES } from '../assets/procedural/painters.js'
import { GUARD_MS } from '../entities/General.js'
import { hasSunRays, moteKind, motes, sunPosition } from '../assets/procedural/scenery.js'
import { roundRect } from '../assets/procedural/realism.js'
import { CLOUD_KINDS } from '../physics/Clouds.js'

/** Emprise du bâti de chaque engin (repère local, avant le miroir) : là où se voient les avaries. */
const ENGINE_FRAME = Object.freeze({
  catapult: { x0: -84, x1: 84, y0: -100 },
  trebuchet: { x0: -125, x1: 130, y0: -160 },
  ballista: { x0: -70, x1: 70, y0: -80 },
})

/** Halo lumineux doux (mis en cache par couleur) : feux, lucioles, braises. */
const glows = new Map()
function glow(rgb) {
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

/**
 * Rendu Canvas 2D de la scène.
 * Ordre de dessin : ciel → chaînes lointaines (parallaxe 0,2) → collines (0,45)
 * → haies et camp (0,75) → sol → structures → cibles → projectiles → vent →
 * catapulte → lumière des feux → particules → aide à la trajectoire →
 * lumière de la scène, poussières d'ambiance et vignette (repère écran).
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

    // Plans du décor : plus ils sont loin, moins ils défilent (v5.7).
    camera.apply(ctx, this.dpr, 0.2)
    assets.draw(ctx, 'scene.distant', { w: WORLD.WIDTH, h: 600, pixel, extra: { theme } })
    camera.apply(ctx, this.dpr, 0.45)
    assets.draw(ctx, 'scene.far', { w: WORLD.WIDTH, h: 400, pixel, extra: { theme, castle: !scene.versus } })
    camera.apply(ctx, this.dpr, 0.75)
    assets.draw(ctx, 'scene.near', { w: WORLD.WIDTH, h: 200, pixel, extra: { theme, versus: Boolean(scene.versus) } })

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
    this.#drawAuras(ctx, list, time, animate, pixel)
    // Un projectile en vol : les défenseurs lèvent les yeux (animation seulement).
    const alert = list.some((e) => e.kind === 'projectile' && !e.hasImpacted && e.alive !== false)
    let worksDrawn = false
    for (const e of list) {
      // Échelles des pillards (v5.8) : devant la roche, derrière les défenseurs qui y grimpent.
      if (!worksDrawn && e.kind !== 'block' && e.kind !== 'barrel') {
        this.#drawWorks(ctx, scene.works, time, pixel)
        this.#drawTethers(ctx, scene.tethers, pixel)
        worksDrawn = true
      }
      ctx.save()
      ctx.translate(e.x, e.y)
      ctx.rotate(e.angle)
      if (e.kind === 'flyer') ctx.rotate(-e.angle)
      // Carreau de baliste : toujours pointé dans le sens de sa course.
      if (e.bolt) ctx.rotate(Math.atan2(e.body.velocity.y, e.body.velocity.x) - e.angle)
      // Général intouchable (v6.0) : il pulse doucement le temps de se relever (voilé, sans pulsation, en mouvement réduit).
      if (e.guardMs > 0) ctx.globalAlpha = animate === false ? 0.6 : 0.6 + 0.4 * Math.cos(time / 53)
      assets.draw(ctx, e.assetKey, {
        w: e.width, h: e.height, vertices: e.localVertices, shape: e.shape, damage: e.damageRatio,
        burning: e.burning > 0, time, seed: e.id, pixel,
        extra:
          e.kind === 'target'
            ? {
                hurt: time - e.hurtAt < 600 || e.damageRatio > 0.6, team: e.team, still: animate === false, alert, frozen: e.frozenMs > 0, walking: e.walking && e.frozenMs <= 0, facing: e.facing,
                swing: (scene.worldTime ?? 0) - (e.swatAt ?? -Infinity), torch: e.torch, sprinting: e.sprinting && e.walking, working: e.working, aura: e.aura > 1, raid: e.raid,
                climbing: Boolean(e.climbing), general: e.generalId, order: (scene.worldTime ?? 0) - (e.orderAt ?? -Infinity),
                // v6.1 : il repousse (ms depuis le geste), bras levés, sonné ou électrisé, empoisonné.
                push: (scene.worldTime ?? 0) - (e.pushAt ?? -Infinity), brace: Boolean(e.bracing), stun: (scene.worldTime ?? 0) < (e.stunUntil ?? 0) ? e.stunKind : null,
                poisoned: (scene.worldTime ?? 0) < (e.poisonUntil ?? 0),
              }
            : e.kind === 'flyer'
              ? { flap: animate === false ? 0.25 : e.flap, facing: e.facing, carrying: e.carrying }
              : e.prop
                ? { mill: e.mill?.angle ?? 0, frozen: e.frozenMs > 0, quenched: (e.quenchedUntil ?? 0) > (scene.worldTime ?? 0), still: animate === false }
                : undefined,
      })
      // Gelé, ou givré en vol par la bise (v6.1).
      if (e.frozenMs > 0 || e.rimed) this.#drawFrost(ctx, e, time, pixel)
      if (e.kind === 'projectile' && e.snowScale > 1.04) this.#drawSnowball(ctx, e, pixel)
      ctx.restore()
    }

    if (!worksDrawn) {
      this.#drawWorks(ctx, scene.works, time, pixel)
      this.#drawTethers(ctx, scene.tethers, pixel)
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
      if (c.condition) this.#drawWear(ctx, c, time, animate, pixel)
      ctx.restore()
    }
    // Bornes visibles du monde : la barre de l'engin reste toujours à l'écran.
    const view = { left: camera.screenToWorld(0, 0).x, right: camera.screenToWorld(camera.viewW, 0).x }
    for (const c of scene.catapults || []) if (c.condition?.show) this.#drawEngineBar(ctx, c, pixel, scene.highContrast, view)
    this.#drawRaiders(ctx, list, time, animate, pixel)
    this.#drawGenerals(ctx, list, time, animate, pixel)
    if (scene.healthBars !== false) this.#drawHealth(ctx, list, scene.worldTime ?? 0, pixel)

    // Viseur un peu plus petit sur les écrans bas (téléphone à l'horizontale).
    if (scene.aim) this.#drawAim(ctx, scene.aim, pixel * Math.max(0.72, Math.min(1, camera.viewH / 720)), scene.highContrast)
    if (scene.trebAim) this.#drawTrebAim(ctx, scene.trebAim, time, pixel, scene.highContrast)

    if (scene.clouds?.size) this.#drawClouds(ctx, scene.clouds, scene.worldTime ?? 0, time, animate)
    this.#drawFireLight(ctx, list, theme, time, animate, scene.catapults || [])
    scene.particles.viewWidth = camera.viewW
    // Défenseurs assommés (v6.0) : les particules empruntent le dessin des personnages.
    scene.particles.drawSprite ??= (c, key, state) => assets.draw(c, key, state)
    scene.particles.draw(ctx, pixel)

    if (scene.trajectory && scene.trajectory.length) this.#drawTrajectory(ctx, scene.trajectory, pixel, scene.highContrast)

    // Lumière de la scène et poussières d'ambiance (en coordonnées écran).
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.#drawGrade(ctx, camera, theme)
    if (animate !== false && !scene.highContrast) {
      const kind = moteKind(theme, THEMES[theme] ?? THEMES[1])
      if (kind) motes(ctx, kind, camera.viewW, camera.viewH, time, camera.x * camera.scale, glow)
    }
    // Vignette légère : resserre le regard sur la scène.
    ctx.fillStyle = this.#vignette(ctx, camera.viewW, camera.viewH)
    ctx.fillRect(0, 0, camera.viewW, camera.viewH)
  }

  /**
   * Lumière des feux (v5.7) : chaque objet qui brûle, chaque boulet enflammé
   * éclaire ce qui l'entoure (halo additif qui vacille). Bien plus marqué la
   * nuit, où les incendies deviennent les vraies sources de lumière.
   */
  #drawFireLight(ctx, list, theme, time, animate, engines = []) {
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
      const torch = e.kind === 'target' && e.torch && e.alive !== false && !(e.frozenMs > 0)
      const hot = e.alive !== false && (e.burning > 0 || (e.kind === 'projectile' && ((e.ignites && !e.hasImpacted) || e.heatMs > 0)))
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
   * Avaries visibles sur l'engin (v5.8), dans son repère : croûte de givre et
   * stalactites, fissures et éclats de bois, taches de rouille. (Le feu, lui,
   * vient des particules et de la lueur.)
   */
  #drawWear(ctx, c, time, animate, pixel) {
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
   * Points de vie de l'engin (v5.8) : barre au-dessus de lui, couleur qui
   * passe du vert au rouge, et une pastille par avarie (forme et couleur : la
   * couleur n'est jamais seule à porter l'information). Taille fixe à l'écran.
   */
  #drawEngineBar(ctx, c, pixel, highContrast, view) {
    const w = c.condition
    const f = ENGINE_FRAME[c.kind] ?? ENGINE_FRAME.catapult
    const px = Math.max(0.6, pixel)
    const bw = 110 * px
    const bh = 10 * px
    // Place des pastilles à droite (quatre au plus) : la barre ne sort jamais de l'écran.
    const tail = 4 * 22 * px + 10 * px
    const x = Math.max(view.left + 8 * px, Math.min(view.right - bw - tail, c.x - bw / 2))
    const y = c.y + f.y0 - 34 * px
    const ratio = Math.max(0, Math.min(1, w.hp))
    ctx.save()
    ctx.fillStyle = 'rgba(30,26,43,0.82)'
    ctx.beginPath()
    ctx.roundRect?.(x - 3 * px, y - 3 * px, bw + 6 * px, bh + 6 * px, 6 * px)
    if (!ctx.roundRect) ctx.rect(x - 3 * px, y - 3 * px, bw + 6 * px, bh + 6 * px)
    ctx.fill()
    ctx.fillStyle = highContrast ? '#ffd400' : ratio > 0.6 ? '#6fcf5b' : ratio > 0.3 ? '#f2c94c' : '#e2553b'
    ctx.fillRect(x, y, bw * ratio, bh)
    // Graduations tous les quarts : on lit vite « encore trois quarts ».
    ctx.fillStyle = 'rgba(30,26,43,0.6)'
    for (let k = 1; k < 4; k++) ctx.fillRect(x + (bw * k) / 4 - 0.5 * px, y, 1 * px, bh)
    // Pastilles d'avaries.
    const pips = []
    if (w.heat > 0) pips.push('fire')
    if (w.frozen) pips.push('frost')
    if (w.crack) pips.push('crack')
    if (w.rust) pips.push('rust')
    pips.forEach((kind, i) => this.#pip(ctx, x + bw + (14 + i * 22) * px, y + bh / 2, 9 * px, kind, w))
    ctx.restore()
  }

  #pip(ctx, x, y, r, kind, w) {
    const fill = { fire: '#e8742c', frost: '#7fc8f0', crack: '#8a6a4a', rust: '#a8552a' }[kind]
    ctx.fillStyle = 'rgba(30,26,43,0.85)'
    ctx.beginPath()
    ctx.arc(x, y, r + r * 0.25, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = fill
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#fff6dc'
    ctx.fillStyle = '#fff6dc'
    ctx.lineWidth = r * 0.22
    ctx.lineCap = 'round'
    ctx.beginPath()
    if (kind === 'fire') {
      // Flamme : plus haute avec l'intensité.
      const h = r * (0.5 + 0.18 * Math.min(3, Math.ceil(w.heat)))
      ctx.moveTo(x - r * 0.4, y + r * 0.45)
      ctx.quadraticCurveTo(x - r * 0.5, y - h * 0.3, x, y - h)
      ctx.quadraticCurveTo(x + r * 0.5, y - h * 0.3, x + r * 0.4, y + r * 0.45)
      ctx.closePath()
      ctx.fill()
    } else if (kind === 'frost') {
      for (let a = 0; a < 3; a++) {
        const t = (a * Math.PI) / 3
        ctx.moveTo(x - Math.cos(t) * r * 0.6, y - Math.sin(t) * r * 0.6)
        ctx.lineTo(x + Math.cos(t) * r * 0.6, y + Math.sin(t) * r * 0.6)
      }
      ctx.stroke()
    } else if (kind === 'crack') {
      ctx.moveTo(x - r * 0.15, y - r * 0.6)
      ctx.lineTo(x + r * 0.2, y - r * 0.1)
      ctx.lineTo(x - r * 0.2, y + r * 0.15)
      ctx.lineTo(x + r * 0.15, y + r * 0.6)
      ctx.stroke()
    } else {
      // Rouille : un boulon écaillé.
      ctx.arc(x, y, r * 0.38, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillRect(x + r * 0.25, y - r * 0.55, r * 0.22, r * 0.22)
    }
  }

  /**
   * Ouvrages des pillards (v5.8) : échelles dressées (montants et barreaux le
   * long de l'itinéraire), et chantiers en cours, en fantôme qui se construit.
   */
  #drawWorks(ctx, works, time, pixel) {
    if (!works?.length) return
    const px = Math.max(1, pixel)
    for (const w of works) {
      ctx.save()
      ctx.globalAlpha = w.building ? 0.45 + 0.15 * Math.sin(time / 160) : 1
      if (w.kind === 'ladder' && w.route) this.#ladder(ctx, w.route, w.progress, px)
      else if (w.kind === 'bridge' && w.span) {
        // Pont en chantier : les planches avancent depuis la berge.
        const len = (w.span.x1 - w.span.x0 + 32) * w.progress
        const x0 = w.span.x1 + 16 - len
        for (let x = x0; x < w.span.x1 + 16; x += 13) {
          ctx.fillStyle = '#9b7044'
          ctx.fillRect(x, WORLD.GROUND_Y - 3, 11, 10)
          ctx.strokeStyle = '#1e1a2b'
          ctx.lineWidth = px
          ctx.strokeRect(x, WORLD.GROUND_Y - 3, 11, 10)
        }
      }
      ctx.restore()
    }
  }

  /** Une échelle le long d'un itinéraire, construite jusqu'à `progress` (0..1). */
  #ladder(ctx, route, progress, px) {
    let total = 0
    for (let i = 1; i < route.length; i++) total += Math.hypot(route[i].x - route[i - 1].x, route[i].y - route[i - 1].y)
    let budget = total * Math.max(0, Math.min(1, progress))
    ctx.lineCap = 'round'
    for (let i = 1; i < route.length && budget > 0; i++) {
      const a = route[i - 1]
      const b = route[i]
      const seg = Math.hypot(b.x - a.x, b.y - a.y)
      const len = Math.min(seg, budget)
      budget -= len
      const ux = (b.x - a.x) / seg
      const uy = (b.y - a.y) / seg
      // Perpendiculaire : écart des montants.
      const nx = -uy * 7
      const ny = ux * 7
      const ex = a.x + ux * len
      const ey = a.y + uy * len
      for (const [w, col] of [[5 * px, '#1e1a2b'], [3 * px, '#9b7044']]) {
        ctx.strokeStyle = col
        ctx.lineWidth = w
        ctx.beginPath()
        ctx.moveTo(a.x + nx, a.y + ny)
        ctx.lineTo(ex + nx, ey + ny)
        ctx.moveTo(a.x - nx, a.y - ny)
        ctx.lineTo(ex - nx, ey - ny)
        ctx.stroke()
      }
      ctx.strokeStyle = '#7a5530'
      ctx.lineWidth = 2.2 * px
      ctx.beginPath()
      for (let d = 8; d < len; d += 14) {
        const x = a.x + ux * d
        const y = a.y + uy * d
        ctx.moveTo(x + nx, y + ny)
        ctx.lineTo(x - nx, y - ny)
      }
      ctx.stroke()
    }
  }

  /**
   * Pillards (v5.8) : un panneau « ! » au-dessus de ceux qui chargent l'engin,
   * qui rebondit doucement. On les repère d'un coup d'œil, même de loin.
   */
  #drawRaiders(ctx, list, time, animate, pixel) {
    const px = Math.max(1, pixel)
    for (const e of list) {
      if (e.kind !== 'target' || !e.raiding || e.alive === false) continue
      const bob = animate === false ? 0 : Math.sin(time / 140 + e.id) * 3 * px
      const x = e.x
      const y = e.y - e.height / 2 - 22 * px + bob
      const s = 11 * px
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(x, y - s)
      ctx.lineTo(x + s, y + s * 0.8)
      ctx.lineTo(x - s, y + s * 0.8)
      ctx.closePath()
      ctx.fillStyle = '#e2553b'
      ctx.fill()
      ctx.lineWidth = 2 * px
      ctx.strokeStyle = '#1e1a2b'
      ctx.stroke()
      ctx.fillStyle = '#fff6dc'
      ctx.fillRect(x - 1.4 * px, y - s * 0.45, 2.8 * px, s * 0.75)
      ctx.fillRect(x - 1.4 * px, y + s * 0.42, 2.8 * px, 2.8 * px)
      ctx.restore()
    }
  }

  /**
   * Mécanismes (v6.0) : cordes de chanvre (légèrement détendues, torsadées),
   * chaînes de fer (maillons alternés), boulons des charnières.
   */
  #drawTethers(ctx, view, pixel) {
    if (!view || (!view.links.length && !view.hinges.length)) return
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const l of view.links) {
      if (l.kind === 'chain') {
        const len = Math.hypot(l.bx - l.ax, l.by - l.ay)
        const n = Math.max(2, Math.round(len / 7))
        const a = Math.atan2(l.by - l.ay, l.bx - l.ax)
        for (let i = 0; i < n; i++) {
          const u = (i + 0.5) / n
          ctx.save()
          ctx.translate(l.ax + (l.bx - l.ax) * u, l.ay + (l.by - l.ay) * u)
          ctx.rotate(a)
          ctx.beginPath()
          // Un maillon sur deux de face (anneau), l'autre de profil (barrette).
          if (i % 2) ctx.rect(-4.2, -0.9, 8.4, 1.8)
          else ctx.ellipse(0, 0, 4.6, 2.6, 0, 0, Math.PI * 2)
          ctx.lineWidth = 2.6
          ctx.strokeStyle = '#2b2d33'
          ctx.stroke()
          ctx.lineWidth = 1.3
          ctx.strokeStyle = '#9aa1ad'
          ctx.stroke()
          ctx.restore()
        }
        continue
      }
      // Corde : un léger ventre quand elle a du mou, une torsade sombre.
      const mx = (l.ax + l.bx) / 2
      const my = (l.ay + l.by) / 2 + Math.min(18, l.slack * 0.6)
      const path = () => {
        ctx.beginPath()
        ctx.moveTo(l.ax, l.ay)
        ctx.quadraticCurveTo(mx, my, l.bx, l.by)
      }
      path()
      ctx.lineWidth = 4.4
      ctx.strokeStyle = '#3a2614'
      ctx.stroke()
      path()
      ctx.lineWidth = 2.8
      ctx.strokeStyle = '#b08a55'
      ctx.stroke()
      path()
      ctx.setLineDash([2.2, 3.2])
      ctx.lineWidth = 2.8
      ctx.strokeStyle = 'rgba(70,46,22,0.75)'
      ctx.stroke()
      ctx.setLineDash([])
      if (l.stub) {
        // Bout effiloché de la corde tranchée.
        ctx.lineWidth = 1
        ctx.strokeStyle = '#8a6a40'
        for (const d of [-2.5, 0, 2.5]) {
          ctx.beginPath()
          ctx.moveTo(l.bx, l.by)
          ctx.lineTo(l.bx + d, l.by + 5)
          ctx.stroke()
        }
      }
    }
    for (const h of view.hinges) {
      ctx.beginPath()
      ctx.arc(h.x, h.y, 4.2, 0, Math.PI * 2)
      ctx.fillStyle = '#4b515b'
      ctx.fill()
      ctx.lineWidth = 1.4 * Math.max(1, pixel)
      ctx.strokeStyle = '#1e1a2b'
      ctx.stroke()
    }
    ctx.restore()
  }

  /**
   * Généraux (v6.0) : leurs vies en cœurs au-dessus de la tête. Le cœur qu'il
   * vient de perdre enfle puis se vide pendant qu'il se relève.
   */
  #drawGenerals(ctx, list, time, animate, pixel) {
    const px = Math.max(1, pixel)
    for (const e of list) {
      if (e.kind !== 'target' || e.type !== 'general' || e.alive === false) continue
      const n = e.maxLives
      const s = 5.5 * px
      const step = s * 2.4
      const x0 = e.x - ((n - 1) * step) / 2
      const y = e.y - e.height / 2 - 16 * px
      const lost = e.guardMs > 0 ? 1 - e.guardMs / GUARD_MS : 1
      for (let i = 0; i < n; i++) {
        const full = i < e.lives
        const fresh = i === e.lives && lost < 1
        const k = fresh && animate !== false ? 1 + 0.5 * Math.sin(lost * Math.PI) : 1
        this.#heart(ctx, x0 + i * step, y, s * k, full || (fresh && lost < 0.6), px)
      }
    }
  }

  /**
   * Nuages (v6.1) : des volutes douces qui tournent lentement (poison vert,
   * miasmes ternes, farine blanche) ; ils s'estompent avant de disparaître.
   */
  #drawClouds(ctx, clouds, worldTime, time, animate) {
    const spin = animate === false ? 0 : time / 2400
    for (const c of clouds.list) {
      const r = clouds.radiusAt(c, worldTime)
      const alpha = clouds.alphaAt(c, worldTime)
      const rgb = CLOUD_KINDS[c.kind]?.rgb ?? '200,200,200'
      // Essaim : des abeilles qui tournoient, pas une nappe.
      if (c.kind === 'bees') {
        ctx.save()
        ctx.fillStyle = `rgba(${rgb},${0.95 * alpha})`
        const t = animate === false ? 0 : time / 1000
        for (let i = 0; i < 26; i++) {
          const a = i * 2.39996 + t * (1.5 + (i % 5) * 0.4)
          const d = r * (0.25 + ((i * 37) % 70) / 100)
          ctx.beginPath()
          ctx.arc(c.x + Math.cos(a) * d, c.y + Math.sin(a * 1.31) * d * 0.7, 2.2, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.restore()
        continue
      }
      ctx.save()
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + spin * (i % 2 ? 1 : -1)
        const d = i === 6 ? 0 : r * 0.42
        const x = c.x + Math.cos(a) * d
        const y = c.y + Math.sin(a) * d * 0.7
        const rr = r * (i === 6 ? 0.75 : 0.55)
        const g = ctx.createRadialGradient(x, y, rr * 0.1, x, y, rr)
        g.addColorStop(0, `rgba(${rgb},${0.42 * alpha})`)
        g.addColorStop(1, `rgba(${rgb},0)`)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x, y, rr, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }
  }

  /**
   * Barres de vie (v6.1) : au-dessus de chaque défenseur blessé, et toujours
   * sous les cœurs d'un général. Taille constante à l'écran ; un cran tous
   * les 10 points de vie ; la part qui vient d'être perdue reste blanche un
   * instant, puis fond (affichage seulement).
   */
  #drawHealth(ctx, list, worldTime, pixel) {
    const px = Math.max(1, pixel)
    for (const e of list) {
      if (e.kind !== 'target' || e.alive === false || !Number.isFinite(e.maxHp)) continue
      const general = e.type === 'general'
      const hp = Math.max(0, e.hp)
      // Retard d'affichage : la barre blanche rattrape la vie réelle en ~0,4 s.
      const lag = e.barLag === undefined || e.barLag < hp ? hp : Math.max(hp, e.barLag - e.maxHp * 0.025)
      e.barLag = lag
      if (!general && hp >= e.maxHp - 0.5 && lag >= e.maxHp - 0.5) continue
      const w = (general ? 34 : 26) * px
      const h = 4.5 * px
      const top = general ? e.y - e.height / 2 - 9 * px : e.body.bounds.min.y - 10 * px
      const x0 = e.x - w / 2
      const k = hp / e.maxHp
      const poisoned = worldTime < (e.poisonUntil ?? 0)
      ctx.save()
      ctx.fillStyle = 'rgba(20,16,30,0.78)'
      ctx.beginPath()
      roundRect(ctx, x0 - px, top - px, w + 2 * px, h + 2 * px, 2.5 * px)
      ctx.fill()
      if (lag > hp) {
        ctx.fillStyle = 'rgba(255,248,232,0.9)'
        ctx.fillRect(x0 + w * k, top, w * ((lag - hp) / e.maxHp), h)
      }
      ctx.fillStyle = poisoned ? '#9be05a' : k > 0.6 ? '#6fd36a' : k > 0.3 ? '#f2c14e' : '#e5534b'
      ctx.fillRect(x0, top, w * k, h)
      ctx.fillStyle = 'rgba(255,255,255,0.28)'
      ctx.fillRect(x0, top, w * k, h * 0.4)
      // Crans : tous les 10 points (50 au-delà de 120), pour compter les coups.
      const notch = e.maxHp > 120 ? 50 : 10
      ctx.fillStyle = 'rgba(20,16,30,0.55)'
      for (let v = notch; v < e.maxHp - 0.5; v += notch) ctx.fillRect(x0 + (w * v) / e.maxHp - 0.5 * px, top, px, h)
      ctx.restore()
    }
  }

  #heart(ctx, x, y, s, full, px) {
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(x, y + s * 0.9)
    ctx.bezierCurveTo(x - s * 1.3, y + s * 0.1, x - s * 1.1, y - s * 1, x, y - s * 0.35)
    ctx.bezierCurveTo(x + s * 1.1, y - s * 1, x + s * 1.3, y + s * 0.1, x, y + s * 0.9)
    ctx.closePath()
    ctx.fillStyle = full ? '#e2453b' : 'rgba(30,26,43,0.55)'
    ctx.fill()
    ctx.lineWidth = 1.6 * px
    ctx.strokeStyle = full ? '#1e1a2b' : 'rgba(255,246,220,0.85)'
    ctx.stroke()
    if (full) {
      ctx.beginPath()
      ctx.arc(x - s * 0.45, y - s * 0.25, s * 0.22, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.fill()
    }
    ctx.restore()
  }

  /**
   * Étendard (v5.8) : un cercle d'or pâle au pied de chaque défenseur
   * galvanisé, qui pulse doucement. On voit d'un coup d'œil qui il protège.
   * Cri de guerre d'un général (v6.0) : un cercle rouge qui bat plus vite.
   */
  #drawAuras(ctx, list, time, animate, pixel) {
    const k = animate === false ? 0.5 : 0.5 + 0.5 * Math.sin(time / 380)
    const fast = animate === false ? 0.5 : 0.5 + 0.5 * Math.sin(time / 150)
    ctx.save()
    ctx.lineWidth = 2.4 * Math.max(1, pixel)
    for (const e of list) {
      if (e.kind !== 'target' || e.alive === false) continue
      const feet = e.y + e.height / 2
      if (e.aura > 1 || e.type === 'bannerman') {
        ctx.globalAlpha = e.type === 'bannerman' ? 0.75 : 0.35 + 0.35 * k
        ctx.strokeStyle = '#f2c94c'
        ctx.beginPath()
        ctx.ellipse(e.x, feet - 1, e.width * 0.75 + k * 3, 5 + k, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      if (e.buff > 1) {
        ctx.globalAlpha = 0.45 + 0.4 * fast
        ctx.strokeStyle = '#ff6a3d'
        ctx.beginPath()
        ctx.ellipse(e.x, feet - 1, e.width * 0.9 + fast * 4, 6 + fast, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
    ctx.restore()
  }

  /**
   * Étalonnage de la lumière (repère écran) : le jour, une lumière chaude
   * descend de l'astre sur la scène ; la nuit, un voile froid assombrit le
   * haut de l'image. Dégradés mis en cache (ils ne changent qu'au redimensionnement).
   */
  #gradeCache = { key: '', fill: null, mode: 'source-over' }
  #drawGrade(ctx, camera, theme) {
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
   * Trébuchet (v5.4) : fanion planté au point d'impact, courbe du tir en
   * direct pendant la jauge, et cadran de la jauge au-dessus de l'engin
   * (de la cloche au tir tendu). Tailles en pixels d'écran (`pixel` = 1 / zoom).
   */
  #drawTrebAim(ctx, a, time, pixel, highContrast) {
    const px = Math.max(0.6, pixel)
    const gold = highContrast ? '#ffd400' : '#e8b62c'
    const light = highContrast ? '#ffd400' : '#fff6dc'
    const col = a.reachable ? gold : '#8b8b8b'
    ctx.save()
    ctx.lineCap = 'round'
    // Courbe du tir : des points de plus en plus fins ; grisée si la cible est hors de portée.
    if (a.path?.length) {
      const n = a.path.length
      for (let i = 0; i < n; i++) {
        const p = a.path[i]
        const k = i / n
        ctx.globalAlpha = a.phase === 'fired' ? 0.45 : 1 - k * 0.45
        ctx.beginPath()
        ctx.arc(p.x, p.y, (4.2 - k * 1.6) * px, 0, Math.PI * 2)
        ctx.fillStyle = a.reachable ? light : '#b9b9b9'
        ctx.fill()
        ctx.lineWidth = 1.4 * px
        ctx.strokeStyle = '#1e1a2b'
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    }
    this.#drawFlag(ctx, a.x, a.y, col, px, time, a.reachable)
    if (a.phase === 'power' || a.phase === 'fired') this.#drawGaugeDial(ctx, a, px, gold, light)
    ctx.restore()
  }

  /** Fanion-cible : anneaux au sol, mât et flamme ; croix rouge si hors de portée. */
  #drawFlag(ctx, x, y, col, px, time, reachable) {
    const r = 15 * px
    ctx.lineWidth = 2.5 * px
    ctx.strokeStyle = 'rgba(30,26,43,0.55)'
    ctx.beginPath()
    ctx.ellipse(x, y, r + 2 * px, (r + 2 * px) * 0.42, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = col
    ctx.beginPath()
    ctx.ellipse(x, y, r, r * 0.4, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(x, y, r * 0.42, r * 0.17, 0, 0, Math.PI * 2)
    ctx.stroke()
    const top = y - 46 * px
    ctx.strokeStyle = '#4a3420'
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x, top)
    ctx.stroke()
    const wave = Math.sin(time / 160) * 2 * px
    ctx.fillStyle = col
    ctx.strokeStyle = 'rgba(30,26,43,0.7)'
    ctx.lineWidth = 1.5 * px
    ctx.beginPath()
    ctx.moveTo(x, top)
    ctx.quadraticCurveTo(x + 12 * px, top + 3 * px + wave, x + 24 * px, top + 7 * px)
    ctx.quadraticCurveTo(x + 12 * px, top + 11 * px + wave, x, top + 15 * px)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    if (!reachable) {
      ctx.strokeStyle = '#c0392b'
      ctx.lineWidth = 3 * px
      ctx.beginPath()
      ctx.moveTo(x - 9 * px, y - 9 * px)
      ctx.lineTo(x + 9 * px, y + 9 * px)
      ctx.moveTo(x + 9 * px, y - 9 * px)
      ctx.lineTo(x - 9 * px, y + 9 * px)
      ctx.stroke()
    }
  }

  /**
   * Cadran de la jauge : un quart de cercle de l'arc le plus tendu à la
   * cloche, une aiguille qui va et vient, et deux pictogrammes (sans texte,
   * lisibles dans toutes les langues) : arc haut = cloche, trait plat = tendu.
   */
  #drawGaugeDial(ctx, a, px, gold, light) {
    const { x, y } = a.origin
    const R = 72 * px
    const lob = (TREB_TUNING.LOB_ANGLE * Math.PI) / 180
    const flat = (TREB_TUNING.FLAT_ANGLE * Math.PI) / 180
    const at = (rad, r) => ({ x: x + Math.cos(rad) * r, y: y - Math.sin(rad) * r })
    // Fond du cadran.
    ctx.fillStyle = 'rgba(30,26,43,0.55)'
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.arc(x, y, R + 10 * px, -lob - 0.08, -flat + 0.08)
    ctx.closePath()
    ctx.fill()
    // Graduation : dégradé de la cloche (bleu) au tendu (rouge).
    const steps = 24
    for (let i = 0; i < steps; i++) {
      const u0 = i / steps
      const u1 = (i + 1) / steps
      const r0 = lob + (flat - lob) * u0
      const r1 = lob + (flat - lob) * u1
      ctx.strokeStyle = `hsl(${210 - 200 * u0}, 70%, 58%)`
      ctx.lineWidth = 8 * px
      ctx.lineCap = 'butt'
      ctx.beginPath()
      ctx.arc(x, y, R, -r0, -r1, false)
      ctx.stroke()
    }
    ctx.lineCap = 'round'
    // Aiguille : arc du moment.
    const rad = (a.angle * Math.PI) / 180
    const tip = at(rad, R + 6 * px)
    ctx.strokeStyle = a.phase === 'fired' ? gold : light
    ctx.lineWidth = 3.5 * px
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(tip.x, tip.y)
    ctx.stroke()
    ctx.fillStyle = a.phase === 'fired' ? gold : light
    ctx.beginPath()
    ctx.arc(tip.x, tip.y, 6 * px, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#1e1a2b'
    ctx.lineWidth = 1.5 * px
    ctx.stroke()
    // Pictogrammes : cloche (arc haut) côté haut, tendu (trait) côté bas.
    const icon = (rad0, draw) => {
      const c = at(rad0, R + 26 * px)
      ctx.save()
      ctx.translate(c.x, c.y)
      ctx.strokeStyle = light
      ctx.lineWidth = 2.5 * px
      ctx.beginPath()
      draw()
      ctx.stroke()
      ctx.restore()
    }
    icon(lob + 0.05, () => {
      ctx.moveTo(-10 * px, 6 * px)
      ctx.quadraticCurveTo(0, -18 * px, 10 * px, 6 * px)
    })
    icon(flat - 0.08, () => {
      ctx.moveTo(-10 * px, 2 * px)
      ctx.quadraticCurveTo(0, -4 * px, 12 * px, 2 * px)
    })
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

  /**
   * Repère d'élément sur la courbe de visée (v6.1) : une pastille de la couleur
   * de l'élément, avec son signe (flocon, flamme, éclair, grains de sable).
   */
  #elementMark(ctx, x, y, element, pixel) {
    const px = Math.max(1, pixel)
    const r = 11 * px
    const color = { frost: '#bfe6ff', fire: '#ffb347', charge: '#cfe8ff', sand: '#e2c48c' }[element] ?? '#ffffff'
    ctx.save()
    ctx.globalAlpha = 0.95
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(20,16,30,0.82)'
    ctx.fill()
    ctx.lineWidth = 2 * px
    ctx.strokeStyle = color
    ctx.stroke()
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = 1.6 * px
    ctx.lineCap = 'round'
    ctx.beginPath()
    if (element === 'frost') {
      for (let k = 0; k < 3; k++) {
        const a = (k * Math.PI) / 3
        ctx.moveTo(x - Math.cos(a) * r * 0.6, y - Math.sin(a) * r * 0.6)
        ctx.lineTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6)
      }
      ctx.stroke()
    } else if (element === 'fire') {
      ctx.moveTo(x, y - r * 0.65)
      ctx.quadraticCurveTo(x + r * 0.55, y, x, y + r * 0.55)
      ctx.quadraticCurveTo(x - r * 0.55, y, x, y - r * 0.65)
      ctx.fill()
    } else if (element === 'charge') {
      ctx.moveTo(x + r * 0.15, y - r * 0.65)
      ctx.lineTo(x - r * 0.3, y + r * 0.05)
      ctx.lineTo(x + r * 0.2, y + r * 0.05)
      ctx.lineTo(x - r * 0.15, y + r * 0.65)
      ctx.stroke()
    } else {
      for (const [dx, dy] of [[-0.35, -0.2], [0.3, -0.3], [0, 0.25], [-0.25, 0.4], [0.35, 0.3]]) {
        ctx.moveTo(x + dx * r + 1.5 * px, y + dy * r)
        ctx.arc(x + dx * r, y + dy * r, 1.5 * px, 0, Math.PI * 2)
      }
      ctx.fill()
    }
    ctx.restore()
  }

  #drawTrajectory(ctx, points, pixel, highContrast) {
    const n = points.length
    for (let i = 0; i < n; i++) {
      const p = points[i]
      // Repère du souffle du monde (v6.1) : ici, le vent marque le tir.
      if (p.mark) {
        this.#elementMark(ctx, p.x, p.y, p.mark, pixel)
        continue
      }
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
