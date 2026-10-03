import { Guard } from '../../core/utils/Guard.js'
import { PROFILE_NAME } from '../../domain/SaveSlot.js'
import { NO_EFFECTS } from '../progression/UpgradeCatalog.js'

/**
 * Règles d'une façon de jouer (patron Stratégie).
 *
 * GameSession gère la physique, la visée et l'enchaînement des tours ; le mode
 * décide du reste : nombre de joueurs, tirs et munitions de chacun, coût des
 * pouvoirs, ordre de passage, conditions de fin, enregistrement du résultat.
 *
 * Sous-classes : StoryMode, FreeMode, DuelMode, HotSeatMode, VersusMode.
 */
export class GameMode {
  /** Identifiant du mode (utilisé par l'interface et les traductions). */
  id = 'base'
  /** Le résultat est-il enregistré dans le profil (or, étoiles, progression) ? */
  recordsResult = false
  /** Pouvoirs spéciaux autorisés ? */
  powersEnabled = true
  /** Tirs et munitions illimités ? */
  unlimited = false
  /** Bonus de renommée pour qui abat le dernier défenseur (modes à deux). */
  coupDeGrace = false
  /** Un seul score pour l'équipe (campagne à deux) ? */
  sharedScore = false

  /**
   * @param {{ players?: string[], effects?: object, completedLevels?: number }} [opts]
   *   players : noms des joueurs (1 ou 2) ; effects : améliorations du profil
   */
  constructor({ players = ['P1'], effects = NO_EFFECTS, completedLevels = 0 } = {}) {
    if (!Array.isArray(players) || players.length < 1 || players.length > 2) throw new TypeError('players: 1 or 2 names expected')
    this.players = Object.freeze(players.map((n, i) => GameMode.cleanName(n, i)))
    this.effects = effects
    this.completedLevels = Guard.int(completedLevels, 'completedLevels', { min: 0, max: 100 })
  }

  /** Nom de joueur validé (même règle que les profils), ou nom par défaut. */
  static cleanName(name, index) {
    const s = typeof name === 'string' ? name.trim() : ''
    return PROFILE_NAME.test(s) ? s : `P${index + 1}`
  }

  /** Nombre de tirs de chaque joueur (null = illimité). */
  shotsFor(level, difficulty) {
    return Math.max(2, level.shots + difficulty.shotDelta + (this.effects.extraShots || 0))
  }

  /**
   * Munitions spéciales de départ de chaque joueur (Infinity = illimité).
   * En Difficile, la moitié seulement (arrondi inférieur) ; la Réserve de l'atelier s'ajoute ensuite.
   */
  ammoFor(level, difficulty = { ammoFactor: 1 }) {
    const out = {}
    // Niveau tutoriel : la munition présentée reste disponible, même en Difficile.
    const taught = typeof level.tutorial === 'string' && level.tutorial.startsWith('ammo:') ? level.tutorial.slice(5) : null
    for (const [type, n] of Object.entries(level.ammo)) {
      const scaled = Math.floor(n * (difficulty.ammoFactor ?? 1))
      const base = type === taught ? Math.max(1, scaled) : scaled
      const total = base + (this.effects.extraAmmo || 0)
      if (total > 0) out[type] = total
    }
    return out
  }

  /** Coût en points d'un pouvoir. */
  powerCost(power) {
    return Math.round(power.cost * (this.effects.powerCostFactor ?? 1))
  }

  /** Index du joueur suivant après un tour. */
  nextPlayer(current, session) {
    if (this.players.length === 1) return 0
    const other = 1 - current
    return session.players[other].shotsLeft !== 0 ? other : current
  }

  /** Équipe propriétaire d'une cible (0 = aucune). */
  teamOf(_target) {
    return 0
  }

  /**
   * Fin de partie ? Appelé à la fin de chaque tour.
   * @param {import('../GameSession.js').GameSession} session
   * @returns {null | { won: boolean, winner: number | null }}
   *   winner : index du joueur gagnant (null = égalité ou partie solo)
   */
  evaluate(session) {
    const allDown = session.targetsLeft === 0
    const outOfShots = session.players.every((p) => p.shotsLeft === 0)
    if (!allDown && !outOfShots) return null
    return { won: allDown, winner: null }
  }
}
