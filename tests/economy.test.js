import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MemoryStorage } from './helpers.js'
import { StorageService } from '../src/services/StorageService.js'
import { SaveSigner } from '../src/services/SaveSigner.js'
import { SaveManager } from '../src/services/SaveManager.js'
import { SaveSlot } from '../src/domain/SaveSlot.js'
import { LevelResult } from '../src/domain/LevelResult.js'
import { UpgradeCatalog } from '../src/game/progression/UpgradeCatalog.js'
import { GOLD, goldFor, maxGoldFor } from '../src/game/progression/GoldRules.js'

const win = (levelId, stars = 3, achievements = 7, shotsUsed = 1) =>
  LevelResult.issue({
    levelId, score: 1000, stars, won: true, targetsKilled: 2, blocksDestroyed: 5,
    barrelsExploded: 0, shotsUsed, powersUsed: 0, difficulty: 'normal', achievements,
  })

/** Profil qui a gagné les niveaux 1..n avec 3 étoiles et les 3 succès. */
function richSlot(n = 10) {
  const slot = SaveSlot.create(0, 'Jeanne', 'normal')
  for (let i = 1; i <= n; i++) slot.recordResult(win(i))
  return slot
}

test('l’or récompense la maîtrise (étoiles et succès nouveaux), pas la répétition', () => {
  const slot = SaveSlot.create(0, 'Jeanne', 'normal')
  const r = slot.recordResult(win(1, 2, 0b001))
  assert.equal(r.gold, GOLD.FIRST_CLEAR + 2 * GOLD.PER_STAR + GOLD.PER_ACHIEVEMENT)
  assert.equal(r.newAchievements, 0b001)
  // Même résultat rejoué : petite somme seulement.
  assert.equal(slot.recordResult(win(1, 2, 0b001)).gold, GOLD.REPLAY)
  // Une étoile et deux succès de plus.
  const r3 = slot.recordResult(win(1, 3, 0b111))
  // Les trois défis relevés : bonus « parfait » en plus.
  assert.equal(r3.gold, GOLD.REPLAY + GOLD.PER_STAR + 2 * GOLD.PER_ACHIEVEMENT + GOLD.PERFECT)
  assert.equal(r3.newAchievements, 0b110)
  assert.equal(slot.achievementCount, 3)
  assert.equal(slot.levelRecord(1).ach, 7)
  const loss = LevelResult.issue({ levelId: 2, score: 0, stars: 0, won: false, targetsKilled: 0, blocksDestroyed: 0, barrelsExploded: 0, shotsUsed: 3, powersUsed: 0, difficulty: 'normal' })
  assert.equal(slot.recordResult(loss).gold, 0)
  assert.equal(goldFor({ won: false }, { firstClear: true, newStars: 3, newAchievements: 3 }), 0)
})

test('le record garde le plus petit nombre de tirs gagnants', () => {
  const slot = SaveSlot.create(0, 'Jeanne', 'normal')
  slot.recordResult(win(1, 1, 0, 4))
  slot.recordResult(win(1, 3, 0, 1))
  slot.recordResult(win(1, 2, 0, 2))
  assert.equal(slot.levelRecord(1).shots, 1)
  assert.equal(slot.levelRecord(1).stars, 3)
})

test('acheter une amélioration débite l’or et applique l’effet', () => {
  const slot = richSlot()
  const before = slot.gold
  assert.equal(slot.buyUpgrade('arm'), true)
  assert.equal(slot.gold, before - UpgradeCatalog.upgrade('arm').costs[0])
  assert.equal(slot.upgrades.arm, 1)
  assert.ok(Math.abs(slot.effects.speedFactor - 1.07) < 1e-9)
})

test('les paliers exigent de l’or ET des étoiles', () => {
  const poor = SaveSlot.create(0, 'Jeanne', 'normal')
  assert.equal(poor.buyUpgrade('arm'), false, 'pas assez d’or')
  const mid = richSlot(15) // 45 étoiles, assez d'or pour l'éclaireur
  assert.ok(mid.gold >= UpgradeCatalog.upgrade('scout').costs[0])
  assert.equal(mid.buyUpgrade('scout'), false, 'il faut 60 étoiles')
  const slot = richSlot(20)
  assert.equal(slot.buyUpgrade('scout'), true)
  assert.equal(slot.buyUpgrade('scout'), false, 'second palier hors de portée')
})

test('nouvelles améliorations : poix et poudre fine', () => {
  const slot = richSlot(10)
  assert.equal(slot.buyUpgrade('pitch'), true)
  assert.equal(slot.buyUpgrade('powder'), true)
  assert.ok(Math.abs(slot.effects.fireFactor - 1.35) < 1e-9)
  assert.ok(Math.abs(slot.effects.blastFactor - 1.15) < 1e-9)
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
  assert.equal(slot.starCount, 3)
  assert.equal(slot.toJSON().version, 4)
})

test('sauvegarde v2 : améliorations remboursées, or et étoiles conservés', () => {
  const v2 = {
    version: 2, name: 'Robin', difficulty: 'normal', createdAt: 1, updatedAt: 2,
    levels: { 1: { stars: 3, best: 900, attempts: 2 }, 2: { stars: 2, best: 700, attempts: 1 } },
    stats: { shots: 4, targets: 3, blocks: 9, barrels: 0, powers: 0 },
    gold: 80, goldEarned: 230, upgrades: { arm: 1 },
    cosmetics: { owned: ['oak', 'smoke'], skin: 'oak', trail: 'smoke' },
  }
  const slot = SaveSlot.fromJSON(0, v2)
  assert.deepEqual(slot.upgrades, {})
  assert.equal(slot.gold, 230, 'les 150 pièces du bras sont remboursées')
  assert.equal(slot.starCount, 5)
  assert.equal(slot.levelRecord(1).shots, 0)
  // Rechargement de la sauvegarde migrée : cohérente.
  assert.doesNotThrow(() => SaveSlot.fromJSON(0, slot.toJSON()))
})

test('or incohérent ou impossible : sauvegarde refusée', () => {
  const json = richSlot(2).toJSON()
  assert.throws(() => SaveSlot.fromJSON(0, { ...json, gold: json.gold + 1000 }), /balance/)
  assert.throws(() => SaveSlot.fromJSON(0, { ...json, gold: 99999, goldEarned: 99999 }), /more gold/)
  assert.throws(() => SaveSlot.fromJSON(0, { ...json, upgrades: { arm: 9 } }), /./)
  assert.throws(() => SaveSlot.fromJSON(0, { ...json, upgrades: { hack: 1 } }), /./)
  assert.throws(() => SaveSlot.fromJSON(0, { ...json, legacyGold: 99999 }), /more gold/)
  assert.throws(() => SaveSlot.fromJSON(0, { ...json, levels: { ...json.levels, 1: { ...json.levels[1], ach: 9 } } }), /./)
  assert.throws(() => SaveSlot.fromJSON(0, { ...json, cosmetics: { ...json.cosmetics, skin: 'dragon' } }), /not owned/)
})

test('v3 → v4 : succès renouvelés remis à zéro, or conservé', () => {
  const v3 = richSlot(3).toJSON()
  // Or gagné au barème v3.1 (150 par niveau au plus) : 3 niveaux parfaits.
  const legacy = { ...v3, version: 3, legacyGold: 0, gold: 450, goldEarned: 450 }
  const slot = SaveSlot.fromJSON(0, legacy)
  assert.equal(slot.toJSON().version, 4)
  assert.equal(slot.achievementCount, 0)
  assert.equal(slot.gold, 450)
  assert.equal(slot.starCount, 9)
})

test('le perfectionniste peut tout acheter à l’atelier', () => {
  const levels = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [i + 1, { attempts: 1 }]))
  const upgrades = UpgradeCatalog.upgrades().reduce((sum, u) => sum + u.spentFor(u.maxLevel), 0)
  const cosmetics = UpgradeCatalog.cosmetics().reduce((sum, c) => sum + c.cost, 0)
  const all = maxGoldFor(levels) - 100 * GOLD.REPLAY
  assert.ok(all >= upgrades + cosmetics, `${all} < ${upgrades + cosmetics}`)
  // Même sans les défis les plus durs (70 % relevés), l'atelier complet reste accessible.
  const most = 100 * (GOLD.FIRST_CLEAR + 3 * GOLD.PER_STAR) + Math.floor(300 * 0.7) * GOLD.PER_ACHIEVEMENT
  assert.ok(most >= upgrades + cosmetics, `${most} < ${upgrades + cosmetics}`)
  assert.ok(UpgradeCatalog.upgrades().every((u) => u.stars.every((n) => n <= 300)))
})
