/**
 * Validation des données à l'exécution.
 *
 * Toute donnée qui franchit une frontière de confiance (localStorage, URL,
 * paramètres de configuration, événements d'interface) passe par un schéma.
 * Un schéma est une fonction `(valeur, chemin) => valeurNettoyée` qui lève une
 * `ValidationError` dès qu'une donnée n'a pas le type ou la plage attendus.
 *
 * Exemple :
 *   const userSchema = Schema.object({ name: Schema.string({ maxLength: 16 }) })
 *   const user = userSchema(JSON.parse(raw)) // lève une erreur si invalide
 */

export class ValidationError extends Error {
  /**
   * @param {string} path chemin de la donnée fautive (ex. "save.levels.3.stars")
   * @param {string} reason description courte du problème
   */
  constructor(path, reason) {
    super(`${path || 'value'}: ${reason}`)
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

/**
 * @template T
 * @typedef {(value: unknown, path?: string) => T} Validator
 */

export const Schema = Object.freeze({
  /** Entier dans [min, max]. */
  int({ min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
    return (v, path = '') => {
      if (typeof v !== 'number' || !Number.isInteger(v)) throw new ValidationError(path, 'integer expected')
      if (v < min || v > max) throw new ValidationError(path, `out of range [${min}, ${max}]`)
      return v
    }
  },

  /** Nombre fini dans [min, max]. */
  number({ min = -Number.MAX_VALUE, max = Number.MAX_VALUE } = {}) {
    return (v, path = '') => {
      if (typeof v !== 'number' || !Number.isFinite(v)) throw new ValidationError(path, 'finite number expected')
      if (v < min || v > max) throw new ValidationError(path, `out of range [${min}, ${max}]`)
      return v
    }
  },

  boolean() {
    return (v, path = '') => {
      if (typeof v !== 'boolean') throw new ValidationError(path, 'boolean expected')
      return v
    }
  },

  /** Chaîne de longueur bornée, éventuellement contrainte par une expression régulière. */
  string({ minLength = 0, maxLength = 256, pattern = null } = {}) {
    return (v, path = '') => {
      if (typeof v !== 'string') throw new ValidationError(path, 'string expected')
      if (v.length < minLength || v.length > maxLength) throw new ValidationError(path, `length must be in [${minLength}, ${maxLength}]`)
      if (pattern && !pattern.test(v)) throw new ValidationError(path, 'invalid format')
      return v
    }
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
   * ce qui empêche l'injection de champs non prévus.
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
      for (const k of keys) out[k] = shape[k](v[k], path ? `${path}.${k}` : k)
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
  string(v, name, opts) {
    return Schema.string(opts)(v, name)
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
