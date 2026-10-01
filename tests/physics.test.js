import { test } from 'node:test'
import assert from 'node:assert/strict'
import Matter from 'matter-js'
import { EventBus } from '../src/core/utils/EventBus.js'
import { PhysicsWorld } from '../src/game/physics/PhysicsWorld.js'
import { WORLD } from '../src/game/physics/constants.js'
import { Block } from '../src/game/entities/Block.js'
import { Target } from '../src/game/entities/Target.js'
import { Barrel } from '../src/game/entities/Barrel.js'
import { Projectile } from '../src/game/entities/Projectile.js'

const G = WORLD.GROUND_Y

function hut(world, material) {
  world.add(new Block({ material, x: 1400, y: G - 50, w: 20, h: 100 }))
  world.add(new Block({ material, x: 1480, y: G - 50, w: 20, h: 100 }))
  world.add(new Block({ material, x: 1440, y: G - 110, w: 120, h: 20 }))
  return world.add(new Target({ type: 'soldier', x: 1440, y: G - 25 }))
}

function fire(world, type, speed, angle, mods) {
  const p = world.add(new Projectile(type, 260, 760, mods))
  Matter.Body.setVelocity(p.body, { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed })
  return p
}

const settle = (w, n = 150) => {
  for (let i = 0; i < n; i++) w.stepOnce()
}

test('une structure posée reste debout et intacte', () => {
  const w = new PhysicsWorld(new EventBus())
  const t = hut(w, 'wood')
  settle(w, 600)
  assert.equal(t.alive, true)
  assert.equal(w.filter((e) => e.kind === 'block' && e.alive).length, 3)
})

test('un tir direct détruit une cabane en bois et sa cible', () => {
  const ev = new EventBus()
  const destroyed = []
  ev.on('entity:destroyed', ({ entity }) => destroyed.push(entity.kind))
  const w = new PhysicsWorld(ev)
  const t = hut(w, 'wood')
  settle(w)
  fire(w, 'stone', 18, -0.62)
  settle(w, 1200)
  assert.equal(t.alive, false)
  assert.ok(destroyed.includes('block'))
})

test('la pierre résiste mieux que le bois', () => {
  const w = new PhysicsWorld(new EventBus())
  hut(w, 'stone')
  settle(w)
  fire(w, 'stone', 18, -0.62)
  settle(w, 1200)
  assert.ok(w.filter((e) => e.kind === 'block').length >= 2)
})

test('un baril explose et déclenche une réaction en chaîne', () => {
  const ev = new EventBus()
  let explosions = 0
  ev.on('explosion', () => explosions++)
  const w = new PhysicsWorld(ev)
  const b1 = w.add(new Barrel({ x: 1400, y: G - 21 }))
  w.add(new Barrel({ x: 1480, y: G - 21 }))
  settle(w)
  b1.damage(1000)
  settle(w, 120)
  assert.equal(explosions, 2)
  assert.equal(w.filter((e) => e.kind === 'barrel').length, 0)
})

test('la mitraille se divise en trois projectiles', () => {
  const w = new PhysicsWorld(new EventBus())
  const p = fire(w, 'split', 16, -0.8)
  settle(w, 20)
  const shards = w.splitProjectile(p)
  assert.equal(shards.length, 3)
  assert.equal(p.alive, false)
  assert.equal(w.splitProjectile(p).length, 0)
})

test('la simulation est déterministe (même tir, même résultat)', () => {
  const run = () => {
    const w = new PhysicsWorld(new EventBus(), { wind: 0.5, seed: 3 })
    hut(w, 'wood')
    settle(w)
    fire(w, 'fire', 18, -0.62)
    settle(w, 900)
    return w.filter(() => true).map((e) => `${e.kind}:${e.x.toFixed(3)}:${e.y.toFixed(3)}`).join('|')
  }
  assert.equal(run(), run())
})

test('le vent dévie la trajectoire', () => {
  const land = (wind) => {
    const w = new PhysicsWorld(new EventBus(), { wind })
    const p = fire(w, 'stone', 18, -Math.PI / 4)
    while (p.alive && !(p.y > G - 20 && p.body.velocity.y > 0)) w.stepOnce()
    return p.x
  }
  assert.ok(land(1) > land(0) + 40)
  assert.ok(land(-1) < land(0) - 40)
})
