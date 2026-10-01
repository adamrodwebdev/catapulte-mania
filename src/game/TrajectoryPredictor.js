import { WORLD } from './physics/constants.js'

/**
 * Prédiction de trajectoire (aide d'accessibilité activable dans les options).
 *
 * Reproduit EXACTEMENT l'intégration de Matter.js (Verlet amorti, pas fixe,
 * gravité, frottement de l'air, vent) : la courbe affichée correspond au vol
 * réel tant que le projectile ne touche rien.
 */
export class TrajectoryPredictor {
  /**
   * @param {{x:number,y:number}} start point de lâcher
   * @param {{x:number,y:number}} velocity vitesse normalisée (pas de 16,67 ms)
   * @param {{ wind?: number, frictionAir?: number, obstacles?: Iterable<any>, maxPoints?: number, every?: number }} [opts]
   * @returns {{x:number,y:number}[]}
   */
  static predict(start, velocity, { wind = 0, frictionAir = 0.0006, obstacles = [], maxPoints = 60, every = 6 } = {}) {
    const dt = WORLD.STEP_MS
    const base = 1000 / 60
    const damping = 1 - frictionAir * (dt / base)
    const g = WORLD.GRAVITY * WORLD.GRAVITY_SCALE * dt * dt
    const w = wind * WORLD.WIND_RATIO * WORLD.GRAVITY * WORLD.GRAVITY_SCALE * dt * dt
    let x = start.x
    let y = start.y
    let vx = velocity.x * (dt / base)
    let vy = velocity.y * (dt / base)
    const boxes = [...obstacles].map((e) => e.body.bounds)
    const points = []
    for (let i = 1; i <= maxPoints * every; i++) {
      vx = vx * damping + w
      vy = vy * damping + g
      x += vx
      y += vy
      const hit = y >= WORLD.GROUND_Y - 4 || boxes.some((b) => x >= b.min.x && x <= b.max.x && y >= b.min.y && y <= b.max.y)
      if (hit || x > WORLD.WIDTH + 200) {
        points.push({ x, y: Math.min(y, WORLD.GROUND_Y) })
        break
      }
      if (i % every === 0) points.push({ x, y })
    }
    return points
  }
}
