import { EventBus } from '../core/utils/EventBus.js'
import { clamp, toDeg } from '../core/utils/math.js'
import { GameSession, STATE } from './GameSession.js'
import { AssetRegistry } from './assets/AssetRegistry.js'
import { Renderer } from './rendering/Renderer.js'
import { WORLD } from './physics/constants.js'

const TAP_MAX_PX = 12
const TAP_MAX_MS = 320

/** Le registre de visuels est partagé entre les niveaux (chargé une seule fois). */
let sharedAssets = null
async function assets() {
  if (!sharedAssets) {
    sharedAssets = new AssetRegistry()
    await sharedAssets.preload()
  }
  return sharedAssets
}

/**
 * Pont entre la partie (GameSession) et le navigateur :
 * boucle d'animation, canvas, redimensionnement, saisie tactile/souris,
 * audio, vibrations, mise en pause automatique.
 *
 * Événements émis : `hud`, `caption` { key, side }, `announce` { key, params }, `end`, `pause`.
 */
export class GameController extends EventBus {
  /** @type {GameSession} */
  session
  #canvas
  #renderer
  #audio
  #haptics
  #raf = 0
  #last = 0
  #paused = false
  #resizeObs = null
  #drag = null
  #hudTimer = 0
  #handlers = {}

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} level niveau du LevelRepository
   * @param {object} opts { difficulty, completedLevels, settings, reducedMotion, audio, haptics }
   */
  static async create(canvas, level, opts) {
    const c = new GameController(canvas, level, opts, await assets())
    c.#start()
    return c
  }

  constructor(canvas, level, { difficulty, completedLevels, settings, reducedMotion, audio, haptics, effects, mode }, registry) {
    super()
    this.#canvas = canvas
    this.#audio = audio
    this.#haptics = haptics
    this.#renderer = new Renderer(canvas, registry)
    this.session = new GameSession(level, {
      difficulty,
      completedLevels,
      trajectoryAid: settings.trajectoryAid,
      reducedMotion,
      screenShake: settings.screenShake,
      blood: settings.blood,
      startPower: settings.startPower,
      effects,
    }, mode)
    this.session.camera.setFocus(level.focus.left, level.focus.right, level.focus.top)
    this.session.on('hud', (h) => this.emit('hud', h))
    this.session.on('announce', (a) => this.emit('announce', a))
    this.session.on('end', (e) => this.emit('end', e))
    this.session.on('turn', (e) => this.emit('turn', e))
    this.session.on('feedback', (f) => this.#feedback(f))
  }

  /** Place occupée par le HUD (px CSS), mesurée par l'interface. */
  setInsets(top, bottom) {
    this.session.camera.setInsets(Number(top), Number(bottom))
  }

  get paused() {
    return this.#paused
  }

  /** Met à jour les options en cours de partie. */
  applySettings(settings, reducedMotion) {
    this.session.options.trajectoryAid = settings.trajectoryAid
    this.session.options.reducedMotion = reducedMotion
    this.session.camera.shakeEnabled = settings.screenShake && !reducedMotion
    this.session.options.blood = settings.blood
    this.session.options.startPower = settings.startPower
    this.session.camera.follow = !reducedMotion
    this.session.particles.density = reducedMotion ? 0.35 : 1
  }

  pause() {
    if (this.#paused) return
    this.#paused = true
    this.emit('pause', true)
  }

  resume() {
    if (!this.#paused) return
    this.#paused = false
    this.#last = performance.now()
    this.emit('pause', false)
  }

  /* ---------- Boucle ---------- */

  #start() {
    this.#resize()
    this.#resizeObs = new ResizeObserver(() => this.#resize())
    this.#resizeObs.observe(this.#canvas)
    this.#bindInput()
    this.#last = performance.now()
    const frame = (now) => {
      this.#raf = requestAnimationFrame(frame)
      const dt = now - this.#last
      this.#last = now
      if (!this.#paused) this.session.update(dt)
      this.#renderer.render(this.#sceneWithAim())
      this.#hudTimer += dt
      if (this.#hudTimer > 180 && this.session.state === STATE.FLYING) {
        this.#hudTimer = 0
        this.emit('hud', this.session.hud)
      }
    }
    this.#raf = requestAnimationFrame(frame)
    this.emit('hud', this.session.hud)
  }

  #sceneWithAim() {
    const scene = this.session.scene()
    if (this.session.state === STATE.AIMING) {
      const c = this.session.catapult
      scene.aim = { ...c.launchPoint, angle: c.angle, power: c.power, dir: c.dir }
    }
    return scene
  }

  #resize() {
    const rect = this.#canvas.getBoundingClientRect()
    const w = Math.max(1, rect.width)
    const h = Math.max(1, rect.height)
    this.#renderer.resize(w, h, globalThis.devicePixelRatio || 1)
    const { insetTop, insetBottom } = this.session.camera
    this.session.camera.resize(w, h)
    this.session.camera.setInsets(insetTop, insetBottom)
  }

  /* ---------- Saisie ---------- */

  #bindInput() {
    const cv = this.#canvas
    const down = (e) => {
      this.#audio.unlock()
      if (this.#paused) return
      cv.setPointerCapture?.(e.pointerId)
      this.#drag = {
        id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: false,
        angle: this.session.catapult.angle, power: this.session.catapult.power,
      }
    }
    const move = (e) => {
      const d = this.#drag
      if (!d || d.id !== e.pointerId || this.session.state !== STATE.AIMING) return
      // On tire vers l'arrière, comme une fronde (inversé pour la catapulte de droite).
      const dx = (d.x - e.clientX) * this.session.catapult.dir
      const dy = e.clientY - d.y
      const len = Math.hypot(dx, dy)
      if (len < TAP_MAX_PX && !d.moved) return
      d.moved = true
      const rect = cv.getBoundingClientRect()
      const span = Math.min(rect.width, rect.height) * 0.42
      const angle = dx <= 0 && dy <= 0 ? d.angle : toDeg(Math.atan2(Math.max(dy, 0), Math.max(dx, 0.0001)))
      this.session.aim(angle, clamp(len / span, 0, 1))
    }
    const up = (e) => {
      const d = this.#drag
      this.#drag = null
      if (!d || d.id !== e.pointerId) return
      const tap = !d.moved && performance.now() - d.t < TAP_MAX_MS
      if (tap && this.session.state === STATE.FLYING) this.session.activate()
      if (d.moved) this.emit('announce', { key: 'a11y.aim', params: { angle: Math.round(this.session.catapult.angle), power: Math.round(this.session.catapult.power * 100) } })
    }
    const cancel = () => (this.#drag = null)
    const visibility = () => {
      if (document.hidden) this.pause()
    }
    this.#handlers = { down, move, up, cancel, visibility }
    cv.addEventListener('pointerdown', down)
    cv.addEventListener('pointermove', move)
    cv.addEventListener('pointerup', up)
    cv.addEventListener('pointercancel', cancel)
    document.addEventListener('visibilitychange', visibility)
  }

  /* ---------- Retours sensoriels ---------- */

  #feedback({ sound, x = WORLD.WIDTH / 2, intensity = 1, caption, haptic }) {
    const cam = this.session.camera
    const sx = cam.worldToScreen(x, 0).x
    const pan = clamp((sx / cam.viewW) * 2 - 1, -1, 1)
    if (sound) this.#audio.play(sound, { pan: pan * 0.8, intensity })
    if (haptic) this.#haptics.pulse(haptic)
    if (caption) this.emit('caption', { key: caption, side: pan < -0.33 ? 'left' : pan > 0.33 ? 'right' : 'center' })
  }

  destroy() {
    cancelAnimationFrame(this.#raf)
    this.#resizeObs?.disconnect()
    const cv = this.#canvas
    const h = this.#handlers
    cv.removeEventListener('pointerdown', h.down)
    cv.removeEventListener('pointermove', h.move)
    cv.removeEventListener('pointerup', h.up)
    cv.removeEventListener('pointercancel', h.cancel)
    document.removeEventListener('visibilitychange', h.visibility)
    this.session.destroy()
    this.clear()
  }
}
