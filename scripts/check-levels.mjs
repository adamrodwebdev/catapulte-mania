/**
 * Contrôle qualité des 100 niveaux (npm run check:levels).
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
 * Avec `--engine trebuchet`, le joueur automatique joue au trébuchet (v5.4) :
 * il désigne un point d'impact puis la position de la jauge (cloche ↔ tendu),
 * comme un joueur ; le château est plus loin.
 *
 * v5.8 : le joueur automatique attend 1,5 s avant chaque tir, comme un
 * humain qui vise (les rondes bougent, les sapeurs réparent). Et chaque niveau
 * reçoit une note de difficulté : la part des premiers tirs essayés qui
 * gagnent d'un coup (« tolérance ») — plus elle est basse, plus le niveau
 * demande de trouver LE bon tir.
 *
 * v6.0 : grands sièges. Un tir vaut d'abord par l'étape atteinte (prendre la
 * première fait apparaître le donjon du général, avec ses défenseurs), puis
 * par les cibles restantes, puis par les vies ôtées au général.
 *
 * Avec `--ammo stone` (v6.2), le joueur automatique ne tire que la pierre de
 * départ : chaque niveau doit pouvoir se gagner ainsi (en Normal).
 *
 * v6.2 : chaque tir se prépare à l'instant où il part (après l'attente de la
 * visée et le dégel du bras), dans l'état où il partira. Le joueur automatique
 * pèse aussi, à chaque tour, l'avance de l'engin jusqu'à la portée des
 * archers ; s'il perd après avoir roulé, il rejoue le niveau sans rouler. Face
 * à un général, s'il perd encore, il le rejoue en visant d'abord le chef.
 *
 * v6.2 : tous les cœurs partagent une file de rejeux. Chaque tir candidat est
 * un rejeu indépendant (déterministe) : ceux d'un même tour se répartissent
 * entre les cœurs, et les niveaux les plus longs (grands sièges) passent
 * devant ; un cœur libre prend le rejeu suivant. Mêmes choix, mêmes résultats
 * qu'un examen tir après tir, en bien moins de temps.
 *
 * Avec `--track heroic` ou `--track duke` (v6.2), il joue la Campagne héroïque
 * (châteaux renforcés, un tir de moins, un pillard de plus) ou les cinq
 * châteaux des Terres du Duc.
 *
 * Usage : node scripts/check-levels.mjs [--levels 1-10 | --levels 10,20,30] [--difficulty hard] [--engine trebuchet] [--ammo stone] [--track heroic|duke] [--workers 4] [--boss]
 */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads'
import { availableParallelism } from 'node:os'
import { fileURLToPath } from 'node:url'

const ANGLES = [10, 20, 30, 40, 50, 60, 70]
/** Temps de visée avant chaque tir (pas de 1/30 s) : 1,5 s. */
const AIM_WAIT_TICKS = 45
/** Positions de la jauge essayées au trébuchet (0 = cloche, 1 = tendu). */
const GAUGES = [0, 0.25, 0.5, 0.75, 1]

/**
 * Poids d'une vie de général dans l'avancement (v6.2) : moins qu'un défenseur
 * d'ordinaire ; plus que trois en visant d'abord le chef (BOSS), comme un joueur
 * qui l'attaque avant que ses ordres ne le mettent à l'abri.
 */
const LIFE = Object.freeze({ EVEN: 4e4, BOSS: 3e5 })

/* ---------- Côté worker : les rejeux ---------- */

async function loadGame() {
  const { GameSession } = await import('../src/game/GameSession.js')
  const { LevelRepository } = await import('../src/game/levels/LevelRepository.js')
  // --demo : contrôle des niveaux dans l'ordre de la démo.
  if (workerData?.demo) LevelRepository.useDemoOrder(true)
  const { DukeRepository } = await import('../src/game/levels/DukeRepository.js')
  const { createMode } = await import('../src/game/modes/modes.js')
  const { Projectile } = await import('../src/game/entities/Projectile.js')
  // Parcours (v6.2) : campagne, Campagne héroïque, Terres du Duc.
  const track = workerData?.track ?? 'campaign'
  // Un niveau construit une fois par worker (la partie ne le modifie pas).
  const built = new Map()
  const levelOf = (id) => {
    if (!built.has(id)) built.set(id, track === 'heroic' ? LevelRepository.heroic(id) : track === 'duke' ? DukeRepository.get(id) : LevelRepository.get(id))
    return built.get(id)
  }
  const rules = () => (track === 'campaign' ? null : createMode(track, { completedLevels: 100 }))
  return { GameSession, Projectile, levelOf, rules, track, difficulty: workerData.difficulty, engine: workerData.engine, ammo: workerData.ammo }
}

/**
 * Avancement d'une partie (plus c'est grand, mieux c'est) : l'étape d'abord,
 * puis les cibles restantes de l'étape, les vies du général, et le score.
 */
function progress(session, life = LIFE.EVEN) {
  const lives = session.council?.alive ? session.council.general.lives : 0
  return session.stage * 1e8 - session.targetsLeft * 1e5 - lives * life + session.score.current
}

/**
 * L'engin roule (v6.2) : comme un joueur qui maintient ▶, jusqu'à ce que
 * quelque chose l'arrête (portée des archers, roche, eau, débris, défenseur).
 */
function driveForward(s, tick) {
  if (!s.drivable) return
  s.drive(1)
  let last = s.catapult.x
  for (let i = 0; i < 400; i++) {
    tick()
    if (i > 8 && Math.abs(s.catapult.x - last) < 0.01) break
    last = s.catapult.x
  }
  s.drive(0)
}

/**
 * Joue une partie en appliquant une liste de tirs ; s'arrête au tour suivant.
 * `ready` (v6.2) : puis attend l'instant du tir suivant (visée, dégel), pour que
 * le tir se prépare dans l'état où il partira : défenseurs en marche, et surtout
 * bras gelé, qui lance moins loin (le glouton ne trouvait plus rien à portée).
 * `drive` (v6.2) : et l'engin roule d'abord en avant, comme pour un tir `drive`.
 */
function replay(G, level, shots, { ready = false, drive = false } = {}) {
  const engine = G.engine
  const s = new G.GameSession(level, { difficulty: G.difficulty, completedLevels: G.track === 'campaign' ? 0 : 100, reducedMotion: true, engine }, G.rules())
  let ended = null
  s.on('end', (e) => (ended = e))
  // Comme un joueur (v5.8) : un seau d'eau dès que l'engin prend feu.
  const tick = () => {
    s.update(1000 / 30)
    if (s.condition.fireLevel > 0) s.useBucket()
  }
  let guard = 0
  while (s.state !== 'aiming' && guard++ < 200) tick()
  for (const shot of shots) {
    if (ended) break
    for (let i = 0; i < AIM_WAIT_TICKS && !ended; i++) tick()
    // Bras gelé par un pillard : on attend le dégel, comme un joueur.
    for (let i = 0; i < 400 && s.condition.frozen && !ended; i++) tick()
    if (shot.drive && !ended) driveForward(s, tick)
    s.selectAmmo(shot.ammo)
    if (engine === 'trebuchet') {
      // 1er clic : point d'impact ; 2e clic : jauge figée à la position choisie.
      s.placeTrebTarget(shot.tx, shot.ty)
      s.fire(0, { arc: shot.g })
    } else {
      s.aim(shot.angle, shot.power)
      s.fire()
    }
    guard = 0
    while (s.state !== 'aiming' && !ended && guard++ < 600) tick()
  }
  if (ready) {
    for (let i = 0; i < AIM_WAIT_TICKS && !ended; i++) tick()
    for (let i = 0; i < 400 && s.condition.frozen && !ended; i++) tick()
    if (drive && !ended) driveForward(s, tick)
  }
  return { session: s, ended }
}

/**
 * Puissance qui fait passer la trajectoire par (tx, ty) pour un angle donné.
 * En Difficile, la visée tient compte de l'altitude, de la prise au vent du
 * projectile et de la rafale du moment (comme l'aide à la trajectoire) ; les
 * rafales pendant le vol, elles, se découvrent au tir, comme pour un joueur.
 * v6.1 : la courbe est celle de l'aide à la visée (GameSession.predictShot) :
 * rafales des moulins, colonnes d'air chaud de la Montagne, sable qui freine.
 */
function solvePower(session, angle, tx, ty, ammo = 'stone') {
  const c = session.catapult
  let lo = 0
  let hi = 1
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2
    c.setAim(angle, mid)
    const pts = session.predictShot(ammo)
    const at = pts.find((p) => p.x >= tx)
    const y = at ? at.y : Infinity
    if (y > ty) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

function candidates(G, session) {
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
  // --ammo stone (v6.2) : la pierre de départ seulement.
  const ammoTypes = G.ammo === 'stone' ? ['stone'] : session.ammo.filter((a) => a.count === null || a.count > 0).map((a) => a.type)
  if (G.engine === 'trebuchet') return trebuchetCandidates(session, points, ammoTypes)
  for (const t of points) {
    for (const angle of ANGLES) {
      for (const ammo of ammoTypes) {
        const power = solvePower(session, angle, t.x, t.y, ammo)
        if (power <= 0.001 || power >= 0.999) continue
        out.push({ angle, power: Math.round(power * 1000) / 1000, ammo })
      }
    }
  }
  return out
}

/**
 * Trébuchet : chaque point visé, sous chaque arc, avec chaque munition — tant
 * que le tir est à portée (la partie le calcule comme pour le joueur).
 */
function trebuchetCandidates(session, points, ammoTypes) {
  const out = []
  const keep = session.trebInput.target ? { ...session.trebInput.target } : null
  for (const p of points) {
    if (!session.placeTrebTarget(p.x, p.y)) continue
    const t = session.trebInput.target
    for (const ammo of ammoTypes) {
      for (const g of GAUGES) {
        const shot = session.trebShot(g, ammo)
        if (shot?.reachable) out.push({ tx: t.x, ty: t.y, g, ammo })
      }
    }
  }
  if (keep) session.moveTrebTarget(keep.x, keep.y)
  session.trebInput.reset()
  return out
}

/** Ce qu'un worker sait faire : chaque tâche est un rejeu indépendant et déterministe. */
const TASKS = {
  /** Ce que le fil principal doit savoir d'un niveau : tirs, général, durée probable. */
  meta(G, { id }) {
    const level = G.levelOf(id)
    return { shots: level.shots, general: level.general ?? null, cost: (level.stageCount ?? 1) * 1000 + level.shots * 10 + level.targets.length }
  },

  /** Stabilité : la structure tient seule six secondes, puis deux encore après un tir perdu. */
  stable(G, { id }) {
    const level = G.levelOf(id)
    const s0 = new G.GameSession(level, { difficulty: 'normal', completedLevels: G.track === 'campaign' ? 0 : 100, reducedMotion: true }, G.rules())
    const blocksBefore = level.blocks.length
    for (let i = 0; i < 360; i++) s0.update(1000 / 60)
    // Tir perdu loin derrière la catapulte : arme les règles d'écrasement.
    s0.world.add(new G.Projectile('stone', -300, 0))
    for (let i = 0; i < 240; i++) s0.update(1000 / 60)
    const destroyed = blocksBefore - s0.world.filter((e) => e.kind === 'block').length
    const stable = destroyed === 0 && s0.targetsLeft === level.targets.length
    s0.destroy()
    return { stable, destroyed }
  },

  /** Début d'un tour : la partie rejouée jusqu'ici (finie, ou ses tirs candidats et l'avance de l'engin). */
  prepare(G, { id, history, drive = false }) {
    const { session, ended } = replay(G, G.levelOf(id), history, { ready: true, drive })
    const out = ended ? { ended: { won: Boolean(ended.won), score: ended.result.score } } : { candidates: candidates(G, session), drive: session.hud.drive ? { front: Boolean(session.hud.drive.front) } : null }
    session.destroy()
    return out
  },

  /** Un tir candidat : la partie rejouée avec lui ; gagnée, ou ce qu'il fait avancer. */
  evaluate(G, { id, shots, life }) {
    const r = replay(G, G.levelOf(id), shots)
    const won = Boolean(r.ended?.won)
    const value = won ? null : progress(r.session, life)
    r.session.destroy()
    return { won, value }
  },
}

/* ---------- Côté fil principal : la file des rejeux et le joueur automatique ---------- */

/**
 * File de rejeux partagée par tous les cœurs. Chaque niveau a son rang (0 : le
 * plus long) : un cœur libre prend le rejeu en attente du niveau de plus petit
 * rang, dans l'ordre d'arrivée. Un rejeu annulé avant de partir est sauté.
 */
class ReplayPool {
  #idle = []
  #busy = new Map()
  /** @type {Array<Array<{ task: string, args: object, resolve: Function, reject: Function, cancelled: boolean }>>} */
  #queues = []
  #workers = []

  constructor(size, data) {
    for (let i = 0; i < size; i++) {
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: data })
      w.on('message', (m) => this.#done(w, m))
      w.on('error', (e) => this.#busy.get(w)?.reject(e))
      this.#workers.push(w)
      this.#idle.push(w)
    }
  }

  /**
   * @param {string} task une des TASKS
   * @param {object} args
   * @param {number} rank rang du niveau (0 passe devant)
   * @returns {{ promise: Promise<any>, cancel: () => void }}
   */
  submit(task, args, rank) {
    const job = { task, args, cancelled: false }
    const promise = new Promise((resolve, reject) => Object.assign(job, { resolve, reject }))
    ;(this.#queues[rank] ??= []).push(job)
    this.#pump()
    return { promise, cancel: () => (job.cancelled = true) }
  }

  run(task, args, rank) {
    return this.submit(task, args, rank).promise
  }

  #next() {
    for (const q of this.#queues) {
      while (q?.length) {
        const job = q.shift()
        if (!job.cancelled) return job
      }
    }
    return null
  }

  #pump() {
    while (this.#idle.length) {
      const job = this.#next()
      if (!job) return
      const w = this.#idle.pop()
      this.#busy.set(w, job)
      w.postMessage({ task: job.task, args: job.args })
    }
  }

  #done(w, m) {
    const job = this.#busy.get(w)
    this.#busy.delete(w)
    this.#idle.push(w)
    if (m.error) job.reject(new Error(m.error))
    else job.resolve(m.result)
    this.#pump()
  }

  close() {
    for (const w of this.#workers) w.terminate()
  }
}

/**
 * Examine des tirs candidats (rejoués en parallèle), dans leur ordre : garde le
 * premier qui fait le plus avancer la partie. `stopOnWin` : le premier tir gagnant
 * arrête l'examen (les rejeux suivants, encore en attente, sont annulés).
 * Mêmes choix qu'un examen un à un.
 */
async function examine(pool, id, rank, history, cands, life, { count, stopOnWin }, best, stats) {
  const jobs = cands.map((cand) => pool.submit('evaluate', { id, shots: [...history, cand], life }, rank))
  for (let k = 0; k < cands.length; k++) {
    const r = await jobs[k].promise
    const value = r.won ? Infinity : r.value
    if (!best || value > best.value) best = { cand: cands[k], value, won: r.won }
    if (count) {
      stats.tried++
      if (r.won) stats.oneShot++
    }
    if (stopOnWin && best.won) {
      for (let j = k + 1; j < jobs.length; j++) jobs[j].cancel()
      break
    }
  }
  return best
}

/**
 * Joueur automatique glouton : à chaque tour, le tir qui fait le plus avancer
 * la partie (voir progress). `drive` (v6.2) : il pèse aussi, à chaque tour,
 * l'avance de l'engin jusqu'à la portée des archers et les tirs de là-bas.
 * Un glouton qui avance peut s'y enfermer, d'où le second essai sans rouler :
 * un niveau est faisable si l'une des manières gagne.
 * @returns {Promise<{ solved: boolean, score: number, plan: object[], tolerance: number }>}
 */
async function greedy(pool, id, rank, meta, { drive: mayDrive, boss = false }) {
  const life = boss ? LIFE.BOSS : LIFE.EVEN
  const history = []
  let solved = false
  let lastScore = 0
  // Tolérance : part des premiers tirs essayés qui gagnent d'un coup.
  const stats = { tried: 0, oneShot: 0 }
  for (let turn = 0; turn < Math.max(12, meta.shots + 2); turn++) {
    const start = await pool.run('prepare', { id, history }, rank)
    if (start.ended) {
      solved = start.ended.won
      lastScore = start.ended.score
      break
    }
    let best = await examine(pool, id, rank, history, start.candidates, life, { count: turn === 0, stopOnWin: turn > 0 }, null, stats)
    // v6.2 : comme un joueur, on peut aussi avancer l'engin jusqu'à la portée des
    // archers et viser de là ; le meilleur tir, d'ici ou de là-bas, l'emporte.
    if (mayDrive && start.drive && !start.drive.front && !best?.won) {
      const ahead = await pool.run('prepare', { id, history, drive: true }, rank)
      if (!ahead.ended) best = await examine(pool, id, rank, history, ahead.candidates.map((c) => ({ ...c, drive: true })), life, { count: false, stopOnWin: true }, best, stats)
    }
    if (!best) break
    history.push(best.cand)
  }
  return { solved, score: lastScore, plan: history, tolerance: stats.tried ? stats.oneShot / stats.tried : 0 }
}

/**
 * Un niveau : stabilité, puis faisabilité en plusieurs manières, comme un joueur
 * qui recommence : en pesant à chaque tour l'avance de l'engin ; si la partie est
 * perdue après avoir roulé, sans jamais rouler ; face à un général (v6.2), si elle
 * est encore perdue, en le visant d'abord (avec puis sans rouler). `--boss` : d'emblée.
 */
async function checkLevel(pool, id, rank, meta, { engine, boss: forced }) {
  const { stable, destroyed } = await pool.run('stable', { id }, rank)
  const drives = engine !== 'trebuchet'
  const play = async (boss) => {
    let r = await greedy(pool, id, rank, meta, { drive: drives, boss })
    let still = false
    if (!r.solved && r.plan.some((shot) => shot.drive)) {
      r = await greedy(pool, id, rank, meta, { drive: false, boss })
      still = true
    }
    return { ...r, way: [boss ? 'en visant le chef' : '', still ? 'sans rouler' : ''].filter(Boolean).join(', ') }
  }
  const first = await play(forced)
  const run = first.solved || forced || !meta.general ? first : await play(true)
  return { id, stable, destroyedAtRest: destroyed, solved: run.solved, shotsUsed: run.plan.length, score: run.score, plan: run.plan, tolerance: first.tolerance, way: run.way }
}

function parseRange(arg, max) {
  if (!arg) return Array.from({ length: max }, (_, i) => i + 1)
  return arg.split(',').flatMap((part) => {
    const [a, b] = part.split('-').map(Number)
    return Array.from({ length: (b || a) - a + 1 }, (_, i) => a + i)
  })
}

if (isMainThread) {
  const args = process.argv.slice(2)
  const get = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined)
  const track = ['heroic', 'duke'].includes(get('--track')) ? get('--track') : 'campaign'
  const ids = parseRange(get('--levels'), track === 'duke' ? 5 : 100)
  const difficulty = get('--difficulty') || 'hard'
  const engine = get('--engine') === 'trebuchet' ? 'trebuchet' : 'catapult'
  const ammo = get('--ammo') === 'stone' ? 'stone' : 'all'
  const demo = args.includes('--demo')
  // --boss (v6.2) : face à un général, le viser d'abord dès la première manière.
  const boss = args.includes('--boss')
  // --workers (v6.2) : moins de cœurs à la fois, pour une machine qui chauffe.
  const workers = Math.max(1, Math.min(Number(get('--workers')) || availableParallelism(), availableParallelism()))
  const t0 = Date.now()
  const pool = new ReplayPool(workers, { difficulty, engine, demo, ammo, track })
  // Les plus longs d'abord (grands sièges) : ils ne finissent pas seuls, à la fin.
  const metas = new Map(await Promise.all(ids.map(async (id) => [id, await pool.run('meta', { id }, 0)])))
  const order = [...ids].sort((a, b) => metas.get(b).cost - metas.get(a).cost)
  const results = (
    await Promise.all(
      order.map((id, rank) =>
        checkLevel(pool, id, rank, metas.get(id), { engine, boss }).then((m) => {
          const mark = m.stable && m.solved ? 'OK ' : 'KO '
          console.log(`${mark} niveau ${String(m.id).padStart(2)}  stable=${m.stable}  résolu=${m.solved} en ${m.shotsUsed} tir(s)${m.way ? `, ${m.way}` : ''}  tolérance=${(m.tolerance * 100).toFixed(1)} %  score=${m.score}`)
          return m
        }),
      ),
    )
  ).sort((a, b) => a.id - b.id)
  pool.close()
  const bad = results.filter((r) => !r.stable || !r.solved)
  const tol = results.map((r) => r.tolerance).sort((a, b) => a - b)
  const median = tol.length ? tol[Math.floor(tol.length / 2)] : 0
  const mean = tol.reduce((a, b) => a + b, 0) / Math.max(1, tol.length)
  console.log(`\ntolérance des premiers tirs : médiane ${(median * 100).toFixed(1)} %, moyenne ${(mean * 100).toFixed(1)} %`)
  console.log(`\n${results.length - bad.length}/${results.length} niveaux valides (difficulté ${difficulty}${engine === 'trebuchet' ? ', trébuchet' : ''}${ammo === 'stone' ? ', pierre seule' : ''}${track !== 'campaign' ? `, ${track}` : ''}) en ${((Date.now() - t0) / 1000).toFixed(0)} s`)
  if (process.env.CHECK_REPORT) {
    const { writeFileSync } = await import('node:fs')
    writeFileSync(process.env.CHECK_REPORT, JSON.stringify(results, null, 2))
  }
  process.exitCode = bad.length ? 1 : 0
} else {
  const G = await loadGame()
  parentPort.on('message', ({ task, args }) => {
    try {
      parentPort.postMessage({ result: TASKS[task](G, args) })
    } catch (e) {
      parentPort.postMessage({ error: e?.stack ?? String(e) })
    }
  })
}
