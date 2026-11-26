import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SKY_CHAPTERS, SKY_ORDER, SKY_BEDS } from '../src/game/sky/skyConfig.js'
import { EFFECTS } from '../src/game/sky/effects.js'
import { LivingSky } from '../src/game/sky/LivingSky.js'
import { fallsMask, findStars, findSun, grassMask, isSnow, isWater, lavaMask, rayMasks, spotsWhere, waterTest } from '../src/game/sky/paintingAnalysis.js'
import { PAINTERS } from '../src/game/assets/procedural/painters.js'
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
    sun: ['sun'], shafts: ['sun'], rays: ['sun'], flare: ['sun'], dust: ['sun'], diamond: ['sun'], moon: ['moon'], mist: ['mist'], shadows: ['shadows'],
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

/* ---------- Ciels vivants sur les photographies (v6.4) ---------- */

/** Un document de synthèse : des canevas qui acceptent tout et ne dessinent rien (sprites sous Node). */
function fakeDocument() {
  const stub = new Proxy({}, { get: (_, k) => (k === 'addColorStop' ? () => {} : () => stub), set: () => true })
  return { createElement: () => ({ width: 1, height: 1, getContext: () => stub }) }
}

/** Un contexte qui relève les méthodes appelées (et garde les propriétés posées). */
function recorder() {
  const calls = []
  const gradient = { addColorStop() {} }
  const ctx = new Proxy(
    {},
    {
      get: (t, k) =>
        k in t
          ? t[k]
          : () => {
              calls.push(k)
              return String(k).startsWith('create') ? gradient : undefined
            },
      set: (t, k, v) => {
        t[k] = v
        return true
      },
    },
  )
  return { ctx, calls }
}

test('v6.4 : rais de lumière : réglés là où les rayons ne se lisent plus, dans leur éventail, voilés par un nuage', () => {
  let chapters = 0
  for (let c = 1; c <= 10; c++) {
    const cfg = SKY_CHAPTERS[c]
    if (!cfg.fx.includes('shafts')) continue
    chapters++
    const s = cfg.sun.shafts
    assert.ok(s.count >= 3 && s.spread[0] < s.spread[1] && s.width[0] <= s.width[1] && s.reach > 0 && s.alpha > 0 && s.alpha <= 0.3, `chapitre ${c}`)
    assert.ok(!cfg.fx.includes('rays'), `chapitre ${c} : pas de rayons peints lus en plus`)
  }
  assert.ok(chapters >= 4, 'les chapitres ensoleillés')
  const saved = globalThis.document
  globalThis.document = fakeDocument()
  try {
    const sky = new LivingSky(1, SKY_CHAPTERS[1], { sun: { u: 0.6, v: 0.07, r: 0.02 } }, {})
    const shafts = sky.effect('shafts')
    const draw = (veil) => {
      sky.veil = veil
      const rec = { angles: [], alphas: [], images: 0 }
      const ctx = {
        save() {},
        restore() {},
        translate() {},
        rotate: (a) => rec.angles.push(a),
        drawImage: () => rec.images++,
        set globalAlpha(v) {
          rec.alphas.push(v)
        },
        globalCompositeOperation: 'source-over',
      }
      shafts.draw(ctx, view(), 4, true, 1)
      rec.mode = ctx.globalCompositeOperation
      return rec
    }
    const clear = draw(0)
    const { count, spread } = SKY_CHAPTERS[1].sun.shafts
    assert.equal(clear.images, count, 'un faisceau par rai')
    assert.equal(clear.mode, 'screen', 'la lumière éclaircit sans brûler')
    for (const a of clear.angles) {
      const deg = ((a + Math.PI / 2) * 180) / Math.PI
      assert.ok(deg >= spread[0] - 3 && deg <= spread[1] + 3, `angle ${deg.toFixed(1)}°`)
    }
    const veiled = draw(1)
    assert.ok(Math.max(...veiled.alphas) < Math.max(...clear.alphas) * 0.3, 'un nuage voile le soleil : les rais pâlissent')
    // Sans soleil lu, rien.
    const none = new LivingSky(1, SKY_CHAPTERS[1], {}, {}).effect('shafts')
    let drawn = 0
    none.draw({ save() {}, restore() {}, drawImage: () => drawn++ }, view(), 4, true, 1)
    assert.equal(drawn, 0)
  } finally {
    globalThis.document = saved
  }
})

test('v6.4 : photographies : étoiles faibles, eau teintée de brume, lave dans ses zones (et orange)', () => {
  // Un ciel de nuit photographié : deux étoiles faibles, trop pâles pour le seuil des peintures.
  const faint = canvasOf(200, 100, [22, 24, 60], (x, y) => ((x === 50 && y === 20) || (x === 150 && y === 30) ? [90, 95, 130] : null))
  assert.equal(findStars(faint, 1, () => 0.5).length, 0, 'trop faibles pour un ciel peint')
  const found = findStars(faint, 1, () => 0.5, { min: 48, contrast: 22 })
  assert.equal(found.length, 2)
  assert.ok(found.every((s) => s.b > 0.5), 'leur éclat se mesure à leur seuil')
  const kept = findStars(faint, 1, () => 0.5, { min: 48, contrast: 22, avoid: [[0.25, 0.2, 0.03]] })
  assert.deepEqual(
    kept.map((s) => Math.round(s.u * 200)),
    [150],
    'un disque écarté (la lune, le bord d’un nuage)',
  )
  assert.equal(findStars(faint, 1, () => 0.5, { min: 48, contrast: 22, top: 0.25 }).length, 1, 'seulement dans la zone lue')

  // Une mare sous une brume verte : claire mais teintée ; le test des peintures la manquait.
  const pond = canvasOf(90, 60, [60, 90, 50], (x, y) => (y > 40 ? [170, 215, 140] : null))
  assert.equal(spotsWhere(pond, { from: 0.6 }, isWater).length, 0)
  const tinted = spotsWhere(pond, { from: 0.6 }, waterTest({ min: 125, sat: 120 }))
  assert.ok(tinted.length > 20 && tinted.every((p) => p.v > 0.6), `eau : ${tinted.length}`)

  // Lave : le ciel rougi par l'éruption n'en est pas ; le cœur blanc reste orange.
  const field = canvasOf(40, 40, [40, 30, 30], (x, y) => (y < 10 ? [255, 120, 20] : y > 30 ? [255, 250, 30] : null))
  assert.ok(alphaAt(lavaMask(field), 5, 5) > 0, 'sans zones : tout ce qui est chaud')
  const zoned = lavaMask(field, { areas: [[0, 0.7, 1, 1]] })
  assert.equal(alphaAt(zoned, 5, 5), 0, 'hors zone')
  assert.ok(alphaAt(zoned, 5, 35) > 200, 'dans la zone')
  assert.ok(zoned.spots.length > 0 && zoned.spots.every((s) => s.v >= 0.7), 'les braises partent de la lave')
  assert.ok(zoned.rgba[(35 * 40 + 5) * 4 + 1] <= 190, 'orange, pas citron')
})

test('v6.4 : sur une peinture, les nuages qui montrent le vent sont des voiles doux, pas des nuages dessinés', () => {
  const state = (overlay) => ({ w: 1280, h: 720, extra: { theme: 1, viewW: 1280, viewH: 720, time: 0, animate: false, overlay } })
  const drawn = recorder()
  PAINTERS['scene.sky'](drawn.ctx, state(false))
  assert.ok(drawn.calls.filter((c) => c === 'ellipse').length >= 7 * 5, 'décor dessiné : ses nuages')
  const saved = globalThis.document
  globalThis.document = fakeDocument()
  try {
    const painted = recorder()
    PAINTERS['scene.sky'](painted.ctx, state(true))
    assert.equal(painted.calls.filter((c) => c === 'ellipse').length, 0, 'aucun nuage dessiné sur la peinture')
    assert.equal(painted.calls.filter((c) => c === 'drawImage').length, 4, 'quatre voiles, qui dérivent avec le vent')
  } finally {
    globalThis.document = saved
  }
})

/* ---------- Fond WebGL2 (v6.5, prototype) ---------- */

test('v6.5 : le ciel vivant laisse au fond WebGL2 les effets qu’il dessine, et lui donne ses rais', async () => {
  const { GpuBackdrop } = await import('../src/game/rendering/gl/GpuBackdrop.js')
  assert.equal(GpuBackdrop.attach({ parentNode: null }), null, 'sans document ni parent : pas de fond WebGL2, le rendu 2D garde tout')
  const sky = new LivingSky(2, SKY_CHAPTERS[2], { sun: { u: 0.37, v: 0.03, r: 0.02 } }, {})
  const beams = sky.effect('shafts').beams
  assert.equal(beams.length, SKY_CHAPTERS[2].sun.shafts.count)
  assert.ok(Object.isFrozen(beams) && beams.every((b) => Object.isFrozen(b)), 'lus par le fond, jamais modifiés')
  const drawn = []
  const ctx = new Proxy({}, { get: (_, k) => (k === 'drawImage' ? (...a) => drawn.push(a) : () => {}), set: () => true })
  const saw = []
  for (const [name, fx] of [['shafts', sky.effect('shafts')], ['mist', sky.effect('mist')]]) {
    fx.draw = () => saw.push(name)
  }
  sky.draw(ctx, view(), { except: new Set(['shafts', 'mist']) })
  assert.deepEqual(saw, [], 'rais et brume passent au fond WebGL2')
  sky.draw(ctx, view())
  assert.deepEqual(saw.sort(), ['mist', 'shafts'], 'sans fond WebGL2, le 2D les dessine')
  assert.equal(sky.time({ animate: false }), 3.2, 'temps figé en mouvement réduit')
})
