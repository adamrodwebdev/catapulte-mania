import { SeededRandom } from '../../core/utils/SeededRandom.js'
import { EFFECTS } from './effects.js'
import { SKY_ORDER } from './skyConfig.js'

/**
 * Ciel vivant (v6.3) d'un chapitre : les effets de sa peinture (voir
 * skyConfig.js), leur temps, leur hasard et les sons qu'ils annoncent.
 *
 * - Le hasard est le sien (graine du chapitre) : jamais celui de la partie,
 *   donc les relectures et l'empreinte des parties ne changent pas.
 * - Les effets suivent le vent du niveau quand il souffle (sinon le sens du
 *   chapitre) ; mouvement réduit : rien n'avance, la peinture reste fixe ;
 *   contraste élevé : rien ne s'anime devant la peinture, seules ses lueurs restent.
 * - Les sons (tonnerre, risée, tourbillon, goutte) ne sont pas joués ici : ils
 *   attendent dans une file que le contrôleur de la partie relève (`drain`).
 */
export class LivingSky {
  /** @type {Array<[string, object]>} */
  #effects
  #byName = new Map()
  #last = null
  #events = []

  /**
   * @param {number} chapter
   * @param {object} cfg réglages du chapitre (SKY_CHAPTERS)
   * @param {object} data ce que l'on a lu dans la peinture (SkyLibrary)
   * @param {{ img?: object, seed?: number }} [opts] img : la peinture (pour l'air chaud)
   */
  constructor(chapter, cfg, data, { img = null, seed = 1000 + chapter } = {}) {
    this.chapter = chapter
    this.cfg = cfg
    this.data = data
    this.img = img
    this.rand = new SeededRandom(seed)
    /** Temps du ciel (s). */
    this.t = 0
    /** Voile d'un nuage sur le soleil (0..1), posé par l'effet `veil`. */
    this.veil = 0
    /** Sens de la dérive (1 vers la droite, -1 vers la gauche). */
    this.dir = cfg.wind ?? 1
    const names = SKY_ORDER.filter((n) => cfg.fx.includes(n))
    this.#effects = names.map((name) => [name, EFFECTS[name](this)])
    for (const [name, fx] of this.#effects) this.#byName.set(name, fx)
  }

  /** Ce que le ciel remplace dans le jeu (`weather`, `motes`). */
  replaces(what) {
    return this.cfg.replaces?.includes(what) === true
  }

  /** Un effet du ciel, s'il en a un de ce nom. */
  effect(name) {
    return this.#byName.get(name) ?? null
  }

  /** Signale un son (voir drain). */
  emit(kind, payload = {}) {
    if (this.#events.length < 16) this.#events.push({ kind, ...payload })
  }

  /** Les sons annoncés depuis le dernier relevé. */
  drain() {
    const out = this.#events
    this.#events = []
    return out
  }

  /**
   * Avance le ciel.
   * @param {number} time horloge de la partie (ms)
   * @param {object} view vue et placement de la peinture (voir effects.js)
   * @param {{ wind?: number, k?: number }} [env] wind : vent du niveau (signé) ; k : intensité
   */
  update(time, view, { wind = 0, k = 1 } = {}) {
    const dt = this.#last === null ? 0 : Math.max(0, Math.min(0.05, (time - this.#last) / 1000))
    this.#last = time
    if (Math.abs(wind) >= 0.05) this.dir = Math.sign(wind)
    if (dt <= 0) return
    this.t += dt
    for (const [, fx] of this.#effects) fx.update?.(dt, view, k)
  }

  /**
   * Dessine le ciel, en repère écran, juste après la peinture.
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} view
   * @param {{ animate?: boolean, highContrast?: boolean, k?: number }} [opts]
   */
  draw(ctx, view, { animate = true, highContrast = false, k = 1 } = {}) {
    const motion = animate && !highContrast
    const t = motion ? this.t : 3.2
    for (const [, fx] of this.#effects) {
      if (!fx.draw) continue
      ctx.save()
      fx.draw(ctx, view, t, motion, k)
      ctx.restore()
    }
  }
}
