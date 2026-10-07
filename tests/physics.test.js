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

const G = WORLD.GROUND_Y

function hut(world, material) {
  world.add(new Block({ material, x: 1400, y: G - 50, w: 20, h: 100 }))
  world.add(new Block({ material, x: 1480, y: G - 50, w: 20, h: 100 }))
  world.add(new Block({ material, x: 1440, y: G - 110, w: 120, h: 20 }))
  return world.add(new Target({ type: 'soldier', x: 1440, y: G - 25 }))
}

function fire(world, type, speed, angle, mods) {
  const p = world.add(new Projectile(type, 260, 760, mods))
  Matter.Body.setVelocity(p.body, { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed })
  return p
}

const settle = (w, n = 150) => {
  for (let i = 0; i < n; i++) w.stepOnce()
}

test('une structure posée reste debout et intacte', () => {
  const w = new PhysicsWorld(new EventBus())
  const t = hut(w, 'wood')
  settle(w, 600)
  assert.equal(t.alive, true)
  assert.equal(w.filter((e) => e.kind === 'block' && e.alive).length, 3)
})

test('un tir direct détruit une cabane en bois et sa cible', () => {
  const ev = new EventBus()
  const destroyed = []
  ev.on('entity:destroyed', ({ entity }) => destroyed.push(entity.kind))
  const w = new PhysicsWorld(ev)
  const t = hut(w, 'wood')
  settle(w)
  fire(w, 'stone', 18, -0.62)
  settle(w, 1200)
  assert.equal(t.alive, false)
  assert.ok(destroyed.includes('block'))
})

test('la pierre résiste mieux que le bois', () => {
  const w = new PhysicsWorld(new EventBus())
  hut(w, 'stone')
  settle(w)
  fire(w, 'stone', 18, -0.62)
  settle(w, 1200)
  assert.ok(w.filter((e) => e.kind === 'block').length >= 2)
})

test('un baril explose et déclenche une réaction en chaîne', () => {
  const ev = new EventBus()
  let explosions = 0
  ev.on('explosion', () => explosions++)
  const w = new PhysicsWorld(ev)
  const b1 = w.add(new Barrel({ x: 1400, y: G - 21 }))
  w.add(new Barrel({ x: 1480, y: G - 21 }))
  settle(w)
  b1.damage(1000)
  settle(w, 120)
  assert.equal(explosions, 2)
  assert.equal(w.filter((e) => e.kind === 'barrel').length, 0)
})

test('la mitraille se divise en trois projectiles', () => {
  const w = new PhysicsWorld(new EventBus())
  const p = fire(w, 'split', 16, -0.8)
  settle(w, 20)
  const shards = w.splitProjectile(p)
  assert.equal(shards.length, 3)
  assert.equal(p.alive, false)
  assert.equal(w.splitProjectile(p).length, 0)
})

test('la simulation est déterministe (même tir, même résultat)', () => {
  const run = () => {
    const w = new PhysicsWorld(new EventBus(), { wind: 0.5, seed: 3 })
    hut(w, 'wood')
    settle(w)
    fire(w, 'fire', 18, -0.62)
    settle(w, 900)
    return w.filter(() => true).map((e) => `${e.kind}:${e.x.toFixed(3)}:${e.y.toFixed(3)}`).join('|')
  }
  assert.equal(run(), run())
})

test('le vent dévie la trajectoire', () => {
  const land = (wind) => {
    const w = new PhysicsWorld(new EventBus(), { wind })
    const p = fire(w, 'stone', 18, -Math.PI / 4)
    while (p.alive && !(p.y > G - 20 && p.body.velocity.y > 0)) w.stepOnce()
    return p.x
  }
  assert.ok(land(1) > land(0) + 40)
  assert.ok(land(-1) < land(0) - 40)
})

/* ---------- Règles structurelles (v1.1) ---------- */

/** Cabane en pierre stabilisée, puis une pierre lancée à plat sur le mur gauche. */
function hitLeftWall(material, speed, ammo = 'stone') {
  const w = new PhysicsWorld(new EventBus())
  const wall = w.add(new Block({ material, x: 1400, y: G - 50, w: 20, h: 100 }))
  w.add(new Block({ material, x: 1480, y: G - 50, w: 20, h: 100 }))
  const slab = w.add(new Block({ material, x: 1440, y: G - 110, w: 120, h: 20 }))
  const t = w.add(new Target({ type: 'soldier', x: 1440, y: G - 25 }))
  settle(w, 600)
  const slabY = slab.y
  const p = w.add(new Projectile(ammo, 1250, G - 60))
  Matter.Body.setVelocity(p.body, { x: speed, y: 0 })
  settle(w, 500)
  return { w, wall, slab, slabY, t }
}

test('rien ne reste suspendu quand un appui disparaît', () => {
  const w = new PhysicsWorld(new EventBus())
  const wall = w.add(new Block({ material: 'stone', x: 1400, y: G - 50, w: 20, h: 100 }))
  w.add(new Block({ material: 'stone', x: 1480, y: G - 50, w: 20, h: 100 }))
  const slab = w.add(new Block({ material: 'stone', x: 1440, y: G - 110, w: 120, h: 20 }))
  settle(w, 600)
  const before = slab.y
  wall.kill('impact')
  settle(w, 300)
  assert.ok(slab.y > before + 30, `le plancher doit tomber (avant ${before}, après ${slab.y})`)
})

test('un mur porteur frappé fort fait s’effondrer le plancher et écrase la cible', () => {
  const { slab, slabY, t } = hitLeftWall('wood', 16, 'boulder')
  assert.ok(!slab.alive || slab.y > slabY + 30, 'le plancher doit s’effondrer')
  assert.equal(t.alive, false)
})

test('une simple pierre ne renverse pas une cabane de pierre (structures solides)', () => {
  const { slab, slabY, t } = hitLeftWall('stone', 12, 'stone')
  assert.ok(slab.alive && Math.abs(slab.y - slabY) < 10, 'le plancher tient')
  assert.equal(t.alive, true)
})

test('un bloc en mouvement qui touche une cible la tue', () => {
  const w = new PhysicsWorld(new EventBus())
  const t = w.add(new Target({ type: 'soldier', x: 1440, y: G - 25 }))
  settle(w, 200)
  // Premier tir (arme les règles), loin de la scène.
  w.add(new Projectile('stone', 200, 200))
  // Une poutre de pierre lancée (assez d'énergie pour écraser).
  const beam = w.add(new Block({ material: 'stone', x: 1440, y: G - 200, w: 80, h: 30 }))
  Matter.Body.setVelocity(beam.body, { x: 0, y: 6 })
  settle(w, 200)
  assert.equal(t.alive, false)
  assert.ok(['crush', 'pinned'].includes(t.deathCause))
})

test('la moindre collision avec un objet en mouvement tue un personnage', () => {
  const w = new PhysicsWorld(new EventBus())
  const t = w.add(new Target({ type: 'knight', x: 1440, y: G - 27 }))
  settle(w, 200)
  w.add(new Projectile('stone', 200, 200))
  // Une simple botte de paille qui glisse doucement contre le chevalier.
  const twig = w.add(new Block({ material: 'straw', x: 1466, y: G - 20, w: 16, h: 40 }))
  Matter.Body.setVelocity(twig.body, { x: -1.5, y: 0 })
  settle(w, 200)
  assert.equal(t.alive, false)
})

test('un personnage immobile au milieu de blocs immobiles reste en vie', () => {
  const w = new PhysicsWorld(new EventBus())
  const t = hut(w, 'stone')
  settle(w, 300)
  w.add(new Projectile('stone', 200, 200))
  settle(w, 300)
  assert.equal(t.alive, true)
})

test('avant le premier tir, la mise en place de la structure ne tue personne', () => {
  const w = new PhysicsWorld(new EventBus())
  const t = w.add(new Target({ type: 'soldier', x: 1440, y: G - 25 }))
  w.add(new Block({ material: 'wood', x: 1440, y: G - 70, w: 80, h: 16 }))
  settle(w, 300)
  assert.equal(t.alive, true)
})

/* ---------- Cibles coincées (v1.4) ---------- */

/** Arme les règles d'écrasement avec un tir perdu, loin de la scène. */
const arm = (w) => w.add(new Projectile('stone', -300, 0))

test('une cible sur laquelle repose un bloc meurt écrasée', () => {
  const w = new PhysicsWorld(new EventBus())
  const t = w.add(new Target({ type: 'soldier', x: 1440, y: G - 25 }))
  settle(w, 200)
  arm(w)
  // Un lourd plancher de pierre posé doucement sur la tête (aucune vitesse : pas un impact).
  w.add(new Block({ material: 'stone', x: 1440, y: G - 50 - 11, w: 90, h: 20 }))
  settle(w, 120)
  assert.equal(t.alive, false)
  assert.ok(['pinned', 'crush'].includes(t.deathCause))
})

test('une cible prise en étau entre deux murs meurt écrasée', () => {
  const w = new PhysicsWorld(new EventBus())
  const t = w.add(new Target({ type: 'soldier', x: 1440, y: G - 25 }))
  w.add(new Block({ material: 'stone', x: 1440 - 13 - 15, y: G - 40, w: 30, h: 80 }))
  w.add(new Block({ material: 'stone', x: 1440 + 13 + 15, y: G - 40, w: 30, h: 80 }))
  settle(w, 200)
  assert.equal(t.alive, true, 'avant le premier tir, rien ne tue')
  arm(w)
  settle(w, 60)
  assert.equal(t.alive, false)
})

test('une cible dans une pièce, sans contact, reste en vie', () => {
  const w = new PhysicsWorld(new EventBus())
  const t = hut(w, 'stone')
  settle(w, 300)
  arm(w)
  settle(w, 200)
  assert.equal(t.alive, true)
})

/* ---------- Appuis et conditions de mort (v2.0) ---------- */

test('un personnage endormi sur une planche retombe quand la planche disparaît', () => {
  const w = new PhysicsWorld(new EventBus())
  w.add(new Block({ material: 'wood', x: 1300, y: G - 100, w: 20, h: 200 }))
  w.add(new Block({ material: 'wood', x: 1600, y: G - 100, w: 20, h: 200 }))
  const plank = w.add(new Block({ material: 'wood', x: 1450, y: G - 210, w: 320, h: 20 }))
  const t = w.add(new Target({ type: 'soldier', x: 1450, y: G - 220 - 26 }))
  settle(w, 600)
  const y0 = t.y
  plank.kill('impact')
  settle(w, 240)
  assert.ok(!t.alive || t.y > y0 + 100, `le personnage ne doit pas flotter (avant ${y0.toFixed(0)}, après ${t.y.toFixed(0)})`)
})

test('un personnage renversé trop longtemps est mis hors de combat', () => {
  const w = new PhysicsWorld(new EventBus())
  const t = w.add(new Target({ type: 'knight', x: 1440, y: G - 16, angle: 0 }))
  Matter.Body.setAngle(t.body, Math.PI / 2)
  Matter.Body.setPosition(t.body, { x: 1440, y: G - 16 })
  t.damage(t.maxHp * 0.4) // déjà blessé
  settle(w, 100)
  w.add(new Projectile('stone', -300, 0))
  settle(w, 400)
  assert.equal(t.alive, false)
  assert.equal(t.deathCause, 'knockout')
})

test('le fer encaisse les boulets de pierre bien mieux que le bois', () => {
  const hit = (material) => {
    const w = new PhysicsWorld(new EventBus())
    const b = w.add(new Block({ material, x: 1440, y: G - 50, w: 30, h: 100 }))
    settle(w, 200)
    const p = w.add(new Projectile('stone', 1300, G - 50))
    Matter.Body.setVelocity(p.body, { x: 16, y: 0 })
    settle(w, 200)
    return b
  }
  assert.ok(hit('iron').alive, 'le fer tient')
  assert.ok(hit('iron').damageRatio < 0.2, 'le fer est à peine entamé')
  assert.ok(!hit('wood').alive || hit('wood').damageRatio > hit('iron').damageRatio)
})

test('feu : le bois finit par brûler, la pierre jamais', async () => {
  const { Block } = await import('../src/game/entities/Block.js')
  const wood = new Block({ x: 0, y: 0, w: 20, h: 100, material: 'wood' })
  const stone = new Block({ x: 0, y: 0, w: 20, h: 100, material: 'stone' })
  assert.equal(wood.ignite(), true)
  assert.equal(stone.ignite(), false)
  for (let t = 0; t < 10000 && wood.alive; t += 50) wood.update(50)
  assert.equal(wood.alive, false, 'le bois est consumé')
  const straw = new Block({ x: 0, y: 0, w: 20, h: 100, material: 'straw' })
  assert.ok(straw.catchChance > wood.catchChance * 4, 'la paille propage bien plus que le bois')
})

test('feu : le bois finit par brûler, la paille brûle et propage plus vite', () => {
  const w = new PhysicsWorld(new EventBus(), { seed: 3 })
  const wood = w.add(new Block({ material: 'wood', x: 1400, y: G - 50, w: 20, h: 100 }))
  const straw = w.add(new Block({ material: 'straw', x: 1700, y: G - 50, w: 20, h: 100 }))
  settle(w, 60)
  wood.ignite()
  straw.ignite()
  let strawGone = null
  let woodGone = null
  for (let i = 0; i < 120 * 14 && woodGone === null; i++) {
    w.stepOnce()
    if (strawGone === null && !straw.alive) strawGone = i
    if (woodGone === null && !wood.alive) woodGone = i
  }
  assert.ok(woodGone !== null, 'un mur de bois en feu finit par céder')
  assert.ok(strawGone < woodGone, 'la paille se consume plus vite')
  assert.ok(straw.catchChance > wood.catchChance * 3, 'la paille propage bien plus le feu')
  w.destroy()
})

test('feu : une cible qui s’enflamme succombe', () => {
  const w = new PhysicsWorld(new EventBus(), { seed: 4 })
  const t = w.add(new Target({ type: 'knight', x: 1440, y: G - 27 }, 1.35))
  settle(w, 30)
  t.ignite()
  settle(w, 120 * 2)
  assert.equal(t.alive, false)
  assert.equal(t.deathCause, 'fire')
  w.destroy()
})

test('séisme avant le premier tir : les règles de chute sont armées', () => {
  const w = new PhysicsWorld(new EventBus(), { seed: 5 })
  assert.equal(w.armed, false)
  w.arm()
  assert.equal(w.armed, true)
  w.destroy()
})

test('feu : le boulet enflammé reste brûlant et embrase le bois sur lequel il retombe', () => {
  const w = new PhysicsWorld(new EventBus(), { seed: 7 })
  // Le boulet touche d'abord le sol (rien d'inflammable autour), puis roule jusqu'à une palissade.
  const wood = w.add(new Block({ material: 'wood', x: 900, y: G - 40, w: 20, h: 80 }))
  const p = w.add(new Projectile('fire', 640, G - 30))
  Matter.Body.setVelocity(p.body, { x: 7, y: 2 })
  for (let i = 0; i < 20 && !p.hasImpacted; i++) w.stepOnce()
  assert.ok(p.hasImpacted, 'premier choc : le sol')
  assert.equal(wood.burning, 0, 'trop loin au premier choc')
  assert.ok(p.hot, 'le boulet est encore brûlant après le choc')
  for (let i = 0; i < 300 && wood.burning === 0; i++) w.stepOnce()
  assert.ok(wood.burning > 0, 'le bois touché ensuite prend feu')
})

test('feu : la pierre ne s’embrase pas et le boulet finit par refroidir', () => {
  const w = new PhysicsWorld(new EventBus(), { seed: 7 })
  const stone = w.add(new Block({ material: 'stone', x: 900, y: G - 40, w: 20, h: 80 }))
  const p = w.add(new Projectile('fire', 640, G - 30))
  Matter.Body.setVelocity(p.body, { x: 7, y: 2 })
  // 6 s de simulation : plus que la durée de chaleur du boulet.
  for (let i = 0; i < Math.ceil(6000 / WORLD.STEP_MS); i++) w.stepOnce()
  assert.equal(stone.burning, 0)
  assert.equal(p.hot, false, 'refroidi au bout de quelques secondes')
})
