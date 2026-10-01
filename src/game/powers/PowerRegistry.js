import { CalmPower, TitanPower, GreekFirePower, VolleyPower, PowderPower, QuakePower } from './powers.js'
import { Guard } from '../../core/utils/Guard.js'

const POWERS = Object.freeze([new CalmPower(), new TitanPower(), new GreekFirePower(), new VolleyPower(), new PowderPower(), new QuakePower()])

/** Catalogue des pouvoirs spéciaux. */
export class PowerRegistry {
  static all() {
    return POWERS
  }

  static ids() {
    return POWERS.map((p) => p.id)
  }

  static get(id) {
    Guard.oneOf(id, PowerRegistry.ids(), 'power id')
    return POWERS.find((p) => p.id === id)
  }

  /** Pouvoirs débloqués après `completed` niveaux réussis (dérivé, jamais stocké). */
  static unlocked(completed) {
    return POWERS.filter((p) => p.isUnlocked(completed))
  }

  /** Pouvoir débloqué précisément en atteignant `completed` niveaux réussis. */
  static unlockedAt(completed) {
    return POWERS.find((p) => p.unlockAfter === completed) || null
  }
}
