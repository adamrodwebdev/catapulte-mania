/**
 * Mesure l'effet du vent : point de chute d'un tir selon la difficulté,
 * le projectile et l'instant du tir (rafales). Usage : node scripts/wind-probe.mjs
 */
import Matter from 'matter-js'
import { PhysicsWorld } from '../src/game/physics/PhysicsWorld.js'
import { WIND_PROFILES } from '../src/game/physics/WindField.js'
import { Projectile } from '../src/game/entities/Projectile.js'
import { Catapult } from '../src/game/Catapult.js'
import { EventBus } from '../src/core/utils/EventBus.js'
import { WORLD } from '../src/game/physics/constants.js'

function land(profile, wind, angle, power, type = 'stone', delayMs = 0) {
  const world = new PhysicsWorld(new EventBus(), { seed: 7, windProfile: WIND_PROFILES[profile] })
  world.wind = wind
  for (let t = 0; t < delayMs; t += WORLD.STEP_MS) world.stepOnce()
  const c = new Catapult(200)
  c.setAim(angle, power)
  const p = new Projectile(type, c.launchPoint.x, c.launchPoint.y)
  world.add(p)
  const v = c.velocity
  Matter.Body.setVelocity(p.body, v)
  for (let i = 0; i < 2000 && p.y < WORLD.GROUND_Y - 30; i++) world.stepOnce()
  return Math.round(p.x)
}
const shots = [['tendu', 10, 0.79], ['moyen', 35, 0.8], ['cloche', 65, 0.9]]
for (const [name, a, pw] of shots) {
  const calm = land('normal', 0, a, pw)
  const normal = land('normal', 0.6, a, pw) - calm
  const hard = [0, 1500, 3000, 4500].map((d) => land('hard', 0.6, a, pw, 'stone', d) - calm)
  const boulder = land('hard', 0.6, a, pw, 'boulder') - land('hard', 0, a, pw, 'boulder')
  const fire = land('hard', 0.6, a, pw, 'fire') - land('hard', 0, a, pw, 'fire')
  console.log(`${name.padEnd(7)} chute ${calm}px | Normal vent 0,6 : ${normal}px | Difficile (selon l'instant) : ${hard.join(' / ')}px | boulet ${boulder}px | feu ${fire}px`)
}
