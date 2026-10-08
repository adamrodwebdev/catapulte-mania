import { test } from 'node:test'
import assert from 'node:assert/strict'
import Matter from 'matter-js'
import { PhysicsWorld } from '../src/game/physics/PhysicsWorld.js'
import { EventBus } from '../src/core/utils/EventBus.js'
import { Block } from '../src/game/entities/Block.js'
import { Target } from '../src/game/entities/Target.js'
import { Projectile } from '../src/game/entities/Projectile.js'
import { Flyer } from '../src/game/entities/Flyer.js'
import { WORLD } from '../src/game/physics/constants.js'
import { LevelRepository } from '../src/game/levels/LevelRepository.js'
import { AMMO_UNLOCK, terrainFor } from '../src/game/levels/LevelCurve.js'
import { PowerRegistry } from '../src/game/powers/PowerRegistry.js'
import { GameSession } from '../src/game/GameSession.js'

const G = WORLD.GROUND_Y
const settle = (w, n) => {
  for (let i = 0; i < n; i++) w.stepOnce()
}
/** Monde avec des événements enregistrés. */
function world(opts = {}) {
  const bus = new EventBus()
  const seen = []
  for (const name of ['breach', 'frost', 'steam', 'terrain', 'flyer:hit', 'flyer:drop', 'lightning']) bus.on(name, (e) => seen.push({ name, ...e }))
  return { w: new PhysicsWorld(bus, opts), seen }
}
const shoot = (w, type, x, y, vx, vy, mods) => {
  const p = w.add(new Projectile(type, x, y, mods))
  Matter.Body.setVelocity(p.body, { x: vx, y: vy })
  return p
}
const walls = (w, mat) => [1000, 1100, 1200].map((x) => w.add(new Block({ material: mat, x, y: G - 50, w: 24, h: 100 })))

test('percée : le rocher traverse plusieurs murs de pierre, la pierre s’arrête au premier', () => {
  const a = world()
  const wa = walls(a.w, 'stone')
  settle(a.w, 120)
  shoot(a.w, 'boulder', 900, G - 50, 21.9, 0)
  settle(a.w, 240)
  assert.ok(a.seen.filter((e) => e.name === 'breach').length >= 2, 'au moins deux murs percés')
  assert.equal(wa[0].alive, false)
  assert.equal(wa[1].alive, false)

  const b = world()
  const wb = walls(b.w, 'stone')
  settle(b.w, 120)
  shoot(b.w, 'stone', 900, G - 50, 21.9, 0)
  settle(b.w, 240)
  assert.equal(b.seen.filter((e) => e.name === 'breach').length, 0, 'une pierre ne perce pas la pierre')
  assert.equal(wb[1].alive, true)
})

test('givre : les blocs gelés deviennent cassants, le feu les fait éclater en vapeur qui ébouillante', () => {
  const { w, seen } = world()
  const wall = w.add(new Block({ material: 'stone', x: 1000, y: G - 50, w: 24, h: 100 }))
  const t = w.add(new Target({ type: 'soldier', x: 1050, y: G - 25 }))
  settle(w, 120)
  shoot(w, 'frost', 980, G - 160, 0, 6)
  settle(w, 60)
  assert.ok(seen.some((e) => e.name === 'frost'))
  assert.ok(wall.frozen, 'mur gelé')
  assert.equal(wall.ignite(), false, 'un objet gelé ne prend pas feu')
  // Du feu sur la glace : vapeur, choc thermique, défenseur ébouillanté.
  const hp = wall.hp
  shoot(w, 'fire', 1000, G - 200, 0, 6)
  settle(w, 120)
  assert.ok(seen.some((e) => e.name === 'steam' && e.entity === wall), 'vapeur')
  assert.equal(wall.frozen, false, 'dégelé')
  assert.ok(!wall.alive || wall.hp < hp, 'choc thermique')
  assert.equal(t.alive, false)
  assert.equal(t.deathCause, 'scald')
})

test('lac : un ricochet, puis le boulet coule ; le givre le fige', () => {
  const { w, seen } = world({ zones: [{ kind: 'lake', x0: 600, x1: 1400 }] })
  w.arm()
  const p = shoot(w, 'stone', 620, G - 40, 6, 4)
  settle(w, 400)
  const kinds = seen.filter((e) => e.name === 'terrain').map((e) => e.kind)
  assert.deepEqual(kinds.slice(0, 2), ['skip', 'drown'])
  assert.equal(p.alive, false)

  const f = world({ zones: [{ kind: 'lake', x0: 600, x1: 1400 }] })
  shoot(f.w, 'frost', 800, G - 40, 0, 4)
  settle(f.w, 60)
  assert.equal(f.w.terrain.at(800).kind, 'ice')
})

test('lave : le projectile fond, sauf le givre qui la fige en croûte de roche', () => {
  const { w, seen } = world({ zones: [{ kind: 'lava', x0: 600, x1: 1000 }] })
  const p = shoot(w, 'boulder', 800, G - 60, 0, 5)
  settle(w, 60)
  assert.equal(p.alive, false)
  assert.ok(seen.some((e) => e.name === 'terrain' && e.kind === 'melt'))
  shoot(w, 'frost', 700, G - 60, 0, 5)
  settle(w, 60)
  assert.ok(seen.some((e) => e.name === 'terrain' && e.kind === 'crust'))
  assert.ok(w.filter((e) => e.kind === 'block' && e.material === 'rock' && Math.abs(e.x - 700) < 10).length === 1, 'croûte posée')
})

test('neige : le boulet roule et grossit ; le feu la fait fondre', () => {
  const { w } = world({ zones: [{ kind: 'snow', x0: 400, x1: 2000 }] })
  const p = shoot(w, 'stone', 500, G - 30, 7, 2)
  const r0 = p.radius
  settle(w, 240)
  assert.ok(p.radius > r0 * 1.1, 'boule de neige')
  assert.ok(p.x > 900, 'elle roule loin')
  const f = world({ zones: [{ kind: 'snow', x0: 400, x1: 2000 }] })
  shoot(f.w, 'fire', 1000, G - 40, 0, 5)
  settle(f.w, 30)
  assert.equal(f.w.terrain.at(1000), null, 'neige fondue sous le feu')
  assert.equal(f.w.terrain.at(600).kind, 'snow')
})

test('créatures : le corbeau stoppe le tir, la vouivre abattue lâche son feu grégeois', () => {
  const { w, seen } = world()
  const crow = w.add(new Flyer({ type: 'crow', x: 800, y: 500, range: 0, period: 4000 }))
  const p = shoot(w, 'stone', 700, 500, 12, 0)
  settle(w, 30)
  assert.equal(crow.alive, false)
  assert.ok(Math.abs(p.body.velocity.x) < 3, 'le tir est stoppé')
  const wy = w.add(new Flyer({ type: 'wyvern', x: 1300, y: 500, range: 0, period: 7000 }))
  shoot(w, 'stone', 1200, 500, 12, 0)
  settle(w, 30)
  assert.equal(wy.alive, false)
  assert.ok(seen.some((e) => e.name === 'flyer:drop'))
  assert.ok(w.filter((e) => e.kind === 'projectile' && e.type === 'fire').length === 1, 'le pot tombe')
})

test('les créatures volent selon le temps seul (déterministe)', () => {
  const a = new Flyer({ type: 'crow', x: 800, y: 400, range: 200, period: 3000, phase: 0.3 })
  const b = new Flyer({ type: 'crow', x: 800, y: 400, range: 200, period: 3000, phase: 0.3 })
  for (let i = 0; i < 100; i++) a.update(WORLD.STEP_MS)
  for (let i = 0; i < 50; i++) b.update(WORLD.STEP_MS * 2)
  assert.ok(Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6)
})

test('munitions débloquées tôt : feu 3, rocher 5, givre 7, bombe 10, mitraille 14', () => {
  for (const [type, at] of Object.entries(AMMO_UNLOCK)) {
    assert.ok(!(LevelRepository.get(at - 1).ammo[type] > 0), `${type} pas avant ${at}`)
    assert.ok(LevelRepository.get(at).ammo[type] >= 1, `${type} au niveau ${at}`)
  }
})

test('terrains : chaque terrain apparaît dans la campagne, jamais sous le château', () => {
  const kinds = new Set()
  for (const l of LevelRepository.all()) {
    const castle = Math.min(...l.blocks.filter((b) => b.material !== 'rock').map((b) => b.x - b.w / 2))
    for (const z of l.zones) {
      kinds.add(z.kind)
      assert.ok(z.x1 <= castle && z.x0 >= 400, `niveau ${l.id} : ${z.kind} devant le château`)
    }
    for (const f of l.flyers) kinds.add(f.type)
  }
  for (const k of ['lake', 'ice', 'lava', 'snow', 'crow', 'wyvern']) assert.ok(kinds.has(k), k)
  assert.ok(terrainFor(8).mountain, 'montagne au niveau 8')
})

test('pouvoirs : sept pouvoirs, la foudre frappe les points les plus hauts', () => {
  assert.equal(PowerRegistry.all().length, 7)
  const { w, seen } = world()
  const tall = w.add(new Block({ material: 'wood', x: 1500, y: G - 150, w: 20, h: 300 }))
  w.add(new Block({ material: 'wood', x: 1200, y: G - 30, w: 20, h: 60 }))
  w.lightning(1)
  assert.equal(seen.filter((e) => e.name === 'lightning').length, 1)
  assert.equal(seen[0].entity, tall)
})

test('Météore : un toucher en vol fait piquer le projectile', () => {
  const level = LevelRepository.get(16)
  const s = new GameSession(level, { difficulty: 'normal', completedLevels: 15, reducedMotion: true })
  for (let i = 0; i < 200 && s.state !== 'aiming'; i++) s.update(33)
  assert.ok(s.usePower('meteor'))
  s.aim(45, 0.9)
  s.fire()
  for (let i = 0; i < 40 && !s.hud.canActivate; i++) s.update(33)
  assert.equal(s.hud.activateKind, 'dive')
  assert.equal(s.trigger(), 'split')
  const p = s.world.filter((e) => e.kind === 'projectile')[0]
  assert.ok(p.diving && p.body.velocity.y > 15)
  s.destroy()
})
