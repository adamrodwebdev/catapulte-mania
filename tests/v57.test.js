import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AudioService, SOUND_IDS } from '../src/game/audio/AudioService.js'
import { AmbienceDirector, AMBIENCE_PROFILES } from '../src/game/audio/AmbienceDirector.js'
import { Camera } from '../src/game/rendering/Camera.js'
import { ParticleSystem } from '../src/game/effects/ParticleSystem.js'
import { mix, moteKind } from '../src/game/assets/procedural/scenery.js'
import { THEMES } from '../src/game/assets/procedural/painters.js'
import { GameSession } from '../src/game/GameSession.js'
import { LevelRepository } from '../src/game/levels/LevelRepository.js'

/** Faux contexte Web Audio complet : compte les nœuds créés et les sources lancées. */
class FakeAudioContext {
  static last = null
  currentTime = 0
  sampleRate = 8000
  state = 'running'
  destination = {}
  stats = { started: 0, convolvers: 0, compressors: 0 }
  constructor() {
    FakeAudioContext.last = this
  }
  #param() {
    return { value: 0, setValueAtTime() {}, setTargetAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }
  }
  #node(extra = {}) {
    return { connect: (n) => n, disconnect() {}, ...extra }
  }
  #source(extra) {
    const stats = this.stats
    return this.#node({ start() { stats.started++ }, stop() {}, ...extra })
  }
  createGain() { return this.#node({ gain: this.#param() }) }
  createStereoPanner() { return this.#node({ pan: this.#param() }) }
  createBiquadFilter() { return this.#node({ frequency: this.#param(), Q: this.#param(), type: '' }) }
  createOscillator() { return this.#source({ frequency: this.#param(), detune: this.#param(), type: '', setPeriodicWave() {} }) }
  createBufferSource() { return this.#source({ buffer: null, loop: false }) }
  createBuffer(channels, len) { return { length: len, numberOfChannels: channels, getChannelData: () => new Float32Array(len) } }
  createConvolver() { this.stats.convolvers++; return this.#node({ buffer: null }) }
  createDynamicsCompressor() {
    this.stats.compressors++
    return this.#node({ threshold: this.#param(), knee: this.#param(), ratio: this.#param(), attack: this.#param(), release: this.#param() })
  }
  createPeriodicWave() { return {} }
  resume() { return Promise.resolve() }
  suspend() { return Promise.resolve() }
}

function withFakeAudio(fn) {
  const saved = globalThis.AudioContext
  globalThis.AudioContext = FakeAudioContext
  try {
    return fn()
  } finally {
    globalThis.AudioContext = saved
  }
}

test('son : chaîne de mixage complète (réverbération, colle, limiteur)', () => {
  withFakeAudio(() => {
    const audio = new AudioService()
    audio.unlock()
    const ctx = FakeAudioContext.last
    assert.equal(ctx.stats.convolvers, 1, 'une réverbération partagée')
    assert.equal(ctx.stats.compressors, 2, 'compresseur des effets + limiteur de sortie')
  })
})

test('son : chaque effet se synthétise sans erreur et lance des sources', () => {
  withFakeAudio(() => {
    const audio = new AudioService()
    audio.unlock()
    const ctx = FakeAudioContext.last
    for (const id of SOUND_IDS) {
      const before = ctx.stats.started
      ctx.currentTime += 1
      audio.play(id, { intensity: 1 })
      assert.ok(ctx.stats.started > before, `le son « ${id} » joue quelque chose`)
    }
  })
})

test('son coupé : ni effet ni sifflement', () => {
  withFakeAudio(() => {
    const audio = new AudioService()
    audio.unlock()
    audio.muted = true
    const ctx = FakeAudioContext.last
    const before = ctx.stats.started
    audio.play('explosion')
    assert.equal(audio.loop('flight'), null)
    assert.equal(ctx.stats.started, before)
  })
})

test('sifflement du projectile : suit la vitesse, s’arrête une seule fois', () => {
  withFakeAudio(() => {
    const audio = new AudioService()
    audio.unlock()
    const flight = audio.loop('flight')
    assert.ok(flight)
    flight.update({ pan: 0.5, speed: 0.8 })
    flight.stop()
    flight.stop()
    flight.update({ speed: 1 })
    assert.equal(audio.loop('inconnu'), null)
  })
})

test('ambiance : un paysage sonore par chapitre, voix programmées puis arrêtées', () => {
  assert.equal(Object.keys(AMBIENCE_PROFILES).length, 10)
  for (const p of Object.values(AMBIENCE_PROFILES)) {
    assert.ok(p.wind > 0 && p.wind <= 1)
    assert.ok(Object.values(p.voices).every((n) => n > 0))
  }
  withFakeAudio(() => {
    const audio = new AudioService()
    const amb = new AmbienceDirector(audio, { random: () => 0.5 })
    amb.play(4)
    assert.equal(amb.playing, false, 'rien avant le premier geste du joueur')
    audio.unlock()
    assert.equal(amb.playing, true)
    amb.stop()
    assert.equal(amb.playing, false)
    amb.setEnabled(false)
    amb.play(9)
    assert.equal(amb.playing, false, 'ambiance coupée')
  })
})

test('caméra : tremblement à traumatisme, qui s’éteint et respecte le réglage', () => {
  const cam = new Camera()
  cam.resize(1280, 720)
  cam.shake(8)
  assert.ok(cam.trauma > 0.4 && cam.trauma < 0.6)
  cam.shake(100)
  assert.equal(cam.trauma, 1, 'plafonné')
  for (let i = 0; i < 60; i++) cam.update(16)
  assert.equal(cam.trauma, 0, 'éteint en moins d’une seconde')
  assert.deepEqual(cam.offset, { x: 0, y: 0, roll: 0 })
  cam.shakeEnabled = false
  cam.shake(12)
  assert.equal(cam.trauma, 0)
})

test('enchaînement : un seul titre à la fois, il finit par disparaître', () => {
  const ps = new ParticleSystem()
  ps.callout(1000, 500, 'Doublé !', 1)
  ps.callout(1000, 500, 'Triplé !', 2)
  assert.equal(ps.countOf('callout'), 1)
  for (let t = 0; t < 2000; t += 16) ps.update(16)
  assert.equal(ps.countOf('callout'), 0)
})

test('décor : mélange de couleurs et poussières d’ambiance par chapitre', () => {
  assert.equal(mix('#000000', '#ffffff', 0.5), '#808080')
  assert.equal(mix('#102030', '#102030', 0.3), '#102030')
  assert.equal(moteKind(1, THEMES[1]), 'pollen')
  assert.equal(moteKind(4, THEMES[4]), 'firefly')
  assert.equal(moteKind(6, THEMES[6]), 'sand')
  assert.equal(moteKind(9, THEMES[9]), null, 'la pluie suffit')
  assert.equal(moteKind(10, THEMES[10]), 'ember')
})

test('enchaînement en partie : deux défenseurs d’un seul tir font un « doublé »', () => {
  const s = new GameSession(LevelRepository.get(1), { difficulty: 'normal', completedLevels: 0, reducedMotion: false })
  const callouts = []
  const combos = []
  s.on('callout', (c) => callouts.push(c))
  s.on('feedback', (f) => f.sound === 'combo' && combos.push(f))
  let n = 0
  while (s.state !== 'aiming' && n++ < 500) s.update(33)
  s.aim(35, 0.47)
  s.fire()
  n = 0
  while (s.state !== 'ended' && n++ < 3000) s.update(1000 / 30)
  assert.equal(s.state, 'ended')
  // Le doublé, puis le titre de victoire au-dessus des ruines (v6.0).
  assert.deepEqual(callouts.map((c) => [c.key, c.tier]), [['double', 1], ['victory', 3]])
  assert.equal(combos.length, 1)
  assert.equal(combos[0].caption, 'combo')
  s.destroy()
})
