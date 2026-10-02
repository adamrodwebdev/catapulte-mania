import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MemoryStorage } from './helpers.js'
import { StorageService } from '../src/services/StorageService.js'
import { SaveSigner } from '../src/services/SaveSigner.js'
import { SaveManager } from '../src/services/SaveManager.js'
import { SaveSlot } from '../src/domain/SaveSlot.js'
import { LevelResult } from '../src/domain/LevelResult.js'
import { UpgradeCatalog } from '../src/game/progression/UpgradeCatalog.js'
import { GOLD, goldFor } from '../src/game/progression/GoldRules.js'

const win = (levelId, stars = 3) =>
  LevelResult.issue({
    levelId, score: 1000, stars, won: true, targetsKilled: 2, blocksDestroyed: 5,
    barrelsExploded: 0, shotsUsed: 2, powersUsed: 0, difficulty: 'normal',
  })

/** Profil qui a gagné les niveaux 1..n avec 3 étoiles. */
function richSlot(n = 10) {
  const slot = SaveSlot.create(0, 'Jeanne', 'normal')
  for (let i = 1; i <= n; i++) slot.recordResult(win(i))
  return slot
}

test('une victoire rapporte de l’or, une défaite rien', () => {
  const slot = SaveSlot.create(0, 'Jeanne', 'normal')
  const r = slot.recordResult(win(1, 2))
  assert.equal(r.gold, GOLD.BASE + 2 * GOLD.PER_STAR + GOLD.FIRST_CLEAR)
  assert.equal(slot.gold, r.gold)
  const loss = LevelResult.issue({ levelId: 2, score: 0, stars: 0, won: false, targetsKilled: 0, blocksDestroyed: 0, barrelsExploded: 0, shotsUsed: 3, powersUsed: 0, difficulty: 'normal' })
  assert.equal(slot.recordResult(loss).gold, 0)
  assert.equal(goldFor({ won: true, stars: 3 }, false), GOLD.MAX_PER_WIN)
})

test('acheter une amélioration débite l’or et applique l’effet', () => {
  const slot = richSlot()
  const before = slot.gold
  assert.equal(slot.buyUpgrade('arm'), true)
  assert.equal(slot.gold, before - UpgradeCatalog.upgrade('arm').costs[0])
  assert.equal(slot.upgrades.arm, 1)
  assert.ok(Math.abs(slot.effects.speedFactor - 1.07) < 1e-9)
})

test('impossible d’acheter sans assez d’or ou au-delà du maximum', () => {
  const poor = SaveSlot.create(0, 'Jeanne', 'normal')
  assert.equal(poor.buyUpgrade('scout'), false)
  const slot = richSlot(40)
  assert.equal(slot.buyUpgrade('scout'), true)
  assert.equal(slot.buyUpgrade('scout'), false, 'un seul niveau')
})

test('apparences : achat puis équipement', () => {
  const slot = richSlot()
  assert.equal(slot.equip('royal'), false, 'non possédée')
  assert.equal(slot.buyCosmetic('royal'), true)
  assert.equal(slot.equip('royal'), true)
  assert.equal(slot.effects.skin, 'royal')
})

test('une sauvegarde v2 cohérente se recharge à l’identique', async () => {
  const storage = new StorageService(new MemoryStorage())
  const manager = new SaveManager(storage, new SaveSigner(storage))
  const slot = richSlot()
  slot.buyUpgrade('ballast')
  slot.buyCosmetic('embers')
  slot.equip('embers')
  await manager.save(slot)
  const loaded = await manager.load(0)
  assert.equal(loaded.gold, slot.gold)
  assert.deepEqual(loaded.upgrades, { ballast: 1 })
  assert.equal(loaded.effects.trail, 'embers')
})

test('une ancienne sauvegarde (v1) est migrée sans perte', () => {
  const v1 = {
    version: 1, name: 'Robin', difficulty: 'easy', createdAt: 1, updatedAt: 2,
    levels: { 1: { stars: 3, best: 900, attempts: 1 } },
    stats: { shots: 2, targets: 1, blocks: 3, barrels: 0, powers: 0 },
  }
  const slot = SaveSlot.fromJSON(0, v1)
  assert.equal(slot.completedCount, 1)
  assert.equal(slot.gold, 0)
  assert.equal(slot.toJSON().version, 2)
})

test('or incohérent ou impossible : sauvegarde refusée', () => {
  const json = richSlot(2).toJSON()
  assert.throws(() => SaveSlot.fromJSON(0, { ...json, gold: json.gold + 1000 }), /balance/)
  assert.throws(() => SaveSlot.fromJSON(0, { ...json, gold: 99999, goldEarned: 99999 }), /more gold/)
  assert.throws(() => SaveSlot.fromJSON(0, { ...json, upgrades: { arm: 9 } }), /./)
  assert.throws(() => SaveSlot.fromJSON(0, { ...json, upgrades: { hack: 1 } }), /./)
  assert.throws(() => SaveSlot.fromJSON(0, { ...json, cosmetics: { ...json.cosmetics, skin: 'dragon' } }), /not owned/)
})
