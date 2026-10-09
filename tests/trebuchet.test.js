import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Trebuchet, TREBUCHET_X, TREBUCHET_UNLOCK, SWING_SPEED } from '../src/game/Trebuchet.js'
import { GameSession } from '../src/game/GameSession.js'
import { LevelRepository } from '../src/game/levels/LevelRepository.js'
import { tutorialSteps, TutorialCoach } from '../src/game/tutorial/Tutorial.js'
import { createMode } from '../src/game/modes/modes.js'
import { ArenaRepository } from '../src/game/levels/ArenaRepository.js'
import { SettingsService } from '../src/services/SettingsService.js'
import { MemoryStorage } from './helpers.js'
import { StorageService } from '../src/services/StorageService.js'

const session = (opts = {}, id = 20) =>
  new GameSession(LevelRepository.get(id), { difficulty: 'normal', completedLevels: 30, reducedMotion: true, engine: 'trebuchet', ...opts })

function untilAiming(s) {
  for (let i = 0; i < 400 && s.state !== 'aiming'; i++) s.update(33)
}

test('trébuchet : un même instant de lâcher donne toujours le même tir', () => {
  const a = Trebuchet.preview(700)
  const b = Trebuchet.preview(700)
  assert.deepEqual(a, b)
})

test('trébuchet : lâcher tôt = tir en cloche (voire en arrière), tard = tir tendu', () => {
  const early = Trebuchet.preview(560)
  const lob = Trebuchet.preview(680)
  const flat = Trebuchet.preview(800)
  const late = Trebuchet.preview(880)
  assert.ok(early.angle > 90, `tôt : ${early.angle}°`)
  assert.ok(lob.angle > 50 && lob.angle < 80, `cloche : ${lob.angle}°`)
  assert.ok(flat.angle > 5 && flat.angle < 30, `tendu : ${flat.angle}°`)
  assert.ok(late.angle < 0, `tard : ${late.angle}°`)
  // La fronde accélère tout au long du balancier : plus on attend, plus le tir est rapide.
  assert.ok(flat.speed > lob.speed && lob.speed > early.speed)
  // Assez puissant pour atteindre le fond des châteaux depuis l'arrière.
  assert.ok(Trebuchet.preview(740).speed > 28)
})

test('trébuchet : contrepoids plus lourd (amélioration) = tir plus rapide, même angle', () => {
  const base = Trebuchet.preview(720)
  const strong = Trebuchet.preview(720, { speedFactor: 1.2 })
  assert.ok(Math.abs(strong.speed / base.speed - 1.2) < 1e-9)
  assert.ok(Math.abs(strong.angle - base.angle) < 1e-9)
})

test('trébuchet : armer seulement au repos, lâcher seulement pendant le balancier', () => {
  const t = new Trebuchet()
  assert.equal(t.release(), false)
  let shot = null
  assert.equal(t.arm((s) => (shot = s)), true)
  assert.equal(t.arm(() => {}), false)
  assert.equal(t.armed, true)
  t.update(500)
  assert.equal(t.release(0), true)
  assert.ok(shot && Number.isFinite(shot.velocity.x) && Number.isFinite(shot.point.y))
  assert.equal(t.armed, false)
  assert.equal(t.release(), false)
  // Remise en batterie, puis prêt pour le tir suivant.
  for (let i = 0; i < 400 && !t.ready; i++) t.update(16)
  assert.equal(t.ready, true)
})

test("trébuchet : sans second clic, la fronde s'ouvre d'elle-même en fin de course", () => {
  const t = new Trebuchet()
  let shot = null
  t.arm((s) => (shot = s))
  for (let i = 0; i < 1000 && !shot; i++) t.update(16)
  assert.ok(shot, 'lâcher automatique')
})

test('trébuchet : le lâcher tient compte du temps écoulé depuis la dernière image', () => {
  const a = new Trebuchet()
  const b = new Trebuchet()
  let sa = null
  let sb = null
  a.arm((s) => (sa = s))
  b.arm((s) => (sb = s))
  for (let i = 0; i < 100; i++) {
    a.update(16)
    b.update(16)
  }
  a.release(0)
  b.release(40)
  assert.notDeepEqual(sa.velocity, sb.velocity)
  // 40 ms réelles plus tard : tir plus tendu.
  const ang = (s) => Math.atan2(-s.velocity.y, s.velocity.x)
  assert.ok(ang(sb) < ang(sa))
})

test('balancier fluide (v5.4) : vitesse constante, et le bras dessiné avance à chaque image', () => {
  const t = new Trebuchet()
  t.arm(() => {})
  assert.equal(t.timeScale, SWING_SPEED)
  let prev = t.rig.theta
  let still = 0
  for (let i = 0; i < 40 && t.armed; i++) {
    t.update(16.7)
    if (Math.abs(t.rig.theta - prev) < 1e-9) still++
    prev = t.rig.theta
  }
  assert.equal(still, 0, 'aucune image figée : le dessin est interpolé entre deux pas')
})

test('lâcher programmé (v5.4) : la fronde part d’elle-même sous l’angle voulu', () => {
  for (const angle of [60, 40, 15]) {
    const release = Trebuchet.releaseFor(angle)
    const t = new Trebuchet()
    let shot = null
    t.arm((s) => (shot = s))
    t.scheduleRelease(release)
    for (let i = 0; i < 400 && !shot; i++) t.update(16)
    const got = (Math.atan2(-shot.velocity.y, shot.velocity.x) * 180) / Math.PI
    assert.ok(Math.abs(got - angle) < 4, `${angle}° demandé, ${got.toFixed(1)}° obtenu`)
  }
})

test('balancier infini : sans second clic, le bras revient et recommence, à l’identique', () => {
  const t = new Trebuchet(TREBUCHET_X, { infinite: true })
  let shot = null
  t.arm((s) => (shot = s))
  let rewound = false
  for (let i = 0; i < 2000; i++) {
    t.update(16)
    if (t.rewinding) rewound = true
    if (rewound && t.armed && t.simTime > 100) break
  }
  assert.equal(shot, null, 'jamais de lâcher automatique')
  assert.ok(rewound)
  // Le même instant de lâcher donne le même tir qu'au premier passage.
  t.releaseAt(700)
  const ref = Trebuchet.preview(t.simTime)
  assert.ok(Math.abs(shot.velocity.x - ref.velocity.x) < 1e-9 && Math.abs(shot.velocity.y - ref.velocity.y) < 1e-9)
})

test('partie au trébuchet (v5.4) : 1er appui = point d’impact (la jauge part), 2e = tir', () => {
  const s = session()
  untilAiming(s)
  assert.equal(s.engine, 'trebuchet')
  assert.equal(s.trebPhase, 'target')
  assert.ok(s.trebInput.target, 'une cible proposée')
  const shots = s.shotsLeft
  assert.equal(s.trigger(0), 'aimed')
  assert.equal(s.trebPhase, 'power')
  assert.equal(s.shotsLeft, shots, 'viser ne coûte rien')
  for (let i = 0; i < 20; i++) s.update(16)
  assert.ok(s.trebGauge > 0, 'la jauge oscille')
  assert.equal(s.trigger(0), 'armed')
  assert.equal(s.shotsLeft, shots - 1)
  assert.equal(s.armed, true)
  assert.equal(s.trigger(0), false, 'pendant le balancier, rien à faire : le lâcher est programmé')
  assert.equal(s.world.filter((e) => e.kind === 'projectile').length, 0, 'le projectile reste dans la fronde')
  for (let i = 0; i < 200 && s.armed; i++) s.update(16)
  assert.equal(s.armed, false)
  assert.equal(s.world.filter((e) => e.kind === 'projectile').length, 1)
})

test("partie au trébuchet : le tour ne se termine pas tant que la fronde n'a pas lâché", () => {
  const s = session()
  untilAiming(s)
  s.trigger(0)
  s.trigger(0)
  for (let i = 0; i < 10; i++) s.update(16)
  assert.equal(s.state, 'flying')
  assert.equal(s.armed, true)
})

test('partie au trébuchet : le château est plus loin, le monde et la caméra suivent', () => {
  const s = session()
  assert.equal(s.catapult.x, TREBUCHET_X)
  assert.ok(s.focus.left < TREBUCHET_X)
  assert.ok(s.world.leftLimit < TREBUCHET_X)
  const c = new GameSession(LevelRepository.get(20), { difficulty: 'normal', completedLevels: 30, reducedMotion: true })
  assert.ok(s.level.blocks[0].x - s.catapult.x > c.level.blocks[0].x - c.catapult.x + 500)
})

test('face-à-face : toujours à la catapulte ; engin inconnu refusé', () => {
  const v = new GameSession(ArenaRepository.get(1), { difficulty: 'hard', completedLevels: 30, engine: 'trebuchet' }, createMode('versus', { players: ['A', 'B'], completedLevels: 30 }))
  assert.equal(v.engine, 'catapult')
  assert.throws(() => session({ engine: 'onager' }))
  assert.throws(() => session({ slowSwing: 'oui' }))
})

test('courbe du trébuchet (v5.4) : en direct pendant la jauge ; sans l’aide, seulement le début', () => {
  const full = session({ trajectoryAid: true })
  untilAiming(full)
  assert.equal(full.scene().trebAim.path, null, 'pas de courbe avant de viser')
  full.trigger(0)
  full.update(16)
  const a = full.scene().trebAim
  assert.equal(a.phase, 'power')
  assert.ok(a.path.length > 3)
  assert.equal(full.trajectory, null, 'la courbe du trébuchet passe par trebAim')
  const hint = session({ trajectoryAid: false })
  untilAiming(hint)
  hint.trigger(0)
  hint.update(16)
  assert.ok(hint.scene().trebAim.path.length < a.path.length)
})

test("le trébuchet se débloque après le niveau 3 ; le 4 est son niveau d'apprentissage (v4.2 : montré tôt)", () => {
  assert.equal(TREBUCHET_UNLOCK, 3)
  assert.equal(LevelRepository.tutorialFor(4), 'engine:trebuchet')
  assert.ok(LevelRepository.novelties(4).includes('engine:trebuchet'))
  const steps = tutorialSteps('engine:trebuchet')
  assert.deepEqual(steps.map((x) => x.until), ['target', 'arm', 'turn', 'arm'])
  const coach = new TutorialCoach('engine:trebuchet')
  coach.notify('fire')
  assert.equal(coach.step.id, 'target')
  coach.notify('target')
  coach.notify('arm')
  assert.equal(coach.step.id, 'watch')
})

test("réglages : engin et balancier lent validés (valeur altérée → défaut)", () => {
  const backend = new MemoryStorage()
  backend.setItem('ctc:settings', JSON.stringify({ engine: 'canon', slowSwing: 'yes' }))
  const s = new SettingsService(new StorageService(backend))
  assert.equal(s.get('engine'), 'catapult')
  assert.equal(s.get('slowSwing'), false)
  s.set('engine', 'trebuchet')
  assert.equal(s.get('engine'), 'trebuchet')
  assert.throws(() => s.set('engine', 'bombarde'))
})

test("trébuchet : un clic pendant la remise en batterie n'est jamais perdu", () => {
  const s = session()
  untilAiming(s)
  s.trigger(0)
  for (let i = 0; i < 40; i++) s.update(16)
  s.trigger(0)
  for (let i = 0; i < 2000 && s.state !== 'aiming'; i++) s.update(16)
  assert.equal(s.state, 'aiming')
  assert.equal(s.trigger(0), 'aimed')
  assert.equal(s.trigger(0), 'armed')
})

test('trébuchet : projectiles plus lourds que ceux de la catapulte', () => {
  const s = session()
  untilAiming(s)
  s.trigger(0)
  s.trigger(0)
  for (let i = 0; i < 200 && s.armed; i++) s.update(16)
  const p = s.world.filter((e) => e.kind === 'projectile')[0]
  const c = new GameSession(LevelRepository.get(20), { difficulty: 'normal', completedLevels: 30, reducedMotion: true })
  untilAiming(c)
  c.fire()
  for (let i = 0; i < 30; i++) c.update(16)
  const q = c.world.filter((e) => e.kind === 'projectile')[0]
  assert.ok(Math.abs(p.body.mass / q.body.mass - 1.5) < 1e-6)
})
