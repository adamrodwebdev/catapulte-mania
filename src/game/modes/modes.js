import { GameMode } from './GameMode.js'
import { NO_EFFECTS } from '../progression/UpgradeCatalog.js'
import { LevelRepository } from '../levels/LevelRepository.js'

/** Mode histoire : un joueur, résultat enregistré (or, étoiles, déblocages). */
export class StoryMode extends GameMode {
  id = 'story'
  recordsResult = true

  /**
   * Toute munition déjà découverte reste disponible pour le reste de la
   * campagne, pour que le joueur puisse expérimenter : au moins une de chaque
   * type débloqué dans chaque niveau (plus la Réserve de l'atelier), même en
   * Difficile. Les niveaux qui en prévoient davantage gardent leur dotation.
   */
  ammoFor(level, difficulty) {
    const out = super.ammoFor(level, difficulty)
    const reached = Math.max(level.id ?? 0, this.completedLevels)
    for (const l of LevelRepository.all().slice(0, reached)) {
      for (const type of Object.keys(l.ammo)) {
        if (!(out[type] > 0)) out[type] = 1 + (this.effects.extraAmmo || 0)
      }
    }
    return out
  }
}

/**
 * Mode libre : rejouer un niveau déjà terminé sans contrainte.
 * Tirs et munitions illimités (types découverts en histoire), pouvoirs débloqués
 * gratuits (toujours un par tour), améliorations du profil appliquées.
 * Rien n'est enregistré.
 */
export class FreeMode extends GameMode {
  id = 'free'
  unlimited = true

  shotsFor() {
    return null
  }

  /** Toutes les munitions rencontrées dans les niveaux terminés, à volonté. */
  ammoFor() {
    const out = {}
    for (const l of LevelRepository.all().slice(0, this.completedLevels)) {
      for (const type of Object.keys(l.ammo)) out[type] = Infinity
    }
    return out
  }

  powerCost() {
    return 0
  }

  evaluate(session) {
    return session.targetsLeft === 0 ? { won: true, winner: null } : null
  }
}

/** Évaluation commune aux modes à deux joueurs qui se départagent aux points. */
function byScore(session, allDone) {
  if (!allDone) return null
  const [a, b] = session.players.map((p) => p.score.current)
  return { won: session.targetsLeft === 0, winner: a === b ? null : a > b ? 0 : 1 }
}

/**
 * Duel : deux joueurs tirent à tour de rôle sur le même château.
 * Chaque destruction rapporte des points à celui qui a tiré.
 * Sans améliorations (équité) ; pouvoirs selon la progression du profil.
 */
export class DuelMode extends GameMode {
  id = 'duel'

  constructor(opts = {}) {
    super({ ...opts, effects: NO_EFFECTS })
  }

  shotsFor(level) {
    return Math.max(2, level.shots)
  }

  evaluate(session) {
    const done = session.targetsLeft === 0 || session.players.every((p) => p.shotsLeft === 0)
    return byScore(session, done)
  }
}

/**
 * Chacun sa partie : une manche = un joueur seul sur le niveau.
 * L'écran de jeu enchaîne la manche du joueur 1 puis celle du joueur 2 et
 * compare les scores ; ce mode décrit une seule manche.
 */
export class HotSeatMode extends GameMode {
  id = 'hotseat'

  constructor(opts = {}) {
    super({ ...opts, effects: NO_EFFECTS })
  }

  shotsFor(level) {
    return Math.max(2, level.shots)
  }
}

/**
 * Face-à-face : chaque joueur a sa catapulte et son château (arène symétrique).
 * Le premier qui élimine tous les défenseurs adverses gagne. Si les deux
 * joueurs n'ont plus de tirs, celui qui a gardé le plus de défenseurs l'emporte.
 */
export class VersusMode extends GameMode {
  id = 'versus'
  powersEnabled = false

  constructor(opts = {}) {
    super({ ...opts, effects: NO_EFFECTS })
  }

  shotsFor(level) {
    return level.shots
  }

  /** Les cibles des arènes portent leur équipe (1 ou 2). */
  teamOf(target) {
    return target.team || 0
  }

  evaluate(session) {
    const alive = [1, 2].map((team) => session.world.filter((e) => e.kind === 'target' && e.alive && e.team === team).length)
    if (alive[0] === 0 || alive[1] === 0) {
      if (alive[0] === alive[1]) return { won: true, winner: null }
      return { won: true, winner: alive[0] === 0 ? 1 : 0 }
    }
    if (session.players.every((p) => p.shotsLeft === 0)) {
      return { won: true, winner: alive[0] === alive[1] ? null : alive[0] > alive[1] ? 0 : 1 }
    }
    return null
  }
}

/** Fabrique d'un mode à partir de son identifiant. */
export function createMode(id, opts) {
  switch (id) {
    case 'story':
      return new StoryMode(opts)
    case 'free':
      return new FreeMode(opts)
    case 'duel':
      return new DuelMode(opts)
    case 'hotseat':
      return new HotSeatMode(opts)
    case 'versus':
      return new VersusMode(opts)
    default:
      throw new TypeError(`unknown mode ${id}`)
  }
}
