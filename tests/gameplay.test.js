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
  // Le premier baril de poudre arrive dès le niveau 2 (différenciation, v4.5).
  assert.ok(LevelRepository.novelties(2).includes('barrel'))
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

test('étoiles : 3 en par tirs, puis de moins en moins avec les tirs', () => {
  for (const l of LevelRepository.all()) {
    assert.ok(l.par >= 1 && l.par <= 2 && l.par <= l.star2 && l.star2 <= l.shots, `niveau ${l.id}`)
    let prev = 3
    for (let n = 1; n <= l.shots + 3; n++) {
      const st = starsFor(l, n)
      assert.ok(st <= prev && st >= 1 && st <= 3)
      prev = st
    }
    assert.equal(starsFor(l, l.par), 3)
    assert.equal(starsFor(l, l.par + 1), l.par + 1 <= l.star2 ? 2 : 1)
    assert.equal(l.achievements.length, 3)
    assert.equal(new Set(l.achievements).size, 3, `succès distincts niveau ${l.id}`)
  }
  const l = LevelRepository.get(10)
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

test('victoire sans tir : les dernières cibles tombent pendant la visée (feu, séisme)', () => {
  const s = new GameSession(LevelRepository.get(1), { difficulty: 'normal', completedLevels: 0 })
  let ended = null
  s.on('end', (e) => (ended = e))
  playUntilAiming(s)
  for (const t of s.world.filter((e) => e.kind === 'target')) t.kill('fire')
  for (let i = 0; i < 60 && !ended; i++) s.update(1000 / 30)
  assert.ok(ended, 'la partie se termine sans attendre un tir')
  assert.equal(ended.won, true)
  assert.equal(ended.result.shotsUsed, 0)
  assert.equal(ended.result.stars, 3)
  s.destroy()
})

test('succès : trois par niveau, évalués par le moteur', () => {
  const l = LevelRepository.get(1)
  const s = new GameSession(l, { difficulty: 'normal', completedLevels: 0 })
  let ended = null
  s.on('end', (e) => (ended = e))
  playUntilAiming(s)
  for (const t of s.world.filter((e) => e.kind === 'target')) t.kill('impact')
  for (let i = 0; i < 60 && !ended; i++) s.update(1000 / 30)
  // Aucun boulet spécial, aucun tir : au moins le premier succès (« puriste » ou « économe »).
  assert.ok(ended.result.achievements & 1)
  s.destroy()
})

test('séisme sans aucun tir : arme les règles et peut gagner le niveau', () => {
  const s = new GameSession(LevelRepository.get(1), { difficulty: 'normal', completedLevels: 40 })
  playUntilAiming(s)
  assert.equal(s.world.armed, false)
  assert.equal(s.usePower('quake'), true)
  assert.equal(s.world.armed, true)
  s.destroy()
})

test('puissance au début du tour : 100 % par défaut, réglable', () => {
  const a = new GameSession(LevelRepository.get(4), { difficulty: 'normal', completedLevels: 0 })
  assert.equal(a.hud.power, 100)
  a.destroy()
  const b = new GameSession(LevelRepository.get(4), { difficulty: 'normal', completedLevels: 0, startPower: 75 })
  assert.equal(b.hud.power, 75)
  b.destroy()
})

test('premiers pas : niveau 1 réglé pour toucher, trajectoire montrée jusqu’au niveau 3', () => {
  for (const diff of ['easy', 'normal', 'hard']) {
    const s = new GameSession(LevelRepository.get(1), { difficulty: diff, completedLevels: 0, reducedMotion: true })
    for (let i = 0; i < 200 && s.state !== 'aiming'; i++) s.update(1000 / 60)
    assert.ok(Array.isArray(s.trajectory), 'trajectoire visible')
    s.fire()
    for (let i = 0; i < 600; i++) s.update(1000 / 60)
    assert.ok(s.targetsLeft < LevelRepository.get(1).targets.length, `premier tir réussi (${diff})`)
    s.destroy()
  }
  const three = new GameSession(LevelRepository.get(3), { difficulty: 'normal', completedLevels: 2, reducedMotion: true })
  for (let i = 0; i < 200 && three.state !== 'aiming'; i++) three.update(1000 / 60)
  assert.ok(Array.isArray(three.trajectory))
  const four = new GameSession(LevelRepository.get(4), { difficulty: 'normal', completedLevels: 3, reducedMotion: true })
  for (let i = 0; i < 200 && four.state !== 'aiming'; i++) four.update(1000 / 60)
  assert.equal(four.trajectory, null, 'au-delà : selon le réglage du joueur')
})

test('étoiles au nombre de tirs : 3 en un tir (deux pour les grands châteaux)', () => {
  for (const l of LevelRepository.all()) {
    assert.ok(l.par === 1 || l.par === 2, `niveau ${l.id}`)
    assert.ok(l.star2 >= l.par && l.star2 <= l.shots, `niveau ${l.id}`)
    assert.equal(l.achievements.length, 3, `niveau ${l.id}`)
    assert.equal(new Set(l.achievements).size, 3, `niveau ${l.id} : succès distincts`)
  }
})
