import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCsp, PORTAL_SDK_ORIGINS } from '../build/csp.js'
import { SDK_URLS } from '../src/services/ads/loadScript.js'
import { GameDistributionAdService } from '../src/services/ads/GameDistributionAdService.js'
import { GamePixAdService } from '../src/services/ads/GamePixAdService.js'
import { Y8AdService } from '../src/services/ads/Y8AdService.js'
import { AdPolicy } from '../src/services/ads/AdPolicy.js'
import { TARGETS } from '../src/config/gameConfig.js'

test('portails v5.6 : cibles connues, SDK servis en HTTPS depuis le domaine autorisé par la CSP', () => {
  for (const t of ['gamedistribution', 'gamepix', 'y8', 'standalone']) assert.ok(TARGETS.includes(t))
  for (const t of ['gamedistribution', 'gamepix', 'y8']) {
    assert.ok(SDK_URLS[t].startsWith(`${PORTAL_SDK_ORIGINS[t]}/`), t)
    const csp = buildCsp({ target: t })
    assert.match(csp, new RegExp(`script-src 'self' ${PORTAL_SDK_ORIGINS[t].replace(/[.]/g, '\\.')}`))
    assert.match(csp, /object-src 'none'/)
    assert.doesNotMatch(csp, /unsafe-eval/)
  }
})

test('itch.io et Newgrounds (sans SDK) : la politique stricte de notre site, aucun script tiers', () => {
  assert.equal(buildCsp({ target: 'standalone' }), buildCsp())
  assert.match(buildCsp({ target: 'standalone' }), /script-src 'self';/)
})

test('GameDistribution et Y8 sans identifiant de jeu : aucun SDK chargé, aucune pub proposée', async () => {
  for (const Svc of [GameDistributionAdService, Y8AdService]) {
    const s = new Svc()
    await s.init()
    assert.equal(s.rewardedAvailable, false)
    assert.equal(await s.rewarded('extra-shot'), null)
  }
})

/** Installe un faux SDK GamePix global le temps d'un test. */
async function withGamePix(fake, fn) {
  globalThis.GamePix = fake
  try {
    await fn()
  } finally {
    delete globalThis.GamePix
  }
}

test('GamePix : loaded() avant toute pub, pause pendant la pub, ticket seulement si la vidéo est vue', async () => {
  const calls = []
  const store = new Map()
  const fake = {
    loading: (p) => calls.push(`loading:${p}`),
    loaded: () => calls.push('loaded'),
    interstitialAd: async () => calls.push('interstitial'),
    rewardAd: async () => ({ success: fake.ok }),
    happyMoment: () => calls.push('happy'),
    lang: () => 'ID',
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) },
    ok: true,
  }
  await withGamePix(fake, async () => {
    const s = new GamePixAdService()
    s.policy = new AdPolicy({ graceLevels: 0, minIntervalMs: 0 })
    await s.init()
    assert.equal(await s.interstitial(), false, 'pas de pub avant loaded()')
    s.loadingFinished()
    assert.deepEqual(calls.slice(0, 3), ['loading:50', 'loading:100', 'loaded'])
    const events = []
    s.on('pause', () => events.push('pause'))
    s.on('resume', () => events.push('resume'))
    assert.equal(await s.interstitial(), true)
    assert.deepEqual(events, ['pause', 'resume'])
    assert.ok(await s.rewarded('extra-shot'))
    fake.ok = false
    assert.equal(await s.rewarded('extra-shot'), null)
    assert.equal(s.locale, 'id')
    assert.ok(s.cloudStorage)
    s.happytime()
    assert.ok(calls.includes('happy'))
  })
})

test('GamePix (v5.6.1) : lang lu au démarrage, updateScore sans doublon, updateLevel, happyMoment', async () => {
  const calls = []
  const fake = {
    loading: () => {},
    loaded: () => calls.push('loaded'),
    lang: () => (calls.push('lang'), 'fr-FR'),
    updateScore: (n) => calls.push(`score:${n}`),
    updateLevel: (n) => calls.push(`level:${n}`),
    happyMoment: () => calls.push('happy'),
  }
  await withGamePix(fake, async () => {
    const s = new GamePixAdService()
    await s.init()
    assert.ok(calls.includes('lang'), 'lang appelé dès init')
    assert.equal(s.locale, 'fr')
    s.reportScore(10) // avant loaded() : ignoré
    s.loadingFinished()
    s.reportScore(10)
    s.reportScore(10)
    s.reportScore(25)
    s.reportScore(-3)
    s.reportScore('99')
    s.reportLevel(4)
    s.reportLevel(0)
    s.happytime()
    assert.deepEqual(calls.slice(1), ['loaded', 'score:0', 'score:10', 'score:25', 'level:4', 'happy'])
    assert.equal(s.policy.graceLevels, 0, 'GamePix décide lui-même de la fréquence')
    assert.equal(s.policy.minIntervalMs, 0)
  })
})

test('GamePix (v5.6.2) : loaded() asynchrone, aucune pub avant sa fin, interstitialAd à chaque fin de niveau', async () => {
  const calls = []
  let finish
  const fake = {
    loading: () => {},
    loaded: () => new Promise((ok) => (finish = ok)),
    lang: () => 'en',
    updateScore: () => {},
    interstitialAd: async () => (calls.push('inter'), { success: true }),
  }
  await withGamePix(fake, async () => {
    const s = new GamePixAdService()
    await s.init()
    s.loadingFinished()
    assert.equal(s.ready, false)
    assert.equal(await s.interstitial(), false, 'loaded() pas encore terminé')
    finish()
    await new Promise((r) => setTimeout(r, 0))
    assert.equal(s.ready, true)
    assert.equal(await s.interstitial(), true)
    assert.equal(await s.interstitial(), true)
    assert.deepEqual(calls, ['inter', 'inter'])
  })
})
