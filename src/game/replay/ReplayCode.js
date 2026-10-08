import { Schema, ValidationError } from '../../core/utils/Guard.js'
import { GAME } from '../../config/gameConfig.js'
import { PROFILE_NAME } from '../../domain/SaveSlot.js'
import { DAY_KEY, DailyChallenge } from '../daily/DailyChallenge.js'
import { AIM } from '../aim.js'

/**
 * Code d'un défi « Bats mon tir » (v3.9) : le niveau, l'engin et le journal
 * des gestes, en JSON compact encodé en base64url (aucun serveur : tout tient
 * dans le lien).
 *
 * Sécurité : le code est une donnée NON FIABLE. Il est borné en taille,
 * décodé sans `eval`, et chaque champ est validé par un schéma strict. Il ne
 * contient AUCUN score : le score à battre est recalculé en rejouant les
 * gestes dans le moteur. Les pouvoirs (interdits en défi) sont refusés.
 */

const AMMO = Object.freeze(['stone', 'boulder', 'fire', 'bomb', 'split', 'frost'])
export const MAX_CODE_LENGTH = 4000
const MAX_ACTIONS = 60
const STEPS = Schema.int({ min: 0, max: 30000 })
/** v2 (v5.0) : instants des tirs comptés depuis le début de la partie (pas absolus). */
const AT = Schema.int({ min: 0, max: 1_000_000 })

const actionSchema = (raw, path) => {
  if (!Array.isArray(raw) || raw.length < 2) throw new ValidationError(path, 'action expected')
  const [k] = raw
  if (k === 'f' && raw.length === 6) {
    return {
      k,
      d: AT(raw[1], `${path}.d`),
      a: AMMO[Schema.int({ min: 0, max: AMMO.length - 1 })(raw[2], `${path}.a`)],
      ang: Schema.number({ min: 0, max: AIM.MAX_ANGLE })(raw[3], `${path}.ang`),
      pow: Schema.number({ min: 0, max: 1 })(raw[4], `${path}.pow`),
      l: Schema.int({ min: 0, max: 600 })(raw[5], `${path}.l`),
    }
  }
  if (k === 't' && raw.length === 5) {
    return {
      k,
      d: AT(raw[1], `${path}.d`),
      a: AMMO[Schema.int({ min: 0, max: AMMO.length - 1 })(raw[2], `${path}.a`)],
      r: Schema.number({ min: 0, max: 5000 })(raw[3], `${path}.r`),
      l: Schema.int({ min: 0, max: 3000 })(raw[4], `${path}.l`),
    }
  }
  if (k === 'x' && raw.length === 2) return { k, d: STEPS(raw[1], `${path}.d`) }
  throw new ValidationError(path, 'unknown action')
}

const codeSchema = Schema.object(
  {
    v: Schema.enum([2]),
    day: Schema.string({ minLength: 0, maxLength: 10, pattern: /^(?:|\d{4}-\d{2}-\d{2})$/ }),
    l: Schema.int({ min: 1, max: GAME.LEVEL_COUNT }),
    e: Schema.enum(['catapult', 'trebuchet', 'ballista']),
    n: Schema.string({ minLength: 0, maxLength: 16, pattern: /^(?:|[\p{L}\p{N}][\p{L}\p{N} _'-]{0,15})$/u }),
    a: Schema.array((raw) => raw, { maxLength: MAX_ACTIONS }),
  },
  { strict: true },
)

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(code) {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

/** Arrondi qui garde la même valeur une fois relue (angles et puissances exacts). */
const exact = (x) => Number(x)

export class ReplayCode {
  /**
   * @param {{ day?: string, levelId: number, engine: string, name?: string, log: object[] }} run
   * @returns {string} code base64url
   */
  static encode({ day = '', levelId, engine, name = '', log }) {
    const a = log.map((x) => {
      if (x.k === 'f') return ['f', x.d, AMMO.indexOf(x.a), exact(x.ang), exact(x.pow), x.l]
      if (x.k === 't') return ['t', x.d, AMMO.indexOf(x.a), exact(x.r), x.l]
      if (x.k === 'x') return ['x', x.d]
      throw new ValidationError('log', `action ${x.k} cannot be shared`)
    })
    const data = { v: 2, day, l: levelId, e: engine, n: PROFILE_NAME.test(name) ? name : '', a }
    ReplayCode.#validate(data)
    return toBase64Url(JSON.stringify(data))
  }

  /**
   * Décode et valide un code reçu (lien). Lève une erreur si quoi que ce soit cloche.
   * @returns {{ day: string, levelId: number, engine: 'catapult' | 'trebuchet', name: string, actions: object[] }}
   */
  static decode(code) {
    if (typeof code !== 'string' || code.length === 0 || code.length > MAX_CODE_LENGTH || !/^[A-Za-z0-9_-]+$/.test(code)) {
      throw new ValidationError('code', 'invalid format')
    }
    let raw
    try {
      raw = JSON.parse(fromBase64Url(code))
    } catch {
      throw new ValidationError('code', 'unreadable')
    }
    return ReplayCode.#validate(raw)
  }

  static #validate(raw) {
    const data = codeSchema(raw, 'code')
    const actions = data.a.map((x, i) => actionSchema(x, `code.a.${i}`))
    if (!actions.some((x) => x.k === 'f' || x.k === 't')) throw new ValidationError('code.a', 'no shot')
    // Un défi du jour porte la date : son niveau et son engin doivent correspondre.
    if (data.day) {
      if (!DAY_KEY.test(data.day)) throw new ValidationError('code.day', 'invalid day')
      const c = DailyChallenge.forDay(data.day)
      if (c.levelId !== data.l || c.engine !== data.e) throw new ValidationError('code', 'does not match the daily challenge')
    }
    // Un seul engin par partie.
    if (actions.some((x) => (x.k === 'f' && data.e !== 'catapult' && data.e !== 'ballista') || (x.k === 't' && data.e !== 'trebuchet'))) throw new ValidationError('code.a', 'engine mismatch')
    return { day: data.day, levelId: data.l, engine: data.e, name: data.n, actions }
  }
}
