import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TutorialCoach, tutorialSteps } from '../src/game/tutorial/Tutorial.js'
import { LevelRepository } from '../src/game/levels/LevelRepository.js'
import { PowerRegistry } from '../src/game/powers/PowerRegistry.js'
import { StoryMode } from '../src/game/modes/modes.js'
import { DIFFICULTY } from '../src/config/gameConfig.js'

test('chaque munition et chaque pouvoir a son niveau tutoriel, un seul par niveau', () => {
  const tools = LevelRepository.all().map((l) => l.tutorial).filter(Boolean)
  assert.equal(tools[0], 'aim')
  assert.equal(new Set(tools).size, tools.length, 'pas de doublon')
  for (const ammo of ['fire', 'boulder', 'bomb', 'split']) assert.ok(tools.includes(`ammo:${ammo}`), ammo)
  for (const p of PowerRegistry.all()) assert.ok(tools.includes(`power:${p.id}`), p.id)
  assert.equal(LevelRepository.tutorialFor(9), 'ammo:fire', 'le feu grégeois arrive au niveau 9')
})

test('niveau tutoriel : la munition présentée reste disponible en Difficile', () => {
  for (const l of LevelRepository.all().filter((x) => x.tutorial?.startsWith('ammo:'))) {
    const ammo = new StoryMode({}).ammoFor(l, DIFFICULTY.hard)
    assert.ok(ammo[l.tutorial.slice(5)] >= 1, `niveau ${l.id}`)
  }
})

test('le tutoriel avance au rythme des actions attendues', () => {
  const c = new TutorialCoach('ammo:fire')
  assert.equal(c.step.id, 'select')
  c.notify('fire', 'stone')
  assert.equal(c.step.id, 'select', 'un mauvais événement ne fait pas avancer')
  c.notify('select', 'boulder')
  assert.equal(c.step.id, 'select')
  c.notify('select', 'fire')
  assert.equal(c.step.anchor, 'fire')
  c.notify('fire', 'fire')
  c.notify('turn')
  assert.equal(c.step.id, 'done')
  c.notify('fire', 'stone')
  assert.equal(c.done, true)
})

test('pouvoir immédiat (séisme) : pas d’étape de tir', () => {
  const ids = tutorialSteps('power:quake').map((s) => s.id)
  assert.deepEqual(ids, ['open', 'use', 'watch', 'done'])
  assert.throws(() => tutorialSteps('ammo:<script>'))
})

test('campagne : toute munition découverte reste disponible ensuite', () => {
  const l = LevelRepository.get(30)
  const fresh = new StoryMode({ completedLevels: 29 }).ammoFor(l, DIFFICULTY.hard)
  for (const type of ['boulder', 'fire', 'bomb', 'split']) assert.ok(fresh[type] >= 1, type)
  // Au niveau 5, rien n'a encore été découvert.
  assert.deepEqual(new StoryMode({ completedLevels: 4 }).ammoFor(LevelRepository.get(5), DIFFICULTY.normal), {})
  // Un niveau ancien rejoué après la découverte du feu en profite aussi.
  assert.ok(new StoryMode({ completedLevels: 12 }).ammoFor(LevelRepository.get(3), DIFFICULTY.normal).fire >= 1)
})
