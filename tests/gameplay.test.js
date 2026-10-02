import { test } from 'node:test'
import assert from 'node:assert/strict'
import Matter from 'matter-js'
import { EventBus } from '../src/core/utils/EventBus.js'
import { PhysicsWorld } from '../src/game/physics/PhysicsWorld.js'
import { Projectile } from '../src/game/entities/Projectile.js'
import { Catapult } from '../src/game/Catapult.js'
import { TrajectoryPredictor } from '../src/game/TrajectoryPredictor.js'
import { GameSession } from '../src/game/GameSession.js'
import { LevelRepository } from '../src/game/levels/LevelRepository.js'
import { PowerRegistry } from '../src/game/powers/PowerRegistry.js'
import { starsFor, maxScore } from '../src/game/score/ScoreRules.js'
import { LevelResult } from '../src/domain/LevelResult.js'

test('les 100 niveaux sont construits, valides et gelés', () => {
  const all = LevelRepository.all()
  assert.equal(all.length, 100)
  for (const l of all) {
    assert.ok(Object.isFrozen(l) && Object.isFrozen(l.blocks))
    assert.ok(l.targets.length > 0)
    assert.equal(l.chapter, Math.ceil(l.id / 10))
  }
})

test('la difficulté augmente : matériaux et munitions par chapitre', () => {
  const mats = (ids) => new Set(ids.flatMap((id) => LevelRepository.get(id).blocks.map((b) => b.material)))
  const ch1 = mats([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  assert.ok(!ch1.has('stone') && !ch1.has('iron'), 'chapitre 1 : bois et paille uniquement')
  assert.ok(mats([11, 12, 13, 14, 15]).has('stone'))
  assert.ok(mats([21, 22, 23]).has('iron'))
  assert.deepEqual(LevelRepository.newAmmo(21), ['bomb'])
  assert.ok(LevelRepository.novelties(13).includes('barrel'))
})

test('l’aide à la trajectoire prédit exactement le vol réel', () => {
  const w = new PhysicsWorld(new EventBus(), { wind: -0.6 })
  const c = new Catapult(170)
  c.setAim(40, 0.6)
  const predicted = TrajectoryPredictor.predict(c.launchPoint, c.velocity, { wind: -0.6, every: 1, maxPoints: 120 })
  const p = w.add(new Projectile('stone', c.launchPoint.x, c.launchPoint.y))
  Matter.Body.setVelocity(p.body, c.velocity)
  for (let i = 0; i < 100; i++) {
    w.stepOnce()
    assert.ok(Math.abs(p.x - predicted[i].x) < 0.5 && Math.abs(p.y - predicted[i].y) < 0.5, `écart au pas ${i}`)
  }
})

test('étoiles : fonction croissante du score', () => {
  const l = LevelRepository.get(10)
  let prev = 0
  for (let s = 0; s <= l.maxScore; s += 250) {
    const st = starsFor(l, s)
    assert.ok(st >= prev && st >= 1 && st <= 3)
    prev = st
  }
  assert.ok(maxScore(l) > l.reference)
})

function playUntilAiming(s) {
  let n = 0
  while (s.state !== 'aiming' && n++ < 2000) s.update(1000 / 30)
}

test('déroulement d’un tour : tir, munitions, fin de tour', () => {
  const s = new GameSession(LevelRepository.get(11), { difficulty: 'normal', completedLevels: 10 })
  playUntilAiming(s)
  assert.equal(s.shotsLeft, 4)
  assert.equal(s.selectAmmo('boulder'), true)
  assert.equal(s.selectAmmo('bomb'), false, 'munition absente du niveau')
  s.aim(45, 0.5)
  assert.equal(s.fire(), true)
  assert.equal(s.fire(), false, 'pas de second tir pendant le vol')
  assert.equal(s.shotsLeft, 3)
  assert.equal(s.ammo.find((a) => a.type === 'boulder').count, 0, 'rocher épuisé')
  playUntilAiming(s)
  assert.equal(s.selectedAmmo, 'stone')
  s.destroy()
})

test('pouvoirs : verrouillés, un seul par tour, coût déduit', () => {
  const locked = new GameSession(LevelRepository.get(1), { difficulty: 'normal', completedLevels: 0 })
  playUntilAiming(locked)
  assert.equal(locked.usePower('calm'), false, 'pas encore débloqué')
  locked.destroy()

  const s = new GameSession(LevelRepository.get(12), { difficulty: 'normal', completedLevels: 11 })
  playUntilAiming(s)
  assert.ok(PowerRegistry.get('titan').isUnlocked(11))
  assert.equal(s.usePower('titan'), true)
  assert.equal(s.usePower('calm'), false, 'un seul pouvoir par tour')
  assert.equal(s.hud.powers.find((p) => p.id === 'titan').armed, true)
  s.aim(80, 0.05) // tir perdu : la partie continue
  s.fire()
  playUntilAiming(s)
  assert.equal(s.usePower('calm'), true, 'nouveau tour : pouvoir à nouveau disponible')
  s.destroy()
})

test('fin de niveau : résultat authentifié et défaite sans tirs', () => {
  const s = new GameSession(LevelRepository.get(1), { difficulty: 'hard', completedLevels: 0, reducedMotion: true })
  let end = null
  s.on('end', (e) => (end = e))
  playUntilAiming(s)
  for (let i = 0; i < 3 && !end; i++) {
    s.aim(80, 0.05) // tir volontairement raté
    s.fire()
    let n = 0
    while (s.state !== 'aiming' && !end && n++ < 2000) s.update(1000 / 30)
  }
  assert.ok(end)
  assert.equal(end.won, false)
  assert.ok(LevelResult.isAuthentic(end.result))
  assert.equal(end.result.score, 0)
  s.destroy()
})
