/**
 * Contrôle qualité des 40 niveaux (npm run check:levels).
 *
 * Pour chaque niveau, ce script vérifie automatiquement :
 *  1. STABILITÉ : la structure tient debout seule (aucun bloc détruit,
 *     aucune cible morte) pendant 6 secondes sans aucun tir, puis encore
 *     2 secondes une fois les règles d'écrasement armées par un tir perdu
 *     (aucune cible ne doit être coincée dès le départ) ;
 *  2. FAISABILITÉ : un « joueur automatique » parvient à éliminer toutes les
 *     cibles en mode DIFFICILE (le mode qui donne le moins de tirs).
 *
 * Le joueur automatique est volontairement simple : à chaque tour il vise
 * chaque cible restante sous plusieurs angles, simule chaque tir et garde
 * le meilleur. S'il réussit, un humain le peut aussi.
 *
 * Avec `--engine trebuchet`, le joueur automatique joue au trébuchet : il
 * choisit l'instant du lâcher (en ms de balancier), le château est plus loin.
 *
 * Usage : node scripts/check-levels.mjs [--levels 1-10] [--difficulty hard] [--engine trebuchet]
 */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { availableParallelism } from 'node:os'
import { fileURLToPath } from 'node:url'

const ANGLES = [10, 20, 30, 40, 50, 60, 70]

async function loadGame() {
  const { GameSession } = await import('../src/game/GameSession.js')
  const { LevelRepository } = await import('../src/game/levels/LevelRepository.js')
  // --demo : contrôle des niveaux dans l'ordre de la démo.
  if (workerData?.demo) LevelRepository.useDemoOrder(true)
  const { TrajectoryPredictor } = await import('../src/game/TrajectoryPredictor.js')
  const { AIM } = await import('../src/game/Catapult.js')
  const { windageOf } = await import('../src/game/physics/WindField.js')
  const { PROJECTILE_TYPES } = await import('../src/game/entities/catalog.js')
  const { Trebuchet } = await import('../src/game/Trebuchet.js')
  return { GameSession, LevelRepository, TrajectoryPredictor, AIM, windageOf, PROJECTILE_TYPES, Trebuchet }
}

/** Joue une partie en appliquant une liste de tirs ; s'arrête au tour suivant. */
function replay(G, level, difficulty, shots, engine = 'catapult') {
  const s = new G.GameSession(level, { difficulty, completedLevels: 0, reducedMotion: true, engine })
  let ended = null
  s.on('end', (e) => (ended = e))
  const tick = () => s.update(1000 / 30)
  let guard = 0
  while (s.state !== 'aiming' && guard++ < 200) tick()
  for (const shot of shots) {
    if (ended) break
    s.selectAmmo(shot.ammo)
    if (engine === 'trebuchet') {
      // Balancier, puis lâcher à l'instant choisi (ms simulées depuis le 1er clic).
      s.fire()
      const step = (1000 / 30) * s.catapult.timeScale
      while (s.armed && s.catapult.simTime + step < shot.release) tick()
      if (s.armed) s.catapult.releaseAt(shot.release)
    } else {
      s.aim(shot.angle, shot.power)
      s.fire()
    }
    guard = 0
    while (s.state !== 'aiming' && !ended && guard++ < 600) tick()
  }
  return { session: s, ended }
}

/**
 * Puissance qui fait passer la trajectoire par (tx, ty) pour un angle donné.
 * En Difficile, la visée tient compte de l'altitude, de la prise au vent du
 * projectile et de la rafale du moment (comme l'aide à la trajectoire) ; les
 * rafales pendant le vol, elles, se découvrent au tir, comme pour un joueur.
 */
function solvePower(G, session, angle, tx, ty, ammo = 'stone') {
  const c = session.catapult
  const field = session.world.windField
  const windage = G.windageOf({ type: ammo, radius: G.PROJECTILE_TYPES[ammo].radius })
  let lo = 0
  let hi = 1
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2
    c.setAim(angle, mid)
    const windAccel = field.dynamic ? field.frozen(c.launchPoint.x, session.world.time, windage) : null
    const pts = G.TrajectoryPredictor.predict(c.launchPoint, c.velocity, { wind: session.wind, windAccel, maxPoints: 400, every: 1 })
    const at = pts.find((p) => p.x >= tx)
    const y = at ? at.y : Infinity
    if (y > ty) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

function candidates(G, session, engine = 'catapult') {
  const out = []
  const targets = session.world.filter((e) => e.kind === 'target' && e.alive)
  // Points visés : chaque cible, les barils, et les blocs les plus proches des cibles (supports).
  const near = session.world
    .filter((e) => e.kind === 'block' || e.kind === 'barrel')
    .map((b) => ({ b, d: Math.min(...targets.map((t) => Math.hypot(t.x - b.x, t.y - b.y))) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 10)
    .map((x) => x.b)
  const points = [...targets, ...near]
  const ammoTypes = session.ammo.filter((a) => a.count === null || a.count > 0).map((a) => a.type)
  if (engine === 'trebuchet') return trebuchetCandidates(G, session, points, ammoTypes)
  for (const t of points) {
    for (const angle of ANGLES) {
      for (const ammo of ammoTypes) {
        const power = solvePower(G, session, angle, t.x, t.y, session.world.windField.dynamic ? ammo : 'stone')
        if (power <= 0.001 || power >= 0.999) continue
        out.push({ angle, power: Math.round(power * 1000) / 1000, ammo })
      }
    }
  }
  return out
}

/** Instants de lâcher essayés au trébuchet (ms de balancier, pas de 2 ms). */
const RELEASES = Array.from({ length: 151 }, (_, i) => 600 + i * 2)

/**
 * Trébuchet : pour chaque instant de lâcher, point d'impact prévu (aide à la
 * trajectoire, vent du moment compris). Pour chaque point visé, on garde les
 * trois lâchers qui tombent le plus près.
 */
function trebuchetCandidates(G, session, points, ammoTypes) {
  const out = new Map()
  const field = session.world.windField
  const obstacles = session.world.filter((e) => e.kind !== 'projectile')
  for (const ammo of ammoTypes) {
    const radius = G.PROJECTILE_TYPES[ammo].radius
    const windage = G.windageOf({ type: ammo, radius })
    const hits = []
    for (const release of RELEASES) {
      const shot = G.Trebuchet.preview(release, { x: session.catapult.x, loadRadius: radius })
      const windAccel = field.dynamic ? field.frozen(shot.point.x, session.world.time, windage) : null
      const pts = G.TrajectoryPredictor.predict(shot.point, shot.velocity, { wind: session.wind, windAccel, obstacles, maxPoints: 600, every: 1 })
      const hit = pts[pts.length - 1]
      if (hit && hit.x > 300) hits.push({ release, hit })
    }
    for (const p of points) {
      hits
        .map((h) => ({ h, d: Math.abs(h.hit.x - p.x) + 0.5 * Math.abs(h.hit.y - p.y) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 3)
        .forEach(({ h }) => out.set(`${ammo}:${h.release}`, { release: h.release, ammo }))
    }
  }
  return [...out.values()]
}

async function checkLevel(G, id, difficulty, engine = 'catapult') {
  const level = G.LevelRepository.get(id)
  // 1. Stabilité
  const s0 = new G.GameSession(level, { difficulty: 'normal', completedLevels: 0, reducedMotion: true })
  s0.world.filter(() => true)
  const blocksBefore = level.blocks.length
  for (let i = 0; i < 360; i++) s0.update(1000 / 60)
  // Tir perdu loin derrière la catapulte : arme les règles d'écrasement.
  const { Projectile } = await import('../src/game/entities/Projectile.js')
  s0.world.add(new Projectile('stone', -300, 0))
  for (let i = 0; i < 240; i++) s0.update(1000 / 60)
  const destroyed = blocksBefore - s0.world.filter((e) => e.kind === 'block').length
  const stable = destroyed === 0 && s0.targetsLeft === level.targets.length
  s0.destroy()

  // 2. Faisabilité (glouton)
  const history = []
  let solved = false
  let lastScore = 0
  for (let turn = 0; turn < 12; turn++) {
    const { session, ended } = replay(G, level, difficulty, history, engine)
    if (ended) {
      solved = ended.won
      lastScore = ended.result.score
      session.destroy()
      break
    }
    let best = null
    for (const cand of candidates(G, session, engine)) {
      const r = replay(G, level, difficulty, [...history, cand], engine)
      const left = r.session.targetsLeft
      const value = (level.targets.length - left) * 100000 + r.session.score.current
      if (!best || value > best.value) best = { cand, value, won: r.ended?.won }
      r.session.destroy()
      if (best.won) break
    }
    session.destroy()
    if (!best) break
    history.push(best.cand)
  }
  return { id, stable, destroyedAtRest: destroyed, solved, shotsUsed: history.length, score: lastScore, plan: history }
}

function parseRange(arg, max) {
  if (!arg) return Array.from({ length: max }, (_, i) => i + 1)
  const [a, b] = arg.split('-').map(Number)
  return Array.from({ length: (b || a) - a + 1 }, (_, i) => a + i)
}

if (isMainThread) {
  const args = process.argv.slice(2)
  const get = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined)
  const ids = parseRange(get('--levels'), 100)
  const difficulty = get('--difficulty') || 'hard'
  const engine = get('--engine') === 'trebuchet' ? 'trebuchet' : 'catapult'
  const demo = args.includes('--demo')
  const workers = Math.max(1, Math.min(availableParallelism(), ids.length))
  const chunks = Array.from({ length: workers }, (_, w) => ids.filter((_, i) => i % workers === w))
  const t0 = Date.now()
  const results = (
    await Promise.all(
      chunks.map(
        (chunk) =>
          new Promise((resolve, reject) => {
            const w = new Worker(fileURLToPath(import.meta.url), { workerData: { ids: chunk, difficulty, engine, demo } })
            const out = []
            w.on('message', (m) => {
              out.push(m)
              const mark = m.stable && m.solved ? 'OK ' : 'KO '
              console.log(`${mark} niveau ${String(m.id).padStart(2)}  stable=${m.stable}  résolu=${m.solved} en ${m.shotsUsed} tir(s)  score=${m.score}`)
            })
            w.on('error', reject)
            w.on('exit', () => resolve(out))
          }),
      ),
    )
  )
    .flat()
    .sort((a, b) => a.id - b.id)
  const bad = results.filter((r) => !r.stable || !r.solved)
  console.log(`\n${results.length - bad.length}/${results.length} niveaux valides (difficulté ${difficulty}${engine === 'trebuchet' ? ', trébuchet' : ''}) en ${((Date.now() - t0) / 1000).toFixed(0)} s`)
  if (process.env.CHECK_REPORT) {
    const { writeFileSync } = await import('node:fs')
    writeFileSync(process.env.CHECK_REPORT, JSON.stringify(results, null, 2))
  }
  process.exitCode = bad.length ? 1 : 0
} else {
  const G = await loadGame()
  for (const id of workerData.ids) parentPort.postMessage(await checkLevel(G, id, workerData.difficulty, workerData.engine))
}
