/**
 * Données lues à la porte (règle du 9 novembre 2026) : stockage, sauvegardes,
 * réglages, langue du navigateur et du portail. Chaque test de régression a
 * échoué avant son correctif (v6.3.1).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MemoryStorage } from './helpers.js'
import { StorageService } from '../src/services/StorageService.js'
import { SaveSigner } from '../src/services/SaveSigner.js'
import { SaveManager } from '../src/services/SaveManager.js'
import { SettingsService } from '../src/services/SettingsService.js'
import { I18nService } from '../src/services/I18nService.js'
import { ValidationError } from '../src/core/utils/Guard.js'
import { SAVE_LIMITS } from '../src/config/limits.js'
import { NoAdService } from '../src/services/ads/AdService.js'
import { readInviteLink, readInviteParam, readLanguageTag } from '../src/services/outsideValues.js'
import { createAppContext } from '../src/app/AppContext.js'

function setup(backend = new MemoryStorage()) {
  const storage = new StorageService(backend)
  return { backend, storage, manager: new SaveManager(storage, new SaveSigner(storage)) }
}

/* ---------- Une sauvegarde illisible n'est pas un emplacement vide ---------- */

for (const [name, value] of [
  ['coupée (pas du JSON)', '{"data":"{\\"version\\":11,'],
  ['plus longue que la limite', `{"data":"${'x'.repeat(SAVE_LIMITS.entry)}"}`],
]) {
  test(`un profil illisible (${name}) est signalé altéré, jamais vide (correctif v6.3.1)`, async () => {
    const { manager, backend } = setup()
    backend.setItem('ctc:slot-0', value)
    const [first] = await manager.summaries()
    assert.equal(first.status, 'corrupted', 'vide, le démarrage rapide des portails l’écraserait')
    await assert.rejects(() => manager.load(0), ValidationError)
  })
}

test('un profil que le stockage du portail rend sous une autre forme qu’un texte est altéré, pas vide (correctif v6.3.1)', async () => {
  const backend = new MemoryStorage()
  const portal = { getItem: (k) => (k === 'ctc:slot-1' ? 12345 : backend.getItem(k)), setItem: (k, v) => backend.setItem(k, v), removeItem: (k) => backend.removeItem(k) }
  const { manager } = setup(portal)
  const summaries = await manager.summaries()
  assert.deepEqual(summaries.map((s) => s.status), ['empty', 'corrupted', 'empty'])
})

test('un profil dont la lecture échoue est altéré, pas vide (correctif v6.3.1)', async () => {
  const backend = new MemoryStorage()
  const failing = { getItem: (k) => { if (k === 'ctc:slot-2') throw new Error('io'); return backend.getItem(k) }, setItem: (k, v) => backend.setItem(k, v), removeItem: (k) => backend.removeItem(k) }
  const { manager } = setup(failing)
  const summaries = await manager.summaries()
  assert.deepEqual(summaries.map((s) => s.status), ['empty', 'empty', 'corrupted'])
})

test('StorageService distingue une entrée absente, présente et illisible (v6.3.1)', () => {
  const backend = new MemoryStorage()
  const storage = new StorageService(backend)
  backend.setItem('ctc:a', 'x')
  backend.setItem('ctc:long', 'x'.repeat(SAVE_LIMITS.entry + 1))
  assert.deepEqual(storage.readEntry('a'), { status: 'present', text: 'x' })
  assert.deepEqual(storage.readEntry('nothing'), { status: 'empty' })
  assert.deepEqual(storage.readEntry('long'), { status: 'unreadable', reason: 'too-long' })
  assert.equal(storage.read('long'), null, 'read garde sa réponse : null pour qui veut une valeur ou rien')
})

/* ---------- Le démarrage rapide des portails et les invitations ---------- */

/** Portail factice : son stockage synchronisé, sa langue, ses paramètres d'invitation. */
function portal({ cloud = new MemoryStorage(), locale = null, invites = {} } = {}) {
  return new (class extends NoAdService {
    get cloudStorage() {
      return cloud
    }
    get locale() {
      return locale
    }
    inviteParam(key) {
      return Object.hasOwn(invites, key) ? invites[key] : null
    }
  })()
}

test('démarrage rapide des portails : un profil illisible n’est jamais écrasé par le profil créé d’office (correctif v6.3.1)', async () => {
  const cloud = new MemoryStorage()
  const cut = '{"data":"{\\"version\\":11,"name":"Ysolde'
  cloud.setItem('ctc:slot-0', cut)
  const app = await createAppContext({ ads: portal({ cloud }) })
  assert.equal(await app.quickStart(), false, 'un emplacement altéré n’est pas libre')
  assert.equal(cloud.getItem('ctc:slot-0'), cut)
  assert.equal(app.state.slots[0].status, 'corrupted')
})

test('démarrage rapide des portails : sans aucun profil, le premier est créé (inchangé)', async () => {
  const cloud = new MemoryStorage()
  const app = await createAppContext({ ads: portal({ cloud }) })
  assert.equal(await app.quickStart(), true)
  assert.equal(app.state.slots[0].status, 'ok')
})

test('une langue du portail d’un autre type n’empêche plus le jeu de démarrer (correctif v6.3.1)', async () => {
  const app = await createAppContext({ ads: portal({ locale: { toString: 'x' } }) })
  assert.ok(['fr', 'en', 'id'].includes(app.state.locale))
})

for (const [name, value] of [
  ['trop long', 'A'.repeat(7000)],
  ['hors de l’alphabet des codes', 'abc<svg onload=alert(1)>'],
  ['d’un autre type', { toString: () => 'abc' }],
]) {
  test(`une invitation « Bats mon tir » illisible (${name}) est signalée à l’accueil`, async () => {
    const app = await createAppContext({ ads: portal({ invites: { defi: value } }) })
    assert.equal(app.state.badChallenge, true)
    assert.equal(app.state.incomingChallenge, null)
  })
}

test('lecteurs des valeurs du portail : langue, lien et code d’invitation', () => {
  for (const bad of [{ toString: 'x' }, 42, null, ['en'], '', 'e', 'english-but-far-too-long-for-a-tag-x', 'constructor-', 'en US', 'en-\u{200B}']) {
    assert.equal(readLanguageTag(bad), null, JSON.stringify(bad))
  }
  assert.equal(readLanguageTag(' pt-BR '), 'pt-BR')
  assert.equal(readLanguageTag('zh_Hant_TW'), 'zh_Hant_TW')
  for (const bad of ['http://portal.example/x', ['javascript', 'alert(1)'].join(':'), 'https://', `https://a.b/${'x'.repeat(3000)}`, 'https://a b', 12]) {
    assert.equal(readInviteLink(bad), null, String(bad))
  }
  assert.equal(readInviteLink('https://www.crazygames.com/game/catapulte?defi=abc'), 'https://www.crazygames.com/game/catapulte?defi=abc')
  for (const bad of ['', 'a b', 'a+b', 'a/b', 'a='.repeat(2), 'x'.repeat(6001), 3]) assert.equal(readInviteParam(bad), null, String(bad))
  assert.equal(readInviteParam('2026-W45'), '2026-W45')
  assert.equal(readInviteParam('eyJ2IjoxfQ'), 'eyJ2IjoxfQ')
})

/* ---------- Dernier profil ouvert ---------- */

for (const stored of ['', '1e0', '0x1', '2.0', '+1', '1 0', '3', '-1', 'NaN']) {
  test(`dernier profil ouvert : « ${stored} » ne désigne aucun emplacement (correctif v6.3.1)`, () => {
    const { manager, backend } = setup()
    backend.setItem('ctc:last-slot', stored)
    assert.equal(manager.lastSlot, null)
  })
}

test('dernier profil ouvert : un numéro d’emplacement écrit par le jeu se relit', () => {
  const { manager } = setup()
  manager.lastSlot = 2
  assert.equal(manager.lastSlot, 2)
})

/* ---------- Sel de l'appareil ---------- */

test('un sel que le stockage n’a pas pu lire n’est jamais remplacé (correctif v6.3.1)', async () => {
  const writes = []
  const backend = {
    getItem(k) {
      if (k === 'ctc:device-salt') throw new Error('io')
      return null
    },
    setItem: (k) => writes.push(k),
    removeItem() {},
  }
  const signer = new SaveSigner(new StorageService(backend))
  const sig = await signer.sign('{"a":1}')
  assert.match(sig, /^(?:h1|f1)\./, 'la partie continue, signée pour la session')
  assert.deepEqual(writes, [], 'le sel d’origine reste en place : les profils redeviennent lisibles')
})

test('un sel absent ou mal formé est tiré puis écrit (nouvel appareil)', async () => {
  for (const stored of [null, 'abc']) {
    const backend = new MemoryStorage()
    if (stored !== null) backend.setItem('ctc:device-salt', stored)
    await new SaveSigner(new StorageService(backend)).sign('x')
    assert.match(backend.getItem('ctc:device-salt'), /^[A-Za-z0-9_-]{22}$/)
  }
})

/* ---------- Réglages ---------- */

for (const language of ['ru', 'constructor', 'FR', 42, ['fr'], null]) {
  test(`réglages : la langue ${JSON.stringify(language)} n’est pas un choix du joueur (correctif v6.3.1)`, () => {
    const backend = new MemoryStorage()
    backend.setItem('ctc:settings', JSON.stringify({ language }))
    const settings = new SettingsService(new StorageService(backend))
    assert.equal(settings.hasStoredLanguage, false, 'la langue du portail ou du navigateur doit être cherchée')
    assert.equal(settings.get('language'), 'fr')
  })
}

test('réglages : une langue choisie par le joueur se relit', () => {
  const backend = new MemoryStorage()
  new SettingsService(new StorageService(backend)).set('language', 'id')
  const settings = new SettingsService(new StorageService(backend))
  assert.equal(settings.hasStoredLanguage, true)
  assert.equal(settings.get('language'), 'id')
})

/* ---------- Langue du navigateur et du portail ---------- */

test('détection de la langue : une valeur hostile du portail ou du navigateur est ignorée (correctif v6.3.1)', () => {
  const available = ['fr', 'en', 'id']
  const hostile = [{ toString: 'x' }, { toString: () => 'fr' }, 42, null, ['fr'], 'constructor', `fr${'-abcdefgh'.repeat(10)}`, 'f r', '']
  assert.equal(I18nService.detect('', hostile, available, 'en'), 'en')
  assert.equal(I18nService.detect('', [...hostile, 'id-ID'], available, 'en'), 'id', 'la première langue lisible l’emporte')
  assert.equal(I18nService.detect('', ['f\u{202E}r'], available, 'en'), 'fr', 'nettoyée d’abord : une inversion bidirectionnelle ne compte pas')
  assert.equal(I18nService.detect('', Array.from({ length: 40 }, (_, i) => (i === 30 ? 'id' : 'de')), available, 'en'), 'en', 'au plus 20 langues essayées')
  assert.equal(I18nService.detect('', ['ms-MY'], available, 'en'), 'id', 'malais : indonésien')
  assert.equal(I18nService.detect('?lang=constructor', ['fr'], available, 'en'), 'fr')
  assert.equal(I18nService.detect('?lang=en', ['fr'], available, 'fr'), 'en')
})
