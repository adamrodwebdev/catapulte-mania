/**
 * Perception des défenseurs (v5.8) : ce qu'ils voient du ciel et du feu.
 *
 * Un défenseur ne connaît pas la physique du jeu : il OBSERVE le projectile
 * d'un pas à l'autre (position, vitesse, et la courbure de sa course, qui
 * révèle la pesanteur et le vent), puis prolonge cette course pour deviner
 * où il va tomber. Il ne réagit qu'après un temps de réaction, et seulement
 * si le point de chute le menace : comme un vrai guetteur.
 *
 * Déterministe : n'utilise que les positions du monde, pas à pas.
 */

/** Pesanteur par pas de simulation, avant toute observation (px/pas²). */
const G_PRIOR = 0.069
/** Nombre maximal de pas d'extrapolation (≈ 3,3 s). */
const HORIZON = 400

export class Perception {
  /** Projectiles suivis : id → { x, y, vx, vy, ay, ax, seenSteps } */
  #tracks = new Map()

  /**
   * À appeler à chaque pas, avec les projectiles encore en vol.
   * @param {{ id: number, x: number, y: number }[]} projectiles
   */
  observe(projectiles) {
    const seen = new Set()
    for (const p of projectiles) {
      seen.add(p.id)
      const t = this.#tracks.get(p.id)
      if (!t) {
        this.#tracks.set(p.id, { x: p.x, y: p.y, vx: 0, vy: 0, ax: 0, ay: G_PRIOR, seenSteps: 0 })
        continue
      }
      const vx = p.x - t.x
      const vy = p.y - t.y
      if (t.seenSteps >= 1) {
        // Accélération observée (pesanteur + vent + frottement), lissée.
        t.ay += (vy - t.vy - t.ay) * 0.25
        t.ax += (vx - t.vx - t.ax) * 0.25
      }
      Object.assign(t, { x: p.x, y: p.y, vx, vy, seenSteps: t.seenSteps + 1 })
    }
    for (const id of [...this.#tracks.keys()]) if (!seen.has(id)) this.#tracks.delete(id)
  }

  /** Projectiles suivis depuis au moins `minSteps` pas (temps de réaction). */
  threats(minSteps = 0) {
    const out = []
    for (const [id, t] of this.#tracks) if (t.seenSteps >= Math.max(2, minSteps)) out.push({ id, ...t })
    return out
  }

  /**
   * Où ce projectile franchira-t-il la hauteur `y` en descendant ?
   * @returns {{ x: number, steps: number } | null}
   */
  static landing(t, y) {
    let { x, y: py, vx, vy } = t
    const ay = t.ay > 0.01 ? t.ay : G_PRIOR
    for (let i = 1; i <= HORIZON; i++) {
      vx += t.ax
      vy += ay
      x += vx
      py += vy
      if (vy > 0 && py >= y) return { x, steps: i }
    }
    return null
  }

  clear() {
    this.#tracks.clear()
  }
}
