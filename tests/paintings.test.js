import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { BACKGROUND_ART } from '../src/game/assets/backgrounds.js'
import { BackgroundArt, LITE_WIDTH, liteFor } from '../src/game/rendering/BackgroundArt.js'
import { FrameGuard } from '../src/game/feel/FrameGuard.js'
import { WORLD } from '../src/game/physics/constants.js'

/* ---------- Fonds peints allégés et garde de fluidité (v6.4) ---------- */

test('Peintures (v6.4) : chaque chapitre a sa version allégée, plus légère que l’originale', () => {
  for (let c = 1; c <= 10; c++) {
    const art = BACKGROUND_ART[c]
    assert.ok(art.lite && art.lite !== art.url, `chapitre ${c}`)
    const full = fileURLToPath(art.url)
    const lite = fileURLToPath(art.lite)
    assert.ok(existsSync(lite), `version allégée du chapitre ${c}`)
    assert.ok(statSync(lite).size < statSync(full).size * 0.7, `plus légère, chapitre ${c}`)
  }
})

test('Peintures (v6.4) : la version allégée seulement là où elle suffit, ou sur peu de mémoire', () => {
  // Téléphone à l'horizontale (844×390, ×2) : la peinture n'y dépasse guère 1 600 px.
  assert.equal(liteFor({ viewW: 844, viewH: 390, dpr: 2 }), true)
  assert.equal(liteFor({ viewW: 844, viewH: 390, dpr: 3 }), true, 'densité plafonnée à 2, comme le rendu')
  // En portrait, la peinture suit la hauteur : il faut l'originale.
  assert.equal(liteFor({ viewW: 390, viewH: 844, dpr: 2 }), false)
  // Cadre d'un portail sur ordinateur (~1009×724) : l'allégée suffit ; plein écran 1920×1080 : l'originale.
  assert.equal(liteFor({ viewW: 1009, viewH: 724, dpr: 1 }), true)
  assert.equal(liteFor({ viewW: 1920, viewH: 1080, dpr: 1 }), false)
  // Peu de mémoire : toujours l'allégée.
  assert.equal(liteFor({ viewW: 1920, viewH: 1080, dpr: 2, memory: 4 }), true)
  assert.equal(liteFor({ viewW: 1920, viewH: 1080, dpr: 2, memory: 8 }), false)
  // Vue inconnue : l'originale.
  assert.equal(liteFor({ viewW: 0, viewH: 0 }), false)
  assert.equal(LITE_WIDTH, 1600)
})

test('Peintures (v6.4) : le fond charge la version choisie au moment où il se charge', () => {
  const loaded = []
  const saved = globalThis.Image
  globalThis.Image = class {
    set src(v) {
      loaded.push(v)
    }
  }
  try {
    let small = true
    const art = new BackgroundArt({ 1: { url: 'full-1.webp', lite: 'lite-1.webp' }, 2: { url: 'full-2.webp', lite: 'lite-2.webp' }, 3: { url: 'full-3.webp' } }, { lite: () => small })
    art.preload(1)
    small = false
    art.preload(2)
    small = true
    art.preload(3)
    assert.deepEqual(loaded, ['lite-1.webp', 'full-2.webp', 'full-3.webp'], 'sans version allégée : l’originale')
  } finally {
    globalThis.Image = saved
  }
})

test('Garde de fluidité (v6.4) : moins de particules, puis ciel figé après quelques secondes de peine', () => {
  FrameGuard.reset()
  const g = new FrameGuard({ threshold: 22, holdMs: 2500 })
  for (let i = 0; i < 300; i++) g.update(16.7)
  assert.equal(g.level, 0, 'appareil fluide')
  let firstLevel1 = -1
  for (let i = 0; i < 400; i++) {
    g.update(33)
    if (g.level === 1 && firstLevel1 < 0) firstLevel1 = i
    if (g.level === 2) break
  }
  assert.ok(firstLevel1 >= 0, 'particules réduites d’abord')
  assert.equal(g.level, 2, 'ciel vivant figé ensuite')
  // Le niveau ne redescend pas, et la partie suivante en part directement.
  for (let i = 0; i < 300; i++) g.update(10)
  assert.equal(g.level, 2)
  assert.equal(new FrameGuard().level, 2, 'gardé pour la visite')
  FrameGuard.reset()
  assert.equal(new FrameGuard().level, 0)
})

test('Garde de fluidité (v6.4) : un onglet caché (une longue image) ne fige rien', () => {
  FrameGuard.reset()
  const g = new FrameGuard()
  for (let i = 0; i < 200; i++) g.update(16.7)
  g.update(5000)
  for (let i = 0; i < 200; i++) g.update(16.7)
  assert.equal(g.level, 0)
  FrameGuard.reset()
})

test('Peintures (v6.4) : sur une vue étroite, la peinture se cadre sur son centre d’intérêt', () => {
  const img = { width: 2048, height: 1024 }
  const ctx = { save() {}, restore() {}, drawImage() {}, globalAlpha: 1 }
  const camera = (viewW, viewH) => ({ viewW, viewH, x: WORLD.WIDTH / 2, scale: 1, worldToScreen: () => ({ x: 0, y: viewH * 0.9 }) })
  const art = new BackgroundArt({})
  const place = (meta, viewW, viewH) => art.draw(ctx, { img, meta, alpha: 1 }, camera(viewW, viewH))
  // Ordinateur : la peinture couvre la vue avec de quoi défiler ; le centre d'intérêt n'y change rien.
  assert.ok(Math.abs(place({ ground: 0.96, focus: 0.33 }, 1280, 720).x0 - place({ ground: 0.96 }, 1280, 720).x0) < 1e-6)
  // Téléphone en portrait : le centre d'intérêt vient au milieu de l'écran (sans réglage : le milieu de la peinture).
  const tall = place({ ground: 0.96, focus: 0.33 }, 390, 844)
  assert.ok(Math.abs((195 - tall.x0) / tall.w - 0.33) < 0.01, 'le volcan au milieu')
  const plain = place({ ground: 0.96 }, 390, 844)
  assert.ok(Math.abs((195 - plain.x0) / plain.w - 0.5) < 0.01)
  // Toujours de quoi couvrir la vue.
  assert.ok(tall.x0 <= 0 && tall.x0 + tall.w >= 390)
  const edge = place({ ground: 0.96, focus: 0 }, 390, 844)
  assert.equal(edge.x0, 0, 'un centre d’intérêt au bord : la peinture s’arrête au bord de l’écran')
  for (let c = 1; c <= 10; c++) {
    const f = BACKGROUND_ART[c].focus ?? 0.5
    assert.ok(f > 0.2 && f < 0.8, `chapitre ${c}`)
  }
})
