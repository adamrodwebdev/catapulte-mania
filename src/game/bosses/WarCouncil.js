import { GENERALS } from './generals.js'
import { SKILLS } from './skills.js'

/**
 * Le conseil de guerre d'un général (v6.0) : décide et exécute ses ordres.
 *
 * Après chaque tir du joueur (tant que le général est debout), la partie lui
 * laisse un tour : il donne l'ordre annoncé pendant la visée (`intent`). Ses
 * ordres tournent dans l'ordre de sa fiche ; un ordre sans objet (renforts
 * déjà sur place, rien à réparer) laisse la place au suivant.
 *
 * Tout est déterministe : aucun hasard, et l'ordre est exécuté au pas de
 * simulation que la partie a enregistré (les relectures « Bats mon tir »
 * redonnent exactement la même bataille).
 *
 * Le conseil ne touche au monde que par son « port » (voir GameSession) :
 *   world, condition, particles, hpFactor, engineSpot(), castleLeft(),
 *   after(steps, run), windNext(value), curfew(), feedback(fx), emit(kind, data).
 */
export class WarCouncil {
  #port
  /** Nombre d'ordres déjà donnés. */
  #round = 0
  /** Renforts appelés, par ordre (pour ne pas dépasser le plafond). */
  #summons = new Map()
  /** Vies perdues déjà annoncées. */
  #hurtSeen = 0
  /** Le cri de guerre est-il actif (à lever au prochain ordre) ? */
  warcry = false
  /** Ordre annoncé pour le prochain tour (calculé une fois par tour, voir plan()). */
  #intent = null

  /**
   * @param {object} port
   * @param {import('../entities/General.js').General} general
   */
  constructor(port, general) {
    this.#port = port
    this.general = general
    this.def = GENERALS[general.generalId]
  }

  get id() {
    return this.general.generalId
  }

  /** Le général tient encore debout ? */
  get alive() {
    return this.general.alive
  }

  /** Ordres déjà donnés. */
  get round() {
    return this.#round
  }

  /** Défenseurs appelés en renfort jusqu'ici (pour le compte des cibles du HUD). */
  get summonCount() {
    let n = 0
    for (const list of this.#summons.values()) n += list.filter((e) => e.kind === 'target').length
    return n
  }

  /** Renforts appelés par un ordre (vivants ou non). */
  summoned(skill) {
    return this.#summons.get(skill) ?? []
  }

  /** Retient un renfort (ou un bloc) appelé par un ordre. */
  remember(skill, entity) {
    if (!this.#summons.has(skill)) this.#summons.set(skill, [])
    this.#summons.get(skill).push(entity)
  }

  #ctx(round = this.#round) {
    return { port: this.#port, general: this.general, council: this, def: this.def, round }
  }

  /**
   * Prochain ordre : le premier utilisable dans la rotation, à partir du tour
   * courant. 'taunt' s'il n'en a aucun (il se contente de narguer).
   */
  #choose() {
    const skills = this.def.skills
    const ctx = this.#ctx()
    for (let k = 0; k < skills.length; k++) {
      const id = skills[(this.#round + k) % skills.length]
      if (SKILLS[id].canUse(ctx)) return id
    }
    return 'taunt'
  }

  /** Ordre annoncé (affiché pendant la visée du joueur). */
  get intent() {
    return this.alive ? this.#intent : null
  }

  /** Prépare l'annonce du tour : l'ordre qu'il donnera après le tir du joueur. */
  plan() {
    this.#intent = this.alive ? this.#choose() : null
    return this.#intent
  }

  /**
   * Donne l'ordre du tour (au pas enregistré).
   * @returns {string} compétence jouée ('taunt' : aucune)
   */
  act() {
    if (!this.alive) return null
    // Le cri de guerre du tour précédent retombe.
    if (this.warcry) {
      for (const t of this.#port.world.filter((e) => e.kind === 'target')) t.buff = 1
      this.warcry = false
    }
    const skill = this.#choose()
    this.general.orderAt = this.#port.world.time
    if (skill !== 'taunt') SKILLS[skill].perform(this.#ctx())
    this.#port.emit('act', { id: this.id, skill, round: this.#round })
    this.#round++
    this.#intent = null
    return skill
  }

  /** Le général finit-il encore son ordre (repli en cours) ? */
  get busy() {
    return Boolean(this.general.alive && this.general.retreat)
  }

  /**
   * Un pas de simulation : réagit aux vies perdues (le général se relève,
   * on l'annonce) et à sa chute.
   */
  step() {
    const g = this.general
    if (g.hurtCount > this.#hurtSeen) {
      this.#hurtSeen = g.hurtCount
      this.#port.emit('hurt', { id: this.id, lives: g.lives, cause: g.lastHurtCause, x: g.x, y: g.y })
    }
  }

  /** Données pour le HUD. */
  view() {
    const g = this.general
    return {
      id: this.id,
      lives: g.alive ? g.lives : 0,
      maxLives: g.maxLives,
      alive: g.alive,
      guard: g.guardMs > 0,
      intent: this.intent,
      intentIcon: this.intent && this.intent !== 'taunt' ? SKILLS[this.intent].icon : null,
    }
  }
}
