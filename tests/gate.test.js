import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AccessGate, readConfig, gatePage, pickLang, safeEqual } from '../netlify/gate/AccessGate.js'

const KEYS = 'cle-poste-bureau-7f3a9c2e1b,cle-tablette-salon-4d8e6a0f5c'
const SECRET = 's'.repeat(40)

function memoryStore() {
  const data = new Map()
  return { data, get: async (k) => data.get(k) ?? null, set: async (k, v) => void data.set(k, v) }
}

test('verrou : configuration absente ou faible refusée (site fermé)', () => {
  assert.equal(readConfig({}), null)
  assert.equal(readConfig({ ACCESS_KEYS: KEYS, GATE_SECRET: 'court' }), null)
  assert.equal(readConfig({ ACCESS_KEYS: 'abc', GATE_SECRET: SECRET }), null, 'clé trop courte')
  assert.equal(readConfig({ ACCESS_KEYS: 'cle-poste-bureau-7f3a9c2e1b,cle-poste-bureau-7f3a9c2e1b', GATE_SECRET: SECRET }), null, 'doublon')
  assert.deepEqual(readConfig({ ACCESS_KEYS: KEYS, GATE_SECRET: SECRET }).keys.length, 2)
})

test('verrou : une clé = un appareil ; refusée sur un deuxième appareil', async () => {
  const store = memoryStore()
  const gate = new AccessGate(readConfig({ ACCESS_KEYS: KEYS, GATE_SECRET: SECRET }), store)
  assert.equal(await gate.allows(''), false)
  const a = await gate.claim('cle-poste-bureau-7f3a9c2e1b')
  assert.equal(a.status, 'granted')
  assert.ok(await gate.allows(a.cookie))
  // Un autre appareil (sans cookie, ou avec un cookie d'une autre clé) : refusé.
  assert.equal((await gate.claim('cle-poste-bureau-7f3a9c2e1b')).status, 'taken')
  // Le même appareil qui ressaisit sa clé garde l'accès.
  assert.equal((await gate.claim('cle-poste-bureau-7f3a9c2e1b', a.cookie)).status, 'granted')
  // Deuxième clé : deuxième appareil.
  const b = await gate.claim('cle-tablette-salon-4d8e6a0f5c')
  assert.equal(b.status, 'granted')
  assert.ok(await gate.allows(b.cookie))
  assert.equal((await gate.claim('cle-tablette-salon-4d8e6a0f5c', a.cookie)).status, 'taken')
  assert.equal((await gate.claim('cle-inconnue-0000000000000')).status, 'invalid')
  assert.equal((await gate.claim('<script>')).status, 'invalid')
  assert.equal((await gate.claim(42)).status, 'invalid')
  // La clé elle-même n'est jamais stockée.
  assert.ok([...store.data.keys(), ...store.data.values()].every((x) => !x.includes('cle-')))
})

test('verrou : cookies falsifiés, re-signés ou périmés refusés', async () => {
  const store = memoryStore()
  const config = readConfig({ ACCESS_KEYS: KEYS, GATE_SECRET: SECRET })
  const gate = new AccessGate(config, store)
  const { cookie } = await gate.claim('cle-poste-bureau-7f3a9c2e1b')
  const [kid, device, sig] = cookie.split('.')
  assert.equal(await gate.allows(`${kid}.${'0'.repeat(32)}.${sig}`), false, 'autre appareil')
  assert.equal(await gate.allows(`${kid}.${device}.${'0'.repeat(64)}`), false, 'signature fausse')
  assert.equal(await gate.allows(`${cookie}.x`), false)
  assert.equal(await gate.allows('x'.repeat(500)), false)
  // Signé avec un autre secret : refusé.
  const other = new AccessGate(readConfig({ ACCESS_KEYS: KEYS, GATE_SECRET: 't'.repeat(40) }), store)
  assert.equal(await other.allows(cookie), false)
  // Clé retirée de la configuration : l'appareil perd l'accès.
  const revoked = new AccessGate(readConfig({ ACCESS_KEYS: 'nouvelle-cle-bureau-9a8b7c6d5e,cle-tablette-salon-4d8e6a0f5c', GATE_SECRET: SECRET }), store)
  assert.equal(await revoked.allows(cookie), false)
  assert.equal((await revoked.claim('nouvelle-cle-bureau-9a8b7c6d5e')).status, 'granted', 'la nouvelle clé est libre')
})

test('verrou : page de saisie (langue, sans script, aucune donnée réinjectée)', () => {
  assert.equal(pickLang('id-ID,id;q=0.9'), 'id')
  assert.equal(pickLang('en-GB'), 'en')
  assert.equal(pickLang('de-DE'), 'fr')
  const html = gatePage('fr', 'taken')
  assert.match(html, /déjà utilisée/)
  assert.match(html, /noindex/)
  assert.doesNotMatch(html, /<script/)
  assert.doesNotMatch(gatePage('en', 'config'), /<form/)
  assert.ok(safeEqual('abc', 'abc') && !safeEqual('abc', 'abd') && !safeEqual('abc', 'ab'))
})
