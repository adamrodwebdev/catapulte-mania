import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TrebuchetInput, TREB_TUNING as T } from '../src/game/aim/TrebuchetInput.js'
import { GameSession } from '../src/game/GameSession.js'
import { LevelRepository } from '../src/game/levels/LevelRepository.js'
import { TrajectoryPredictor } from '../src/game/TrajectoryPredictor.js'
import { WORLD } from '../src/game/physics/constants.js'

/** Prédiction sans vent ni obstacle (même intégration que la physique). */
const predict = (start, velocity) => TrajectoryPredictor.predict(start, velocity, { maxPoints: 800, every: 1 })

test('jauge du trébuchet : de la cloche au tir tendu, aller-retour régulier', () => {
  const a = new TrebuchetInput({ sweepMs: 1000 })
  assert.equal(TrebuchetInput.angleFor(0), T.LOB_ANGLE)
  assert.equal(TrebuchetInput.angleFor(1), T.FLAT_ANGLE)
  a.place(900, 800)
  assert.equal(a.phase, 'power')
  assert.equal(a.gauge, 0)
  for (let i = 0; i < 10; i++) a.tick(50)
  assert.equal(a.gauge, 0.5)
  for (let i = 0; i < 10; i++) a.tick(50)
  assert.equal(a.gauge, 1)
  for (let i = 0; i < 10; i++) a.tick(50)
  assert.equal(a.gauge, 0.5, 'elle revient')
  a.tick(10_000)
  assert.ok(a.gauge >= 0 && a.gauge <= 1, 'un à-coup (onglet en arrière-plan) ne la fait pas sortir de ses bornes')
  // Plus lente en Facile et avec l'option « Jauge lente », plus vive en Difficile.
  assert.ok(TrebuchetInput.sweepFor('easy') > TrebuchetInput.sweepFor('normal'))
  assert.ok(TrebuchetInput.sweepFor('hard') < TrebuchetInput.sweepFor('normal'))
  assert.equal(TrebuchetInput.sweepFor('normal', true), TrebuchetInput.sweepFor('normal') * T.SLOW_FACTOR)
})

test('jauge du trébuchet : nouveau tour = retour au choix de la cible (la dernière reste proposée)', () => {
  const a = new TrebuchetInput()
  a.place(900, 800)
  a.tick(300)
  a.reset()
  assert.equal(a.phase, 'target')
  assert.deepEqual(a.target, { x: 900, y: 800 })
  a.move(950, 790)
  assert.equal(a.phase, 'target', 'déplacer la cible ne lance pas la jauge')
  assert.throws(() => a.move(Number.NaN, 0))
})

test('tir du trébuchet : la vitesse calculée mène exactement au point visé, sous chaque arc', () => {
  const start = { x: 0, y: 700 }
  for (const target of [{ x: 1500, y: 880 }, { x: 900, y: 600 }, { x: 2200, y: 880 }]) {
    for (const g of [0, 0.5, 1]) {
      const angle = TrebuchetInput.angleFor(g)
      const sol = TrebuchetInput.solve({ start, target, angle, vmax: 60, predict })
      assert.equal(sol.reachable, true)
      // La courbe passe par la cible (à moins d'un pixel) : hauteur à l'aplomb de la cible.
      const pts = [start, ...predict(start, sol.velocity)]
      let best = Infinity
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i - 1]
        const q = pts[i]
        if (p.x <= target.x && q.x >= target.x) {
          best = Math.abs(p.y + ((q.y - p.y) * (target.x - p.x)) / (q.x - p.x) - target.y)
          break
        }
      }
      assert.ok(best < 1, `cible ${target.x},${target.y} sous ${angle}° : écart ${best}`)
    }
  }
})

test('tir du trébuchet : hors de portée signalé (vitesse plafonnée), arcs différents = vitesses différentes', () => {
  const start = { x: 0, y: 700 }
  const far = TrebuchetInput.solve({ start, target: { x: 9000, y: 880 }, angle: 40, vmax: 20, predict })
  assert.equal(far.reachable, false)
  assert.equal(far.speed, 20)
  const lob = TrebuchetInput.solve({ start, target: { x: 1500, y: 880 }, angle: TrebuchetInput.angleFor(0), vmax: 60, predict })
  const flat = TrebuchetInput.solve({ start, target: { x: 1500, y: 880 }, angle: TrebuchetInput.angleFor(1), vmax: 60, predict })
  assert.ok(lob.velocity.y < flat.velocity.y, 'la cloche part plus haut')
  assert.throws(() => TrebuchetInput.solve({ start, target: { x: 1500, y: 880 }, angle: 40, vmax: 20, predict: null }))
})

test('geste du trébuchet : un clic ou un glissé', () => {
  const a = new TrebuchetInput()
  a.press(10, 10)
  assert.equal(a.drag(14, 12), false)
  assert.equal(a.unpress(), 'tap')
  a.press(10, 10)
  assert.equal(a.drag(10 + T.DRAG_PX, 10), true)
  assert.equal(a.unpress(), 'drag')
  assert.equal(a.unpress(), null)
  assert.equal(a.pressing, false)
})

const session = (difficulty, id = 10, extra = {}) =>
  new GameSession(LevelRepository.get(id), { difficulty, completedLevels: 30, reducedMotion: true, engine: 'trebuchet', ...extra })

function untilAiming(s) {
  for (let i = 0; i < 400 && s.state !== 'aiming'; i++) s.update(33)
}

/** Point du sol dégagé devant le château. */
function openGround(s) {
  const left = Math.min(...s.world.filter((e) => e.kind === 'block').map((b) => b.x - b.width / 2))
  return { x: left - 140, y: WORLD.GROUND_Y }
}

/** Abscisse du premier contact du projectile avec le sol. */
function landing(s) {
  for (let i = 0; i < 3000; i++) {
    s.update(16)
    const p = s.world.filter((e) => e.kind === 'projectile')[0]
    if (p && p.y >= WORLD.GROUND_Y - p.radius - 1.5) return p.x
  }
  return null
}

for (const g of [0.1, 0.5, 0.9]) {
  test(`trébuchet en partie : le projectile percute là où le joueur a touché (jauge ${g})`, () => {
    const s = session('normal')
    untilAiming(s)
    const pt = openGround(s)
    assert.equal(s.placeTrebTarget(pt.x, pt.y), true)
    assert.equal(s.trebPhase, 'power')
    assert.equal(s.fire(0, { arc: g }), true)
    const x = landing(s)
    assert.ok(x !== null && Math.abs(x - pt.x) < 12, `impact ${x} pour une cible en ${pt.x}`)
    s.destroy()
  })
}

test('trébuchet en partie : cible par défaut, bornée devant l’engin et jamais sous le sol', () => {
  const s = session('normal')
  untilAiming(s)
  const first = s.world.filter((e) => e.kind === 'target' && e.alive).sort((a, b) => a.x - b.x)[0]
  assert.ok(Math.abs(s.trebInput.target.x - first.x) < 1e-9, 'le défenseur le plus proche')
  s.moveTrebTarget(s.catapult.x - 400, WORLD.GROUND_Y + 300)
  assert.ok(s.trebInput.target.x > s.catapult.x + 100)
  assert.ok(s.trebInput.target.y <= WORLD.GROUND_Y)
  assert.throws(() => s.placeTrebTarget(Number.NaN, 0), 'données vérifiées')
  assert.throws(() => s.fire(0, { arc: 3 }))
  s.destroy()
})

test('trébuchet en partie : pas de tir sans cible ; la cible du joueur est gardée au tour suivant', () => {
  const s = session('normal')
  untilAiming(s)
  const pt = openGround(s)
  s.placeTrebTarget(pt.x, pt.y)
  s.fire(0, { arc: 0.5 })
  for (let i = 0; i < 1500 && s.state !== 'aiming'; i++) s.update(16)
  assert.equal(s.trebPhase, 'target')
  assert.ok(Math.abs(s.trebInput.target.x - pt.x) < 1e-9)
  s.trebInput.clear()
  assert.equal(s.fire(0, { arc: 0.5 }), false)
  s.destroy()
})

test('trébuchet en partie : le panneau suit les deux étapes', () => {
  const s = session('normal')
  untilAiming(s)
  assert.equal(s.hud.trebPhase, 'target')
  assert.equal(typeof s.hud.trebBar.target, 'number')
  s.trigger(0)
  s.update(16)
  assert.equal(s.hud.trebPhase, 'power')
  assert.equal(typeof s.hud.angle, 'number')
  s.trigger(0)
  assert.equal(typeof s.hud.power, 'number', 'puissance du tir programmé')
  s.destroy()
})
