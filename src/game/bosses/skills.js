import { Target } from '../entities/Target.js'
import { Block } from '../entities/Block.js'
import { Flyer } from '../entities/Flyer.js'
import { TARGET_TYPES } from '../entities/catalog.js'
import { WORLD } from '../physics/constants.js'
import { RAIDER_TYPE, raiderTorch } from '../levels/campaignRules.js'
import { reachable } from '../ai/Pathfinder.js'
import { SKILL_ICONS } from './generals.js'

/**
 * Les ordres des généraux (v6.0), un objet stratégie par compétence :
 *
 *  - `icon`     : pictogramme de l'annonce (voir components/ui/icons.js) ;
 *  - `canUse`   : l'ordre a-t-il un sens maintenant (renforts déjà sur place,
 *                 rien à réparer…) ? Sinon le général passe au suivant ;
 *  - `perform`  : l'effet, joué au pas de simulation enregistré (relecture
 *                 identique). Les effets « à distance » (bombe, flèches…)
 *                 partent du général et arrivent sur l'engin quelques pas
 *                 plus tard (`ctx.after`), là encore à un pas fixe.
 *
 * `ctx` : { port, general, council, def, round } — voir WarCouncil.
 */

/** Durée de vol d'un tir du général jusqu'à l'engin (pas de simulation, ≈ 0,9 s). */
export const SHELL_STEPS = 108
/** Renforts : au plus deux d'un même ordre debout en même temps. */
const MAX_SUMMONS = 2
/** Cri de guerre : résistance des défenseurs jusqu'au prochain ordre. */
export const WARCRY_BUFF = 1.6
/** Rempart de glace : trois blocs empilés devant le donjon. */
const RAMPART = Object.freeze({ W: 34, H: 52, COUNT: 3, GAP: 110 })

/** Lancer un projectile « décoratif » du général vers l'engin, puis appliquer l'effet à l'arrivée. */
function shell(ctx, kind, onArrive) {
  const g = ctx.general
  const e = ctx.port.engineSpot()
  ctx.port.particles.shell(g.x, g.y - 34, e.x, e.y - 50, SHELL_STEPS * WORLD.STEP_MS, kind)
  ctx.port.feedback({ sound: kind === 'arrows' ? 'whoosh' : 'launch', x: g.x, intensity: 0.7 })
  ctx.port.after(SHELL_STEPS, () => onArrive(e))
}

/**
 * Dessus du sol à l'abscisse x (plateau de roche, rempart, ou sol) : le
 * premier solide en descendant depuis le haut de la scène.
 */
export function surfaceAt(world, x) {
  for (let y = WORLD.GROUND_Y - 420; y < WORLD.GROUND_Y; y += 4) {
    if (world.solidAt(x, y)) return y
  }
  return WORLD.GROUND_Y
}

/** Renforts encore debout appelés par cet ordre. */
const aliveSummons = (ctx, skill) => ctx.council.summoned(skill).filter((e) => e.alive).length

/** Une place libre (ni bloc ni défenseur) pour un défenseur de cette taille, pieds en `feetY`. */
function freeSpot(world, x, feetY, type) {
  const t = TARGET_TYPES[type]
  const cy = feetY - t.h / 2 - 1
  for (const [dx, dy] of [[0, 0], [-t.w / 2, -t.h / 3], [t.w / 2, -t.h / 3], [0, -t.h / 2 + 4]]) {
    if (world.solidAt(x + dx, cy + dy)) return null
  }
  for (const e of world.entities()) {
    if (e.kind === 'target' && e.alive && Math.abs(e.x - x) < (e.width + t.w) / 2 + 2 && Math.abs(e.y - cy) < (e.height + t.h) / 2) return null
  }
  return { x, y: cy }
}

/** Fait apparaître un défenseur (renfort) et le compte dans les appelés de l'ordre. */
function summon(ctx, skill, def) {
  const unit = ctx.port.world.add(new Target(def, ctx.port.hpFactor))
  ctx.council.remember(skill, unit)
  ctx.port.particles.dust(def.x, def.y + 20, 10)
  return unit
}

/** Où poster un pillard : devant le château, sur le sol ou le plateau (hors des douves). */
function raiderSpot(ctx, type) {
  const world = ctx.port.world
  const x = ctx.port.castleLeft() - 70
  if (world.terrain?.at(x)) return null
  return freeSpot(world, x, surfaceAt(world, x), type)
}

/** Pillard envoyé contre l'engin, posté au pied du château. */
function sendRaider(ctx, skill, raid) {
  if (aliveSummons(ctx, skill) > 0) return false
  const type = RAIDER_TYPE[raid] ?? 'soldier'
  const spot = raiderSpot(ctx, type)
  if (!spot) return false
  const unit = summon(ctx, skill, { type, x: spot.x, y: spot.y, raid, ...(raiderTorch(raid) ? { torch: true } : {}) })
  unit.facing = -1
  return true
}

/** Le pillard peut-il être posté (place libre au pied du château) ? */
function raiderFits(ctx, skill, raid) {
  if (aliveSummons(ctx, skill) > 0) return false
  return Boolean(raiderSpot(ctx, RAIDER_TYPE[raid] ?? 'soldier'))
}

/** Blocs du château abîmés (hors roche), du plus atteint au moins atteint. */
function damagedBlocks(world) {
  return world
    .filter((e) => e.kind === 'block' && e.alive && !e.terrain && !e.construct && !(e.burning > 0) && e.damageRatio >= 0.12)
    .sort((a, b) => b.damageRatio - a.damageRatio || a.id - b.id)
}

/** Vent de face (vers le joueur) pour le tour suivant, plus ou moins fort. */
function headwind(ctx, strength) {
  ctx.port.windNext(-strength)
  const e = ctx.port.engineSpot()
  for (let i = 0; i < 4; i++) ctx.port.particles.dust(e.x + 260 + i * 120, WORLD.GROUND_Y - 40 - i * 30, 14, '214,190,140')
  ctx.port.feedback({ sound: 'gust', x: e.x + 300, intensity: 1, caption: 'gust' })
}

export const SKILLS = Object.freeze({
  /** Charpente : il remet en état ses murs les plus abîmés. */
  rebuild: {
    icon: SKILL_ICONS.rebuild,
    canUse: (ctx) => damagedBlocks(ctx.port.world).length > 0,
    perform(ctx) {
      for (const b of damagedBlocks(ctx.port.world).slice(0, 3)) {
        b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.5)
        ctx.port.particles.spark(b.x, b.y)
        ctx.port.particles.spark(b.x + 6, b.y - 8)
      }
      ctx.port.feedback({ sound: 'hammer', x: ctx.general.x, intensity: 1 })
    },
  },

  /** Cri de guerre : ses hommes encaissent bien mieux jusqu'à son prochain ordre. */
  warcry: {
    icon: SKILL_ICONS.warcry,
    canUse: () => true,
    perform(ctx) {
      for (const t of ctx.port.world.filter((e) => e.kind === 'target' && e.alive)) t.buff = WARCRY_BUFF
      ctx.council.warcry = true
      ctx.port.particles.shockwave(ctx.general.x, ctx.general.y, 220)
      ctx.port.feedback({ sound: 'horn', x: ctx.general.x, intensity: 1 })
    },
  },

  /** Mur de boucliers : deux pavoisiers viennent se poster devant lui. */
  shieldWall: {
    icon: SKILL_ICONS.shieldWall,
    canUse(ctx) {
      if (aliveSummons(ctx, 'shieldWall') >= MAX_SUMMONS) return false
      const g = ctx.general
      const feet = g.y + g.height / 2
      return [-46, -88, 46].some((dx) => freeSpot(ctx.port.world, g.x + dx, feet, 'shieldbearer'))
    },
    perform(ctx) {
      const g = ctx.general
      const feet = g.y + g.height / 2
      let placed = 0
      for (const dx of [-46, -88, 46]) {
        if (placed >= MAX_SUMMONS - aliveSummons(ctx, 'shieldWall')) break
        const spot = freeSpot(ctx.port.world, g.x + dx, feet, 'shieldbearer')
        if (!spot) continue
        const unit = summon(ctx, 'shieldWall', { type: 'shieldbearer', x: spot.x, y: spot.y })
        unit.facing = -1
        placed++
      }
      ctx.port.feedback({ sound: 'iron', x: g.x, intensity: 0.8 })
    },
  },

  /** Saboteur : un pillard au marteau court frapper l'engin. */
  saboteur: {
    icon: SKILL_ICONS.saboteur,
    canUse: (ctx) => raiderFits(ctx, 'saboteur', 'blow'),
    perform: (ctx) => sendRaider(ctx, 'saboteur', 'blow'),
  },

  /** Pillard (mercenaire, garde noire) : il court incendier ou écraser l'engin. */
  hireRaider: {
    icon: SKILL_ICONS.hireRaider,
    canUse: (ctx) => raiderFits(ctx, 'hireRaider', ctx.def.raid ?? 'fire'),
    perform: (ctx) => sendRaider(ctx, 'hireRaider', ctx.def.raid ?? 'fire'),
  },

  /** Bombe : un boulet de poudre s'abat sur l'engin (dégâts bruts). */
  bomb: {
    icon: SKILL_ICONS.bomb,
    canUse: () => true,
    perform(ctx) {
      shell(ctx, 'bomb', (e) => {
        ctx.port.condition.hit(16)
        ctx.port.particles.explosion(e.x, e.y - 40, 90)
        ctx.port.feedback({ sound: 'explosion', x: e.x, intensity: 0.9, caption: 'general.bomb', haptic: 'impact' })
      })
    },
  },

  /** Pot de feu : l'engin s'embrase. */
  firePot: {
    icon: SKILL_ICONS.firePot,
    canUse: () => true,
    perform(ctx) {
      shell(ctx, 'firepot', (e) => {
        ctx.port.condition.ignite(1)
        ctx.port.particles.flame(e.x, e.y - 40, 60, 1.4)
        ctx.port.feedback({ sound: 'fire', x: e.x, intensity: 1, caption: 'general.firePot' })
      })
    },
  },

  /** Couvre-feu : la nuit tombe sur le camp, plus d'aide à la visée au prochain tir. */
  curfew: {
    icon: SKILL_ICONS.curfew,
    canUse: () => true,
    perform(ctx) {
      ctx.port.curfew()
      ctx.port.feedback({ sound: 'gust', x: ctx.general.x, intensity: 0.6, caption: 'general.curfew' })
    },
  },

  /** Flèches enflammées : une volée sur l'engin, qui prend feu. */
  fireArrows: {
    icon: SKILL_ICONS.fireArrows,
    canUse: () => true,
    perform(ctx) {
      shell(ctx, 'arrows', (e) => {
        ctx.port.condition.ignite(1)
        ctx.port.particles.flame(e.x - 20, e.y - 30, 40, 1)
        ctx.port.particles.flame(e.x + 25, e.y - 50, 40, 1)
        ctx.port.feedback({ sound: 'fire', x: e.x, intensity: 0.9, caption: 'general.fireArrows' })
      })
    },
  },

  /** Repli : il court se mettre à l'abri à l'autre bout de son château. */
  flee: {
    icon: SKILL_ICONS.flee,
    canUse: (ctx) => Boolean(fleeGoal(ctx)),
    perform(ctx) {
      const goal = fleeGoal(ctx)
      if (!goal) return
      ctx.general.retreat = goal
      ctx.port.feedback({ sound: 'whoosh', x: ctx.general.x, intensity: 0.5 })
    },
  },

  /** Tempête de sable : vent de face très fort au prochain tir. */
  sandstorm: {
    icon: SKILL_ICONS.sandstorm,
    canUse: () => true,
    perform: (ctx) => headwind(ctx, 0.85),
  },

  /** Faucons : deux oiseaux de proie tournent devant le donjon et arrêtent les tirs. */
  falcons: {
    icon: SKILL_ICONS.falcons,
    canUse: (ctx) => aliveSummons(ctx, 'falcons') < MAX_SUMMONS,
    perform(ctx) {
      const g = ctx.general
      const missing = MAX_SUMMONS - aliveSummons(ctx, 'falcons')
      for (let i = 0; i < missing; i++) {
        const f = ctx.port.world.add(new Flyer({ type: 'crow', x: g.x - 200 - i * 110, y: Math.min(g.y - 160, WORLD.GROUND_Y - 330) - i * 60, range: 130, period: 3800 + i * 900, phase: (ctx.round * 0.37 + i * 0.5) % 1 }))
        f.falcon = true
        ctx.council.remember('falcons', f)
        ctx.port.particles.feathers(f.x, f.y, '#8a7a62', 8)
      }
      ctx.port.feedback({ sound: 'flyer', x: g.x - 200, intensity: 1 })
    },
  },

  /** Rochers : il fait rouler des blocs de roche sur l'engin (dégâts bruts). */
  boulders: {
    icon: SKILL_ICONS.boulders,
    canUse: () => true,
    perform(ctx) {
      shell(ctx, 'boulder', (e) => {
        ctx.port.condition.hit(13)
        ctx.port.particles.debris(e.x, e.y - 30, 'stone', 60)
        ctx.port.feedback({ sound: 'stone', x: e.x, intensity: 1, caption: 'general.boulders', haptic: 'impact' })
      })
    },
  },

  /** Souffle glacé : le bras de l'engin gèle (il tire moins fort jusqu'au dégel). */
  frostBreath: {
    icon: SKILL_ICONS.frostBreath,
    canUse: (ctx) => !ctx.port.condition.frozen,
    perform(ctx) {
      shell(ctx, 'frost', (e) => {
        ctx.port.condition.freeze()
        ctx.port.particles.frost(e.x, e.y - 40, 110)
        ctx.port.feedback({ sound: 'frost', x: e.x, intensity: 1, caption: 'general.frostBreath' })
      })
    },
  },

  /** Rempart de glace : un mur de glace se dresse devant son donjon. */
  iceRampart: {
    icon: SKILL_ICONS.iceRampart,
    canUse: (ctx) => aliveSummons(ctx, 'iceRampart') === 0 && rampartSpot(ctx) !== null,
    perform(ctx) {
      const x = rampartSpot(ctx)
      if (x === null) return
      const floor = surfaceAt(ctx.port.world, x)
      for (let i = 0; i < RAMPART.COUNT; i++) {
        const b = ctx.port.world.add(new Block({ material: 'ice', x, y: floor - RAMPART.H / 2 - i * RAMPART.H, w: RAMPART.W, h: RAMPART.H, shape: 'rect' }))
        // Campagne héroïque (v6.2) : un rempart aussi solide que le château.
        if (ctx.port.blockHpFactor !== 1) {
          b.maxHp *= ctx.port.blockHpFactor
          b.hp = b.maxHp
        }
        ctx.council.remember('iceRampart', b)
      }
      ctx.port.particles.frost(x, floor - 80, 90)
      ctx.port.feedback({ sound: 'frost', x, intensity: 1, caption: 'general.iceRampart' })
    },
  },

  /** Foudre : l'éclair frappe l'engin (dégâts et feu). */
  lightning: {
    icon: SKILL_ICONS.lightning,
    canUse: () => true,
    perform(ctx) {
      const e = ctx.port.engineSpot()
      ctx.port.particles.lightning(e.x, e.y - 40, -500)
      ctx.port.feedback({ sound: 'thunder', x: e.x, intensity: 1, caption: 'general.lightning', haptic: 'impact' })
      ctx.port.after(12, () => {
        ctx.port.condition.hit(9)
        ctx.port.condition.ignite(1)
      })
    },
  },

  /** Ouragan : vent de face déchaîné au prochain tir. */
  hurricane: {
    icon: SKILL_ICONS.hurricane,
    canUse: () => true,
    perform: (ctx) => headwind(ctx, 1),
  },
})

/**
 * Où courir se mettre à l'abri : le point atteignable le plus éloigné (au
 * moins 140 px), de préférence à l'écart du dernier impact. Null s'il n'y en a pas.
 */
export function fleeGoal(ctx) {
  const g = ctx.general
  const nav = ctx.port.world.units.nav
  if (!nav) return null
  const ledge = nav.ledgeAt(g.x, g.y + g.height / 2)
  if (!ledge) return null
  let best = null
  for (const [id, r] of reachable(nav, { x: g.x, ledge: ledge.id }, 900)) {
    const l = nav.ledge(id)
    if (l.terrain && l.y >= WORLD.GROUND_Y - 1) continue // pas dans la plaine, devant le château
    for (const x of [l.x0 + g.width / 2 + 4, l.x1 - g.width / 2 - 4]) {
      if (x < l.x0 || x > l.x1) continue
      const d = Math.abs(x - g.x)
      if (d < 140) continue
      const score = d - r.cost * 0.2
      if (!best || score > best.score) best = { x, ledge: id, y: l.y, score }
    }
  }
  return best ? { x: best.x, y: best.y } : null
}

/** Emplacement du rempart de glace : sur le sol ou le plateau, devant le château, hors des douves. */
function rampartSpot(ctx) {
  const x = ctx.port.castleLeft() - RAMPART.GAP
  const world = ctx.port.world
  if (world.terrain?.at(x)) return null
  const floor = surfaceAt(world, x)
  for (let i = 0; i < RAMPART.COUNT; i++) {
    if (world.solidAt(x, floor - RAMPART.H / 2 - i * RAMPART.H - 2)) return null
  }
  return x
}
