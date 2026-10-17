import { test } from 'node:test'
import assert from 'node:assert/strict'
import Matter from 'matter-js'
import * as World from '../src/game/physics/PhysicsWorld.js'
import * as Rules from '../src/game/physics/physicsRules.js'
import { ElementCombos, COMBO } from '../src/game/physics/ElementCombos.js'
import { DefenderContacts, hurtEvent } from '../src/game/physics/DefenderContacts.js'
import { ElementReactions } from '../src/game/physics/ElementReactions.js'
import { WORLD } from '../src/game/physics/constants.js'
import { THUNDER } from '../src/game/entities/catalog.js'
import { Block } from '../src/game/entities/Block.js'
import { Target } from '../src/game/entities/Target.js'

/*
 * v6.2 : la physique est découpée en rôles (règles, défenseurs, réactions des
 * éléments, combos), chacun relié au monde par un port étroit. Ces tests les
 * font tourner sans monde, avec un port factice.
 */

/** Port factice : un instant, des entités, et les événements émis. */
const fakePort = (list, extra = {}) => {
  const events = []
  const port = {
    time: 1000,
    armed: true,
    entities: () => list.values(),
    filter: (predicate) => list.filter(predicate),
    queryRadius: (x, y, r) => list.filter((e) => e.alive && Math.hypot(e.x - x, e.y - y) <= r),
    entityOf: () => null,
    emit: (name, data) => events.push([name, data]),
    ...extra,
  }
  return { port, events, names: () => events.map(([name, data]) => (data?.kind ? `${name}:${data.kind}` : name)) }
}

test('v6.2 : les règles physiques vivent dans physicsRules.js ; PhysicsWorld les réexporte sous les mêmes noms', () => {
  for (const name of ['HOT_BALL_MS', 'BREACH_DAMPING', 'BREACH_LIGHT_HP', 'BREACH_HEAVY_MASS', 'OGRE_SWAT_MS', 'PUSHED_SAFE_MS', 'KNOCKDOWN_SHARE', 'POWER']) {
    assert.ok(name in Rules, name)
    assert.equal(World[name], Rules[name], name)
  }
  assert.ok(Rules.RESTRIKE_MS > 0)
  assert.ok(Object.isFrozen(Rules.POWER))
})

test('v6.2 : un seul modèle pour l’événement « hurt » (coups, chutes, décharges)', () => {
  const t = new Target({ type: 'soldier', x: 100, y: 200 })
  const e = hurtEvent(t, 5, 'crush', false, 1)
  assert.deepEqual(Object.keys(e), ['entity', 'amount', 'cause', 'lethal', 'x', 'y', 'dir'])
  assert.equal(e.entity, t)
  assert.equal(e.amount, 5)
  assert.equal(e.lethal, false)
  assert.equal(e.y, t.y - t.height * 0.35)
  // Hors de combat d'une autre façon (vies perdues…) : le coup compte comme fatal.
  t.kill('fall')
  assert.equal(hurtEvent(t, 5, 'fall', false, 0).lethal, true)
})

test('v6.2 : DefenderContacts sans monde : blessure (sonné), et un défenseur renversé perd KNOCKDOWN_SHARE', () => {
  const t = new Target({ type: 'soldier', x: 100, y: 200 })
  const { port, events } = fakePort([t])
  const defenders = new DefenderContacts(port)
  defenders.hurt(t, 10, 'crush', 1)
  assert.equal(events.length, 1)
  assert.equal(events[0][0], 'hurt')
  assert.equal(events[0][1].amount, 10)
  assert.equal(t.stunUntil, port.time + WORLD.STAGGER_MS)
  assert.equal(t.stunKind, 'hit')
  // Renversé : au bout de KNOCKOUT_MS à terre, une part de ses points de vie.
  const down = new Target({ type: 'knight', x: 300, y: 200 })
  Matter.Body.setAngle(down.body, Math.PI / 2)
  const second = fakePort([down])
  new DefenderContacts(second.port).checkKnockouts(WORLD.KNOCKOUT_MS)
  assert.equal(second.events.length, 1)
  assert.equal(second.events[0][1].cause, 'knockout')
  assert.ok(Math.abs(down.maxHp - down.hp - down.maxHp * Rules.KNOCKDOWN_SHARE) < 1e-9)
})

test('v6.2 : ElementCombos sans monde : fer rougi et fer électrisé annoncés une fois, la trempe fend le fer', () => {
  const iron = new Block({ material: 'iron', x: 0, y: 0, w: 40, h: 40 })
  const { port, names } = fakePort([iron])
  const combos = new ElementCombos(port)
  assert.equal(combos.heatIron(iron), true)
  assert.equal(combos.heatIron(iron), false, 'déjà rouge : pas de nouvelle annonce')
  assert.equal(combos.charge(iron), true)
  assert.equal(combos.charge(iron), false)
  assert.deepEqual(names(), ['combo:redhot', 'combo:charged'])
  const hp = iron.hp
  assert.equal(combos.quench(iron), true)
  assert.deepEqual(names().slice(2), ['steam', 'combo:quench'])
  assert.ok(Math.abs(hp - iron.hp - iron.maxHp * COMBO.QUENCH) < 1e-9)
  assert.equal(combos.quench(iron), false, 'refroidi : plus de trempe')
})

test('v6.2 : ElementCombos sans monde : éclats de glace, sans blessure avant le premier tir', () => {
  const ice = new Block({ material: 'ice', x: 0, y: 0, w: 40, h: 40 })
  const t = new Target({ type: 'soldier', x: 40, y: 0 })
  const hurts = []
  const { port, names } = fakePort([ice, t], { armed: false, hurt: (...args) => hurts.push(args) })
  const combos = new ElementCombos(port)
  const icy = combos.brittleIn(10, 0, 100)
  assert.deepEqual(icy, [ice])
  combos.shards(icy)
  assert.equal(ice.alive, false)
  assert.equal(hurts.length, 0)
  assert.deepEqual(names(), ['combo:shards'])
})

test('v6.2 : ElementReactions sans monde : le feu se propage avec le hasard du monde (le même générateur)', () => {
  const src = new Block({ material: 'wood', x: 100, y: 200, w: 40, h: 40 })
  const near = new Block({ material: 'wood', x: 150, y: 200, w: 40, h: 40 })
  src.ignite(6000)
  const draws = []
  const rng = {
    chance: (p) => {
      draws.push(p)
      return true
    },
  }
  const { port, names } = fakePort([src, near], { rng, worldWind: {}, windField: { profile: {}, base: 0 }, props: { gustAt: () => 0 } })
  new ElementReactions(port).spreadFire()
  assert.deepEqual(draws, [near.catchChance])
  assert.ok(near.burning > 0)
  assert.deepEqual(names(), ['fire:start'])
})

test('v6.2 : ElementReactions sans monde : la vapeur n’ébouillante qu’après le premier tir ; la décharge sonne (THUNDER.STUN_MS)', () => {
  const t = new Target({ type: 'soldier', x: 0, y: 0 })
  const calm = fakePort([t], { armed: false })
  new ElementReactions(calm.port).scald(0, 0, null)
  assert.equal(t.alive, true)
  const live = fakePort([t])
  const reactions = new ElementReactions(live.port)
  reactions.shock(t, 5)
  assert.equal(t.stunUntil, live.port.time + THUNDER.STUN_MS)
  assert.equal(t.stunKind, 'shock')
  assert.equal(live.events[0][1].cause, 'shock')
  reactions.scald(0, 0, null)
  assert.equal(t.alive, false)
  assert.equal(t.deathCause, 'scald')
})
