import { WindLayer } from './WindLayer.js'
import { BackgroundArt } from './BackgroundArt.js'
import { BACKGROUND_ART } from '../assets/backgrounds.js'
import { drawAim, drawTrebAim, drawTrajectory } from './AimPainter.js'
import { WorldHudPainter } from './WorldHudPainter.js'
import { EnginePainter, drawGoldGlints, drawRangeArrows } from './EnginePainter.js'
import { drawStructure } from './StructurePainter.js'
import { drawAuras, drawCharged, drawFrost, drawKeystone, drawRedHot, drawSnowball } from './StatusOverlayPainter.js'
import { drawClouds } from './CloudPainter.js'
import { LightingPainter } from './LightingPainter.js'
import { BackdropPainter } from './BackdropPainter.js'
import { BoltHeadings, viewExtra } from './EntityViewAdapter.js'
import { ParticlePainter } from '../effects/ParticlePainter.js'
import { edgeBeacons } from './TargetBeacons.js'
import { drawEdgeBadge, drawLastDefender } from './BeaconPainter.js'

/**
 * Rendu Canvas 2D de la scène.
 * Ordre de dessin : ciel → chaînes lointaines (parallaxe 0,2) → collines (0,45)
 * → haies et camp (0,75) → sol → structures → cibles → projectiles → vent →
 * catapulte → lumière des feux → particules → aide à la trajectoire →
 * lumière de la scène, poussières d'ambiance et vignette (repère écran).
 * Toute la partie graphique passe par l'AssetRegistry.
 *
 * v6.2 : `render()` ne fait plus qu'orchestrer, dans cet ordre, des peintres qui
 * ont chacun leur part du dessin (décor, lumière, engins, ouvrages et jonctions,
 * états, repères au-dessus des têtes, visée, particules). Les règles du jeu sont
 * lues sur les entités ; les mémoires d'une image à l'autre (barres de vie,
 * vitesse du bras, vigilance des personnages, cap des carreaux) restent ici.
 */
export class Renderer {
  /** @type {CanvasRenderingContext2D} */
  #ctx
  #canvas
  #assets
  #wind = new WindLayer()
  /** Engins de siège : dessin, avaries, vitesse du bras (v6.2, voir EnginePainter.js). */
  #engines = new EnginePainter()
  /** Repères au-dessus des personnages et de l'engin, barres de vie (v6.2, voir WorldHudPainter.js). */
  #hud = new WorldHudPainter()
  /** Ombres, lueur des feux, étalonnage, poussières, vignette (v6.2, voir LightingPainter.js). */
  #lighting = new LightingPainter()
  /** Ciel, plans du décor, fond peint, sol, terrains (v6.2, voir BackdropPainter.js). */
  #backdrop = new BackdropPainter()
  /** Particules (v6.2, voir effects/ParticlePainter.js). */
  #particles = new ParticlePainter()
  /** Défenseurs assommés (v6.0) : les particules empruntent le dessin des personnages. */
  #drawSprite = (c, key, state) => this.#assets.draw(c, key, state)
  /** Mémoire des personnages dessinés par ce rendu (v6.2) : leur vigilance lissée, d'une image à l'autre. */
  #poses = new Map()
  /** Cap des carreaux de baliste (v6.2) : gardé quand ils ne font plus que trembler. */
  #bolts = new BoltHeadings()
  /** Fonds peints des chapitres (v6.2, voir BackgroundArt.js). */
  art
  dpr = 1

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('../assets/AssetRegistry.js').AssetRegistry} assets
   * @param {{ artFadeMs?: number }} [opts] fondu d'apparition des fonds peints (v6.2 : 0 pour une vue immobile)
   */
  constructor(canvas, assets, { artFadeMs = 350 } = {}) {
    this.#canvas = canvas
    this.#ctx = canvas.getContext('2d', { alpha: false })
    this.#assets = assets
    this.art = new BackgroundArt(BACKGROUND_ART, { fadeMs: artFadeMs })
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
   * @param {object[]} scene.catapults engins { kind, x, y, dir, armAngle, rig, load, loadRadius, skin, condition… }
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

    // Décor : ciel, plans en parallaxe ou fond peint, haies et camp, sol, saison, terrains (v6.2, voir BackdropPainter.js).
    this.#backdrop.draw(ctx, scene, this.art, assets, this.dpr, pixel)

    const order = { block: 0, barrel: 1, target: 2, projectile: 3, flyer: 4 }
    const list = [...scene.entities].sort((a, b) => order[a.kind] - order[b.kind])
    this.#lighting.drawShadows(ctx, list.filter((e) => e.kind !== 'flyer'), scene.catapults || [])
    drawAuras(ctx, list, time, animate, pixel)
    // Un projectile en vol : les défenseurs lèvent les yeux (animation seulement).
    const alert = list.some((e) => e.kind === 'projectile' && !e.hasImpacted && e.alive !== false)
    // Ce que les adaptateurs de vue lisent de l'image (v6.2, voir EntityViewAdapter.js).
    const frame = { time, worldTime: scene.worldTime ?? 0, animate, alert, theme }
    let worksDrawn = false
    for (const e of list) {
      // Échelles des pillards (v5.8) : devant la roche, derrière les défenseurs qui y grimpent.
      if (!worksDrawn && e.kind !== 'block' && e.kind !== 'barrel') {
        drawStructure(ctx, scene, time, pixel)
        worksDrawn = true
      }
      ctx.save()
      ctx.translate(e.x, e.y)
      ctx.rotate(e.angle)
      if (e.kind === 'flyer') ctx.rotate(-e.angle)
      // Carreau de baliste : pointé dans le sens de sa course (v6.2 : cap gardé une fois arrêté).
      if (e.bolt) ctx.rotate(this.#bolts.of(e) - e.angle)
      // Général intouchable (v6.0) : il pulse doucement le temps de se relever (voilé, sans pulsation, en mouvement réduit).
      if (e.guardMs > 0) ctx.globalAlpha = animate === false ? 0.6 : 0.6 + 0.4 * Math.cos(time / 53)
      assets.draw(ctx, e.assetKey, {
        w: e.width, h: e.height, vertices: e.localVertices, shape: e.shape, damage: e.damageRatio,
        burning: e.burning > 0, time, seed: e.id, pixel,
        extra: viewExtra(e, frame), memory: this.#poses,
      })
      // Clé de voûte (v6.2) : sa lézarde et son liseré chaud, dans le repère du bloc.
      if (e.keystone && e.kind === 'block') drawKeystone(ctx, e, time, animate, pixel)
      // Combos (v6.2) : fer rougi, fer électrisé.
      if (e.redHotAt?.(frame.worldTime)) drawRedHot(ctx, e, e.redHotLeft(frame.worldTime) / 1500, time, animate, pixel)
      if (e.chargedAt?.(frame.worldTime)) drawCharged(ctx, e, time, animate, pixel)
      // Gelé, ou givré en vol par la bise (v6.1).
      if (e.frozenMs > 0 || e.rimed) drawFrost(ctx, e, time, pixel)
      if (e.kind === 'projectile' && e.snowScale > 1.04) drawSnowball(ctx, e, pixel)
      ctx.restore()
    }

    if (!worksDrawn) drawStructure(ctx, scene, time, pixel)
    // Panaches (v6.2) : le vent arrache neige, sable ou poussière au sommet des grandes montagnes.
    this.#backdrop.drawPeakPlumes(ctx, list, scene)
    // Vent : traînées, manche à air, fanion du château.
    if (scene.wind) this.#wind.draw(ctx, scene.wind, pixel)

    // Portée des archers (v6.2) : des flèches plantées au sol, là où l'engin s'arrête.
    if (scene.drive) drawRangeArrows(ctx, scene.drive, pixel)
    // Catapultes (une en solo, deux en face-à-face ; celle de droite est dessinée en miroir).
    for (const c of scene.catapults || []) {
      ctx.save()
      ctx.translate(c.x, c.y)
      if (c.dir === -1) ctx.scale(-1, 1)
      // v6.2 : il se cabre en démarrant, pique du nez en freinant (sur la roue qui reste au sol).
      if (c.tilt && animate !== false) {
        const pivot = c.tilt < 0 ? -58 : 58
        ctx.translate(pivot, 0)
        ctx.rotate(c.tilt)
        ctx.translate(-pivot, 0)
      }
      this.#engines.draw(ctx, c, assets, pixel, time, animate)
      if (c.condition) this.#engines.drawWear(ctx, c, time, animate, pixel)
      // Engin d'or (v6.2) : quelques éclats qui scintillent sur le bois doré.
      if (c.skin === 'gold' && animate !== false) drawGoldGlints(ctx, c.kind, time)
      ctx.restore()
    }
    // Bornes visibles du monde : la barre de l'engin reste toujours à l'écran.
    const view = { left: camera.screenToWorld(0, 0).x, right: camera.screenToWorld(camera.viewW, 0).x }
    for (const c of scene.catapults || []) if (c.condition?.show) this.#hud.drawEngineBar(ctx, c, pixel, scene.highContrast, view, time, animate)
    this.#hud.drawRaiders(ctx, list, time, animate, pixel)
    this.#hud.drawGenerals(ctx, list, time, animate, pixel)
    if (scene.healthBars !== false) this.#hud.drawHealth(ctx, list, scene.worldTime ?? 0, time, animate, pixel, scene.highContrast)
    // Repères (v6.2) : le chevron d'or du dernier défenseur debout, où qu'il soit.
    const lastId = scene.beacons?.lastId ?? null
    const last = lastId === null ? null : list.find((e) => e.id === lastId && e.alive !== false)
    if (last) drawLastDefender(ctx, last, { px: Math.max(1, pixel), time, animate: animate !== false, highContrast: scene.highContrast })

    // Viseur un peu plus petit sur les écrans bas (téléphone à l'horizontale).
    if (scene.aim) drawAim(ctx, scene.aim, pixel * Math.max(0.72, Math.min(1, camera.viewH / 720)), scene.highContrast)
    if (scene.trebAim) drawTrebAim(ctx, scene.trebAim, time, pixel, scene.highContrast)

    if (scene.clouds?.size) drawClouds(ctx, scene.clouds, scene.worldTime ?? 0, time, animate)
    this.#lighting.drawFireLight(ctx, list, theme, time, animate, scene.catapults || [])
    // Particules : la largeur de la vue borne les titres ; les annonces (v6.2) montent
    // dans la bande de ciel sous le bandeau du haut.
    this.#particles.draw(ctx, scene.particles.items, pixel, camera.viewW, camera.screenToWorld(0, camera.insetTop + 24).y, this.#drawSprite)

    if (scene.trajectory && scene.trajectory.length) drawTrajectory(ctx, scene.trajectory, pixel, scene.highContrast)

    // Lumière de la scène et poussières d'ambiance (en coordonnées écran).
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.#lighting.drawGrade(ctx, camera, theme)
    if (animate !== false && !scene.highContrast) this.#lighting.drawMotes(ctx, camera, theme, time)
    // Vignette légère : resserre le regard sur la scène.
    this.#lighting.drawVignette(ctx, camera.viewW, camera.viewH)
    // Repères (v6.2) : pendant la visée, une pastille au bord droit de l'écran pour qui en atteint la marge, ou passe au-delà.
    if (scene.beacons?.edges) {
      for (const badge of edgeBeacons(list, camera, { lastId })) drawEdgeBadge(ctx, badge, { viewW: camera.viewW, time, animate: animate !== false, highContrast: scene.highContrast })
    }
  }
}
