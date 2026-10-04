import { deepFreeze, Guard } from '../../core/utils/Guard.js'

/**
 * Tutoriels guidés : chaque nouvel outil (visée, munition, pouvoir) est présenté
 * dans le niveau où il apparaît pour la première fois, par une suite de
 * bulles d'aide qui avancent au rythme du joueur.
 *
 * Une étape se termine quand l'événement attendu (`until`) se produit :
 *  - 'aim'          : la visée a changé
 *  - 'select:<t>'   : la munition <t> est choisie
 *  - 'menu'         : le menu des pouvoirs est ouvert
 *  - 'power:<id>'   : le pouvoir <id> est activé
 *  - 'fire' / 'fire:<t>' : un tir (de la munition <t>) part
 *  - 'turn'         : le tir est terminé, la main revient au joueur
 *  - 'arm' / 'release' : trébuchet, balancier lancé / fronde lâchée
 *
 * `anchor` désigne l'élément de l'interface à mettre en valeur
 * (attribut `data-coach` du même nom).
 */

/** Pouvoirs déclenchés immédiatement (pas de tir à faire ensuite). */
const IMMEDIATE = new Set(['quake'])

/**
 * Étapes d'un tutoriel.
 * @param {string} tool 'aim' | 'ammo:<type>' | 'power:<id>' | 'engine:trebuchet'
 * @returns {readonly { id: string, anchor: string | null, until: string }[]}
 */
export function tutorialSteps(tool) {
  Guard.string(tool, 'tutorial tool', { pattern: /^(?:aim|ammo:[a-z]+|power:[a-z]+|engine:trebuchet)$/ })
  if (tool === 'engine:trebuchet') {
    // Le trébuchet : 1er clic pour lancer le balancier, 2e clic pour lâcher.
    return deepFreeze([
      { id: 'arm', anchor: 'fire', until: 'arm' },
      { id: 'release', anchor: 'fire', until: 'release' },
      { id: 'watch', anchor: null, until: 'turn' },
      { id: 'done', anchor: null, until: 'arm' },
    ])
  }
  if (tool === 'aim') {
    return deepFreeze([
      { id: 'aim', anchor: 'aim', until: 'aim' },
      { id: 'fire', anchor: 'fire', until: 'fire' },
      { id: 'watch', anchor: null, until: 'turn' },
      { id: 'done', anchor: null, until: 'fire' },
    ])
  }
  const [kind, name] = tool.split(':')
  if (kind === 'ammo') {
    return deepFreeze([
      { id: 'select', anchor: `ammo:${name}`, until: `select:${name}` },
      { id: 'tip', anchor: 'fire', until: `fire:${name}` },
      { id: 'watch', anchor: null, until: 'turn' },
      { id: 'done', anchor: null, until: 'fire' },
    ])
  }
  const steps = [
    { id: 'open', anchor: 'powers', until: 'menu' },
    { id: 'use', anchor: `power:${name}`, until: `power:${name}` },
  ]
  if (!IMMEDIATE.has(name)) steps.push({ id: 'tip', anchor: 'fire', until: 'fire' }, { id: 'watch', anchor: null, until: 'turn' })
  else steps.push({ id: 'watch', anchor: null, until: 'aim' })
  steps.push({ id: 'done', anchor: null, until: 'fire' })
  return deepFreeze(steps)
}

/**
 * Déroulement d'un tutoriel (sans interface : testable seul).
 * L'écran de jeu lui transmet les événements et affiche l'étape courante.
 */
export class TutorialCoach {
  #steps
  #index = 0
  /** @type {(step: object | null) => void} */
  onChange = () => {}

  /** @param {string} tool voir tutorialSteps */
  constructor(tool) {
    this.tool = tool
    this.#steps = tutorialSteps(tool)
  }

  /** Étape en cours, ou null si le tutoriel est fini. */
  get step() {
    return this.#steps[this.#index] ?? null
  }

  get done() {
    return this.#index >= this.#steps.length
  }

  /** Nombre d'étapes et position (pour « 2 / 4 »). */
  get progress() {
    return { index: Math.min(this.#index + 1, this.#steps.length), total: this.#steps.length }
  }

  /**
   * Un événement de jeu s'est produit.
   * @param {string} event 'aim', 'select', 'menu', 'power', 'fire', 'turn'
   * @param {string} [detail] munition ou pouvoir concerné
   */
  notify(event, detail = '') {
    const step = this.step
    if (!step) return
    const [want, what] = step.until.split(':')
    if (want !== event) return
    if (what && what !== detail) return
    this.#index++
    this.onChange(this.step)
  }

  /** Abandon du tutoriel (bouton « Passer »). */
  skip() {
    this.#index = this.#steps.length
    this.onChange(null)
  }
}
