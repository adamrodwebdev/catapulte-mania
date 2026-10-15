import { clamp } from '../../core/utils/math.js'

/**
 * Effets sonores synthétisés en temps réel (Web Audio API) : aucun fichier audio
 * à télécharger, ce qui allège le jeu. Chaque son est spatialisé gauche/droite
 * selon la position de l'événement dans la scène.
 *
 * v5.7 : vraie chaîne de mixage, comme dans un jeu de studio :
 *   sons → bus des effets → compresseur « colle » ─┐
 *   musique → bus de la musique ───────────────────┼→ limiteur → sortie
 *   ambiance → bus d'ambiance ──→ compresseur ─────┘
 *   effets et musique alimentent aussi une réverbération commune (salle de
 *   pierre générée par le code), qui met tous les sons dans le même espace.
 * Chaque son varie légèrement (hauteur, timbre) d'une fois sur l'autre : plus
 * de « mitraillette » quand dix planches tombent en même temps. Les impacts
 * sont superposés en couches (attaque, corps, queue, gravats).
 *
 * Le contexte audio n'est créé qu'après une interaction (règle des navigateurs).
 */
export const SOUND_IDS = Object.freeze([
  'launch', 'creak', 'wood', 'straw', 'stone', 'iron', 'glass', 'hit', 'down', 'explosion',
  'fire', 'victory', 'defeat', 'power', 'click', 'split', 'star', 'gust', 'swing', 'tick',
  // v5.0 : percée, givre, vapeur, eau, neige, créatures, foudre, cris des soldats.
  'breach', 'frost', 'steam', 'splash', 'snow', 'flyer', 'thunder', 'scream',
  // v5.1 : repère du trébuchet sur la cible, carreau de baliste.
  'lock', 'bolt',
  // v5.7 : souffle du tir, gravats d'un effondrement, enchaînement (doublé, triplé…).
  'whoosh', 'rubble', 'combo',
  // v5.8 : marteau du sapeur.
  'hammer',
])

/** Sons « musicaux » : jamais désaccordés par la variation aléatoire. */
const TUNED = new Set(['victory', 'defeat', 'power', 'star', 'lock', 'tick', 'click', 'combo', 'split'])

/** Part de réverbération propre à certains sons (les autres : valeur par défaut). */
const WET = Object.freeze({
  explosion: 0.55, thunder: 0.6, breach: 0.4, victory: 0.45, defeat: 0.5, power: 0.5, star: 0.35,
  combo: 0.4, scream: 0.35, iron: 0.4, glass: 0.3, rubble: 0.3, stone: 0.25, down: 0.2,
  tick: 0.04, click: 0.04, lock: 0.15,
})
const WET_DEFAULT = 0.18

export class AudioService {
  /** @type {AudioContext | null} */
  #ctx = null
  #master = null
  #wet = null
  #noise = null
  #last = new Map()
  #volume = 0.7
  #muted = false
  /** Coupure temporaire pendant une publicité (indépendante du réglage du joueur). */
  #adMuted = false
  #portalMuted = false
  /** Bus de la musique (volume séparé des effets sonores). */
  #musicBus = null
  #musicVolume = 0.5
  /** Bus de l'ambiance (vent, oiseaux, pluie) : suit le volume des effets. */
  #ambienceBus = null
  #ambienceLevel = 1
  /** Variation de hauteur du son en cours de synthèse (1 = aucune). */
  #vary = 1
  /** @type {Set<(ctx: AudioContext, bus: GainNode, extra: { ambience: GainNode }) => void>} */
  #onReady = new Set()
  /** Boucles en cours (sifflement du projectile) : coupées avec le son. */
  #loops = new Set()

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

  /** Son coupé par le portail (ex. bouton « muet » de CrazyGames, via son SDK). */
  set portalMuted(m) {
    this.#portalMuted = Boolean(m)
    this.#applyGain()
  }

  get #silent() {
    return this.#muted || this.#adMuted || this.#portalMuted
  }

  /** Atténue l'ambiance (pause, écran de fin) sans la couper. */
  duckAmbience(on) {
    this.#ambienceLevel = on ? 0.35 : 1
    this.#applyGain()
  }

  #applyGain() {
    if (!this.#ctx) return
    const t = this.#ctx.currentTime
    const sfx = this.#silent ? 0 : this.#volume * 0.9
    this.#master.gain.setTargetAtTime(sfx, t, 0.015)
    this.#wet.gain.setTargetAtTime(sfx, t, 0.015)
    this.#musicBus.gain.setTargetAtTime(this.#silent ? 0 : this.#musicVolume * 0.75, t, 0.1)
    this.#ambienceBus.gain.setTargetAtTime(this.#silent ? 0 : this.#volume * 0.55 * this.#ambienceLevel, t, 0.4)
  }

  /**
   * Appelle `fn(ctx, bus, { ambience })` dès que le son est disponible (après un
   * geste du joueur), immédiatement s'il l'est déjà. Sert à la musique
   * (MusicDirector, `bus`) et à l'ambiance (AmbienceDirector, `ambience`).
   * @returns {() => void} désabonnement
   */
  whenReady(fn) {
    if (this.#ctx) fn(this.#ctx, this.#musicBus, { ambience: this.#ambienceBus })
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
      this.#build(new Ctx())
    } catch {
      this.#ctx = null
      return
    }
    for (const fn of this.#onReady) fn(this.#ctx, this.#musicBus, { ambience: this.#ambienceBus })
    this.#onReady.clear()
  }

  /** Graphe de mixage (public pour les tests via un faux contexte). */
  #build(ctx) {
    this.#ctx = ctx
    // Limiteur de sortie : rien ne sature, même une explosion pendant un roulement.
    const limiter = this.#compressor(-3, 0, 20, 0.002, 0.2)
    limiter.connect(ctx.destination)
    // « Colle » des effets : les impacts simultanés se fondent au lieu de s'empiler.
    const glue = this.#compressor(-20, 8, 3.5, 0.006, 0.18)
    glue.connect(limiter)
    this.#master = ctx.createGain()
    this.#master.gain.value = 0
    this.#master.connect(glue)
    this.#musicBus = ctx.createGain()
    this.#musicBus.gain.value = 0
    this.#musicBus.connect(limiter)
    this.#ambienceBus = ctx.createGain()
    this.#ambienceBus.gain.value = 0
    this.#ambienceBus.connect(glue)
    // Réverbération partagée (salle de pierre, ~2,4 s), retour grave atténué.
    const len = ctx.sampleRate
    this.#noise = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = this.#noise.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    if (ctx.createConvolver) {
      const verb = ctx.createConvolver()
      verb.buffer = this.#impulse(2.4)
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 220
      const ret = ctx.createGain()
      ret.gain.value = 0.85
      verb.connect(hp).connect(ret).connect(limiter)
      this.#wet = ctx.createGain()
      this.#wet.connect(verb)
      const musicSend = ctx.createGain()
      musicSend.gain.value = 0.32
      this.#musicBus.connect(musicSend).connect(verb)
      const ambSend = ctx.createGain()
      ambSend.gain.value = 0.2
      this.#ambienceBus.connect(ambSend).connect(verb)
    } else {
      this.#wet = ctx.createGain()
    }
    this.#wet.gain.value = 0
    this.#applyGain()
  }

  #compressor(threshold, knee, ratio, attack, release) {
    const ctx = this.#ctx
    if (!ctx.createDynamicsCompressor) return ctx.createGain()
    const c = ctx.createDynamicsCompressor()
    c.threshold.value = threshold
    c.knee.value = knee
    c.ratio.value = ratio
    c.attack.value = attack
    c.release.value = release
    return c
  }

  /**
   * Réponse impulsionnelle d'une salle : premières réflexions éparses, puis
   * queue de bruit stéréo qui décroît et s'assombrit (les aigus meurent avant).
   */
  #impulse(seconds) {
    const ctx = this.#ctx
    const rate = ctx.sampleRate
    const len = Math.max(1, Math.floor(rate * seconds))
    const ir = ctx.createBuffer(2, len, rate)
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch)
      let lp = 0
      for (let i = 0; i < len; i++) {
        const t = i / len
        // Filtre passe-bas d'un pôle qui se ferme avec le temps.
        const k = 0.75 - 0.6 * t
        lp += (Math.random() * 2 - 1 - lp) * k
        d[i] = lp * Math.pow(1 - t, 3.2) * (i < rate * 0.012 ? i / (rate * 0.012) : 1)
      }
      // Premières réflexions (murs proches), décalées entre gauche et droite.
      for (let r = 0; r < 9; r++) {
        const at = Math.floor(rate * (0.011 + r * 0.0137 + ch * 0.0041))
        if (at < len) d[at] += (r % 2 ? -1 : 1) * 0.7 * Math.pow(0.82, r)
      }
    }
    return ir
  }

  /**
   * Joue un son.
   * @param {string} id voir SOUND_IDS
   * @param {{ pan?: number, intensity?: number }} [opts] pan ∈ [-1, 1]
   */
  play(id, { pan = 0, intensity = 1 } = {}) {
    if (!this.#ctx || this.#silent || this.#volume === 0 || !SOUND_IDS.includes(id)) return
    const now = this.#ctx.currentTime
    const last = this.#last.get(id) ?? -1
    if (now - last < 0.05) return
    this.#last.set(id, now)
    const out = this.#ctx.createStereoPanner ? this.#ctx.createStereoPanner() : this.#ctx.createGain()
    if (out.pan) out.pan.value = clamp(pan, -1, 1)
    out.connect(this.#master)
    const send = this.#ctx.createGain()
    send.gain.value = WET[id] ?? WET_DEFAULT
    out.connect(send).connect(this.#wet)
    const k = clamp(intensity, 0.2, 1.5)
    this.#vary = TUNED.has(id) ? 1 : 1 + (Math.random() * 2 - 1) * 0.07
    try {
      this.#synth(id, out, now, k)
    } catch {
      /* son non critique */
    }
    this.#vary = 1
  }

  /**
   * Son continu qui suit un objet (sifflement du projectile en vol).
   * @param {'flight'} id
   * @returns {{ update: (o: { pan?: number, speed?: number }) => void, stop: () => void } | null}
   */
  loop(id) {
    if (!this.#ctx || this.#silent || this.#volume === 0 || id !== 'flight') return null
    const ctx = this.#ctx
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.#noise
    src.loop = true
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 2.2
    bp.frequency.value = 500
    const g = ctx.createGain()
    g.gain.value = 0.0001
    const out = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain()
    src.connect(bp).connect(g).connect(out)
    out.connect(this.#master)
    // Petit sifflement tonal (le boulet fend l'air), très discret.
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = 900
    const og = ctx.createGain()
    og.gain.value = 0.0001
    o.connect(og).connect(out)
    src.start(t, Math.random() * 0.5)
    o.start(t)
    let stopped = false
    const handle = {
      update: ({ pan = 0, speed = 0 } = {}) => {
        if (stopped) return
        const now = ctx.currentTime
        const s = clamp(speed, 0, 1.4)
        if (out.pan) out.pan.setTargetAtTime(clamp(pan, -1, 1) * 0.8, now, 0.05)
        bp.frequency.setTargetAtTime(380 + s * 1100, now, 0.06)
        g.gain.setTargetAtTime(0.02 + s * 0.11, now, 0.08)
        o.frequency.setTargetAtTime(700 + s * 700, now, 0.08)
        og.gain.setTargetAtTime(s * 0.012, now, 0.08)
      },
      stop: () => {
        if (stopped) return
        stopped = true
        this.#loops.delete(handle)
        const now = ctx.currentTime
        g.gain.setTargetAtTime(0.0001, now, 0.05)
        og.gain.setTargetAtTime(0.0001, now, 0.05)
        src.stop(now + 0.4)
        o.stop(now + 0.4)
      },
    }
    this.#loops.add(handle)
    return handle
  }

  /** Coupe toutes les boucles (fin de partie, changement d'écran). */
  stopLoops() {
    for (const l of [...this.#loops]) l.stop()
  }

  /* ---------- Briques de synthèse ---------- */

  #env(start, attack, decay, peak) {
    const g = this.#ctx.createGain()
    g.gain.setValueAtTime(0.0001, start)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay)
    return g
  }

  #noiseHit(out, t, { type = 'bandpass', freq = 800, q = 1, attack = 0.005, decay = 0.2, peak = 0.5, sweepTo = null }) {
    const v = this.#vary
    const src = this.#ctx.createBufferSource()
    src.buffer = this.#noise
    src.loop = true // sons longs (rafale) : le bruit d'une seconde tourne en boucle
    const f = this.#ctx.createBiquadFilter()
    f.type = type
    f.frequency.setValueAtTime(freq * v, t)
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo * v, t + attack + decay)
    f.Q.value = q
    const g = this.#env(t, attack, decay, peak)
    src.connect(f).connect(g).connect(out)
    src.start(t, Math.random() * 0.5)
    src.stop(t + attack + decay + 0.05)
  }

  #tone(out, t, { type = 'sine', freq = 440, to = null, attack = 0.01, decay = 0.3, peak = 0.3, detune = 0 }) {
    const v = this.#vary
    const o = this.#ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq * v, t)
    if (detune && o.detune) o.detune.value = detune
    if (to) o.frequency.exponentialRampToValueAtTime(to * v, t + attack + decay)
    const g = this.#env(t, attack, decay, peak)
    o.connect(g).connect(out)
    o.start(t)
    o.stop(t + attack + decay + 0.05)
  }

  /** Cuivre (cor, trompette) : dents de scie dont le filtre s'ouvre à l'attaque. */
  #brass(out, t, freq, dur, peak) {
    const ctx = this.#ctx
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.Q.value = 1.2
    lp.frequency.setValueAtTime(freq * 1.2, t)
    lp.frequency.exponentialRampToValueAtTime(freq * 5, t + 0.07)
    lp.frequency.exponentialRampToValueAtTime(freq * 2.6, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + 0.04)
    g.gain.setValueAtTime(peak * 0.8, t + Math.max(0.05, dur - 0.12))
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.25)
    lp.connect(g).connect(out)
    for (const d of [-7, 6]) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(freq * 0.985, t)
      o.frequency.exponentialRampToValueAtTime(freq, t + 0.05)
      if (o.detune) o.detune.value = d
      o.connect(lp)
      o.start(t)
      o.stop(t + dur + 0.3)
    }
  }

  /** Timbale : sinusoïde grave qui retombe et peau frappée. */
  #timpani(out, t, freq, peak) {
    this.#tone(out, t, { freq: freq * 1.12, to: freq, attack: 0.004, decay: 0.9, peak })
    this.#tone(out, t, { freq: freq * 1.5, attack: 0.004, decay: 0.35, peak: peak * 0.3 })
    this.#noiseHit(out, t, { type: 'lowpass', freq: 900, decay: 0.08, peak: peak * 0.5 })
  }

  /** Cloche claire : partiels inharmoniques (son de verre, d'étoile, de magie). */
  #bell(out, t, freq, peak, decay = 0.9) {
    for (const [ratio, amp] of [[1, 1], [2.76, 0.45], [5.4, 0.2], [8.93, 0.08]]) {
      this.#tone(out, t, { freq: freq * ratio, attack: 0.002, decay: decay / Math.sqrt(ratio), peak: peak * amp })
    }
  }

  /** Gravats : petits chocs épars qui s'espacent (morceaux qui roulent). */
  #rattle(out, t, count, { freq = 1400, spread = 0.5, peak = 0.12 } = {}) {
    let at = t
    for (let i = 0; i < count; i++) {
      at += Math.random() * spread * (0.3 + i / count)
      this.#noiseHit(out, at, { type: 'bandpass', freq: freq * (0.6 + Math.random() * 0.9), q: 3 + Math.random() * 4, attack: 0.001, decay: 0.03 + Math.random() * 0.05, peak: peak * (1 - (i / count) * 0.6) })
    }
  }

  /**
   * Cri synthétisé (aucun enregistrement) : une voix en dents de scie dont la
   * hauteur monte puis s'effondre, passée dans deux formants de voyelle « a »,
   * avec un vibrato et un souffle. `pitch` distingue les voix (soldat, chevalier, roi).
   */
  #scream(out, t, pitch) {
    const ctx = this.#ctx
    const dur = 0.55 + Math.random() * 0.25
    const base = pitch * (0.9 + Math.random() * 0.25)
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(base, t)
    o.frequency.linearRampToValueAtTime(base * 1.7, t + 0.08)
    o.frequency.exponentialRampToValueAtTime(base * 0.55, t + dur)
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 6 + Math.random() * 3
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = base * 0.06
    lfo.connect(lfoGain).connect(o.frequency)
    const g = this.#env(t, 0.03, dur, 0.22)
    for (const [f, q] of [[780, 6], [1250, 7], [2600, 9]]) {
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = f
      bp.Q.value = q
      o.connect(bp).connect(g)
    }
    g.connect(out)
    o.start(t)
    lfo.start(t)
    o.stop(t + dur + 0.05)
    lfo.stop(t + dur + 0.05)
    this.#noiseHit(out, t, { type: 'bandpass', freq: 1500, q: 1.2, attack: 0.02, decay: dur * 0.7, peak: 0.05 })
  }

  #synth(id, out, t, k) {
    switch (id) {
      case 'breach':
        // Mur qui éclate : grave sourd, craquement, gravats qui roulent.
        this.#tone(out, t, { freq: 62, to: 28, decay: 0.7, peak: 0.75 })
        this.#noiseHit(out, t, { type: 'highpass', freq: 2500, decay: 0.03, peak: 0.5 })
        this.#noiseHit(out, t, { type: 'lowpass', freq: 1500, sweepTo: 180, decay: 0.8, peak: 0.7 })
        this.#rattle(out, t + 0.08, 9, { freq: 1100, spread: 0.12, peak: 0.22 })
        break
      case 'frost':
        // Givre : tintements cristallins et craquement aigu.
        for (const [i, f] of [2093, 2637, 3136, 3951].entries()) this.#tone(out, t + i * 0.035, { freq: f, decay: 0.45, peak: 0.07 * k })
        this.#noiseHit(out, t, { type: 'highpass', freq: 5000, decay: 0.25, peak: 0.25 })
        this.#rattle(out, t + 0.02, 5, { freq: 4200, spread: 0.06, peak: 0.08 })
        break
      case 'steam':
        // Vapeur : sifflement qui monte, chuintement.
        this.#noiseHit(out, t, { type: 'highpass', freq: 2500, sweepTo: 6000, attack: 0.04, decay: 0.9 * k, peak: 0.35 * k })
        this.#tone(out, t, { type: 'sine', freq: 1800, to: 2600, attack: 0.05, decay: 0.6, peak: 0.04 })
        break
      case 'splash':
        // Plongeon : claquement de surface, bulle qui remonte, pluie de gouttes.
        this.#noiseHit(out, t, { type: 'bandpass', freq: 1100, sweepTo: 280, q: 0.8, attack: 0.006, decay: 0.5 * k, peak: 0.5 * k })
        this.#tone(out, t + 0.02, { type: 'sine', freq: 380, to: 1200, decay: 0.12, peak: 0.1 })
        this.#rattle(out, t + 0.12, 7, { freq: 2600, spread: 0.1, peak: 0.06 * k })
        break
      case 'snow':
        this.#noiseHit(out, t, { type: 'lowpass', freq: 700, decay: 0.25, peak: 0.25 })
        this.#noiseHit(out, t + 0.03, { type: 'bandpass', freq: 3000, q: 1, decay: 0.15, peak: 0.06 })
        break
      case 'flyer':
        // Croassement ou cri de la vouivre (rauque, bref).
        this.#tone(out, t, { type: 'sawtooth', freq: 340, to: 220, attack: 0.01, decay: 0.18, peak: 0.12 })
        this.#tone(out, t + 0.16, { type: 'sawtooth', freq: 300, to: 180, attack: 0.01, decay: 0.2, peak: 0.1 })
        this.#rattle(out, t + 0.05, 4, { freq: 3000, spread: 0.08, peak: 0.05 })
        break
      case 'thunder':
        this.#noiseHit(out, t, { type: 'highpass', freq: 1800, decay: 0.08, peak: 0.6 })
        this.#noiseHit(out, t + 0.05, { type: 'lowpass', freq: 600, sweepTo: 60, attack: 0.03, decay: 1.8, peak: 0.9 })
        this.#tone(out, t + 0.05, { freq: 48, to: 28, decay: 1.4, peak: 0.55 })
        this.#noiseHit(out, t + 0.5, { type: 'lowpass', freq: 300, sweepTo: 80, attack: 0.2, decay: 1.4, peak: 0.4 })
        break
      case 'lock':
        // « C'est le moment » : deux notes claires et montantes.
        this.#tone(out, t, { type: 'triangle', freq: 988, decay: 0.08, peak: 0.16 })
        this.#tone(out, t + 0.07, { type: 'triangle', freq: 1480, decay: 0.16, peak: 0.16 })
        break
      case 'bolt':
        // Baliste : claquement de corde tendue et sifflement du carreau.
        this.#tone(out, t, { type: 'sawtooth', freq: 180, to: 70, attack: 0.002, decay: 0.12, peak: 0.25 })
        this.#noiseHit(out, t, { type: 'highpass', freq: 3000, decay: 0.02, peak: 0.35 })
        this.#noiseHit(out, t, { type: 'bandpass', freq: 2200, sweepTo: 900, q: 2, attack: 0.01, decay: 0.35, peak: 0.3 })
        break
      case 'scream':
        // L'intensité porte la voix : soldat (aigu), chevalier (grave), roi (entre les deux).
        this.#scream(out, t, k >= 1.2 ? 170 : k <= 0.6 ? 230 : 300)
        break
      case 'launch':
        // Le bras se détend (grincement), fend l'air, et frappe la traverse.
        this.#tone(out, t, { type: 'sawtooth', freq: 85, to: 120, attack: 0.01, decay: 0.12, peak: 0.06 })
        this.#noiseHit(out, t, { type: 'bandpass', freq: 300, sweepTo: 1900, q: 0.9, attack: 0.06, decay: 0.4, peak: 0.42 })
        this.#tone(out, t + 0.12, { type: 'sine', freq: 120, to: 52, attack: 0.002, decay: 0.22, peak: 0.5 })
        this.#noiseHit(out, t + 0.12, { type: 'bandpass', freq: 520, q: 4, attack: 0.001, decay: 0.12, peak: 0.35 })
        this.#noiseHit(out, t + 0.12, { type: 'bandpass', freq: 880, q: 6, attack: 0.001, decay: 0.09, peak: 0.2 })
        break
      case 'whoosh':
        this.#noiseHit(out, t, { type: 'bandpass', freq: 420, sweepTo: 1400, q: 1.1, attack: 0.12, decay: 0.35 * k, peak: 0.28 * k })
        break
      case 'creak':
        this.#tone(out, t, { type: 'sawtooth', freq: 70, to: 90, attack: 0.02, decay: 0.18, peak: 0.06 })
        this.#noiseHit(out, t, { type: 'bandpass', freq: 1200, q: 9, attack: 0.03, decay: 0.15, peak: 0.04 })
        break
      case 'wood': {
        // Craquement sec, puis le bois « sonne » sur deux modes de résonance.
        const m = 0.85 + Math.random() * 0.4
        this.#noiseHit(out, t, { type: 'highpass', freq: 2800, attack: 0.001, decay: 0.025, peak: 0.45 * k })
        this.#noiseHit(out, t, { type: 'bandpass', freq: 420 * m, q: 9, attack: 0.001, decay: 0.16 * k, peak: 0.6 * k })
        this.#noiseHit(out, t, { type: 'bandpass', freq: 1150 * m, q: 7, attack: 0.001, decay: 0.08, peak: 0.3 * k })
        this.#tone(out, t, { type: 'triangle', freq: 210 * m, to: 120, decay: 0.12, peak: 0.2 * k })
        if (k > 0.7) this.#rattle(out, t + 0.05, 3, { freq: 900, spread: 0.12, peak: 0.08 * k })
        break
      }
      case 'straw':
        this.#noiseHit(out, t, { type: 'highpass', freq: 2500, decay: 0.2, peak: 0.25 * k })
        this.#noiseHit(out, t + 0.02, { type: 'bandpass', freq: 5200, q: 2, decay: 0.3, peak: 0.08 * k })
        break
      case 'stone':
        // Choc mat, poids, puis cailloux.
        this.#noiseHit(out, t, { type: 'bandpass', freq: 1800, q: 1.5, attack: 0.001, decay: 0.03, peak: 0.35 * k })
        this.#noiseHit(out, t, { type: 'lowpass', freq: 520, decay: 0.32 * k, peak: 0.6 * k })
        this.#tone(out, t, { freq: 98, to: 46, decay: 0.32, peak: 0.5 * k })
        if (k > 0.6) this.#rattle(out, t + 0.06, 4, { freq: 1600, spread: 0.15, peak: 0.1 * k })
        break
      case 'iron':
        // Cloche de métal : partiels inharmoniques qui battent légèrement.
        for (const [f, d] of [[523, 4], [1307, -6], [2210, 9], [3170, -3]]) this.#tone(out, t, { type: 'sine', freq: f, decay: 0.8, peak: 0.11 * k, detune: d })
        this.#noiseHit(out, t, { type: 'highpass', freq: 3000, decay: 0.05, peak: 0.25 })
        this.#tone(out, t, { freq: 140, to: 80, decay: 0.2, peak: 0.25 * k })
        break
      case 'glass':
        this.#noiseHit(out, t, { type: 'highpass', freq: 4000, decay: 0.3, peak: 0.35 })
        for (const f of [2637, 3520, 4186]) this.#tone(out, t + Math.random() * 0.06, { freq: f, decay: 0.3, peak: 0.08 })
        this.#rattle(out, t + 0.05, 8, { freq: 5200, spread: 0.08, peak: 0.07 })
        break
      case 'hit':
        // Coup sur un défenseur : choc sourd et cliquetis d'armure.
        this.#tone(out, t, { type: 'sine', freq: 160, to: 70, attack: 0.002, decay: 0.14, peak: 0.3 })
        this.#noiseHit(out, t, { type: 'bandpass', freq: 3400, q: 5, attack: 0.001, decay: 0.07, peak: 0.12 })
        break
      case 'down':
        // Le défenseur tombe : chute sur le sol, armure qui claque, petit glas.
        this.#tone(out, t, { type: 'sine', freq: 130, to: 55, attack: 0.003, decay: 0.3, peak: 0.45 })
        this.#noiseHit(out, t, { type: 'lowpass', freq: 700, decay: 0.2, peak: 0.3 })
        this.#rattle(out, t + 0.04, 4, { freq: 3200, spread: 0.08, peak: 0.1 })
        this.#tone(out, t + 0.05, { type: 'triangle', freq: 660, to: 330, attack: 0.005, decay: 0.4, peak: 0.12 })
        break
      case 'hammer':
        // Marteau sur le bois : choc mat, puis le fer qui tinte un peu.
        for (let i = 0; i < 3; i++) {
          const at = t + i * 0.22
          this.#noiseHit(out, at, { type: 'bandpass', freq: 700, q: 5, attack: 0.001, decay: 0.07, peak: 0.35 * k })
          this.#tone(out, at, { type: 'triangle', freq: 260, to: 170, attack: 0.001, decay: 0.08, peak: 0.18 * k })
          this.#tone(out, at, { freq: 2100, attack: 0.001, decay: 0.09, peak: 0.03 * k })
        }
        break
      case 'rubble':
        // Effondrement : grondement et longue pluie de gravats.
        this.#noiseHit(out, t, { type: 'lowpass', freq: 380, sweepTo: 120, attack: 0.03, decay: 1.1 * k, peak: 0.45 * k })
        this.#rattle(out, t + 0.05, 16, { freq: 1200, spread: 0.18, peak: 0.16 * k })
        break
      case 'gust':
        // Souffle qui monte puis retombe (bruit filtré, balayage lent).
        this.#noiseHit(out, t, { type: 'bandpass', freq: 380, sweepTo: 950, q: 0.7, attack: 0.45, decay: 1.3, peak: 0.22 * k })
        break
      case 'explosion':
        // Craquement, souffle grave, boule de feu qui gronde et débris qui retombent.
        this.#noiseHit(out, t, { type: 'highpass', freq: 1500, attack: 0.001, decay: 0.06, peak: 0.8 })
        this.#tone(out, t, { freq: 72, to: 24, attack: 0.003, decay: 1.0, peak: 0.85 })
        this.#noiseHit(out, t, { type: 'lowpass', freq: 1200, sweepTo: 70, attack: 0.008, decay: 1.4, peak: 0.95 })
        this.#noiseHit(out, t + 0.1, { type: 'bandpass', freq: 600, sweepTo: 200, q: 0.6, attack: 0.1, decay: 1.2, peak: 0.25 })
        this.#rattle(out, t + 0.35, 10, { freq: 1300, spread: 0.2, peak: 0.12 })
        break
      case 'fire':
        // Embrasement : souffle qui prend, puis crépitements.
        this.#noiseHit(out, t, { type: 'lowpass', freq: 500, sweepTo: 1400, attack: 0.08, decay: 0.4, peak: 0.18 * k })
        for (let i = 0; i < 7; i++) this.#noiseHit(out, t + Math.random() * 0.5, { type: 'bandpass', freq: 1500 + Math.random() * 1500, q: 3, attack: 0.001, decay: 0.03, peak: 0.14 })
        break
      case 'split':
        this.#tone(out, t, { type: 'triangle', freq: 880, to: 1320, decay: 0.12, peak: 0.15 })
        this.#noiseHit(out, t, { type: 'highpass', freq: 3500, decay: 0.05, peak: 0.15 })
        break
      case 'power': {
        // Magie : arpège en cloches et souffle qui monte.
        for (const [i, f] of [523, 659, 784, 1047, 1319].entries()) this.#bell(out, t + i * 0.055, f, 0.06, 0.8)
        this.#noiseHit(out, t, { type: 'bandpass', freq: 1200, sweepTo: 6000, q: 2, attack: 0.25, decay: 0.4, peak: 0.08 })
        break
      }
      case 'star':
        // Étoile gagnée : cloche brillante (l'intensité monte d'un ton par étoile).
        this.#bell(out, t, 1175 * (k > 1.1 ? 1.335 : k > 0.9 ? 1.122 : 1), 0.14, 1.1)
        this.#noiseHit(out, t, { type: 'highpass', freq: 7000, decay: 0.35, peak: 0.05 })
        break
      case 'combo': {
        // Enchaînement : plus le palier est haut, plus l'arpège monte et s'étoffe.
        const tier = k >= 1.3 ? 3 : k >= 1 ? 2 : 1
        const notes = [[784, 988, 1175], [784, 988, 1175, 1568], [784, 988, 1175, 1568, 1976]][tier - 1]
        notes.forEach((f, i) => this.#bell(out, t + i * 0.045, f, 0.07, 0.6))
        this.#brass(out, t, tier === 3 ? 392 : 294, 0.25, 0.06)
        break
      }
      case 'victory': {
        // Fanfare : appel de trompettes, accord final tenu, timbales.
        const notes = [[392, 0, 0.14], [392, 0.15, 0.1], [523, 0.27, 0.14], [659, 0.43, 0.14], [784, 0.6, 0.9]]
        for (const [f, at, dur] of notes) this.#brass(out, t + at, f, dur, 0.1)
        this.#brass(out, t + 0.6, 523, 0.9, 0.07)
        this.#brass(out, t + 0.6, 659, 0.9, 0.06)
        this.#brass(out, t + 0.6, 262, 0.9, 0.07)
        this.#timpani(out, t + 0.6, 98, 0.5)
        this.#timpani(out, t, 131, 0.35)
        for (let i = 0; i < 5; i++) this.#bell(out, t + 0.62 + i * 0.07, 1568 * (1 + i * 0.12), 0.025, 0.6)
        break
      }
      case 'defeat':
        // Cor grave qui descend, glas et timbale étouffée.
        for (const [i, f] of [[0, 294], [1, 277], [2, 262], [3, 196]]) this.#brass(out, t + i * 0.28, f, i === 3 ? 1.1 : 0.24, 0.09)
        this.#brass(out, t + 0.84, 233, 1.1, 0.05)
        this.#timpani(out, t + 0.84, 73, 0.45)
        this.#bell(out, t + 0.84, 220, 0.05, 1.6)
        break
      case 'click':
        // Clic d'interface : petit choc boisé, doux.
        this.#noiseHit(out, t, { type: 'bandpass', freq: 1800, q: 6, attack: 0.001, decay: 0.03, peak: 0.12 })
        this.#tone(out, t, { type: 'triangle', freq: 880, decay: 0.03, peak: 0.04 })
        break
      case 'swing':
        // Trébuchet : le contrepoids chute (souffle grave) et la corde grince.
        this.#noiseHit(out, t, { type: 'lowpass', freq: 260, sweepTo: 700, q: 0.9, attack: 0.25, decay: 0.9, peak: 0.35 })
        this.#tone(out, t + 0.05, { type: 'sawtooth', freq: 55, to: 85, attack: 0.08, decay: 0.5, peak: 0.07 })
        this.#noiseHit(out, t + 0.1, { type: 'bandpass', freq: 900, q: 10, attack: 0.05, decay: 0.3, peak: 0.05 })
        break
      case 'tick':
        // Repère sonore du balancier : plus aigu à mesure que le tir se relève
        // (l'intensité porte l'angle du tir, voir GameSession). Aide les malvoyants.
        this.#tone(out, t, { type: 'triangle', freq: 220 + k * 520, decay: 0.06, peak: 0.12 })
        break
    }
  }
}
