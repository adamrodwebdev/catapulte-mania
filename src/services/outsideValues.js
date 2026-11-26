import { orElse, readText } from '../core/utils/input.js'
import { TEXT_LIMITS } from '../config/limits.js'

/**
 * Valeurs que le navigateur, les portails et les liens donnent au jeu, lues à
 * la porte (règle du 9 novembre 2026). Chaque lecteur rend la valeur nettoyée
 * et bornée, ou `null` : une valeur d'un autre type, trop longue ou mal formée
 * ne passe jamais (ni objet au `toString` piégé, ni nom hérité comme
 * `constructor`). Les limites viennent de TEXT_LIMITS (config/limits.js).
 */

/** Étiquette de langue BCP 47 simplifiée : « fr », « pt-BR », « zh_Hant_TW ». */
const LANGUAGE_TAG = /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{1,8})*$/
/** Lien d'invitation d'un portail : https seulement, sans espace. */
const HTTPS_LINK = /^https:\/\/\S+$/
/** Code porté par un lien (défi, château : base64url ; coupe : AAAA-Www). */
const INVITE = /^[A-Za-z0-9_-]+$/

/**
 * Langue donnée par le navigateur ou un portail (`navigator.languages`, SDK).
 * @param {unknown} value
 * @returns {string | null}
 */
export function readLanguageTag(value) {
  return orElse(() => readText(value, { maxLength: TEXT_LIMITS.languageTag, required: true, pattern: LANGUAGE_TAG }, 'language'), null)
}

/**
 * Lien d'invitation rendu par un portail (« Bats mon tir », atelier, coupe).
 * @param {unknown} value
 * @returns {string | null}
 */
export function readInviteLink(value) {
  return orElse(() => readText(value, { maxLength: TEXT_LIMITS.inviteLink, required: true, pattern: HTTPS_LINK }, 'invite link'), null)
}

/**
 * Code reçu par un lien d'invitation (paramètre du portail ou ancre `#defi=…`) :
 * son format et sa longueur seulement ; le code lui-même est relu par son schéma.
 * @param {unknown} value
 * @returns {string | null}
 */
export function readInviteParam(value) {
  return orElse(() => readText(value, { maxLength: TEXT_LIMITS.invite, required: true, pattern: INVITE }, 'invite'), null)
}
