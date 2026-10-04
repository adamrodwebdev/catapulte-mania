import { test } from 'node:test'
import assert from 'node:assert/strict'
import Matter from 'matter-js'
import { WindField, WIND_PROFILES, windageOf } from '../src/game/physics/WindField.js'
import { PhysicsWorld } from '../src/game/physics/PhysicsWorld.js'
import { Projectile } from '../src/game/entities/Projectile.js'
import { Catapult } from '../src/game/Catapult.js'
import { EventBus } from '../src/core/utils/EventBus.js'
import { WORLD } from '../src/game/physics/constants.js'
import { TrajectoryPredictor } from '../src/game/TrajectoryPredictor.js'
import { GameSession } from '../src/game/GameSession.js'
import { LevelRepository } from '../src/game/levels/LevelRepository.js'

/** Point de chute réel d'un tir (physique complète, sans obstacle). */
function land(difficulty, wind, angle, power, type = 'stone', delayMs = 0) {
  const world = new PhysicsWorld(new EventBus(), { seed: 7, windProfile: WIND_PROFILES[difficulty] })
  world.wind = wind
  for (let t = 0; t < delayMs; t += WORLD.STEP_MS) world.stepOnce()
  const c = new Catapult(200)
  c.setAim(angle, power)
  const p = new Projectile(type, c.launchPoint.x, c.launchPoint.y)
  world.add(p)
  Matter.Body.setVelocity(p.body, c.velocity)
  for (let i = 0; i < 3000 && p.y < WORLD.GROUND_Y - 30; i++) world.stepOnce()
  return p.x
}

test('vent Facile/Normal inchangé : constant, identique pour tous les projectiles', () => {
  const f = new WindField(WIND_PROFILES.normal, 3)
  f.base = 0.5
  assert.equal(f.dynamic, false)
  assert.equal(f.at(100, 800, 0), f.at(2000, -400, 9999))
  assert.equal(f.accel(0, 0, 0, 0.4), f.accel(0, 0, 0, 1.5))
})

test('Difficile : plus fort en altitude, rafales qui varient dans le temps', () => {
  const f = new WindField(WIND_PROFILES.hard, 3)
  f.base = 0.5
  assert.ok(f.shearAt(WORLD.GROUND_Y - 800) > 1.5 && f.shearAt(WORLD.GROUND_Y) === 1)
  const samples = Array.from({ length: 40 }, (_, i) => f.at(400, 700, i * 250))
  assert.ok(Math.max(...samples) - Math.min(...samples) > 0.2, 'les rafales font varier le vent')
  assert.ok(samples.every((w) => w > 0), 'une rafale ne retourne jamais le vent')
  f.base = 0
  assert.equal(f.at(400, 700, 1234), 0, 'pas de rafale sans vent')
})

test('prise au vent : le boulet résiste, la pierre de référence vaut 1', () => {
  assert.equal(windageOf({ type: 'stone', radius: 17 }), 1)
  assert.ok(windageOf({ type: 'boulder', radius: 25 }) < 0.5)
  assert.ok(windageOf({ type: 'stone', radius: 11 }) > 1.4, 'éclat de mitraille')
})

test('Difficile : le vent devient un vrai enjeu, même pour un tir tendu', () => {
  const calm = land('normal', 0, 10, 0.79)
  const normal = Math.abs(land('normal', 0.6, 10, 0.79) - calm)
  const hard = Math.abs(land('hard', 0.6, 10, 0.79) - calm)
  assert.ok(hard > normal * 2.2, `tir tendu : ${hard.toFixed(0)} px contre ${normal.toFixed(0)} px`)
  // Le même tir, à deux instants différents, ne tombe pas au même endroit (rafales).
  assert.ok(Math.abs(land('hard', 0.6, 35, 0.8, 'stone', 0) - land('hard', 0.6, 35, 0.8, 'stone', 1500)) > 25)
  // Le boulet dévie bien moins que la pierre.
  const stone = Math.abs(land('hard', 0.6, 35, 0.8) - land('hard', 0, 35, 0.8))
  const boulder = Math.abs(land('hard', 0.6, 35, 0.8, 'boulder') - land('hard', 0, 35, 0.8, 'boulder'))
  assert.ok(boulder < stone * 0.6)
})

test('aide à la trajectoire en Difficile : juste avec la rafale du moment', () => {
  const world = new PhysicsWorld(new EventBus(), { seed: 7, windProfile: WIND_PROFILES.hard })
  world.wind = 0.6
  const c = new Catapult(200)
  c.setAim(35, 0.8)
  // Point où la courbe prédite descend à la même hauteur que la mesure réelle.
  const at = (pts) => pts.find((p, i) => i > 10 && p.y >= WORLD.GROUND_Y - 30).x
  const predicted = at(TrajectoryPredictor.predict(c.launchPoint, c.velocity, { windAccel: world.windField.frozen(c.launchPoint.x, 0, 1), maxPoints: 800, every: 1 }))
  const real = land('hard', 0.6, 35, 0.8)
  const naive = at(TrajectoryPredictor.predict(c.launchPoint, c.velocity, { wind: 0.6, maxPoints: 800, every: 1 }))
  assert.ok(Math.abs(predicted - real) < Math.abs(naive - real), 'meilleure que l’ancienne prédiction')
  assert.ok(Math.abs(predicted - real) < 120, `écart ${Math.abs(predicted - real).toFixed(0)} px (rafales à venir)`)
})

test('HUD : vent ressenti, vitesse réelle et rafales en Difficile', () => {
  const s = new GameSession(LevelRepository.get(30), { difficulty: 'hard', completedLevels: 29, reducedMotion: true })
  const h = s.hud
  assert.equal(h.windDynamic, true)
  assert.ok(h.windKmh > 0 && ['breeze', 'strong', 'storm'].includes(h.windLevel))
  assert.ok(Math.abs(h.gust) <= 1)
  assert.ok(s.scene().wind.field === s.world.windField)
  s.destroy()
  const n = new GameSession(LevelRepository.get(30), { difficulty: 'normal', completedLevels: 29, reducedMotion: true })
  assert.equal(n.hud.windDynamic, false)
  assert.equal(n.hud.gust, 0)
  n.destroy()
})
