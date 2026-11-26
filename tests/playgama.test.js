import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildCsp, PORTAL_SDK_ORIGINS } from '../build/csp.js'
import { SDK_URLS } from '../src/services/ads/loadScript.js'
import { PlaygamaAdService, PLAYGAMA_KEYS } from '../src/services/ads/PlaygamaAdService.js'
import { AdPolicy } from '../src/services/ads/AdPolicy.js'
import { TARGETS } from '../src/config/gameConfig.js'
import { SettingsService } from '../src/services/SettingsService.js'
import { StorageService } from '../src/services/StorageService.js'
import { CloudStorageBackend } from '../src/services/CloudStorageBackend.js'
import { SaveManager } from '../src/services/SaveManager.js'
import { SaveSigner } from '../src/services/SaveSigner.js'
import { CastleDraftService } from '../src/services/CastleDraftService.js'
import { emptyDesign } from '../src/game/editor/CastleDesign.js'
import { MemoryStorage } from './helpers.js'

/* ---------- Playgama (Bridge SDK v2, v6.4) ---------- */

/**
 * Un faux Bridge : initialize, storage (asynchrone), platform (langue, son, pause,
 * messages), advertisement (états des publicités pilotés par le test).
 */
function fakeBridge({ language = 'id', audio = true, adBlock = false, stored = {} } = {}) {
  const listeners = new Map()
  const on = (name, fn) => listeners.set(name, [...(listeners.get(name) ?? []), fn])
  const fire = (name, value) => (listeners.get(name) ?? []).forEach((fn) => fn(value))
  const calls = []
  const db = new Map(Object.entries(stored))
  const bridge = {
    calls,
    db,
    fire,
    EVENT_NAME: {
      AUDIO_STATE_CHANGED: 'audio_state_changed',
      PAUSE_STATE_CHANGED: 'pause_state_changed',
      INTERSTITIAL_STATE_CHANGED: 'interstitial_state_changed',
      REWARDED_STATE_CHANGED: 'rewarded_state_changed',
    },
    initialize: async () => calls.push('initialize'),
    platform: {
      language,
      isAudioEnabled: audio,
      on,
      sendMessage: (m) => calls.push(`message:${m}`),
    },
    storage: {
      get: async (keys, parse) => {
        calls.push(`get:${keys.length}:${parse}`)
        return keys.map((k) => db.get(k) ?? null)
      },
      set: async (keys, values) => {
        calls.push(`set:${keys.join(',')}`)
        keys.forEach((k, i) => db.set(k, values[i]))
      },
      delete: async (keys) => {
        calls.push(`delete:${keys.join(',')}`)
        keys.forEach((k) => db.delete(k))
      },
    },
    advertisement: {
      interstitialState: 'closed',
      rewardedState: 'closed',
      isInterstitialSupported: true,
      isRewardedSupported: true,
      checkAdBlock: async () => adBlock,
      on,
      off: (name, fn) => listeners.set(name, (listeners.get(name) ?? []).filter((f) => f !== fn)),
      showInterstitial: (p) => calls.push(`interstitial:${p}`),
      showRewarded: (p) => calls.push(`rewarded:${p}`),
    },
  }
  return bridge
}

async function withBridge(bridge, fn) {
  globalThis.bridge = bridge
  try {
    await fn()
  } finally {
    delete globalThis.bridge
  }
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))

test('Playgama : cible connue, Bridge servi en HTTPS depuis le domaine autorisé par la CSP', () => {
  assert.ok(TARGETS.includes('playgama'))
  assert.ok(SDK_URLS.playgama.startsWith(`${PORTAL_SDK_ORIGINS.playgama}/`))
  assert.equal(SDK_URLS.playgama, 'https://bridge.playgama.com/v2/stable/playgama-bridge.js')
  const csp = buildCsp({ target: 'playgama' })
  assert.match(csp, /script-src 'self' https:\/\/bridge\.playgama\.com/)
  assert.doesNotMatch(csp, /unsafe-eval/)
})

test('Playgama : initialisation, langue de la plateforme, sauvegarde lue en un seul appel, jeu prêt une fois', async () => {
  const bridge = fakeBridge({ language: 'id', stored: { 'ctc:settings': '{"volume":0.5}' } })
  await withBridge(bridge, async () => {
    const s = new PlaygamaAdService()
    await s.init()
    assert.equal(bridge.calls[0], 'initialize')
    assert.equal(bridge.calls.filter((c) => c.startsWith('get:')).length, 1, 'une seule lecture')
    assert.equal(bridge.calls.find((c) => c.startsWith('get:')), `get:${PLAYGAMA_KEYS.length}:false`, 'toutes les clés, texte brut')
    assert.equal(s.locale, 'id')
    assert.equal(s.externalLinksAllowed, false)
    // Lectures servies depuis la mémoire ; écritures groupées en un appel.
    const cloud = s.cloudStorage
    assert.equal(cloud.getItem('ctc:settings'), '{"volume":0.5}')
    cloud.setItem('ctc:slot-0', 'A')
    cloud.setItem('ctc:last-slot', '0')
    assert.equal(cloud.getItem('ctc:slot-0'), 'A')
    await tick(350)
    assert.deepEqual(bridge.calls.filter((c) => c.startsWith('set:')), ['set:ctc:slot-0,ctc:last-slot'])
    cloud.removeItem('ctc:castle-draft')
    await tick(350)
    assert.ok(bridge.calls.includes('delete:ctc:castle-draft'))
    s.loadingFinished()
    s.loadingFinished()
    assert.equal(bridge.calls.filter((c) => c === 'message:game_ready').length, 1)
  })
})

test('Playgama : son coupé au départ et à chaque changement, pause imposée par la plateforme', async () => {
  const bridge = fakeBridge({ audio: false })
  await withBridge(bridge, async () => {
    const s = new PlaygamaAdService()
    await s.init()
    assert.equal(s.portalMuted, true, 'état de départ appliqué')
    const events = []
    s.on('mute', (m) => events.push(`mute:${m}`))
    s.on('pause', () => events.push('pause'))
    s.on('resume', () => events.push('resume'))
    s.on('pause', (source) => events.push(`source:${source}`))
    bridge.fire('audio_state_changed', true)
    bridge.fire('pause_state_changed', true)
    bridge.fire('pause_state_changed', true)
    bridge.fire('pause_state_changed', false)
    assert.deepEqual(events, ['mute:false', 'pause', 'source:platform', 'resume'], 'une seule pause, venue de la plateforme')
    assert.equal(s.platformPaused, false)
  })
})

test('Playgama : une publicité déjà à l’écran au démarrage tient le jeu en pause jusqu’à sa fermeture', async () => {
  const bridge = fakeBridge()
  bridge.advertisement.interstitialState = 'opened'
  await withBridge(bridge, async () => {
    const s = new PlaygamaAdService()
    await s.init()
    assert.equal(s.platformPaused, true, 'AppContext démarre avec le rideau')
    const events = []
    s.on('resume', (source) => events.push(`resume:${source}`))
    bridge.fire('interstitial_state_changed', 'closed')
    assert.equal(s.platformPaused, false)
    assert.deepEqual(events, ['resume:platform'])
  })
})

test('Publicités (v6.4) : le dernier tir contre une vidéo, une fois par niveau et par session', () => {
  const policy = new AdPolicy()
  assert.equal(policy.canOfferLastShot(12), true)
  policy.lastShotOffered(12)
  assert.equal(policy.canOfferLastShot(12), false, 'pas à chaque défaite')
  assert.equal(policy.canOfferLastShot('12'), false)
  assert.equal(policy.canOfferLastShot(13), true, 'un autre niveau peut l’avoir')
})

test('Playgama : premier interstitiel après deux niveaux, jamais après la première victoire', async () => {
  const bridge = fakeBridge()
  await withBridge(bridge, async () => {
    const s = new PlaygamaAdService()
    await s.init()
    assert.equal(s.policy.graceLevels, 2)
    assert.equal(await s.interstitial(), false, 'après le premier niveau : rien')
    assert.ok(!bridge.calls.some((c) => c.startsWith('interstitial:')))
  })
})

test('Playgama : étapes des niveaux (début, pause, reprise, réussi, raté)', async () => {
  const bridge = fakeBridge()
  await withBridge(bridge, async () => {
    const s = new PlaygamaAdService()
    await s.init()
    s.gameplayStart()
    s.gameplayStop()
    s.gameplayStart()
    s.levelEnded(true)
    s.gameplayStop()
    s.gameplayStart()
    s.levelEnded(false)
    assert.deepEqual(bridge.calls.filter((c) => c.startsWith('message:level')), ['message:level_started', 'message:level_paused', 'message:level_resumed', 'message:level_completed', 'message:level_started', 'message:level_failed'])
  })
})

test('Playgama : interstitiel entre deux niveaux, partie en pause pendant la publicité', async () => {
  const bridge = fakeBridge()
  await withBridge(bridge, async () => {
    const s = new PlaygamaAdService()
    s.policy = new AdPolicy({ graceLevels: 0, minIntervalMs: 0 })
    await s.init()
    const events = []
    s.on('pause', () => events.push('pause'))
    s.on('resume', () => events.push('resume'))
    const shown = s.interstitial()
    await tick()
    assert.ok(bridge.calls.includes('interstitial:level_end'))
    bridge.fire('interstitial_state_changed', 'opened')
    bridge.fire('interstitial_state_changed', 'closed')
    assert.equal(await shown, true)
    assert.deepEqual(events, ['pause', 'resume'])
  })
})

test('Playgama : vidéo récompensée — récompense seulement sur « rewarded », rien si elle est fermée avant', async () => {
  const bridge = fakeBridge()
  await withBridge(bridge, async () => {
    const s = new PlaygamaAdService()
    await s.init()
    assert.equal(s.rewardedAvailable, true)
    let p = s.rewarded('extra-shot')
    await tick()
    bridge.fire('rewarded_state_changed', 'opened')
    bridge.fire('rewarded_state_changed', 'rewarded')
    bridge.fire('rewarded_state_changed', 'closed')
    assert.ok(await p, 'vue en entier : ticket')
    p = s.rewarded('extra-shot')
    await tick()
    bridge.fire('rewarded_state_changed', 'opened')
    bridge.fire('rewarded_state_changed', 'closed')
    assert.equal(await p, null, 'fermée avant la fin : rien')
  })
})

test('Playgama : bloqueur de publicités — aucune vidéo proposée, aucun interstitiel demandé', async () => {
  const bridge = fakeBridge({ adBlock: true })
  await withBridge(bridge, async () => {
    const s = new PlaygamaAdService()
    s.policy = new AdPolicy({ graceLevels: 0, minIntervalMs: 0 })
    await s.init()
    assert.equal(s.rewardedAvailable, false)
    assert.equal(await s.interstitial(), false)
    assert.equal(await s.rewarded('hint'), null)
    assert.ok(!bridge.calls.some((c) => c.startsWith('interstitial:') || c.startsWith('rewarded:')))
  })
})

test('Playgama : une publicité qui ne s’ouvre jamais (Bridge resté « loading ») ne bloque pas le jeu', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const bridge = fakeBridge()
  await withBridge(bridge, async () => {
    const s = new PlaygamaAdService()
    s.policy = new AdPolicy({ graceLevels: 0, minIntervalMs: 0 })
    const init = s.init()
    t.mock.timers.tick(0)
    await init
    const p = s.interstitial()
    await Promise.resolve()
    t.mock.timers.tick(12_000)
    assert.equal(await p, false)
    // Une publicité déjà en cours côté Bridge : on n'en demande pas d'autre.
    bridge.advertisement.interstitialState = 'loading'
    const before = bridge.calls.length
    assert.equal(await s.interstitial(), false)
    assert.equal(bridge.calls.length, before)
  })
})

test('Playgama : sans Bridge (bloqué), le jeu démarre sans publicité ni sauvegarde de la plateforme', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const s = new PlaygamaAdService()
  // Pas de document : loadScript échoue tout de suite (le navigateur, lui, attendrait 8 s).
  await s.init().catch(() => {})
  assert.equal(s.cloudStorage, null)
  assert.equal(s.rewardedAvailable, false)
  s.loadingFinished()
})

/** Un stockage qui note chaque clé lue, écrite ou effacée. */
class RecordingStorage extends MemoryStorage {
  keys = new Set()
  getItem(k) {
    this.keys.add(k)
    return super.getItem(k)
  }
  setItem(k, v) {
    this.keys.add(k)
    super.setItem(k, v)
  }
  removeItem(k) {
    this.keys.add(k)
    super.removeItem(k)
  }
}

test('Playgama : la lecture groupée couvre toutes les clés de sauvegarde du jeu', async () => {
  // Les vrais services, montés comme dans AppContext, sur un stockage de portail qui note tout.
  const cloud = new RecordingStorage()
  const storage = new StorageService(new CloudStorageBackend(cloud, null))
  const settings = new SettingsService(storage)
  settings.set('volume', 0.4)
  settings.set('language', 'en')
  const saves = new SaveManager(storage, new SaveSigner(storage), () => true)
  const slot = await saves.create(0, 'Ada', 'normal')
  await saves.save(slot)
  saves.lastSlot = 0
  void saves.lastSlot
  await saves.summaries()
  saves.remove(2)
  const castles = new CastleDraftService(storage)
  castles.saveDraft(emptyDesign())
  castles.loadDraft()
  castles.rememberVerified('code')
  castles.verifiedCode()
  assert.ok(cloud.keys.size >= 8)
  for (const key of cloud.keys) assert.ok(PLAYGAMA_KEYS.includes(key), `clé « ${key} » absente de PLAYGAMA_KEYS`)
})

test('Réglages (v6.4) : la langue n’est enregistrée que si le joueur l’a choisie', () => {
  const backend = new MemoryStorage()
  const s = new SettingsService(new StorageService(backend))
  s.set('volume', 0.3)
  assert.equal(JSON.parse(backend.getItem('ctc:settings')).language, undefined, 'un autre réglage n’enregistre pas la langue')
  assert.equal(new SettingsService(new StorageService(backend)).hasStoredLanguage, false)
  s.set('language', 'en')
  assert.equal(JSON.parse(backend.getItem('ctc:settings')).language, 'en')
  const again = new SettingsService(new StorageService(backend))
  assert.equal(again.hasStoredLanguage, true)
  again.reset()
  assert.equal(again.get('language'), 'en', 'la remise à zéro garde la langue du joueur')
})
