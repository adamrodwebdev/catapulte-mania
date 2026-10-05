import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ACHIEVEMENTS, evaluateAchievements, emptyRun, killFamily } from '../src/game/progression/Achievements.js'
import { LevelRepository } from '../src/game/levels/LevelRepository.js'
import { ScoreKeeper } from '../src/game/score/ScoreKeeper.js'

test('trois défis par niveau, un de chaque famille autant que possible, et de la variété', () => {
  const used = new Set()
  let mixed = 0
  for (const l of LevelRepository.all()) {
    assert.equal(new Set(l.achievements).size, 3, `niveau ${l.id}`)
    l.achievements.forEach((id) => {
      assert.ok(ACHIEVEMENTS[id], id)
      assert.ok(ACHIEVEMENTS[id].eligible(l), `niveau ${l.id} : ${id} n'a pas de sens ici`)
      used.add(id)
    })
    if (new Set(l.achievements.map((id) => ACHIEVEMENTS[id].family)).size === 3) mixed++
  }
  assert.equal(used.size, Object.keys(ACHIEVEMENTS).length, 'tous les défis servent')
  assert.ok(mixed >= 95, `${mixed} niveaux avec les trois familles`)
})

test('le moteur de score compte les exploits : carton, entrée fracassante, éboulement', () => {
  const level = LevelRepository.get(30)
  const k = new ScoreKeeper(level, 'normal')
  const target = (type = 'soldier') => ({ kind: 'target', type, scoreValue: 500 })
  k.startShot('stone')
  k.registerDestroyed(target(), 'crush')
  k.registerDestroyed(target(), 'pinned')
  k.registerDestroyed(target('king'), 'fire')
  k.startShot('bomb')
  k.registerDestroyed(target(), 'explosion')
  const r = k.finalize({ won: true, shotsLeft: 0, shotsUsed: 2 })
  assert.ok(r.achievements >= 0 && r.achievements <= 7)
  const run = { ...emptyRun(), shotsUsed: 2, shotsLeft: 0, specialsUsed: 1, powersUsed: 0, barrelsExploded: 0, blocksDestroyed: 0, maxShotKills: 3, firstShotKills: 3, kills: { fire: 1, explosion: 1, crush: 2, fall: 0 } }
  const fake = { ...level, achievements: ['lastStand', 'carton', 'landslide'] }
  assert.equal(evaluateAchievements(fake, run), 0b111)
  assert.equal(killFamily('squeezed'), 'crush')
  assert.equal(killFamily('impact'), null)
})
