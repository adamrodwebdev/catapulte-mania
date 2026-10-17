import { WORLD } from '../physics/constants.js'
import { drawLake, drawLava } from '../assets/procedural/liquids.js'
import { spindrift } from '../assets/procedural/mountains.js'
import { THEMES } from '../assets/procedural/themes.js'
import { PEAK_PLUMES } from '../assets/procedural/palette.js'

/**
 * Décor (v6.2, sorti du Renderer) : ciel, chaînes lointaines et collines en
 * parallaxe, ou le fond peint du chapitre (voir BackgroundArt.js) ; haies et
 * camp ; sol et décor de saison ; terrains (lacs, glace, lave, neige) ; et les
 * panaches que le vent arrache aux grandes montagnes du niveau.
 */
export class BackdropPainter {
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

  /**
   * Du ciel au sol, puis les terrains. Commence en repère écran, finit en repère du monde.
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} scene (voir Renderer#render)
   * @param {import('./BackgroundArt.js').BackgroundArt} backgroundArt fonds peints
   * @param {import('../assets/AssetRegistry.js').AssetRegistry} assets
   * @param {number} dpr
   * @param {number} pixel taille d'un pixel écran en unités monde
   */
  draw(ctx, scene, backgroundArt, assets, dpr, pixel) {
    const { camera, theme, time, animate } = scene
    const windBase = scene.wind?.field.base ?? 0
    const skyState = { w: camera.viewW, h: camera.viewH, extra: { theme, viewW: camera.viewW, viewH: camera.viewH, time, animate, wind: windBase } }
    // Fond peint du chapitre (v6.2) quand il est prêt ; sinon (ou pendant son fondu), le décor dessiné.
    const art = backgroundArt.ready(theme, time)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (!art || art.alpha < 1) {
      assets.draw(ctx, 'scene.sky', skyState)
      // Plans du décor : plus ils sont loin, moins ils défilent (v5.7).
      camera.apply(ctx, dpr, 0.2)
      assets.draw(ctx, 'scene.distant', { w: WORLD.WIDTH, h: 600, pixel, extra: { theme, time, animate, wind: windBase } })
      camera.apply(ctx, dpr, 0.45)
      assets.draw(ctx, 'scene.far', { w: WORLD.WIDTH, h: 400, pixel, extra: { theme, castle: !scene.versus, time, animate, wind: windBase } })
    }
    if (art) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const placed = backgroundArt.draw(ctx, art, camera)
      backgroundArt.plumes(ctx, art, placed, { time, wind: windBase, animate: animate !== false })
      assets.draw(ctx, 'scene.sky', { ...skyState, extra: { ...skyState.extra, overlay: true } })
    }
    camera.apply(ctx, dpr, 0.75)
    // v6.2 : bosquets et arbres s'effacent au rythme du fondu de la peinture (hier, dès son premier instant).
    assets.draw(ctx, 'scene.near', { w: WORLD.WIDTH, h: 200, pixel, extra: { theme, versus: Boolean(scene.versus), art: art ? art.alpha : 0 } })

    camera.apply(ctx, dpr)
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
  }

  /**
   * Panaches (v6.2) : le vent arrache neige, sable ou poussière au sommet des
   * grandes montagnes du niveau (repère du monde).
   */
  drawPeakPlumes(ctx, list, scene) {
    const { theme, time, animate } = scene
    const peaks = list.filter((e) => e.mountainPeak).map((e) => ({ x: e.x, y: e.y - (e.height * 2) / 3 + 4, seed: e.id * 37 }))
    if (peaks.length) {
      // Neige, sable ou poussière, selon l'habit de la roche du chapitre (voir themes.js).
      const tint = PEAK_PLUMES[THEMES[theme]?.rock ?? 'dust']
      spindrift(ctx, peaks, { time, wind: scene.wind?.field.base ?? 0, rgb: tint.rgb, animate: animate !== false, reach: 230, size: 1.05, alpha: tint.alpha })
    }
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
}
