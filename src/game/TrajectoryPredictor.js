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
   * @param {{ wind?: number, windAccel?: (x: number, y: number) => number, gustAccel?: (x: number, y: number) => number, lift?: (x: number, y: number) => number,
   *   expose?: { step: (x: number, y: number) => number, element: string, slow?: number }, frictionAir?: number, obstacles?: Iterable<any>, maxPoints?: number, every?: number }} [opts]
   *   windAccel : accélération du vent selon la position (Difficile : altitude, prise
   *   au vent, rafale du moment). Les rafales à venir, elles, restent imprévisibles.
   *   gustAccel, lift (v6.1) : rafales des moulins du moment, colonnes d'air chaud.
   *   expose (v6.1) : exposition au souffle du monde ; le point où l'élément marque le
   *   tir porte `mark` (le sable freine alors le tir de `slow`).
   * @returns {{x:number,y:number,mark?:string}[]}
   */
  static predict(start, velocity, { wind = 0, windAccel = null, gustAccel = null, lift = null, expose = null, frictionAir = 0.0006, obstacles = [], maxPoints = 60, every = 6 } = {}) {
    const dt = WORLD.STEP_MS
    const base = 1000 / 60
    const damping = 1 - frictionAir * (dt / base)
    const g = WORLD.GRAVITY * WORLD.GRAVITY_SCALE * dt * dt
    const flat = wind * WORLD.WIND_RATIO * WORLD.GRAVITY * WORLD.GRAVITY_SCALE * dt * dt
    let x = start.x
    let y = start.y
    let vx = velocity.x * (dt / base)
    let vy = velocity.y * (dt / base)
    const boxes = [...obstacles].map((e) => e.body.bounds)
    const points = []
    let exposure = 0
    let marked = !expose
    for (let i = 1; i <= maxPoints * every; i++) {
      vx = vx * damping + (windAccel ? windAccel(x, y) * dt * dt : flat) + (gustAccel ? gustAccel(x, y) * dt * dt : 0)
      vy = vy * damping + g + (lift ? lift(x, y) * dt * dt : 0)
      x += vx
      y += vy
      if (!marked) {
        exposure += expose.step(x, y)
        if (exposure >= 1) {
          marked = true
          points.push({ x, y, mark: expose.element })
          if (expose.slow) {
            vx *= expose.slow
            vy *= expose.slow
          }
        }
      }
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
