import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SKY_CHAPTERS, SKY_ORDER, SKY_BEDS } from '../src/game/sky/skyConfig.js'
import { EFFECTS } from '../src/game/sky/effects.js'
import { LivingSky } from '../src/game/sky/LivingSky.js'
import { fallsMask, findStars, findSun, grassMask, isSnow, isWater, lavaMask, rayMasks, spotsWhere } from '../src/game/sky/paintingAnalysis.js'
import { ambienceProfile, AMBIENCE_PROFILES } from '../src/game/audio/AmbienceDirector.js'

/* ---------- Ciels vivants (v6.3) ---------- */

/** Une peinture de synthèse : fond uni, puis des formes peintes par `paint(x, y) → [r, g, b] | null`. */
function canvasOf(w, h, bg, paint = () => null) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = paint(x, y) ?? bg
      const i = (y * w + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
  return { w, h, data }
}
const alphaAt = (m, x, y, w = m.w) => m.rgba[(y * w + x) * 4 + 3]

test('v6.3 : chaque chapitre a son ciel vivant, des effets connus, rangés, et les réglages qu’ils lisent', () => {
  const needs = {
    sun: ['sun'], rays: ['sun'], flare: ['sun'], dust: ['sun'], diamond: ['sun'], moon: ['moon'], mist: ['mist'], shadows: ['shadows'],
    gusts: ['gusts'], leaves: ['leaves'], fogroll: ['fogroll'], ripples: ['water'], wisps: ['wisps'], haze: ['haze'], veils: ['veils'],
    devil: ['devil'], glints: ['snow', 'glints'], falls: ['falls'], smoke: ['crater'], fireflies: ['hill', 'fireflies'],
  }
  for (let c = 1; c <= 10; c++) {
    const cfg = SKY_CHAPTERS[c]
    assert.ok(cfg, `chapitre ${c}`)
    assert.ok(cfg.fx.length >= 2, `chapitre ${c} : au moins deux effets`)
    assert.ok(cfg.wind === 1 || cfg.wind === -1, `chapitre ${c} : sens du vent`)
    for (const name of cfg.fx) {
      assert.equal(typeof EFFECTS[name], 'function', `effet ${name}`)
      assert.ok(SKY_ORDER.includes(name), `ordre de dessin de ${name}`)
      for (const key of needs[name] ?? []) assert.ok(cfg[key] !== undefined, `chapitre ${c} : ${name} lit « ${key} »`)
    }
    for (const what of cfg.replaces) assert.ok(['weather', 'motes'].includes(what), `chapitre ${c} : remplace ${what}`)
  }
  // Rien n'est doublé : là où le jeu fait déjà pleuvoir, neiger ou brumer, le ciel vivant le remplace.
  for (const c of [5, 8, 9]) assert.ok(SKY_CHAPTERS[c].replaces.includes('weather'), `chapitre ${c}`)
})

test('v6.3 : lecture des peintures : le soleil, ses rayons, et rien d’autre', () => {
  const w = 320
  const h = 160
  const sun = { x: 240, y: 30, r: 8 }
  // Un rayon clair qui part du soleil vers le bas à gauche, et une tache claire (un nuage) à l'écart.
  const onRay = (x, y) => {
    const dx = x - sun.x
    const dy = y - sun.y
    const d = Math.hypot(dx, dy)
    const ax = -0.8
    const ay = 0.6
    const along = dx * ax + dy * ay
    const across = Math.abs(dx * -ay + dy * ax)
    return d > sun.r * 2 && along > 0 && along < 120 && across < 2
  }
  const img = canvasOf(w, h, [90, 140, 200], (x, y) => {
    if (Math.hypot(x - sun.x, y - sun.y) < sun.r) return [255, 255, 255]
    if (onRay(x, y)) return [190, 210, 235]
    if (Math.hypot(x - 60, y - 110) < 14) return [230, 235, 240]
    return null
  })
  const found = findSun(img, [0.74, 0.2])
  assert.ok(Math.abs(found.u * w - sun.x) < 1.5 && Math.abs(found.v * h - sun.y) < 1.5, `centre ${found.u * w}, ${found.v * h}`)
  const rays = rayMasks(img, found, [255, 250, 230], { reach: 0.6 })
  assert.ok(rays, 'un rayon est lu')
  const lit = rays.layers.reduce((n, layer) => n + layer.filter((_, i) => i % 4 === 3 && layer[i] > 0).length, 0)
  assert.ok(lit > 40, `pixels du rayon : ${lit}`)
  // La tache claire n'est pas un rayon : elle ne part pas du soleil.
  for (const layer of rays.layers) assert.equal(alphaAt({ rgba: layer, w }, 60, 110), 0)
})

test('v6.3 : lecture des peintures : étoiles, lave, herbe, eau, neige, cascade', () => {
  const sky = canvasOf(200, 100, [20, 24, 50], (x, y) => ((x === 50 && y === 20) || (x === 150 && y === 30) ? [240, 240, 255] : null))
  let k = 0
  const stars = findStars(sky, 1, () => (k++ % 10) / 10)
  assert.equal(stars.length, 2)
  assert.ok(stars.every((s) => s.b > 0 && s.u > 0 && s.v > 0))

  const lava = lavaMask(canvasOf(40, 20, [40, 30, 30], (x) => (x < 20 ? [255, 120, 20] : null)))
  assert.ok(alphaAt(lava, 5, 5) > 200 && alphaAt(lava, 30, 5) === 0)
  assert.ok(lava.spots.length > 0 && lava.spots.every((s) => s.u < 0.5))

  // Herbe verte en bas, ciel bleu en haut, bruyère pourpre à droite : seul ce qui est demandé s'éclaire.
  const field = canvasOf(60, 60, [110, 160, 220], (x, y) => (y < 30 ? null : x < 30 ? [90, 170, 60] : [160, 100, 150]))
  const green = grassMask(field, { from: 0.3, tint: [255, 255, 200], kinds: ['grass'] })
  assert.ok(alphaAt(green, 10, 50) > 0, 'l’herbe')
  assert.equal(alphaAt(green, 10, 10), 0, 'pas le ciel')
  assert.equal(alphaAt(green, 50, 50), 0, 'pas la bruyère')
  const heather = grassMask(field, { from: 0.3, tint: [255, 255, 200], kinds: ['heather'] })
  assert.ok(alphaAt(heather, 50, 50) > 0)

  // Eau calme (claire, grise, lisse) en bas ; neige très claire au-dessus.
  const marsh = canvasOf(90, 60, [70, 90, 60], (x, y) => (y > 40 ? [205, 212, 210] : y < 15 ? [245, 247, 250] : null))
  const water = spotsWhere(marsh, { from: 0.6 }, isWater)
  const snow = spotsWhere(marsh, { from: 0, to: 0.3 }, isSnow)
  assert.ok(water.length > 20 && water.every((p) => p.v > 0.6))
  assert.ok(snow.length > 20 && snow.every((p) => p.v < 0.3))

  // Cascade : l'eau claire dans sa boîte, pas la roche.
  const cliff = canvasOf(100, 100, [90, 95, 110], (x) => (x >= 40 && x < 50 ? [225, 235, 245] : null))
  const falls = fallsMask(cliff, [0.3, 0.2, 0.6, 0.8])
  assert.equal(falls.x0, 30)
  assert.ok(alphaAt(falls, 15, 20, falls.bw) > 200, 'l’eau')
  assert.equal(alphaAt(falls, 2, 20, falls.bw), 0, 'la roche')
})

/** Une vue de 1280 × 720 et une peinture posée dessus (voir BackdropPainter). */
function view() {
  const iw = 1440
  const ih = 640
  return { W: 1280, H: 720, ground: 620, x0: -80, y0: -10, iw, ih, s: 1, u: 1, map: (u, v) => ({ x: -80 + u * iw, y: -10 + v * ih }) }
}

test('v6.3 : ciel vivant : son propre hasard (les mêmes éclairs à chaque fois), le tonnerre suit l’éclair', () => {
  const run = () => {
    const sky = new LivingSky(9, SKY_CHAPTERS[9], {}, {})
    const events = []
    for (let t = 0; t <= 30000; t += 16) {
      sky.update(t, view(), { wind: 0 })
      events.push(...sky.drain())
    }
    return events
  }
  const a = run()
  const b = run()
  assert.ok(a.length >= 2, `éclairs en 30 s : ${a.length}`)
  assert.ok(a.every((e) => e.kind === 'thunder' && e.distance >= 0.2 && e.distance <= 0.9))
  assert.deepEqual(a, b, 'même graine, mêmes éclairs')
  // Le hasard du ciel est à part : celui du jeu (Math.random) n'est pas touché.
  const before = Math.random
  let calls = 0
  Math.random = () => {
    calls++
    return before()
  }
  try {
    run()
  } finally {
    Math.random = before
  }
  assert.equal(calls, 0, 'aucun tirage dans le hasard global')
})

test('v6.3 : ciel vivant : il suit le vent du niveau, sinon le sens du chapitre ; ses sons attendent qu’on les relève', () => {
  const sky = new LivingSky(1, SKY_CHAPTERS[1], { sun: { u: 0.82, v: 0.2, r: 0.02 } }, {})
  assert.equal(sky.dir, 1)
  sky.update(0, view(), { wind: -0.4 })
  assert.equal(sky.dir, -1, 'vent du niveau vers la gauche')
  sky.update(16, view(), { wind: 0.01 })
  assert.equal(sky.dir, -1, 'un souffle trop faible ne change rien')
  // Une risée finit par passer, avec son souffle.
  let gust = null
  for (let t = 32; t < 20000 && !gust; t += 16) {
    sky.update(t, view(), { wind: -0.4 })
    gust = sky.drain().find((e) => e.kind === 'gust') ?? null
  }
  assert.ok(gust, 'une risée en vingt secondes')
  assert.equal(gust.dir, -1)
  assert.deepEqual(sky.drain(), [], 'relevés une seule fois')
  assert.ok(sky.replaces('motes') === false && new LivingSky(10, SKY_CHAPTERS[10], {}, {}).replaces('motes'))
})

test('v6.3 : ciel vivant : sans temps qui passe (mouvement réduit), rien n’avance', () => {
  const sky = new LivingSky(9, SKY_CHAPTERS[9], {}, {})
  sky.update(5000, view())
  sky.update(5000, view())
  assert.equal(sky.t, 0)
  assert.deepEqual(sky.drain(), [])
})

test('v6.3 : ambiance : à l’Orage peint, le tonnerre suit les éclairs (plus de grondement au hasard) ; la cascade gronde au Fort de pierre', () => {
  assert.ok(ambienceProfile(9, false).voices.rumble > 0, 'sans peinture (démo, portails) : le grondement reste')
  assert.equal(ambienceProfile(9, true).voices.rumble, undefined)
  assert.ok(ambienceProfile(9, true).rain, 'la pluie reste')
  assert.equal(ambienceProfile(2, true).bed, SKY_BEDS[2])
  assert.equal(ambienceProfile(2, true).bed, 'falls')
  assert.equal(ambienceProfile(2, false).bed, undefined)
  assert.deepEqual(ambienceProfile(1, true).voices, AMBIENCE_PROFILES[1].voices)
})
