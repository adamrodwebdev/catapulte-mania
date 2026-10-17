import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SOUND_IDS } from '../src/game/audio/AudioService.js'
import { SOUND_RECIPES } from '../src/game/audio/soundRecipes.js'
import { SynthVoices } from '../src/game/audio/SynthVoices.js'

test('v6.2 : une recette par effet sonore, et rien d’autre', () => {
  assert.deepEqual(Object.keys(SOUND_RECIPES).sort(), [...SOUND_IDS].sort())
  for (const id of SOUND_IDS) assert.equal(typeof SOUND_RECIPES[id], 'function', id)
})

test('v6.2 : briques de synthèse : la variation de hauteur s’applique aux fréquences', () => {
  const calls = []
  const param = () => ({ setValueAtTime: (v) => calls.push(v), exponentialRampToValueAtTime: (v) => calls.push(v), value: 0 })
  const node = (extra = {}) => ({ connect: (n) => n, start() {}, stop() {}, ...extra })
  const ctx = {
    createGain: () => node({ gain: param() }),
    createOscillator: () => node({ frequency: param(), detune: param(), type: '' }),
    createBufferSource: () => node({ buffer: null, loop: false }),
    createBiquadFilter: () => node({ frequency: param(), Q: param(), type: '' }),
  }
  const v = new SynthVoices(ctx, {})
  v.vary = 1.05
  v.tone({}, 0, { freq: 400, attack: 0.01, decay: 0.1, peak: 0.2 })
  assert.ok(calls.includes(420), 'la note est désaccordée de 5 %')
})
