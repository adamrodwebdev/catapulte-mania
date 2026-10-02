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
