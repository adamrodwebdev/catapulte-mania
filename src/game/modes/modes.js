import { GameMode } from './GameMode.js'
import { NO_EFFECTS } from '../progression/UpgradeCatalog.js'
import { LevelRepository } from '../levels/LevelRepository.js'
import { renownSum, COUP_DE_GRACE } from './Renown.js'

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

/** Renommée encore à prendre dans le château (défenseurs debout + coup de grâce). */
function renownLeft(session) {
  const alive = session.world.filter((e) => e.kind === 'target' && e.alive)
  return alive.length ? renownSum(alive) + COUP_DE_GRACE : 0
}

/**
 * Duel « La conquête » : deux joueurs tirent à tour de rôle sur le même grand
 * château. Chaque défenseur abattu rapporte de la renommée à celui qui a tiré
 * (soldat 1, chevalier 2, roi 4, +2 pour le coup de grâce).
 *
 * Victoire :
 *  - dès que l'écart de renommée dépasse tout ce qui reste à prendre
 *    (« victoire assurée » : inutile de jouer les tirs restants) ;
 *  - sinon, quand le château est tombé ou que les tirs sont épuisés, le plus
 *    renommé l'emporte ; à égalité, le meilleur score de destruction ; sinon nul.
 * Sans améliorations (équité) ; pouvoirs selon la progression des profils.
 */
export class DuelMode extends GameMode {
  id = 'duel'
  coupDeGrace = true

  constructor(opts = {}) {
    super({ ...opts, effects: NO_EFFECTS })
  }

  shotsFor(level, difficulty) {
    return Math.max(3, level.shots + (difficulty?.shotDelta ?? 0))
  }

  evaluate(session) {
    const [a, b] = session.renown
    const left = renownLeft(session)
    const done = session.targetsLeft === 0 || session.players.every((p) => p.shotsLeft === 0)
    if (!done && Math.abs(a - b) <= left) return null
    const won = session.targetsLeft === 0 || a !== b
    if (a !== b) return { won, winner: a > b ? 0 : 1, reason: done ? 'renown' : 'assured' }
    const [sa, sb] = session.players.map((p) => p.score.current)
    return { won, winner: sa === sb ? null : sa > sb ? 0 : 1, reason: sa === sb ? 'draw' : 'score' }
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
}

/**
 * Campagne à deux : les deux joueurs parcourent ensemble les 100 niveaux de
 * l'histoire, en tirant à tour de rôle. Ils partagent les tirs du niveau
 * (le joueur 1 en a un de plus si le nombre est impair), les munitions
 * spéciales (partagées de même) et un score commun ; la victoire est commune.
 * Les règles sont celles du mode Difficile, puisque deux têtes valent mieux
 * qu'une. Le plus renommé de la partie est désigné meilleur joueur.
 * La progression est enregistrée à part dans le profil (champ `coop`).
 */
export class CoopMode extends StoryMode {
  id = 'coop'
  coupDeGrace = true
  sharedScore = true

  constructor(opts = {}) {
    super({ ...opts, effects: NO_EFFECTS })
  }

  /** Les tirs du niveau, répartis entre les deux joueurs. */
  shotsFor(level, difficulty, index = 0) {
    const total = Math.max(2, level.shots + (difficulty?.shotDelta ?? 0))
    return index === 0 ? Math.ceil(total / 2) : Math.floor(total / 2)
  }

  /** Les munitions de la campagne, réparties de même. */
  ammoFor(level, difficulty, index = 0) {
    const out = {}
    for (const [type, n] of Object.entries(super.ammoFor(level, difficulty))) {
      const share = index === 0 ? Math.ceil(n / 2) : Math.floor(n / 2)
      if (share > 0) out[type] = share
    }
    return out
  }
}

/**
 * Face-à-face « Le siège » : chaque joueur a sa catapulte et son château
 * (arène symétrique), et chaque château abrite un roi.
 *
 * Victoire :
 *  - RÉGICIDE : abattre le roi adverse donne aussitôt la victoire ;
 *  - CONQUÊTE : ou éliminer tous les défenseurs adverses ;
 *  - si les deux rois tombent au même tir, ou si les tirs sont épuisés, on
 *    compare ce qui reste debout : la renommée des défenseurs survivants
 *    (soldat 1, chevalier 2, roi 4), puis leur nombre ; sinon match nul.
 * Abattre ses propres défenseurs ne rapporte rien : c'est un cadeau à l'adversaire.
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
    const camp = (team) => {
      const all = session.world.filter((e) => e.kind === 'target' && e.team === team)
      const alive = all.filter((e) => e.alive)
      const hadKing = all.some((e) => e.type === 'king')
      return { alive: alive.length, renown: renownSum(alive), kingDown: hadKing && !alive.some((e) => e.type === 'king') }
    }
    const [a, b] = [camp(1), camp(2)]
    const standing = (reason) => {
      if (a.renown !== b.renown) return { won: true, winner: a.renown > b.renown ? 0 : 1, reason }
      if (a.alive !== b.alive) return { won: true, winner: a.alive > b.alive ? 0 : 1, reason }
      return { won: true, winner: null, reason: 'draw' }
    }
    if (a.kingDown !== b.kingDown) return { won: true, winner: a.kingDown ? 1 : 0, reason: 'regicide' }
    if (a.alive === 0 || b.alive === 0) {
      if (a.alive === b.alive) return { won: true, winner: null, reason: 'draw' }
      return { won: true, winner: a.alive === 0 ? 1 : 0, reason: 'conquest' }
    }
    if (a.kingDown && b.kingDown) return standing('standing')
    if (session.players.every((p) => p.shotsLeft === 0)) return standing('standing')
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
    case 'coop':
      return new CoopMode(opts)
    default:
      throw new TypeError(`unknown mode ${id}`)
  }
}
