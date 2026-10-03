import { clamp } from '../../core/utils/math.js'

/**
 * Effets sonores synthétisés en temps réel (Web Audio API) : aucun fichier audio
 * à télécharger, ce qui allège le jeu. Chaque son est spatialisé gauche/droite
 * selon la position de l'événement dans la scène.
 *
 * Le contexte audio n'est créé qu'après une interaction (règle des navigateurs).
 */
export const SOUND_IDS = Object.freeze([
  'launch', 'creak', 'wood', 'straw', 'stone', 'iron', 'glass', 'hit', 'down', 'explosion',
  'fire', 'victory', 'defeat', 'power', 'click', 'split', 'star',
])

export class AudioService {
  /** @type {AudioContext | null} */
  #ctx = null
  #master = null
  #noise = null
  #last = new Map()
  #volume = 0.7
  #muted = false
  /** Coupure temporaire pendant une publicité (indépendante du réglage du joueur). */
  #adMuted = false
  /** Bus de la musique (volume séparé des effets sonores). */
  #musicBus = null
  #musicVolume = 0.5
  /** @type {Set<(ctx: AudioContext, bus: GainNode) => void>} */
  #onReady = new Set()

  get volume() {
    return this.#volume
  }
  set volume(v) {
    this.#volume = clamp(Number(v) || 0, 0, 1)
    this.#applyGain()
  }
  set muted(m) {
    this.#muted = Boolean(m)
    this.#applyGain()
  }

  get musicVolume() {
    return this.#musicVolume
  }
  set musicVolume(v) {
    this.#musicVolume = clamp(Number(v) || 0, 0, 1)
    this.#applyGain()
  }

  get muted() {
    return this.#muted
  }

  set adMuted(m) {
    this.#adMuted = Boolean(m)
    this.#applyGain()
  }

  #applyGain() {
    const silent = this.#muted || this.#adMuted
    if (this.#master) this.#master.gain.value = silent ? 0 : this.#volume * 0.8
    if (this.#musicBus) this.#musicBus.gain.setTargetAtTime(silent ? 0 : this.#musicVolume * 0.75, this.#ctx.currentTime, 0.1)
  }

  /**
   * Appelle `fn(ctx, bus)` dès que le son est disponible (après un geste du joueur),
   * immédiatement s'il l'est déjà. Sert à la musique (MusicDirector).
   * @returns {() => void} désabonnement
   */
  whenReady(fn) {
    if (this.#ctx) fn(this.#ctx, this.#musicBus)
    else this.#onReady.add(fn)
    return () => this.#onReady.delete(fn)
  }

  /** Met le son en veille (onglet caché) ou le réveille. */
  suspend(on) {
    if (!this.#ctx) return
    if (on) this.#ctx.suspend().catch(() => {})
    else this.#ctx.resume().catch(() => {})
  }

  /** À appeler lors d'un geste du joueur (clic, toucher, touche). */
  unlock() {
    if (this.#ctx) {
      if (this.#ctx.state === 'suspended') this.#ctx.resume().catch(() => {})
      return
    }
    const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext
    if (!Ctx) return
    try {
      this.#ctx = new Ctx()
      this.#master = this.#ctx.createGain()
      this.#master.connect(this.#ctx.destination)
      this.#musicBus = this.#ctx.createGain()
      this.#musicBus.gain.value = 0
      this.#musicBus.connect(this.#ctx.destination)
      this.#applyGain()
      const len = this.#ctx.sampleRate
      this.#noise = this.#ctx.createBuffer(1, len, this.#ctx.sampleRate)
      const data = this.#noise.getChannelData(0)
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    } catch {
      this.#ctx = null
      return
    }
    for (const fn of this.#onReady) fn(this.#ctx, this.#musicBus)
    this.#onReady.clear()
  }

  /**
   * Joue un son.
   * @param {string} id voir SOUND_IDS
   * @param {{ pan?: number, intensity?: number }} [opts] pan ∈ [-1, 1]
   */
  play(id, { pan = 0, intensity = 1 } = {}) {
    if (!this.#ctx || this.#muted || this.#adMuted || this.#volume === 0 || !SOUND_IDS.includes(id)) return
    const now = this.#ctx.currentTime
    const last = this.#last.get(id) ?? -1
    if (now - last < 0.05) return
    this.#last.set(id, now)
    const out = this.#ctx.createStereoPanner ? this.#ctx.createStereoPanner() : this.#ctx.createGain()
    if (out.pan) out.pan.value = clamp(pan, -1, 1)
    out.connect(this.#master)
    const k = clamp(intensity, 0.2, 1.5)
    try {
      this.#synth(id, out, now, k)
    } catch {
      /* son non critique */
    }
  }

  #env(start, attack, decay, peak) {
    const g = this.#ctx.createGain()
    g.gain.setValueAtTime(0.0001, start)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay)
    return g
  }

  #noiseHit(out, t, { type = 'bandpass', freq = 800, q = 1, attack = 0.005, decay = 0.2, peak = 0.5, sweepTo = null }) {
    const src = this.#ctx.createBufferSource()
    src.buffer = this.#noise
    const f = this.#ctx.createBiquadFilter()
    f.type = type
    f.frequency.setValueAtTime(freq, t)
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + attack + decay)
    f.Q.value = q
    const g = this.#env(t, attack, decay, peak)
    src.connect(f).connect(g).connect(out)
    src.start(t, Math.random() * 0.5)
    src.stop(t + attack + decay + 0.05)
  }

  #tone(out, t, { type = 'sine', freq = 440, to = null, attack = 0.01, decay = 0.3, peak = 0.3 }) {
    const o = this.#ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + attack + decay)
    const g = this.#env(t, attack, decay, peak)
    o.connect(g).connect(out)
    o.start(t)
    o.stop(t + attack + decay + 0.05)
  }

  #synth(id, out, t, k) {
    switch (id) {
      case 'launch':
        this.#noiseHit(out, t, { type: 'bandpass', freq: 300, sweepTo: 1800, q: 0.8, attack: 0.05, decay: 0.45, peak: 0.45 })
        this.#tone(out, t, { type: 'triangle', freq: 140, to: 60, decay: 0.25, peak: 0.25 })
        break
      case 'creak':
        this.#tone(out, t, { type: 'sawtooth', freq: 70, to: 90, attack: 0.02, decay: 0.18, peak: 0.06 })
        break
      case 'wood':
        this.#noiseHit(out, t, { type: 'bandpass', freq: 650, q: 2, decay: 0.16 * k, peak: 0.5 * k })
        this.#tone(out, t, { type: 'triangle', freq: 220, to: 120, decay: 0.12, peak: 0.2 * k })
        break
      case 'straw':
        this.#noiseHit(out, t, { type: 'highpass', freq: 2500, decay: 0.2, peak: 0.25 * k })
        break
      case 'stone':
        this.#noiseHit(out, t, { type: 'lowpass', freq: 500, decay: 0.3 * k, peak: 0.6 * k })
        this.#tone(out, t, { freq: 95, to: 50, decay: 0.3, peak: 0.45 * k })
        break
      case 'iron':
        for (const f of [523, 1307, 2210]) this.#tone(out, t, { type: 'sine', freq: f, decay: 0.6, peak: 0.12 * k })
        this.#noiseHit(out, t, { type: 'highpass', freq: 3000, decay: 0.05, peak: 0.2 })
        break
      case 'glass':
        this.#noiseHit(out, t, { type: 'highpass', freq: 4000, decay: 0.3, peak: 0.35 })
        for (const f of [2637, 3520, 4186]) this.#tone(out, t + Math.random() * 0.06, { freq: f, decay: 0.25, peak: 0.08 })
        break
      case 'hit':
        this.#tone(out, t, { type: 'square', freq: 330, to: 180, decay: 0.12, peak: 0.08 })
        break
      case 'down':
        this.#tone(out, t, { type: 'triangle', freq: 520, to: 140, attack: 0.01, decay: 0.45, peak: 0.25 })
        break
      case 'explosion':
        this.#noiseHit(out, t, { type: 'lowpass', freq: 900, sweepTo: 80, attack: 0.01, decay: 1.1, peak: 0.9 })
        this.#tone(out, t, { freq: 70, to: 30, decay: 0.8, peak: 0.6 })
        break
      case 'fire':
        for (let i = 0; i < 5; i++) this.#noiseHit(out, t + i * 0.07 * Math.random(), { type: 'bandpass', freq: 1800, q: 3, decay: 0.05, peak: 0.15 })
        break
      case 'split':
        this.#tone(out, t, { type: 'triangle', freq: 880, to: 1320, decay: 0.12, peak: 0.15 })
        break
      case 'power':
        for (const [i, f] of [523, 659, 784, 1047].entries()) this.#tone(out, t + i * 0.05, { freq: f, decay: 0.3, peak: 0.12 })
        break
      case 'star':
        this.#tone(out, t, { type: 'triangle', freq: 1175, to: 1568, decay: 0.25, peak: 0.18 })
        break
      case 'victory':
        for (const [i, f] of [392, 523, 659, 784, 1047].entries()) this.#tone(out, t + i * 0.12, { type: 'triangle', freq: f, decay: 0.5, peak: 0.22 })
        break
      case 'defeat':
        for (const [i, f] of [392, 349, 311, 262].entries()) this.#tone(out, t + i * 0.18, { type: 'triangle', freq: f, decay: 0.5, peak: 0.2 })
        break
      case 'click':
        this.#tone(out, t, { type: 'square', freq: 660, decay: 0.03, peak: 0.05 })
        break
    }
  }
}
