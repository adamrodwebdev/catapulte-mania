import { Renderer } from '../rendering/Renderer.js'
import { Camera } from '../rendering/Camera.js'
import { ParticleSystem } from '../effects/ParticleSystem.js'
import { StructureBuilder } from '../levels/StructureBuilder.js'
import { Block } from '../entities/Block.js'
import { Target } from '../entities/Target.js'
import { Barrel } from '../entities/Barrel.js'
import { WORLD } from '../physics/constants.js'
import { buildInto, PARTS, ZONE, surfaceAt } from './CastleDesign.js'

/**
 * Vue de l'atelier de châteaux : le château dessiné avec les mêmes visuels
 * que le jeu (aucune physique : la construction est immobile), la zone
 * constructible et la silhouette de la pièce sur le point d'être posée.
 */
export class EditorView {
  #canvas
  #renderer
  #camera = new Camera()
  #particles = new ParticleSystem()
  #entities = []
  #theme = 1
  #ghost = null

  constructor(canvas, assets) {
    this.#canvas = canvas
    this.#renderer = new Renderer(canvas, assets)
    this.#camera.follow = false
    this.#camera.shakeEnabled = false
    this.#camera.setFocus(ZONE.left - 120, ZONE.right + 80, ZONE.top - 60)
  }

  resize() {
    const r = this.#canvas.getBoundingClientRect()
    this.#renderer.resize(Math.max(1, r.width), Math.max(1, r.height), globalThis.devicePixelRatio || 1)
    this.#camera.resize(Math.max(1, r.width), Math.max(1, r.height))
    this.render()
  }

  setDesign(design) {
    const b = new StructureBuilder()
    buildInto(b, design)
    this.#entities = [...b.blocks.map((x) => new Block(x)), ...b.barrels.map((x) => new Barrel(x)), ...b.targets.map((x) => new Target(x))]
    this.#theme = design.theme
    this.render()
  }

  /** Coordonnées monde d'un point de l'écran (pointeur). */
  toWorld(clientX, clientY) {
    const r = this.#canvas.getBoundingClientRect()
    return this.#camera.screenToWorld(clientX - r.left, clientY - r.top)
  }

  /** Silhouette de la pièce à poser en x (ou null pour l'effacer). */
  ghost(design, kind, x) {
    if (!kind || kind === 'erase' || !PARTS[kind]) {
      this.#ghost = null
    } else {
      const def = PARTS[kind]
      const cx = Math.round(Math.min(ZONE.right - def.w / 2, Math.max(ZONE.left + def.w / 2, x)) / 10) * 10
      const y = surfaceAt(design, kind, cx)
      this.#ghost = { x: cx, y, w: def.w, h: def.h, ok: y - def.h >= ZONE.top }
    }
    this.render()
  }

  render() {
    const cam = this.#camera
    cam.update(1000)
    this.#renderer.render({ camera: cam, entities: this.#entities, particles: this.#particles, trajectory: null, theme: this.#theme, time: 0, animate: false, catapults: [], versus: true, wind: null })
    const ctx = this.#canvas.getContext('2d')
    const dpr = this.#renderer.dpr
    cam.apply(ctx, dpr)
    const px = 1 / cam.scale
    // Zone constructible : pointillés au sol et plafond.
    ctx.save()
    ctx.setLineDash([12 * px, 10 * px])
    ctx.lineWidth = 2 * px
    ctx.strokeStyle = 'rgba(30,26,43,0.45)'
    ctx.strokeRect(ZONE.left, ZONE.top, ZONE.right - ZONE.left, WORLD.GROUND_Y - ZONE.top)
    ctx.setLineDash([])
    const g = this.#ghost
    if (g) {
      ctx.fillStyle = g.ok ? 'rgba(246,217,138,0.35)' : 'rgba(163,50,43,0.3)'
      ctx.strokeStyle = g.ok ? '#d4a537' : '#a3322b'
      ctx.lineWidth = 3 * px
      ctx.fillRect(g.x - g.w / 2, g.y - g.h, g.w, g.h)
      ctx.strokeRect(g.x - g.w / 2, g.y - g.h, g.w, g.h)
    }
    ctx.restore()
  }
}
