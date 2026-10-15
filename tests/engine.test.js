import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EngineCondition, CONDITION } from '../src/domain/EngineCondition.js'
import { GameSession } from '../src/game/GameSession.js'
import { LevelRepository } from '../src/game/levels/LevelRepository.js'
import { ReplayPlayer } from '../src/game/replay/ReplayPlayer.js'
import { ReplayCode } from '../src/game/replay/ReplayCode.js'
import { RAIDS } from '../src/game/levels/LevelCurve.js'

const run = (c, ms, step = 100) => {
  for (let t = 0; t < ms; t += step) c.update(step)
}

/* ---------- Modèle ---------- */

test('engin : points de vie selon la difficulté', () => {
  assert.equal(new EngineCondition({ difficulty: 'easy' }).maxHp, CONDITION.HP.easy)
  assert.equal(new EngineCondition({ difficulty: 'hard' }).maxHp, CONDITION.HP.hard)
  assert.ok(CONDITION.HP.easy > CONDITION.HP.normal && CONDITION.HP.normal > CONDITION.HP.hard)
})

test('feu : il prend, ronge de plus en plus vite, puis s’éteint de lui-même', () => {
  const c = new EngineCondition()
  const events = []
  c.onChange = (k, d) => events.push([k, d?.level])
  c.ignite()
  assert.equal(c.fireLevel, 1)
  run(c, 1000)
  const lostAt1 = c.maxHp - c.hp
  run(c, 6000)
  assert.ok(c.fireLevel >= 2, 'le feu a pris')
  const before = c.hp
  run(c, 1000)
  assert.ok(before - c.hp > lostAt1 * 1.8, 'plus il est intense, plus il ronge vite')
  run(c, 30000)
  assert.equal(c.fireLevel, 0, 'combustible épuisé : il s’éteint')
  assert.ok(c.hp > 0 && c.hp < c.maxHp - 20, `une torche coûte cher sans être fatale (${Math.round(c.maxHp - c.hp)} PV)`)
  assert.deepEqual(events.map(([k]) => k), ['ignite', 'fireUp', 'burnedOut'])
})

test('feu : deux torches à la fois peuvent détruire l’engin si on ne fait rien', () => {
  const c = new EngineCondition({ difficulty: 'hard' })
  let destroyed = false
  c.onChange = (k) => (destroyed ||= k === 'destroyed')
  c.ignite()
  c.ignite()
  c.ignite()
  run(c, 60000)
  assert.equal(destroyed, true)
  assert.equal(c.destroyed, true)
  assert.equal(c.fireLevel, 0)
})

test('seau d’eau : il éteint le feu… et rouille l’engin', () => {
  const c = new EngineCondition()
  assert.equal(c.douse(), false, 'rien à éteindre')
  c.ignite()
  run(c, 2000)
  assert.equal(c.douse(), true)
  assert.equal(c.fireLevel, 0)
  assert.equal(c.rust, 1)
  assert.ok(c.powerFactor < 1)
  const hp = c.hp
  c.hit(10)
  assert.ok(hp - c.hp > 10, 'la rouille rend l’engin plus fragile')
})

test('givre : puissance réduite jusqu’au dégel ; givre et feu s’annulent', () => {
  const c = new EngineCondition()
  c.freeze()
  assert.equal(c.powerFactor, CONDITION.FROST.POWER)
  run(c, CONDITION.FROST.MS + 100)
  assert.equal(c.frozen, false)
  assert.equal(c.powerFactor, 1)
  c.freeze()
  c.ignite()
  assert.equal(c.frozen, false, 'le feu fait fondre le givre')
  assert.equal(c.fireLevel, 0, 'sans prendre')
  c.ignite()
  c.freeze()
  assert.equal(c.fireLevel, 0, 'le givre étouffe le feu')
})

test('dégâts bruts : fissuré, puis disloqué, et la puissance baisse', () => {
  const c = new EngineCondition()
  c.hit(10)
  assert.equal(c.crackLevel, 0)
  c.hit(20)
  assert.equal(c.crackLevel, 1)
  assert.equal(c.powerFactor, CONDITION.CRACK.POWER[1])
  c.hit(30)
  assert.equal(c.crackLevel, 2)
  assert.deepEqual(c.states.map((s) => s.id), ['crack'])
})

/* ---------- En partie ---------- */

function play(id, { shots = 6, bucket = false, onTurn = null } = {}) {
  const s = new GameSession(LevelRepository.get(id), { difficulty: 'normal', completedLevels: 0, reducedMotion: true })
  const captions = []
  s.on('feedback', (f) => f.caption && captions.push(f.caption))
  let g = 0
  while (s.state !== 'aiming' && g++ < 300) s.update(1000 / 30)
  for (let i = 0; i < shots && s.state !== 'ended'; i++) {
    s.aim(60, 0.95)
    s.fire()
    g = 0
    while (s.state !== 'aiming' && s.state !== 'ended' && g++ < 2000) {
      s.update(1000 / 30)
      if (bucket && s.condition.fireLevel > 0) s.useBucket()
    }
    onTurn?.(s)
  }
  return { s, captions }
}

test('pillard : il charge pendant le vol des tirs, met le feu, et les servants le repoussent', () => {
  assert.deepEqual(RAIDS[17], ['fire'])
  const { s, captions } = play(17, { shots: 2 })
  assert.ok(captions.includes('unit.raid.fire'), 'la charge est annoncée')
  assert.ok(captions.includes('unit.strike.fire'))
  assert.ok(captions.includes('engine.ignite'))
  assert.ok(captions.includes('unit.crew'), 'les servants le repoussent')
  assert.ok(s.condition.hp < s.condition.maxHp)
  assert.equal(s.world.filter((e) => e.raid && e.alive).length, 0)
  s.destroy()
})

test('pillard : il n’avance pas pendant que l’on vise', () => {
  const s = new GameSession(LevelRepository.get(17), { difficulty: 'normal', completedLevels: 0, reducedMotion: true })
  let g = 0
  while (s.state !== 'aiming' && g++ < 300) s.update(1000 / 30)
  s.aim(60, 0.95)
  s.fire()
  g = 0
  while (s.state !== 'aiming' && g++ < 2000) s.update(1000 / 30)
  const raider = s.world.filter((e) => e.raid)[0]
  if (raider?.alive) {
    const x = raider.x
    for (let i = 0; i < 300; i++) s.update(1000 / 30)
    assert.ok(Math.abs(raider.x - x) < 3, 'immobile pendant 10 s de visée')
  }
  s.destroy()
})

test('seau d’eau en partie : le feu s’éteint, le seau est compté, la relecture est identique', () => {
  const { s } = play(17, { shots: 2, bucket: true })
  assert.equal(s.hud.condition.buckets, 1)
  assert.equal(s.condition.rust, 1)
  assert.equal(s.condition.fireLevel, 0)
  const log = s.log
  assert.ok(log.some((a) => a.k === 'w'), 'le seau est dans le journal')
  // Relecture (lien « Bats mon tir ») : même état de l’engin.
  const code = ReplayCode.encode({ levelId: 17, engine: 'catapult', log })
  const { actions } = ReplayCode.decode(code)
  const r = new GameSession(LevelRepository.get(17), { difficulty: 'normal', completedLevels: 0, reducedMotion: true, replay: true })
  const player = new ReplayPlayer(r, actions)
  for (let i = 0; i < 40000 && !player.done; i++) player.tick()
  assert.equal(Math.ceil(r.condition.hp), Math.ceil(s.condition.hp))
  assert.equal(r.condition.rust, 1)
  s.destroy()
  r.destroy()
})

test('pillards : placés selon le tableau, seaux là où il y a des torches, ouvrages présentés', () => {
  for (const [rank, raids] of Object.entries(RAIDS)) {
    const level = LevelRepository.get(Number(rank))
    assert.equal(level.targets.filter((t) => t.raid).length, raids.length, `niveau ${rank}`)
    assert.equal(level.buckets, raids.includes('fire') ? 2 : 0)
  }
  const first = (key) => LevelRepository.all().find((l) => LevelRepository.novelties(l.id).includes(key))?.id
  assert.equal(first('build:ladder'), 32)
  assert.equal(first('build:bridge'), 34)
})

test('niveau 32 : l’échelle renversée sous le pillard, il tombe au lieu de rester collé à la montagne', () => {
  const s = new GameSession(LevelRepository.get(32), { difficulty: 'normal', completedLevels: 0, reducedMotion: true })
  let g = 0
  while (s.state !== 'aiming' && g++ < 300) s.update(1000 / 30)
  const raider = s.world.filter((e) => e.raid)[0]
  let dropped = false
  s.on('feedback', (f) => {
    if (f.caption === 'unit.ladderDown') dropped = true
  })
  // Tirs hauts et courts : ils retombent au pied de la montagne et renversent
  // l'échelle pendant que le pillard redescend l'autre versant (cas signalé).
  for (let shot = 0; shot < 4 && raider.alive && s.state !== 'ended'; shot++) {
    s.aim(78, 0.35)
    s.fire()
    g = 0
    while (s.state !== 'aiming' && s.state !== 'ended' && g++ < 3000) s.update(1000 / 30)
  }
  assert.ok(dropped, 'l’échelle a été renversée')
  // Avant v5.9 : vivant, hors de toute corniche, immobile sur le flanc, pour toujours.
  const stranded = raider.alive && !raider.climbing && !s.world.units.nav.ledgeAt(raider.x, raider.y + raider.height / 2)
  assert.ok(!stranded, `pillard coincé sur la montagne en ${Math.round(raider.x)},${Math.round(raider.y)}`)
})
