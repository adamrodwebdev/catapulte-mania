import { EventBus } from '../core/utils/EventBus.js'
import { clamp } from '../core/utils/math.js'
import { GameSession, STATE } from './GameSession.js'
import { AssetRegistry } from './assets/AssetRegistry.js'
import { Renderer } from './rendering/Renderer.js'
import { WORLD } from './physics/constants.js'
import { ReplayPlayer } from './replay/ReplayPlayer.js'
import { AimInput } from './aim/AimInput.js'
import { BALLISTA_AIM } from './Ballista.js'
import { AIM } from './aim.js'

const TAP_MAX_MS = 320

/** Le registre de visuels est partagé entre les niveaux (chargé une seule fois). */
let sharedAssets = null
export async function assets() {
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
 * Événements émis : `hud`, `caption` { key, side }, `announce` { key, params }, `end`, `pause`,
 * `aimed` (visée modifiée au doigt ou à la souris).
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
  /** Relâcher après avoir tiré vers l'arrière déclenche le tir (sauf « visée précise »). */
  #releaseToFire = true
  #hudTimer = 0
  /** Durée moyenne d'une image (ms), pour alléger les effets sur un appareil lent. */
  #frameAvg = 16.7
  #handlers = {}
  /** Relecture d'une partie (« Bats mon tir ») : le joueur regarde, les commandes sont coupées. */
  #replayer = null
  /** Visée au geste et au clavier (v5.2, voir aim/AimInput.js). */
  #aim = null
  /** Pointeurs posés (un second doigt = mode précision). */
  #pointers = new Set()

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

  constructor(canvas, level, { difficulty, completedLevels, settings, reducedMotion, audio, haptics, effects, mode, continueOffer = false, engine = 'catapult', replay = null, season = null }, registry) {
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
      screams: settings.screams !== false,
      startPower: settings.startPower,
      effects,
      continueOffer,
      engine,
      slowSwing: settings.slowSwing === true,
      infiniteSwing: settings.infiniteSwing === true,
      replay: Array.isArray(replay),
      season,
    }, mode)
    if (Array.isArray(replay)) this.#replayer = new ReplayPlayer(this.session, replay)
    const bounds = this.session.engine === 'ballista' ? BALLISTA_AIM : AIM
    this.#aim = new AimInput({ minAngle: bounds.MIN_ANGLE, maxAngle: bounds.MAX_ANGLE, dir: this.session.catapult.dir })
    this.#aim.set(this.session.catapult.angle, this.session.catapult.power)
    this.#releaseToFire = settings.preciseAim !== true
    const focus = this.session.focus
    this.session.camera.setFocus(focus.left, focus.right, focus.top)
    this.session.on('hud', (h) => this.emit('hud', h))
    this.session.on('announce', (a) => this.emit('announce', a))
    this.session.on('end', (e) => this.emit('end', e))
    this.session.on('turn', (e) => this.emit('turn', e))
    this.session.on('offer', (e) => this.emit('offer', e))
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
    // Les niveaux de premiers pas gardent la trajectoire visible quel que soit le réglage.
    this.session.options.trajectoryAid = settings.trajectoryAid || this.session.assist
    this.#releaseToFire = settings.preciseAim !== true
    this.session.options.reducedMotion = reducedMotion
    this.session.camera.shakeEnabled = settings.screenShake && !reducedMotion
    this.session.options.blood = settings.blood
    this.session.options.screams = settings.screams !== false
    this.session.options.startPower = settings.startPower
    if (this.session.engine === 'trebuchet') {
      this.session.infiniteSwing = settings.infiniteSwing === true && this.session.difficulty !== 'hard'
      for (const p of this.session.players) {
        p.catapult.setSlow(settings.slowSwing === true)
        p.catapult.setInfinite(this.session.infiniteSwing)
      }
    }
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
      // Appareil qui peine (moins de ~45 images/s en continu) : moins de particules.
      this.#frameAvg = this.#frameAvg * 0.97 + Math.min(dt, 100) * 0.03
      if (this.#frameAvg > 22 && this.session.particles.density > 0.55) this.session.particles.density = 0.55
      if (!this.#paused) {
        if (this.#replayer && !this.#replayer.done) this.#replayer.advance(dt)
        else this.session.update(dt)
        this.#tickAim(dt)
      }
      this.#renderer.render(this.#sceneWithAim())
      this.#hudTimer += dt
      // En vol (et en visée quand le vent souffle en rafales), le HUD suit en continu.
      const live = this.session.state === STATE.FLYING || (this.session.state === STATE.AIMING && this.session.world.windField.dynamic)
      if (this.#hudTimer > (this.session.armed ? 50 : 180) && live) {
        this.#hudTimer = 0
        this.emit('hud', this.session.hud)
      }
    }
    this.#raf = requestAnimationFrame(frame)
    this.emit('hud', this.session.hud)
  }

  #sceneWithAim() {
    const scene = this.session.scene()
    if (this.session.state === STATE.AIMING && this.session.engine !== 'trebuchet') {
      const c = this.session.catapult
      const bounds = this.session.engine === 'ballista' ? BALLISTA_AIM : AIM
      scene.aim = {
        ...c.launchPoint, angle: c.angle, power: c.power, dir: c.dir,
        min: bounds.MIN_ANGLE, max: bounds.MAX_ANGLE,
        // Dernier tir de ce joueur (repères fantômes) et état du geste.
        last: this.session.lastShot,
        ...this.aimState,
      }
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

  /**
   * Commande « au clic » (bouton Tirer, Espace, clic sur la scène au trébuchet).
   * Le temps écoulé depuis la dernière image est transmis : le lâcher de la
   * fronde correspond à l'instant exact du clic, pas à l'image suivante.
   * @returns {'fired' | 'armed' | 'released' | 'split' | false}
   */
  /** Une relecture est-elle en cours ? */
  get replaying() {
    return this.#replayer !== null && !this.#replayer.done
  }

  trigger() {
    if (this.#paused || this.#replayer) return false
    this.#audio.unlock()
    const ammo = this.session.selectedAmmo
    const r = this.session.trigger(performance.now() - this.#last)
    if (r) this.emit('trigger', { result: r, ammo })
    return r
  }

  /* ---------- Saisie ---------- */

  #bindInput() {
    const cv = this.#canvas
    const down = (e) => {
      this.session.skipIntro()
      this.#audio.unlock()
      if (this.#paused || this.#replayer) return
      // Trébuchet : tout se joue au clic, dès l'appui (1er : balancier, 2e : lâcher).
      if (this.session.engine === 'trebuchet') {
        if (e.button === 0 || e.pointerType !== 'mouse') this.trigger()
        return
      }
      this.#pointers.add(e.pointerId)
      // Un second doigt pendant la visée : mode précision.
      if (this.#drag) return
      cv.setPointerCapture?.(e.pointerId)
      this.#drag = { id: e.pointerId, t: performance.now() }
      const p = this.#local(e)
      this.#syncAim()
      this.#aim.dir = this.session.catapult.dir
      this.#aim.begin(p.x, p.y, e.timeStamp || performance.now(), { w: cv.clientWidth, h: cv.clientHeight })
    }
    const move = (e) => {
      const d = this.#drag
      if (!d || d.id !== e.pointerId || this.session.state !== STATE.AIMING) return
      const p = this.#local(e)
      const r = this.#aim.move(p.x, p.y, e.timeStamp || performance.now(), { fine: e.shiftKey || this.#pointers.size > 1 })
      if (r.changed) this.emit('aimed')
      if (r.ticks) this.#aimTick()
    }
    const up = (e) => {
      this.#pointers.delete(e.pointerId)
      const d = this.#drag
      if (!d || d.id !== e.pointerId) return
      this.#drag = null
      const r = this.#aim.end()
      const tap = !r.moved && performance.now() - d.t < TAP_MAX_MS
      if (tap && this.session.state === STATE.FLYING) this.session.activate()
      if (!r.moved || this.session.state !== STATE.AIMING) return
      // Ce qui part est exactement ce qui est affiché (valeurs au pas).
      this.session.aim(this.#aim.target.angle, this.#aim.target.power)
      if (r.cancel) {
        this.emit('announce', { key: 'a11y.aimCancel' })
        this.emit('caption', { key: 'aimCancel', side: 'left' })
        return
      }
      this.emit('announce', { key: 'a11y.aim', params: { angle: this.#aim.target.angle, power: Math.round(this.#aim.target.power * 1000) / 10 } })
      // Comme une fronde : on tire vers l'arrière, on relâche, ça part.
      // (Visée précise : on règle au doigt puis on appuie sur « Tirer ».)
      if (r.fire && this.#releaseToFire) this.trigger()
    }
    const wheel = (e) => {
      if (this.#paused || this.#replayer || this.session.state !== STATE.AIMING || this.session.engine === 'trebuchet') return
      e.preventDefault()
      this.#syncAim()
      if (this.#aim.wheel(e.deltaY, { angle: e.shiftKey })) {
        this.session.aim(this.#aim.target.angle, this.#aim.target.power)
        this.emit('aimed')
      }
    }
    const cancel = (e) => {
      this.#pointers.delete(e?.pointerId)
      if (this.#drag && (!e || e.pointerId === this.#drag.id)) {
        this.#drag = null
        this.#aim.abort()
        this.session.aim(this.#aim.target.angle, this.#aim.target.power)
      }
    }
    const visibility = () => {
      if (document.hidden) this.pause()
    }
    this.#handlers = { down, move, up, cancel, visibility, wheel }
    cv.addEventListener('pointerdown', down)
    cv.addEventListener('pointermove', move)
    cv.addEventListener('pointerup', up)
    cv.addEventListener('pointercancel', cancel)
    cv.addEventListener('wheel', wheel, { passive: false })
    document.addEventListener('visibilitychange', visibility)
  }

  /** Position du pointeur dans le canevas (px CSS). */
  #local(e) {
    const r = this.#canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  /** La visée a pu changer ailleurs (curseurs, début de tour) : on s'y recale. */
  #syncAim() {
    const c = this.session.catapult
    const t = this.#aim.target
    if (Math.abs(c.angle - t.angle) > 1e-6 || Math.abs(c.power - t.power) > 1e-6) this.#aim.set(c.angle, c.power)
  }

  /** Image par image : touches maintenues et lissage de la visée affichée. */
  #tickAim(dt) {
    if (this.session.engine === 'trebuchet' || this.#replayer) return
    if (!this.#drag && !this.#aim.keysHeld) this.#syncAim()
    const r = this.#aim.tick(dt)
    if (r.ticks) this.#aimTick()
    if (r.changed && this.session.state === STATE.AIMING) {
      const v = this.#drag || this.#aim.keysHeld ? this.#aim.display : this.#aim.target
      this.session.aim(v.angle, v.power)
      if (this.#aim.keysHeld) this.emit('aimed')
    }
  }

  /** Repère discret tous les 5° / 10 % : léger clic et micro-vibration. */
  #aimTick() {
    this.#audio.play('tick', { intensity: 0.25 })
    this.#haptics.pulse('tick')
  }

  /**
   * Clavier (v5.2) : flèches maintenues, avec accélération ; Maj pour la précision.
   * @param {'left'|'right'|'up'|'down'} key
   * @param {boolean} down appui ou relâcher
   * @param {boolean} [fine]
   */
  aimKey(key, down, fine = false) {
    if (this.#paused || this.#replayer || this.session.engine === 'trebuchet') return
    this.session.skipIntro()
    if (down) {
      if (this.session.state !== STATE.AIMING) return
      this.#syncAim()
      this.#aim.keyDown(key, fine)
    } else {
      this.#aim.keyUp(key)
      if (this.session.state === STATE.AIMING) {
        this.session.aim(this.#aim.target.angle, this.#aim.target.power)
        this.emit('announce', { key: 'a11y.aim', params: { angle: this.#aim.target.angle, power: Math.round(this.#aim.target.power * 1000) / 10 } })
      }
    }
  }

  /** État de la visée pour le dessin (geste, précision, annulation). */
  get aimState() {
    const a = this.#aim
    if (!a || !this.#drag || !a.dragging) return { dragging: false, fine: a?.fine ?? false }
    const cam = this.session.camera
    const anchor = cam.screenToWorld(a.anchor.x, a.anchor.y)
    const pointer = cam.screenToWorld(a.pointer.x, a.pointer.y)
    return { dragging: true, fine: a.fine, cancelling: a.cancelling, anchor, pointer }
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
    cv.removeEventListener('wheel', h.wheel)
    document.removeEventListener('visibilitychange', h.visibility)
    this.session.destroy()
    this.clear()
  }
}
