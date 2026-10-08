import { test } from 'node:test'
import assert from 'node:assert/strict'
import Matter from 'matter-js'
import { PhysicsWorld } from '../src/game/physics/PhysicsWorld.js'
import { EventBus } from '../src/core/utils/EventBus.js'
import { Block } from '../src/game/entities/Block.js'
import { Target } from '../src/game/entities/Target.js'
import { Projectile } from '../src/game/entities/Projectile.js'
import { WORLD } from '../src/game/physics/constants.js'
import { LevelRepository } from '../src/game/levels/LevelRepository.js'
import { GameSession } from '../src/game/GameSession.js'
import { Ballista, ballistaUnlocked, BALLISTA_UNLOCK } from '../src/game/Ballista.js'
import { ogresFor } from '../src/game/levels/LevelCurve.js'

const G = WORLD.GROUND_Y
const settle = (w, n) => {
  for (let i = 0; i < n; i++) w.stepOnce()
}
const shoot = (w, type, x, y, vx, vy, mods) => {
  const p = w.add(new Projectile(type, x, y, mods))
  Matter.Body.setVelocity(p.body, { x: vx, y: vy })
  return p
}

test('rondes : le défenseur va et vient sans quitter sa ronde ni tomber', () => {
  const w = new PhysicsWorld(new EventBus())
  const t = w.add(new Target({ type: 'soldier', x: 1400, y: G - 25, patrol: 50 }))
  settle(w, 120)
  const xs = []
  for (let i = 0; i < 1200; i++) {
    w.stepOnce()
    xs.push(t.x)
  }
  assert.ok(t.alive)
  assert.ok(Math.max(...xs) - Math.min(...xs) > 60, 'il marche')
  assert.ok(Math.max(...xs) <= 1400 + 50 + 8 && Math.min(...xs) >= 1400 - 50 - 8, 'il reste dans sa ronde')
})

test('rondes : demi-tour devant un mur, jamais écrasé contre lui', () => {
  const w = new PhysicsWorld(new EventBus())
  w.add(new Block({ material: 'stone', x: 1440, y: G - 50, w: 20, h: 100 }))
  const t = w.add(new Target({ type: 'soldier', x: 1400, y: G - 25, patrol: 80 }))
  settle(w, 120)
  w.arm()
  for (let i = 0; i < 1500; i++) w.stepOnce()
  assert.ok(t.alive)
  assert.ok(t.x < 1440 - 10 - 13, 'jamais dans le mur')
})

test('ogre : il renvoie une pierre, mais une bombe l’abat', () => {
  const bus = new EventBus()
  const seen = []
  bus.on('ogre', (e) => seen.push(e.kind))
  const w = new PhysicsWorld(bus)
  const o = w.add(new Target({ type: 'ogre', x: 1400, y: G - 38 }))
  settle(w, 120)
  const p = shoot(w, 'stone', 1300, G - 40, 12, 0)
  settle(w, 20)
  assert.deepEqual(seen, ['swat'])
  assert.ok(o.alive, 'la pierre ne lui fait rien')
  assert.ok(p.body.velocity.x < 0, 'la pierre repart vers le tireur')
  settle(w, 150)
  shoot(w, 'bomb', 1300, G - 40, 12, 0)
  settle(w, 60)
  assert.equal(o.alive, false)
})

test('ogre : il repousse un bloc qui lui tombe dessus et ne meurt pas écrasé', () => {
  const w = new PhysicsWorld(new EventBus())
  const o = w.add(new Target({ type: 'ogre', x: 1400, y: G - 38 }))
  settle(w, 120)
  w.arm()
  const b = w.add(new Block({ material: 'wood', x: 1400, y: G - 160, w: 60, h: 20 }))
  settle(w, 240)
  assert.ok(o.alive)
  assert.ok(Math.abs(b.x - 1400) > 30, 'le bloc a été repoussé')
})

test('ogres dans la campagne : à partir du niveau 35', () => {
  assert.equal(ogresFor(34), 0)
  assert.ok(LevelRepository.all().slice(0, 34).every((l) => !l.targets.some((t) => t.type === 'ogre')))
  assert.ok(LevelRepository.get(35).targets.some((t) => t.type === 'ogre'))
  assert.ok(LevelRepository.get(12).targets.some((t) => t.patrol > 0), 'des rondes')
})

test('baliste : carreau qui traverse la montagne, déblocage très exigeant', () => {
  const w = new PhysicsWorld(new EventBus())
  const rock = w.add(new Block({ material: 'rock', x: 900, y: G - 150, w: 200, h: 300 }))
  const t = w.add(new Target({ type: 'soldier', x: 1300, y: G - 25 }))
  settle(w, 120)
  const p = shoot(w, 'bolt', 700, G - 30, 26, 0)
  settle(w, 120)
  assert.ok(rock.alive)
  assert.ok(p.x > 1000 || !p.alive, 'le carreau a passé la roche')
  assert.equal(t.alive, false)
  // Une pierre, elle, s'arrête sur la roche.
  const w2 = new PhysicsWorld(new EventBus())
  w2.add(new Block({ material: 'rock', x: 900, y: G - 150, w: 200, h: 300 }))
  const s = shoot(w2, 'stone', 700, G - 30, 26, 0)
  settle(w2, 60)
  assert.ok(s.x < 800)

  assert.equal(ballistaUnlocked(100, BALLISTA_UNLOCK.stars - 1), false)
  assert.equal(ballistaUnlocked(BALLISTA_UNLOCK.levels - 1, 300), false)
  assert.equal(ballistaUnlocked(BALLISTA_UNLOCK.levels, BALLISTA_UNLOCK.stars), true)
  const b = new Ballista(170)
  b.setAim(-10, 2)
  assert.equal(b.angle, 0)
  assert.equal(b.power, 1)
})

test('baliste en partie : munition spéciale = carreau spécial, mire toujours visible', () => {
  const s = new GameSession(LevelRepository.get(30), { difficulty: 'normal', completedLevels: 99, reducedMotion: true, engine: 'ballista' })
  for (let i = 0; i < 200 && s.state !== 'aiming'; i++) s.update(33)
  assert.ok(Array.isArray(s.trajectory) && s.trajectory.length > 0 && s.trajectory.length <= 14, 'ligne de mire courte')
  s.selectAmmo('fire')
  s.aim(20, 0.8)
  s.fire()
  for (let i = 0; i < 20 && !s.world.filter((e) => e.kind === 'projectile').length; i++) s.update(33)
  const p = s.world.filter((e) => e.kind === 'projectile')[0]
  assert.equal(p.type, 'bolt')
  assert.ok(p.ignites)
  s.destroy()
})

test('trébuchet : le repère d’impact suit le balancier et signale la cible', () => {
  const s = new GameSession(LevelRepository.get(10), { difficulty: 'normal', completedLevels: 9, reducedMotion: true, engine: 'trebuchet' })
  for (let i = 0; i < 200 && s.state !== 'aiming'; i++) s.update(33)
  assert.equal(s.landing, null, 'rien avant le balancier')
  s.trigger()
  const xs = []
  let on = false
  for (let i = 0; i < 300 && s.armed; i++) {
    s.update(16)
    const l = s.landing
    if (l) xs.push(l.x)
    if (l?.onCastle) on = true
  }
  assert.ok(xs.length > 10, 'repère affiché pendant le balancier')
  assert.ok(on, 'il passe sur le château')
  s.destroy()
})
