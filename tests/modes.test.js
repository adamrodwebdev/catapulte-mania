import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GameSession } from '../src/game/GameSession.js'
import { LevelRepository } from '../src/game/levels/LevelRepository.js'
import { ArenaRepository } from '../src/game/levels/ArenaRepository.js'
import { FreeMode, DuelMode, VersusMode, StoryMode, HotSeatMode } from '../src/game/modes/modes.js'
import { UpgradeCatalog } from '../src/game/progression/UpgradeCatalog.js'

const OPTS = { difficulty: 'normal', completedLevels: 10, reducedMotion: true }

/** Avance jusqu'au prochain état de visée (ou la fin). */
function untilAiming(s, max = 900) {
  let ended = null
  s.on('end', (e) => (ended = e))
  for (let i = 0; i < max && s.state !== 'aiming' && s.state !== 'ended'; i++) s.update(1000 / 30)
  return ended
}

/** Tir perdu (loin du château) : n'abat rien. */
function wasteShot(s) {
  s.aim(80, 0)
  assert.equal(s.fire(), true)
  return untilAiming(s)
}

test('histoire : le nombre de tirs est limité et le résultat est authentifié', () => {
  const s = new GameSession(LevelRepository.get(2), OPTS, new StoryMode({ completedLevels: 10 }))
  untilAiming(s)
  let end = null
  for (let i = 0; i < 10 && !end; i++) end = wasteShot(s)
  assert.ok(end, 'la partie doit finir faute de tirs')
  assert.equal(end.won, false)
  assert.ok(end.result, 'un résultat enregistrable est produit')
})

test('mode libre : tirs illimités, munitions découvertes à volonté, pouvoirs gratuits', () => {
  const s = new GameSession(LevelRepository.get(25), OPTS, new FreeMode({ completedLevels: 30 }))
  untilAiming(s)
  assert.equal(s.hud.shotsLeft, null)
  const bomb = s.ammo.find((a) => a.type === 'bomb')
  assert.ok(bomb && bomb.count === null, 'boulets explosifs illimités')
  assert.ok(s.powers.every((p) => p.cost === 0))
  for (let i = 0; i < 6; i++) assert.equal(wasteShot(s), null, 'jamais de fin par manque de tirs')
})

test('duel : les joueurs tirent à tour de rôle', () => {
  const s = new GameSession(LevelRepository.get(1), OPTS, new DuelMode({ players: ['Anne', 'Hugues'] }))
  untilAiming(s)
  assert.equal(s.activePlayer, 0)
  wasteShot(s)
  assert.equal(s.activePlayer, 1)
  wasteShot(s)
  assert.equal(s.activePlayer, 0)
  assert.equal(s.hud.players[1].name, 'Hugues')
})

test('duel : chaque destruction compte pour celui qui tire', () => {
  const s = new GameSession(LevelRepository.get(1), OPTS, new DuelMode({ players: ['Anne', 'Hugues'] }))
  untilAiming(s)
  wasteShot(s) // Anne
  s.aim(45, 0.5)
  s.fire() // Hugues
  for (const t of s.world.filter((e) => e.kind === 'target')) t.kill('impact')
  const end = untilAiming(s)
  assert.ok(end)
  assert.equal(end.winner, 1)
  assert.ok(end.scores[1] > end.scores[0])
  assert.equal(end.result, null, 'rien n’est enregistré')
})

test('face-à-face : deux catapultes opposées, le premier qui élimine l’autre camp gagne', () => {
  const s = new GameSession(ArenaRepository.get(1), OPTS, new VersusMode({ players: ['Rouge', 'Vert'] }))
  untilAiming(s)
  assert.equal(s.players[0].catapult.dir, 1)
  assert.equal(s.players[1].catapult.dir, -1)
  assert.ok(s.players[1].catapult.velocity.x < 0, 'la catapulte de droite tire vers la gauche')
  s.aim(80, 0)
  s.fire()
  for (const t of s.world.filter((e) => e.kind === 'target' && e.team === 2)) t.kill('impact')
  const end = untilAiming(s)
  assert.ok(end)
  assert.equal(end.winner, 0)
})

test('les arènes sont symétriques', () => {
  for (const a of ArenaRepository.all()) {
    const t1 = a.targets.filter((t) => t.team === 1).length
    const t2 = a.targets.filter((t) => t.team === 2).length
    assert.equal(t1, t2)
    assert.ok(t1 > 0)
  }
})

test('chacun sa partie : une manche sans améliorations ni enregistrement', () => {
  const rich = UpgradeCatalog.effectsOf({ scout: 1 })
  const s = new GameSession(LevelRepository.get(1), OPTS, new HotSeatMode({ players: ['Anne'], effects: rich }))
  assert.equal(s.hud.shotsTotal, LevelRepository.get(1).shots, 'pas de tir bonus en mode deux joueurs')
})

test('améliorations : tir supplémentaire et munitions en plus en histoire', () => {
  const fx = UpgradeCatalog.effectsOf({ scout: 1, quiver: 2 })
  const level = LevelRepository.get(11)
  const s = new GameSession(level, { ...OPTS, effects: fx })
  assert.equal(s.hud.shotsTotal, level.shots + 1)
  assert.equal(s.ammo.find((a) => a.type === 'boulder').count, level.ammo.boulder + 2)
})
