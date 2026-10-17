import { EventBus } from '../core/utils/EventBus.js'
import { clamp } from '../core/utils/math.js'
import { GameSession, STATE } from './GameSession.js'
import { AssetRegistry } from './assets/AssetRegistry.js'
import { Renderer } from './rendering/Renderer.js'
import { WORLD } from './physics/constants.js'
import { ReplayPlayer } from './replay/ReplayPlayer.js'
import { AimInput } from './aim/AimInput.js'
import { TREB_TUNING, TrebuchetInput } from './aim/TrebuchetInput.js'
import { BALLISTA_AIM } from './Ballista.js'
import { AIM } from './aim.js'
import { ClipRecorder } from '../services/ClipRecorder.js'

/** Moments forts (v6.0) : la prise continue un instant après le retour au calme (ms). */
const CLIP_POST_ROLL_MS = 900

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
  /** Ambiance sonore (v6.3) : elle joue les sons du ciel vivant (tonnerre, risées…). */
  #ambience
  #raf = 0
  #last = 0
  #paused = false
  #resizeObs = null
  #drag = null
  /** Relâcher après avoir tiré vers l'arrière déclenche le tir (sauf « visée précise »). */
  #releaseToFire = true
  /** Contraste élevé (réglage, v6.2) : le rendu du canevas s'y adapte aussi. */
  #highContrast = false
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
  /** Trébuchet (v5.4) : appui en cours (doigt ou souris), voir aim/TrebuchetInput.js. */
  #trebPress = null
  /** Sifflement du projectile en vol (v5.7). */
  #flight = null
  /** Moments forts (v6.0) : caméra du canevas, état précédent, bilan du tir filmé. */
  #clips = null
  #clipState = null
  #clipStart = null
  #clipTimer = null

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} level niveau du LevelRepository
   * @param {object} opts { difficulty, completedLevels, settings, reducedMotion, audio, ambience, haptics }
   */
  static async create(canvas, level, opts) {
    const c = new GameController(canvas, level, opts, await assets())
    c.#start()
    return c
  }

  constructor(canvas, level, { difficulty, completedLevels, settings, reducedMotion, audio, ambience = null, haptics, effects, mode, continueOffer = false, engine = 'catapult', replay = null, season = null, translate = null, luck = 0 }, registry) {
    super()
    this.#canvas = canvas
    this.#audio = audio
    this.#ambience = ambience
    this.#haptics = haptics
    this.#renderer = new Renderer(canvas, registry)
    // Fond peint du chapitre (v6.2) : chargé dès l'ouverture, pendant l'introduction du niveau.
    this.#renderer.art.preload(level.chapter)
    this.session = new GameSession(level, {
      difficulty,
      completedLevels,
      trajectoryAid: settings.trajectoryAid,
      reducedMotion,
      screenShake: settings.screenShake,
      blood: settings.blood,
      screams: settings.screams !== false,
      healthBars: settings.healthBars !== false,
      startPower: settings.startPower,
      effects,
      continueOffer,
      engine,
      slowSwing: settings.slowSwing === true,
      replay: Array.isArray(replay),
      season,
      luck,
    }, mode)
    if (Array.isArray(replay)) this.#replayer = new ReplayPlayer(this.session, replay)
    const bounds = this.session.engine === 'ballista' ? BALLISTA_AIM : AIM
    this.#aim = new AimInput({ minAngle: bounds.MIN_ANGLE, maxAngle: bounds.MAX_ANGLE, dir: this.session.catapult.dir })
    this.#aim.set(this.session.catapult.angle, this.session.catapult.power)
    this.#releaseToFire = settings.preciseAim !== true
    this.#highContrast = settings.contrast === 'high'
    const focus = this.session.focus
    // Moments forts : seulement si le réglage le permet et que le navigateur sait filmer.
    if (settings.highlights === true && !Array.isArray(replay) && ClipRecorder.supported(canvas)) this.#clips = new ClipRecorder(canvas)
    this.session.camera.setFocus(focus.left, focus.right, focus.top)
    this.session.on('hud', (h) => this.emit('hud', h))
    this.session.on('announce', (a) => this.emit('announce', a))
    this.session.on('end', (e) => this.emit('end', e))
    this.session.on('turn', (e) => this.emit('turn', e))
    this.session.on('offer', (e) => this.emit('offer', e))
    // Grands sièges et généraux (v6.0) : bannières, barre du général.
    this.session.on('stage', (e) => this.emit('stage', e))
    this.session.on('general', (e) => this.emit('general', e))
    this.session.on('feedback', (f) => this.#feedback(f))
    // Répliques des défenseurs et des généraux (v6.0) : bulles traduites, dans la scène.
    this.session.on('bark', ({ key, x, y, tone }) => {
      this.session.particles.bubble(x, y, translate ? translate(key) : key, { tone })
    })
    // Enchaînements : titre traduit, dessiné dans la scène (v5.7).
    this.session.on('callout', ({ key, tier, x, y }) => {
      const text = translate ? translate(`game.callout.${key}`) : key
      this.session.particles.callout(x, y, text, tier)
    })
  }

  /** Place occupée par le HUD (px CSS), mesurée par l'interface. */
  setInsets(top, bottom) {
    this.session.camera.setInsets(Number(top), Number(bottom))
  }

  /** Fonds peints (v6.2) : pour les outils et les essais (voir BackgroundArt.add). */
  get backgroundArt() {
    return this.#renderer.art
  }

  get paused() {
    return this.#paused
  }

  /** Met à jour les options en cours de partie. */
  applySettings(settings, reducedMotion) {
    // Les niveaux de premiers pas gardent la trajectoire visible quel que soit le réglage.
    this.session.options.trajectoryAid = settings.trajectoryAid || this.session.assist
    this.#releaseToFire = settings.preciseAim !== true
    this.#highContrast = settings.contrast === 'high'
    this.session.options.reducedMotion = reducedMotion
    this.session.camera.shakeEnabled = settings.screenShake && !reducedMotion
    this.session.options.blood = settings.blood
    this.session.options.screams = settings.screams !== false
    this.session.options.startPower = settings.startPower
    // Trébuchet : l'option « Jauge lente » allonge l'aller de la jauge.
    this.session.trebInput?.setSweep(TrebuchetInput.sweepFor(this.session.difficulty, settings.slowSwing === true))
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
      this.#flightSound()
      this.#watchClip()
      this.#renderer.render(this.#sceneWithAim())
      // Sons du ciel vivant (v6.3) : le tonnerre suit l'éclair, un souffle suit la risée.
      for (const event of this.#renderer.takeSkyEvents()) this.#ambience?.sky?.(event)
      this.#hudTimer += dt
      // En vol (et en visée quand le vent souffle en rafales), le HUD suit en continu.
      // Trébuchet : l'angle de la jauge suit aussi dans le panneau.
      const live = this.session.state === STATE.FLYING || (this.session.state === STATE.AIMING && (this.session.world.windField.dynamic || this.session.trebPhase === 'power'))
      if (this.#hudTimer > (this.session.armed || this.session.trebPhase === 'power' ? 60 : 180) && live) {
        this.#hudTimer = 0
        this.emit('hud', this.session.hud)
      }
    }
    this.#raf = requestAnimationFrame(frame)
    this.emit('hud', this.session.hud)
  }

  #sceneWithAim() {
    const scene = this.session.scene()
    scene.highContrast = this.#highContrast
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

  /**
   * Avancer (1), reculer (-1) ou s'arrêter (0) (v6.2). L'arrêt passe toujours,
   * même en pause : un bouton relâché pendant la pause n'emmène pas l'engin.
   * @param {-1|0|1} dir
   */
  drive(dir) {
    if (this.#replayer || (dir !== 0 && this.#paused)) return false
    if (dir !== 0) this.#audio.unlock()
    return this.session.drive(dir)
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
      // Trébuchet (v5.4) : 1er clic = point d'impact, 2e clic = arc (la jauge) ; glisser déplace la cible.
      if (this.session.engine === 'trebuchet') {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        if (this.#trebPress) return
        // En vol : un appui divise la mitraille ou fait plonger le faucon.
        if (this.session.state !== STATE.AIMING) {
          this.trigger()
          return
        }
        if (!this.session.trebPhase) return
        const p = this.#local(e)
        this.session.trebInput.press(p.x, p.y)
        this.#trebPress = { id: e.pointerId }
        cv.setPointerCapture?.(e.pointerId)
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
      const tp = this.#trebPress
      if (tp) {
        if (tp.id !== e.pointerId) return
        const p = this.#local(e)
        if (this.session.trebInput.drag(p.x, p.y)) this.#placeTrebTarget(p.x, p.y)
        return
      }
      const d = this.#drag
      if (!d || d.id !== e.pointerId || this.session.state !== STATE.AIMING) return
      const p = this.#local(e)
      const r = this.#aim.move(p.x, p.y, e.timeStamp || performance.now(), { fine: e.shiftKey || this.#pointers.size > 1 })
      if (r.changed) this.emit('aimed')
      if (r.ticks) this.#aimTick()
    }
    const up = (e) => {
      if (this.#trebPress) {
        if (this.#trebPress.id === e.pointerId) this.#trebUp(this.#local(e))
        return
      }
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
      if (this.#trebPress && (!e || e.pointerId === this.#trebPress.id)) {
        // Appui interrompu (appel, geste système) : rien n'est validé.
        this.#trebPress = null
        this.session.trebInput?.unpress()
      }
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

  /* ---------- Trébuchet (v5.4) ---------- */

  /** Fin d'appui : un clic plante la cible (puis tire) ; un glissé l'a déplacée. */
  #trebUp(p) {
    this.#trebPress = null
    const s = this.session
    const r = s.trebInput.unpress()
    const phase = s.trebPhase
    if (!r || !phase) return
    if (r === 'tap' && phase === 'power') {
      // 2e clic : la jauge est figée, le trébuchet tire.
      this.trigger()
      return
    }
    // 1er clic (exactement là où l'on a touché), ou glissé terminé : la jauge part.
    const w = s.camera.screenToWorld(p.x, p.y)
    const ok = r === 'tap' ? s.placeTrebTarget(w.x, w.y) : phase === 'target' ? s.startTrebGauge() : false
    if (!ok) return
    this.#aimTick()
    this.emit('trigger', { result: 'aimed', ammo: s.selectedAmmo })
    this.emit('announce', { key: 'a11y.trebTarget', params: { m: Math.round(Math.abs(s.trebInput.target.x - s.catapult.x) / 10) } })
  }

  /** Le glissé place la cible sur le terrain (point du monde sous le doigt). */
  #placeTrebTarget(sx, sy) {
    const w = this.session.camera.screenToWorld(sx, sy)
    if (this.session.moveTrebTarget(w.x, w.y)) this.emit('aimed')
  }

  /**
   * Flèches au trébuchet : déplacent la cible (Maj : par petits pas).
   * @param {-1|1} dir
   */
  trebNudge(dir, fine = false) {
    if (this.#paused || this.#replayer || this.session.engine !== 'trebuchet') return
    this.session.skipIntro()
    const ok = this.session.nudgeTrebTarget(Math.sign(dir) * (fine ? TREB_TUNING.NUDGE_FINE : TREB_TUNING.NUDGE))
    if (ok) {
      this.emit('aimed')
      this.#aimTick()
    }
  }

  /** La visée a pu changer ailleurs (curseurs, début de tour) : on s'y recale. */
  #syncAim() {
    const c = this.session.catapult
    const t = this.#aim.target
    if (Math.abs(c.angle - t.angle) > 1e-6 || Math.abs(c.power - t.power) > 1e-6) this.#aim.set(c.angle, c.power)
  }

  /** Image par image : touches maintenues et lissage de la visée affichée. */
  #tickAim(dt) {
    if (this.#replayer || this.session.engine === 'trebuchet') return
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

  /* ---------- Moments forts (v6.0) ---------- */

  /**
   * Filme chaque tir : départ au vol, arrêt un instant après le retour au
   * calme. Sa valeur : défenseurs abattus, vies ôtées au général, coup de grâce.
   */
  #watchClip() {
    if (!this.#clips) return
    const s = this.session
    const st = s.state
    if (st === STATE.FLYING && this.#clipState !== STATE.FLYING && !this.#clips.recording) {
      clearTimeout(this.#clipTimer)
      this.#clipStart = { targets: s.targetsLeft, stage: s.stage, lives: s.council?.general.lives ?? 0 }
      this.#clips.start()
    } else if (this.#clipState === STATE.FLYING && st !== STATE.FLYING && this.#clipStart) {
      const from = this.#clipStart
      this.#clipStart = null
      const stageWon = s.stage > from.stage || st === STATE.STAGE
      const kills = stageWon ? from.targets : Math.max(0, from.targets - s.targetsLeft)
      const hurt = s.stage === from.stage ? Math.max(0, from.lives - (s.council?.general.lives ?? from.lives)) : 0
      const value = kills * 10 + hurt * 25 + (st === STATE.ENDED && s.targetsLeft === 0 ? 40 : 0) + (stageWon ? 15 : 0)
      this.#clipTimer = setTimeout(() => this.#clips?.stop(value), CLIP_POST_ROLL_MS)
    }
    this.#clipState = st
  }

  /** La plus belle prise de la partie (une fois écrite), ou null. */
  async highlight() {
    if (!this.#clips) return null
    // Une prise encore en cours (fin de partie) s'arrête maintenant.
    await new Promise((r) => setTimeout(r, CLIP_POST_ROLL_MS + 50))
    return this.#clips?.best() ?? null
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

  /**
   * Le boulet siffle en fendant l'air : le souffle suit sa vitesse et sa
   * position à l'écran (gauche/droite). Coupé dès l'impact ou en pause.
   */
  #flightSound() {
    let p = null
    if (!this.#paused && this.session.state === STATE.FLYING) {
      for (const e of this.session.world.entities()) {
        if (e.kind === 'projectile' && !e.hasImpacted && e.alive !== false) {
          p = e
          break
        }
      }
    }
    if (!p) {
      this.#flight?.stop()
      this.#flight = null
      return
    }
    this.#flight ??= this.#audio.loop?.('flight') ?? null
    if (!this.#flight) return
    const v = p.body?.velocity ?? { x: 0, y: 0 }
    const cam = this.session.camera
    const sx = cam.worldToScreen(p.x, 0).x
    this.#flight.update({ pan: clamp((sx / cam.viewW) * 2 - 1, -1, 1), speed: Math.hypot(v.x, v.y) / 30 })
  }

  destroy() {
    this.#flight?.stop()
    this.#flight = null
    clearTimeout(this.#clipTimer)
    this.#clips?.dispose()
    this.#clips = null
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
