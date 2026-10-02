import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MusicDirector, PIECES } from '../src/game/audio/MusicDirector.js'

/** Faux contexte Web Audio : compte les notes jouées. */
function fakeAudio() {
  const param = () => ({ value: 0, setValueAtTime() {}, setTargetAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} })
  const node = (extra = {}) => ({ connect(n) { return n }, disconnect() {}, ...extra })
  const stats = { notes: 0 }
  const ctx = {
    currentTime: 0,
    sampleRate: 8000,
    createGain: () => node({ gain: param() }),
    createBiquadFilter: () => node({ frequency: param(), Q: param(), type: '' }),
    createOscillator: () => node({ frequency: param(), type: '', start() { stats.notes++ }, stop() {} }),
    createBuffer: (c, len) => ({ length: len, getChannelData: () => new Float32Array(len) }),
    createBufferSource: () => node({ buffer: null, start() {}, stop() {} }),
  }
  const audio = { whenReady: (fn) => fn(ctx, node({ gain: param() })) }
  return { audio, ctx, stats }
}

test('musique : quatre morceaux modaux, grilles de 4 ou 8 mesures', () => {
  for (const p of Object.values(PIECES)) {
    assert.ok(p.bpm >= 60 && p.bpm <= 140)
    assert.equal(p.scale.length, 7)
    assert.ok([4, 8].includes(p.chords.length))
  }
})

test('musique : plus l’intensité monte, plus il y a de notes', () => {
  const counts = []
  for (const level of [0, 1, 2, 3]) {
    const { audio, ctx, stats } = fakeAudio()
    const m = new MusicDirector(audio)
    m.play('chapter', { chapter: 3 })
    m.setIntensity(level)
    // 16 secondes de musique, ordonnancées pas à pas.
    for (let t = 0; t < 16; t += 0.05) {
      ctx.currentTime = t
      m.tick()
    }
    m.setEnabled(false)
    counts.push(stats.notes)
  }
  assert.ok(counts[0] > 0)
  for (let i = 1; i < 4; i++) assert.ok(counts[i] > counts[i - 1], counts.join(' < '))
})

test('musique coupée : rien n’est joué', () => {
  const { audio, stats } = fakeAudio()
  const m = new MusicDirector(audio)
  m.setEnabled(false)
  m.play('menu')
  assert.equal(m.playing, false)
  assert.equal(stats.notes, 0)
})
