import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Schema, ValidationError, deepFreeze } from '../src/core/utils/Guard.js'
import { InvalidInput, orElse } from '../src/core/utils/input.js'
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

test('Schema.string lit le texte à la porte : nettoyé, compté en caractères, refusé au-delà (v6.3.1)', () => {
  const v = Schema.string({ minLength: 1, maxLength: 5, pattern: /^[\p{L} ]+$/u })
  assert.equal(v('  Bo\u{200B}b  '), 'Bob', 'espace de largeur nulle retiré, bords coupés')
  assert.equal(v('e\u{301}te\u{301}'), 'été', 'accents composés (NFC)')
  assert.equal(v('A\u{202E}B'), 'AB', 'inversion bidirectionnelle retirée')
  assert.equal(v('\u{1D400}\u{1D401}\u{1D402}\u{1D403}\u{1D404}'), '\u{1D400}\u{1D401}\u{1D402}\u{1D403}\u{1D404}', 'cinq lettres hors du plan de base : cinq caractères')
  for (const bad of ['abcdef', '', '   ', 12, null, ['ab'], { toString: 'x' }, 'a1']) {
    assert.throws(() => v(bad), ValidationError, JSON.stringify(bad))
  }
  assert.throws(() => Schema.string({ minLength: 1 }), TypeError, 'pas de texte sans longueur maximale')
})

test('Schema.int ne lit qu’un entier sûr, jamais une chaîne qui l’écrit (v6.3.1)', () => {
  const v = Schema.int({ min: 0, max: 2 ** 60 })
  for (const bad of ['1', '1e1', 2 ** 53, 1e300, true, [1]]) assert.throws(() => v(bad), ValidationError, String(bad))
  assert.equal(Object.is(v(-0), -0), true, 'rendu tel quel : -0 reste -0 (relectures au bit près)')
  assert.equal(Object.is(Schema.number({ min: -1, max: 1 })(-0), -0), true)
})

test('Schema.object ne lit que les champs propres de l’objet (v6.3.1)', () => {
  const v = Schema.object({ toString: Schema.optional(Schema.boolean(), false) })
  assert.deepEqual(v({}), { toString: false }, 'le toString hérité d’Object.prototype n’est pas une valeur')
})

test('une ValidationError est un refus de la porte : orElse rend la valeur de repli (v6.3.1)', () => {
  const v = Schema.int({ min: 1, max: 3 })
  assert.ok(new ValidationError('x', 'y') instanceof InvalidInput)
  assert.equal(orElse(() => v(9), 1), 1)
  assert.equal(orElse(() => v(2), 1), 2)
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
