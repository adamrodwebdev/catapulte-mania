/**
 * Déplacement de l'engin (v6.2) : la catapulte et la baliste avancent ou
 * reculent tant que le terrain le permet. Elles s'arrêtent devant la roche,
 * l'eau, la glace, la lave, un débris ou un défenseur, jamais plus près du
 * château que la portée de ses archers (des flèches plantées au sol la
 * montrent), ni à plus de AHEAD de leur place de départ. Vitesses en px par
 * pas de simulation (1/120 s) : tout se décide au pas, la relecture refait le
 * même chemin.
 */
export const DRIVE = Object.freeze({
  /** Campagne : le premier niveau n'apprend que la visée ; l'engin roule à partir du deuxième. */
  FROM_LEVEL: 2,
  SPEED: 1,
  ACCEL: 0.025,
  BRAKE: 0.06,
  /** Recul le plus lointain (x de l'engin). */
  BACK: -200,
  /** Avance la plus longue depuis la place de départ. */
  AHEAD: 380,
  /** Portée des archers : distance la plus courte entre l'engin et le front du château. */
  STANDOFF: 620,
  /** Garde devant un obstacle. */
  GAP: 14,
  /** Rayon des roues de la catapulte (elles tournent avec le chemin parcouru). */
  WHEEL_R: 18,
  /** Roulement, grincement, poussière : tous les … px parcourus. */
  ROLL_EVERY: 34,
  CREAK_EVERY: 120,
  DUST_EVERY: 14,
})

/** Encombrement de chaque engin depuis son centre : vers l'avant, vers l'arrière. */
export const ENGINE_EXTENT = Object.freeze({ catapult: { front: 88, rear: 84 }, ballista: { front: 80, rear: 64 }, trebuchet: { front: 118, rear: 118 } })

/** Encombrement d'un engin (la catapulte par défaut). */
export function extentOf(kind) {
  return ENGINE_EXTENT[kind] ?? ENGINE_EXTENT.catapult
}
