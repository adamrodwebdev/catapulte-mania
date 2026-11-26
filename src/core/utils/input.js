/**
 * @file Data from outside is checked at the door (the user's rule of 9 November 2026).
 *
 * What must be a number is a real, finite number within its range, and what must be
 * text is a string, cleaned and within its length. Nothing is coerced: what does not
 * fit is refused with an InvalidInput, and the caller decides what a refusal means (a
 * default kept, a save left aside). Outside means storage, the URL, the browser,
 * portal SDKs, worker messages, form fields and key names; past the door, code trusts
 * these types.
 *
 * JavaScript port of the shared readers (`.helpers/input-validation/input.ts`): same
 * rules, same invisible characters removed, same refusals.
 */

/**
 * Why a value was refused.
 * @typedef {'not-a-number'|'not-an-integer'|'out-of-range'|'not-text'|'empty'|'too-long'|'bad-format'
 *   |'not-a-choice'|'not-a-boolean'|'not-a-record'|'not-a-list'|'too-many'} InputProblem
 */

/**
 * @typedef {object} NumberRule
 * @property {number} min
 * @property {number} max
 * @property {boolean} [integer] whole numbers only: counts, levels, indexes, identifiers
 */

/**
 * @typedef {object} TextRule
 * @property {number} maxLength the longest text accepted once cleaned, in characters (code points)
 * @property {boolean} [multiline] keeps line breaks and tabs; otherwise each run of white space becomes a space
 * @property {boolean} [required] refuses a text that is empty once cleaned
 * @property {RegExp} [pattern] an allow-list the whole cleaned text must match: anchored (^…$), without g or y
 */

/**
 * @template T
 * @typedef {object} ListRule
 * @property {number} maxItems
 * @property {(value: unknown, field: string) => T} item reads one item: one of the readers below
 */

/** A value refused at the door: the field's path and the reason. */
export class InvalidInput extends Error {
  /**
   * @param {string} field path of the field (`save.levels[2].stars`)
   * @param {InputProblem} problem
   */
  constructor(field, problem) {
    super(`${field}: ${problem}`);
    this.name = 'InvalidInput';
    this.field = field;
    this.problem = problem;
  }
}

/**
 * A value that must already be a number: parsed JSON, a message, an SDK value.
 * @param {unknown} value
 * @param {NumberRule} rule
 * @param {string} field
 * @returns {number}
 */
export function readNumber(value, rule, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new InvalidInput(field, 'not-a-number');
  if (rule.integer === true && !Number.isSafeInteger(value)) throw new InvalidInput(field, 'not-an-integer');
  if (value < rule.min || value > rule.max) throw new InvalidInput(field, 'out-of-range');
  return value === 0 ? 0 : value; // -0 reads as 0
}

/**
 * The whole text spells the number: an optional minus, ASCII digits and one decimal point. No
 * exponent, hexadecimal, plus sign, grouping or other digits; 15 digits keep integers exact.
 */
const INTEGER_TEXT = /^-?\d{1,15}$/;
const DECIMAL_TEXT = /^-?\d{1,15}(?:\.\d{1,15})?$/;

/**
 * Text that must spell a number: a form field, a URL parameter, a stored string. Where the
 * field's language writes a decimal comma, the caller turns that one comma into a point first.
 * @param {unknown} text
 * @param {NumberRule} rule
 * @param {string} field
 * @returns {number}
 */
export function parseNumber(text, rule, field) {
  if (typeof text !== 'string') throw new InvalidInput(field, 'not-text');
  const trimmed = text.trim();
  if (!(rule.integer === true ? INTEGER_TEXT : DECIMAL_TEXT).test(trimmed)) {
    throw new InvalidInput(field, 'not-a-number');
  }
  return readNumber(Number(trimmed), rule, field);
}

/** Invisible code points taken out of every text, as [first, last] ranges. */
const INVISIBLE = [
  [0x00, 0x08], // C0 controls before the tab
  [0x0b, 0x0c], // vertical tab and form feed
  [0x0e, 0x1f], // C0 controls after the carriage return
  [0x7f, 0x9f], // delete and the C1 controls
  [0x200b, 0x200b], // zero-width space
  [0x202a, 0x202e], // bidirectional embeddings and overrides ("Trojan Source")
  [0x2060, 0x2064], // word joiner and invisible operators
  [0x2066, 0x2069], // bidirectional isolates
  [0xd800, 0xdfff], // lone surrogates (a valid pair reads as one code point above 0xFFFF)
  [0xfeff, 0xfeff], // byte-order mark
  [0xe0000, 0xe007f], // tag characters
];

/** @param {string} character one code point */
function isInvisible(character) {
  const code = character.codePointAt(0) ?? 0;
  return INVISIBLE.some(([first, last]) => code >= first && code <= last);
}

/**
 * Cleans a text without changing what it says: line breaks unified, invisible characters
 * removed (zero-width joiners stay: emoji and several scripts need them), Unicode composed
 * (NFC), white space tidied, ends trimmed. Idempotent. It does not escape HTML: text is escaped
 * where it is shown (a template's interpolation, textContent, an attribute).
 * @param {string} text
 * @param {boolean} multiline
 * @returns {string}
 */
function clean(text, multiline) {
  // Array.from walks code points, so a surrogate pair stays one character.
  const visible = Array.from(text.replace(/\r\n?/g, '\n'))
    .filter((character) => !isInvisible(character))
    .join('');
  const composed = visible.normalize('NFC');
  return (multiline ? composed : composed.replace(/\s+/g, ' ')).trim();
}

/**
 * @param {RegExp} pattern
 * @param {string} text
 */
function matchesWhole(pattern, text) {
  if (pattern.global || pattern.sticky) {
    throw new TypeError(`${String(pattern)} keeps state between tests: drop the g and y flags`);
  }
  if (!pattern.source.startsWith('^') || !pattern.source.endsWith('$')) {
    throw new TypeError(`${String(pattern)} must match the whole text: anchor it with ^ and $`);
  }
  return pattern.test(text);
}

/**
 * A value that must be text: refused unless it is a string, then cleaned and checked.
 * @param {unknown} value
 * @param {TextRule} rule
 * @param {string} field
 * @returns {string}
 */
export function readText(value, rule, field) {
  if (typeof value !== 'string') throw new InvalidInput(field, 'not-text');
  const text = clean(value, rule.multiline === true);
  if (text === '') {
    if (rule.required === true) throw new InvalidInput(field, 'empty');
    return text;
  }
  if (Array.from(text).length > rule.maxLength) throw new InvalidInput(field, 'too-long');
  if (rule.pattern && !matchesWhole(rule.pattern, text)) throw new InvalidInput(field, 'bad-format');
  return text;
}

/**
 * A value that must be one of a closed set: an enum, a theme, a tower type.
 * @template {string|number} T
 * @param {unknown} value
 * @param {readonly T[]} choices
 * @param {string} field
 * @returns {T}
 */
export function readChoice(value, choices, field) {
  const choice = choices.find((candidate) => candidate === value);
  if (choice === undefined) throw new InvalidInput(field, 'not-a-choice');
  return choice;
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {boolean}
 */
export function readBoolean(value, field) {
  if (typeof value !== 'boolean') throw new InvalidInput(field, 'not-a-boolean');
  return value;
}

/** @param {unknown} value */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * An own field, never an inherited one (Object.hasOwn needs Safari 15.4: this works everywhere).
 * @param {object} fields
 * @param {string} key
 */
function owns(fields, key) {
  return Object.prototype.hasOwnProperty.call(fields, key);
}

/** Keeps the constructor private: a record is only made by `from` or `parse`, which check it. */
const BUILD = Symbol('InputRecord');

/**
 * An object from outside (parsed JSON, a message, a save), read field by field. Only its own
 * fields are seen, never `__proto__`, `constructor` or anything inherited, and each read checks
 * the field's type. Errors name the path of the field (`save.levels[2].stars`).
 */
export class InputRecord {
  #fields;
  #name;

  /**
   * Private: use `InputRecord.from` or `InputRecord.parse`.
   * @param {symbol} token
   * @param {object} fields
   * @param {string} name
   */
  constructor(token, fields, name) {
    if (token !== BUILD) throw new TypeError('Use InputRecord.from or InputRecord.parse');
    this.#fields = fields;
    this.#name = name;
  }

  /**
   * @param {unknown} value
   * @param {string} name path of the record, for errors
   * @returns {InputRecord}
   */
  static from(value, name) {
    if (!isRecord(value)) throw new InvalidInput(name, 'not-a-record');
    return new InputRecord(BUILD, value, name);
  }

  /**
   * Parses JSON first, from text no longer than `maxLength` UTF-16 units (a save, a stored
   * preference, a message): what is too long is refused before parsing, and text that is not
   * JSON is refused like any other bad input.
   * @param {unknown} json
   * @param {number} maxLength
   * @param {string} name
   * @returns {InputRecord}
   */
  static parse(json, maxLength, name) {
    if (typeof json !== 'string') throw new InvalidInput(name, 'not-text');
    if (json.length > maxLength) throw new InvalidInput(name, 'too-long');
    let value;
    try {
      value = JSON.parse(json);
    } catch {
      throw new InvalidInput(name, 'bad-format');
    }
    return InputRecord.from(value, name);
  }

  /** @param {string} key */
  has(key) {
    return owns(this.#fields, key);
  }

  /**
   * The field is present and null: a nullable field (`countdown: null`), told from a missing one.
   * @param {string} key
   */
  isNull(key) {
    return owns(this.#fields, key) && this.#fields[key] === null;
  }

  /**
   * The record's own field names, refused beyond `maxKeys`: a map keyed by data (levels, causes).
   * @param {number} maxKeys
   * @returns {readonly string[]}
   */
  keys(maxKeys) {
    const keys = Object.keys(this.#fields);
    if (keys.length > maxKeys) throw new InvalidInput(this.#name, 'too-many');
    return keys;
  }

  /**
   * @param {string} key
   * @param {NumberRule} rule
   */
  number(key, rule) {
    return readNumber(this.#value(key), rule, this.#path(key));
  }

  /**
   * @param {string} key
   * @param {TextRule} rule
   */
  text(key, rule) {
    return readText(this.#value(key), rule, this.#path(key));
  }

  /** @param {string} key */
  boolean(key) {
    return readBoolean(this.#value(key), this.#path(key));
  }

  /**
   * @template {string|number} T
   * @param {string} key
   * @param {readonly T[]} choices
   * @returns {T}
   */
  choice(key, choices) {
    return readChoice(this.#value(key), choices, this.#path(key));
  }

  /** @param {string} key */
  record(key) {
    return InputRecord.from(this.#value(key), this.#path(key));
  }

  /**
   * @template T
   * @param {string} key
   * @param {ListRule<T>} rule
   * @returns {readonly T[]}
   */
  list(key, rule) {
    const value = this.#value(key);
    const field = this.#path(key);
    if (!Array.isArray(value)) throw new InvalidInput(field, 'not-a-list');
    if (value.length > rule.maxItems) throw new InvalidInput(field, 'too-many');
    return value.map((item, index) => rule.item(item, `${field}[${index}]`));
  }

  /** @param {string} key */
  #value(key) {
    return owns(this.#fields, key) ? this.#fields[key] : undefined;
  }

  /** @param {string} key */
  #path(key) {
    return `${this.#name}.${key}`;
  }
}

/**
 * A read that falls back when the value is missing or refused: preferences, saves, options.
 * Programming errors (a TypeError from an unanchored pattern) still go through.
 * @template T
 * @param {() => T} read
 * @param {T} fallback
 * @returns {T}
 */
export function orElse(read, fallback) {
  try {
    return read();
  } catch (error) {
    if (error instanceof InvalidInput) return fallback;
    throw error;
  }
}
