import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GameSession } from '../src/game/GameSession.js'
import { LevelRepository } from '../src/game/levels/LevelRepository.js'
import { createMode } from '../src/game/modes/modes.js'
import { EndlessRun, ENDLESS } from '../src/domain/EndlessRun.js'
import { SaveSlot } from '../src/domain/SaveSlot.js'
import { emptyDesign, placePart, removeAt, CastleCode, buildCustomLevel, LIMITS, MAX_CASTLE_CODE } from '../src/game/editor/CastleDesign.js'
import { RewardTicket } from '../src/services/ads/RewardTicket.js'
import { eventFor } from '../src/game/events/Season.js'
import { UpgradeCatalog } from '../src/game/progression/UpgradeCatalog.js'

/** Termine une partie en vidant (ou non) le château, et renvoie son résultat authentique. */
function finish(level, { win = true, mode = createMode('endless', { shots: 3 }), engine = 'catapult' } = {}) {
  const s = new GameSession(level, { difficulty: 'normal', completedLevels: 20, reducedMotion: true, engine }, mode)
  let end = null
  s.on('end', (e) => (end = e))
  for (let i = 0; i < 200 && s.state !== 'aiming'; i++) s.update(33)
  if (win) {
    for (const t of s.world.filter((e) => e.kind === 'target')) t.kill('fire')
    for (let i = 0; i < 400 && !end; i++) s.update(33)
  } else {
    // Tirs perdus (presque à la verticale, à faible puissance) jusqu'à épuisement.
    for (let i = 0; i < 6000 && !end; i++) {
      if (s.state === 'aiming') {
        s.aim(80, 0.05)
        s.fire()
      }
      s.update(33)
    }
  }
  return { end, session: s }
}

test('siège sans fin : châteaux de plus en plus loin dans la campagne, même suite pour une même graine', () => {
  const a = EndlessRun.start(42)
  const b = EndlessRun.start(42)
  const waves = Array.from({ length: 20 }, (_, i) => a.levelFor(i + 1))
  assert.deepEqual(waves, Array.from({ length: 20 }, (_, i) => b.levelFor(i + 1)))
  assert.ok(waves[0] <= 13 && waves[19] >= 70)
  assert.ok(waves.every((id) => id >= 1 && id <= 100))
})

test('siège sans fin : un château pris rapporte points et tirs, une défaite termine le siège', () => {
  const run = EndlessRun.start(7)
  const { end } = finish(LevelRepository.get(run.levelFor()), { mode: createMode('endless', { shots: run.shots }) })
  assert.ok(end.won)
  assert.equal(run.record(end.result, 4), 'next')
  assert.equal(run.wave, 2)
  assert.equal(run.score, end.result.score)
  assert.equal(run.shots, Math.min(ENDLESS.MAX_SHOTS, 4 + ENDLESS.BONUS_SHOTS + (end.result.shotsUsed === 1 ? 1 : 0)))
  assert.throws(() => run.record(end.result, 4), /engine/, 'un résultat ne sert qu’une fois')
  const lost = finish(LevelRepository.get(run.levelFor()), { win: false, mode: createMode('endless', { shots: 1 }) })
  assert.equal(lost.end.won, false)
  assert.equal(run.record(lost.end.result, 0), 'over')
  assert.ok(run.over)
})

test('siège sans fin : résultats et parties non authentiques refusés', () => {
  const run = EndlessRun.start(7)
  assert.throws(() => run.record({ levelId: run.levelFor(), won: true, score: 99999, shotsUsed: 1 }, 3), /engine/)
  const other = LevelRepository.get(run.levelFor() === 50 ? 51 : 50)
  const { end } = finish(other)
  assert.throws(() => run.record(end.result, 3), /wrong castle/)
  const slot = SaveSlot.create(0, 'Robin', 'normal')
  assert.throws(() => slot.recordEndless(run), /finished siege/, 'siège pas terminé')
  assert.throws(() => slot.recordEndless(new EndlessRun(1)), /finished siege/, 'partie fabriquée à la main')
})

test('profil : records du siège sans fin, contrôlés au chargement', () => {
  const run = EndlessRun.start(3)
  const w = finish(LevelRepository.get(run.levelFor()), { mode: createMode('endless', { shots: 6 }) })
  run.record(w.end.result, 5)
  const l = finish(LevelRepository.get(run.levelFor()), { win: false, mode: createMode('endless', { shots: 1 }) })
  run.record(l.end.result, 0)
  const slot = SaveSlot.create(0, 'Robin', 'normal')
  const out = slot.recordEndless(run)
  assert.ok(out.newBest && out.newWave)
  assert.equal(slot.endless.bestWave, 1)
  const json = slot.toJSON()
  assert.equal(SaveSlot.fromJSON(0, json).endless.best, run.score)
  assert.throws(() => SaveSlot.fromJSON(0, { ...json, endless: { best: 10_000_000, bestWave: 1, sieges: 1 } }), /impossible/)
})

test('atelier : les pièces s’empilent, défenseurs dans l’étage visé, retrait en cascade', () => {
  const d = emptyDesign()
  const r1 = placePart(d, 'room', 1500, 'stone')
  const r2 = placePart(d, 'room', 1500, 'wood')
  assert.equal(r1.y, 900)
  assert.equal(r2.y, 780, 'le second étage repose sur le premier')
  assert.equal(placePart(d, 'soldier', 1500, 'wood', 850).y, 900, 'dans l’étage du bas')
  assert.equal(placePart(d, 'soldier', 1500, 'wood', 850), null, 'place déjà prise')
  const roof = placePart(d, 'roof', 1500, 'wood')
  assert.equal(roof.y, 660)
  assert.equal(placePart(d, 'king', 1500), null, 'un toit occupe le dessus')
  assert.ok(removeAt(d, 1500, 850))
  assert.ok(d.parts.every((p) => p.y <= 900))
  assert.ok(d.parts.some((p) => p.kind === 'roof' && p.y === 780), 'le toit est retombé d’un étage')
})

test('atelier : code de partage validé (aller-retour, données non fiables, limites)', () => {
  const d = emptyDesign()
  d.name = 'Montségur'
  placePart(d, 'base', 1700, 'stone')
  placePart(d, 'room', 1700, 'iron')
  placePart(d, 'knight', 1700)
  placePart(d, 'barrel', 1300)
  const code = CastleCode.encode(d)
  const back = CastleCode.decode(code)
  assert.equal(back.name, 'Montségur')
  assert.deepEqual(back.parts, d.parts)
  const level = buildCustomLevel(back)
  assert.equal(level.targets.length, 1)
  assert.throws(() => CastleCode.decode(''))
  assert.throws(() => CastleCode.decode('x'.repeat(MAX_CASTLE_CODE + 1)))
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const ok = { v: 1, n: '', th: 1, s: 4, w: 6, a: [1, 0, 1, 0], p: [['s', 1500, 900]] }
  assert.equal(CastleCode.decode(enc(ok)).parts.length, 1)
  assert.throws(() => CastleCode.decode(enc({ ...ok, p: [['r', 1500, 900, 1]] })), /no defender/)
  assert.throws(() => CastleCode.decode(enc({ ...ok, p: [['s', 100, 900]] })), 'hors zone')
  assert.throws(() => CastleCode.decode(enc({ ...ok, p: [['s', 1500, 900, 2]] })), /material/)
  assert.throws(() => CastleCode.decode(enc({ ...ok, s: 99 })))
  assert.throws(() => CastleCode.decode(enc({ ...ok, p: Array.from({ length: LIMITS.parts + 1 }, () => ['s', 1500, 900]) })))
  assert.throws(() => CastleCode.decode(enc({ ...ok, evil: 1 })))
})

test('vidéos récompensées en partie : indice et pouvoir offert, une fois chacun, ticket obligatoire', () => {
  const level = LevelRepository.get(30)
  const s = new GameSession(level, { difficulty: 'normal', completedLevels: 40, reducedMotion: true }, createMode('story', { completedLevels: 40 }))
  for (let i = 0; i < 200 && s.state !== 'aiming'; i++) s.update(33)
  assert.equal(s.trajectory, null)
  assert.equal(s.grantHint({}), false, 'sans ticket : refusé')
  assert.equal(s.grantHint(RewardTicket.issue('double-gold')), false, 'mauvais ticket')
  assert.ok(s.grantHint(RewardTicket.issue('hint')))
  assert.ok(Array.isArray(s.trajectory))
  assert.equal(s.grantHint(RewardTicket.issue('hint')), false, 'une fois par niveau')
  const before = s.score.current
  assert.ok(s.usePowerFree('calm', RewardTicket.issue('free-power')))
  assert.equal(s.score.current, before, 'aucun point retiré')
  assert.equal(s.hud.rewards.freePower, false)
  s.fire()
  assert.equal(s.trajectory, null, 'l’indice ne vaut que pour un tir')
  const daily = new GameSession(level, { difficulty: 'normal', completedLevels: 40, reducedMotion: true }, createMode('daily', {}))
  for (let i = 0; i < 200 && daily.state !== 'aiming'; i++) daily.update(33)
  assert.equal(daily.grantHint(RewardTicket.issue('hint')), false, 'jamais en défi (équité)')
})

test('événements : dates, cosmétique offert jamais vendu, récompense une seule fois', () => {
  assert.equal(eventFor('2026-10-20'), 'halloween')
  assert.equal(eventFor('2026-11-02'), 'halloween')
  assert.equal(eventFor('2026-11-03'), null)
  assert.equal(eventFor('2026-12-31'), 'winter')
  assert.equal(eventFor('2027-01-06'), 'winter')
  assert.ok(!UpgradeCatalog.defaults().includes('pumpkin'))
  const slot = SaveSlot.create(0, 'Robin', 'normal')
  assert.equal(slot.buyCosmetic('pumpkin'), false)
  assert.equal(slot.grantEventReward('2026-09-01'), null)
  assert.equal(slot.grantEventReward('2026-10-20'), 'pumpkin')
  assert.equal(slot.grantEventReward('2026-10-21'), null)
  assert.ok(slot.equip('pumpkin'))
  assert.equal(SaveSlot.fromJSON(0, slot.toJSON()).cosmetics.trail, 'pumpkin')
})
