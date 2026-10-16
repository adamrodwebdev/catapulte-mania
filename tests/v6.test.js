import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GENERALS, GENERAL_IDS, SKILL_IDS, SKILL_ICONS, livesFor, generalOfLevel } from '../src/game/bosses/generals.js'
import { SKILLS } from '../src/game/bosses/skills.js'
import { ICON_PATHS } from '../src/components/ui/icons.js'
import { DICTIONARIES } from '../src/i18n/index.js'
import { StoryRepository } from '../src/game/story/StoryRepository.js'
import { CHARACTERS } from '../src/game/story/Portraits.meta.js'
import { LevelRepository, buildLevel } from '../src/game/levels/LevelRepository.js'
import { GameSession, STATE, BONUS_POP_MS } from '../src/game/GameSession.js'
import { ReplayPlayer } from '../src/game/replay/ReplayPlayer.js'
import { TrajectoryPredictor } from '../src/game/TrajectoryPredictor.js'
import { SOUND_IDS } from '../src/game/audio/AudioService.js'
import { General, GUARD_MS } from '../src/game/entities/General.js'
import Matter from 'matter-js'

/* ---------- Généraux (v6.0) ---------- */

test('généraux : un par fin de chapitre, des ordres qui existent, des vies selon la difficulté', () => {
  assert.equal(GENERAL_IDS.length, 10)
  for (const id of GENERAL_IDS) {
    const g = GENERALS[id]
    assert.equal(g.level, g.chapter * 10, id)
    assert.equal(generalOfLevel(g.level), id)
    const level = LevelRepository.get(g.level)
    assert.equal(level.general, id, `niveau ${g.level}`)
    assert.ok(level.stageCount >= 2, `niveau ${g.level} : grand siège`)
    for (const s of g.skills) {
      assert.ok(SKILL_IDS.includes(s), `${id} ${s}`)
      assert.equal(typeof SKILLS[s].perform, 'function', s)
    }
    // Une vie au plus par tir : l'étape du général a un par d'au moins autant de tirs que de vies.
    const stage = level.stages.find((st) => st.targets.some((x) => x.general === id))
    assert.ok(stage.par >= g.lives, `niveau ${g.level} : par ${stage.par} pour ${g.lives} vies`)
    assert.ok(stage.shots > g.lives, `niveau ${g.level} : ${stage.shots} tirs pour ${g.lives} vies`)
    // Facile : une vie de moins (au moins une) ; Normal et Difficile : toutes.
    assert.equal(livesFor(id, 'easy'), Math.max(1, g.lives - 1))
    assert.equal(livesFor(id, 'hard'), g.lives)
  }
  assert.equal(generalOfLevel(11), null)
})

test('généraux : nom, rôle, répliques, ordres et icônes dans toutes les langues', () => {
  for (const s of [...SKILL_IDS]) assert.ok(Object.hasOwn(ICON_PATHS, SKILL_ICONS[s]), `icône ${s}`)
  for (const id of ['horn', 'drumroll', 'bonus']) assert.ok(SOUND_IDS.includes(id), id)
  for (const [lang, dict] of Object.entries(DICTIONARIES)) {
    for (const id of GENERAL_IDS) {
      assert.ok(dict.characters[id]?.name && dict.characters[id]?.role, `${lang} characters.${id}`)
      for (const k of ['motto', 'hurt', 'defeat']) assert.ok(dict.generals[id]?.[k]?.length > 5, `${lang} generals.${id}.${k}`)
    }
    for (const s of [...SKILL_IDS, 'taunt']) {
      assert.ok(dict.skills[s]?.name && dict.skills[s]?.desc?.length > 10, `${lang} skills.${s}`)
    }
    for (const k of ['victory', 'coupDeGrace']) assert.ok(dict.game.callout[k], `${lang} game.callout.${k}`)
  }
})

test('Chronique : chaque général se présente à son chapitre et nargue la troupe avant son grand siège', () => {
  for (const id of GENERAL_IDS) {
    assert.ok(CHARACTERS[id], `portrait ${id}`)
    const g = GENERALS[id]
    if (id !== 'mordrac') {
      const beat = StoryRepository.before((g.chapter - 1) * 10 + 1)
      assert.ok(beat.pages.some((p) => p.speaker === id), `${id} dans « ${beat.id} »`)
    }
    assert.equal(StoryRepository.line(g.level).speaker, id, `réplique du niveau ${g.level}`)
  }
})

test('général : une vie au plus par tir, même sous un effondrement qui dure', () => {
  const g = new General({ x: 1500, y: 900, general: 'mordrac' }, 1, 4)
  g.kill('crush')
  assert.equal(g.lives, 3)
  // Il se relève, puis reste intouchable jusqu'au tour suivant.
  g.update(GUARD_MS + 500)
  g.kill('crush')
  g.kill('fire')
  assert.equal(g.lives, 3)
  assert.equal(g.alive, true)
  // Tour suivant (la partie lève la protection) : il peut perdre la suivante.
  g.shielded = false
  g.kill('impact')
  assert.equal(g.lives, 2)
})

/* ---------- Grand siège : étapes, ordres, relecture ---------- */

const SIEGE = {
  shots: 3,
  wind: 0,
  ammo: {},
  build(b) {
    const t = b.tower(1500, { floors: 2, roof: 'straw' })
    b.target(t[0])
    b.target(t[1])
  },
  stages: [
    {
      shots: 4,
      par: 2,
      build(b) {
        const k = b.tower(1520, { floors: 2, w: 200, mat: 'stone', t: 24, roof: 'wood' })
        b.general(k[1], 'galeran', 30)
        b.target(k[0], 'soldier', -40)
      },
    },
  ],
}

/** Joue le grand siège : chaque « tir » abat ce qui reste (le général d'abord, une vie à la fois). */
function playSiege(replayLog = null) {
  const level = buildLevel(SIEGE, 20, 2)
  const s = new GameSession(level, { difficulty: 'normal', completedLevels: 19, reducedMotion: true, replay: Boolean(replayLog) })
  const events = []
  s.on('stage', (e) => events.push(`stage:${e.phase}:${e.stage}`))
  s.on('general', (e) => events.push(`general:${e.kind}${e.skill ? `:${e.skill}` : ''}`))
  s.on('end', (e) => events.push(`end:${e.won}`))
  if (replayLog) {
    new ReplayPlayer(s, replayLog).runToEnd()
    return { s, events }
  }
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) s.update(1000 / 60)
  }
  let guard = 0
  while (s.state !== STATE.AIMING && guard++ < 1000) step()
  for (let shot = 0; shot < 10 && s.state !== STATE.ENDED; shot++) {
    s.aim(80, 0.2)
    s.fire()
    step(30)
    const alive = s.world.filter((e) => e.kind === 'target' && e.alive && !e.raiding)
    const g = alive.find((e) => e.type === 'general')
    if (g) g.kill('impact')
    else alive.forEach((e) => e.kill('impact'))
    guard = 0
    while (s.state !== STATE.AIMING && s.state !== STATE.ENDED && guard++ < 4000) step()
  }
  return { s, events }
}

test('grand siège : l’étape prise fait venir le donjon du général, qui annonce puis donne ses ordres', () => {
  const { s, events } = playSiege()
  assert.ok(events.includes('stage:cleared:1'), events.join(' '))
  assert.ok(events.includes('stage:begin:2'))
  assert.ok(events.some((e) => e.startsWith('general:turn:')), 'tour du général')
  assert.ok(events.some((e) => e.startsWith('general:act:')), 'ordre donné')
  assert.ok(events.includes('general:hurt'), 'une vie perdue')
  assert.equal(events.at(-1), 'end:true')
  assert.equal(s.stage, 2)
})

/** Puissance qui fait passer la trajectoire par la cible (comme l'aide à la visée). */
function powerFor(s, angle, target) {
  const c = s.catapult
  let lo = 0
  let hi = 1
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    c.setAim(angle, mid)
    const at = TrajectoryPredictor.predict(c.launchPoint, c.velocity, { maxPoints: 600, every: 1 }).find((p) => p.x >= target.x)
    if (!at || at.y > target.y) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

test('grand siège : la relecture de vrais tirs rejoue les mêmes étapes, les mêmes ordres et le même score', () => {
  const level = buildLevel(SIEGE, 20, 2)
  const live = new GameSession(level, { difficulty: 'normal', completedLevels: 19, reducedMotion: true })
  const events = (s) => {
    const out = []
    s.on('stage', (e) => out.push(`stage:${e.phase}:${e.stage}`))
    s.on('general', (e) => e.kind !== 'turn' && out.push(`general:${e.kind}:${e.skill ?? e.lives ?? ''}`))
    s.on('end', (e) => out.push(`end:${e.won}`))
    return out
  }
  const a = events(live)
  let guard = 0
  while (live.state !== STATE.AIMING && guard++ < 1000) live.update(1000 / 60)
  // Chaque tir vise la première cible encore debout.
  for (let shot = 0; shot < 7 && live.state !== STATE.ENDED; shot++) {
    const t = live.world.filter((e) => e.kind === 'target' && e.alive)[0]
    live.aim(50, powerFor(live, 50, t))
    live.fire()
    guard = 0
    while (live.state !== STATE.AIMING && live.state !== STATE.ENDED && guard++ < 6000) live.update(1000 / 60)
  }
  assert.ok(a.includes('stage:cleared:1'), a.join(' '))
  const again = new GameSession(level, { difficulty: 'normal', completedLevels: 19, reducedMotion: true, replay: true })
  const b = events(again)
  new ReplayPlayer(again, live.log).runToEnd()
  assert.deepEqual(b, a)
  assert.equal(again.score.current, live.score.current)
})

/* ---------- Coup de grâce ---------- */

/** Un soldat seul dans la plaine : un tir bien réglé l'atteint. */
function lastStand(reducedMotion) {
  const level = buildLevel({ shots: 4, wind: 0, ammo: {}, build: (b) => b.target(b.spot(1300, 900)) }, 3, 1)
  const s = new GameSession(level, { difficulty: 'normal', completedLevels: 2, reducedMotion })
  const sounds = []
  let end = null
  s.on('feedback', (f) => f.sound && sounds.push(f.sound))
  s.on('end', (e) => (end = e))
  let guard = 0
  while (s.state !== STATE.AIMING && guard++ < 1000) s.update(1000 / 60)
  // Puissance qui fait passer la trajectoire sur le soldat (comme l'aide à la visée).
  const target = s.world.filter((e) => e.kind === 'target')[0]
  const c = s.catapult
  let lo = 0
  let hi = 1
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    c.setAim(45, mid)
    const at = TrajectoryPredictor.predict(c.launchPoint, c.velocity, { maxPoints: 600, every: 1 }).find((p) => p.x >= target.x)
    if (!at || at.y > target.y) lo = mid
    else hi = mid
  }
  s.aim(45, (lo + hi) / 2)
  s.fire()
  return { s, sounds, end: () => end }
}

test('coup de grâce : suspense sur le dernier tir, puis les tirs restants éclatent en points', () => {
  const { s, sounds, end } = lastStand(false)
  let slowFrames = 0
  for (let i = 0; i < 900 && s.state !== STATE.ENDED; i++) {
    const before = s.world.time
    s.update(1000 / 60)
    // Ralenti : moins de temps de monde que de temps réel.
    if (s.state === STATE.FLYING && s.world.time - before < 1000 / 60 * 0.5) slowFrames++
  }
  assert.equal(s.state, STATE.ENDED)
  const e = end()
  assert.equal(e.won, true)
  assert.ok(sounds.includes('drumroll'), 'le tambour roule')
  assert.ok(slowFrames > 3, `ralenti (${slowFrames} images)`)
  // Trois tirs restants : trois éclats, puis le score affiché rejoint le score final.
  assert.equal(e.celebrateMs, 650 + 3 * BONUS_POP_MS)
  const shown = []
  for (let t = 0; t < e.celebrateMs + 200; t += 50) {
    s.update(50)
    shown.push([s.hud.score, s.hud.shotsLeft])
  }
  assert.equal(sounds.filter((x) => x === 'bonus').length, 3)
  assert.equal(s.hud.score, e.result.score)
  assert.equal(s.hud.shotsLeft, 0)
  // Le score monte par paliers, jamais il ne redescend.
  for (let i = 1; i < shown.length; i++) assert.ok(shown[i][0] >= shown[i - 1][0])
})

test('coup de grâce en mouvement réduit : pas de ralenti, le tambour roule quand même', () => {
  const { s, sounds } = lastStand(true)
  let slowFrames = 0
  for (let i = 0; i < 900 && s.state !== STATE.ENDED; i++) {
    const before = s.world.time
    s.update(1000 / 60)
    if (s.state === STATE.FLYING && s.world.time - before < 1000 / 60 * 0.5) slowFrames++
  }
  assert.equal(s.state, STATE.ENDED)
  assert.ok(sounds.includes('drumroll'))
  assert.equal(slowFrames, 0)
})

/* ---------- Mécanismes : potence et pont-levis ---------- */

/** Une partie au niveau donné, tout juste posée (visée). */
function readyAt(id) {
  const s = new GameSession(LevelRepository.get(id), { difficulty: 'normal', completedLevels: id - 1, reducedMotion: true })
  let guard = 0
  while (s.state !== STATE.AIMING && guard++ < 1000) s.update(1000 / 60)
  return s
}

test('potence : la charge pend sans bouger, un tir dans la corde la fait tomber sur le garde', async () => {
  const { Projectile } = await import('../src/game/entities/Projectile.js')
  const s = readyAt(15)
  const [rope] = s.world.tethers.links
  assert.equal(rope.kind, 'rope')
  const load = rope.b
  const y0 = load.y
  for (let i = 0; i < 360; i++) s.update(1000 / 60)
  assert.ok(Math.abs(load.y - y0) < 2, 'la charge reste pendue')
  const before = s.targetsLeft
  // Un boulet lancé à travers la corde, juste sous la traverse.
  s.world.arm()
  const p = new Projectile('stone', rope.a.x - 60, rope.a.y + 22)
  s.world.add(p)
  Matter.Body.setVelocity(p.body, { x: 9, y: 0 })
  for (let i = 0; i < 240; i++) s.update(1000 / 60)
  assert.equal(rope.cut, true, 'corde tranchée')
  assert.ok(load.y > y0 + 40, 'la charge est tombée')
  assert.ok(s.targetsLeft < before, 'le garde dessous est écrasé')
})

test('pont-levis : la chaîne rompue, le tablier s’abat vers l’extérieur sur les gardes', () => {
  const s = readyAt(28)
  const chain = s.world.tethers.links.find((l) => l.kind === 'chain')
  const deck = chain.b
  for (let i = 0; i < 360; i++) s.update(1000 / 60)
  assert.ok(Math.abs(deck.angle) < 0.15, 'dressé tant que la chaîne tient')
  const before = s.targetsLeft
  s.world.arm()
  s.world.tethers.blast(chain.c.bodyB.position.x, chain.c.bodyB.position.y - 70, 200, s.world.time)
  for (let i = 0; i < 300; i++) s.update(1000 / 60)
  assert.equal(chain.cut, true)
  assert.ok(deck.angle < -1.2, `tombé vers l’extérieur (angle ${deck.angle.toFixed(2)})`)
  assert.ok(s.targetsLeft < before, 'des gardes écrasés')
})

test('mécanismes : un lien se rompt quand son attache disparaît', () => {
  const s = readyAt(15)
  const [rope] = s.world.tethers.links
  rope.a.kill('impact')
  for (let i = 0; i < 4; i++) s.update(1000 / 60)
  assert.equal(rope.cut, true)
  assert.equal(rope.cause, 'anchor')
})

/* ---------- Jauge de destruction ---------- */

test('jauge de destruction : à moitié du château, une pierre de plus, une seule par étape', () => {
  const s = readyAt(20)
  const p = s.player
  const shots = p.shotsLeft
  s.world.arm()
  const blocks = s.world.filter((e) => e.kind === 'block' && !e.terrain).sort((a, b) => a.y - b.y)
  // On abat les blocs un à un jusqu'à remplir la jauge, puis tout le reste.
  for (const b of blocks) {
    b.kill('impact')
    s.update(1000 / 60)
    if (s.hud.gauge.earned) break
  }
  assert.equal(s.hud.gauge.earned, true)
  assert.equal(p.shotsLeft, shots + 1)
  assert.equal(s.hud.bonusShots, 1)
  for (const b of s.world.filter((e) => e.kind === 'block' && !e.terrain && e.alive)) b.kill('impact')
  for (let i = 0; i < 10; i++) s.update(1000 / 60)
  assert.equal(p.shotsLeft, shots + 1, 'une seule pierre par étape')
})

test('jauge de destruction : absente des premiers niveaux et du face-à-face', async () => {
  assert.equal(readyAt(3).hud.gauge, null)
  const { ArenaRepository } = await import('../src/game/levels/ArenaRepository.js')
  const { createMode } = await import('../src/game/modes/modes.js')
  const arena = ArenaRepository.all()[0]
  const s = new GameSession(arena, { difficulty: 'normal', completedLevels: 50, reducedMotion: true }, createMode('versus', { players: ['A', 'B'] }))
  assert.equal(s.hud.gauge, null)
})

test('jauge de destruction : la pierre gagnée ne compte pas pour les étoiles', () => {
  // Six blocs de bois et un soldat au loin ; deux tirs seulement.
  const spec = { shots: 2, wind: 0, ammo: {}, build: (b) => { for (let i = 0; i < 6; i++) b.block('wood', 1400 + i * 50, 880, 40, 40); b.target(b.spot(1900, 900)) } }
  const level = buildLevel(spec, 7, 1)
  const s = new GameSession(level, { difficulty: 'normal', completedLevels: 6, reducedMotion: true })
  let end = null
  s.on('end', (e) => (end = e))
  let guard = 0
  while (s.state !== STATE.AIMING && guard++ < 1000) s.update(1000 / 60)
  s.world.arm()
  for (const b of s.world.filter((e) => e.kind === 'block')) b.kill('impact')
  s.update(1000 / 60)
  assert.equal(s.player.shotsLeft, 3, 'la pierre gagnée')
  // Trois tirs : les deux premiers perdus, le soldat tombe au troisième (la pierre gagnée).
  for (let shot = 1; shot <= 3; shot++) {
    s.aim(80, 0.15)
    s.fire()
    if (shot === 3) s.world.filter((e) => e.kind === 'target' && e.alive).forEach((e) => e.kill('impact'))
    guard = 0
    while (s.state !== STATE.AIMING && s.state !== STATE.ENDED && guard++ < 6000) s.update(1000 / 60)
  }
  assert.equal(end?.won, true)
  assert.equal(end.result.shotsUsed, 2, 'deux tirs comptés, pas trois')
})

/* ---------- Siège sans fin : la main de trois cartes ---------- */

test('main du siège : trois cartes différentes, les mêmes pour une même graine', async () => {
  const { handFor, CARDS, HAND_SIZE } = await import('../src/domain/EndlessDeck.js')
  const a = handFor(12345, 2)
  assert.equal(a.length, HAND_SIZE)
  assert.equal(new Set(a).size, HAND_SIZE)
  assert.deepEqual(handFor(12345, 2), a)
  for (const id of a) assert.ok(CARDS[id])
  // D'un château à l'autre, les mains changent (au moins une fois sur dix).
  const hands = new Set(Array.from({ length: 10 }, (_, w) => handFor(12345, w + 2).join(',')))
  assert.ok(hands.size > 1)
  // L'intendant ne revient plus une fois au maximum.
  for (let w = 2; w < 60; w++) assert.ok(!handFor(777, w, { supply: 2 }).includes('quartermaster'))
})

test('siège sans fin : la carte gardée équipe le château suivant', async () => {
  const { EndlessRun } = await import('../src/domain/EndlessRun.js')
  const { createMode } = await import('../src/game/modes/modes.js')
  const run = EndlessRun.start(4242)
  const level = LevelRepository.get(run.levelFor())
  const s = new GameSession(level, { difficulty: 'normal', completedLevels: 20, reducedMotion: true }, createMode('endless', { completedLevels: 20, shots: run.shots }))
  let end = null
  s.on('end', (e) => (end = e))
  let guard = 0
  while (s.state !== STATE.AIMING && guard++ < 1000) s.update(1000 / 60)
  s.world.filter((e) => e.kind === 'target').forEach((e) => e.kill('impact'))
  for (let i = 0; i < 400 && !end; i++) s.update(1000 / 60)
  assert.equal(end.won, true)
  assert.equal(run.record(end.result, s.player.shotsLeft), 'next')
  assert.equal(run.hand.length, 3)
  const card = run.hand[0]
  const kind = run.pick(card).kind
  assert.equal(run.hand, null)
  const mode = createMode('endless', { completedLevels: 20, shots: run.shots, bonusAmmo: run.loadout.ammo, supply: run.loadout.supply })
  const next = LevelRepository.get(run.levelFor())
  const base = createMode('endless', { completedLevels: 20, shots: run.shots }).ammoFor(next, { ammoFactor: 1 })
  const ammo = mode.ammoFor(next, { ammoFactor: 1 })
  if (kind === 'ammo') assert.ok(Object.keys(ammo).some((t) => ammo[t] > (base[t] ?? 0)), `${card} : munitions en plus`)
  if (kind === 'supply') assert.ok(Object.keys(base).every((t) => ammo[t] === base[t] + 1), 'intendant : +1 partout')
  assert.throws(() => run.pick(card), /no hand/)
})

/* ---------- Coupe de la semaine ---------- */

test('coupe : semaine ISO, cinq châteaux tirés une fois pour toutes, hors grands sièges', async () => {
  const { weekKey, WeeklyCup, CUP } = await import('../src/game/daily/WeeklyCup.js')
  // Semaines ISO connues (le jeudi décide de l'année).
  assert.equal(weekKey(new Date(2026, 0, 1)), '2026-W01')
  assert.equal(weekKey(new Date(2021, 0, 3)), '2020-W53')
  assert.equal(weekKey(new Date(2026, 9, 15)), '2026-W42')
  const a = WeeklyCup.forWeek('2026-W42')
  assert.deepEqual(WeeklyCup.forWeek('2026-W42').levels, a.levels)
  assert.equal(a.levels.length, CUP.CASTLES)
  a.levels.forEach((id, i) => {
    const [lo, hi] = CUP.BANDS[i]
    assert.ok(id >= lo && id <= hi && id % 10 !== 0, `château ${i + 1} : niveau ${id}`)
  })
  assert.notDeepEqual(WeeklyCup.forWeek('2026-W43').levels, a.levels)
  assert.equal(WeeklyCup.medalFor(4), null)
  assert.equal(WeeklyCup.medalFor(5), 'bronze')
  assert.equal(WeeklyCup.medalFor(12), 'silver')
  assert.equal(WeeklyCup.medalFor(15), 'gold')
})

test('coupe : le profil garde le meilleur de chaque château et compte la médaille', async () => {
  const { SaveSlot } = await import('../src/domain/SaveSlot.js')
  const { LevelResult } = await import('../src/domain/LevelResult.js')
  const { WeeklyCup } = await import('../src/game/daily/WeeklyCup.js')
  const slot = SaveSlot.create(0, 'Aube', 'normal')
  const cup = WeeklyCup.forWeek('2026-W42')
  const base = { targetsKilled: 3, blocksDestroyed: 5, barrelsExploded: 0, powersUsed: 0, achievements: 0, won: true, difficulty: 'normal' }
  const win = (index, stars, score) => LevelResult.issue({ ...base, levelId: cup.levels[index - 1], score, stars, shotsUsed: 2 })
  for (let i = 1; i <= 5; i++) slot.recordCup(win(i, 2, 10000), '2026-W42', i)
  assert.equal(slot.cup.medal, 'silver')
  assert.equal(slot.cup.trophies.silver, 1)
  // Mieux sur deux châteaux : l'or ; l'argent n'est plus compté.
  slot.recordCup(win(1, 3, 12000), '2026-W42', 1)
  slot.recordCup(win(2, 3, 9000), '2026-W42', 2)
  slot.recordCup(win(3, 3, 9000), '2026-W42', 3)
  assert.equal(slot.cup.medal, 'gold')
  assert.deepEqual(slot.cup.trophies, { bronze: 0, silver: 0, gold: 1 })
  assert.equal(slot.cup.castles[2].best, 10000, 'le meilleur score reste')
  // Un résultat d'un autre château, ou d'une autre coupe, est refusé.
  assert.throws(() => slot.recordCup(win(2, 3, 9000), '2026-W42', 1), /cup/)
  // Nouvelle semaine : la coupe repart de zéro, les médailles restent.
  const next = WeeklyCup.forWeek('2026-W43')
  slot.recordCup(LevelResult.issue({ ...base, levelId: next.levels[0], score: 5000, stars: 1, shotsUsed: 3 }), '2026-W43', 1)
  assert.equal(slot.cup.week, '2026-W43')
  assert.equal(slot.cup.medal, '')
  assert.equal(slot.cup.trophies.gold, 1)
  // Relue depuis la sauvegarde : cohérente.
  const again = SaveSlot.fromJSON(0, JSON.parse(JSON.stringify(slot.toJSON())))
  assert.equal(again.cup.week, '2026-W43')
  // Une médaille qui ne correspond pas aux étoiles est refusée.
  const bad = JSON.parse(JSON.stringify(slot.toJSON()))
  bad.cup.medal = 'gold'
  assert.throws(() => SaveSlot.fromJSON(0, bad), /medal/)
})

/* ---------- Moments forts ---------- */

/** Faux MediaRecorder : chaque prise produit un morceau de vidéo. */
class FakeRecorder {
  static isTypeSupported(t) {
    return t === 'video/webm'
  }
  constructor(stream, opts) {
    this.opts = opts
  }
  start() {
    this.state = 'recording'
  }
  stop() {
    this.ondataavailable?.({ data: new Blob(['frame'], { type: 'video/webm' }) })
    this.onstop?.()
  }
}

test('moments forts : on garde la prise qui vaut le plus, rien sans navigateur capable', async () => {
  const { ClipRecorder } = await import('../src/services/ClipRecorder.js')
  const canvas = { captureStream: () => ({ getTracks: () => [] }) }
  assert.equal(ClipRecorder.supported(canvas, undefined), false)
  assert.equal(ClipRecorder.supported({}, FakeRecorder), false)
  assert.equal(ClipRecorder.supported(canvas, FakeRecorder), true)
  globalThis.URL.createObjectURL ??= () => 'blob:clip'
  globalThis.URL.revokeObjectURL ??= () => {}
  const rec = new ClipRecorder(canvas, { MR: FakeRecorder, maxMs: 60_000 })
  rec.start()
  await rec.stop(10)
  rec.start()
  await rec.stop(40)
  rec.start()
  await rec.stop(20)
  rec.start()
  await rec.stop(0)
  const best = await rec.best()
  assert.equal(best.value, 40)
  assert.equal(best.extension, 'webm')
  rec.dispose()
  assert.equal(await rec.best(), null)
})

/* ---------- Coup de pouce et niveau passé ---------- */

test('trois défaites d’affilée : le niveau peut être passé, sans étoile, et repris plus tard', async () => {
  const { SaveSlot, SKIP_AFTER } = await import('../src/domain/SaveSlot.js')
  const { LevelResult } = await import('../src/domain/LevelResult.js')
  const slot = SaveSlot.create(0, 'Aube', 'normal')
  const base = { targetsKilled: 0, blocksDestroyed: 0, barrelsExploded: 0, powersUsed: 0, achievements: 0, difficulty: 'normal' }
  const lose = (levelId) => slot.recordResult(LevelResult.issue({ ...base, levelId, score: 0, stars: 0, won: false, shotsUsed: 3 }))
  for (let i = 0; i < SKIP_AFTER - 1; i++) lose(1)
  assert.equal(slot.canSkip(1), false)
  lose(1)
  assert.equal(slot.failsAt(1), SKIP_AFTER)
  assert.equal(slot.canSkip(1), true)
  slot.skipLevel(1)
  assert.equal(slot.isCompleted(1), true)
  assert.equal(slot.isUnlocked(2), true)
  assert.equal(slot.isSkipped(1), true)
  assert.equal(slot.starCount, 0)
  // Relu (avec le contrôle des records de l'application) : toujours sans étoile.
  const checked = SaveSlot.fromJSON(0, JSON.parse(JSON.stringify(slot.toJSON())), (id, rec) => (rec.shots > 0 ? 1 : Math.max(1, rec.stars)))
  assert.equal(checked.starCount, 0)
  // Pris pour de bon : il compte comme les autres.
  slot.recordResult(LevelResult.issue({ ...base, levelId: 1, score: 3000, stars: 2, won: true, shotsUsed: 2, targetsKilled: 2 }))
  assert.equal(slot.isSkipped(1), false)
  assert.equal(slot.levelRecord(1).stars, 2)
  // Le dernier niveau ne se passe jamais.
  assert.throws(() => slot.skipLevel(100), /cannot be skipped/)
})

test('coup de pouce discret : premier chapitre, Facile et Normal, après deux défaites', async () => {
  const { SaveSlot, LUCK } = await import('../src/domain/SaveSlot.js')
  const { LevelResult } = await import('../src/domain/LevelResult.js')
  const slot = SaveSlot.create(0, 'Aube', 'normal')
  const lose = () => slot.recordResult(LevelResult.issue({ levelId: 1, score: 0, stars: 0, won: false, shotsUsed: 3, targetsKilled: 0, blocksDestroyed: 0, barrelsExploded: 0, powersUsed: 0, achievements: 0, difficulty: 'normal' }))
  lose()
  assert.equal(slot.luckFor(1, 'normal'), 0)
  lose()
  assert.equal(slot.luckFor(1, 'normal'), LUCK.STEP)
  for (let i = 0; i < 6; i++) lose()
  assert.equal(slot.luckFor(1, 'normal'), LUCK.MAX)
  assert.equal(slot.luckFor(1, 'hard'), 0)
  // En partie : des défenseurs moins résistants, un vent plus faible.
  const level = LevelRepository.get(5)
  const plain = new GameSession(level, { difficulty: 'normal', completedLevels: 4, reducedMotion: true })
  const lucky = new GameSession(level, { difficulty: 'normal', completedLevels: 4, reducedMotion: true, luck: 0.3 })
  const hp = (s) => s.world.filter((e) => e.kind === 'target')[0].maxHp
  assert.ok(Math.abs(hp(lucky) - hp(plain) * 0.7) < 1e-6)
})

test('sauvegarde v10 de développement (sans le front) : relue, le front ajouté vide', async () => {
  const { SaveSlot } = await import('../src/domain/SaveSlot.js')
  const json = JSON.parse(JSON.stringify(SaveSlot.create(0, 'Aube', 'normal').toJSON()))
  delete json.frontier
  const slot = SaveSlot.fromJSON(0, json)
  assert.equal(slot.failsAt(1), 0)
})
