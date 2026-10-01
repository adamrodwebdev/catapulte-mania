import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MemoryStorage } from './helpers.js'
import { StorageService } from '../src/services/StorageService.js'
import { SaveSigner } from '../src/services/SaveSigner.js'
import { SaveManager } from '../src/services/SaveManager.js'
import { LevelResult } from '../src/domain/LevelResult.js'

function setup() {
  const backend = new MemoryStorage()
  const storage = new StorageService(backend)
  const manager = new SaveManager(storage, new SaveSigner(storage))
  return { backend, storage, manager }
}

const win = (levelId, score = 1000, stars = 2) =>
  LevelResult.issue({
    levelId, score, stars, won: true, targetsKilled: 2, blocksDestroyed: 5,
    barrelsExploded: 0, shotsUsed: 2, powersUsed: 0, difficulty: 'normal',
  })

test('création, enregistrement et rechargement d’un profil', async () => {
  const { manager } = setup()
  const slot = await manager.create(0, 'Aliénor', 'normal')
  assert.equal(slot.isUnlocked(2), false)
  slot.recordResult(win(1))
  assert.equal(slot.isUnlocked(2), true)
  await manager.save(slot)
  const loaded = await manager.load(0)
  assert.equal(loaded.name, 'Aliénor')
  assert.equal(loaded.totalScore, 1000)
  assert.equal(loaded.completedCount, 1)
})

test('une sauvegarde modifiée à la main est rejetée (signature)', async () => {
  const { manager, backend } = setup()
  const slot = await manager.create(1, 'Robin', 'easy')
  slot.recordResult(win(1))
  await manager.save(slot)
  const env = JSON.parse(backend.getItem('ctc:slot-1'))
  env.data = env.data.replace('"best":1000', '"best":99999')
  backend.setItem('ctc:slot-1', JSON.stringify(env))
  await assert.rejects(() => manager.load(1), /signature/)
  const [, summary] = await manager.summaries()
  assert.equal(summary.status, 'corrupted')
})

test('un résultat fabriqué hors du moteur de score est refusé', async () => {
  const { manager } = setup()
  const slot = await manager.create(0, 'Hacker', 'hard')
  const fake = Object.assign(Object.create(LevelResult.prototype), { levelId: 1, score: 99999, won: true })
  assert.throws(() => slot.recordResult(fake), /untrusted/)
})

test('impossible de valider un niveau verrouillé', async () => {
  const { manager } = setup()
  const slot = await manager.create(0, 'Pressé', 'normal')
  assert.throws(() => slot.recordResult(win(5)), /locked/)
})

test('le contrôle métier rejette un score impossible', async () => {
  const backend = new MemoryStorage()
  const storage = new StorageService(backend)
  const signer = new SaveSigner(storage)
  const strict = new SaveManager(storage, signer, (id, best) => {
    if (best > 5000) throw new Error('impossible score')
  })
  const slot = await strict.create(0, 'Test', 'normal')
  slot.recordResult(win(1, 9000, 3))
  await assert.rejects(() => strict.save(slot), /impossible/)
})

test('le nom de profil est filtré', async () => {
  const { manager } = setup()
  await assert.rejects(() => manager.create(0, '<script>', 'normal'))
  await assert.rejects(() => manager.create(0, 'x'.repeat(40), 'normal'))
})

test('StorageService fonctionne sans localStorage (repli mémoire)', () => {
  const s = new StorageService(null)
  assert.equal(s.persistent, false)
  assert.ok(s.write('a', 'b'))
  assert.equal(s.read('a'), 'b')
  assert.throws(() => s.read('../etc'), /invalid format/)
})
