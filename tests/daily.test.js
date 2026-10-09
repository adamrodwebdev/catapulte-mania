import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GameSession } from '../src/game/GameSession.js'
import { LevelRepository } from '../src/game/levels/LevelRepository.js'
import { createMode } from '../src/game/modes/modes.js'
import { DailyChallenge, dayKey, dayNumber } from '../src/game/daily/DailyChallenge.js'
import { ReplayCode, MAX_CODE_LENGTH } from '../src/game/replay/ReplayCode.js'
import { ReplayPlayer } from '../src/game/replay/ReplayPlayer.js'
import { SaveSlot } from '../src/domain/SaveSlot.js'

const challenge = (mode, level, engine, replay = false) =>
  new GameSession(level, { difficulty: 'normal', completedLevels: 0, reducedMotion: true, engine, replay }, createMode(mode, {}))

/**
 * Joue une partie « comme un humain » : images de durées irrégulières,
 * tirs à des instants quelconques. Renvoie la session terminée.
 */
function play(level, engine, shots) {
  const s = challenge('daily', level, engine)
  let ended = null
  s.on('end', (e) => (ended = e))
  const frames = [16, 17, 15, 33, 16, 18, 14, 50, 16]
  let f = 0
  const frame = () => s.update(frames[f++ % frames.length])
  for (let i = 0; i < 300 && s.state !== 'aiming'; i++) frame()
  for (const shot of shots) {
    if (ended) break
    for (let i = 0; i < shot.wait; i++) frame()
    s.selectAmmo(shot.ammo)
    if (engine === 'catapult') {
      s.aim(shot.angle, shot.power)
      s.trigger(0)
    } else {
      // v5.4 : 1er appui = cible proposée validée, la jauge oscille ; 2e appui = tir.
      if (shot.dx) s.nudgeTrebTarget(shot.dx)
      s.trigger(0)
      for (let i = 0; i < shot.gaugeFrames; i++) frame()
      s.trigger(0)
    }
    for (let i = 0; i < 2000 && s.state !== 'aiming' && !ended; i++) frame()
  }
  return { session: s, ended }
}

function replay(code) {
  const run = ReplayCode.decode(code)
  const s = challenge('challenge', LevelRepository.get(run.levelId), run.engine, true)
  let ended = null
  s.on('end', (e) => (ended = e))
  const player = new ReplayPlayer(s, run.actions)
  player.runToEnd()
  return { session: s, ended }
}

test('défi du jour : le même pour tous à une date donnée, varié d’un jour à l’autre', () => {
  const a = DailyChallenge.forDay('2026-10-04')
  assert.deepEqual(a, DailyChallenge.forDay('2026-10-04'))
  assert.ok(a.levelId >= 5 && a.levelId <= 100)
  assert.equal(a.difficulty, 'normal')
  const days = Array.from({ length: 30 }, (_, i) => DailyChallenge.forDay(dayKey(new Date(2026, 9, 1 + i))))
  assert.ok(new Set(days.map((d) => d.levelId)).size > 15, 'des niveaux variés')
  assert.ok(days.some((d) => d.engine === 'trebuchet') && days.some((d) => d.engine === 'catapult'))
  assert.equal(dayNumber('2026-10-05') - dayNumber('2026-10-04'), 1)
  assert.equal(dayNumber('2026-03-01') - dayNumber('2026-02-28'), 1)
  assert.throws(() => DailyChallenge.forDay('2026-13-01'))
})

test('défi du jour : sans pouvoirs ni améliorations, munitions du niveau', () => {
  const level = LevelRepository.get(30)
  const s = new GameSession(level, { difficulty: 'normal', completedLevels: 60, reducedMotion: true }, createMode('daily', { completedLevels: 60, effects: { speedFactor: 1.3, massFactor: 2, extraAmmo: 2 } }))
  assert.equal(s.hud.powersEnabled, false)
  assert.equal(s.catapult.speedFactor, 1)
  assert.deepEqual(s.player.ammo, { ...level.ammo })
})

for (const engine of ['catapult', 'trebuchet']) {
  test(`« Bats mon tir » (${engine}) : la partie rejouée depuis le lien donne exactement le même score`, () => {
    const level = LevelRepository.get(20)
    const shots =
      engine === 'catapult'
        ? [
            { wait: 7, ammo: 'stone', angle: 42.5, power: 0.83 },
            { wait: 3, ammo: 'stone', angle: 30, power: 0.9 },
            { wait: 12, ammo: 'stone', angle: 55, power: 0.78 },
          ]
        : [
            { wait: 5, ammo: 'stone', gaugeFrames: 23 },
            { wait: 9, ammo: 'stone', gaugeFrames: 61, dx: -40 },
            { wait: 2, ammo: 'stone', gaugeFrames: 7, dx: 60 },
          ]
    const original = play(level, engine, shots)
    const log = original.session.log
    assert.ok(log.length >= 1)
    const code = ReplayCode.encode({ levelId: 20, engine, name: 'Robin', log })
    assert.ok(code.length < MAX_CODE_LENGTH)
    const again = replay(code)
    const score = (r) => (r.ended ? r.ended.scores[0] : r.session.score.current)
    assert.equal(score(again), score(original))
    assert.equal(again.session.targetsLeft, original.session.targetsLeft)
  })
}

test('« Bats mon tir » : un lien de trébuchet d’avant la v5.4 (instant de lâcher) se rejoue encore', () => {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const code = enc({ v: 2, day: '', l: 20, e: 'trebuchet', n: '', a: [['t', 60, 0, 730, 70]] })
  const r = replay(code)
  assert.ok(r.session.log.some((x) => x.k === 't'), 'le tir a été rejoué')
  assert.ok(r.session.world.filter((e) => e.kind === 'projectile').length > 0 || r.ended || r.session.state === 'aiming')
})

test('code de défi : trébuchet v5.4 — cible et jauge validées', () => {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const base = { v: 2, day: '', l: 20, e: 'trebuchet', n: '', a: [['t', 60, 0, 1200, 880, 0.4, 70]] }
  assert.equal(ReplayCode.decode(enc(base)).actions[0].g, 0.4)
  assert.throws(() => ReplayCode.decode(enc({ ...base, a: [['t', 60, 0, 1200, 880, 1.4, 70]] })))
  assert.throws(() => ReplayCode.decode(enc({ ...base, a: [['t', 60, 0, 'x', 880, 0.4, 70]] })))
})

test('code de défi : données non fiables refusées (format, pouvoirs, engin, défi du jour)', () => {
  assert.throws(() => ReplayCode.decode(''))
  assert.throws(() => ReplayCode.decode('a'.repeat(MAX_CODE_LENGTH + 1)))
  assert.throws(() => ReplayCode.decode('<script>'))
  assert.throws(() => ReplayCode.decode('bm90IGpzb24'))
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const ok = { v: 2, day: '', l: 20, e: 'catapult', n: '', a: [['f', 10, 0, 40, 0.8, 11]] }
  assert.equal(ReplayCode.decode(enc(ok)).levelId, 20)
  assert.throws(() => ReplayCode.decode(enc({ ...ok, a: [['p', 0, 'titan'], ...ok.a] })), /unknown action/)
  assert.throws(() => ReplayCode.decode(enc({ ...ok, a: [['f', 10, 0, 40, 3, 11]] })))
  assert.throws(() => ReplayCode.decode(enc({ ...ok, a: [['t', 10, 0, 700, 50]] })), /engine/)
  assert.throws(() => ReplayCode.decode(enc({ ...ok, score: 999999 })))
  const day = DailyChallenge.forDay('2026-10-04')
  const wrong = day.levelId === 20 ? 21 : 20
  assert.throws(() => ReplayCode.decode(enc({ ...ok, day: '2026-10-04', l: wrong, e: day.engine, a: [[day.engine === 'catapult' ? 'f' : 't', ...(day.engine === 'catapult' ? [10, 0, 40, 0.8, 11] : [10, 0, 700, 50])]] })), /daily/)
})

test('profil : série du défi du jour (consécutive, rompue, horloge reculée)', () => {
  const slot = SaveSlot.create(0, 'Robin', 'normal')
  const win = (key) => {
    const c = DailyChallenge.forDay(key)
    const level = LevelRepository.get(c.levelId)
    const s = challenge('daily', level, c.engine)
    // Résultat authentique : on vide le château à la main puis on termine la partie.
    for (const t of s.world.filter((e) => e.kind === 'target')) t.kill('fire')
    let result = null
    s.on('end', (e) => (result = e.result))
    for (let i = 0; i < 400 && !result; i++) s.update(33)
    return slot.recordDaily(result, key)
  }
  assert.equal(win('2026-10-01').streak, 1)
  assert.equal(win('2026-10-02').streak, 2)
  assert.equal(win('2026-10-02').extended, false, 'rejouer le même jour ne compte pas deux fois')
  assert.equal(slot.dailyStreak('2026-10-03'), 2)
  assert.equal(slot.dailyStreak('2026-10-05'), 0, 'série rompue après un jour manqué')
  assert.equal(win('2026-10-05').streak, 1)
  assert.equal(slot.daily.bestStreak, 2)
  win('2026-09-20')
  assert.equal(slot.daily.streak, 1, 'horloge reculée : série intacte')
  const again = SaveSlot.fromJSON(0, slot.toJSON())
  assert.equal(again.daily.bestStreak, 2)
  assert.throws(() => SaveSlot.fromJSON(0, { ...slot.toJSON(), daily: { last: '', streak: 3, bestStreak: 3, days: {} } }))
})

test("profil : seul le résultat du défi du jour est accepté pour ce jour", () => {
  const slot = SaveSlot.create(0, 'Robin', 'normal')
  const key = '2026-10-04'
  const c = DailyChallenge.forDay(key)
  const other = LevelRepository.get(c.levelId === 50 ? 51 : 50)
  const s = challenge('daily', other, 'catapult')
  for (const t of s.world.filter((e) => e.kind === 'target')) t.kill('fire')
  let result = null
  s.on('end', (e) => (result = e.result))
  for (let i = 0; i < 400 && !result; i++) s.update(33)
  assert.throws(() => slot.recordDaily(result, key), /today/)
  assert.throws(() => slot.recordDaily({ levelId: c.levelId, won: true, score: 1, difficulty: 'normal' }, key), /engine/)
})
