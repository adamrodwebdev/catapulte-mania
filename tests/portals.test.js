import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MemoryStorage } from './helpers.js'
import { AdPolicy } from '../src/services/ads/AdPolicy.js'
import { AdService, NoAdService } from '../src/services/ads/AdService.js'
import { RewardTicket } from '../src/services/ads/RewardTicket.js'
import { CloudStorageBackend } from '../src/services/CloudStorageBackend.js'
import { StorageService } from '../src/services/StorageService.js'
import { GameSession } from '../src/game/GameSession.js'
import { LevelRepository } from '../src/game/levels/LevelRepository.js'
import { SaveSlot } from '../src/domain/SaveSlot.js'
import { LevelResult } from '../src/domain/LevelResult.js'
import { maxGoldFor } from '../src/game/progression/GoldRules.js'
import { buildCsp } from '../build/csp.js'

/** Portail factice : la vidéo réussit ou échoue selon `ok`. */
class FakeAds extends AdService {
  ok = true
  shownInterstitials = 0
  get rewardedAvailable() {
    return true
  }
  async _showInterstitial(pause) {
    pause()
    this.shownInterstitials++
    return true
  }
  async _showRewarded(pause) {
    pause()
    return this.ok
  }
}

test('AdPolicy : délai de grâce puis 3 minutes entre deux interstitiels', () => {
  let now = 0
  const p = new AdPolicy({ minIntervalMs: 180_000, graceLevels: 2, now: () => now })
  p.levelDone()
  assert.equal(p.canInterstitial(), false, 'pas dès le premier niveau')
  p.levelDone()
  assert.equal(p.canInterstitial(), true)
  p.shown()
  now = 179_999
  assert.equal(p.canInterstitial(), false)
  now = 180_000
  assert.equal(p.canInterstitial(), true)
})

test('AdService : son coupé pendant la pub, ticket seulement si la vidéo est vue', async () => {
  const ads = new FakeAds(new AdPolicy({ graceLevels: 0, minIntervalMs: 1000 }))
  const events = []
  ads.on('pause', () => events.push('pause'))
  ads.on('resume', () => events.push('resume'))
  assert.equal(await ads.interstitial(), true)
  assert.equal(await ads.interstitial(), false, 'trop tôt pour une deuxième')
  assert.deepEqual(events, ['pause', 'resume'])
  const ticket = await ads.rewarded('extra-shot')
  assert.ok(ticket instanceof RewardTicket)
  ads.ok = false
  assert.equal(await ads.rewarded('extra-shot'), null)
  assert.equal(await new NoAdService().rewarded('extra-shot'), null, 'notre site : jamais de pub')
  assert.equal(await new NoAdService().interstitial(), false)
})

test('RewardTicket : usage unique, récompense prévue, contrefaçon refusée', () => {
  const t = RewardTicket.issue('double-gold')
  assert.equal(RewardTicket.redeem(t, 'extra-shot'), false)
  assert.equal(RewardTicket.redeem(t, 'double-gold'), true)
  assert.equal(RewardTicket.redeem(t, 'double-gold'), false)
  assert.equal(RewardTicket.redeem(new RewardTicket('double-gold'), 'double-gold'), false)
  assert.equal(RewardTicket.redeem({ purpose: 'double-gold' }, 'double-gold'), false)
  assert.throws(() => RewardTicket.issue('free-win'))
})

function playUntilAiming(s) {
  let n = 0
  while (s.state !== 'aiming' && s.state !== 'offer' && s.state !== 'ended' && n++ < 2000) s.update(1000 / 30)
}

test('dernier tir : défaite en suspens, un tir de plus contre un ticket valide', () => {
  const s = new GameSession(LevelRepository.get(1), { difficulty: 'hard', completedLevels: 0, reducedMotion: true, continueOffer: true })
  let end = null
  let offers = 0
  s.on('end', (e) => (end = e))
  s.on('offer', () => offers++)
  playUntilAiming(s)
  while (s.state === 'aiming') {
    s.aim(80, 0.05) // tirs volontairement ratés
    s.fire()
    s.update(1000 / 30)
    playUntilAiming(s)
  }
  assert.equal(s.state, 'offer')
  assert.equal(offers, 1)
  assert.equal(end, null, 'la défaite n’est pas encore prononcée')
  assert.equal(s.fire(), false, 'aucun tir sans vidéo')
  assert.equal(s.acceptOffer({ purpose: 'extra-shot' }), false, 'faux ticket refusé')
  assert.equal(s.acceptOffer(RewardTicket.issue('extra-shot')), true)
  assert.equal(s.state, 'aiming')
  assert.equal(s.shotsLeft, 1)
  s.aim(80, 0.05)
  s.fire()
  s.update(1000 / 30)
  playUntilAiming(s)
  assert.equal(s.state, 'ended', 'une seule offre par partie')
  assert.equal(offers, 1)
  assert.equal(end.won, false)
  assert.equal(end.result.shotsUsed, s.players[0].shotsTotal)
  s.destroy()
})

test('dernier tir refusé : défaite normale ; jamais proposé hors campagne solo', () => {
  const s = new GameSession(LevelRepository.get(1), { difficulty: 'hard', completedLevels: 0, reducedMotion: true, continueOffer: true })
  let end = null
  s.on('end', (e) => (end = e))
  playUntilAiming(s)
  while (s.state === 'aiming') {
    s.aim(80, 0.05)
    s.fire()
    s.update(1000 / 30)
    playUntilAiming(s)
  }
  s.declineOffer()
  assert.equal(end.won, false)
  assert.ok(LevelResult.isAuthentic(end.result))
  s.destroy()
  const off = new GameSession(LevelRepository.get(1), { difficulty: 'hard', completedLevels: 0, reducedMotion: true })
  assert.equal(off.continueOffer, false)
  off.destroy()
})

test('or doublé : une fois par victoire, avec ticket, sauvegarde toujours valide', () => {
  const slot = SaveSlot.create(0, 'Jeanne', 'normal')
  const result = LevelResult.issue({
    levelId: 1, score: 1000, stars: 3, won: true, targetsKilled: 2, blocksDestroyed: 5,
    barrelsExploded: 0, shotsUsed: 1, powersUsed: 0, difficulty: 'normal', achievements: 7,
  })
  const { gold } = slot.recordResult(result)
  assert.ok(gold > 0)
  assert.equal(slot.claimDoubleGold(result, { purpose: 'double-gold' }), 0, 'faux ticket')
  assert.equal(slot.claimDoubleGold(result, RewardTicket.issue('double-gold')), gold)
  assert.equal(slot.gold, gold * 2)
  assert.equal(slot.claimDoubleGold(result, RewardTicket.issue('double-gold')), 0, 'une seule fois')
  const reloaded = SaveSlot.fromJSON(0, slot.toJSON())
  assert.equal(reloaded.gold, gold * 2)
  // Or des vidéos gonflé à la main : refusé au chargement.
  const forged = { ...slot.toJSON(), bonusGold: maxGoldFor(slot.toJSON().levels) + 1 }
  assert.throws(() => SaveSlot.fromJSON(0, forged))
})

test('sauvegarde v5 migrée en v6 (or des vidéos à zéro)', () => {
  const v6 = SaveSlot.create(0, 'Robin', 'easy').toJSON()
  const { bonusGold, ...rest } = v6
  assert.equal(bonusGold, 0)
  const slot = SaveSlot.fromJSON(0, { ...rest, version: 5 })
  assert.equal(slot.toJSON().version, 6)
  assert.equal(slot.toJSON().bonusGold, 0)
})

test('sauvegarde synchronisée du portail : reprise des données locales une seule fois', () => {
  const local = new MemoryStorage()
  local.setItem('ctc:settings', '{"volume":0.3}')
  local.setItem('autre-site', 'x')
  const cloudMap = new Map()
  const cloud = { getItem: (k) => cloudMap.get(k) ?? null, setItem: (k, v) => cloudMap.set(k, v), removeItem: (k) => cloudMap.delete(k) }
  const storage = new StorageService(new CloudStorageBackend(cloud, local))
  assert.equal(storage.read('settings'), '{"volume":0.3}')
  assert.equal(cloudMap.has('autre-site'), false, 'seules nos clés sont recopiées')
  storage.write('settings', '{"volume":0.9}')
  local.setItem('ctc:settings', '{"volume":0.1}')
  new CloudStorageBackend(cloud, local) // second lancement : pas de nouvelle copie
  assert.equal(cloudMap.get('ctc:settings'), '{"volume":0.9}')
  assert.throws(() => new CloudStorageBackend({}))
})

test('CSP : stricte sur notre site, ouverte aux régies sur les portails', () => {
  const web = buildCsp()
  assert.match(web, /script-src 'self'(;|$)/)
  assert.match(web, /connect-src 'self';/)
  for (const target of ['crazygames', 'poki']) {
    const csp = buildCsp({ target })
    assert.match(csp, /object-src 'none'/)
    assert.doesNotMatch(csp, /unsafe-eval/)
    assert.match(csp, /frame-src https:/)
  }
  assert.throws(() => buildCsp({ target: 'evil' }))
})
