import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Schema, ValidationError, deepFreeze } from '../src/core/utils/Guard.js'
import { SeededRandom } from '../src/core/utils/SeededRandom.js'

test('Schema.int refuse les non-entiers et les valeurs hors plage', () => {
  const v = Schema.int({ min: 0, max: 3 })
  assert.equal(v(2), 2)
  for (const bad of [1.5, '2', NaN, Infinity, -1, 4, null, undefined]) {
    assert.throws(() => v(bad), ValidationError)
  }
})

test('Schema.object refuse les clés inconnues (injection de champs)', () => {
  const v = Schema.object({ a: Schema.boolean() })
  assert.deepEqual(v({ a: true }), { a: true })
  assert.throws(() => v({ a: true, admin: true }), /unexpected key/)
  assert.throws(() => v([]), ValidationError)
})

test('Schema.record bloque la pollution de prototype', () => {
  const v = Schema.record(/^.+$/, Schema.int())
  const evil = JSON.parse('{"__proto__": 1}')
  assert.throws(() => v(evil), /invalid key/)
})

test('deepFreeze rend un objet imbriqué non modifiable', () => {
  const o = deepFreeze({ a: { b: 1 } })
  assert.throws(() => {
    'use strict'
    o.a.b = 2
  }, TypeError)
})

test('SeededRandom est déterministe', () => {
  const a = new SeededRandom(42)
  const b = new SeededRandom(42)
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next())
  const r = new SeededRandom(7)
  for (let i = 0; i < 1000; i++) {
    const x = r.int(2, 5)
    assert.ok(x >= 2 && x <= 5)
  }
})
