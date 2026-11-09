import { InvalidInput, readBoolean, readNumber, readText } from './input.js'

/**
 * Validation des données à l'exécution.
 *
 * Toute donnée qui franchit une frontière de confiance (stockage, URL, liens
 * partagés, portails, événements d'interface) est lue à la porte (règle du
 * 9 novembre 2026). Les valeurs simples passent par les lecteurs partagés de
 * `input.js` (un nombre est un vrai nombre fini dans sa plage, un texte une
 * chaîne nettoyée et bornée) ; un schéma assemble ces lecteurs pour un objet
 * entier. Un schéma est une fonction `(valeur, chemin) => valeurNettoyée` qui
 * lève une `ValidationError` dès qu'une donnée n'a pas le type ou la plage
 * attendus.
 *
 * Exemple :
 *   const userSchema = Schema.object({ name: Schema.string({ maxLength: TEXT_LIMITS.name }) })
 *   const user = userSchema(JSON.parse(raw)) // lève une erreur si invalide
 */

/**
 * Refus d'une valeur. C'est un `InvalidInput` (input.js) : `orElse` le prend
 * pour un refus et rend la valeur de repli.
 */
export class ValidationError extends InvalidInput {
  /**
   * @param {string} path chemin de la donnée fautive (ex. "save.levels.3.stars")
   * @param {string} reason description courte du problème
   */
  constructor(path, reason) {
    super(path || 'value', reason)
    this.name = 'ValidationError'
    this.path = path
    this.reason = reason
  }
}

/** @param {unknown} v */
export function isPlainObject(v) {
  if (v === null || typeof v !== 'object') return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

/** Clés interdites : protection contre la pollution de prototype. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

/** Lit une valeur avec un lecteur de input.js : son refus devient une ValidationError, au même chemin. */
function atDoor(read, path) {
  try {
    return read()
  } catch (error) {
    if (error instanceof InvalidInput && !(error instanceof ValidationError)) throw new ValidationError(path, error.problem)
    throw error
  }
}

/**
 * @template T
 * @typedef {(value: unknown, path?: string) => T} Validator
 */

export const Schema = Object.freeze({
  /** Entier sûr dans [min, max] (jamais une chaîne qui l'écrit). */
  int({ min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
    const rule = Object.freeze({ min, max, integer: true })
    return (v, path = '') => atDoor(() => readNumber(v, rule, path), path)
  },

  /** Nombre fini dans [min, max]. */
  number({ min = -Number.MAX_VALUE, max = Number.MAX_VALUE } = {}) {
    const rule = Object.freeze({ min, max })
    return (v, path = '') => atDoor(() => readNumber(v, rule, path), path)
  },

  boolean() {
    return (v, path = '') => atDoor(() => readBoolean(v, path), path)
  },

  /**
   * Texte nettoyé (caractères de contrôle, inversions bidirectionnelles et
   * caractères invisibles retirés, NFC, espaces resserrés), de longueur bornée
   * en caractères, éventuellement contraint par une expression ancrée (^…$).
   * La longueur maximale est obligatoire : elle vient de TEXT_LIMITS (config/limits.js).
   */
  string({ minLength = 0, maxLength, pattern = null } = {}) {
    if (!Number.isSafeInteger(maxLength) || maxLength < 1) throw new TypeError('Schema.string : longueur maximale obligatoire (TEXT_LIMITS)')
    if (minLength !== 0 && minLength !== 1) throw new TypeError('Schema.string : minLength vaut 0 (facultatif) ou 1 (obligatoire)')
    const rule = Object.freeze({ maxLength, required: minLength === 1, ...(pattern ? { pattern } : {}) })
    return (v, path = '') => atDoor(() => readText(v, rule, path), path)
  },

  /** Valeur appartenant à une liste fermée. */
  enum(values) {
    const allowed = new Set(values)
    return (v, path = '') => {
      if (!allowed.has(v)) throw new ValidationError(path, `must be one of ${[...allowed].join(', ')}`)
      return v
    }
  },

  /** Tableau d'éléments validés, de taille bornée. */
  array(item, { maxLength = 1000, unique = false } = {}) {
    return (v, path = '') => {
      if (!Array.isArray(v)) throw new ValidationError(path, 'array expected')
      if (v.length > maxLength) throw new ValidationError(path, `too many items (max ${maxLength})`)
      const out = v.map((x, i) => item(x, `${path}[${i}]`))
      if (unique && new Set(out).size !== out.length) throw new ValidationError(path, 'duplicate items')
      return out
    }
  },

  /**
   * Objet à forme fixe. Les clés inconnues sont refusées (mode strict par défaut),
   * ce qui empêche l'injection de champs non prévus. Seuls les champs propres
   * de l'objet sont lus, jamais ce qu'il hérite.
   */
  object(shape, { strict = true } = {}) {
    const keys = Object.keys(shape)
    return (v, path = '') => {
      if (!isPlainObject(v)) throw new ValidationError(path, 'object expected')
      if (strict) {
        for (const k of Object.keys(v)) {
          if (!Object.hasOwn(shape, k)) throw new ValidationError(`${path}.${k}`, 'unexpected key')
        }
      }
      const out = {}
      for (const k of keys) out[k] = shape[k](Object.hasOwn(v, k) ? v[k] : undefined, path ? `${path}.${k}` : k)
      return out
    }
  },

  /** Dictionnaire { clé → valeur } avec motif de clé et nombre de clés bornés. */
  record(keyPattern, value, { maxKeys = 100 } = {}) {
    return (v, path = '') => {
      if (!isPlainObject(v)) throw new ValidationError(path, 'object expected')
      const entries = Object.entries(v)
      if (entries.length > maxKeys) throw new ValidationError(path, `too many keys (max ${maxKeys})`)
      const out = Object.create(null)
      for (const [k, val] of entries) {
        if (FORBIDDEN_KEYS.has(k) || !keyPattern.test(k)) throw new ValidationError(`${path}.${k}`, 'invalid key')
        out[k] = value(val, `${path}.${k}`)
      }
      return out
    }
  },

  /** Champ facultatif : `undefined` est remplacé par la valeur par défaut. */
  optional(validator, fallback) {
    return (v, path = '') => (v === undefined ? fallback : validator(v, path))
  },

  /** Accepte `null` en plus du validateur fourni. */
  nullable(validator) {
    return (v, path = '') => (v === null ? null : validator(v, path))
  },
})

/**
 * Vérifications ponctuelles pour les arguments de fonctions et de méthodes.
 * Elles lèvent une erreur immédiatement : un mauvais type est un bug, pas un cas métier.
 * Ce ne sont pas des portes : une chaîne y est vérifiée telle quelle, sans être
 * nettoyée (clés de stockage, texte signé d'une sauvegarde).
 */
export const Guard = Object.freeze({
  int(v, name, opts) {
    return Schema.int(opts)(v, name)
  },
  number(v, name, opts) {
    return Schema.number(opts)(v, name)
  },
  boolean(v, name) {
    return Schema.boolean()(v, name)
  },
  string(v, name, { minLength = 0, maxLength = 256, pattern = null } = {}) {
    if (typeof v !== 'string') throw new ValidationError(name, 'string expected')
    if (v.length < minLength || v.length > maxLength) throw new ValidationError(name, `length must be in [${minLength}, ${maxLength}]`)
    if (pattern && !pattern.test(v)) throw new ValidationError(name, 'invalid format')
    return v
  },
  oneOf(v, values, name) {
    return Schema.enum(values)(v, name)
  },
  func(v, name) {
    if (typeof v !== 'function') throw new ValidationError(name, 'function expected')
    return v
  },
  instance(v, Ctor, name) {
    if (!(v instanceof Ctor)) throw new ValidationError(name, `${Ctor.name} expected`)
    return v
  },
})

/**
 * Gèle un objet en profondeur (configuration, définitions de niveaux…) afin
 * qu'aucun code — ni la console du navigateur — ne puisse le modifier en douce.
 * @template T
 * @param {T} obj
 * @returns {Readonly<T>}
 */
export function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj)
    for (const key of Object.keys(obj)) deepFreeze(obj[key])
  }
  return obj
}
