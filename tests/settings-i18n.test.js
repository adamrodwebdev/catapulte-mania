import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MemoryStorage } from './helpers.js'
import { StorageService } from '../src/services/StorageService.js'
import { SettingsService } from '../src/services/SettingsService.js'
import { I18nService } from '../src/services/I18nService.js'

test('les réglages invalides retombent sur leur valeur par défaut', () => {
  const backend = new MemoryStorage()
  backend.setItem('ctc:settings', JSON.stringify({ language: 'xx', volume: 5, theme: 'dark' }))
  const s = new SettingsService(new StorageService(backend))
  assert.equal(s.get('language'), 'fr')
  assert.equal(s.get('volume'), 0.7)
  assert.equal(s.get('theme'), 'dark')
  assert.throws(() => s.set('volume', 'fort'))
  assert.throws(() => s.set('isAdmin', true), /Unknown setting/)
})

test('les changements de réglages sont persistés et notifiés', () => {
  const backend = new MemoryStorage()
  const s = new SettingsService(new StorageService(backend))
  let seen = null
  s.on('change', (e) => (seen = e))
  s.set('trajectoryAid', true)
  assert.deepEqual(seen, { key: 'trajectoryAid', value: true })
  assert.equal(new SettingsService(new StorageService(backend)).get('trajectoryAid'), true)
})

test('I18nService : traduction, paramètres, pluriels et repli', () => {
  const i18n = new I18nService(
    {
      fr: { a: { b: 'Bonjour {name}' }, shots: { one: '{count} tir', other: '{count} tirs' } },
      en: { a: { b: 'Hello {name}' }, only: 'English only', shots: { one: '{count} shot', other: '{count} shots' } },
    },
    'fr',
  )
  assert.equal(i18n.t('a.b', { name: 'Jeanne' }), 'Bonjour Jeanne')
  assert.equal(i18n.t('shots', { count: 1 }), '1 tir')
  assert.equal(i18n.t('shots', { count: 3 }), '3 tirs')
  assert.equal(i18n.t('only'), 'English only')
  assert.equal(i18n.t('missing.key'), 'missing.key')
  i18n.setLocale('en')
  assert.equal(i18n.t('shots', { count: 2 }), '2 shots')
  assert.throws(() => i18n.setLocale('de'))
})

test('détection de la langue : URL puis navigateur', () => {
  const av = ['fr', 'en', 'id']
  assert.equal(I18nService.detect('?lang=id', ['fr-FR'], av, 'fr'), 'id')
  assert.equal(I18nService.detect('?lang=zz', ['en-US'], av, 'fr'), 'en')
  assert.equal(I18nService.detect('', ['ms-MY'], av, 'fr'), 'id')
  assert.equal(I18nService.detect('', ['de-DE'], av, 'fr'), 'fr')
})
