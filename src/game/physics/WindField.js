import { Guard, deepFreeze } from '../../core/utils/Guard.js'
import { SeededRandom } from '../../core/utils/SeededRandom.js'
import { clamp } from '../../core/utils/math.js'
import { WORLD } from './constants.js'
import { PROJECTILE_TYPES } from '../entities/catalog.js'

/**
 * Profils de vent par difficulté (v3.6).
 *
 * - ratio   : multiplicateur de l'accélération maximale (×1 = 7 % de la gravité ;
 *             Difficile ×2,4 : le vent compte aussi pour les tirs tendus)
 * - shear   : cisaillement : le vent souffle plus fort en altitude qu'au ras du sol
 * - gust    : amplitude des rafales (0 = vent constant)
 * - windage : la prise au vent dépend du projectile (léger et gros = très dévié)
 * - fire    : le vent attise le feu et le pousse dans son sens
 *
 * Facile et Normal gardent le vent historique (constant, identique pour tous
 * les projectiles) : l'équilibre des niveaux n'y change pas.
 */
export const WIND_PROFILES = deepFreeze({
  easy: { ratio: 1, shear: 0, gust: 0, windage: false, fire: false },
  normal: { ratio: 1, shear: 0, gust: 0, windage: false, fire: false },
  hard: { ratio: 2.4, shear: 0.6, gust: 0.35, windage: true, fire: true },
})

/** Altitude (px au-dessus du sol) où le vent atteint sa force « nominale » haute. */
const SHEAR_HEIGHT = 800
/** Vitesse de déplacement des fronts de rafale (px/ms), dans le sens du vent. */
const FRONT_SPEED = 0.45
/** Périodes des deux composantes de rafale (ms) : lente et vive. */
const PERIODS = Object.freeze([5600, 2300])
const STONE = PROJECTILE_TYPES.stone

/**
 * Prise au vent d'un projectile, relative à la pierre (1).
 * Physiquement, l'effet du vent est proportionnel à la surface exposée divisée
 * par la masse, soit 1 / (densité × rayon) pour une sphère : un boulet lourd
 * résiste (≈ 0,4), un éclat léger s'envole (≈ 1,5).
 * @param {{ type: string, radius: number, body?: { density?: number } }} p
 */
export function windageOf(p) {
  const t = PROJECTILE_TYPES[p.type] ?? STONE
  const density = p.body?.density ?? t.density
  return clamp((STONE.density * STONE.radius) / (density * p.radius), 0.25, 2)
}

/**
 * Champ de vent : donne, en tout point et à tout instant, la force du vent.
 *
 * Vent = base × cisaillement(altitude) × (1 + rafale(x, t)).
 * Les rafales sont des fronts qui traversent le terrain dans le sens du vent :
 * on les voit arriver (traînées plus denses) et on peut choisir son moment.
 * Tout est déterministe (graine du niveau) : même partie, même vent.
 */
export class WindField {
  /** Vent de base du tour, ∈ [-1, 1] (tiré au sort à chaque tour). */
  #base = 0
  #phases

  /**
   * @param {{ ratio: number, shear: number, gust: number, windage: boolean, fire: boolean }} profile
   * @param {number} [seed]
   */
  constructor(profile = WIND_PROFILES.normal, seed = 1) {
    this.profile = deepFreeze({
      ratio: Guard.number(profile.ratio, 'wind ratio', { min: 0, max: 4 }),
      shear: Guard.number(profile.shear, 'wind shear', { min: 0, max: 1 }),
      gust: Guard.number(profile.gust, 'wind gust', { min: 0, max: 1 }),
      windage: Guard.boolean(profile.windage, 'windage'),
      fire: Guard.boolean(profile.fire, 'wind fire'),
    })
    const rng = new SeededRandom((Guard.int(seed, 'wind seed', { min: 0, max: 2 ** 32 }) ^ 0x5eed) >>> 0)
    this.#phases = PERIODS.map(() => rng.range(0, Math.PI * 2))
  }

  get base() {
    return this.#base
  }

  set base(v) {
    this.#base = Guard.number(v, 'wind', { min: -1, max: 1 })
  }

  /** Le vent varie-t-il (rafales, altitude) ? */
  get dynamic() {
    return this.profile.gust > 0 || this.profile.shear > 0
  }

  /** Multiplicateur d'altitude : 1 au ras du sol, ~1,6 à 800 px de haut (Difficile). */
  shearAt(y) {
    const s = this.profile.shear
    if (s === 0) return 1
    return 1 + s * clamp((WORLD.GROUND_Y - y) / SHEAR_HEIGHT, 0, 1.25)
  }

  /**
   * Rafale en x à l'instant t, ∈ [-1, 1] (0 sans rafales). Le motif avance
   * dans le sens du vent : ce qui souffle ici soufflera plus loin un peu après.
   * @param {number} x
   * @param {number} t ms
   */
  gustAt(x, t) {
    if (this.profile.gust === 0 || this.#base === 0) return 0
    const dir = Math.sign(this.#base)
    const local = t - (x * dir) / FRONT_SPEED
    const [a, b] = this.#phases
    return 0.62 * Math.sin((2 * Math.PI * local) / PERIODS[0] + a) + 0.38 * Math.sin((2 * Math.PI * local) / PERIODS[1] + b)
  }

  /**
   * Force du vent (sans unité, signée) en un point : 1 = vent de base maximal.
   * Peut dépasser 1 en Difficile (altitude + rafale).
   */
  at(x, y, t) {
    if (this.#base === 0) return 0
    return this.#base * this.shearAt(y) * (1 + this.profile.gust * this.gustAt(x, t))
  }

  /** Accélération horizontale (unités Matter, par ms²) pour une prise au vent donnée. */
  accel(x, y, t, windage = 1) {
    const w = this.at(x, y, t)
    if (w === 0) return 0
    return w * WORLD.WIND_RATIO * this.profile.ratio * WORLD.GRAVITY * WORLD.GRAVITY_SCALE * (this.profile.windage ? windage : 1)
  }

  /**
   * Accélération « figée » à l'instant t pour l'aide à la trajectoire : altitude
   * et prise au vent comprises, rafale du moment à la catapulte, mais pas les
   * rafales à venir (le joueur doit les anticiper).
   * @returns {(x: number, y: number) => number}
   */
  frozen(originX, t, windage = 1) {
    if (this.#base === 0) return () => 0
    const gust = 1 + this.profile.gust * this.gustAt(originX, t)
    const k = this.#base * gust * WORLD.WIND_RATIO * this.profile.ratio * WORLD.GRAVITY * WORLD.GRAVITY_SCALE * (this.profile.windage ? windage : 1)
    return (_x, y) => k * this.shearAt(y)
  }

  /**
   * Vent ressenti à la catapulte (affichage) : force et rafale en cours.
   * @returns {{ value: number, gust: number }}
   */
  sample(x, t) {
    const gust = this.gustAt(x, t)
    return { value: this.#base * (1 + this.profile.gust * gust), gust }
  }
}
