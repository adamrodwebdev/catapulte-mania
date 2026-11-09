/**
 * Ce que l'interface reçoit de l'extérieur, lu à la porte (règle du 9 novembre
 * 2026) : noms de touches, noms saisis, champs de l'atelier, curseurs, pièces
 * d'un château reçu par lien. Chaque test de régression a échoué avant son
 * correctif (v6.3.1).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InvalidInput } from '../src/core/utils/input.js'
import { ValidationError } from '../src/core/utils/Guard.js'
import { arrowFor, gameKeyFor, ammoSlotFor } from '../src/composables/useGameKeyboard.js'
import { readName } from '../src/domain/SaveSlot.js'
import { CastleCode, emptyDesign, readDesignField } from '../src/game/editor/CastleDesign.js'
import { readAimSlider, readPercentSlider } from '../src/app/fields.js'
import { WORLD } from '../src/game/physics/constants.js'

/* ---------- Noms de touches ---------- */

for (const code of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf', 'isPrototypeOf']) {
  test(`clavier : une touche nommée « ${code} » n’est ni une flèche, ni une commande, ni une munition (correctif v6.3.1)`, () => {
    assert.equal(arrowFor(code), null)
    assert.equal(gameKeyFor(code), null)
    assert.equal(ammoSlotFor(code), null)
  })
}

test('clavier : un nom de touche absent ou d’un autre type ne fait rien (correctif v6.3.1)', () => {
  for (const code of [undefined, null, 42, {}, { toString: () => 'Digit1' }, ['Space'], ['ArrowLeft']]) {
    assert.equal(arrowFor(code), null, String(code))
    assert.equal(gameKeyFor(code), null, String(code))
    assert.equal(ammoSlotFor(code), null, String(code))
  }
})

test('clavier : les touches du jeu, inchangées', () => {
  assert.equal(arrowFor('ArrowLeft'), 'left')
  assert.equal(arrowFor('ArrowDown'), 'down')
  assert.equal(gameKeyFor('Space').command, 'fire')
  assert.equal(gameKeyFor('KeyA').dir, -1)
  assert.equal(gameKeyFor('Escape'), null, 'Échap reste au navigateur (portails)')
  assert.equal(ammoSlotFor('Digit1'), 0)
  assert.equal(ammoSlotFor('Digit9'), 8)
  for (const code of ['Digit0', 'Numpad1', 'digit1', 'Digit10', ' Digit1']) assert.equal(ammoSlotFor(code), null, code)
})

/* ---------- Noms saisis (profil, joueurs, château) ---------- */

test('nom saisi : un accent décomposé (claviers vietnamiens, texte collé) est composé, plus refusé (correctif v6.3.1)', () => {
  assert.equal(readName('Ame\u{301}lie'), 'Am\u{E9}lie')
  assert.equal(readName('Tra\u{302}\u{300}n'), 'Tr\u{1EA7}n')
})

test('nom saisi : nettoyé avant d’être jugé (correctif v6.3.1)', () => {
  assert.equal(readName('  Jean   Pierre '), 'Jean Pierre')
  assert.equal(readName('Ysolde\u{200B}'), 'Ysolde')
  assert.equal(readName('Rob\u{202E}in'), 'Robin')
  assert.equal(readName('\u{1D400}'.repeat(16)), '\u{1D400}'.repeat(16), '16 lettres hors du plan de base : 16 caractères')
})

test('nom saisi : refusé au-delà de 16 caractères, hors de la règle, ou d’un autre type (correctif v6.3.1)', () => {
  for (const bad of ['x'.repeat(17), '<script>', '', '   ', 12, null, undefined, ['Bob'], { toString: () => 'Bob' }]) {
    assert.throws(() => readName(bad), InvalidInput, String(bad))
  }
  assert.equal(readName('', { required: false }), '', 'joueur sans nom : le nom par défaut')
  assert.equal(readName('   ', { required: false }), '')
})

/* ---------- Champs de l'atelier ---------- */

test('atelier : un nombre de munitions décimal ou écrit autrement est refusé, plus gardé tel quel (correctif v6.3.1)', () => {
  for (const bad of ['1.5', '2,5', '1e0', '0x2', '-1', '6', '', ' ', 'abc', '\u{661}', '+1', 3]) {
    assert.throws(() => readDesignField('ammo', bad), InvalidInput, String(bad))
  }
  assert.equal(readDesignField('ammo', '3'), 3)
  assert.equal(readDesignField('ammo', ' 5 '), 5)
  assert.equal(readDesignField('ammo', '0'), 0)
})

test('atelier : un château dont chaque champ est lu à la porte garde un code valide', () => {
  const design = { ...emptyDesign(), name: readDesignField('name', ' Fort  Ogre '), theme: readDesignField('theme', '7'), shots: readDesignField('shots', '12'), wind: readDesignField('wind', '13') }
  design.ammo = { ...design.ammo, fire: readDesignField('ammo', '5') }
  const back = CastleCode.decode(CastleCode.encode(design), { draft: true })
  assert.equal(back.name, 'Fort Ogre')
  assert.equal(back.theme, 7)
  assert.equal(back.shots, 12)
  assert.equal(back.wind, 0.65)
  assert.equal(back.ammo.fire, 5)
})

test('atelier : nom refusé au-delà de 16 caractères, jamais coupé (correctif v6.3.1)', () => {
  assert.throws(() => readDesignField('name', 'Château de l’Ogre Rouge'), InvalidInput)
  assert.throws(() => readDesignField('name', 'Fort #1'), InvalidInput)
  assert.equal(readDesignField('name', ''), '', 'un château sans nom')
})

test('atelier : décor, tirs et vent lus en entier, dans leurs bornes (correctif v6.3.1)', () => {
  assert.equal(readDesignField('theme', '10'), 10)
  assert.equal(readDesignField('shots', '1'), 1)
  assert.equal(readDesignField('wind', '20'), 1)
  assert.equal(readDesignField('wind', '0'), 0)
  for (const [field, bad] of [['theme', '1e1'], ['theme', '11'], ['theme', '0'], ['theme', '1.0'], ['shots', '13'], ['shots', '0x4'], ['wind', '21'], ['wind', '1.5'], ['wind', '']]) {
    assert.throws(() => readDesignField(field, bad), InvalidInput, `${field} ${bad}`)
  }
  assert.throws(() => readDesignField('constructor', '1'), TypeError, 'un champ inconnu est une erreur de programmation')
})

/* ---------- Curseurs ---------- */

test('curseur de volume : un pourcentage entier, lu en entier (correctif v6.3.1)', () => {
  assert.equal(readPercentSlider('35'), 0.35)
  assert.equal(readPercentSlider('0'), 0)
  assert.equal(readPercentSlider('100'), 1)
  for (const bad of ['1e2', '0x10', '', '101', '-5', '12.5', 'abc', null, 50]) assert.equal(readPercentSlider(bad), null, String(bad))
})

test('curseurs de visée : un nombre dans les bornes de l’engin, lu en entier (correctif v6.3.1)', () => {
  const angle = { min: 5, max: 85 }
  assert.equal(readAimSlider('45.5', angle), 45.5)
  assert.equal(readAimSlider('5', angle), 5)
  for (const bad of ['1e1', '0x10', '', '86', '4', 'abc', 45]) assert.equal(readAimSlider(bad, angle), null, String(bad))
})

/* ---------- Pièces d'un château reçu par lien ---------- */

/** Code d'un château fait à la main (comme un lien modifié). */
const castle = (parts) => Buffer.from(JSON.stringify({ v: 1, n: '', th: 1, s: 4, w: 6, a: [1, 0, 1, 0, 0, 0, 0, 0], p: parts })).toString('base64url')

for (const kind of ['constructor', 'toString', '__proto__', 'valueOf', 'hasOwnProperty']) {
  test(`atelier : une pièce nommée « ${kind} » dans un lien est refusée comme toute pièce inconnue (correctif v6.3.1)`, () => {
    assert.throws(() => CastleCode.decode(castle([[kind, 1500, WORLD.GROUND_Y]]), { draft: true }), ValidationError)
  })
}

test('atelier : une pièce dont le nom n’est pas un texte (["r"]) est refusée, plus prise pour un étage (correctif v6.3.1)', () => {
  assert.throws(() => CastleCode.decode(castle([[['r'], 1500, WORLD.GROUND_Y, 0]]), { draft: true }), ValidationError)
  assert.equal(CastleCode.decode(castle([['r', 1500, WORLD.GROUND_Y, 0]]), { draft: true }).parts[0].kind, 'room')
})
