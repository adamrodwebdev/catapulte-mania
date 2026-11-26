/**
 * @file Hostile inputs for each reader at the door (src/core/utils/input.js): the 113 tests of the
 * shared readers (`.helpers/input-validation/input.test.ts`), table by table, on node:test.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  InputRecord,
  InvalidInput,
  orElse,
  parseNumber,
  readBoolean,
  readChoice,
  readNumber,
  readText,
} from '../src/core/utils/input.js';

const LEVEL = Object.freeze({ min: 1, max: 60, integer: true });
const VOLUME = Object.freeze({ min: 0, max: 1 });
const NAME = Object.freeze({ maxLength: 12, required: true });
/** The longest save text read back from storage, in UTF-16 units. */
const SAVE_SIZE = 10_000;

/** The reason a read refused its value, or 'accepted'. */
function problem(read) {
  try {
    read();
    return 'accepted';
  } catch (error) {
    return error instanceof InvalidInput ? error.problem : `threw ${String(error)}`;
  }
}

/** One test per row of a table, named from the row (as `test.each` does). */
function each(rows, name, fn) {
  for (const row of rows) test(name(row), () => fn(row));
}

describe('readNumber: a value that must already be a number', () => {
  each(
    [
      { name: 'a numeric string', value: '12' },
      { name: 'an empty string', value: '' },
      { name: 'null', value: null },
      { name: 'undefined', value: undefined },
      { name: 'true', value: true },
      { name: 'an empty array', value: [] },
      { name: 'an array of one number', value: [12] },
      { name: 'an object', value: {} },
      { name: 'NaN', value: Number.NaN },
      { name: 'Infinity', value: Number.POSITIVE_INFINITY },
      { name: 'minus Infinity', value: Number.NEGATIVE_INFINITY },
    ],
    (row) => `refuses ${row.name}`,
    ({ value }) => assert.equal(problem(() => readNumber(value, LEVEL, 'level')), 'not-a-number'),
  );

  each(
    [
      { value: 12.5, expected: 'not-an-integer' },
      { value: 2 ** 53, expected: 'not-an-integer' },
      { value: 0, expected: 'out-of-range' },
      { value: 61, expected: 'out-of-range' },
      { value: -1, expected: 'out-of-range' },
    ],
    (row) => `refuses ${row.value} as a level (${row.expected})`,
    ({ value, expected }) => assert.equal(problem(() => readNumber(value, LEVEL, 'level')), expected),
  );

  each(
    [1, 30, 60],
    (value) => `accepts the level ${value}`,
    (value) => assert.equal(readNumber(value, LEVEL, 'level'), value),
  );

  test('accepts a decimal within its range', () => {
    assert.equal(readNumber(0.25, VOLUME, 'volume'), 0.25);
  });

  test('reads minus zero as zero', () => {
    assert.equal(Object.is(readNumber(-0, VOLUME, 'volume'), 0), true);
  });
});

describe('parseNumber: text that must spell a number', () => {
  each(
    [
      { name: 'trailing letters', text: '12abc' },
      { name: 'letters only', text: 'abc' },
      { name: 'an empty text', text: '' },
      { name: 'spaces only', text: '   ' },
      { name: 'an exponent', text: '1e3' },
      { name: 'hexadecimal', text: '0x10' },
      { name: 'binary', text: '0b1' },
      { name: 'octal', text: '0o7' },
      { name: 'the word Infinity', text: 'Infinity' },
      { name: 'the word NaN', text: 'NaN' },
      { name: 'a plus sign', text: '+12' },
      { name: 'a double minus', text: '--1' },
      { name: 'a decimal in an integer field', text: '1.5' },
      { name: 'a trailing point', text: '1.' },
      { name: 'a leading point', text: '.5' },
      { name: 'a grouping space', text: '1 000' },
      { name: 'a grouping underscore', text: '1_000' },
      { name: 'a decimal comma', text: '1,5' },
      { name: 'full-width digits', text: '\uFF11\uFF12' },
      { name: 'Arabic-Indic digits', text: '\u0661\u0662' },
      { name: 'a hidden control character', text: '12\u0000' },
      { name: 'sixteen digits', text: '1234567890123456' },
    ],
    (row) => `refuses ${row.name}`,
    ({ text }) => assert.equal(problem(() => parseNumber(text, LEVEL, 'level')), 'not-a-number'),
  );

  each(
    [
      { name: 'a number', value: 12 },
      { name: 'null', value: null },
      { name: 'an array', value: ['12'] },
    ],
    (row) => `refuses ${row.name} as text`,
    ({ value }) => assert.equal(problem(() => parseNumber(value, LEVEL, 'level')), 'not-text'),
  );

  each(
    [
      { text: ' 12 ', expected: 12 },
      { text: '007', expected: 7 },
      { text: '60', expected: 60 },
    ],
    (row) => `reads "${row.text}" as ${row.expected}`,
    ({ text, expected }) => assert.equal(parseNumber(text, LEVEL, 'level'), expected),
  );

  test('reads a decimal where the field allows one', () => {
    assert.equal(parseNumber('0.25', VOLUME, 'volume'), 0.25);
  });

  test('still checks the range once the text is a number', () => {
    assert.equal(problem(() => parseNumber('61', LEVEL, 'level')), 'out-of-range');
  });
});

describe('readText: a value that must be text', () => {
  each(
    [
      { name: 'a number', value: 12 },
      { name: 'null', value: null },
      { name: 'undefined', value: undefined },
      { name: 'true', value: true },
      { name: 'an array of text', value: ['Ana'] },
      { name: 'an object that turns into text', value: { toString: () => 'Ana' } },
    ],
    (row) => `refuses ${row.name}`,
    ({ value }) => assert.equal(problem(() => readText(value, NAME, 'name')), 'not-text'),
  );

  each(
    [
      { name: 'a control character', text: 'A\u0000na', expected: 'Ana' },
      { name: 'a right-to-left override', text: 'A\u202Ena', expected: 'Ana' },
      { name: 'a bidirectional isolate', text: 'A\u2066na\u2069', expected: 'Ana' },
      { name: 'a byte-order mark', text: '\uFEFFAna', expected: 'Ana' },
      { name: 'a zero-width space', text: 'A\u200Bna', expected: 'Ana' },
      { name: 'a lone surrogate', text: 'A\uD800na', expected: 'Ana' },
      { name: 'a tag character', text: 'A\u{E0041}na', expected: 'Ana' },
      { name: 'outer and repeated spaces', text: '  Ana   Lima ', expected: 'Ana Lima' },
      { name: 'a line break in a one-line field', text: 'Ana\r\nLima', expected: 'Ana Lima' },
      { name: 'a decomposed accent', text: 'Le\u0301a', expected: 'L\u00E9a' },
      { name: 'an invisible character inside an accent', text: 'Le\u200B\u0301a', expected: 'L\u00E9a' },
    ],
    (row) => `removes ${row.name}`,
    ({ text, expected }) => assert.equal(readText(text, NAME, 'name'), expected),
  );

  test('keeps emoji joined by zero-width joiners', () => {
    assert.equal(readText('\u{1F468}\u200D\u{1F469}\u200D\u{1F467} team', NAME, 'name'), '\u{1F468}\u200D\u{1F469}\u200D\u{1F467} team');
  });

  test('keeps markup as written: it is escaped where it is shown', () => {
    assert.equal(readText('<b>Ana</b>', NAME, 'name'), '<b>Ana</b>');
  });

  test('keeps line breaks and tabs in a multi-line field, unified to line feeds', () => {
    const message = { maxLength: 100, multiline: true };
    assert.equal(readText('One\r\nTwo\rThree\n\tFour', message, 'message'), 'One\nTwo\nThree\n\tFour');
  });

  each(
    [
      { name: 'empty', text: '' },
      { name: 'blank', text: '   ' },
      { name: 'only invisible characters', text: '\u200B\u202E\uFEFF' },
    ],
    (row) => `refuses a required text that is ${row.name}`,
    ({ text }) => assert.equal(problem(() => readText(text, NAME, 'name')), 'empty'),
  );

  test('accepts an empty text when the field is optional', () => {
    assert.equal(readText('  ', { maxLength: 12 }, 'nickname'), '');
  });

  test('counts characters, not UTF-16 units', () => {
    assert.equal(readText('\u{1F600}'.repeat(12), NAME, 'name'), '\u{1F600}'.repeat(12));
    assert.equal(problem(() => readText('\u{1F600}'.repeat(13), NAME, 'name')), 'too-long');
  });

  test('measures the length once cleaned', () => {
    assert.equal(readText(`  ${'a'.repeat(12)}  `, NAME, 'name'), 'a'.repeat(12));
    assert.equal(problem(() => readText('a'.repeat(13), NAME, 'name')), 'too-long');
  });

  test('checks an allow-list against the whole cleaned text', () => {
    const slug = { maxLength: 20, pattern: /^[a-z0-9-]+$/ };
    assert.equal(readText(' game-on ', slug, 'slug'), 'game-on');
    assert.equal(problem(() => readText('game on!', slug, 'slug')), 'bad-format');
  });

  each(
    [
      { name: 'a global pattern', pattern: /^[a-z]+$/g },
      { name: 'a sticky pattern', pattern: /^[a-z]+$/y },
      { name: 'an unanchored pattern', pattern: /[a-z]+/ },
    ],
    (row) => `rejects ${row.name} as a programming error`,
    ({ pattern }) => assert.throws(() => readText('abc', { maxLength: 9, pattern }, 'slug'), TypeError),
  );

  each(
    ['A\u0000na  Lima\r\n', 'Le\u200B\u0301a', '\uFEFF  \u202E x \u2069 ', 'e\u0301\u0301'],
    (text) => `cleans ${JSON.stringify(text)} to a text that stays the same when cleaned again`,
    (text) => {
      const once = readText(text, NAME, 'name');
      assert.equal(readText(once, NAME, 'name'), once);
    },
  );
});

describe('readChoice and readBoolean', () => {
  const THEMES = ['light', 'dark'];

  test('accepts one of the choices', () => {
    assert.equal(readChoice('dark', THEMES, 'theme'), 'dark');
  });

  each(
    [
      { name: 'another case', value: 'DARK' },
      { name: 'a prototype key', value: '__proto__' },
      { name: 'an inherited method name', value: 'toString' },
      { name: 'a number', value: 1 },
      { name: 'null', value: null },
    ],
    (row) => `refuses ${row.name}`,
    ({ value }) => assert.equal(problem(() => readChoice(value, THEMES, 'theme')), 'not-a-choice'),
  );

  each(
    [
      { name: 'the text true', value: 'true' },
      { name: 'the number 1', value: 1 },
      { name: 'null', value: null },
    ],
    (row) => `refuses ${row.name} as a boolean`,
    ({ value }) => assert.equal(problem(() => readBoolean(value, 'muted')), 'not-a-boolean'),
  );

  test('accepts a real boolean', () => {
    assert.equal(readBoolean(false, 'muted'), false);
  });
});

describe('InputRecord: an object from outside, read field by field', () => {
  each(
    [
      { name: 'null', value: null },
      { name: 'an array', value: [] },
      { name: 'a text', value: '{}' },
      { name: 'a number', value: 3 },
    ],
    (row) => `refuses ${row.name} as a record`,
    ({ value }) => assert.equal(problem(() => InputRecord.from(value, 'save')), 'not-a-record'),
  );

  test('refuses a stored text longer than its limit before parsing it', () => {
    const huge = JSON.stringify({ name: 'a'.repeat(SAVE_SIZE) });
    assert.equal(problem(() => InputRecord.parse(huge, SAVE_SIZE, 'save')), 'too-long');
  });

  test('reads a stored text exactly as long as its limit', () => {
    const exact = `{"n":"${'a'.repeat(SAVE_SIZE - 8)}"}`;
    assert.equal(exact.length, SAVE_SIZE);
    assert.equal(InputRecord.parse(exact, SAVE_SIZE, 'save').has('n'), true);
  });

  test('refuses a stored value that is not text', () => {
    assert.equal(problem(() => InputRecord.parse(null, SAVE_SIZE, 'save')), 'not-text');
  });

  test('refuses text that is not JSON', () => {
    assert.equal(problem(() => InputRecord.parse('{level: 3', SAVE_SIZE, 'save')), 'bad-format');
  });

  test('reads typed fields from JSON', () => {
    const save = InputRecord.parse('{"level": 3, "name": " Ana ", "muted": true}', SAVE_SIZE, 'save');
    assert.equal(save.number('level', LEVEL), 3);
    assert.equal(save.text('name', NAME), 'Ana');
    assert.equal(save.boolean('muted'), true);
  });

  test('names the path of a refused field', () => {
    const state = InputRecord.parse('{"save": {"level": "3"}}', SAVE_SIZE, 'state');
    assert.throws(() => state.record('save').number('level', LEVEL), { message: 'state.save.level: not-a-number' });
  });

  test('sees only its own fields, never inherited ones', () => {
    const save = InputRecord.from({}, 'save');
    assert.equal(save.has('toString'), false);
    assert.equal(problem(() => save.text('toString', NAME)), 'not-text');
    assert.equal(problem(() => save.record('constructor')), 'not-a-record');
  });

  test('tells a field that is null from a missing one', () => {
    const plan = InputRecord.parse('{"stoppedOn": null, "level": 3}', SAVE_SIZE, 'plan');
    assert.equal(plan.isNull('stoppedOn'), true);
    assert.equal(plan.isNull('level'), false);
    assert.equal(plan.isNull('missing'), false);
  });

  test('lists its own field names up to a maximum, for maps keyed by data', () => {
    const days = InputRecord.parse('{"2026-11-08": 120, "2026-11-09": 95}', SAVE_SIZE, 'records');
    assert.deepEqual(days.keys(10), ['2026-11-08', '2026-11-09']);
    assert.equal(problem(() => days.keys(1)), 'too-many');
  });

  test('reads a list item by item, with the index in the path', () => {
    const save = InputRecord.parse('{"stars": [3, 2, "1"]}', SAVE_SIZE, 'save');
    const stars = { maxItems: 60, item: (value, field) => readNumber(value, LEVEL, field) };
    assert.throws(() => save.list('stars', stars), { message: 'save.stars[2]: not-a-number' });
  });

  test('refuses a list longer than allowed, or a field that is not a list', () => {
    const save = InputRecord.parse('{"stars": [1, 2, 3], "name": "Ana"}', SAVE_SIZE, 'save');
    const two = { maxItems: 2, item: (value, field) => readNumber(value, LEVEL, field) };
    assert.equal(problem(() => save.list('stars', two)), 'too-many');
    assert.equal(problem(() => save.list('name', two)), 'not-a-list');
  });
});

describe('orElse: a read with a fallback', () => {
  test('gives the fallback when the value is refused', () => {
    assert.equal(
      orElse(() => readNumber('0.5', VOLUME, 'volume'), 0.8),
      0.8,
    );
  });

  test('gives the value when it is accepted', () => {
    assert.equal(
      orElse(() => readNumber(0.5, VOLUME, 'volume'), 0.8),
      0.5,
    );
  });

  test('lets programming errors through', () => {
    const unanchored = { maxLength: 9, pattern: /[a-z]+/ };
    assert.throws(() => orElse(() => readText('abc', unanchored, 'slug'), ''), TypeError);
  });
});

describe('InputRecord in JavaScript: the constructor stays private', () => {
  test('refuses to wrap a value without checking it', () => {
    assert.throws(() => new InputRecord(Symbol('other'), null, 'save'), TypeError);
  });
});
