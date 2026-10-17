import { WORLD } from '../physics/constants.js'
import { spindrift } from '../assets/procedural/mountains.js'
import { PAINTED_PLUMES } from '../assets/procedural/palette.js'

/**
 * Fonds peints (v6.2) : une image par chapitre (voir assets/backgrounds.js),
 * chargée à la demande (seule celle du chapitre en cours) et dessinée en repère
 * écran derrière la partie :
 *
 * - elle couvre toute la vue ; sa ligne de sol (`ground`, part de la hauteur de
 *   l'image) se pose sur le sol du monde, la couture cachée sous l'herbe (à
 *   défaut, son horizon se cale un peu au-dessus du sol), et elle défile
 *   lentement avec la caméra (parallaxe) ;
 * - elle apparaît en fondu (pas de saut entre le décor dessiné et la peinture),
 *   sauf là où rien ne bouge (v6.2 : l'atelier, `fadeMs` 0, la montre d'un coup) ;
 * - le vent arrache des panaches à ses sommets (points donnés par le manifeste,
 *   en part de la largeur et de la hauteur de l'image).
 *
 * Tant qu'elle n'est pas prête (ou sans image pour ce chapitre), le décor
 * procédural est dessiné à la place.
 */
export class BackgroundArt {
  /** @type {Record<number, { url: string, horizon?: number, peaks?: Array<{x:number,y:number,kind?:string}> }>} */
  #manifest
  #entries = new Map()
  /** Durée du fondu d'apparition (ms) ; 0 : d'un coup. */
  #fadeMs

  /**
   * @param {Record<number, object>} manifest chapitre → { url, horizon, peaks }
   * @param {{ fadeMs?: number }} [opts] durée du fondu d'apparition (v6.2)
   */
  constructor(manifest = {}, { fadeMs = 350 } = {}) {
    this.#manifest = { ...manifest }
    this.#fadeMs = fadeMs
  }

  /** Ajoute ou remplace le fond d'un chapitre (outils, essais). */
  add(chapter, meta) {
    this.#manifest[chapter] = meta
    this.#entries.delete(chapter)
  }

  /** Commence à charger le fond d'un chapitre (avant même qu'on le dessine). */
  preload(chapter) {
    this.#entry(chapter)
  }

  /**
   * Le fond d'un chapitre est-il chargé (v6.2) ? Pour redessiner une vue immobile
   * (l'atelier) dès qu'il arrive.
   * @returns {Promise<boolean>} vrai une fois l'image prête ; faux sans image ou en cas d'échec
   */
  whenReady(chapter) {
    return this.#entry(chapter)?.loaded ?? Promise.resolve(false)
  }

  #entry(chapter) {
    const meta = this.#manifest[chapter]
    if (!meta || typeof Image === 'undefined') return null
    let e = this.#entries.get(chapter)
    if (!e) {
      e = { img: new Image(), meta, ready: false, failed: false, shownAt: null, loaded: null }
      e.img.decoding = 'async'
      e.loaded = new Promise((resolve) => {
        e.img.onload = () => resolve((e.ready = true))
        e.img.onerror = () => {
          e.failed = true
          resolve(false)
        }
      })
      e.img.src = meta.url
      this.#entries.set(chapter, e)
    }
    return e
  }

  /**
   * Le fond peint du chapitre, s'il est prêt (sinon il se charge et l'on dessine le décor procédural).
   * @returns {{ img: HTMLImageElement, meta: object, alpha: number } | null}
   */
  ready(chapter, time) {
    const e = this.#entry(chapter)
    if (!e?.ready || e.failed) return null
    e.shownAt ??= time
    return { img: e.img, meta: e.meta, alpha: this.#fadeMs > 0 ? Math.min(1, (time - e.shownAt) / this.#fadeMs) : 1 }
  }

  /**
   * Dessine le fond peint en repère écran.
   * @param {CanvasRenderingContext2D} ctx (transformation : pixels CSS de la vue)
   * @param {{ img: HTMLImageElement, meta: object, alpha: number }} art
   * @param {import('./Camera.js').Camera} camera
   * @param {{ parallax?: number }} [opts]
   * @returns {{ x0: number, y0: number, w: number, h: number }} placement (pour les panaches)
   */
  draw(ctx, art, camera, { parallax = 0.12 } = {}) {
    const { img, meta } = art
    const viewW = camera.viewW
    const viewH = camera.viewH
    const groundY = camera.worldToScreen(0, WORLD.GROUND_Y).y
    // Ligne de sol peinte posée sur le sol du monde (un peu dessous : la couture se cache
    // sous l'herbe) ; sinon, l'horizon de la peinture un peu au-dessus du sol.
    const grounded = Number.isFinite(meta.ground)
    const horizon = grounded ? meta.ground : (meta.horizon ?? 0.6)
    const horizonY = grounded ? groundY + 6 : groundY - viewH * 0.16
    // Assez grande pour couvrir la vue, du haut de l'écran au sol, avec de quoi défiler.
    let scale = Math.max(grounded ? 0 : viewH / img.height, (viewW * 1.15) / img.width, horizonY / (img.height * horizon))
    let w = img.width * scale
    let h = img.height * scale
    let y0 = horizonY - horizon * h
    if (y0 > 0) {
      // Pas assez haute pour atteindre le haut de l'écran : on l'agrandit encore.
      scale *= (horizonY / (horizon * h)) * 1.02
      w = img.width * scale
      h = img.height * scale
      y0 = horizonY - horizon * h
    }
    if (y0 + h < groundY) y0 = groundY - h
    const pan = (camera.x - WORLD.WIDTH / 2) * camera.scale * parallax
    const x0 = Math.max(viewW - w, Math.min(0, (viewW - w) / 2 - pan))
    ctx.save()
    ctx.globalAlpha = art.alpha
    ctx.drawImage(img, x0, y0, w, h)
    ctx.restore()
    return { x0, y0, w, h }
  }

  /**
   * Panaches que le vent arrache aux sommets de la peinture (neige, sable, poussière).
   * @param {CanvasRenderingContext2D} ctx (repère écran)
   */
  plumes(ctx, art, placed, { time, wind, animate }) {
    const peaks = art.meta.peaks
    if (!peaks?.length) return
    const byKind = new Map()
    for (const p of peaks) {
      const kind = p.kind ?? 'snow'
      if (!byKind.has(kind)) byKind.set(kind, [])
      byKind.get(kind).push({ x: placed.x0 + p.x * placed.w, y: placed.y0 + p.y * placed.h, seed: Math.round(p.x * 997 + p.y * 131) })
    }
    const s = placed.h / 1000
    for (const [kind, list] of byKind) {
      // Teinte de la matière (voir palette.js) ; une matière inconnue : la neige, moins dense.
      const tint = PAINTED_PLUMES[kind]
      spindrift(ctx, list, { time, wind, rgb: (tint ?? PAINTED_PLUMES.snow).rgb, animate, reach: 260 * s, size: 1.4 * s, alpha: (tint?.alpha ?? 0.45) * art.alpha })
    }
  }
}
