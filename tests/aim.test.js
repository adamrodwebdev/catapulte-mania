import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AimInput, AIM_TUNING as T } from '../src/game/aim/AimInput.js'

const VIEW = { w: 1280, h: 720 }
const span = Math.min(Math.max(720 * T.SPAN_RATIO, T.SPAN_MIN), T.SPAN_MAX)

/** Glisse de (x0,y0) vers (x1,y1) en n étapes rapides. */
function drag(a, x0, y0, x1, y1, { n = 10, t0 = 0, dt = 8, fine = false } = {}) {
  a.begin(x0, y0, t0, VIEW)
  let t = t0
  for (let i = 1; i <= n; i++) {
    t += dt
    a.move(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, t, { fine })
  }
  return t
}

test('fronde : tirer vers l’arrière et vers le bas donne l’angle et la puissance', () => {
  const a = new AimInput()
  a.set(45, 0.5)
  const len = span
  const ang = (30 * Math.PI) / 180
  drag(a, 600, 300, 600 - Math.cos(ang) * len, 300 + Math.sin(ang) * len)
  assert.equal(a.target.angle, 30)
  assert.equal(a.target.power, 1)
  const r = a.end()
  assert.deepEqual(r, { fire: true, cancel: false, moved: true })
  assert.deepEqual(a.display, a.target, 'ce qui part = ce qui est affiché')
})

test('valeurs au pas : 0,5° et 0,5 %', () => {
  const a = new AimInput()
  drag(a, 600, 300, 600 - 137.3, 300 + 61.7)
  assert.equal(a.target.angle % 0.5, 0)
  assert.ok(Math.abs(Math.round(a.target.power * 200) - a.target.power * 200) < 1e-9)
})

test('un appui sans geste ne tire pas ; revenir au départ annule et rétablit la visée', () => {
  const a = new AimInput()
  a.set(42, 0.7)
  a.begin(500, 300, 0, VIEW)
  a.move(503, 302, 10)
  assert.deepEqual(a.end(), { fire: false, cancel: false, moved: false })
  drag(a, 500, 300, 380, 360)
  assert.notEqual(a.target.angle, 42)
  a.move(504, 301, 200)
  assert.ok(a.cancelling)
  assert.deepEqual(a.end(), { fire: false, cancel: true, moved: true })
  assert.deepEqual(a.target, { angle: 42, power: 0.7 })
})

test('stabilité : un geste très court ne fait pas tourner l’angle brutalement', () => {
  const a = new AimInput()
  a.set(45, 0.5)
  a.begin(500, 300, 0, VIEW)
  // Juste au-delà de la zone morte, presque à la verticale : l'angle bouge à peine.
  a.move(500 - 2, 300 + T.DEADZONE_PX + 2, 16)
  assert.ok(Math.abs(a.target.angle - 45) < 10, `angle ${a.target.angle}`)
})

test('puissance progressive : moitié de la traction < moitié de la puissance', () => {
  const a = new AimInput()
  const half = T.DEADZONE_PX + (span - T.DEADZONE_PX) / 2
  drag(a, 600, 300, 600 - half, 300)
  assert.ok(a.target.power < 0.5 && a.target.power > 0.35, `puissance ${a.target.power}`)
})

test('mode précision : immobile un instant, puis le même geste règle ×10 plus finement', () => {
  const a = new AimInput()
  const t = drag(a, 600, 300, 400, 380)
  const before = { ...a.target }
  // On reste immobile : la précision s'enclenche.
  a.move(400, 380, t + T.FINE_DWELL_MS + 10)
  assert.ok(a.fine)
  // 20 px vers le bas lentement : quelques degrés, pas une dizaine.
  for (let i = 1; i <= 20; i++) a.move(400, 380 + i, t + T.FINE_DWELL_MS + 10 + i * 30)
  const d = a.target.angle - before.angle
  assert.ok(d > 0.5 && d < 4, `écart ${d}`)
})

test('sortie de la précision sans saut : la visée continue d’où elle était', () => {
  const a = new AimInput()
  const t = drag(a, 600, 300, 400, 380)
  a.move(400, 380, t + T.FINE_DWELL_MS + 10)
  assert.ok(a.fine)
  const at = { ...a.target }
  // Mouvement franc : on revient en visée directe.
  let tt = t + T.FINE_DWELL_MS + 10
  for (let i = 1; i <= 8; i++) a.move(400 - i * 2, 380, (tt += 1))
  for (let i = 1; i <= 12; i++) a.move(384 - i * 20, 380, (tt += 10))
  assert.equal(a.fine, false)
  assert.ok(Math.abs(a.target.angle - at.angle) < 15, 'pas de saut d’angle')
})

test('Maj ou second doigt : précision immédiate', () => {
  const a = new AimInput()
  a.begin(600, 300, 0, VIEW)
  a.move(500, 340, 10)
  a.move(500, 340, 20, { fine: true })
  assert.ok(a.fine)
})

test('clavier : un appui = un pas exact, le maintien accélère, Maj ralentit', () => {
  const a = new AimInput()
  a.set(40, 0.5)
  a.keyDown('right')
  a.tick(16)
  assert.equal(a.target.angle, 41)
  for (let i = 0; i < 60; i++) a.tick(16)
  const fast = a.target.angle
  assert.ok(fast > 50, `maintien : ${fast}`)
  a.keyUp('right')
  assert.equal(a.target.angle % 0.5, 0, 'calé sur le pas au relâcher')
  a.set(40, 0.5)
  a.keyDown('right', true)
  a.tick(16)
  for (let i = 0; i < 60; i++) a.tick(16)
  a.keyUp('right')
  assert.ok(a.target.angle - 40 < (fast - 40) / 2, 'Maj : plus lent')
})

test('lissage : l’affichage rejoint la cible en quelques images, sans dépasser', () => {
  const a = new AimInput()
  a.set(30, 0.5)
  drag(a, 600, 300, 400, 300)
  const target = a.target.angle
  let last = a.display.angle
  for (let i = 0; i < 30; i++) {
    a.tick(16)
    assert.ok(Math.abs(a.display.angle - target) <= Math.abs(last - target) + 1e-9)
    last = a.display.angle
  }
  assert.ok(Math.abs(a.display.angle - target) < 0.02)
})

test('bornes de l’engin : baliste de 0 à 60°', () => {
  const a = new AimInput({ minAngle: 0, maxAngle: 60 })
  drag(a, 600, 300, 600, 600)
  assert.equal(a.target.angle, 60)
  drag(a, 600, 300, 300, 290)
  assert.equal(a.target.angle, 0)
})

test('retours discrets : un « tic » tous les 5°', () => {
  const a = new AimInput()
  a.set(40, 0.5)
  a.begin(600, 300, 0, VIEW)
  let ticks = 0
  const ang = (40 * Math.PI) / 180
  for (let i = 1; i <= 20; i++) {
    const r = a.move(600 - Math.cos(ang) * 200, 300 + Math.sin(ang) * 200 + i * 6, i * 16)
    ticks += r.ticks
  }
  assert.ok(ticks >= 2)
})
