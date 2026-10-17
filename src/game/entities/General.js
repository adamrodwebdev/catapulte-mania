import { Target } from './Target.js'
import { Guard } from '../../core/utils/Guard.js'
import { GENERAL_IDS } from '../bosses/generals.js'
import { WORLD } from '../physics/constants.js'

/** Il se relève (ms de monde) : il clignote, intouchable, le temps de reprendre pied. */
export const GUARD_MS = 1100

/**
 * Général de Mordrac (v6.0) : un défenseur coriace qui a plusieurs vies.
 *
 * Toutes les règles de mort du jeu (écrasement, chute, explosion, feu, noyade,
 * coincement, renversement) s'appliquent à lui comme aux autres ; mais tant
 * qu'il lui reste des vies, un coup mortel ne lui en coûte qu'une : il se
 * relève, le feu s'éteint, et il est intouchable jusqu'au tour suivant (une
 * vie au plus par tir, même sous un effondrement qui dure). Sorti du monde
 * (tombé dans le vide), il est perdu pour de bon.
 *
 * Ses ordres (compétences) sont donnés par le WarCouncil, pas par l'entité.
 */
export class General extends Target {
  /**
   * @param {{ x: number, y: number, general: string, team?: number }} def
   * @param {number} hpFactor
   * @param {number} lives
   */
  constructor(def, hpFactor = 1, lives = 2) {
    super({ ...def, type: 'general' }, hpFactor)
    this.generalId = Guard.oneOf(def.general, GENERAL_IDS, 'general')
    this.maxLives = Guard.int(lives, 'general lives', { min: 1, max: 9 })
    this.lives = this.maxLives
    /** Il se relève : intouchable jusqu'à épuisement (ms de monde). */
    this.guardMs = 0
    /** Une vie déjà perdue pendant ce tir : intouchable jusqu'au tour suivant (voir GameSession). */
    this.shielded = false
    /** Vies perdues jusqu'ici (le WarCouncil compare pour réagir). */
    this.hurtCount = 0
    /** Cause du dernier coup qui lui a coûté une vie. */
    this.lastHurtCause = null
    /** Renforcement d'un cri de guerre (multiplie la résistance, voir Target#toughness). */
    this.buff = 1
    /** Instant (ms de monde) de son dernier ordre : il brandit son arme et crie (dessin seulement). */
    this.orderAt = -Infinity
    // Le feu ne l'emporte pas en 1,5 s comme un soldat : il lui coûte une vie.
    this.burnDps = this.maxHp * 0.9
  }

  /** Où il en est de se relever (v6.2, lu par le dessin) : de 0 (il vient de tomber) à 1 (debout). */
  get guardProgress() {
    return this.guardMs > 0 ? 1 - this.guardMs / GUARD_MS : 1
  }

  /** Il se relève, ou il a déjà perdu une vie pendant ce tir : intouchable (v6.1 : plus aucun dégât). */
  damage(amount, cause) {
    if (this.guardMs > 0 || this.shielded) return false
    return super.damage(amount, cause)
  }

  /** Coup mortel : une vie de moins, tant qu'il en reste. */
  kill(cause) {
    if (!this.alive) return
    // Tombé hors du monde, ou projeté hors du champ de bataille (v6.2) : rien ne le ramène.
    const lost = this.y > WORLD.BOTTOM + WORLD.KILL_MARGIN || this.x > WORLD.WIDTH + WORLD.FIELD_MARGIN
    if (!lost && (this.guardMs > 0 || this.shielded)) return
    if (!lost && this.lives > 1) {
      this.lives--
      this.hurtCount++
      this.lastHurtCause = cause
      this.hp = this.maxHp
      this.burning = 0
      this.frozenMs = 0
      this.guardMs = GUARD_MS
      this.shielded = true
      this.downMs = 0
      return
    }
    this.lives = 0
    super.kill(cause)
  }

  update(dtMs) {
    if (this.guardMs > 0) this.guardMs = Math.max(0, this.guardMs - dtMs)
    super.update(dtMs)
  }
}
