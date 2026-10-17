import { clamp } from '../../core/utils/math.js'
import { SKY_BEDS } from '../sky/skyConfig.js'

/**
 * Ambiance sonore des champs de bataille (v5.7), synthétisée en temps réel.
 *
 * Chaque chapitre a son paysage sonore, sous la musique et les effets :
 * vent qui respire (toujours), oiseaux le jour, grillons et chouette la nuit,
 * grenouilles et corneilles dans les marais, cri du faucon dans le désert et
 * la montagne, hurlement du vent en hiver, pluie et tonnerre lointain dans la
 * tempête, crépitement des braseros au dernier chapitre.
 *
 * Le lit (vent, pluie) est continu ; les voix (oiseaux, grillons…) sont tirées
 * au hasard à intervalles irréguliers, à gauche ou à droite : jamais de boucle
 * audible. Tout passe par le bus d'ambiance de l'AudioService (volume des
 * effets, coupé avec le son, envoyé dans la réverbération commune).
 */

/**
 * Profil de chaque chapitre : niveau du vent (0..1), hurlement, pluie, et voix
 * ponctuelles avec leur fréquence moyenne (événements par minute).
 */
export const AMBIENCE_PROFILES = Object.freeze({
  1: { wind: 0.25, voices: { bird: 9 } },
  2: { wind: 0.35, voices: { bird: 6, crow: 1.5 } },
  3: { wind: 0.3, voices: { bird: 3, cricket: 8 } },
  4: { wind: 0.25, voices: { cricket: 16, owl: 2.5 } },
  5: { wind: 0.2, voices: { frog: 14, crow: 2.5 } },
  6: { wind: 0.5, voices: { hawk: 1.8 } },
  7: { wind: 0.65, voices: { hawk: 1.5 } },
  8: { wind: 0.75, howl: true, voices: { crow: 1 } },
  9: { wind: 0.5, rain: true, voices: { rumble: 2.4 } },
  10: { wind: 0.35, voices: { crackle: 22, cricket: 5, rumble: 1 } },
})

/**
 * Profil joué (v6.3) : celui du chapitre, ajusté quand son fond peint s'anime
 * (ciel vivant) — à l'Orage, le tonnerre suit désormais les éclairs, plus de
 * grondement au hasard ; au Fort de pierre, la cascade gronde doucement.
 * @param {number} chapter
 * @param {boolean} painted le chapitre a-t-il son fond peint (et son ciel vivant) ?
 */
export function ambienceProfile(chapter, painted) {
  const base = AMBIENCE_PROFILES[chapter] ?? AMBIENCE_PROFILES[1]
  if (!painted) return base
  const voices = { ...base.voices }
  if (chapter === 9) delete voices.rumble
  return { ...base, voices, bed: SKY_BEDS[chapter] ?? null }
}

/** Niveau des sons du ciel vivant, dans le bus d'ambiance (v6.3). */
const SKY_LEVEL = Object.freeze({ thunder: 1.2, gust: 0.07, devil: 0.025, plip: 0.03, falls: 0.06 })

export class AmbienceDirector {
  /** @type {AudioContext | null} */
  #ctx = null
  #bus = null
  #noise = null
  /** Nœuds du lit en cours (vent, pluie), pour le fondu de sortie. */
  #bed = null
  #timers = new Set()
  #chapter = 0
  /** Le chapitre a-t-il son fond peint (v6.3) ? */
  #painted = false
  #enabled = true
  #rand = Math.random
  #white = null

  /**
   * @param {import('./AudioService.js').AudioService} audio
   * @param {{ random?: () => number }} [opts] hasard injectable (tests)
   */
  constructor(audio, { random } = {}) {
    if (random) this.#rand = random
    audio.whenReady((ctx, _music, extra) => {
      this.#ctx = ctx
      this.#bus = extra?.ambience ?? null
      if (this.#chapter) this.#start()
    })
  }

  get playing() {
    return Boolean(this.#bed)
  }

  /** Coupe ou rétablit l'ambiance. */
  setEnabled(on) {
    this.#enabled = Boolean(on)
    if (!this.#enabled) this.#halt()
    else if (this.#chapter) this.#start()
  }

  /**
   * Lance le paysage sonore d'un chapitre (rien ne change s'il joue déjà).
   * @param {number} chapter
   * @param {{ painted?: boolean }} [opts] painted : le fond peint s'anime (v6.3, voir ambienceProfile)
   */
  play(chapter, { painted = false } = {}) {
    const c = clamp(Math.round(Number(chapter) || 1), 1, 10)
    if (c === this.#chapter && painted === this.#painted && this.playing) return
    this.#chapter = c
    this.#painted = painted
    this.#start()
  }

  /**
   * Un son du ciel vivant (v6.3), annoncé par un effet de la peinture :
   *  - `thunder` { distance 0..1, pan } : le tonnerre d'un éclair, d'autant plus tard et sourd qu'il est loin ;
   *  - `gust` { dir, seconds } : le souffle d'une risée, qui passe d'un côté à l'autre avec elle ;
   *  - `devil` { u, speed, seconds } : le sable qui siffle dans un tourbillon, et suit sa course ;
   *  - `plip` { u } : une goutte, quand un rond s'ouvre sur l'eau.
   * Sans ambiance en cours (coupée, ou pas encore lancée), rien ne joue.
   */
  sky(event) {
    if (!this.#bed || !this.#ctx || !event) return
    try {
      this.#skyVoice(event)
    } catch {
      /* son non critique */
    }
  }

  /** Fondu de sortie (fin de partie, retour au menu). */
  stop() {
    this.#chapter = 0
    this.#halt()
  }

  /* ---------- Interne ---------- */

  #start() {
    this.#halt()
    if (!this.#enabled || !this.#ctx || !this.#bus || !this.#chapter) return
    const profile = ambienceProfile(this.#chapter, this.#painted)
    try {
      this.#bed = this.#makeBed(profile)
    } catch {
      this.#bed = null
      return
    }
    for (const [voice, perMinute] of Object.entries(profile.voices)) this.#scheduleVoice(voice, perMinute)
  }

  #halt() {
    for (const id of this.#timers) clearTimeout(id)
    this.#timers.clear()
    const bed = this.#bed
    this.#bed = null
    if (!bed || !this.#ctx) return
    const t = this.#ctx.currentTime
    bed.gain.gain.setTargetAtTime(0.0001, t, 0.6)
    setTimeout(() => {
      for (const n of bed.sources) {
        try {
          n.stop()
        } catch {
          /* déjà arrêté */
        }
      }
      bed.gain.disconnect()
    }, 3000)
  }

  #noiseBuffer() {
    if (this.#noise) return this.#noise
    const ctx = this.#ctx
    // Deux secondes de bruit « brun » (grave et doux, comme du vent ou de la mer).
    const len = ctx.sampleRate * 2
    this.#noise = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = this.#noise.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (this.#rand() * 2 - 1)) / 1.02
      d[i] = last * 3.5
    }
    // Fondu aux bords : la boucle ne claque pas.
    const edge = Math.min(2000, len / 4)
    for (let i = 0; i < edge; i++) {
      d[i] *= i / edge
      d[len - 1 - i] *= i / edge
    }
    return this.#noise
  }

  /** Bruit blanc court (pluie, crépitements). */
  #whiteBuffer() {
    if (this.#white) return this.#white
    const ctx = this.#ctx
    const len = ctx.sampleRate
    this.#white = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = this.#white.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = this.#rand() * 2 - 1
    return this.#white
  }

  /** Lit continu : vent (deux souffles qui respirent à des rythmes différents), pluie. */
  #makeBed(profile) {
    const ctx = this.#ctx
    const gain = ctx.createGain()
    gain.gain.value = 0.0001
    gain.connect(this.#bus)
    gain.gain.setTargetAtTime(1, ctx.currentTime, 1.2)
    const sources = []
    const lfo = (rate, depth, target) => {
      const o = ctx.createOscillator()
      o.frequency.value = rate
      const g = ctx.createGain()
      g.gain.value = depth
      o.connect(g).connect(target)
      o.start()
      sources.push(o)
    }
    // Vent : bruit brun filtré, dont le filtre et le volume ondulent lentement.
    for (const [freq, rate, pan] of [[340, 0.071, -0.5], [520, 0.113, 0.5]]) {
      const src = ctx.createBufferSource()
      src.buffer = this.#noiseBuffer()
      src.loop = true
      const lp = ctx.createBiquadFilter()
      lp.type = profile.howl ? 'bandpass' : 'lowpass'
      lp.frequency.value = profile.howl ? freq * 1.2 : freq
      lp.Q.value = profile.howl ? 5 : 0.6
      const g = ctx.createGain()
      g.gain.value = profile.wind * 0.5
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain()
      if (p.pan) p.pan.value = pan
      src.connect(lp).connect(g).connect(p).connect(gain)
      lfo(rate, freq * (profile.howl ? 0.45 : 0.35), lp.frequency)
      lfo(rate * 0.73, profile.wind * 0.35, g.gain)
      src.start(ctx.currentTime, this.#rand() * 1.5)
      sources.push(src)
    }
    // Pluie : bruit blanc aigu et une couche plus grave (l'averse sur la terre), en murmure (v6.3).
    if (profile.rain) {
      for (const [type, freq, level] of [['highpass', 2400, 0.06], ['bandpass', 900, 0.035]]) {
        const src = ctx.createBufferSource()
        src.buffer = this.#whiteBuffer()
        src.loop = true
        const f = ctx.createBiquadFilter()
        f.type = type
        f.frequency.value = freq
        const g = ctx.createGain()
        g.gain.value = level
        src.connect(f).connect(g).connect(gain)
        lfo(0.05, level * 0.3, g.gain)
        src.start(ctx.currentTime, this.#rand())
        sources.push(src)
      }
    }
    // Cascade (v6.3, Fort de pierre peint) : un grondement grave et doux qui respire à peine.
    if (profile.bed === 'falls') {
      const src = ctx.createBufferSource()
      src.buffer = this.#noiseBuffer()
      src.loop = true
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 120
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 900
      const g = ctx.createGain()
      g.gain.value = SKY_LEVEL.falls
      src.connect(hp).connect(lp).connect(g).connect(gain)
      lfo(0.07, SKY_LEVEL.falls * 0.2, g.gain)
      src.start(ctx.currentTime, this.#rand() * 1.5)
      sources.push(src)
    }
    return { gain, sources }
  }

  /** Panoramique fixe (ou qui glisse de `from` à `to` en `seconds`), vers le lit en cours. */
  #pan(from, to = from, seconds = 0) {
    const ctx = this.#ctx
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain()
    if (p.pan) {
      const t = ctx.currentTime
      p.pan.setValueAtTime(clamp(from, -1, 1), t)
      if (seconds > 0) p.pan.linearRampToValueAtTime(clamp(to, -1, 1), t + seconds)
    }
    p.connect(this.#bed.gain)
    return p
  }

  /** Les sons du ciel vivant (voir sky). */
  #skyVoice(event) {
    const ctx = this.#ctx
    const now = ctx.currentTime
    const side = (u) => clamp(2 * u - 1, -0.8, 0.8)
    switch (event.kind) {
      case 'thunder': {
        // Un grondement qui s'ouvre puis s'éteint en s'assourdissant, après le temps du trajet du son.
        const d = clamp(event.distance ?? 0.5, 0, 1)
        const t = now + 0.5 + d * 1.4
        const src = ctx.createBufferSource()
        src.buffer = this.#noiseBuffer()
        src.loop = true
        const lp = ctx.createBiquadFilter()
        lp.type = 'lowpass'
        lp.frequency.setValueAtTime(1100 - d * 700, t)
        lp.frequency.exponentialRampToValueAtTime(110, t + 3)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.0001, t)
        g.gain.exponentialRampToValueAtTime(SKY_LEVEL.thunder * (0.85 - d * 0.45), t + 0.08)
        g.gain.exponentialRampToValueAtTime(0.0001, t + 3.1)
        src.connect(lp).connect(g).connect(this.#pan(event.pan ?? 0))
        src.start(t, this.#rand() * 1.5)
        src.stop(t + 3.2)
        break
      }
      case 'gust': {
        // Un souffle qui enfle puis retombe, et traverse la scène avec la risée.
        const T = clamp(event.seconds ?? 6, 4, 9)
        const dir = Math.sign(event.dir ?? 1) || 1
        const src = ctx.createBufferSource()
        src.buffer = this.#noiseBuffer()
        src.loop = true
        const bp = ctx.createBiquadFilter()
        bp.type = 'bandpass'
        bp.Q.value = 0.7
        bp.frequency.setValueAtTime(360, now)
        bp.frequency.linearRampToValueAtTime(760, now + T * 0.45)
        bp.frequency.linearRampToValueAtTime(380, now + T)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.0001, now)
        g.gain.exponentialRampToValueAtTime(SKY_LEVEL.gust, now + T * 0.45)
        g.gain.exponentialRampToValueAtTime(0.0001, now + T)
        src.connect(bp).connect(g).connect(this.#pan(-0.7 * dir, 0.7 * dir, T))
        src.start(now, this.#rand() * 1.5)
        src.stop(now + T + 0.1)
        break
      }
      case 'devil': {
        // Le sable siffle en tournant (un souffle qui pulse), et suit la course du tourbillon.
        const T = clamp(event.seconds ?? 12, 5, 16)
        const u = clamp(event.u ?? 0.5, 0, 1)
        const src = ctx.createBufferSource()
        src.buffer = this.#whiteBuffer()
        src.loop = true
        const bp = ctx.createBiquadFilter()
        bp.type = 'bandpass'
        bp.frequency.value = 2300
        bp.Q.value = 1.1
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.0001, now)
        g.gain.exponentialRampToValueAtTime(SKY_LEVEL.devil, now + 2.5)
        g.gain.setValueAtTime(SKY_LEVEL.devil, now + T - 2.5)
        g.gain.exponentialRampToValueAtTime(0.0001, now + T)
        const lfo = ctx.createOscillator()
        lfo.frequency.value = 2.6
        const depth = ctx.createGain()
        depth.gain.value = SKY_LEVEL.devil * 0.3
        lfo.connect(depth).connect(g.gain)
        src.connect(bp).connect(g).connect(this.#pan(side(u), side(u + (event.speed ?? 0) * T), T))
        src.start(now, this.#rand())
        src.stop(now + T + 0.1)
        lfo.start(now)
        lfo.stop(now + T + 0.1)
        break
      }
      case 'plip': {
        // Une goutte : un sinus qui monte très vite, à peine audible.
        const f0 = 650 + 300 * this.#rand()
        const o = ctx.createOscillator()
        o.type = 'sine'
        o.frequency.setValueAtTime(f0, now)
        o.frequency.exponentialRampToValueAtTime(f0 * 2.1, now + 0.06)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.0001, now)
        g.gain.exponentialRampToValueAtTime(SKY_LEVEL.plip, now + 0.008)
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.13)
        o.connect(g).connect(this.#pan(side(event.u ?? 0.5)))
        o.start(now)
        o.stop(now + 0.15)
        break
      }
    }
  }

  /** Programme une voix au hasard (loi exponentielle : pas de régularité audible). */
  #scheduleVoice(voice, perMinute) {
    const mean = 60000 / perMinute
    const delay = Math.min(mean * 3, -Math.log(1 - this.#rand() * 0.98) * mean) + 400
    const id = setTimeout(() => {
      this.#timers.delete(id)
      if (!this.#bed) return
      // Contexte en veille (onglet caché) : on n'empile pas les sons pour plus tard.
      if (this.#ctx.state === 'running') {
        try {
          this.#voice(voice)
        } catch {
          /* son non critique */
        }
      }
      this.#scheduleVoice(voice, perMinute)
    }, delay)
    this.#timers.add(id)
  }

  /** Sortie d'une voix : panoramique au hasard, un peu étouffée (elle est loin). */
  #out(distance = 0.5) {
    const ctx = this.#ctx
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 9000 - distance * 6500
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain()
    if (p.pan) p.pan.value = (this.#rand() * 2 - 1) * 0.85
    lp.connect(p).connect(this.#bed.gain)
    return lp
  }

  #chirp(out, t, f0, f1, dur, peak, type = 'sine') {
    const ctx = this.#ctx
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(f0, t)
    o.frequency.exponentialRampToValueAtTime(f1, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.02, dur / 3))
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(out)
    o.start(t)
    o.stop(t + dur + 0.02)
    return o
  }

  #burst(out, t, { type = 'bandpass', freq = 1000, q = 1, dur = 0.05, peak = 0.1 }) {
    const ctx = this.#ctx
    const src = ctx.createBufferSource()
    src.buffer = this.#whiteBuffer()
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.01, dur / 4))
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(out)
    src.start(t, this.#rand() * 0.5)
    src.stop(t + dur + 0.02)
  }

  #voice(kind) {
    const t = this.#ctx.currentTime + 0.05
    const r = this.#rand
    switch (kind) {
      case 'bird': {
        // Gazouillis : 2 à 6 notes rapides qui glissent, comme un merle lointain.
        const out = this.#out(0.3 + r() * 0.5)
        const notes = 2 + Math.floor(r() * 5)
        const base = 2200 + r() * 1800
        let at = t
        for (let i = 0; i < notes; i++) {
          const f = base * (0.8 + r() * 0.5)
          const d = 0.05 + r() * 0.09
          this.#chirp(out, at, f, f * (r() < 0.5 ? 1.35 : 0.7), d, 0.03 + r() * 0.03)
          at += d + 0.02 + r() * 0.07
        }
        break
      }
      case 'cricket': {
        // Grillon : trains de trois impulsions très aiguës, répétés.
        const out = this.#out(0.4 + r() * 0.4)
        const f = 4200 + r() * 600
        const trains = 2 + Math.floor(r() * 4)
        for (let k = 0; k < trains; k++) for (let i = 0; i < 3; i++) this.#chirp(out, t + k * 0.42 + i * 0.045, f, f * 0.98, 0.03, 0.018)
        break
      }
      case 'owl': {
        // Chouette hulotte : « hou… hou-hou ».
        const out = this.#out(0.6)
        this.#chirp(out, t, 420, 390, 0.42, 0.05)
        this.#chirp(out, t + 0.75, 410, 380, 0.18, 0.035)
        this.#chirp(out, t + 1.0, 420, 370, 0.5, 0.045)
        break
      }
      case 'frog': {
        // Grenouille : coassement rauque (dents de scie hachées).
        const out = this.#out(0.3 + r() * 0.5)
        const f = 110 + r() * 80
        const croaks = 1 + Math.floor(r() * 3)
        for (let i = 0; i < croaks; i++) {
          const o = this.#chirp(out, t + i * 0.32, f, f * 0.85, 0.16, 0.035, 'sawtooth')
          const am = this.#ctx.createOscillator()
          am.frequency.value = 28
          const amg = this.#ctx.createGain()
          amg.gain.value = f * 0.25
          am.connect(amg).connect(o.frequency)
          am.start(t + i * 0.32)
          am.stop(t + i * 0.32 + 0.2)
        }
        break
      }
      case 'crow': {
        // Corneille lointaine : deux ou trois « croa » rauques.
        const out = this.#out(0.6 + r() * 0.3)
        const caws = 2 + Math.floor(r() * 2)
        for (let i = 0; i < caws; i++) {
          this.#chirp(out, t + i * 0.38, 620, 440, 0.22, 0.03, 'sawtooth')
          this.#burst(out, t + i * 0.38, { freq: 1300, q: 3, dur: 0.18, peak: 0.02 })
        }
        break
      }
      case 'hawk': {
        // Faucon : long cri descendant, avec un léger trémolo.
        const out = this.#out(0.55)
        const o = this.#chirp(out, t, 2600, 1500, 0.95, 0.035)
        const v = this.#ctx.createOscillator()
        v.frequency.value = 22
        const vg = this.#ctx.createGain()
        vg.gain.value = 90
        v.connect(vg).connect(o.frequency)
        v.start(t)
        v.stop(t + 1)
        break
      }
      case 'rumble': {
        // Tonnerre au loin : grondement grave et long, sans éclair.
        const out = this.#out(0.8)
        this.#burst(out, t, { type: 'lowpass', freq: 160, dur: 3.2, peak: 0.22 })
        this.#burst(out, t + 0.6, { type: 'lowpass', freq: 110, dur: 2.6, peak: 0.16 })
        break
      }
      case 'crackle': {
        // Braseros : petits claquements secs.
        const out = this.#out(0.2 + r() * 0.4)
        const pops = 1 + Math.floor(r() * 4)
        for (let i = 0; i < pops; i++) this.#burst(out, t + r() * 0.3, { freq: 1500 + r() * 2500, q: 2, dur: 0.02 + r() * 0.03, peak: 0.04 + r() * 0.05 })
        break
      }
    }
  }
}
