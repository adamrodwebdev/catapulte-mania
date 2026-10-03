import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HotSeatMatch } from '../src/game/modes/HotSeatMatch.js'
import { DuelMode, VersusMode, CoopMode, createMode } from '../src/game/modes/modes.js'
import { renownOf } from '../src/game/modes/Renown.js'
import { GameSession } from '../src/game/GameSession.js'
import { LevelRepository } from '../src/game/levels/LevelRepository.js'
import { ArenaRepository } from '../src/game/levels/ArenaRepository.js'
import { DIFFICULTY } from '../src/config/gameConfig.js'
import { SaveSlot } from '../src/domain/SaveSlot.js'

/** Fausse partie : des défenseurs (type, équipe, vivant), la renommée, les tirs. */
function fake({ targets, renown = [0, 0], shots = [3, 3], scores = [0, 0] }) {
  const ts = targets.map(([type, team = 0, alive = true]) => ({ kind: 'target', type, team, alive }))
  return {
    renown,
    world: { filter: (f) => ts.filter(f) },
    get targetsLeft() {
      return ts.filter((t) => t.alive).length
    },
    players: shots.map((s, i) => ({ shotsLeft: s, score: { current: scores[i] } })),
  }
}

test('renommée : soldat 1, chevalier 2, roi 4', () => {
  assert.equal(renownOf({ kind: 'target', type: 'soldier' }), 1)
  assert.equal(renownOf({ kind: 'target', type: 'knight' }), 2)
  assert.equal(renownOf({ kind: 'target', type: 'king' }), 4)
  assert.equal(renownOf({ kind: 'block' }), 0)
})

test('duel : victoire assurée dès que l’écart ne peut plus être rattrapé', () => {
  const duel = new DuelMode({ players: ['A', 'B'] })
  // Reste un soldat (1) + coup de grâce (2) = 3 à prendre : 9 contre 5, écart 4 > 3.
  assert.deepEqual(duel.evaluate(fake({ targets: [['soldier']], renown: [9, 5] })), { won: true, winner: 0, reason: 'assured' })
  // Écart 3 : encore rattrapable.
  assert.equal(duel.evaluate(fake({ targets: [['soldier']], renown: [8, 5] })), null)
  // Château tombé : renommée, puis score, puis nul.
  assert.equal(duel.evaluate(fake({ targets: [['king', 0, false]], renown: [4, 6] })).winner, 1)
  assert.equal(duel.evaluate(fake({ targets: [['king', 0, false]], renown: [5, 5], scores: [900, 100] })).reason, 'score')
  assert.equal(duel.evaluate(fake({ targets: [['king', 0, false]], renown: [5, 5], scores: [100, 100] })).winner, null)
})

test('face-à-face : le régicide l’emporte, sinon ce qui reste debout', () => {
  const vs = new VersusMode({ players: ['A', 'B'] })
  assert.deepEqual(vs.evaluate(fake({ targets: [['king', 1], ['soldier', 1], ['king', 2, false], ['knight', 2]] })), { won: true, winner: 0, reason: 'regicide' })
  assert.equal(vs.evaluate(fake({ targets: [['king', 1], ['king', 2]] })), null)
  // Tirs épuisés : renommée survivante (roi 4 + chevalier 2 contre roi 4).
  const out = vs.evaluate(fake({ targets: [['king', 1], ['knight', 1], ['king', 2], ['soldier', 2, false]], shots: [0, 0] }))
  assert.deepEqual(out, { won: true, winner: 0, reason: 'standing' })
})

test('les arènes du face-à-face ont un roi de chaque côté', () => {
  for (const a of ArenaRepository.all()) {
    for (const team of [1, 2]) assert.equal(a.targets.filter((t) => t.team === team && t.type === 'king').length, 1, `arène ${a.id}`)
  }
})

test('tournoi : manche au nombre de tirs, match au meilleur des trois', () => {
  const m = new HotSeatMatch([3, 4, 5], ['Ana', 'Bob'])
  assert.equal(m.player, 0)
  assert.equal(m.record({ cleared: true, shots: 3, kills: 4, score: 5000 }), 'next-player')
  assert.equal(m.record({ cleared: true, shots: 2, kills: 4, score: 3000 }), 'round-over')
  assert.equal(m.roundWinner(0), 1, 'moins de tirs gagne, même avec moins de points')
  assert.equal(m.levelId, 4)
  assert.equal(m.player, 1, 'le joueur 2 commence la deuxième manche')
  m.record({ cleared: false, shots: 3, kills: 3, score: 900 }) // Bob
  assert.equal(m.record({ cleared: false, shots: 3, kills: 2, score: 2000 }), 'match-over') // Ana
  assert.equal(m.winner, 1)
  assert.deepEqual(m.wins, [0, 2])
  assert.deepEqual(HotSeatMatch.levelsFrom(99, 100), [98, 99, 100])
})

test('campagne à deux : tirs et munitions partagés, score commun', () => {
  const level = LevelRepository.get(30)
  const coop = new CoopMode({ players: ['A', 'B'], completedLevels: 29 })
  const total = level.shots + DIFFICULTY.hard.shotDelta
  assert.equal(coop.shotsFor(level, DIFFICULTY.hard, 0) + coop.shotsFor(level, DIFFICULTY.hard, 1), total)
  const s = new GameSession(level, { difficulty: 'hard', completedLevels: 29 }, createMode('coop', { players: ['A', 'B'], completedLevels: 29 }))
  assert.equal(s.players[0].score, s.players[1].score, 'un seul score pour l’équipe')
  s.destroy()
})

test('campagne à deux : progression enregistrée à part, niveau par niveau', () => {
  const slot = SaveSlot.create(0, 'Duo', 'normal')
  assert.equal(slot.isCoopUnlocked(1), true)
  assert.equal(slot.isCoopUnlocked(2), false)
  const json = slot.toJSON()
  assert.deepEqual(json.coop, {})
  assert.throws(() => SaveSlot.fromJSON(0, { ...json, coop: { 2: { stars: 3, best: 10, shots: 1, attempts: 1 } } }), /gap/)
})

test('campagne à deux : une victoire authentifiée débloque le niveau suivant', () => {
  const slot = SaveSlot.create(0, 'Duo', 'normal')
  const s = new GameSession(LevelRepository.get(1), { difficulty: 'hard', completedLevels: 0 }, createMode('coop', { players: ['A', 'B'] }))
  let end = null
  s.on('end', (e) => (end = e))
  let n = 0
  while (s.state !== 'aiming' && n++ < 200) s.update(33)
  for (const t of s.world.filter((e) => e.kind === 'target')) t.kill('impact')
  for (let i = 0; i < 60 && !end; i++) s.update(33)
  assert.ok(end?.won)
  assert.equal(slot.recordCoop(end.result).firstClear, true)
  assert.equal(slot.coopCompleted, 1)
  assert.equal(slot.isCoopUnlocked(2), true)
  assert.equal(slot.completedCount, 0, 'la campagne solo n’est pas touchée')
  s.destroy()
})
