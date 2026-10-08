import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TrebuchetInput, TREB_TUNING as T } from '../src/game/aim/TrebuchetInput.js'
import { GameSession } from '../src/game/GameSession.js'
import { LevelRepository } from '../src/game/levels/LevelRepository.js'

/** Trébuchet fictif : l'impact avance de 2 unités par ms de balancier, au sol (y = 0). */
const fake = () => new TrebuchetInput({ landingAt: (t) => ({ x: t * 2, y: 0 }), step: 10 })

test('commande du trébuchet : la cible donne l’instant de lâcher exact', () => {
  const a = fake()
  const plan = a.setTarget(1500, 0)
  assert.equal(plan.release, 750)
  assert.equal(plan.error, 0)
  assert.equal(plan.reachable, true)
  assert.deepEqual(plan.landing, { x: 1500, y: 0 })
  // Une table d'une ligne par pas, sur la fenêtre utile du balancier.
  assert.equal(a.table[0].t, Math.ceil(T.FROM_MS / 10) * 10)
  assert.equal(a.table.at(-1).t, Math.floor(T.TO_MS / 10) * 10)
})

test('commande du trébuchet : table construite par morceaux, plan à la fin', () => {
  let calls = 0
  const a = new TrebuchetInput({ landingAt: (t) => (calls++, { x: t * 2, y: 0 }), step: 10 })
  assert.equal(a.setTarget(1500, 0, { lazy: true }), null, 'plan en attente')
  assert.equal(calls, 0)
  assert.equal(a.warm(5), false)
  assert.equal(calls, 5)
  while (!a.warm(5));
  assert.equal(a.ready, true)
  assert.equal(a.plan.release, 750)
  const n = calls
  a.setTarget(1400, 0)
  assert.equal(calls, n, 'déplacer la cible ne recalcule rien')
  a.invalidate()
  assert.equal(a.ready, false)
  assert.equal(a.plan, null)
})

test('commande du trébuchet : cible hors de portée signalée', () => {
  const a = fake()
  assert.equal(a.setTarget(5000, 0).reachable, false)
  assert.equal(a.assisted(1000, 'easy'), null, 'pas d’aide vers une cible hors de portée')
})

test('commande du trébuchet : trois tics réguliers, puis l’instant parfait', () => {
  const a = fake()
  a.setTarget(1500, 0)
  assert.deepEqual(a.cues(500, 560), [])
  assert.deepEqual(a.cues(560, 700), ['cue', 'cue', 'cue'])
  assert.deepEqual(a.cues(745, 755), ['now'])
  assert.deepEqual(a.cues(755, 745), [], 'jamais à rebours')
})

test('commande du trébuchet : la note juge l’écart à l’impact idéal', () => {
  const a = fake()
  a.setTarget(1500, 0)
  assert.equal(a.gradeAt(750).id, 'perfect')
  assert.equal(a.gradeAt(760).id, 'perfect') // 20 unités
  assert.equal(a.gradeAt(770).id, 'great') // 40
  assert.equal(a.gradeAt(790).id, 'good') // 80
  assert.equal(a.gradeAt(810).id, 'miss') // 120
  a.clearTarget()
  assert.equal(a.gradeAt(750).id, 'miss')
})

test('commande du trébuchet : cible inaccessible exactement (derrière un mur), le meilleur lâcher reste « Parfait »', () => {
  // Au-delà de x = 1200, le tir bute sur un mur.
  const a = new TrebuchetInput({ landingAt: (t) => ({ x: Math.min(t * 2, 1200), y: 0 }), step: 10 })
  const plan = a.setTarget(1260, 0)
  assert.equal(plan.landing.x, 1200)
  assert.equal(plan.reachable, true)
  assert.equal(a.gradeAt(plan.release).id, 'perfect')
})

test('commande du trébuchet : le cercle d’approche se referme à l’instant parfait', () => {
  const a = fake()
  a.setTarget(1500, 0)
  assert.equal(a.timing(400).approach, 1)
  assert.ok(Math.abs(a.timing(750 - T.APPROACH_MS / 2).approach - 0.5) < 1e-9)
  const now = a.timing(750)
  assert.equal(now.approach, 0)
  assert.equal(now.ms, 0)
  assert.equal(now.window, true)
  assert.equal(a.timing(600).window, false)
})

test('commande du trébuchet : aide au lâcher en Facile seulement', () => {
  const a = fake()
  a.setTarget(1500, 0)
  assert.equal(a.assisted(735, 'easy'), 750)
  assert.equal(a.assisted(735, 'normal'), null)
  assert.equal(a.assisted(735, 'hard'), null)
  assert.equal(a.assisted(700, 'easy'), null, 'trop loin : pas de correction')
})

test('commande du trébuchet : geste — appui bref, second appui, maintien, glissé', () => {
  const a = fake()
  // Appui bref : le relâcher arme.
  assert.equal(a.press(10, 10, 0, { armed: false, aiming: true }), null)
  assert.equal(a.hold(100), null)
  assert.equal(a.unpress(120, { armed: false }), 'arm')
  // Armé : un nouvel appui lâche tout de suite.
  assert.equal(a.press(10, 10, 500, { armed: true, aiming: false }), 'release')
  assert.equal(a.unpress(520, { armed: false }), null)
  // Geste unique : maintenu, il arme ; au relâcher, la fronde part.
  a.press(10, 10, 1000, { armed: false, aiming: true })
  assert.equal(a.hold(1000 + T.HOLD_MS), 'arm')
  assert.equal(a.hold(1000 + T.HOLD_MS + 50), null, 'une seule fois')
  assert.equal(a.drag(80, 10), false, 'armé : on ne déplace plus la cible')
  assert.equal(a.unpress(1600, { armed: true }), 'release')
  // Glissé : on place la cible, ni armement ni lâcher.
  a.press(10, 10, 2000, { armed: false, aiming: true })
  assert.equal(a.drag(15, 12), false)
  assert.equal(a.drag(10 + T.DRAG_PX, 10), true)
  assert.equal(a.hold(2000 + T.HOLD_MS * 3), null)
  assert.equal(a.unpress(2600, { armed: false }), null)
  assert.equal(a.pressing, false)
})

const session = (difficulty, id = 10) =>
  new GameSession(LevelRepository.get(id), { difficulty, completedLevels: 30, reducedMotion: true, engine: 'trebuchet' })

function untilAiming(s) {
  for (let i = 0; i < 400 && s.state !== 'aiming'; i++) s.update(33)
  // La table des lâchers se construit quelques lignes par image.
  for (let i = 0; i < 60 && !s.trebInput.ready; i++) s.update(16)
}

test('trébuchet en partie : cible par défaut sur un défenseur, déplaçable, plan atteignable', () => {
  const s = session('normal')
  for (let i = 0; i < 400 && s.state !== 'aiming'; i++) s.update(33)
  assert.equal(s.trebInput.ready, false, 'pas de gros calcul d’un coup en début de tour')
  assert.equal(s.scene().trebTarget.reachable, true, 'pendant le calcul, la cible n’est pas déclarée hors de portée')
  untilAiming(s)
  const ti = s.trebInput
  assert.ok(ti?.target, 'une cible dès le début du tour')
  assert.ok(ti.plan?.reachable)
  const view = s.scene().trebTarget
  assert.equal(view.x, ti.target.x)
  assert.equal(view.armed, false)
  assert.equal(typeof s.hud.landing.target, 'number', 'la barre montre la cible avant le balancier')
  const plan = s.setTrebTarget(ti.target.x - 120, ti.target.y)
  assert.ok(plan && plan.release > 0)
  assert.equal(ti.target.x, view.x - 120)
  assert.throws(() => s.setTrebTarget(Number.NaN, 0), 'données vérifiées')
  s.destroy()
})

/** Arme, avance jusqu'à `before` ms simulées de l'instant parfait, puis lâche. */
function releaseNear(s, before) {
  const plan = s.trebInput.plan
  const grades = []
  s.on('timing', (g) => grades.push(g))
  assert.equal(s.trigger(), 'armed')
  const cues = []
  s.on('feedback', (f) => f.sound && cues.push(f.sound))
  while (s.armed && s.catapult.simTime < plan.release - before - 20) s.update(4)
  while (s.armed && s.catapult.simTime < plan.release - before) s.update(1)
  assert.equal(s.trigger(), 'released')
  for (let i = 0; i < 20 && !grades.length; i++) s.update(16)
  return { grades, cues, plan }
}

test('trébuchet en partie : trois tics avant le lâcher, puis la note', () => {
  const s = session('normal')
  untilAiming(s)
  const { grades, cues } = releaseNear(s, 0)
  assert.ok(cues.filter((c) => c === 'tick').length >= 3, `tics : ${cues}`)
  assert.equal(grades.length, 1)
  assert.ok(['perfect', 'great'].includes(grades[0].grade), `note : ${grades[0].grade}`)
  s.destroy()
})

test('trébuchet en partie : en Facile, un lâcher un peu tôt se cale sur l’instant parfait', () => {
  const s = session('easy')
  untilAiming(s)
  const { grades } = releaseNear(s, 18)
  assert.equal(grades[0].grade, 'perfect')
  assert.equal(grades[0].error, 0, 'lâché exactement à l’instant parfait')
  s.destroy()
})

test('trébuchet en partie : Difficile, ni cercle ni impact idéal', () => {
  const s = session('hard')
  untilAiming(s)
  assert.equal(s.scene().trebTarget.ideal, null)
  s.trigger()
  s.update(16)
  assert.equal(s.scene().trebTarget.approach, null)
  s.destroy()
})
