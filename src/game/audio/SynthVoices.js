/**
 * Briques de synthèse des effets sonores (v6.2, sorties d'AudioService) :
 * bruit filtré, oscillateur, cuivre, timbale, cloche, gravats, cri. Chaque son
 * (voir soundRecipes.js) est une recette faite de ces briques.
 *
 * `vary` : variation de hauteur du son en cours (1 = aucune), fixée par
 * AudioService avant chaque recette. Les tirages au hasard (Math.random) se font
 * dans le même ordre qu'avant.
 */
export class SynthVoices {
  /** @type {AudioContext} */
  #ctx
  /** Bruit blanc d'une seconde (partagé). */
  #noise
  /** Variation de hauteur du son en cours de synthèse (1 = aucune). */
  vary = 1

  /**
   * @param {AudioContext} ctx
   * @param {AudioBuffer} noise
   */
  constructor(ctx, noise) {
    this.#ctx = ctx
    this.#noise = noise
  }

  /** Enveloppe : gain qui monte en `attack`, puis retombe en `decay` (courbes exponentielles). */
  env(start, attack, decay, peak) {
    const g = this.#ctx.createGain()
    g.gain.setValueAtTime(0.0001, start)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay)
    return g
  }

  /** Bruit filtré (choc, souffle, crépitement), éventuellement balayé jusqu'à `sweepTo`. */
  noiseHit(out, t, { type = 'bandpass', freq = 800, q = 1, attack = 0.005, decay = 0.2, peak = 0.5, sweepTo = null }) {
    const v = this.vary
    const src = this.#ctx.createBufferSource()
    src.buffer = this.#noise
    src.loop = true // sons longs (rafale) : le bruit d'une seconde tourne en boucle
    const f = this.#ctx.createBiquadFilter()
    f.type = type
    f.frequency.setValueAtTime(freq * v, t)
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo * v, t + attack + decay)
    f.Q.value = q
    const g = this.env(t, attack, decay, peak)
    src.connect(f).connect(g).connect(out)
    src.start(t, Math.random() * 0.5)
    src.stop(t + attack + decay + 0.05)
  }

  /** Oscillateur (note, grave, sifflement), éventuellement glissé jusqu'à `to`. */
  tone(out, t, { type = 'sine', freq = 440, to = null, attack = 0.01, decay = 0.3, peak = 0.3, detune = 0 }) {
    const v = this.vary
    const o = this.#ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq * v, t)
    if (detune && o.detune) o.detune.value = detune
    if (to) o.frequency.exponentialRampToValueAtTime(to * v, t + attack + decay)
    const g = this.env(t, attack, decay, peak)
    o.connect(g).connect(out)
    o.start(t)
    o.stop(t + attack + decay + 0.05)
  }

  /** Cuivre (cor, trompette) : dents de scie dont le filtre s'ouvre à l'attaque. */
  brass(out, t, freq, dur, peak) {
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
  timpani(out, t, freq, peak) {
    this.tone(out, t, { freq: freq * 1.12, to: freq, attack: 0.004, decay: 0.9, peak })
    this.tone(out, t, { freq: freq * 1.5, attack: 0.004, decay: 0.35, peak: peak * 0.3 })
    this.noiseHit(out, t, { type: 'lowpass', freq: 900, decay: 0.08, peak: peak * 0.5 })
  }

  /** Cloche claire : partiels inharmoniques (son de verre, d'étoile, de magie). */
  bell(out, t, freq, peak, decay = 0.9) {
    for (const [ratio, amp] of [[1, 1], [2.76, 0.45], [5.4, 0.2], [8.93, 0.08]]) {
      this.tone(out, t, { freq: freq * ratio, attack: 0.002, decay: decay / Math.sqrt(ratio), peak: peak * amp })
    }
  }

  /** Gravats : petits chocs épars qui s'espacent (morceaux qui roulent). */
  rattle(out, t, count, { freq = 1400, spread = 0.5, peak = 0.12 } = {}) {
    let at = t
    for (let i = 0; i < count; i++) {
      at += Math.random() * spread * (0.3 + i / count)
      this.noiseHit(out, at, { type: 'bandpass', freq: freq * (0.6 + Math.random() * 0.9), q: 3 + Math.random() * 4, attack: 0.001, decay: 0.03 + Math.random() * 0.05, peak: peak * (1 - (i / count) * 0.6) })
    }
  }

  /**
   * Cri synthétisé (aucun enregistrement) : une voix en dents de scie dont la
   * hauteur monte puis s'effondre, passée dans deux formants de voyelle « a »,
   * avec un vibrato et un souffle. `pitch` distingue les voix (soldat, chevalier, roi).
   */
  scream(out, t, pitch) {
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
    const g = this.env(t, 0.03, dur, 0.22)
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
    this.noiseHit(out, t, { type: 'bandpass', freq: 1500, q: 1.2, attack: 0.02, decay: dur * 0.7, peak: 0.05 })
  }
}
