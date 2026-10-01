import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DICTIONARIES } from '../src/i18n/index.js'
import { GAME } from '../src/config/gameConfig.js'

const PLURAL = new Set(['zero', 'one', 'two', 'few', 'many', 'other'])
const isPlural = (v) => v && typeof v === 'object' && Object.keys(v).every((k) => PLURAL.has(k)) && 'other' in v

function leaves(obj, prefix = '') {
  const out = []
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string' || isPlural(v)) out.push(key)
    else out.push(...leaves(v, key))
  }
  return out
}

const params = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
const lookup = (obj, key) => key.split('.').reduce((o, k) => o?.[k], obj)

test('chaque langue déclarée possède un dictionnaire', () => {
  assert.deepEqual(Object.keys(DICTIONARIES).sort(), [...GAME.LANGUAGES].sort())
})

for (const lang of GAME.LANGUAGES.filter((l) => l !== 'fr')) {
  test(`${lang} : mêmes clés et mêmes paramètres que le français`, () => {
    const ref = leaves(DICTIONARIES.fr)
    const other = leaves(DICTIONARIES[lang])
    assert.deepEqual(other.filter((k) => !ref.includes(k)), [], 'clés en trop')
    assert.deepEqual(ref.filter((k) => !other.includes(k)), [], 'clés manquantes')
    for (const key of ref) {
      const a = lookup(DICTIONARIES.fr, key)
      const b = lookup(DICTIONARIES[lang], key)
      const pa = params(isPlural(a) ? a.other : a)
      const pb = params(isPlural(b) ? b.other : b)
      assert.deepEqual(pb, pa, `paramètres différents pour ${key}`)
    }
  })
}

test('aucun texte ne contient de balise HTML', () => {
  for (const [lang, dict] of Object.entries(DICTIONARIES)) {
    for (const key of leaves(dict)) {
      const v = lookup(dict, key)
      const s = isPlural(v) ? Object.values(v).join(' ') : v
      assert.ok(!/<[a-z/]/i.test(s), `${lang}:${key}`)
    }
  }
})
