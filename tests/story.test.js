import { test } from 'node:test'
import assert from 'node:assert/strict'
import { StoryRepository } from '../src/game/story/StoryRepository.js'
import { DICTIONARIES } from '../src/i18n/index.js'

test('la Chronique : un prologue, un épisode par chapitre, un épilogue', () => {
  assert.equal(StoryRepository.before(1).id, 'prologue')
  for (let c = 2; c <= 10; c++) assert.ok(StoryRepository.before((c - 1) * 10 + 1), `chapitre ${c}`)
  assert.equal(StoryRepository.after(100).id, 'epilogue')
  assert.equal(StoryRepository.before(5), null)
})

test('chaque page de la Chronique est traduite dans toutes les langues', () => {
  for (const [lang, dict] of Object.entries(DICTIONARIES)) {
    for (const b of StoryRepository.all()) {
      assert.equal(typeof dict.story[b.id].title, 'string', `${lang} ${b.id}`)
      b.pages.forEach((_, i) => assert.ok(dict.story[b.id][`p${i + 1}`]?.length > 20, `${lang} ${b.id} p${i + 1}`))
    }
  }
})

test('épisodes relisibles : seulement ceux déjà découverts', () => {
  assert.deepEqual(StoryRepository.unlocked(0).map((b) => b.id), ['prologue'])
  assert.equal(StoryRepository.unlocked(10).length, 2)
  assert.equal(StoryRepository.unlocked(100).length, 11)
})

test('une réplique traduite avant chacun des 100 niveaux, par un personnage connu', () => {
  for (let id = 1; id <= 100; id++) {
    const { speaker, key } = StoryRepository.line(id)
    for (const [lang, dict] of Object.entries(DICTIONARIES)) {
      assert.ok(dict.characters[speaker].name, `${lang} ${speaker}`)
      assert.ok(dict.story.lines[key.split('.').pop()]?.length > 15, `${lang} ${key}`)
    }
  }
})

test('portraits pixel art : décodés sans image, aux bonnes dimensions', async () => {
  const { decodePortrait, CHARACTERS } = await import('../src/game/story/Portraits.js')
  for (const id of Object.keys(CHARACTERS)) {
    const p = decodePortrait(id)
    assert.equal(p.pixels.length, p.w * p.h * 4)
    let opaque = 0
    for (let i = 3; i < p.pixels.length; i += 4) if (p.pixels[i]) opaque++
    assert.ok(opaque > p.w * p.h * 0.3 && opaque < p.w * p.h, `${id} : ${opaque} pixels opaques`)
  }
  assert.throws(() => decodePortrait('bowser'))
})
