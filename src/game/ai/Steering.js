/**
 * Pilotage de la marche (v5.8) : transforme « aller là » en une vitesse
 * crédible, pas à pas.
 *
 *  - accélération et freinage progressifs (plus de départ ni d'arrêt instantané) ;
 *  - arrivée en douceur : on ralentit dans les derniers pas ;
 *  - jamais au-delà du bord de la corniche (ni dans le vide, ni dans un mur) ;
 *  - politesse : on ne pousse pas un camarade, on attend qu'il passe ;
 *  - un obstacle imprévu devant (bloc tombé) : on s'arrête.
 */

/** @typedef {{ maxSpeed: number, accel: number }} Gait */

/** Allures : marche de ronde, pas pressé, course (éclaireur, fuite). */
export const GAITS = Object.freeze({
  walk: { maxSpeed: 0.55, accel: 0.035 },
  hurry: { maxSpeed: 0.85, accel: 0.05 },
  sprint: { maxSpeed: 1.25, accel: 0.08 },
  // v5.8 : charge des pillards (terrain dégagé, ils ne croisent aucun mur) et pas lourd de l'ogre.
  charge: { maxSpeed: 2, accel: 0.1 },
  heavy: { maxSpeed: 1.1, accel: 0.05 },
  // v6.1 : l'ogre pillard qui charge : lent à s'élancer, puis il fonce.
  stampede: { maxSpeed: 2, accel: 0.05 },
})

/** Distance (px) sous laquelle on considère le but atteint. */
export const ARRIVE = 3

/**
 * Vitesse horizontale du prochain pas.
 * @param {object} u état du défenseur : { x, vx, halfW }
 * @param {number} goalX abscisse visée (déjà sur la corniche)
 * @param {{ x0: number, x1: number }} ledge étendue praticable (la corniche, plus la
 *   suivante quand on va passer de l'une à l'autre)
 * @param {Gait} gait
 * @param {object} [env]
 * @param {number[]} [env.allies] abscisses des camarades sur la même corniche
 * @param {(dir: number) => boolean} [env.blocked] obstacle imprévu devant ?
 * @param {number} [env.speedScale] facteur de vitesse propre au défenseur
 * @returns {{ vx: number, arrived: boolean, waiting: boolean }}
 */
export function steer(u, goalX, ledge, gait, { allies = [], blocked = null, speedScale = 1 } = {}) {
  const margin = u.halfW + 2
  const lo = ledge.x0 + margin
  const hi = ledge.x1 - margin
  const target = lo > hi ? (ledge.x0 + ledge.x1) / 2 : Math.max(lo, Math.min(hi, goalX))
  const dx = target - u.x
  const dist = Math.abs(dx)
  const max = gait.maxSpeed * speedScale
  let desired = 0
  let waiting = false
  if (dist > ARRIVE) {
    const dir = Math.sign(dx)
    // Freinage : la vitesse voulue décroît dans les derniers pixels (v² = 2·a·d).
    desired = dir * Math.min(max, Math.sqrt(2 * gait.accel * dist) + 0.05)
    // Un camarade juste devant : on attend (pas de bousculade, pas de chute).
    const ahead = allies.some((ax) => (ax - u.x) * dir > 0 && Math.abs(ax - u.x) < u.halfW * 2 + 8)
    if (ahead || (blocked && blocked(dir))) {
      desired = 0
      waiting = true
    }
  }
  // On freine plus fort qu'on n'accélère (comme un marcheur qui s'arrête).
  const braking = u.vx !== 0 && Math.sign(desired - u.vx) !== Math.sign(u.vx)
  const a = braking ? gait.accel * 1.6 : gait.accel
  let vx = u.vx + Math.max(-a, Math.min(a, desired - u.vx))
  // Bord de la corniche : on ne le franchit jamais, même lancé.
  if ((vx > 0 && u.x + vx > hi) || (vx < 0 && u.x + vx < lo)) vx = 0
  if (Math.abs(vx) < 0.01) vx = 0
  return { vx, arrived: dist <= ARRIVE && Math.abs(vx) < 0.05, waiting }
}
