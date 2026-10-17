import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NavGraph, subtract, MIN_WIDTH } from '../src/game/ai/NavGraph.js'
import { findPath, reachable, MinHeap } from '../src/game/ai/Pathfinder.js'
import { steer, GAITS } from '../src/game/ai/Steering.js'
import { Perception } from '../src/game/ai/Perception.js'
import { EventBus } from '../src/core/utils/EventBus.js'
import { PhysicsWorld } from '../src/game/physics/PhysicsWorld.js'
import { Block } from '../src/game/entities/Block.js'
import { Target } from '../src/game/entities/Target.js'
import { Barrel } from '../src/game/entities/Barrel.js'
import { Projectile } from '../src/game/entities/Projectile.js'
import { WORLD } from '../src/game/physics/constants.js'
import { rosterFor } from '../src/game/levels/LevelCurve.js'
import { LevelRepository } from '../src/game/levels/LevelRepository.js'
import Matter from 'matter-js'

const G = 900
const box = (minX, maxX, minY, maxY, flat = true) => ({ minX, maxX, minY, maxY, flat })

/* ---------- Graphe de navigation ---------- */

test('navigation : soustraction d’intervalles', () => {
  assert.deepEqual(subtract(0, 100, [[20, 30], [60, 70]]), [[0, 20], [30, 60], [70, 100]])
  assert.deepEqual(subtract(0, 100, [[-10, 200]]), [])
})

test('navigation : un mur posé sur un plancher coupe la pièce en deux', () => {
  // Plancher 1000..1300 à y = 700, mur 1140..1160 posé dessus.
  const nav = NavGraph.build({ solids: [box(1000, 1300, 700, 720), box(1140, 1160, 600, 700)], groundY: G, left: 0, right: 2000 })
  const floors = nav.ledges.filter((l) => l.y === 700)
  assert.deepEqual(floors.map((l) => [Math.round(l.x0), Math.round(l.x1)]), [[1000, 1139], [1161, 1300]])
  // Le dessus du mur (20 px) est trop étroit pour s’y tenir.
  assert.ok(!nav.ledges.some((l) => l.y === 600))
  assert.ok(nav.ledges.every((l) => l.x1 - l.x0 >= MIN_WIDTH))
})

test('navigation : planches bout à bout fusionnées, lac et lave exclus du sol', () => {
  const nav = NavGraph.build({ solids: [box(1000, 1100, 700, 720), box(1100, 1200, 700, 720)], groundY: G, hazards: [{ x0: 500, x1: 700 }], left: 0, right: 2000 })
  assert.equal(nav.ledges.filter((l) => l.y === 700).length, 1)
  const ground = nav.ledges.filter((l) => l.ground)
  assert.ok(ground.some((l) => l.x1 <= 500) && ground.some((l) => l.x0 >= 700))
  assert.equal(nav.ledgeAt(600, G), null, 'pas de corniche au-dessus du lac')
})

test('navigation : marche franchissable dans les deux sens, descente seulement vers le bas', () => {
  const nav = NavGraph.build({
    solids: [box(1000, 1100, 700, 720), box(1100, 1200, 704, 720), box(1200, 1300, 716, 730)],
    groundY: G, left: 0, right: 900,
  })
  const a = nav.ledgeAt(1050, 700)
  const b = nav.ledgeAt(1150, 704)
  const c = nav.ledgeAt(1250, 716)
  assert.ok(nav.neighbours(a.id).some((l) => l.to === b.id) && nav.neighbours(b.id).some((l) => l.to === a.id))
  assert.ok(nav.neighbours(b.id).some((l) => l.to === c.id), 'descente de 12 px possible')
  assert.ok(!nav.neighbours(c.id).some((l) => l.to === b.id), 'on ne remonte pas 12 px')
})

/* ---------- Recherche de chemin ---------- */

test('A* : chemin le plus court à travers plusieurs corniches, et rien d’impossible', () => {
  const nav = NavGraph.build({
    solids: [box(1000, 1100, 700, 720), box(1100, 1200, 704, 720), box(1200, 1300, 700, 720), box(1500, 1600, 700, 720)],
    groundY: G, left: 0, right: 900,
  })
  const from = { x: 1020, ledge: nav.ledgeAt(1020, 700).id }
  const to = { x: 1280, ledge: nav.ledgeAt(1280, 700).id }
  const path = findPath(nav, from, to)
  assert.ok(path)
  assert.equal(path.waypoints.length, 3)
  assert.equal(path.waypoints.at(-1).x, 1280)
  assert.ok(path.cost >= 260 && path.cost < 300)
  // Corniche isolée (1500..1600) : inaccessible.
  assert.equal(findPath(nav, from, { x: 1550, ledge: nav.ledgeAt(1550, 700).id }), null)
  const reach = reachable(nav, from, 120)
  assert.ok(reach.has(nav.ledgeAt(1150, 704).id) && !reach.has(to.ledge), 'budget respecté')
})

test('tas binaire : extraction dans l’ordre', () => {
  const h = new MinHeap()
  for (const v of [5, 1, 9, 3, 7, 2]) h.push(v, v)
  const out = []
  while (h.size) out.push(h.pop())
  assert.deepEqual(out, [1, 2, 3, 5, 7, 9])
})

/* ---------- Pilotage ---------- */

test('pilotage : accélère, freine avant le but, ne franchit jamais le bord', () => {
  const ledge = { x0: 0, x1: 300 }
  const u = { x: 100, vx: 0, halfW: 13 }
  let max = 0
  let steps = 0
  for (; steps < 2000; steps++) {
    const r = steer(u, 250, ledge, GAITS.walk)
    assert.ok(Math.abs(r.vx - u.vx) <= GAITS.walk.accel * 1.6 + 1e-9, 'pas de saut de vitesse')
    u.vx = r.vx
    u.x += r.vx
    max = Math.max(max, r.vx)
    if (r.arrived) break
  }
  assert.ok(Math.abs(u.x - 250) <= 3 && steps < 2000)
  assert.ok(max <= GAITS.walk.maxSpeed + 1e-9)
  // But au-delà du bord : on s’arrête avant.
  const v = { x: 270, vx: 0.5, halfW: 13 }
  for (let i = 0; i < 300; i++) {
    const r = steer(v, 1000, ledge, GAITS.sprint)
    v.vx = r.vx
    v.x += r.vx
  }
  assert.ok(v.x + v.halfW <= 300)
})

test('pilotage : un camarade devant, on attend', () => {
  const r = steer({ x: 100, vx: 0, halfW: 13 }, 200, { x0: 0, x1: 300 }, GAITS.walk, { allies: [120] })
  assert.equal(r.waiting, true)
  assert.equal(r.vx, 0)
})

/* ---------- Perception ---------- */

test('perception : la course observée prédit le point de chute', () => {
  const p = new Perception()
  // Tir balistique simulé : vx = 4, vy = -6, pesanteur 0,07.
  let x = 0
  let y = 0
  const vx = 4
  let vy = -6
  for (let i = 0; i < 20; i++) {
    p.observe([{ id: 1, x, y }])
    vy += 0.07
    x += vx
    y += vy
  }
  const [t] = p.threats()
  const land = Perception.landing(t, 0)
  // Vraie chute (y revient à 0) : t = 2·6/0,07 ≈ 171 pas, x ≈ 686.
  assert.ok(Math.abs(land.x - 686) < 25, `prévu ${Math.round(land.x)}`)
  p.observe([])
  assert.equal(p.threats().length, 0, 'projectile disparu : plus suivi')
})

/* ---------- En situation (moteur physique) ---------- */

function world() {
  const w = new PhysicsWorld(new EventBus(), { seed: 3 })
  const events = []
  return { w, events }
}

function settle(w, ms = 1500) {
  for (let t = 0; t < ms; t += WORLD.STEP_MS) w.stepOnce()
}

test('ronde : le défenseur marche, fait demi-tour au mur, et ne tombe jamais', () => {
  const { w } = world()
  w.add(new Block({ material: 'stone', x: 1000, y: WORLD.GROUND_Y - 40, w: 20, h: 80 }))
  const t = w.add(new Target({ type: 'soldier', x: 1080, y: WORLD.GROUND_Y - 26, patrol: 60 }))
  settle(w, 1200)
  let minX = Infinity
  let maxX = -Infinity
  let walked = 0
  for (let i = 0; i < 1600; i++) {
    w.stepOnce()
    minX = Math.min(minX, t.x)
    maxX = Math.max(maxX, t.x)
    if (t.walking) walked++
  }
  assert.ok(t.alive)
  assert.ok(walked > 200, 'il patrouille')
  assert.ok(minX > 1010 + 13, 'jamais dans le mur')
  assert.ok(maxX <= 1080 + 60 + 4, 'reste dans son secteur')
})

test('éclaireur : il voit le tir arriver sur lui et court se mettre à l’abri', () => {
  const { w } = world()
  w.arm()
  const scout = w.add(new Target({ type: 'scout', x: 1300, y: WORLD.GROUND_Y - 24 }))
  settle(w, 600)
  const x0 = scout.x
  let hitAt = null
  // Un boulet qui tombe droit sur lui.
  // Un boulet en cloche (vol de ≈ 2 s, comme un tir de catapulte) qui tombe droit sur lui.
  const p = w.add(new Projectile('stone', 954, WORLD.GROUND_Y - 300))
  Matter.Body.setVelocity(p.body, { x: 3.4, y: -12 })
  let moved = 0
  for (let i = 0; i < 400 && !p.hasImpacted; i++) {
    w.stepOnce()
    moved = Math.max(moved, Math.abs(scout.x - x0))
    hitAt = p.x
  }
  assert.ok(Math.abs(hitAt - x0) < 40, 'le tir tombait bien sur lui')
  assert.ok(moved > 60, `il a esquivé (${Math.round(moved)} px)`)
  for (let i = 0; i < 120; i++) w.stepOnce()
  assert.ok(scout.alive, 'et il a survécu')
})

test('pavoisier : un tir tendu de face ricoche, un tir plongeant le tue', () => {
  const { w } = world()
  w.arm()
  const s = w.add(new Target({ type: 'shieldbearer', x: 1300, y: WORLD.GROUND_Y - 26 }))
  settle(w, 600)
  const flat = w.add(new Projectile('stone', 1200, WORLD.GROUND_Y - 30))
  Matter.Body.setVelocity(flat.body, { x: 9, y: 0 })
  for (let i = 0; i < 120; i++) w.stepOnce()
  assert.ok(s.alive, 'le pavois a arrêté le tir tendu')
  const lob = w.add(new Projectile('stone', 1300, WORLD.GROUND_Y - 240))
  Matter.Body.setVelocity(lob.body, { x: 0.3, y: 9 })
  for (let i = 0; i < 120 && s.alive; i++) w.stepOnce()
  assert.equal(s.alive, false, 'le tir plongeant passe par-dessus le pavois')
})

test('sapeur : au calme, il va réparer le bloc abîmé à sa portée', () => {
  const { w } = world()
  const wall = w.add(new Block({ material: 'wood', x: 1200, y: WORLD.GROUND_Y - 40, w: 24, h: 80 }))
  const eng = w.add(new Target({ type: 'engineer', x: 1320, y: WORLD.GROUND_Y - 24, patrol: 30 }))
  settle(w, 1200)
  wall.hp = wall.maxHp * 0.3
  for (let i = 0; i < 120 * 8 && wall.hp < wall.maxHp * 0.85; i++) w.stepOnce()
  assert.ok(eng.alive)
  assert.ok(wall.hp >= wall.maxHp * 0.85, `réparé (${Math.round((wall.hp / wall.maxHp) * 100)} %)`)
})

test('étendard : ses voisins encaissent mieux, plus après sa chute', () => {
  const { w } = world()
  const bearer = w.add(new Target({ type: 'bannerman', x: 1300, y: WORLD.GROUND_Y - 27 }))
  const ally = w.add(new Target({ type: 'soldier', x: 1400, y: WORLD.GROUND_Y - 25 }))
  const far = w.add(new Target({ type: 'soldier', x: 1900, y: WORLD.GROUND_Y - 25 }))
  settle(w, 1200)
  assert.ok(ally.toughness > ally.baseToughness)
  assert.equal(far.toughness, far.baseToughness)
  bearer.kill('impact')
  settle(w, 300)
  assert.equal(ally.toughness, ally.baseToughness)
})

test('veilleur : sa torche met le feu au bois et à la poudre en tombant', () => {
  const { w } = world()
  const plank = w.add(new Block({ material: 'wood', x: 1260, y: WORLD.GROUND_Y - 40, w: 24, h: 80 }))
  const barrel = w.add(new Barrel({ x: 1340, y: WORLD.GROUND_Y - 21 }))
  const watch = w.add(new Target({ type: 'soldier', x: 1300, y: WORLD.GROUND_Y - 25, torch: true }))
  settle(w, 600)
  watch.kill('impact')
  w.stepOnce()
  assert.ok(plank.burning > 0 || !plank.alive, 'le bois brûle')
  assert.ok(barrel.burning > 0 || !barrel.alive, 'la poudre aussi')
})

/* ---------- Campagne ---------- */

test('campagne : chaque nouveau défenseur est présenté seul, puis revient', () => {
  // Les pillards ont leur propre présentation (v6.2 : le premier, au niveau 8, est un éclaireur).
  const first = (type) => LevelRepository.all().find((l) => l.targets.some((t) => t.type === type && !t.raid))?.id
  assert.equal(first('scout'), 9)
  assert.equal(first('shieldbearer'), 19)
  assert.equal(first('engineer'), 26)
  assert.equal(first('bannerman'), 33)
  assert.ok(LevelRepository.all().find((l) => l.targets.some((t) => t.torch && !t.raid)).id === 31, 'premiers veilleurs : la première nuit')
  for (const type of ['scout', 'shieldbearer', 'engineer', 'bannerman']) {
    assert.ok(LevelRepository.all().filter((l) => l.targets.some((t) => t.type === type)).length >= 8, `${type} revient souvent`)
  }
  assert.equal(rosterFor(9).scouts, 1)
  assert.equal(rosterFor(2).scouts, 0)
})

/* ---------- Ouvrages des pillards (v5.8) ---------- */

import { occupied } from '../src/game/ai/NavGraph.js'
import { WORLD as W } from '../src/game/physics/constants.js'

test('navigation : un triangle n’occupe que sa vraie largeur à chaque hauteur', () => {
  const talus = { minX: 100, maxX: 300, minY: 0, maxY: 100, flat: false, tri: { ax: 200, ay: 0, bx0: 100, bx1: 300, by: 100 } }
  assert.deepEqual(occupied(talus, -50, 10), [190, 210], 'près de la pointe : étroit')
  assert.deepEqual(occupied(talus, 50, 100), [100, 300], 'à la base : toute la largeur')
  assert.equal(occupied(talus, -80, -10), null, 'au-dessus de la pointe : rien')
})

test('ouvrages : pont proposé au-dessus d’un lac, échelle par-dessus la roche, jamais à travers un château', () => {
  const lake = NavGraph.build({ solids: [], groundY: G, hazards: [{ x0: 700, x1: 1000 }], left: 0, right: 2000, works: true })
  const bank = lake.ledgeAt(500, G)
  const link = lake.neighbours(bank.id).find((l) => l.kind)
  assert.equal(link?.kind, 'bridge')
  assert.equal(link.built, false)
  assert.ok(!findPath(lake, { x: 500, ledge: bank.id }, { x: 1500, ledge: lake.ledgeAt(1500, G).id }), 'sans l’option, pas de pont')
  assert.ok(findPath(lake, { x: 500, ledge: bank.id }, { x: 1500, ledge: lake.ledgeAt(1500, G).id }, { build: true }), 'un pillard, lui, passe')

  const tri = { ax: 800, ay: G - 300, bx0: 590, bx1: 1010, by: G }
  const mountain = NavGraph.build({ solids: [{ minX: 590, maxX: 1010, minY: G - 300, maxY: G, flat: false, terrain: true, tri }], groundY: G, left: 0, right: 2000, works: true })
  const l = mountain.neighbours(mountain.ledgeAt(300, G).id).find((k) => k.kind)
  assert.equal(l?.kind, 'ladder')
  assert.equal(l.route.length, 3, 'en A par-dessus le sommet')
  assert.ok(l.route[1].y < G - 300, 'au-dessus de la pointe')

  const castle = NavGraph.build({ solids: [box(800, 900, G - 300, G)], groundY: G, left: 0, right: 2000, works: true })
  assert.ok(!castle.neighbours(castle.ledgeAt(300, G).id).some((k) => k.kind), 'un mur de château ne s’escalade pas')
})

test('ouvrages en partie : le pont se bâtit, se traverse… et cède sous un tir (ceux dessus se noient)', () => {
  const w = new PhysicsWorld(new EventBus(), { seed: 3, zones: [{ kind: 'lake', x0: 700, x1: 1000 }] })
  const r = w.add(new Target({ type: 'scout', x: 1300, y: W.GROUND_Y - 24, raid: 'fire', torch: true }))
  w.units.setEngines(() => [{ x: 170, y: W.GROUND_Y, dir: 1, front: 258 }])
  settle(w, 1200)
  w.arm()
  w.units.marching = true
  let hit = false
  for (let i = 0; i < 120 * 30 && r.alive; i++) {
    w.stepOnce()
    const bridge = w.filter((e) => e.construct)[0]
    if (!hit && bridge && r.x < 960 && r.x > 760) {
      const p = w.add(new Projectile('stone', bridge.x - 110, W.GROUND_Y - 160))
      Matter.Body.setVelocity(p.body, { x: 0, y: 10 })
      hit = true
    }
  }
  assert.ok(hit, 'le pont a été bâti et le pillard s’y est engagé')
  assert.equal(r.deathCause, 'drown')
  assert.equal(w.filter((e) => e.construct).length, 0)
})

test('ouvrages en partie : l’échelle par-dessus la montagne mène à l’engin ; un tir la renverse', () => {
  const make = () => {
    const w = new PhysicsWorld(new EventBus(), { seed: 3 })
    w.add(new Block({ material: 'rock', x: 800, y: W.GROUND_Y + 12 - 100, w: 420, h: 300, shape: 'triangle' }))
    const r = w.add(new Target({ type: 'scout', x: 1300, y: W.GROUND_Y - 24, raid: 'fire', torch: true }))
    const events = []
    w.units.setEngines(() => [{ x: 170, y: W.GROUND_Y, dir: 1, front: 258 }])
    settle(w, 1200)
    w.arm()
    w.units.marching = true
    return { w, r, events }
  }
  const a = make()
  let top = Infinity
  for (let i = 0; i < 120 * 40 && a.r.alive; i++) {
    a.w.stepOnce()
    top = Math.min(top, a.r.y)
  }
  assert.equal(a.r.deathCause, 'crew', 'il a atteint l’engin (puis les servants l’ont repoussé)')
  assert.ok(top < W.GROUND_Y - 300, 'en passant par le sommet')

  const b = make()
  let shot = false
  for (let i = 0; i < 120 * 30 && b.r.alive; i++) {
    b.w.stepOnce()
    if (!shot && b.r.climbing && b.r.y < W.GROUND_Y - 150) {
      // On vise l'autre versant de l'échelle (pas le pillard) : elle tombe, et lui avec.
      const ladder = b.w.units.works.find((k) => k.kind === 'ladder' && !k.building)
      const [, peak, end] = ladder.route
      const p = b.w.add(new Projectile('stone', (peak.x + end.x) / 2, (peak.y + end.y) / 2 - 120))
      Matter.Body.setVelocity(p.body, { x: 0, y: 8 })
      shot = true
    }
  }
  assert.ok(shot)
  assert.equal(b.w.units.works.filter((k) => k.kind === 'ladder' && !k.building).length, 0, 'l’échelle est à terre')
  assert.equal(b.r.alive, false)
})

/* ---------- v5.9 : grimpeurs jamais coincés (niveau 32) ---------- */

import { ladderRoute } from '../src/game/ai/NavGraph.js'

/** Une montagne entre le pillard et l'engin ; `type` : le pillard. */
function mountainRaid(type = 'scout', raid = 'fire') {
  const w = new PhysicsWorld(new EventBus(), { seed: 3 })
  w.add(new Block({ material: 'rock', x: 800, y: W.GROUND_Y + 12 - 100, w: 420, h: 300, shape: 'triangle' }))
  const r = w.add(new Target({ type, x: 1300, y: W.GROUND_Y - (type === 'ogre' ? 38 : 24), raid }))
  w.units.setEngines(() => [{ x: 170, y: W.GROUND_Y, dir: 1, front: 258 }])
  settle(w, 1200)
  w.arm()
  w.units.marching = true
  return { w, r }
}

test('ogre pillard : assez large pour rester loin du bord, il bâtit quand même son échelle et atteint l’engin', () => {
  const { w, r } = mountainRaid('ogre', 'smash')
  let top = Infinity
  for (let i = 0; i < 120 * 70 && r.alive; i++) {
    w.stepOnce()
    top = Math.min(top, r.y)
  }
  assert.ok(top < W.GROUND_Y - 300, 'il est passé par le sommet')
  assert.equal(r.deathCause, 'crew', 'il a frappé l’engin, puis les servants l’ont repoussé')
})

test('échelle : elle épouse la crête et ne traverse aucune pointe de roche', () => {
  const S = { x: 0, y: 900 }
  const E = { x: 400, y: 900 }
  // Deux pointes (la seconde, plus basse, dépasse quand même la ligne sommet → arrivée).
  const profile = [{ x: 150, y: 650 }, { x: 260, y: 750 }, { x: 330, y: 905 }]
  const route = ladderRoute(S, E, profile)
  assert.deepEqual(route.map((p) => [p.x, p.y]), [[0, 900], [150, 644], [260, 744], [400, 900]])
  const yAt = (pts, x) => {
    for (let i = 1; i < pts.length; i++) if (x <= pts[i].x) return pts[i - 1].y + ((pts[i].y - pts[i - 1].y) * (x - pts[i - 1].x)) / (pts[i].x - pts[i - 1].x)
    return pts[pts.length - 1].y
  }
  for (const p of profile) assert.ok(yAt(route, p.x) <= p.y - 6 + 1e-9, `au-dessus de ${p.x},${p.y}`)
  // Dans l'autre sens : le même itinéraire, parcouru depuis la droite.
  assert.deepEqual(ladderRoute(E, S, profile), [...route].reverse())
})

test('pont rompu : un pillard arrivé après la rupture le rebâtit au lieu d’attendre sur la berge', () => {
  const w = new PhysicsWorld(new EventBus(), { seed: 3, zones: [{ kind: 'lake', x0: 700, x1: 1000 }] })
  const first = w.add(new Target({ type: 'scout', x: 1300, y: W.GROUND_Y - 24, raid: 'fire' }))
  const late = w.add(new Target({ type: 'scout', x: 2000, y: W.GROUND_Y - 24, raid: 'fire' }))
  w.units.setEngines(() => [{ x: 170, y: W.GROUND_Y, dir: 1, front: 258 }])
  settle(w, 1200)
  w.arm()
  w.units.marching = true
  let broke = false
  let built = 0
  let had = false
  for (let i = 0; i < 120 * 60 && late.alive; i++) {
    w.stepOnce()
    const bridge = w.filter((e) => e.construct && e.alive)[0]
    if (bridge && !had) built++
    had = Boolean(bridge)
    // Le premier s'engage sur le pont : un tir le rompt (le second est encore loin).
    if (bridge && !broke && first.x < 980) {
      bridge.kill('impact')
      broke = true
    }
  }
  assert.ok(broke)
  assert.equal(first.deathCause, 'drown')
  assert.equal(built, 2, 'le second a jeté un nouveau pont')
  assert.equal(late.deathCause, 'crew', 'il a atteint l’engin')
})
