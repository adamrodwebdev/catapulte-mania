import { SKY_CHAPTERS } from './skyConfig.js'
import { fallsMask, findStars, findSun, grassMask, isSnow, isWater, lavaMask, rayMasks, spotsWhere } from './paintingAnalysis.js'
import { maskCanvas } from './skySprites.js'
import { LivingSky } from './LivingSky.js'
import { SeededRandom } from '../../core/utils/SeededRandom.js'

/**
 * Ce qu'on a lu dans les peintures, partagé par toutes les parties : chapitre →
 * lecture prête, 'pending' en cours, ou null (pas de ciel). Seuls les deux
 * derniers chapitres lus sont gardés (leurs masques pèsent quelques Mo).
 */
const READINGS = new Map()
const KEEP = 2

function remember(chapter, value) {
  READINGS.delete(chapter)
  READINGS.set(chapter, value)
  for (const key of READINGS.keys()) {
    if (READINGS.size <= KEEP) break
    if (READINGS.get(key) !== 'pending') READINGS.delete(key)
  }
}

/**
 * Ciels vivants (v6.3) : un ciel par chapitre peint, prêt quand sa peinture a
 * été lue (voir paintingAnalysis.js). La lecture se fait en quelques étapes,
 * chacune dans un moment libre du navigateur (aucun à-coup pendant
 * l'introduction du niveau) ; jusque-là, la peinture reste simplement fixe.
 * Chaque partie a ses propres ciels (leur temps, leurs particules) ; la lecture
 * des peintures, elle, est partagée. Navigateur seulement (canevas).
 */
export class SkyLibrary {
  /** chapitre → ciel de cette partie. */
  #skies = new Map()

  /**
   * Le ciel du chapitre s'il est prêt ; sinon sa lecture commence (ou continue).
   * @param {number} chapter
   * @param {HTMLImageElement} img la peinture, chargée
   * @param {number} ground sa ligne de sol (part de la hauteur)
   * @returns {LivingSky | null}
   */
  for(chapter, img, ground) {
    const sky = this.#skies.get(chapter)
    if (sky) return sky
    const reading = READINGS.get(chapter)
    if (reading === undefined) read(chapter, img, ground)
    if (!reading || reading === 'pending') return null
    const made = new LivingSky(chapter, SKY_CHAPTERS[chapter], reading, { img })
    this.#skies.set(chapter, made)
    return made
  }
}

/** Lit une peinture, étape par étape, dans les moments libres du navigateur. */
function read(chapter, img, ground) {
  const cfg = SKY_CHAPTERS[chapter]
  if (!cfg || typeof document === 'undefined') {
    remember(chapter, null)
    return
  }
  remember(chapter, 'pending')
  const steps = readSteps(cfg, img, ground)
  const idle = globalThis.requestIdleCallback ?? ((fn) => setTimeout(fn, 16))
  const next = () => {
    try {
      const step = steps.queue.shift()
      if (step) {
        step()
        idle(next, { timeout: 600 })
        return
      }
      remember(chapter, steps.data)
    } catch (error) {
      // Une lecture qui échoue laisse la peinture fixe, sans gêner la partie.
      console.warn('[Catapulte Mania] ciel vivant indisponible', chapter, error?.message ?? error)
      remember(chapter, null)
    }
  }
  idle(next, { timeout: 600 })
}

/** Un masque pleine taille ramené à demi-résolution (les rayons sont flous : la moitié suffit). */
function half(canvas) {
  const c = document.createElement('canvas')
  c.width = Math.ceil(canvas.width / 2)
  c.height = Math.ceil(canvas.height / 2)
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height)
  return c
}

/** Les pixels de la peinture, ramenée à `w` px de large. */
function pixels(img, w) {
  const h = Math.round((img.height * w) / img.width)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d', { willReadFrequently: true })
  g.drawImage(img, 0, 0, w, h)
  return { w, h, data: g.getImageData(0, 0, w, h).data }
}

/** Éclair : la peinture elle-même, gardée dans le ciel (fondu vers le bas), pour illuminer ses nuages. */
function flashLayer(img, ground) {
  const w = 1280
  const h = Math.round((img.height * w) / img.width)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  g.drawImage(img, 0, 0, w, h)
  g.globalCompositeOperation = 'destination-in'
  const gr = g.createLinearGradient(0, 0, 0, h * ground)
  gr.addColorStop(0, 'rgba(0,0,0,1)')
  gr.addColorStop(0.55, 'rgba(0,0,0,0.85)')
  gr.addColorStop(0.8, 'rgba(0,0,0,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, w, h)
  return c
}

/** Les étapes de lecture d'une peinture, selon les effets de son chapitre. */
function readSteps(cfg, img, ground) {
  const has = (fx) => cfg.fx.includes(fx)
  const data = {}
  const queue = []
  let big = null
  let small = null
  const px = () => (big ??= pixels(img, 1280))
  const pxSmall = () => (small ??= pixels(img, 640))
  if (has('stars')) {
    const rand = new SeededRandom(7)
    queue.push(() => (data.stars = findStars(px(), ground, () => rand.next())))
  }
  if (has('lightning')) queue.push(() => (data.flash = flashLayer(img, ground)))
  if (has('lava')) {
    queue.push(() => {
      const m = lavaMask(px())
      data.lava = maskCanvas(m.rgba, m.w, m.h)
      data.spots = m.spots
    })
  }
  if (cfg.sun) queue.push(() => (data.sun = findSun(pxSmall(), cfg.sun.at)))
  if (has('rays')) {
    queue.push(() => {
      const m = rayMasks(px(), data.sun, cfg.sun.tint, cfg.sun)
      if (!m) return
      // Masques à demi-résolution : les trois secteurs (scintillement), ou réunis (lumière qui file).
      const layers = m.layers.map((rgba) => half(maskCanvas(rgba, m.w, m.h)))
      let canvases = layers
      let merged = null
      if (cfg.sun.stream) {
        merged = document.createElement('canvas')
        merged.width = layers[0].width
        merged.height = layers[0].height
        const mg = merged.getContext('2d')
        for (const layer of layers) mg.drawImage(layer, 0, 0)
        canvases = []
      }
      data.rays = { w: m.w, h: m.h, reach: m.reach, box: m.box, canvases, merged }
    })
  }
  if (has('gusts')) {
    queue.push(() => {
      const m = grassMask(px(), cfg.gusts)
      data.grass = { canvas: maskCanvas(m.rgba, m.w, m.h), w: m.w, h: m.h, top: m.top }
    })
  }
  if (has('ripples')) {
    queue.push(() => {
      const { from, to, areas } = cfg.water
      data.water = spotsWhere(pxSmall(), { from, to }, isWater).filter((p) => areas.some(([u0, v0, u1, v1]) => p.u >= u0 && p.u <= u1 && p.v >= v0 && p.v <= v1))
    })
  }
  if (has('glints')) queue.push(() => (data.snow = spotsWhere(pxSmall(), cfg.snow, isSnow)))
  if (has('fireflies')) queue.push(() => (data.hill = spotsWhere(pxSmall(), cfg.hill, (l) => l <= cfg.hill.maxLum)))
  if (has('falls')) {
    queue.push(() => {
      const m = fallsMask(px(), cfg.falls.box)
      data.falls = { w: m.w, x0: m.x0, y0: m.y0, bw: m.bw, bh: m.bh, mask: maskCanvas(m.rgba, m.bw, m.bh) }
    })
  }
  // Les pixels lus ne servent plus : on les rend à la mémoire.
  queue.push(() => {
    big = null
    small = null
  })
  return { data, queue }
}
