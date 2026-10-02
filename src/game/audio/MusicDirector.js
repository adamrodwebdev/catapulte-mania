import { clamp } from '../../core/utils/math.js'
import { SeededRandom } from '../../core/utils/SeededRandom.js'

/**
 * Bande son adaptative, composée en temps réel (Web Audio API).
 *
 * Aucune piste à télécharger : la musique est jouée note à note par de petits
 * instruments synthétiques d'inspiration médiévale (bourdon de vielle, luth,
 * flûte à bec, tambourin, chalemie). Elle suit l'action en quatre niveaux
 * d'intensité :
 *   0 · calme    : bourdon, luth égrené, flûte discrète (menus, préparation) ;
 *   1 · visée    : le tambourin marque les temps ;
 *   2 · action   : basse, luth en croches, tambour plus serré (projectile en vol,
 *                  dernier niveau d'un chapitre) ;
 *   3 · paroxysme: chalemie en contre-chant et roulements (effondrement,
 *                  explosion, dernière cible).
 * Les couches entrent et sortent progressivement : jamais de coupure brutale.
 *
 * Les morceaux sont des grilles d'accords modales (dorien, éolien) ; les
 * mélodies sont tirées d'un générateur à graine fixe : chaque morceau sonne
 * toujours de la même façon, mais sans boucle audible de quelques secondes.
 */

/** Morceaux : tempo, mode, grille d'accords (fondamentale en demi-tons, m = mineur). */
export const PIECES = Object.freeze({
  menu: { bpm: 80, scale: [0, 2, 3, 5, 7, 9, 10], chords: [[0, 'm'], [-2, 'M'], [5, 'M'], [0, 'm']], seed: 11 },
  march: { bpm: 96, scale: [0, 2, 3, 5, 7, 9, 10], chords: [[0, 'm'], [-2, 'M'], [3, 'M'], [-2, 'M'], [0, 'm'], [5, 'M'], [-2, 'M'], [0, 'm']], seed: 23 },
  siege: { bpm: 104, scale: [0, 2, 3, 5, 7, 8, 10], chords: [[0, 'm'], [8, 'M'], [10, 'M'], [0, 'm'], [5, 'm'], [8, 'M'], [7, 'M'], [7, 'M']], seed: 37 },
  finale: { bpm: 112, scale: [0, 2, 3, 5, 7, 8, 11], chords: [[0, 'm'], [8, 'M'], [5, 'm'], [7, 'M'], [0, 'm'], [3, 'M'], [10, 'M'], [7, 'M']], seed: 41 },
})

/** Tonalité (demi-tons au-dessus de ré) et morceau de chaque chapitre. */
const CHAPTER_MUSIC = Object.freeze({
  1: ['march', 0], 2: ['march', 2], 3: ['siege', 0], 4: ['siege', 5], 5: ['march', -2],
  6: ['siege', 2], 7: ['march', 5], 8: ['siege', -3], 9: ['siege', 3], 10: ['finale', 0],
})

const D3 = 146.83
const hz = (semi) => D3 * 2 ** (semi / 12)
const LOOKAHEAD = 0.25
const TICK_MS = 60

export class MusicDirector {
  /** @type {AudioContext | null} */
  #ctx = null
  #bus = null
  #mix = null
  #enabled = true
  #piece = null
  #pieceId = null
  #key = 0
  #step = 0
  #nextTime = 0
  #timer = null
  #rng = new SeededRandom(1)
  #melody = []
  #base = 0
  #pulse = 0
  #pulseUntil = 0
  #drone = null
  /** @type {(level: number) => void} */
  onClimax = () => {}

  /** @param {import('./AudioService.js').AudioService} audio */
  constructor(audio) {
    this.audio = audio
    audio.whenReady((ctx, bus) => {
      this.#ctx = ctx
      this.#bus = bus
      this.#mix = ctx.createGain()
      this.#mix.gain.value = 1
      this.#mix.connect(bus)
      if (this.#pieceId) this.#start()
    })
  }

  /** Intensité effective (0 à 3). */
  get intensity() {
    const now = this.#ctx?.currentTime ?? 0
    return now < this.#pulseUntil ? Math.max(this.#base, this.#pulse) : this.#base
  }

  get playing() {
    return Boolean(this.#timer)
  }

  /** Active ou coupe la musique (réglage « Musique » à 0). */
  setEnabled(on) {
    this.#enabled = Boolean(on)
    if (!this.#enabled) this.#halt()
    else if (this.#pieceId && this.#ctx) this.#start()
  }

  /**
   * Joue un morceau (fondu si un autre jouait déjà).
   * @param {'menu' | 'chapter'} scene
   * @param {{ chapter?: number }} [opts]
   */
  play(scene, { chapter = 1 } = {}) {
    const [id, key] = scene === 'menu' ? ['menu', 0] : CHAPTER_MUSIC[clamp(chapter, 1, 10)] || CHAPTER_MUSIC[1]
    if (this.#pieceId === id && this.#key === key && this.playing) return
    this.#pieceId = id
    this.#key = key
    this.#piece = PIECES[id]
    this.#rng = new SeededRandom(this.#piece.seed + key * 7)
    this.#melody = []
    this.#step = 0
    if (this.#ctx && this.#enabled) this.#start()
  }

  /** Intensité de fond (0 à 3). */
  setIntensity(level) {
    this.#base = clamp(Math.round(level), 0, 3)
  }

  /** Montée passagère (effondrement, explosion). */
  surge(level = 3, seconds = 4) {
    if (!this.#ctx) return
    const was = this.intensity
    this.#pulse = clamp(level, 0, 3)
    this.#pulseUntil = Math.max(this.#pulseUntil, this.#ctx.currentTime + seconds)
    if (this.#pulse >= 3 && was < 3) this.onClimax(3)
  }

  /** Baisse le volume (pause, écran de fin) sans arrêter. */
  duck(on) {
    if (!this.#mix) return
    this.#mix.gain.setTargetAtTime(on ? 0.3 : 1, this.#ctx.currentTime, 0.25)
  }

  /** Fondu de sortie puis arrêt (victoire, défaite). */
  stop(fade = 1.2) {
    if (!this.#ctx || !this.#mix) return this.#halt()
    const t = this.#ctx.currentTime
    this.#mix.gain.setTargetAtTime(0.0001, t, fade / 4)
    const old = this.#mix
    this.#halt(false)
    setTimeout(() => old.disconnect(), fade * 1000 + 200)
    this.#mix = this.#ctx.createGain()
    this.#mix.gain.value = 1
    this.#mix.connect(this.#bus)
    this.#pieceId = null
  }

  /** Ordonnance les prochaines notes (appelé par la minuterie ; public pour les tests). */
  tick() {
    if (this.#timer) this.#schedule()
  }

  /* ---------- Interne ---------- */

  #start() {
    this.#halt(false)
    if (!this.#enabled || !this.#ctx || !this.#piece) return
    this.#nextTime = this.#ctx.currentTime + 0.1
    this.#drone = this.#makeDrone()
    this.#timer = setInterval(() => this.#schedule(), TICK_MS)
    this.#schedule()
  }

  #halt(clearPiece = false) {
    clearInterval(this.#timer)
    this.#timer = null
    if (this.#drone) {
      const d = this.#drone
      const t = this.#ctx.currentTime
      d.gain.gain.setTargetAtTime(0.0001, t, 0.3)
      setTimeout(() => d.oscs.forEach((o) => o.stop()), 1500)
      this.#drone = null
    }
    if (clearPiece) this.#pieceId = null
  }

  #schedule() {
    const ctx = this.#ctx
    if (!ctx) return
    // Retard important (onglet en veille) : on repart sans rattraper.
    if (this.#nextTime < ctx.currentTime - 0.5) this.#nextTime = ctx.currentTime + 0.05
    const eighth = 30 / this.#piece.bpm
    while (this.#nextTime < ctx.currentTime + LOOKAHEAD) {
      this.#playStep(this.#step, this.#nextTime, eighth)
      this.#nextTime += eighth
      this.#step++
    }
  }

  /** Une croche : décide de ce que joue chaque instrument. */
  #playStep(step, t, eighth) {
    const p = this.#piece
    const lvl = this.intensity
    const inBar = step % 8
    const bar = Math.floor(step / 8)
    const [root, quality] = p.chords[bar % p.chords.length]
    const chord = [0, quality === 'm' ? 3 : 4, 7].map((x) => x + root + this.#key)
    const phraseEnd = bar % 4 === 3

    // Bourdon : suit doucement l'intensité.
    if (this.#drone) this.#drone.gain.gain.setTargetAtTime([0.05, 0.06, 0.07, 0.08][lvl], t, 0.8)

    // Luth : arpège (noires au calme, croches ensuite).
    if (lvl >= 2 || inBar % 2 === 0) {
      const pattern = [0, 1, 2, 1, 0, 2, 1, 2]
      const note = chord[pattern[inBar]] + 12 * (inBar >= 4 && lvl >= 1 ? 1 : 0)
      this.#pluck(t, hz(note), lvl >= 2 ? 0.11 : 0.09)
    }

    // Basse (action) : fondamentale sur les temps.
    if (lvl >= 2 && inBar % 2 === 0) this.#bass(t, hz(chord[0] - 12), eighth * 1.6)

    // Tambourin.
    if (lvl >= 1) {
      const hits = lvl === 1 ? [0, 4] : lvl === 2 ? [0, 3, 4, 6] : [0, 2, 3, 4, 6, 7]
      if (hits.includes(inBar)) this.#drum(t, (inBar === 0 ? 1 : 0.6) * (lvl === 3 ? 1.3 : 1))
      if (lvl >= 2 && inBar % 2 === 1) this.#shaker(t, 0.05)
      if (lvl === 3 && phraseEnd && inBar >= 6) {
        this.#drum(t + eighth / 2, 0.5)
        this.#drum(t + (eighth * 3) / 4, 0.55)
      }
      if (lvl === 3 && bar % 4 === 0 && inBar === 0) this.#cymbal(t)
    }

    // Mélodie : une phrase par mesure, composée à la volée (graine fixe).
    if (inBar === 0) this.#melody = this.#compose(chord, lvl)
    const notes = this.#melody.filter((n) => n.at === inBar)
    const playMelody = lvl >= 1 || bar % 2 === 0
    for (const n of notes) {
      if (playMelody) this.#flute(t, hz(n.semi + 12), eighth * n.len * 0.95, lvl >= 2 ? 0.075 : 0.06)
      // Paroxysme : la chalemie double une sixte plus haut.
      if (lvl === 3) this.#shawm(t, hz(n.semi + 21), eighth * n.len * 0.9)
    }
  }

  /** Phrase d'une mesure : notes de la gamme autour des notes de l'accord. */
  #compose(chord, lvl) {
    const r = this.#rng
    const rhythms = lvl >= 2
      ? [[2, 1, 1, 2, 2], [1, 1, 1, 1, 2, 2], [2, 2, 1, 1, 2], [3, 1, 2, 2]]
      : [[4, 4], [2, 2, 4], [3, 1, 4], [2, 2, 2, 2], [6, 2]]
    const rhythm = rhythms[r.int(0, rhythms.length - 1)]
    const scale = this.#piece.scale.map((s) => s + this.#key)
    const pool = []
    for (let o = 0; o < 2; o++) for (const s of scale) pool.push(s + 12 * o)
    let idx = pool.findIndex((s) => (s - chord[r.int(0, 2)]) % 12 === 0)
    if (idx < 0) idx = 4
    const out = []
    let at = 0
    rhythm.forEach((len, i) => {
      // Mouvement conjoint surtout, petit saut parfois ; la phrase finit sur l'accord.
      if (i > 0) idx = clamp(idx + [-2, -1, -1, 1, 1, 2, 0][r.int(0, 6)], 0, pool.length - 1)
      if (i === rhythm.length - 1) {
        const target = pool.findIndex((s, k) => k >= idx - 2 && chord.some((c) => (s - c) % 12 === 0))
        if (target >= 0) idx = target
      }
      out.push({ at, len, semi: pool[idx] })
      at += len
    })
    return out
  }

  /* ---------- Instruments ---------- */

  #env(t, attack, hold, release, peak) {
    const g = this.#ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack)
    g.gain.setValueAtTime(Math.max(0.0002, peak), t + attack + hold)
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release)
    g.connect(this.#mix)
    return g
  }

  #osc(type, freq, t, dur, dest) {
    const o = this.#ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    o.connect(dest)
    o.start(t)
    o.stop(t + dur + 0.05)
    return o
  }

  #makeDrone() {
    const ctx = this.#ctx
    const gain = ctx.createGain()
    gain.gain.value = 0.0001
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 420
    lp.Q.value = 0.7
    lp.connect(gain).connect(this.#mix)
    const root = hz(this.#key - 12)
    const oscs = [root, root * 1.5, root * 1.003].map((f) => {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = f
      o.connect(lp)
      o.start()
      return o
    })
    // Légère respiration du filtre, comme une roue de vielle.
    const lfo = ctx.createOscillator()
    const depth = ctx.createGain()
    lfo.frequency.value = 0.18
    depth.gain.value = 120
    lfo.connect(depth).connect(lp.frequency)
    lfo.start()
    oscs.push(lfo)
    gain.gain.setTargetAtTime(0.05, ctx.currentTime, 1.5)
    return { gain, oscs }
  }

  #pluck(t, freq, peak) {
    const g = this.#env(t, 0.004, 0, 0.55, peak)
    const lp = this.#ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(freq * 6, t)
    lp.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.4)
    lp.connect(g)
    this.#osc('triangle', freq, t, 0.6, lp)
    this.#osc('sawtooth', freq * 1.002, t, 0.6, lp)
  }

  #flute(t, freq, dur, peak) {
    const g = this.#env(t, 0.05, Math.max(0, dur - 0.12), 0.12, peak)
    const o = this.#osc('sine', freq, t, dur + 0.15, g)
    // Vibrato qui s'installe sur les notes tenues.
    const lfo = this.#ctx.createOscillator()
    const depth = this.#ctx.createGain()
    lfo.frequency.value = 5.2
    depth.gain.setValueAtTime(0, t)
    depth.gain.linearRampToValueAtTime(freq * 0.006, t + Math.min(dur, 0.4))
    lfo.connect(depth).connect(o.frequency)
    lfo.start(t)
    lfo.stop(t + dur + 0.15)
    this.#osc('sine', freq * 2, t, dur + 0.15, this.#env(t, 0.05, Math.max(0, dur - 0.12), 0.12, peak * 0.12))
  }

  #shawm(t, freq, dur) {
    const g = this.#env(t, 0.03, Math.max(0, dur - 0.08), 0.08, 0.06)
    const bp = this.#ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1400
    bp.Q.value = 1.4
    bp.connect(g)
    this.#osc('sawtooth', freq, t, dur + 0.1, bp)
  }

  #bass(t, freq, dur) {
    const g = this.#env(t, 0.01, dur * 0.4, dur * 0.6, 0.12)
    const lp = this.#ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 300
    lp.connect(g)
    this.#osc('square', freq, t, dur, lp)
  }

  #drum(t, k) {
    const g = this.#env(t, 0.002, 0, 0.28, 0.22 * k)
    const o = this.#osc('sine', 150, t, 0.3, g)
    o.frequency.exponentialRampToValueAtTime(55, t + 0.25)
    this.#noise(t, 0.06, 900, 'bandpass', 0.12 * k)
  }

  #shaker(t, peak) {
    this.#noise(t, 0.05, 6000, 'highpass', peak)
  }

  #cymbal(t) {
    this.#noise(t, 1.2, 5000, 'highpass', 0.06)
  }

  #noise(t, dur, freq, type, peak) {
    const ctx = this.#ctx
    const len = Math.ceil(ctx.sampleRate * Math.min(dur + 0.05, 1.3))
    if (!this.noiseBuffer || this.noiseBuffer.length < len) {
      this.noiseBuffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 1.3), ctx.sampleRate)
      const d = this.noiseBuffer.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    }
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    const g = this.#env(t, 0.002, 0, dur, peak)
    src.connect(f).connect(g)
    src.start(t)
    src.stop(t + dur + 0.05)
  }
}
