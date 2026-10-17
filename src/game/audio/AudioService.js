import { clamp } from '../../core/utils/math.js'
import { SynthVoices } from './SynthVoices.js'
import { SOUND_RECIPES } from './soundRecipes.js'

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
  // v6.0 : cor de guerre (étape prise, ordre d'un général), roulement de tambour (coup de grâce).
  'horn', 'drumroll',
  // v6.0 : un tir restant changé en points (de plus en plus aigu).
  'bonus',
  // v6.1 : orbe d'orage (grésillement), pot de poison (le gaz fuse).
  'zap', 'hiss',
  // v6.2 : roues de l'engin qui roule.
  'roll',
])

/** Sons « musicaux » : jamais désaccordés par la variation aléatoire. */
const TUNED = new Set(['victory', 'defeat', 'power', 'star', 'lock', 'tick', 'click', 'combo', 'split', 'horn', 'drumroll', 'bonus'])

/** Part de réverbération propre à certains sons (les autres : valeur par défaut). */
const WET = Object.freeze({
  explosion: 0.55, thunder: 0.6, breach: 0.4, victory: 0.45, defeat: 0.5, power: 0.5, star: 0.35,
  combo: 0.4, scream: 0.35, iron: 0.4, glass: 0.3, rubble: 0.3, stone: 0.25, down: 0.2,
  tick: 0.04, click: 0.04, lock: 0.15, horn: 0.6, drumroll: 0.35,
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
  /** Briques de synthèse (v6.2, voir SynthVoices.js) : créées avec le contexte audio. */
  #voices = null
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
    this.#voices = new SynthVoices(ctx, this.#noise)
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
    this.#voices.vary = TUNED.has(id) ? 1 : 1 + (Math.random() * 2 - 1) * 0.07
    try {
      // Recette du son (v6.2, voir soundRecipes.js).
      SOUND_RECIPES[id](this.#voices, out, now, k)
    } catch {
      /* son non critique */
    }
    this.#voices.vary = 1
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

}
