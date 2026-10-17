import { test } from 'node:test'
import assert from 'node:assert/strict'
import Matter from 'matter-js'
import { EventBus } from '../src/core/utils/EventBus.js'
import { PhysicsWorld } from '../src/game/physics/PhysicsWorld.js'
import { WORLD } from '../src/game/physics/constants.js'
import { Block } from '../src/game/entities/Block.js'
import { Target } from '../src/game/entities/Target.js'
import { Projectile } from '../src/game/entities/Projectile.js'
import { findKeystones, KEYSTONE, bondBetween, contactBetween } from '../src/game/physics/CastleJoints.js'
import { COMBO } from '../src/game/physics/ElementCombos.js'
import { LevelRepository } from '../src/game/levels/LevelRepository.js'
import { DICTIONARIES } from '../src/i18n/index.js'

const G = WORLD.GROUND_Y
const settle = (w, n = 150) => {
  for (let i = 0; i < n; i++) w.stepOnce()
}
/** Arme les règles (un tir perdu, loin de la scène). */
const arm = (w) => w.add(new Projectile('stone', -300, 0))
/** Une pièce : deux piliers et une dalle, posée au sol. */
const room = (w, x, mat = 'stone') => ({
  left: w.add(new Block({ material: mat, x: x - 50, y: G - 50, w: 20, h: 100 })),
  right: w.add(new Block({ material: mat, x: x + 50, y: G - 50, w: 20, h: 100 })),
  slab: w.add(new Block({ material: mat, x, y: G - 110, w: 130, h: 20 })),
})

/* ---------- Assemblage du château ---------- */

test('v6.2 : contacts et liants : appui, côte à côte, le plus faible des deux matériaux', () => {
  const box = (x, y, w, h) => ({ min: { x: x - w / 2, y: y - h / 2 }, max: { x: x + w / 2, y: y + h / 2 } })
  const v = contactBetween(box(100, 40, 60, 20), box(100, 70, 40, 40))
  assert.equal(v.dir, 'v')
  assert.equal(v.points.length, 2)
  const h = contactBetween(box(100, 100, 40, 80), box(140, 100, 40, 80))
  assert.equal(h.dir, 'h')
  assert.equal(contactBetween(box(100, 100, 40, 40), box(300, 100, 40, 40)), null)
  assert.equal(bondBetween('stone', 'wood'), 'peg')
  assert.equal(bondBetween('iron', 'iron'), 'rivet')
  assert.equal(bondBetween('glass', 'stone'), 'lead')
})

test('v6.2 : le château posé est soudé ; au repos, rien ne cède ; un choc franc et une explosion font céder les jonctions', () => {
  const bus = new EventBus()
  const breaks = []
  bus.on('joint:break', (e) => breaks.push(e))
  const w = new PhysicsWorld(bus, { joints: true })
  const r = room(w, 1500)
  settle(w, 240)
  assert.ok(w.joints.size >= 4, `jonctions : ${w.joints.size}`)
  assert.ok(r.left.joints > 0 && r.slab.joints > 0)
  assert.equal(breaks.length, 0, 'rien ne cède au repos')
  arm(w)
  const p = w.add(new Projectile('boulder', 1380, G - 60))
  Matter.Body.setVelocity(p.body, { x: 16, y: 0 })
  settle(w, 120)
  assert.ok(breaks.length > 0, 'le choc fait céder des jonctions')
  const w2 = new PhysicsWorld(new EventBus(), { joints: true })
  room(w2, 1500)
  settle(w2, 240)
  const before = w2.joints.size
  w2.explode(1500, G - 60, { radius: 150, power: 1, damage: 0 })
  assert.ok(w2.joints.size < before, 'l’explosion arrache des jonctions')
})

test('v6.2 : clés de voûte : le pilier qui porte le plus, une par ouvrage ; entamée, elle se désagrège', () => {
  // Une tour de trois étages (piliers + dalles) : le pilier du bas porte tout.
  const blocks = []
  for (let f = 0; f < 3; f++) {
    const floor = G - f * 120
    blocks.push({ material: 'stone', x: 1450, y: floor - 50, w: 20, h: 100 }, { material: 'stone', x: 1550, y: floor - 50, w: 20, h: 100 }, { material: 'stone', x: 1500, y: floor - 110, w: 130, h: 20 })
  }
  const keys = findKeystones(blocks)
  assert.equal(keys.length, 1)
  assert.ok(blocks[keys[0]].y > G - 120, 'au rez-de-chaussée')
  assert.ok(KEYSTONE.GIVE > 0 && KEYSTONE.GIVE < 1)
  // En jeu : entamée de GIVE, elle se désagrège et l'annonce.
  const bus = new EventBus()
  const events = []
  bus.on('keystone', (e) => events.push(e))
  const w = new PhysicsWorld(bus, { joints: true })
  const made = blocks.map((b, i) => w.add(new Block({ ...b, keystone: i === keys[0] })))
  settle(w, 240)
  arm(w)
  const key = made[keys[0]]
  key.damage(key.maxHp * (KEYSTONE.GIVE + 0.05), 'impact')
  settle(w, 5)
  assert.equal(key.alive, false)
  assert.equal(events.length, 1)
})

test('v6.2 : les niveaux de la campagne ont leurs clés de voûte, présentées au niveau 5', () => {
  assert.equal(KEYSTONE.FROM, 5)
  assert.ok(LevelRepository.novelties(5).includes('keystone'))
  assert.ok(!LevelRepository.novelties(6).includes('keystone'))
  const withKeys = LevelRepository.all().filter((l) => l.blocks.some((b) => b.keystone))
  assert.ok(withKeys.length > 60, `${withKeys.length} niveaux`)
  assert.ok(LevelRepository.get(4).blocks.every((b) => !b.keystone))
})

/* ---------- Combos d'éléments ---------- */

test('v6.2 : fer rougi : le feu le chauffe, il enflamme le bois voisin et brûle qui le touche ; la trempe le fend', () => {
  const bus = new EventBus()
  const combos = []
  bus.on('combo', (e) => combos.push(e.kind))
  const w = new PhysicsWorld(bus)
  const iron = w.add(new Block({ material: 'iron', x: 1500, y: G - 40, w: 40, h: 80 }))
  const wood = w.add(new Block({ material: 'wood', x: 1541, y: G - 40, w: 40, h: 80 }))
  const t = w.add(new Target({ type: 'soldier', x: 1473, y: G - 25 }))
  settle(w, 200)
  arm(w)
  const fire = w.add(new Projectile('fire', 1500, G - 160))
  Matter.Body.setVelocity(fire.body, { x: 0, y: 8 })
  for (let i = 0; i < 40 && !(iron.hotUntil > w.time); i++) w.stepOnce()
  assert.ok(iron.hotUntil > w.time, 'le fer rougit')
  assert.ok(combos.includes('redhot'))
  const hp0 = t.hp
  settle(w, 130)
  assert.ok(wood.burning > 0, 'le bois voisin s’enflamme')
  assert.ok(t.hp < hp0, 'il brûle qui le touche')
  // Trempe : un tir de givre sur le fer rougi.
  const before = iron.hp
  const ice = w.add(new Projectile('frost', 1500, G - 140))
  Matter.Body.setVelocity(ice.body, { x: 0, y: 8 })
  for (let i = 0; i < 40 && !combos.includes('quench'); i++) w.stepOnce()
  assert.ok(combos.includes('quench'))
  assert.ok(!iron.alive || iron.hp <= before - iron.maxHp * COMBO.QUENCH * 0.9, `fer ${iron.hp.toFixed(0)}/${iron.maxHp}`)
})

test('v6.2 : fer électrisé : la foudre le charge et il électrise qui le touche ; eau électrisée : tous les trempés', () => {
  const bus = new EventBus()
  const combos = []
  bus.on('combo', (e) => combos.push(e.kind))
  const w = new PhysicsWorld(bus)
  const iron = w.add(new Block({ material: 'iron', x: 1500, y: G - 40, w: 40, h: 80 }))
  const t = w.add(new Target({ type: 'knight', x: 1535, y: G - 27 }))
  settle(w, 200)
  arm(w)
  const orb = w.add(new Projectile('thunder', 1500, G - 150))
  Matter.Body.setVelocity(orb.body, { x: 0, y: 8 })
  for (let i = 0; i < 40 && !combos.includes('charged'); i++) w.stepOnce()
  assert.ok(combos.includes('charged'))
  assert.ok(iron.chargedUntil > w.time)
  const hp0 = t.hp
  settle(w, 70)
  assert.ok(t.hp < hp0, 'le chevalier contre le fer est électrisé')
  // Eau électrisée : deux trempés hors de portée d'un saut, la décharge court dans l'eau.
  const bus2 = new EventBus()
  const kinds = []
  bus2.on('combo', (e) => kinds.push(e.kind))
  const w2 = new PhysicsWorld(bus2)
  const a = w2.add(new Target({ type: 'soldier', x: 1400, y: G - 25 }))
  const b = w2.add(new Target({ type: 'soldier', x: 1680, y: G - 25 }))
  settle(w2, 200)
  arm(w2)
  a.wetMs = 9000
  b.wetMs = 9000
  const orb2 = w2.add(new Projectile('thunder', 1400, G - 120))
  Matter.Body.setVelocity(orb2.body, { x: 0, y: 8 })
  for (let i = 0; i < 40 && !kinds.includes('wetshock'); i++) w2.stepOnce()
  assert.ok(kinds.includes('wetshock'))
  assert.ok(b.hp < b.maxHp, 'le second trempé est touché aussi')
})

test('v6.2 : éclats de glace : une explosion brise la glace, dont les éclats blessent alentour', () => {
  const bus = new EventBus()
  const hurts = []
  bus.on('hurt', (e) => hurts.push(e))
  const w = new PhysicsWorld(bus)
  const ice = w.add(new Block({ material: 'ice', x: 1500, y: G - 30, w: 40, h: 60 }))
  w.add(new Target({ type: 'knight', x: 1570, y: G - 27 }))
  settle(w, 200)
  arm(w)
  w.explode(1420, G - 30, { radius: 120, power: 0.5, damage: 0 })
  settle(w, 2)
  assert.equal(ice.alive, false)
  assert.ok(hurts.some((h) => h.cause === 'shard'))
})

/* ---------- Boulets égarés ---------- */

test('v6.2 : un boulet qui roule au-delà du château est retiré, au lieu de retenir le tour', () => {
  const w = new PhysicsWorld(new EventBus())
  w.add(new Target({ type: 'soldier', x: 1500, y: G - 25 }))
  w.playZone = { left: 1200, right: 1700 }
  settle(w, 100)
  arm(w)
  const p = w.add(new Projectile('stone', 1750, G - 16))
  p.hasImpacted = true
  Matter.Body.setVelocity(p.body, { x: 4, y: 0 })
  settle(w, 3)
  assert.equal(w.filter((e) => e === p).length, 0, 'retiré')
})

test('v6.2 : un défenseur projeté hors du champ de bataille compte comme tombé ; un bloc, non', async () => {
  const { General } = await import('../src/game/entities/General.js')
  const GENERAL = (await import('../src/game/bosses/generals.js')).GENERAL_IDS[0]
  const w = new PhysicsWorld(new EventBus())
  arm(w)
  const x = WORLD.WIDTH + WORLD.FIELD_MARGIN + 20
  const gone = w.add(new Target({ type: 'soldier', x, y: G - 25 }))
  const edge = w.add(new Target({ type: 'scout', x: WORLD.WIDTH + WORLD.FIELD_MARGIN - 30, y: G - 20 }))
  const block = w.add(new Block({ material: 'wood', x, y: G - 20, w: 40, h: 40 }))
  const general = w.add(new General({ general: GENERAL, x: x + 60, y: G - 40 }, 1, 3))
  settle(w, 3)
  assert.equal(gone.alive, false)
  assert.equal(gone.deathCause, 'fall')
  assert.equal(edge.alive, true, 'au bord, il reste')
  assert.equal(block.alive, true, 'un bloc ne sort du monde qu’au-delà de KILL_MARGIN')
  assert.equal(general.alive, false, 'le général ne revient pas')
  assert.equal(general.lives, 0)
})

/* ---------- Modes ---------- */

test('v6.2 : capacités des modes plutôt que leur nom : deux camps au seul face-à-face, aides de la seule campagne', async () => {
  const { createMode } = await import('../src/game/modes/modes.js')
  const { DRIVE } = await import('../src/game/drive/driveRules.js')
  const two = { players: ['A', 'B'] }
  const ids = { story: {}, heroic: {}, duke: {}, free: {}, duel: two, hotseat: two, versus: two, coop: two, daily: {}, cup: {}, challenge: {}, endless: { shots: 5 }, custom: {} }
  for (const [id, opts] of Object.entries(ids)) {
    const m = createMode(id, opts)
    assert.equal(m.twoCamps, id === 'versus', `${id}.twoCamps`)
    for (const k of ['aimAssist', 'rewardVideos', 'lastShotOffer']) assert.equal(m[k], id === 'story', `${id}.${k}`)
    assert.equal(m.driveFromLevel, id === 'story' ? DRIVE.FROM_LEVEL : 0, `${id}.driveFromLevel`)
  }
})

/* ---------- Repères des défenseurs ---------- */

test('v6.2 : repères : une pastille au bord droit pour qui atteint la marge, d’or pour le dernier, partagée de près', async () => {
  const { edgeBeacons, BEACON } = await import('../src/game/rendering/TargetBeacons.js')
  // Caméra d'essai : l'écran montre le monde de x = 1000 à 2000, le bandeau du haut fait 60 px, les commandes 100 px.
  const camera = { viewW: 1000, viewH: 600, insetTop: 60, insetBottom: 100, worldToScreen: (x, y) => ({ x: x - 1000, y }) }
  const unit = (id, x, y, more = {}) => ({ id, kind: 'target', alive: true, x, y, ...more })
  assert.deepEqual(edgeBeacons([unit(1, 1500, 300), unit(2, 1900, 300)], camera), [], 'tous bien dans le champ')
  const far = edgeBeacons([unit(1, 2300, 20)], camera)
  assert.equal(far.length, 1)
  assert.equal(far[0].offscreen, true)
  assert.equal(far[0].y, 60 + BEACON.PAD, 'ramenée sous le bandeau du haut')
  const margin = edgeBeacons([unit(1, 1000 + 1000 - BEACON.EDGE_MARGIN + 5, 300)], camera)
  assert.equal(margin.length, 1)
  assert.equal(margin[0].offscreen, false, 'encore visible, dans la marge')
  const pair = edgeBeacons([unit(1, 2100, 300), unit(2, 2200, 310), unit(3, 2150, 420, { alive: false })], camera, { lastId: 2 })
  assert.equal(pair.length, 1, 'deux défenseurs proches partagent une pastille')
  assert.equal(pair[0].count, 2)
  assert.equal(pair[0].last, true)
  const apart = edgeBeacons([unit(1, 2100, 150), unit(2, 2100, 400), { id: 3, kind: 'block', x: 2300, y: 200 }], camera)
  assert.deepEqual(apart.map((b) => b.count), [1, 1], 'éloignés : une pastille chacun ; les blocs ne comptent pas')
  assert.ok(apart[0].y < apart[1].y)
})

test('v6.2 : la partie désigne le dernier défenseur debout au rendu, et lui seul', async () => {
  const { GameSession } = await import('../src/game/GameSession.js')
  const s = new GameSession(LevelRepository.get(12), { difficulty: 'normal', completedLevels: 0, reducedMotion: true })
  for (let i = 0; i < 120 && s.state !== 'aiming'; i++) s.update(1000 / 30)
  assert.equal(s.scene().beacons.lastId, null, 'plusieurs défenseurs : pas de repère')
  const alive = s.world.filter((e) => e.kind === 'target' && e.alive)
  const keep = alive[alive.length - 1]
  for (const t of alive) if (t !== keep) t.kill('impact')
  s.update(1000 / 30)
  assert.equal(s.targetsLeft, 1)
  assert.equal(s.scene().beacons.lastId, keep.id)
  s.destroy()
})

/* ---------- Correctifs de la revue ---------- */

test('v6.2 : la jauge de destruction vaut aussi aux Terres du Duc (leurs numéros, 1 à 5, la coupaient)', async () => {
  const { gaugeTaught } = await import('../src/game/levels/campaignRules.js')
  const { DukeRepository } = await import('../src/game/levels/DukeRepository.js')
  const { GameSession } = await import('../src/game/GameSession.js')
  const { createMode } = await import('../src/game/modes/modes.js')
  assert.equal(gaugeTaught(LevelRepository.get(5)), false)
  assert.equal(gaugeTaught(LevelRepository.get(6)), true)
  assert.equal(gaugeTaught(LevelRepository.heroic(5)), false)
  for (let id = 1; id <= DukeRepository.count; id++) assert.equal(gaugeTaught(DukeRepository.get(id)), true, `Duc ${id}`)
  const s = new GameSession(DukeRepository.get(1), { difficulty: 'normal', completedLevels: 100, reducedMotion: true }, createMode('duke', { completedLevels: 100 }))
  for (let i = 0; i < 200 && s.state !== 'aiming'; i++) s.update(1000 / 30)
  assert.ok(s.hud.gauge, 'la jauge est là')
  s.destroy()
})

test('v6.2 : le pillard de feu d’un général porte sa torche ; renforts et rempart aussi solides que le château', async () => {
  const { SKILLS } = await import('../src/game/bosses/skills.js')
  const { raiderTorch } = await import('../src/game/levels/campaignRules.js')
  const { TARGET_TYPES } = await import('../src/game/entities/catalog.js')
  const { MATERIALS } = await import('../src/game/entities/materials.js')
  assert.equal(raiderTorch('fire'), true)
  assert.equal(raiderTorch('frost'), false)
  const world = new PhysicsWorld(new EventBus())
  const called = []
  const ctx = {
    port: { world, hpFactor: 1.25, blockHpFactor: 1.35, castleLeft: () => 1500, particles: { dust() {}, frost() {} }, feedback() {} },
    council: { summoned: () => [], remember: (skill, unit) => called.push(unit) },
    def: { raid: 'fire' },
  }
  assert.equal(SKILLS.hireRaider.perform(ctx), true)
  const raider = called[0]
  assert.equal(raider.raid, 'fire')
  assert.equal(raider.torch, true, 'sa torche, comme les pillards des niveaux')
  assert.ok(Math.abs(raider.maxHp - TARGET_TYPES.scout.hp * 1.25) < 1e-9, `renfort à ×1,25 (${raider.maxHp})`)
  called.length = 0
  SKILLS.iceRampart.perform(ctx)
  assert.ok(called.length > 0, 'un rempart')
  for (const b of called) assert.ok(Math.abs(b.maxHp - MATERIALS.ice.hp * 1.35) < 1e-9 && b.hp === b.maxHp, `bloc à ×1,35 (${b.maxHp})`)
})

test('v6.2 : une victoire sans tir (le feu achève le dernier défenseur pendant la visée) se rejoue et compte au défi', async () => {
  const { ReplayPlayer } = await import('../src/game/replay/ReplayPlayer.js')
  const { ReplayCode } = await import('../src/game/replay/ReplayCode.js')
  const { GameSession, STATE } = await import('../src/game/GameSession.js')
  const id = 12
  const opts = { difficulty: 'normal', completedLevels: 11, reducedMotion: true }
  // Le même coup du sort, au même pas, dans la partie et dans sa relecture : tous à terre sauf un, qui prend feu.
  const fate = (session) => {
    const alive = session.world.filter((e) => e.kind === 'target' && e.alive)
    for (const t of alive.slice(1)) t.kill('impact')
    alive[0].ignite(2500)
  }
  const s = new GameSession(LevelRepository.get(id), opts)
  let ended = null
  s.on('end', (e) => (ended = e))
  let g = 0
  while (s.state !== STATE.AIMING && g++ < 400) s.update(1000 / 60)
  s.aim(20, 0.3)
  s.fire()
  g = 0
  while (s.state !== STATE.AIMING && !ended && g++ < 3000) s.update(1000 / 60)
  assert.equal(s.state, STATE.AIMING)
  const at = s.steps
  fate(s)
  g = 0
  while (!ended && g++ < 3000) s.update(1000 / 60)
  assert.ok(ended?.won, 'gagné sans tirer')
  const log = s.log
  assert.equal(log.filter((a) => a.k === 'i').length, 1, 'la victoire sans tir est notée')
  // Le lien de défi la garde.
  const back = ReplayCode.decode(ReplayCode.encode({ levelId: id, engine: 'catapult', log }))
  assert.deepEqual(back.actions.filter((a) => a.k === 'i'), log.filter((a) => a.k === 'i'))
  // La relecture va jusqu'à la victoire (elle s'arrêtait à la visée), avec le même score.
  const r = new GameSession(LevelRepository.get(id), { ...opts, replay: true })
  let replayed = null
  r.on('end', (e) => (replayed = e))
  const player = new ReplayPlayer(r, back.actions)
  let fated = false
  for (let ticks = 0; !player.done && ticks < 200000; ticks++) {
    player.tick()
    if (!fated && r.steps === at) {
      fate(r)
      fated = true
    }
  }
  assert.ok(fated, 'la relecture passe par le même pas')
  assert.ok(replayed?.won, 'la relecture gagne aussi')
  assert.equal(replayed.result.score, ended.result.score)
  s.destroy()
  r.destroy()
})

test('v6.2 : l’état de l’engin avance au pas, en partie (plusieurs pas par image) comme en relecture (un pas à la fois)', async () => {
  const { GameSession, STATE } = await import('../src/game/GameSession.js')
  const make = () => new GameSession(LevelRepository.get(12), { difficulty: 'normal', completedLevels: 11, reducedMotion: true })
  const live = make()
  const replay = make()
  while (live.state !== STATE.AIMING) live.update(1000 / 30)
  while (replay.state !== STATE.AIMING || replay.steps < live.steps) replay.update(WORLD.STEP_MS)
  while (live.steps < replay.steps) live.update(WORLD.STEP_MS)
  assert.equal(live.steps, replay.steps)
  live.condition.ignite(3)
  replay.condition.ignite(3)
  const until = live.steps + 1200
  while (live.steps < until) live.update(1000 / 30)
  while (replay.steps < live.steps) replay.update(WORLD.STEP_MS)
  assert.ok(live.condition.hp < live.condition.maxHp, 'l’engin a brûlé')
  assert.equal(live.condition.hp, replay.condition.hp)
  live.destroy()
  replay.destroy()
})

/* ---------- Niveaux ---------- */

test('v6.2 : personne derrière l’aiguille de roche, aucun baril dans son ombre, et elle touche les murs', async () => {
  const { SPIRE } = await import('../src/game/levels/LevelCurve.js')
  let seen = 0
  for (let id = 57; id <= 99; id += 3) {
    for (const level of [LevelRepository.get(id), LevelRepository.heroic(id)]) {
      const spire = level.blocks.find((b) => b.material === 'rock' && b.w === SPIRE.W && b.shape === 'rect')
      if (!spire) continue
      // Devant le château (niveau 99, gardes postés devant) : son ombre tombe sur le château même, qui s'effondre.
      const castle = level.blocks.filter((b) => b.material !== 'rock')
      const xs = castle.map((b) => b.x).sort((p, q) => p - q)
      if (spire.x < xs[Math.floor(xs.length / 2)]) continue
      seen++
      const from = spire.x + SPIRE.W / 2
      const to = from + spire.h * SPIRE.SHADOW
      const top = spire.y - spire.h / 2
      const inShadow = (x, half) => x + half > from && x - half < to
      // Un défenseur s'y réfugierait (il s'écarte des tirs) : personne ne s'y poste.
      for (const t of level.targets) assert.ok(t.raid || t.x < spire.x, `niveau ${id} : ${t.type} à ${t.x}, derrière l’aiguille (${spire.x})`)
      for (const b of level.barrels) assert.ok(b.y < top || !inShadow(b.x, 17), `niveau ${id} : baril à ${b.x}, dans l’ombre`)
      // Accolée aux murs : son baril, qui tombe ou explose, atteint le donjon.
      const wall = Math.max(...castle.filter((b) => b.x < spire.x).map((b) => b.x + b.w / 2))
      assert.ok(spire.x - SPIRE.W / 2 - wall <= 40, `niveau ${id} : aiguille à ${spire.x - SPIRE.W / 2 - wall} px des murs`)
    }
  }
  assert.ok(seen >= 20, `aiguilles vues : ${seen}`)
})

test('v6.2 : à la pierre, l’escalier d’honneur sans aiguille ni garde derrière, la Citadelle de Mordrac sans bunker', async () => {
  const { SPIRE } = await import('../src/game/levels/LevelCurve.js')
  const { DukeRepository } = await import('../src/game/levels/DukeRepository.js')
  // 96 : l'aiguille calait la plus haute tour ; ses gardes, abrités derrière, se postent devant.
  for (const level of [LevelRepository.get(96), LevelRepository.heroic(96)]) {
    assert.ok(!level.blocks.some((b) => b.material === 'rock' && b.w === SPIRE.W), 'aucune aiguille')
    const tower = Math.max(...level.blocks.filter((b) => b.material !== 'rock').map((b) => b.x + b.w / 2))
    for (const t of level.targets) assert.ok(t.x < tower, `${t.type} à ${t.x}, derrière la plus haute tour (${tower})`)
  }
  // Duc 5 : personne au rez-de-chaussée du donjon (le baril seul), et six tirs pour Mordrac ; l'or ne change pas.
  const citadel = DukeRepository.get(5)
  const keep = { l: 1600 - 85, r: 1600 + 85 }
  const ground = Math.max(...citadel.targets.map((t) => t.y))
  assert.ok(!citadel.targets.some((t) => t.x > keep.l && t.x < keep.r && t.y > ground - 40), 'personne au rez-de-chaussée du donjon')
  assert.ok(citadel.barrels.some((b) => b.x > keep.l && b.x < keep.r), 'le baril y reste')
  assert.deepEqual({ shots: citadel.shots, par: citadel.par, star2: citadel.star2 }, { shots: 11, par: 4, star2: 7 })
})

test('v6.2 : toutes les étapes de la Campagne héroïque et des Terres du Duc se construisent', async () => {
  const { DukeRepository } = await import('../src/game/levels/DukeRepository.js')
  for (let id = 1; id <= 100; id++) {
    const level = LevelRepository.heroic(id)
    assert.equal(level.track, 'heroic')
    for (const stage of level.stages ?? []) assert.ok(stage.targets.length > 0, `héroïque ${id}`)
  }
  for (let id = 1; id <= DukeRepository.count; id++) assert.equal(DukeRepository.get(id).track, 'duke')
})

/* ---------- Textes ---------- */

test('v6.2 : textes des combos, des jonctions et des clés de voûte dans les trois langues', () => {
  for (const lang of ['fr', 'en', 'id']) {
    const d = DICTIONARIES[lang]
    for (const k of ['redhot', 'quench', 'charged', 'wetshock', 'shards', 'steam']) {
      assert.ok(d.game.callout.combo[k], `${lang} callout ${k}`)
      assert.ok(d.captions.combos[k], `${lang} caption ${k}`)
    }
    assert.ok(d.captions.joint.break && d.captions.keystone && d.intro.novelty.keystone, lang)
  }
})

/* ---------- Profil de test : toute la campagne ouverte ---------- */

test('v6.2 : profil de test : toute la campagne s’ouvre, sans étoile ni or, et les vrais records restent', async () => {
  const { SaveSlot } = await import('../src/domain/SaveSlot.js')
  const { LevelResult } = await import('../src/domain/LevelResult.js')
  const { GAME } = await import('../src/config/gameConfig.js')
  // Outils du serveur de développement (v6.2 : hors du domaine, absents des versions publiées).
  const { unlockCampaign } = await import('../src/app/devUnlock.js')
  const created = SaveSlot.create(0, 'Test', 'normal')
  const base = { targetsKilled: 2, blocksDestroyed: 0, barrelsExploded: 0, powersUsed: 0, achievements: 1, difficulty: 'normal' }
  created.recordResult(LevelResult.issue({ ...base, levelId: 1, score: 3000, stars: 2, won: true, shotsUsed: 2 }))
  created.recordResult(LevelResult.issue({ ...base, levelId: 2, score: 0, stars: 0, won: false, shotsUsed: 3, achievements: 0 }))
  const gold = created.gold
  const opened = unlockCampaign(created, GAME.LEVEL_COUNT)
  assert.equal(opened.passed, GAME.LEVEL_COUNT - 2)
  let slot = opened.slot
  for (let id = 1; id <= GAME.LEVEL_COUNT; id++) assert.equal(slot.isUnlocked(id), true, `niveau ${id}`)
  assert.equal(slot.isCompleted(GAME.LEVEL_COUNT), false)
  assert.equal(slot.levelRecord(1).stars, 2)
  assert.equal(slot.isSkipped(1), false)
  assert.equal(slot.isSkipped(50), true)
  assert.equal(slot.starCount, 2)
  assert.equal(slot.gold, gold)
  assert.equal(slot.failsAt(2), 0)
  // Relu comme au chargement : progression continue, économie cohérente.
  const raw = JSON.parse(JSON.stringify(slot.toJSON()))
  const back = SaveSlot.fromJSON(0, raw, (id, rec) => (rec.shots > 0 ? 2 : Math.max(1, rec.stars)))
  assert.equal(back.completedCount, GAME.LEVEL_COUNT - 1)
  assert.equal(back.starCount, 2)
  // Une seconde fois : rien de plus à ouvrir, et un niveau ouvert se gagne pour de bon.
  const again = unlockCampaign(slot, GAME.LEVEL_COUNT)
  assert.equal(again.passed, 0)
  slot = again.slot
  slot.recordResult(LevelResult.issue({ ...base, levelId: 64, score: 4000, stars: 3, won: true, shotsUsed: 2 }))
  assert.equal(slot.isSkipped(64), false)
  assert.equal(slot.levelRecord(64).stars, 3)
})

/* ---------- L'engin roule ---------- */

/** Une partie de campagne au niveau donné, en visée. */
async function drivingAt(id, opts = {}) {
  const { GameSession, STATE } = await import('../src/game/GameSession.js')
  const s = new GameSession(LevelRepository.get(id), { difficulty: 'normal', completedLevels: Math.max(0, id - 1), reducedMotion: true, ...opts })
  let g = 0
  while (s.state !== STATE.AIMING && g++ < 600) s.update(1000 / 60)
  return { s, STATE, run: (ms) => { for (let t = 0; t < ms; t += 1000 / 60) s.update(1000 / 60) } }
}

test('v6.2 : l’engin avance jusqu’à la portée des archers, recule jusqu’au camp, et dit ce qui l’arrête', async () => {
  const { DRIVE } = await import('../src/game/GameSession.js')
  const { s, run } = await drivingAt(2)
  const captions = []
  s.on('feedback', (f) => f.caption && captions.push(f.caption))
  const home = s.catapult.x
  assert.equal(s.drivable, true)
  assert.equal(s.drive(1), true)
  assert.equal(s.drive(1), false, 'même sens : rien de neuf')
  run(5000)
  assert.equal(s.catapult.x, home + DRIVE.AHEAD)
  assert.equal(s.world.engineX, s.catapult.x)
  assert.ok(captions.includes('drive.range'))
  assert.equal(s.hud.drive.front, true)
  assert.ok(s.scene().drive?.x > s.catapult.x, 'les flèches plantées devant l’engin')
  s.drive(-1)
  run(9000)
  assert.equal(s.catapult.x, DRIVE.BACK)
  assert.ok(captions.includes('drive.camp'))
  assert.equal(s.hud.drive.back, true)
  assert.ok(s.catapult.roll < 0, 'les roues ont tourné en arrière')
})

test('v6.2 : la roche et l’eau arrêtent l’engin ; le trébuchet, le face-à-face et le premier niveau ne roulent pas', async () => {
  const { DRIVE } = await import('../src/game/GameSession.js')
  const { VersusMode } = await import('../src/game/modes/modes.js')
  // Niveau 20 : une montagne au milieu du champ.
  const { s, run } = await drivingAt(20)
  const foot = Math.min(...[...s.world.entities()].filter((e) => e.terrain && e.x > s.catapult.x).map((e) => e.x - e.width / 2))
  s.drive(1)
  run(6000)
  assert.ok(s.catapult.x < foot && s.catapult.x + 88 + DRIVE.GAP <= foot + 0.5, `au pied de la roche (${s.catapult.x})`)
  // Un lac juste devant (zone ajoutée pour l'essai).
  const wet = await drivingAt(2)
  wet.s.world.terrain = new (await import('../src/game/physics/Terrain.js')).TerrainZones([{ kind: 'lake', x0: 400, x1: 600 }])
  const caps = []
  wet.s.on('feedback', (f) => f.caption && caps.push(f.caption))
  wet.s.drive(1)
  wet.run(5000)
  assert.equal(wet.s.catapult.x, 400 - DRIVE.GAP - 88)
  assert.ok(caps.includes('drive.water'))
  // Ceux qui ne roulent pas.
  const treb = await drivingAt(30, { engine: 'trebuchet' })
  assert.equal(treb.s.drivable, false)
  assert.equal(treb.s.drive(1), false)
  assert.equal(treb.s.hud.drive, null)
  const first = await drivingAt(1)
  assert.equal(first.s.drivable, false)
  const { GameSession } = await import('../src/game/GameSession.js')
  const versus = new GameSession(LevelRepository.get(5), { difficulty: 'normal', completedLevels: 4, reducedMotion: true }, new VersusMode({ players: ['A', 'B'] }))
  assert.equal(versus.drivable, false)
})

test('v6.2 : tirer immobilise l’engin ; ses trajets se rejouent au pas près et se partagent dans un défi', async () => {
  const { ReplayPlayer } = await import('../src/game/replay/ReplayPlayer.js')
  const { ReplayCode } = await import('../src/game/replay/ReplayCode.js')
  const { GameSession } = await import('../src/game/GameSession.js')
  const { s, STATE, run } = await drivingAt(30)
  s.drive(1)
  run(1500)
  s.aim(42, 0.82)
  assert.equal(s.fire(), true)
  const at = s.catapult.x
  run(200)
  assert.equal(s.catapult.x, at, 'l’engin s’arrête net pour tirer')
  let g = 0
  while (s.state !== STATE.AIMING && s.state !== STATE.ENDED && g++ < 2000) s.update(1000 / 60)
  s.drive(-1)
  run(900)
  s.drive(1)
  run(400)
  s.drive(0)
  s.aim(38, 0.9)
  s.fire()
  g = 0
  while (s.state !== STATE.AIMING && s.state !== STATE.ENDED && g++ < 2000) s.update(1000 / 60)
  const log = s.log
  assert.deepEqual(log.filter((a) => a.k === 'm').map((a) => a.v), [1, -1, 1])
  // Relecture : même chemin, même position, même score.
  const r = new GameSession(LevelRepository.get(30), { difficulty: 'normal', completedLevels: 29, reducedMotion: true, replay: true })
  const player = new ReplayPlayer(r, log)
  let ticks = 0
  while (!player.done && ticks++ < 100000 && !(r.state === STATE.AIMING && r.steps >= s.steps)) player.tick()
  assert.equal(r.catapult.x, s.catapult.x)
  assert.equal(r.score.current, s.score.current)
  // Lien de défi : les trajets passent ; le trébuchet n'en a pas.
  const back = ReplayCode.decode(ReplayCode.encode({ levelId: 30, engine: 'catapult', log }))
  assert.deepEqual(back.actions.filter((a) => a.k === 'm'), log.filter((a) => a.k === 'm').map(({ k, d, v, n }) => ({ k, d, v, n })))
  const shot = log.find((a) => a.k === 'f')
  assert.throws(() => ReplayCode.encode({ levelId: 30, engine: 'trebuchet', log: [{ k: 't', d: shot.d, a: 'stone', r: 100, l: 10 }, { k: 'm', d: 5, v: 1, n: 10 }] }), /engine mismatch/)
})

test('v6.2 : un pillard ne frappe plus l’engin qui a reculé ; au tir suivant, il le rattrape', async () => {
  const { s, STATE } = await drivingAt(36, { completedLevels: 40 })
  const step = () => s.update(1000 / 60)
  const raiders = () => [...s.world.entities()].filter((e) => e.kind === 'target' && e.alive && e.raid)
  const gap = (r) => r.x - r.width / 2 - (s.catapult.x + 88)
  let close = null
  for (let frame = 0; frame < 60 * 60 && !close && s.state !== STATE.ENDED; frame++) {
    if (s.state === STATE.AIMING) {
      close = raiders().find((r) => gap(r) < 30) ?? null
      if (close) break
      if (frame % 90 === 45) {
        // Tirs perdus, loin derrière le château : les pillards restent en vie.
        s.aim(70, 1)
        s.fire()
      }
    }
    step()
  }
  assert.ok(close, 'un pillard est arrivé à l’engin pendant la visée')
  s.drive(-1)
  for (let i = 0; i < 90; i++) step()
  s.drive(0)
  const hp = s.condition.hp
  for (let i = 0; i < 240; i++) step()
  assert.equal(s.condition.hp, hp, 'hors de portée : plus de coups')
  assert.ok(gap(close) > 100)
  s.aim(70, 1)
  s.fire()
  for (let i = 0; i < 240; i++) step()
  assert.ok(gap(close) < 60, `il a rattrapé l’engin (${Math.round(gap(close))} px)`)
})

/* ---------- Chute libre ---------- */

test('v6.2 : chute libre : tombé de son perchoir et achevé juste après, il compte ; une petite chute, non', async () => {
  const { FREEFALL } = await import('../src/game/physics/FallingObjects.js')
  const { ScoreKeeper } = await import('../src/game/score/ScoreKeeper.js')
  // Le monde note l'instant où un défenseur retombe bien plus bas que son perchoir.
  const w = new PhysicsWorld(new EventBus(), { seed: 7 })
  arm(w)
  const high = w.add(new Target({ type: 'knight', x: 900, y: G - 320 }))
  const low = w.add(new Target({ type: 'knight', x: 1200, y: G - 60 }))
  settle(w, 240)
  assert.ok(Number.isFinite(high.fallenAt), 'tombé de haut')
  assert.ok(high.y - high.homeY >= FREEFALL.DROP)
  assert.equal(low.fallenAt, -Infinity, 'une petite chute ne compte pas')
  // Le score compte la chute, même si ce sont les débris qui l'achèvent.
  const level = LevelRepository.get(4)
  const k = new ScoreKeeper(level, 'normal')
  k.startShot('stone')
  k.registerDestroyed({ kind: 'target', type: 'soldier', scoreValue: 100 }, 'crush', { fell: true })
  k.registerDestroyed({ kind: 'target', type: 'soldier', scoreValue: 100 }, 'crush')
  const run = k.finalize({ won: true, shotsLeft: 1, shotsUsed: 1 })
  assert.ok(run, 'résultat')
  assert.ok(level.achievements.includes('freefall'))
  assert.notEqual(run.achievements & (1 << level.achievements.indexOf('freefall')), 0, 'succès « Chute libre » obtenu')
})

/* ---------- Fonds peints ---------- */

test('v6.2 : chaque chapitre a sa peinture, sa ligne de sol et des sommets dans l’image', async () => {
  const { BACKGROUND_ART } = await import('../src/game/assets/backgrounds.js')
  const { existsSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  for (let c = 1; c <= 10; c++) {
    const art = BACKGROUND_ART[c]
    assert.ok(art, `chapitre ${c}`)
    assert.ok(art.ground > 0.9 && art.ground <= 1, `ligne de sol du chapitre ${c}`)
    assert.ok(existsSync(fileURLToPath(art.url)), `image du chapitre ${c}`)
    for (const p of art.peaks ?? []) assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y < art.ground, `sommet du chapitre ${c}`)
  }
})

/* ---------- Maîtrise du royaume : récompenses, Campagne héroïque, Terres du Duc ---------- */

/** Un profil maîtrisé (toutes les étoiles, tous les succès), comme le profil de test « complet ». */
async function masteredSlot() {
  const { SaveSlot } = await import('../src/domain/SaveSlot.js')
  const { masterCampaign, perfectRecords } = await import('../src/app/devUnlock.js')
  return masterCampaign(SaveSlot.create(0, 'Maître', 'normal'), perfectRecords())
}

/** Victoire authentique (comme le moteur de score) sur un niveau d'un parcours. */
async function win(levelId, track, { stars = 3, score = 5000 } = {}) {
  const { LevelResult } = await import('../src/domain/LevelResult.js')
  return LevelResult.issue({ levelId, score, stars, won: true, targetsKilled: 3, blocksDestroyed: 4, barrelsExploded: 0, shotsUsed: 2, powersUsed: 0, achievements: 0, difficulty: 'normal', track })
}

test('v6.2 : la maîtrise (300 étoiles, 300 succès) offre l’Engin d’or et la Comète d’or, la Légende et le chapitre secret', async () => {
  const { SaveSlot } = await import('../src/domain/SaveSlot.js')
  const { StoryRepository } = await import('../src/game/story/StoryRepository.js')
  const plain = SaveSlot.create(1, 'Apprenti', 'normal')
  assert.equal(plain.mastered, false)
  assert.deepEqual(plain.grantMastery(), [])
  assert.equal(plain.isDukeUnlocked(1), false)
  const slot = await masteredSlot()
  assert.equal(slot.mastered, true)
  assert.equal(slot.starCount, 300)
  assert.equal(slot.achievementCount, 300)
  assert.deepEqual(slot.grantMastery(), ['gold', 'comet'])
  assert.deepEqual(slot.grantMastery(), [], 'une seule fois')
  assert.equal(slot.equip('gold'), true)
  assert.equal(slot.equip('comet'), true)
  assert.equal(slot.effects.skin, 'gold')
  assert.equal(slot.buyCosmetic('gold'), false, 'jamais vendu')
  // La Légende n'apparaît dans la Chronique qu'à la maîtrise.
  assert.ok(!StoryRepository.unlocked(100, false).some((b) => b.id === 'legend'))
  assert.ok(StoryRepository.unlocked(100, true).some((b) => b.id === 'legend'))
  // Relu comme au chargement (avec le contrôle des records de l'application).
  const check = (id, rec, track) => {
    const l = track === 'heroic' ? LevelRepository.heroic(id) : LevelRepository.get(id)
    return rec.shots <= l.par ? 3 : rec.shots <= l.star2 ? 2 : 1
  }
  const back = SaveSlot.fromJSON(0, JSON.parse(JSON.stringify(slot.toJSON())), check)
  assert.equal(back.mastered, true)
  // Un profil non maîtrisé qui prétend à l'Engin d'or est refusé.
  const forged = JSON.parse(JSON.stringify(plain.toJSON()))
  forged.cosmetics.owned.push('gold')
  assert.throws(() => SaveSlot.fromJSON(1, forged), /mastery required/)
})

test('v6.2 : Campagne héroïque : la maîtrise l’ouvre, ses paliers d’atelier aussi, ses médailles sont à part', async () => {
  const { SaveSlot } = await import('../src/domain/SaveSlot.js')
  const { UpgradeCatalog } = await import('../src/game/progression/UpgradeCatalog.js')
  const plain = SaveSlot.create(1, 'Apprenti', 'normal')
  assert.equal(plain.startHeroic(), false, 'la maîtrise d’abord')
  const slot = await masteredSlot()
  // Tous les paliers ordinaires du bras, puis le palier héroïque : fermé tant que la campagne héroïque n'a pas commencé.
  const arm = UpgradeCatalog.upgrade('arm')
  for (let i = 0; i < arm.base; i++) assert.equal(slot.buyUpgrade('arm'), true)
  assert.equal(arm.isHeroic(arm.base + 1), true)
  assert.equal(slot.buyUpgrade('arm'), false, 'palier héroïque fermé')
  assert.equal(slot.isHeroicUnlocked(1), false)
  assert.equal(slot.startHeroic(), true)
  assert.equal(slot.buyUpgrade('arm'), true, 'palier héroïque ouvert')
  assert.equal(slot.upgrades.arm, arm.maxLevel)
  // Médailles : seulement des résultats héroïques, dans l'ordre.
  const second = await win(2, 'heroic')
  assert.throws(() => slot.recordHeroic(second), /locked/)
  const campaign = await win(1, 'campaign')
  assert.throws(() => slot.recordHeroic(campaign), /not a heroic result/)
  const heroicOne = await win(1, 'heroic')
  assert.throws(() => slot.recordResult(heroicOne), /not a campaign result/)
  const out = slot.recordHeroic(await win(1, 'heroic', { stars: 2 }))
  assert.equal(out.firstClear, true)
  assert.equal(slot.heroic.levels[1].stars, 2)
  assert.equal(slot.isHeroicUnlocked(2), true)
  assert.equal(slot.recordHeroic(await win(1, 'heroic', { stars: 3, score: 9000 })).newBest, true)
  assert.equal(slot.heroic.levels[1].stars, 3)
  // Relue : la progression et l'or restent cohérents (les médailles ne rapportent pas d'or).
  const back = SaveSlot.fromJSON(0, JSON.parse(JSON.stringify(slot.toJSON())))
  assert.equal(back.heroic.started, true)
  assert.equal(back.upgrades.arm, arm.maxLevel)
})

test('v6.2 : la Campagne héroïque renforce les châteaux, ôte un tir, ajoute un pillard et forcit le vent', async () => {
  const { GameSession, STATE } = await import('../src/game/GameSession.js')
  const { createMode, HeroicMode } = await import('../src/game/modes/modes.js')
  const { HEROIC } = await import('../src/game/progression/Mastery.js')
  const id = 64
  const plain = LevelRepository.get(id)
  const heroic = LevelRepository.heroic(id)
  assert.equal(heroic.track, 'heroic')
  assert.equal(heroic.targets.filter((t) => t.raid).length, plain.targets.filter((t) => t.raid).length + 1)
  const mode = createMode('heroic', { completedLevels: 100 })
  assert.ok(mode instanceof HeroicMode)
  assert.equal(mode.windFactor, HEROIC.WIND)
  const a = new GameSession(plain, { difficulty: 'normal', completedLevels: 100, reducedMotion: true }, createMode('story', { completedLevels: 100 }))
  const b = new GameSession(heroic, { difficulty: 'normal', completedLevels: 100, reducedMotion: true }, mode)
  assert.equal(b.player.shotsTotal, Math.max(2, a.player.shotsTotal + HEROIC.SHOTS))
  const hp = (s) => [...s.world.entities()].filter((e) => e.kind === 'block' && !e.terrain).map((e) => e.maxHp)
  assert.ok(Math.abs(hp(b)[0] / hp(a)[0] - HEROIC.FORTIFY.blocks) < 1e-9)
  const soldier = (s) => [...s.world.entities()].find((e) => e.kind === 'target' && e.type === 'soldier' && !e.raid)
  assert.ok(soldier(b).maxHp > soldier(a).maxHp)
  let g = 0
  while (b.state !== STATE.AIMING && g++ < 400) b.update(1000 / 60)
  assert.ok(b.world.joints.size > 0)
})

test('v6.2 : les Terres du Duc : cinq châteaux à médailles, le dernier gardé par Mordrac', async () => {
  const { DukeRepository } = await import('../src/game/levels/DukeRepository.js')
  const all = DukeRepository.all()
  assert.equal(all.length, 5)
  assert.ok(all.every((l) => l.track === 'duke'))
  assert.equal(DukeRepository.get(5).general, 'mordrac')
  assert.equal(DukeRepository.get(5).stageCount, 2)
  const slot = await masteredSlot()
  assert.equal(slot.isDukeUnlocked(1), true)
  assert.equal(slot.isDukeUnlocked(2), false)
  slot.recordDuke(await win(1, 'duke', { stars: 1 }))
  assert.equal(slot.duke[1].stars, 1)
  assert.equal(slot.isDukeUnlocked(2), true)
  for (const lang of ['fr', 'en', 'id']) {
    const d = DICTIONARIES[lang]
    for (let id = 1; id <= 5; id++) assert.ok(d.duke.names[id] && d.duke.lines[id], `${lang} duke ${id}`)
    assert.ok(d.story.legend.p3 && d.mastery.title && d.heroic.start, lang)
  }
})
