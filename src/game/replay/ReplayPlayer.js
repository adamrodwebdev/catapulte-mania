import { WORLD } from '../physics/constants.js'
import { STATE } from '../GameSession.js'

/**
 * Rejoue une partie à partir de son journal de gestes (v3.9, « Bats mon tir »).
 *
 * La partie avance pas à pas (un pas de simulation par appel au plus) et
 * chaque geste est rejoué au pas où il avait eu lieu, compté depuis le début
 * de la visée (tir), depuis le tir (lancement) ou depuis le lancement (division
 * de la mitraille). La physique étant à pas fixe et sans hasard libre, la
 * partie rejouée est la même : son score est recalculé par le moteur, jamais
 * lu dans le lien.
 *
 * La session doit être créée avec `replay: true`.
 */
export class ReplayPlayer {
  #session
  #queue
  #current = null
  /** Pas où s'arrêtent les déplacements de l'engin en cours (v6.2). */
  #stops = []
  #acc = 0
  #ticks = 0
  done = false

  /**
   * @param {import('../GameSession.js').GameSession} session
   * @param {object[]} actions journal (voir GameSession.log / ReplayCode)
   */
  constructor(session, actions) {
    this.#session = session
    const all = actions.map((a) => ({ ...a }))
    // Étapes, ordres des généraux et fins de tour (v6.0), victoires sans tir (v6.2) :
    // la partie les exécute elle-même, au pas enregistré.
    session.preloadRecorded?.(all)
    this.#queue = all.filter((a) => a.k !== 'g' && a.k !== 'b' && a.k !== 'e' && a.k !== 'i')
    session.on('end', () => (this.done = true))
  }

  /** Avance du temps réel écoulé (relecture à l'écran, à vitesse normale). */
  advance(realMs, maxTicks = 8) {
    this.#acc += Math.min(realMs, 100)
    let n = 0
    while (this.#acc >= WORLD.STEP_MS && n < maxTicks && !this.done) {
      this.#acc -= WORLD.STEP_MS
      this.tick()
      n++
    }
  }

  /** Rejoue toute la partie d'un coup (tests, calcul du score à battre). */
  runToEnd(maxTicks = 400_000) {
    while (!this.done && this.#ticks < maxTicks) this.tick()
    return this.done
  }

  /** Un pas : déclenche les gestes dus, puis avance la partie d'un pas. */
  tick() {
    if (this.done) return
    this.#ticks++
    const s = this.#session
    // Déplacements de l'engin (v6.2) : l'arrêt d'un trajet passe avant le départ
    // du suivant (le joueur relâche, puis rappuie au même pas).
    while (this.#stops.length && s.steps >= this.#stops[0]) {
      this.#stops.shift()
      s.drive(0)
    }
    // Seau d'eau (v5.8) et départs de l'engin (v6.2) : au pas enregistré, quel que soit le moment du tour.
    while ((this.#queue[0]?.k === 'w' || this.#queue[0]?.k === 'm') && s.steps >= this.#queue[0].d) {
      const a = this.#queue.shift()
      if (a.k === 'w') s.useBucket()
      else if (a.n > 0) {
        s.drive(a.v)
        this.#stops.push(a.d + a.n)
      }
    }
    const next = this.#queue[0]
    if (s.state === STATE.AIMING && next && (next.k === 'f' || next.k === 't' || next.k === 'p') && s.steps >= next.d) {
      this.#queue.shift()
      if (next.k === 'p') s.usePower(next.id)
      else {
        s.selectAmmo(next.a)
        if (next.k === 'f') s.aim(next.ang, next.pow)
        if (next.k === 't' && next.g !== undefined) {
          // v5.4 : point d'impact puis jauge, comme le joueur.
          s.placeTrebTarget(next.tx, next.ty)
          s.fire(0, { arc: next.g })
        } else s.fire()
        this.#current = next
      }
    } else if (s.state === STATE.AIMING && !next && !s.idleWinPending) {
      // Journal épuisé sans fin de partie (partie abandonnée) : la relecture s'arrête.
      this.done = true
      return
    }
    const cur = this.#current
    if (cur && s.launchPending && s.steps - s.fireStep >= cur.l) {
      s.replayLaunch({ release: cur.r })
      this.#current = null
    }
    const q = this.#queue[0]
    if (q && q.k === 'x' && s.state === STATE.FLYING && !s.launchPending && s.steps - s.spawnStep >= q.d) {
      this.#queue.shift()
      s.activate()
    }
    s.update(WORLD.STEP_MS)
  }
}
