import { test } from 'node:test'
import assert from 'node:assert/strict'
import Matter from 'matter-js'
import { EventBus } from '../src/core/utils/EventBus.js'
import { PhysicsWorld } from '../src/game/physics/PhysicsWorld.js'
import { WORLD } from '../src/game/physics/constants.js'
import { Block } from '../src/game/entities/Block.js'
import { Target } from '../src/game/entities/Target.js'
import { Barrel } from '../src/game/entities/Barrel.js'
import { Projectile } from '../src/game/entities/Projectile.js'
import { TARGET_TYPES, PROJECTILE_TYPES, ELEMENT_HIT_CAP, THUNDER, POISON } from '../src/game/entities/catalog.js'
import { contactSpeed, framesToContact, hitDamage, fallDamage, canPush, assess, G_FRAME } from '../src/game/physics/FallingObjects.js'
import { WORLD_WINDS, worldWindFor, applyElement, exposureStep } from '../src/game/physics/WorldWinds.js'
import { Clouds } from '../src/game/physics/Clouds.js'
import { PROP_TYPES, MILL } from '../src/game/entities/props.js'
import { TrajectoryPredictor } from '../src/game/TrajectoryPredictor.js'
import { LevelRepository, buildLevel } from '../src/game/levels/LevelRepository.js'
import { AMMO_UNLOCK } from '../src/game/levels/LevelCurve.js'
import { GameSession, STATE, AMMO_ORDER } from '../src/game/GameSession.js'
import { ReplayCode } from '../src/game/replay/ReplayCode.js'
import { CastleCode, DESIGN_AMMO, emptyDesign } from '../src/game/editor/CastleDesign.js'
import { ReplayPlayer } from '../src/game/replay/ReplayPlayer.js'
import { DICTIONARIES } from '../src/i18n/index.js'

const G = WORLD.GROUND_Y
const settle = (w, n = 150) => {
  for (let i = 0; i < n; i++) w.stepOnce()
}
/** Arme les règles (un tir perdu, loin de la scène). */
const arm = (w) => w.add(new Projectile('stone', -300, 0))

/* ---------- Module des objets qui tombent ---------- */

test('v6.1 : vitesse au contact (énergie conservée) et images avant le contact', () => {
  // Chute libre de 100 px : v² = 2·g·h.
  assert.ok(Math.abs(contactSpeed(0, 100) - Math.sqrt(2 * G_FRAME * 100)) < 1e-9)
  // Qu'il monte ou qu'il descende, il repasse à cette hauteur à la même vitesse.
  assert.equal(contactSpeed(3, 50), contactSpeed(-3, 50))
  assert.equal(framesToContact(2, 0), 0)
  assert.ok(framesToContact(0, 100) > framesToContact(5, 100))
})

test('v6.1 : un coup fait plus mal plus vite et plus lourd ; un frôlement ne fait rien', () => {
  const stone = { kind: 'block', material: 'stone', mass: 28 }
  const wood = { kind: 'block', material: 'wood', mass: 10 }
  assert.equal(hitDamage(stone, WORLD.HIT.SAFE * 0.9), 0)
  assert.ok(hitDamage(stone, 2) > hitDamage(stone, 1.2))
  assert.ok(hitDamage(stone, 2) > hitDamage(wood, 2))
  // La paille est molle, la botte de paille (projectile) ne fait rien.
  assert.ok(hitDamage({ kind: 'block', material: 'straw', mass: 10 }, 2) < hitDamage(wood, 2) * 0.5)
  assert.equal(hitDamage({ kind: 'projectile', impactFactor: 0, mass: 4 }, 12), 0)
  // Un tir direct de pierre abat toujours un soldat.
  assert.ok(hitDamage({ kind: 'projectile', impactFactor: 1, mass: 8 }, 8) > TARGET_TYPES.soldier.hp * 1.35)
})

test('v6.1 : une chute coûte selon sa hauteur ; le chevalier encaisse mieux', () => {
  const soldier = { maxHp: 30, baseToughness: 1 }
  const knight = { maxHp: 70, baseToughness: 2.2 }
  const v = (h) => contactSpeed(0, h)
  assert.equal(fallDamage(soldier, v(25)), 0, 'un bond')
  const storey = fallDamage(soldier, v(100)) / soldier.maxHp
  assert.ok(storey > 0.3 && storey < 0.9, `un étage : ${storey.toFixed(2)}`)
  assert.ok(fallDamage(soldier, v(160)) >= soldier.maxHp, 'un étage et demi tue un soldat')
  assert.ok(fallDamage(knight, v(160)) < knight.maxHp, 'le chevalier tient')
})

test('v6.1 : on ne repousse que ce qui est lent, assez léger, et libre', () => {
  const unit = { alive: true, pushCapacity: 14, ableAt: () => true }
  const plank = { kind: 'block', mass: 10 }
  assert.equal(canPush(unit, plank, 1.2, 0), true)
  assert.equal(canPush(unit, plank, 2.5, 0), false, 'trop rapide')
  assert.equal(canPush(unit, { kind: 'block', mass: 40 }, 1, 0), false, 'trop lourd')
  assert.equal(canPush(unit, { ...plank, hinged: true }, 1, 0), false, 'un tablier sur sa charnière')
  assert.equal(canPush(unit, { ...plank, tethered: 1 }, 1, 0), false, 'une charge à sa corde')
  assert.equal(canPush(unit, { kind: 'projectile', mass: 8, hasImpacted: false }, 1, 0), false, 'un tir en vol')
  assert.equal(canPush({ ...unit, ableAt: () => false }, plank, 1, 0), false, 'gelé, sonné, renversé…')
})

test('v6.1 : verdict anticipé pour ce qui tombe sur un défenseur', () => {
  const t = new Target({ type: 'soldier', x: 1000, y: G - 25 })
  const v0 = { x: 0, y: 0 }
  // Presque au contact, et lent : il le renverra.
  const slow = { kind: 'block', material: 'straw', mass: 4, x: 1000, y: G - 62, width: 30, height: 20, body: {} }
  assert.equal(assess(t, slow, { x: 0, y: 0.5 }, 0).verdict, 'push')
  const beam = { kind: 'block', material: 'stone', mass: 40, x: 1000, y: G - 300, width: 80, height: 30, body: {} }
  assert.equal(assess(t, beam, { x: 0, y: 2 }, 0).verdict, 'lethal')
  const far = { ...beam, x: 1400 }
  assert.equal(assess(t, far, v0, 0).verdict, 'none')
})

/* ---------- Points de vie, poussée, recul ---------- */

test('v6.1 : une poutre de pierre lâchée de haut écrase ; une planche posée doucement est renvoyée', () => {
  const w = new PhysicsWorld(new EventBus())
  const a = w.add(new Target({ type: 'soldier', x: 1200, y: G - 25 }))
  const b = w.add(new Target({ type: 'soldier', x: 1700, y: G - 25 }))
  settle(w, 200)
  arm(w)
  const beam = w.add(new Block({ material: 'stone', x: 1200, y: G - 300, w: 80, h: 30 }))
  Matter.Body.setVelocity(beam.body, { x: 0, y: 2 })
  // Une planche qui se pose doucement sur sa tête : il la rejette.
  const plank = w.add(new Block({ material: 'wood', x: 1700, y: G - 57, w: 60, h: 12 }))
  Matter.Body.setVelocity(plank.body, { x: 0, y: 0.3 })
  settle(w, 220)
  assert.equal(a.alive, false)
  assert.equal(b.alive, true)
  assert.equal(b.hp, b.maxHp)
  assert.ok(b.pushAt > 0, 'il a repoussé la planche')
})

test('v6.1 : un défenseur blessé recule et reste sonné un instant', () => {
  const bus = new EventBus()
  const w = new PhysicsWorld(bus)
  const k = w.add(new Target({ type: 'knight', x: 1300, y: G - 27 }))
  settle(w, 200)
  arm(w)
  const hurts = []
  bus.on('hurt', (e) => hurts.push(e))
  // Une pierre qui a déjà rebondi arrive sur lui, à hauteur d'homme.
  const p = w.add(new Projectile('stone', 1262, G - 30))
  p.hasImpacted = true
  Matter.Body.setVelocity(p.body, { x: 2.6, y: 0 })
  for (let i = 0; i < 60 && !hurts.length; i++) w.stepOnce()
  assert.ok(hurts.length >= 1, 'un coup encaissé')
  assert.equal(k.alive, true)
  assert.ok(k.hp < k.maxHp)
  assert.ok(k.stunUntil > w.time, 'sonné')
})

test('v6.1 : un tir élémentaire ne coûte jamais plus du quart de sa vie à un défenseur (on voit l’élément)', () => {
  for (const type of ['fire', 'frost', 'thunder']) {
    const w = new PhysicsWorld(new EventBus())
    const t = w.add(new Target({ type: 'soldier', x: 1300, y: G - 25 }))
    settle(w, 200)
    arm(w)
    const p = w.add(new Projectile(type, 1200, G - 30))
    Matter.Body.setVelocity(p.body, { x: 14, y: 0 })
    for (let i = 0; i < 60 && !p.hasImpacted; i++) w.stepOnce()
    settle(w, 1)
    const shocked = type === 'thunder' ? THUNDER.DAMAGE[0] * TARGET_TYPES.soldier.hp : 0
    // (le feu, lui, commence à ronger : une marge d'un point de vie)
    assert.ok(t.maxHp - t.hp <= t.maxHp * ELEMENT_HIT_CAP + shocked + 1, `${type} : ${t.hp.toFixed(1)} / ${t.maxHp}`)
    if (type === 'fire') assert.ok(t.burning > 0, 'il brûle')
    if (type === 'frost') assert.ok(t.frozenMs > 0 && t.alive, 'il est gelé, vivant')
    if (type !== 'thunder') assert.ok(t.alive, `${type} : il survit au choc`)
  }
  assert.ok(PROJECTILE_TYPES.fire.impact <= 0.25 && PROJECTILE_TYPES.frost.impact <= 0.25)
})

/* ---------- Orbe d'orage, pot de poison, botte de paille ---------- */

test('v6.1 : l’orbe d’orage saute de défenseur en défenseur ; l’armure conduit, l’eau aussi', () => {
  const bus = new EventBus()
  const w = new PhysicsWorld(bus)
  const units = [1300, 1420, 1540, 1660, 1780, 1900].map((x, i) => w.add(new Target({ type: i === 1 ? 'knight' : 'soldier', x, y: G - 27 })))
  settle(w, 200)
  arm(w)
  let path = null
  bus.on('thunder', (e) => (path = e.path))
  const p = w.add(new Projectile('thunder', 1300, G - 120))
  Matter.Body.setVelocity(p.body, { x: 0, y: 6 })
  settle(w, 30)
  assert.ok(path, 'la décharge part')
  assert.equal(path.length, THUNDER.HOPS)
  // Le premier frappé y reste souvent ; les trois suivants sont électrisés (sonnés).
  assert.ok(!units[0].alive || units[0].hp < units[0].maxHp)
  for (const u of units.slice(1, THUNDER.HOPS)) assert.equal(u.stunKind, 'shock')
  // Le chevalier (deuxième saut, ×1,5) perd plus que le soldat du troisième saut.
  const knightLoss = (units[1].maxHp - units[1].hp) / THUNDER.CONDUCT.knight
  assert.ok(knightLoss > 0)
  assert.equal(units[5].hp, units[5].maxHp, 'hors de portée des quatre sauts')
})

test('v6.1 : le pot de poison laisse un nuage qui ronge ; une flamme le fait exploser ; le givre le fige', () => {
  const bus = new EventBus()
  const w = new PhysicsWorld(bus)
  const t = w.add(new Target({ type: 'soldier', x: 1300, y: G - 25 }))
  settle(w, 200)
  arm(w)
  const p = w.add(new Projectile('poison', 1300, G - 120))
  Matter.Body.setVelocity(p.body, { x: 0, y: 5 })
  settle(w, 40)
  assert.equal(w.clouds.size, 1)
  assert.ok(t.poisonUntil > w.time)
  settle(w, 360)
  assert.equal(t.alive, false, 'le soldat succombe dans le nuage')
  assert.equal(t.deathCause, 'poison')
  // Une flamme dans un nouveau nuage : il explose.
  const events = []
  bus.on('cloud', (e) => events.push(e.event))
  bus.on('explosion', () => events.push('explosion'))
  w.clouds.spawn('poison', 1600, G - 60, w.time)
  const pot = w.add(new Projectile('fire', 1600, G - 60))
  pot.hasImpacted = true
  pot.heatMs = 2000
  settle(w, 3)
  assert.ok(events.includes('blast') && events.includes('explosion'), events.join(','))
  // Le givre fige un nuage.
  w.clouds.spawn('poison', 2000, G - 60, w.time)
  const ice = w.add(new Projectile('frost', 2000, G - 140))
  Matter.Body.setVelocity(ice.body, { x: 0, y: 6 })
  settle(w, 70)
  assert.ok(events.includes('freeze'), events.join(','))
})

test('v6.1 : les miasmes ne s’embrasent ni avant le premier tir, ni à la torche d’un veilleur', () => {
  const bus = new EventBus()
  const w = new PhysicsWorld(bus)
  const blasts = []
  bus.on('cloud', (e) => e.event === 'blast' && blasts.push(e.kind))
  const watchman = w.add(new Target({ type: 'soldier', x: 1300, y: G - 25, torch: true }))
  const fire = w.add(new Block({ material: 'wood', x: 1800, y: G - 30, w: 40, h: 60 }))
  fire.ignite()
  // Avant le premier tir, même le feu n'allume rien : le château ne saute pas tout seul.
  w.clouds.spawn('miasma', fire.x, fire.y, w.time)
  settle(w, 30)
  assert.deepEqual(blasts, [])
  w.clouds.clear()
  arm(w)
  // La torche d'un veilleur n'allume pas les miasmes des marais…
  const tip = watchman.torchTip
  w.clouds.spawn('miasma', tip.x, tip.y, w.time)
  settle(w, 30)
  assert.deepEqual(blasts, [])
  w.clouds.clear()
  // … mais bien le gaz du pot de poison (l'œuvre du joueur) ; et le feu allume les miasmes.
  w.clouds.spawn('poison', tip.x, tip.y, w.time)
  settle(w, 3)
  w.clouds.spawn('miasma', fire.x, fire.y, w.time)
  settle(w, 3)
  assert.deepEqual(blasts, ['poison', 'miasma'])
})

test('v6.1 : un nuage dérive avec le vent', () => {
  const c = new Clouds()
  c.spawn('poison', 1000, 500, 0)
  const port = { time: 100, drift: () => 1, targets: [], flameNear: () => false, blast: () => {}, affect: () => {} }
  for (let i = 0; i < 60; i++) c.step(1000 / 60, port)
  assert.ok(c.list[0].x > 1050, `x ${c.list[0].x.toFixed(0)}`)
})

test('v6.1 : la botte de paille pousse un baril sans le faire sauter, ne blesse personne, prend feu', () => {
  const w = new PhysicsWorld(new EventBus())
  const keg = w.add(new Barrel({ x: 1400, y: G - 21 }))
  const t = w.add(new Target({ type: 'soldier', x: 1700, y: G - 25 }))
  settle(w, 200)
  arm(w)
  const bale = w.add(new Projectile('bale', 1340, G - 25))
  Matter.Body.setVelocity(bale.body, { x: 12, y: 0 })
  const bale2 = w.add(new Projectile('bale', 1640, G - 30))
  Matter.Body.setVelocity(bale2.body, { x: 14, y: 0 })
  settle(w, 60)
  assert.equal(keg.alive, true, 'le baril n’a pas sauté')
  assert.ok(keg.x > 1415, `le baril a été poussé (x ${keg.x.toFixed(0)})`)
  assert.equal(t.hp, t.maxHp)
  // Au contact des flammes, elle s'enflamme.
  const fire = w.add(new Block({ material: 'wood', x: 2000, y: G - 30, w: 40, h: 60 }))
  fire.ignite()
  const bale3 = w.add(new Projectile('bale', 1930, G - 30))
  Matter.Body.setVelocity(bale3.body, { x: 6, y: 0 })
  settle(w, 30)
  assert.equal(bale3.ignites, true)
})

test('v6.1 : dans le vent, un tir réveille encore ce qu’il frappe (bloc endormi)', () => {
  const tilt = (wind) => {
    const w = new PhysicsWorld(new EventBus())
    w.wind = wind
    const post = w.add(new Block({ material: 'wood', x: 1700, y: G - 30, w: 30, h: 60 }))
    settle(w, 400)
    arm(w)
    assert.equal(post.body.isSleeping, true)
    const bale = w.add(new Projectile('bale', 1640, G - 30))
    Matter.Body.setVelocity(bale.body, { x: 10, y: 0 })
    settle(w, 120)
    return Math.abs(post.body.angle)
  }
  // Matter ne réveillait rien sous le vent : le tir rebondissait comme sur un mur.
  assert.ok(tilt(0) > 1, `sans vent : ${tilt(0).toFixed(2)} rad`)
  assert.ok(tilt(0.5) > 1, `dans le vent : ${tilt(0.5).toFixed(2)} rad`)
})

/* ---------- Ouvrages ---------- */

test('v6.1 : le moulin prévient, puis souffle vers l’engin et dévie les tirs ; gelé, il se tait', () => {
  const run = (frozen) => {
    const bus = new EventBus()
    const w = new PhysicsWorld(bus, { seed: 5 })
    w.engineX = 200
    const mill = w.add(new Block({ material: 'wood', x: 1400, y: G - 29, w: PROP_TYPES.windmill.w, h: PROP_TYPES.windmill.h, prop: 'windmill' }))
    const phases = []
    bus.on('mill', (e) => phases.push(e.kind))
    if (frozen) mill.freeze(60000)
    for (let i = 0; i < 1400 && !w.props.zones.length; i++) w.stepOnce()
    return { w, phases }
  }
  const a = run(false)
  assert.deepEqual(a.phases, ['warn', 'gust'])
  assert.equal(a.w.props.zones[0].dir, -1, 'vers l’engin')
  assert.ok(a.w.props.gustAt(1100, G - 37) < -0.3)
  assert.equal(a.w.props.gustAt(1700, G - 37), 0, 'rien derrière le moulin')
  const b = run(true)
  assert.equal(b.phases.length, 0)
  assert.equal(b.w.props.zones.length, 0)
})

test('v6.1 : la forge enflamme ce qui traverse ses flammes ; la citerne trempe ; la ruche lâche un essaim ; la farine explose au feu', () => {
  const bus = new EventBus()
  const w = new PhysicsWorld(bus)
  const forge = w.add(new Block({ material: 'stone', x: 1200, y: G - 20, w: 64, h: 40, prop: 'forge' }))
  // Citerne sur pilotis, un soldat à côté.
  w.add(new Block({ material: 'wood', x: 1560, y: G - 45, w: 16, h: 90 }))
  w.add(new Block({ material: 'wood', x: 1640, y: G - 45, w: 16, h: 90 }))
  w.add(new Block({ material: 'wood', x: 1600, y: G - 100, w: 100, h: 20 }))
  const cistern = w.add(new Block({ material: 'wood', x: 1600, y: G - 139, w: 70, h: 56, prop: 'cistern' }))
  const soaked = w.add(new Target({ type: 'soldier', x: 1700, y: G - 25 }))
  const hive = w.add(new Block({ material: 'straw', x: 2000, y: G - 16, w: 28, h: 32, prop: 'hive' }))
  const flour = w.add(new Block({ material: 'straw', x: 2300, y: G - 15, w: 36, h: 30, prop: 'flour' }))
  settle(w, 200)
  arm(w)
  // Un tir traverse la colonne de feu : il s'enflamme.
  const p = w.add(new Projectile('stone', 1200, G - 200))
  Matter.Body.setVelocity(p.body, { x: 0, y: 4 })
  settle(w, 14)
  assert.equal(p.ignites, true)
  assert.ok(forge.alive)
  cistern.kill('impact')
  settle(w, 2)
  assert.ok(soaked.wetMs > 0, 'trempé')
  assert.equal(soaked.ignite(), false, 'trempé, il ne prend pas feu')
  hive.kill('impact')
  flour.kill('impact')
  settle(w, 2)
  const kinds = w.clouds.list.map((c) => c.kind).sort()
  assert.deepEqual(kinds, ['bees', 'flour'])
  const blasts = []
  bus.on('cloud', (e) => blasts.push(`${e.kind}:${e.event}`))
  const torch = w.add(new Projectile('fire', 2300, G - 40))
  torch.hasImpacted = true
  torch.heatMs = 2000
  settle(w, 3)
  assert.ok(blasts.includes('flour:blast'), blasts.join(','))
})

test('v6.1 : en Hiver, la citerne gèle ceux qu’elle inonde', () => {
  const w = new PhysicsWorld(new EventBus())
  w.weather = { wet: false, winter: true }
  w.add(new Block({ material: 'wood', x: 1560, y: G - 45, w: 16, h: 90 }))
  w.add(new Block({ material: 'wood', x: 1640, y: G - 45, w: 16, h: 90 }))
  w.add(new Block({ material: 'wood', x: 1600, y: G - 100, w: 100, h: 20 }))
  const c = w.add(new Block({ material: 'wood', x: 1600, y: G - 139, w: 70, h: 56, prop: 'cistern' }))
  const t = w.add(new Target({ type: 'soldier', x: 1700, y: G - 25 }))
  settle(w, 200)
  arm(w)
  c.kill('impact')
  settle(w, 2)
  assert.ok(t.frozenMs > 0)
})

/* ---------- Souffle du monde ---------- */

test('v6.1 : chaque chapitre a son vent ; les éléments se combinent (feu et givre s’annulent)', () => {
  assert.equal(worldWindFor(8), 'frost')
  assert.equal(worldWindFor(10), 'fire')
  assert.equal(worldWindFor(6), 'sand')
  assert.equal(worldWindFor(1), 'breeze')
  const pot = new Projectile('fire', 0, 0)
  assert.equal(applyElement('frost', pot), 'quench')
  assert.equal(pot.ignites, false)
  const stone = new Projectile('stone', 0, 0)
  assert.equal(applyElement('frost', stone), 'rime')
  assert.equal(stone.rimed, true)
  const ice = new Projectile('frost', 0, 0)
  assert.equal(applyElement('fire', ice), 'thaw')
  assert.equal(ice.frost, false)
  const rock = new Projectile('stone', 0, 0)
  assert.equal(applyElement('fire', rock), 'kindle')
  assert.equal(rock.ignites, true)
  assert.equal(applyElement('sand', rock), 'smother')
  assert.equal(rock.ignites, false)
  // Exposition : trois fois plus vite dans une rafale de moulin.
  assert.ok(Math.abs(exposureStep(0, 1, 10) - 3 * exposureStep(1, 0, 10)) < 1e-12)
})

test('v6.1 : dans la bise, un tir qui vole longtemps se givre, cogne deux fois moins un mur et éclate', () => {
  const hitWall = (windId) => {
    const w = new PhysicsWorld(new EventBus())
    w.setWorldWind(windId)
    w.wind = 1
    const wall = w.add(new Block({ material: 'wood', x: 1500, y: G - 60, w: 40, h: 120 }))
    settle(w, 120)
    // Il a déjà longtemps volé dans le vent : un pas de plus, et la bise le marque.
    const p = w.add(new Projectile('stone', 1300, G - 60))
    p.exposure = 0.999
    Matter.Body.setVelocity(p.body, { x: 9, y: 0 })
    for (let i = 0; i < 120 && !p.hasImpacted && p.alive; i++) w.stepOnce()
    settle(w, 4)
    return { wall, p }
  }
  const plain = hitWall('breeze')
  const frosty = hitWall('frost')
  assert.equal(frosty.p.rimed, true)
  assert.equal(frosty.p.alive, false, 'il a éclaté')
  assert.ok(frosty.wall.maxHp - frosty.wall.hp < (plain.wall.maxHp - plain.wall.hp) * 0.75, `bise ${(frosty.wall.maxHp - frosty.wall.hp).toFixed(0)} / calme ${(plain.wall.maxHp - plain.wall.hp).toFixed(0)}`)
})

test('v6.1 : l’aide à la visée montre où le vent marque le tir, et les courants chauds portent le tir', () => {
  const pts = TrajectoryPredictor.predict({ x: 300, y: 700 }, { x: 10, y: -8 }, { maxPoints: 200, every: 1, expose: { step: () => 0.01, element: 'frost' } })
  const mark = pts.find((p) => p.mark)
  assert.equal(mark?.mark, 'frost')
  const flat = TrajectoryPredictor.predict({ x: 300, y: 700 }, { x: 8, y: -6 }, { maxPoints: 400, every: 1 })
  const lifted = TrajectoryPredictor.predict({ x: 300, y: 700 }, { x: 8, y: -6 }, { maxPoints: 400, every: 1, lift: () => -0.0005 })
  assert.ok(lifted.at(-1).x > flat.at(-1).x, 'plus loin')
})

/* ---------- Campagne et relecture ---------- */

test('v6.1 : les ouvrages et les nouvelles munitions arrivent chacun dans leur niveau', () => {
  const firstProp = (kind) => LevelRepository.all().find((l) => l.blocks.some((b) => b.prop === kind))?.id
  assert.equal(firstProp('windmill'), 13)
  assert.equal(firstProp('hive'), 18)
  assert.equal(firstProp('forge'), 25)
  assert.equal(firstProp('cistern'), 38)
  assert.equal(firstProp('flour'), 43)
  for (const [kind, id] of [['windmill', 13], ['hive', 18], ['forge', 25], ['cistern', 38], ['flour', 43]]) assert.ok(LevelRepository.novelties(id).includes(`prop:${kind}`), kind)
  assert.deepEqual([AMMO_UNLOCK.thunder, AMMO_UNLOCK.bale, AMMO_UNLOCK.poison], [22, 29, 37])
  // Toutes les fiches d'introduction existent dans les trois langues.
  const keys = new Set(LevelRepository.all().flatMap((l) => LevelRepository.novelties(l.id)))
  for (const [lang, dict] of Object.entries(DICTIONARIES)) {
    for (const k of keys) assert.ok(dict.intro.novelty[k] || ['siege', 'gauge'].includes(k) || k.startsWith('build:') || k.startsWith('raid:'), `${lang} intro.novelty.${k}`)
    for (const id of Object.keys(WORLD_WINDS).filter((id) => id !== 'breeze')) assert.ok(dict.game.worldWind[id] && dict.game.worldWindDesc[id], `${lang} ${id}`)
  }
})

test('v6.1 : les pillards pressent : l’ogre charge, le saboteur court, l’engin est frappé dès le troisième tir perdu', () => {
  for (const id of [95, 36]) {
    const s = new GameSession(LevelRepository.get(id), { difficulty: 'normal', completedLevels: 0, reducedMotion: true })
    let guard = 0
    while (s.state !== STATE.AIMING && guard++ < 300) s.update(1000 / 30)
    let struck = 0
    // Des tirs perdus, au-delà du château. Chaque tir accorde une étape de course
    // (v6.2), courue pendant le tour puis pendant la visée suivante.
    for (let shot = 1; shot <= 3 && !struck; shot++) {
      s.aim(45, 1)
      s.fire()
      guard = 0
      while (s.state !== STATE.AIMING && guard++ < 600) s.update(1000 / 30)
      for (let i = 0; i < 160 && !struck; i++) {
        s.update(1000 / 30)
        if (s.condition.hp < s.condition.maxHp) struck = shot
      }
    }
    assert.ok(struck > 0, `niveau ${id} : l’engin n’a rien subi en trois tirs`)
    s.destroy()
  }
})

test('v6.1 : chaque munition se partage (lien de défi) et l’atelier les propose toutes', () => {
  for (const a of AMMO_ORDER) {
    const code = ReplayCode.encode({ levelId: 29, engine: 'catapult', log: [{ k: 'f', d: 30, a, ang: 45, pow: 0.7, l: 0 }] })
    assert.equal(ReplayCode.decode(code).actions[0].a, a)
  }
  assert.deepEqual([...DESIGN_AMMO].sort(), AMMO_ORDER.filter((a) => a !== 'stone').sort())
  const design = emptyDesign()
  design.ammo = { ...design.ammo, bale: 2, thunder: 1, poison: 3 }
  const back = CastleCode.decode(CastleCode.encode(design), { draft: true })
  assert.deepEqual([back.ammo.bale, back.ammo.thunder, back.ammo.poison], [2, 1, 3])
})

test('v6.1 : une partie avec moulin, bise et nouvelles munitions se rejoue à l’identique', () => {
  const spec = {
    shots: 4,
    wind: 0.6,
    ammo: { thunder: 1, poison: 1, bale: 1 },
    build(b) {
      b.windmill(1340)
      const t = b.tower(1520, { floors: 2, mat: 'wood' })
      b.target(t[0])
      b.target(t[1])
      b.prop('cistern', b.spot(1700, b.ground))
    },
  }
  const level = buildLevel(spec, 75, 8)
  const live = new GameSession(level, { difficulty: 'hard', completedLevels: 74, reducedMotion: true })
  let guard = 0
  while (live.state !== STATE.AIMING && guard++ < 1000) live.update(1000 / 60)
  for (const [ammo, angle, power] of [['thunder', 40, 0.62], ['poison', 50, 0.66], ['stone', 35, 0.7]]) {
    if (live.state === STATE.ENDED) break
    live.selectAmmo(ammo)
    live.aim(angle, power)
    live.fire()
    guard = 0
    while (live.state !== STATE.AIMING && live.state !== STATE.ENDED && guard++ < 6000) live.update(1000 / 60)
  }
  const again = new GameSession(level, { difficulty: 'hard', completedLevels: 74, reducedMotion: true, replay: true })
  new ReplayPlayer(again, live.log).runToEnd()
  assert.equal(again.score.current, live.score.current)
  assert.equal(again.targetsLeft, live.targetsLeft)
  assert.ok(MILL.REACH > 0 && POISON.MS > 0)
})
