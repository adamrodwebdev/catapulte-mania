import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HealthBarTracker, BAR_FX } from '../src/game/rendering/HealthBar.js'
import { POISON } from '../src/game/entities/catalog.js'

/* ---------- Barres de vie (v6.2) ---------- */

/** Fait fondre une barre : `rate` points de vie par seconde, `fps` images par seconde, `ms` de durée. */
function drain(tracker, entity, { hp, maxHp, rate, fps = 60, ms = 3000, t0 = 1000, blows = {} }) {
  const dt = 1000 / fps
  const frames = []
  let t = t0
  for (let i = 0; t < t0 + ms; i++) {
    t = t0 + i * dt
    hp = Math.max(0, hp - rate * (dt / 1000))
    if (blows[i]) hp -= blows[i]
    const s = tracker.track(entity, hp, maxHp, t, true)
    frames.push({ t, hp: s.hp, lag: s.lag, hitAt: s.hitAt, flashing: t - s.hitAt < BAR_FX.FLASH })
  }
  return frames
}

test('v6.2 : barre de vie d’un défenseur empoisonné (60 PV) : 3 s de fonte sans éclair permanent, la traînée se vide', () => {
  const frames = drain(new HealthBarTracker(), {}, { hp: 60, maxHp: 60, rate: POISON.DPS })
  const flashing = frames.filter((f) => f.flashing).length
  assert.ok(flashing <= BAR_FX.FLASH / (1000 / 60) + 1, `au plus un éclair (début de la fonte) : ${flashing} images`)
  assert.ok(frames.at(-1).hp < 20, 'la vie a bien fondu')
  // La traînée suit la vie au lieu de rester accrochée au début de la fonte.
  for (const f of frames.slice(30)) assert.ok(f.lag - f.hp < 60 * 0.08, `traînée ${(f.lag - f.hp).toFixed(2)} à ${f.t}`)
})

test('v6.2 : barre de vie : feu (70 % de la vie par seconde), à 60 et à 30 images par seconde : un seul coup au départ', () => {
  for (const fps of [60, 30]) {
    const frames = drain(new HealthBarTracker(), {}, { hp: 60, maxHp: 60, rate: (60 / 1.5) * 1.05, fps, ms: 1300 })
    const hits = new Set(frames.map((f) => f.hitAt).filter(Number.isFinite))
    assert.ok(hits.size <= 1, `${fps} i/s : ${hits.size} coups`)
    // La traînée suit la vie qui fond (hier, elle restait accrochée aux 60 PV du départ).
    const last = frames.at(-1)
    assert.ok(last.lag < 30, `${fps} i/s : traînée à ${last.lag.toFixed(2)} PV`)
    assert.ok(last.lag - last.hp < 60 * 0.2, `${fps} i/s : traînée ${(last.lag - last.hp).toFixed(2)}`)
  }
})

test('v6.2 : barre de vie : un vrai coup pendant la fonte compte (éclair), puis la traînée se vide', () => {
  const frames = drain(new HealthBarTracker(), {}, { hp: 60, maxHp: 60, rate: POISON.DPS, blows: { 90: 12 } })
  const hit = frames[90]
  assert.equal(hit.hitAt, hit.t, 'le coup est vu à l’image où il tombe')
  assert.ok(hit.flashing)
  assert.ok(hit.lag - hit.hp >= 11.9, 'la part perdue reste en traînée')
  const later = frames[90 + Math.ceil((BAR_FX.HOLD + 900) / (1000 / 60))]
  assert.ok(later.lag - later.hp < 1, `puis elle se vide : ${(later.lag - later.hp).toFixed(2)}`)
})

test('v6.2 : barre de l’engin : le feu (lent) n’est pas un coup, la frappe d’un pillard (3 %) en est un', () => {
  const tracker = new HealthBarTracker()
  let hp = 0.8
  let t = 0
  let hits = 0
  for (let i = 0; i < 240; i++) {
    t += 1000 / 60
    hp -= (1.3 * Math.pow(3, 1.5)) / 100 / 60
    if (i === 200) hp -= 0.03
    const s = tracker.trackEngine(hp, 1, t, true)
    if (s.hitAt === t) hits++
    if (i === 200) assert.equal(s.hitAt, t, 'la frappe du pillard fait éclair')
  }
  assert.equal(hits, 1)
})

test('v6.2 : la mémoire des barres reste dans le rendu : rien n’est écrit sur l’entité', () => {
  const tracker = new HealthBarTracker()
  const entity = Object.freeze({ id: 1 })
  const a = tracker.track(entity, 50, 60, 0)
  const b = tracker.track(entity, 40, 60, 16)
  assert.equal(a, b, 'le même état d’une image à l’autre')
  assert.equal(b.hitAt, 16)
  assert.notEqual(tracker.track({ id: 2 }, 60, 60, 16), a, 'une barre par entité')
})

/* ---------- Règles lues par le dessin (v6.2) ---------- */

test('v6.2 : règles lues sur les entités : sonné, empoisonné, armure, torche, général qui se relève', async () => {
  const { Target } = await import('../src/game/entities/Target.js')
  const { General, GUARD_MS } = await import('../src/game/entities/General.js')
  const t = new Target({ type: 'soldier', x: 100, y: 100, torch: true })
  assert.equal(t.stunAt(0), null)
  Object.assign(t, { stunUntil: 500, stunKind: 'shock' })
  assert.equal(t.stunAt(499), 'shock')
  assert.equal(t.stunAt(500), null)
  t.poisonUntil = 800
  assert.equal(t.poisonedAt(799), true)
  assert.equal(t.poisonedAt(800), false)
  assert.equal(t.armored, false)
  assert.equal(new Target({ type: 'knight', x: 0, y: 0 }).armored, true, 'chevalier : liseré d’acier')
  assert.equal(t.torchLit, true)
  t.frozenMs = 100
  assert.equal(t.torchLit, false, 'gelé : la torche est éteinte')
  const g = new General({ x: 0, y: 0, general: 'rufus' }, 1, 3)
  assert.equal(g.guardProgress, 1)
  g.guardMs = GUARD_MS / 4
  assert.equal(g.guardProgress, 0.75)
})

test('v6.2 : règles lues sur les blocs : trempé, fer rougi ou électrisé, grande montagne ; ce qui éclaire', async () => {
  const { Block } = await import('../src/game/entities/Block.js')
  const { Projectile } = await import('../src/game/entities/Projectile.js')
  const forge = new Block({ material: 'stone', x: 0, y: 0, w: 64, h: 40, prop: 'forge' })
  assert.equal(forge.quenchedAt(0), false)
  forge.quenchedUntil = 100
  assert.equal(forge.quenchedAt(99), true)
  assert.equal(forge.quenchedAt(100), false)
  const iron = new Block({ material: 'iron', x: 0, y: 0, w: 40, h: 40 })
  assert.equal(iron.redHotAt(0), false)
  assert.equal(iron.chargedAt(0), false)
  iron.hotUntil = 2000
  iron.chargedUntil = 300
  assert.equal(iron.redHotAt(1999), true)
  assert.equal(iron.redHotLeft(500), 1500)
  assert.equal(iron.chargedAt(299), true)
  assert.equal(new Block({ material: 'rock', shape: 'triangle', x: 0, y: 0, w: 300, h: 180 }).mountainPeak, true)
  assert.equal(new Block({ material: 'rock', shape: 'triangle', x: 0, y: 0, w: 300, h: 179 }).mountainPeak, false)
  assert.equal(new Block({ material: 'rock', x: 0, y: 0, w: 300, h: 300 }).mountainPeak, false, 'un rocher carré n’est pas un sommet')
  assert.equal(iron.alight, false)
  iron.burning = 100
  assert.equal(iron.alight, true)
  // Un boulet enflammé éclaire en vol, puis tant qu'il est chaud ; usé, il éclaire encore (ce n'est pas `hot`).
  const fire = new Projectile('fire', 0, 0)
  assert.equal(fire.alight, true)
  fire.hasImpacted = true
  fire.burning = 0
  fire.heatMs = 400
  fire.spent = true
  assert.equal(fire.alight, true)
  assert.equal(fire.hot, false)
  fire.heatMs = 0
  assert.equal(fire.alight, false)
  assert.equal(new Projectile('stone', 0, 0).alight, false)
})

test('v6.2 : adaptateurs de vue : défenseur, créature, ouvrage, roche, dans cet ordre', async () => {
  const { viewExtra } = await import('../src/game/rendering/EntityViewAdapter.js')
  const { Target } = await import('../src/game/entities/Target.js')
  const { Block } = await import('../src/game/entities/Block.js')
  const frame = { time: 5000, worldTime: 1000, animate: true, alert: true, theme: 7 }
  const t = new Target({ type: 'soldier', x: 0, y: 0 })
  Object.assign(t, { stunUntil: 1500, stunKind: 'hit', poisonUntil: 1200 })
  const ex = viewExtra(t, frame)
  assert.equal(ex.stun, 'hit')
  assert.equal(ex.poisoned, true)
  assert.equal(ex.alert, true)
  assert.equal(ex.still, false)
  assert.deepEqual(viewExtra({ kind: 'flyer', flap: 0.6, facing: 1, carrying: true }, { ...frame, animate: false }), { flap: 0.25, facing: 1, carrying: true })
  const mill = new Block({ material: 'wood', x: 0, y: 0, w: 64, h: 58, prop: 'windmill' })
  mill.quenchedUntil = 2000
  assert.deepEqual(viewExtra(mill, frame), { mill: 0, frozen: false, quenched: true, still: false })
  assert.deepEqual(viewExtra(new Block({ material: 'rock', x: 0, y: 0, w: 60, h: 60 }), frame), { theme: 7 })
  assert.equal(viewExtra(new Block({ material: 'wood', x: 0, y: 0, w: 60, h: 20 }), frame), undefined)
})

/* ---------- Jetons de décor (v6.2) ---------- */

test('v6.2 : jetons de décor : astre, poussières, habit de la roche, or de l’engin, valeurs d’hier', async () => {
  const { THEMES, SUN_AT } = await import('../src/game/assets/procedural/themes.js')
  const { sunPosition, moteKind } = await import('../src/game/assets/procedural/scenery.js')
  const { CATAPULT_SKINS } = await import('../src/game/assets/procedural/engines.js')
  const { ENGINE_GOLD, PEAK_PLUMES } = await import('../src/game/assets/procedural/palette.js')
  assert.deepEqual(sunPosition(3, 1000, 500), { x: 780, y: 210, r: 30 })
  for (const theme of [1, 2, 4, 5, 6, 7, 8, 9, 10, 99]) assert.deepEqual(sunPosition(theme, 1000, 500), { x: 1000 * SUN_AT[0], y: 500 * SUN_AT[1], r: 30 })
  assert.equal(moteKind(10, THEMES[10]), 'ember')
  const rock = Object.fromEntries(Object.entries(THEMES).map(([k, th]) => [k, th.rock ?? null]))
  assert.deepEqual(rock, { 1: null, 2: null, 3: null, 4: null, 5: null, 6: 'sand', 7: 'snow', 8: 'snow', 9: null, 10: null })
  assert.equal(THEMES[8].rockSnowLine, 0.42)
  assert.equal(PEAK_PLUMES.snow.rgb, '250,252,255')
  assert.equal(CATAPULT_SKINS.gold.tint, ENGINE_GOLD.tint)
  assert.equal(CATAPULT_SKINS.gold.metal, ENGINE_GOLD.metal)
})

/* ---------- Particules (v6.2) : le système simule, le peintre dessine ---------- */

/** Contexte 2D factice : il accepte tout et compte les appels. */
function fakeContext() {
  const calls = []
  const ctx = new Proxy(
    {},
    {
      get: (t, prop) => {
        if (prop in t) return t[prop]
        if (prop === 'measureText') return (s) => ({ width: String(s).length * 7 })
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop() {} })
        return (...args) => calls.push([prop, args])
      },
      set: (t, prop, v) => {
        t[prop] = v
        return true
      },
    },
  )
  return { ctx, calls }
}

test('v6.2 : particules : le peintre dessine toutes les sortes ; le système ne dessine plus', async () => {
  const saved = globalThis.OffscreenCanvas
  globalThis.OffscreenCanvas = class {
    getContext() {
      return fakeContext().ctx
    }
  }
  try {
    const { ParticleSystem } = await import('../src/game/effects/ParticleSystem.js')
    const { ParticlePainter } = await import('../src/game/effects/ParticlePainter.js')
    const ps = new ParticleSystem()
    assert.equal(typeof ps.draw, 'undefined')
    ps.explosion(500, 800, 100)
    ps.blood(600, 850, 900, 1)
    ps.knockout(700, 850, { key: 'target.soldier', w: 26, h: 50, extra: {}, still: false })
    ps.shell(1000, 500, 500, 880, 900, 'arrows')
    ps.callout(800, 500, 'Doublé !', 2)
    ps.bubble(800, 700, 'Hé !')
    ps.text(800, 600, '+100')
    ps.lightning(900, 880)
    ps.streak(700, 600, 1)
    ps.confetti(800, 600)
    for (let i = 0; i < 20; i++) ps.update(1000 / 60)
    const sprites = []
    const { ctx, calls } = fakeContext()
    new ParticlePainter().draw(ctx, ps.items, 1, 1280, 100, (c, key, state) => sprites.push({ key, state }))
    assert.ok(calls.length > 100)
    assert.equal(sprites.length, 1, 'le défenseur assommé emprunte le dessin des personnages')
    assert.ok(sprites[0].state.memory instanceof Map, 'avec la mémoire de son dessin')
  } finally {
    globalThis.OffscreenCanvas = saved
  }
})

/* ---------- Mémoire des personnages (v6.2) ---------- */

test('v6.2 : vigilance des personnages : une mémoire par appelant, rien de partagé', async () => {
  const { alertLevel } = await import('../src/game/assets/procedural/characters.js')
  const game = new Map()
  const editor = new Map()
  assert.equal(alertLevel(game, 42, true, 1), 1, 'première image : la vigilance suit l’alerte')
  const v = alertLevel(game, 42, false, 1.1)
  assert.ok(v > 0 && v < 1, `puis elle se détend en douceur : ${v}`)
  assert.equal(editor.size, 0, 'l’atelier ne voit rien de la partie')
  assert.equal(alertLevel(editor, 42, false, 1.2), 0, 'chacun sa vigilance')
  assert.equal(alertLevel(undefined, 42, true, 1.3), 1, 'sans mémoire : pas de lissage')
  assert.equal(game.size, 1)
})

/* ---------- Corrections visuelles (v6.2) ---------- */

test('v6.2 : vitesse du bras : suivie d’une image à l’autre pour le même engin (flou du bras, balancier)', async () => {
  const { EnginePainter } = await import('../src/game/rendering/EnginePainter.js')
  const painter = new EnginePainter()
  const seen = []
  const assets = { draw: (ctx, key, state) => seen.push({ key, extra: state.extra }) }
  const { ctx } = fakeContext()
  // La scène refait l'objet de l'engin à chaque image : la vitesse doit pourtant se mesurer.
  for (let i = 0; i < 4; i++) painter.draw(ctx, { kind: 'catapult', dir: 1, armAngle: 0.1 * i, load: null, loadRadius: 0, skin: 'oak', flag: null, roll: 0 }, assets, 1, 1000 + (i * 1000) / 60, true)
  assert.equal(seen[0].extra.armSpeed, 0, 'première image : rien à comparer')
  assert.ok(seen[3].extra.armSpeed > 4, `le bras fouette l’air : ${seen[3].extra.armSpeed.toFixed(1)} rad/s`)
  // Deux engins face à face : chacun sa mesure.
  painter.draw(ctx, { kind: 'catapult', dir: -1, armAngle: 3, load: null, loadRadius: 0, skin: 'oak', flag: null, roll: 0 }, assets, 1, 1000 + 4000 / 60, true)
  assert.equal(seen[4].extra.armSpeed, 0)
  for (let i = 0; i < 2; i++) painter.draw(ctx, { kind: 'trebuchet', dir: 1, rig: { theta: 2 + 0.05 * i, sling: null }, x: 0, y: 0, loaded: false, load: null, loadRadius: 0, skin: 'oak', flag: null }, assets, 1, 2000 + (i * 1000) / 60, true)
  assert.ok(seen[6].extra.thetaSpeed > 1, 'le trébuchet aussi (balancier du contrepoids)')
})

test('v6.2 : carreau de baliste : il suit sa course, puis garde son cap une fois qu’il ne fait plus que trembler', async () => {
  const { BoltHeadings, BOLT_STEER_SPEED } = await import('../src/game/rendering/EntityViewAdapter.js')
  const headings = new BoltHeadings()
  const bolt = { body: { velocity: { x: 20, y: 5 } } }
  const flight = headings.of(bolt)
  assert.equal(flight, Math.atan2(5, 20))
  // Planté : de petits rebonds en tous sens ne le font plus tourner.
  for (const v of [{ x: 0.6, y: -0.3 }, { x: -2, y: 0.1 }, { x: 0.05, y: 0.04 }]) {
    bolt.body.velocity = v
    assert.equal(headings.of(bolt), flight)
  }
  // Un vrai rebond, lui, se suit.
  bolt.body.velocity = { x: -(BOLT_STEER_SPEED + 2), y: 0 }
  assert.equal(headings.of(bolt), Math.PI)
  assert.equal(headings.of({ body: { velocity: { x: 0, y: 0.5 } } }), Math.atan2(0.5, 0), 'un carreau jamais vu prend le cap de sa vitesse')
})

/** Image factice : elle « charge » au tour suivant (ou échoue si l'adresse contient « missing »). */
class FakeImage {
  width = 2560
  height = 1440
  set src(url) {
    setTimeout(() => (url.includes('missing') ? this.onerror?.() : this.onload?.()), 0)
  }
}

test('v6.2 : fond peint : fondu en partie, d’un coup dans l’atelier ; la vue est prévenue quand il arrive', async () => {
  const saved = globalThis.Image
  globalThis.Image = FakeImage
  try {
    const { BackgroundArt } = await import('../src/game/rendering/BackgroundArt.js')
    const game = new BackgroundArt({ 1: { url: 'a.webp', ground: 0.95 }, 2: { url: 'missing.webp' } })
    assert.equal(game.ready(1, 0), null, 'pas encore chargé : décor dessiné')
    assert.equal(await game.whenReady(1), true)
    assert.equal(game.ready(1, 1000).alpha, 0, 'en partie : la peinture apparaît en fondu…')
    assert.equal(game.ready(1, 1175).alpha, 0.5)
    assert.equal(game.ready(1, 1400).alpha, 1)
    assert.equal(await game.whenReady(2), false, 'image introuvable')
    assert.equal(await game.whenReady(3), false, 'pas de peinture pour ce chapitre')
    const editor = new BackgroundArt({ 1: { url: 'a.webp' } }, { fadeMs: 0 })
    assert.equal(await editor.whenReady(1), true)
    assert.equal(editor.ready(1, 0).alpha, 1, 'atelier (horloge à 0) : la peinture paraît d’un coup')
  } finally {
    globalThis.Image = saved
  }
})

test('v6.2 : haies et arbres du décor dessiné : ils s’effacent au rythme de la peinture, pas dès son premier instant', async () => {
  const { near } = await import('../src/game/assets/procedural/scenery.js')
  const { THEMES } = await import('../src/game/assets/procedural/themes.js')
  const fills = (art) => {
    const { ctx, calls } = fakeContext()
    const alphas = []
    const tracked = new Proxy(ctx, {
      get: (t, p) => (p === 'fill' ? () => alphas.push(t.globalAlpha ?? 1) : t[p]),
      set: (t, p, v) => ((t[p] = v), true),
    })
    near(tracked, { extra: { th: THEMES[1], versus: true, art } })
    return { alphas, calls }
  }
  const none = fills(0)
  const half = fills(0.5)
  const full = fills(1)
  assert.ok(none.alphas.length > 20, 'sans peinture : bosquets et arbres')
  assert.equal(half.alphas.length, none.alphas.length, 'pendant le fondu : toujours là…')
  assert.ok(half.alphas.every((a) => a === 0.5), '… à moitié effacés')
  assert.equal(full.alphas.length, 0, 'peinture entière : ni bosquets ni arbres (la peinture les porte)')
  assert.equal(fills(true).alphas.length, 0)
})
