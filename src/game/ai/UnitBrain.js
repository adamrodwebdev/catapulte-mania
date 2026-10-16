import { SeededRandom } from '../../core/utils/SeededRandom.js'
import { findPath, reachable } from './Pathfinder.js'
import { Perception } from './Perception.js'
import { GAITS, steer } from './Steering.js'

/**
 * Cerveau d'un défenseur (v5.8) : choisit un but, trouve le chemin, marche.
 *
 * Chaque type de défenseur a sa liste de comportements, par ordre de
 * priorité (patron Stratégie) ; à chaque décision, le premier qui a quelque
 * chose à proposer l'emporte :
 *
 *  - `panic`  : en feu, il court droit devant lui (il n'en a plus pour longtemps) ;
 *  - `raid`   : le pillard (v5.8), dès le premier tir, court à l'engin du joueur
 *               (pendant le vol des tirs seulement) et l'attaque ; si le terrain
 *               lui barre la route, il jette un pont ou dresse une échelle ;
 *  - `dodge`  : l'éclaireur voit le projectile arriver sur lui et file à l'abri ;
 *  - `cover`  : les autres réagissent plus lentement et s'écartent d'un pas pressé ;
 *  - `flee`   : un feu près de lui sur sa corniche : il s'en écarte ;
 *  - `repair` : le sapeur va réparer le bloc le plus abîmé qu'il peut atteindre ;
 *  - `guard`  : le pavoisier fait front, son pavois tourné vers l'engin ;
 *  - `patrol` : la ronde, d'un bout à l'autre de son secteur, avec des haltes.
 *
 * Toutes les décisions viennent de la géométrie et d'un hasard à graine fixe
 * (numéro du défenseur dans le niveau) : une partie rejouée est identique.
 */

/** Pas de simulation entre deux décisions (les mouvements, eux, sont suivis à chaque pas). */
export const THINK_EVERY = 8
/** Éclaireur : délai de réaction (pas) et rayon de menace autour du point de chute (px). */
export const DODGE = Object.freeze({ REACT: 24, RADIUS: 110, BUDGET: 320 })
/** Défenseurs ordinaires : réaction plus lente, menace plus proche, pas pressé. */
export const COVER = Object.freeze({ REACT: 60, RADIUS: 70, BUDGET: 160 })
/** Sapeur : durée du travail (ms), part de solidité rendue, dégâts minimaux pour intervenir. */
export const REPAIR = Object.freeze({ WORK_MS: 1500, AMOUNT: 0.6, MIN_DAMAGE: 0.18, BUDGET: 700, REACH: 22 })
/**
 * Pillards (v5.8) : ce qu'ils portent, combien de coups ils donnent avant que
 * les servants de l'engin ne les repoussent, à quel rythme (ms), et leur allure.
 */
export const RAID = Object.freeze({
  STRIKES: { fire: 1, frost: 1, blow: 3, smash: 3 },
  EVERY_MS: { fire: 1100, frost: 1100, blow: 1300, smash: 1600 },
  GAIT: { scout: 'charge', soldier: 'sprint', engineer: 'sprint', ogre: 'heavy' },
  /** Chemin coupé (éboulis) : on réessaie un peu plus tard (ms). */
  RETRY_MS: 2500,
})
/** Fuite devant le feu : distance d'alerte (px). */
const FIRE_ALERT = 95

/** Comportements de chaque type, par priorité. */
export const BEHAVIOURS = Object.freeze({
  soldier: ['panic', 'raid', 'cover', 'flee', 'patrol'],
  knight: ['panic', 'cover', 'flee', 'patrol'],
  king: ['panic', 'flee'],
  ogre: ['raid', 'patrol'],
  scout: ['panic', 'raid', 'dodge', 'flee', 'patrol'],
  shieldbearer: ['panic', 'guard'],
  bannerman: ['panic', 'flee'],
  // v6.0 : un général se replie sur ordre, s'abrite des tirs qu'il voit venir.
  general: ['panic', 'retreat', 'cover', 'flee'],
  engineer: ['panic', 'raid', 'cover', 'flee', 'repair', 'patrol'],
})

export class UnitBrain {
  /** @type {import('../entities/Target.js').Target} */
  unit
  #rng
  /** Plan en cours : { kind, goal: { x, ledge }, gait, path, until?, data? } */
  plan = null
  #think = 0
  #pauseUntil = 0
  #patrolSide
  /** Projectiles déjà esquivés (une esquive par tir). */
  #dodged = new Set()
  /** Fin du travail du sapeur (ms de monde), bloc en réparation. */
  #workUntil = 0
  #workOn = null
  /** Facteur de vitesse propre (on ne marche pas tous du même pas). */
  speedScale
  /** Pillard (v5.8) : charge lancée, assaut en cours, coups donnés, chemin coupé jusqu'à. */
  #raidStarted = false
  #assault = null
  #raidBlockedUntil = 0

  /**
   * @param {import('../entities/Target.js').Target} unit
   * @param {number} index rang du défenseur dans le niveau (graine stable)
   */
  constructor(unit, index) {
    this.unit = unit
    this.#rng = new SeededRandom(1009 + index * 7919)
    this.#patrolSide = index % 2 ? 1 : -1
    this.speedScale = (0.9 + this.#rng.next() * 0.2) / Math.sqrt(unit.baseToughness ?? 1)
    this.#think = index % THINK_EVERY
  }

  get working() {
    return this.#workOn !== null || this.#assault !== null
  }

  /** Pillard en route ou à l'assaut de l'engin. */
  get raiding() {
    return this.#raidStarted
  }

  /**
   * Un pas de simulation. Renvoie la vitesse horizontale voulue (0 : à l'arrêt).
   * @param {object} ctx voir UnitDirector#context
   */
  step(ctx) {
    const u = this.unit
    // Travail en cours (sapeur) : on reste sur place jusqu'à la fin.
    if (this.#workOn) {
      if (!this.#workOn.alive || ctx.threatened) {
        this.#workOn = null
      } else if (ctx.time >= this.#workUntil) {
        ctx.repair(u, this.#workOn)
        this.#workOn = null
        this.plan = null
      }
      return 0
    }
    // Assaut (pillard arrivé à l'engin) : il frappe à son rythme, jusqu'à ce que
    // les servants le repoussent. S'il a été bousculé, il revient.
    if (this.#assault) {
      const a = this.#assault
      if (Math.abs(u.x - a.x) > 30) {
        this.#assault = null
      } else {
        u.facing = Math.sign(a.engineX - u.x) || u.facing
        if (ctx.time >= a.nextAt) {
          a.count++
          a.nextAt = ctx.time + RAID.EVERY_MS[u.raid]
          if (u.type === 'ogre') u.swatAt = ctx.time
          ctx.strike(u)
          if (a.count >= RAID.STRIKES[u.raid]) ctx.repel(u)
        }
        return 0
      }
    }
    // Rien à faire et pas encore l'heure de réfléchir : on ne calcule rien.
    const thinking = --this.#think <= 0
    if (!this.plan && !thinking) return 0
    const ledge = ctx.nav.ledgeAt(u.x, u.y + u.height / 2)
    if (!ledge) {
      this.plan = null
      return 0
    }
    // Le graphe a été reconstruit (la structure a bougé) : on retrouve le but et
    // on recalcule le chemin (les numéros de corniche ont changé).
    if (this.plan && this.plan.nav !== ctx.navVersion) this.#repath(ctx, ledge)
    if (thinking) {
      this.#think = THINK_EVERY
      this.#decide(ctx, ledge)
    }
    const plan = this.plan
    if (!plan) return 0
    // La charge ne progresse que pendant le vol des tirs (tour par tour).
    if (plan.kind === 'raid' && !ctx.marching) return 0
    // Point de passage courant : dès qu'on a mis le pied sur la corniche d'un
    // point de passage, on vise le suivant.
    while (plan.path.length > 1 && plan.path[0].ledge === ledge.id) plan.path.shift()
    const wp = plan.path[0]
    // Ouvrage (v5.8) : il faut d'abord jeter un pont, dresser une échelle, ou y grimper.
    if (wp.link?.kind && wp.ledge !== ledge.id) return this.#work(ctx, ledge, wp.link, plan)
    const next = wp.ledge === ledge.id ? null : ctx.nav.ledge(wp.ledge)
    const span = next ? { x0: Math.min(ledge.x0, next.x0), x1: Math.max(ledge.x1, next.x1) } : ledge
    const goalX = next ? wp.x + Math.sign(wp.x - u.x || 1) * (u.width / 2 + 4) : wp.x
    // Un pillard qui charge, un général qui se replie : ils passent entre leurs camarades.
    const pushing = plan.kind === 'raid' || plan.kind === 'retreat'
    const r = steer({ x: u.x, vx: ctx.vx(u), halfW: u.width / 2 }, goalX, span, GAITS[plan.gait], {
      allies: pushing ? [] : ctx.alliesOn(ledge.id, u),
      blocked: (dir) => ctx.blocked(u, dir),
      speedScale: plan.gait === 'walk' ? this.speedScale : 1,
    })
    if (r.arrived && !next) this.#arrive(ctx, plan)
    if (r.vx) this.unit.facing = Math.sign(r.vx)
    return r.vx
  }

  #repath(ctx, ledge) {
    const plan = this.plan
    const target = ctx.nav.ledgeAt(plan.goal.x, plan.goal.y)
    const path = target && findPath(ctx.nav, { x: this.unit.x, ledge: ledge.id }, { x: plan.goal.x, ledge: target.id }, { penalty: ctx.penalty, build: plan.kind === 'raid' })
    if (!path) {
      this.plan = null
      return
    }
    plan.goal = { ...plan.goal, ledge: target.id }
    plan.path = path.waypoints
    plan.nav = ctx.navVersion
  }

  /**
   * Devant l'obstacle : on rejoint le pied de l'ouvrage, puis on bâtit (le
   * UnitDirector compte l'avancement) ou, l'échelle dressée, on grimpe.
   */
  #work(ctx, ledge, link, plan) {
    const u = this.unit
    // Le pied de l'ouvrage, là où ce défenseur peut tenir : un ogre, large,
    // reste plus loin du bord qu'un éclaireur (même marge que le pilotage).
    const margin = u.width / 2 + 2
    const lo = ledge.x0 + margin
    const hi = ledge.x1 - margin
    const stand = lo > hi ? (ledge.x0 + ledge.x1) / 2 : Math.max(lo, Math.min(hi, link.stand))
    if (Math.abs(u.x - stand) > 6) {
      const r = steer({ x: u.x, vx: ctx.vx(u), halfW: u.width / 2 }, stand, ledge, GAITS[plan.gait], {
        allies: [],
        blocked: (dir) => ctx.blocked(u, dir),
      })
      if (r.vx) u.facing = Math.sign(r.vx)
      return r.vx
    }
    u.facing = Math.sign((link.exitX ?? link.x) - u.x) || u.facing
    if (link.kind === 'ladder' && link.built) ctx.climb(u, link)
    else ctx.build(u, link)
    return 0
  }

  /** But atteint : halte de ronde, ou début du travail. */
  #arrive(ctx, plan) {
    if (plan.kind === 'patrol') {
      // Halte : on regarde autour de soi, puis on repart de l'autre côté.
      this.#pauseUntil = ctx.time + 450 + this.#rng.next() * 1300
      this.#patrolSide = -this.#patrolSide
    } else if (plan.kind === 'raid') {
      const engine = ctx.engines[0]
      this.#assault = { x: this.unit.x, engineX: engine?.x ?? this.unit.x - 1, count: 0, nextAt: ctx.time + 350 }
    } else if (plan.kind === 'retreat') {
      this.unit.retreat = null
      ctx.solid(this.unit)
    } else if (plan.kind === 'repair' && plan.data?.alive) {
      this.#workOn = plan.data
      this.#workUntil = ctx.time + REPAIR.WORK_MS
      this.unit.facing = Math.sign(plan.data.x - this.unit.x) || this.unit.facing
      ctx.emit('repair', { entity: this.unit, block: plan.data })
    }
    this.plan = null
  }

  #decide(ctx, ledge) {
    const u = this.unit
    for (const kind of BEHAVIOURS[u.type] ?? []) {
      const intent = this[`propose_${kind}`]?.(ctx, ledge)
      if (intent === undefined) continue
      // Un comportement prioritaire en cours n'est pas interrompu par un moins prioritaire.
      if (intent === null) {
        if (this.plan?.kind === kind) this.plan = null
        continue
      }
      if (this.plan?.kind === kind && this.plan.goal.ledge === intent.goal.ledge && Math.abs(this.plan.goal.x - intent.goal.x) < 6) return
      const path = findPath(ctx.nav, { x: u.x, ledge: ledge.id }, intent.goal, { penalty: ctx.penalty, build: kind === 'raid' })
      if (!path) continue
      // Le but est aussi gardé en coordonnées du monde (y : hauteur de la corniche visée).
      const goal = { ...intent.goal, y: ctx.nav.ledge(intent.goal.ledge).y }
      this.plan = { ...intent, goal, path: path.waypoints, nav: ctx.navVersion }
      return
    }
    this.plan = null
  }

  /* ---------- Comportements (renvoient un intent, null ou undefined) ---------- */

  /** En feu : course éperdue vers le bout le plus éloigné de sa corniche. */
  propose_panic(ctx, ledge) {
    const u = this.unit
    // En feu, ou piqué par un essaim (v6.1) : il court droit devant lui.
    if (!(u.burning > 0) && !(u.panicUntil > ctx.time)) return null
    const x = u.x - ledge.x0 > ledge.x1 - u.x ? ledge.x0 : ledge.x1
    return { kind: 'panic', goal: { x, ledge: ledge.id }, gait: 'sprint' }
  }

  /**
   * Pillard : dès le premier tir, il court au flanc de l'engin du joueur. Pas
   * de chemin (douves, lave, montagne, éboulis) : il reste à son poste et
   * réessaie plus tard.
   */
  propose_raid(ctx, ledge) {
    const u = this.unit
    if (!u.raid || !ctx.armed || ctx.time < this.#raidBlockedUntil) return null
    const engine = ctx.engines[0]
    if (!engine) return null
    if (this.plan?.kind === 'raid') return this.plan
    const x = engine.front + engine.dir * (u.width / 2 + 8)
    const goal = ctx.nav.ledgeAt(x, ctx.groundY)
    if (!goal || !findPath(ctx.nav, { x: u.x, ledge: ledge.id }, { x, ledge: goal.id }, { build: true })) {
      this.#raidBlockedUntil = ctx.time + RAID.RETRY_MS
      return null
    }
    if (!this.#raidStarted) {
      this.#raidStarted = true
      u.raiding = true
      ctx.passThrough(u)
      ctx.emit('raid', { entity: u })
    }
    return { kind: 'raid', goal: { x, ledge: goal.id }, gait: RAID.GAIT[u.type] ?? 'sprint' }
  }

  /** Général (v6.0) : sur son propre ordre de repli, il court à l'autre bout de son château. */
  propose_retreat(ctx) {
    const u = this.unit
    if (!u.retreat) return null
    if (this.plan?.kind === 'retreat') return this.plan
    const goal = ctx.nav.ledgeAt(u.retreat.x, u.retreat.y)
    if (!goal) {
      u.retreat = null
      return null
    }
    // Il se faufile entre ses gardes le temps du repli (voir #arrive).
    ctx.passThrough(u)
    return { kind: 'retreat', goal: { x: u.retreat.x, ledge: goal.id }, gait: 'sprint' }
  }

  /** Éclaireur : le projectile tombe près de lui → il file à l'endroit sûr le plus proche. */
  propose_dodge(ctx, ledge) {
    return this.#evade(ctx, ledge, 'dodge', DODGE, 'sprint')
  }

  /** Défenseur ordinaire : il voit (plus tard) le tir arriver et s'écarte d'un pas pressé. */
  propose_cover(ctx, ledge) {
    return this.#evade(ctx, ledge, 'cover', COVER, 'hurry')
  }

  #evade(ctx, ledge, kind, params, gait) {
    const u = this.unit
    if (this.plan?.kind === kind) return this.plan
    for (const t of ctx.perception.threats(params.REACT)) {
      if (this.#dodged.has(t.id)) continue
      const land = Perception.landing(t, u.y)
      if (!land || land.steps < 6 || Math.abs(land.x - u.x) > params.RADIUS) continue
      this.#dodged.add(t.id)
      const spot = this.#safest(ctx, ledge, land.x, params.BUDGET)
      if (!spot) return null
      if (kind === 'dodge') ctx.emit('dodge', { entity: u })
      return { kind, goal: spot, gait }
    }
    return null
  }

  /** Un feu sur sa corniche, tout près : on s'en éloigne d'un pas pressé. */
  propose_flee(ctx, ledge) {
    const u = this.unit
    const fire = ctx.fires.find((f) => Math.abs(f.x - u.x) < FIRE_ALERT && Math.abs(f.y - u.y) < 70)
    if (!fire) return this.plan?.kind === 'flee' ? this.plan : null
    const spot = this.#safest(ctx, ledge, fire.x, 220)
    return spot && Math.abs(spot.x - u.x) > 8 ? { kind: 'flee', goal: spot, gait: 'hurry' } : null
  }

  /** Sapeur : au calme, il va réparer le bloc le plus abîmé qu'il peut atteindre. */
  propose_repair(ctx, ledge) {
    const u = this.unit
    if (!ctx.calm) return null
    if (this.plan?.kind === 'repair' && this.plan.data.alive) return this.plan
    const reach = reachable(ctx.nav, { x: u.x, ledge: ledge.id }, REPAIR.BUDGET)
    let best = null
    for (const b of ctx.damaged) {
      for (const [id, r] of reach) {
        const l = ctx.nav.ledge(id)
        // Il faut pouvoir toucher le bloc : à portée de bras, depuis le dessus ou à côté.
        if (l.y < b.minY - 6 || l.y > b.maxY + 30) continue
        const x = Math.max(l.x0 + u.width / 2 + 2, Math.min(l.x1 - u.width / 2 - 2, (b.minX + b.maxX) / 2))
        const gap = x < b.minX ? b.minX - x : x > b.maxX ? x - b.maxX : 0
        if (gap > REPAIR.REACH + u.width / 2) continue
        const score = b.entity.damageRatio * 600 - r.cost - Math.abs(x - r.x)
        if (!best || score > best.score) best = { score, goal: { x, ledge: id }, block: b.entity }
      }
    }
    return best ? { kind: 'repair', goal: best.goal, gait: 'hurry', data: best.block } : null
  }

  /** Pavoisier : il ne bouge pas, pavois tourné vers l'engin. */
  propose_guard(ctx) {
    this.unit.facing = ctx.frontOf(this.unit)
    return null
  }

  /** Ronde : d'un bout à l'autre de son secteur, avec des haltes. */
  propose_patrol(ctx, ledge) {
    const u = this.unit
    if (!(u.patrol > 0) || ctx.time < this.#pauseUntil) return null
    if (this.plan?.kind === 'patrol') return this.plan
    const reach = reachable(ctx.nav, { x: u.x, ledge: ledge.id }, u.patrol * 2.5)
    // Le point le plus loin, de ce côté, sans quitter son secteur (home ± patrol).
    let goal = null
    for (const [id] of reach) {
      const l = ctx.nav.ledge(id)
      const edge = this.#patrolSide < 0 ? l.x0 + u.width / 2 + 3 : l.x1 - u.width / 2 - 3
      const x = Math.max(u.home - u.patrol, Math.min(u.home + u.patrol, edge))
      if (x < l.x0 || x > l.x1) continue
      if (!goal || (x - goal.x) * this.#patrolSide > 0) goal = { x, ledge: id }
    }
    if (!goal || Math.abs(goal.x - u.x) < 6) {
      this.#patrolSide = -this.#patrolSide
      this.#pauseUntil = ctx.time + 300 + this.#rng.next() * 600
      return null
    }
    // Parfois, une halte à mi-chemin pour regarder au loin.
    if (this.#rng.next() < 0.15) goal = { x: (u.x + goal.x) / 2, ledge: goal.ledge }
    return { kind: 'patrol', goal, gait: 'walk' }
  }

  /**
   * Le point atteignable le plus éloigné du danger en `fromX`, pour un coût
   * raisonnable (on préfère un abri proche à une longue course).
   */
  #safest(ctx, ledge, fromX, budget = DODGE.BUDGET) {
    const u = this.unit
    let best = null
    for (const [id, r] of reachable(ctx.nav, { x: u.x, ledge: ledge.id }, budget, { penalty: ctx.penalty })) {
      const l = ctx.nav.ledge(id)
      // Les deux bouts de la corniche, et quelques foulées de part et d'autre de l'entrée.
      const candidates = [l.x0 + u.width / 2 + 3, l.x1 - u.width / 2 - 3]
      for (const d of [70, 140, 210]) candidates.push(r.x - d, r.x + d)
      for (const x of candidates) {
        if (x < l.x0 + u.width / 2 + 3 || x > l.x1 - u.width / 2 - 3) continue
        const cost = r.cost + Math.abs(x - r.x)
        const score = Math.min(Math.abs(x - fromX), 220) - cost * 0.25 - Math.abs(l.y - ledge.y) * 0.3
        if (!best || score > best.score) best = { score, x, ledge: id }
      }
    }
    return best && best.score > Math.min(Math.abs(u.x - fromX), 220) ? { x: best.x, ledge: best.ledge } : null
  }
}
