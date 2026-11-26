import { orElse, parseNumber, readChoice } from '../core/utils/input.js'

/**
 * Champs des écrans lus à la porte (règle du 9 novembre 2026) : la valeur d'un
 * curseur ou d'une liste est un texte du DOM, qu'une extension ou les outils du
 * navigateur peuvent changer. Elle est lue en entier, dans ses bornes, jamais
 * convertie par Number() (« 1e2 » valait 100, « » valait 0).
 */

/** Curseurs de volume : un pourcentage entier, de 0 à 100. */
const PERCENT = Object.freeze({ min: 0, max: 100, integer: true })

/**
 * Curseur de volume (pas de 5 %) : sa valeur de 0 à 1, ou null.
 * @param {unknown} text la valeur du curseur
 * @returns {number | null}
 */
export function readPercentSlider(text) {
  return orElse(() => parseNumber(text, PERCENT, 'volume') / 100, null)
}

/**
 * Curseur de visée (angle en degrés, puissance en %) dans les bornes de l'engin, ou null.
 * @param {unknown} text la valeur du curseur
 * @param {{ min: number, max: number }} range
 * @returns {number | null}
 */
export function readAimSlider(text, range) {
  return orElse(() => parseNumber(text, { min: range.min, max: range.max }, 'aim'), null)
}

/**
 * Choix dans une liste fermée (langue, décor) : exactement l'une des valeurs, ou null.
 * @template {string | number} T
 * @param {unknown} value
 * @param {readonly T[]} choices
 * @returns {T | null}
 */
export function readListChoice(value, choices) {
  return orElse(() => readChoice(value, choices, 'choice'), null)
}
