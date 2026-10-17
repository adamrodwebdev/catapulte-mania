/**
 * Sensation de jeu (v6.2) : arrêts sur image, ralenti de la victoire et bref
 * gros plan sur le premier gros choc d'un tir. Ils changent l'allure du temps
 * (le nombre de pas joués par image) et le cadrage, jamais les règles : une
 * relecture, qui avance au pas, ne les connaît pas.
 */
export class GameFeel {
  /** Arrêt sur image en cours (ms). */
  #hitStop = 0
  /** Ralenti en cours (ms). */
  #slowMo = 0
  /** Gros plan sur un impact : { x, y, ms } (ms restantes), ou null. */
  punch = null
  #punchUsed = false

  /** Arrêt sur image : jamais cumulé au-delà de 100 ms. */
  freeze(ms) {
    this.#hitStop = Math.min(100, Math.max(this.#hitStop, ms))
  }

  /** Ralenti (la dernière cible tombe). */
  slow(ms) {
    this.#slowMo = ms
  }

  /** Le gros plan de ce tir a-t-il déjà eu lieu ? */
  get closeUpUsed() {
    return this.#punchUsed
  }

  /** Premier gros choc du tir : bref gros plan (une fois par tir). */
  closeUp(x, y, ms) {
    this.#punchUsed = true
    this.punch = { x, y, ms }
  }

  /**
   * Allure du temps pour cette image (puis arrêt et ralenti s'usent).
   * @param {number} dt temps réel de l'image (ms)
   * @param {number} otherwise allure sans arrêt ni ralenti (suspense du dernier tir, ou 1)
   */
  advance(dt, otherwise) {
    const timeScale = this.#hitStop > 0 ? 0.04 : this.#slowMo > 0 ? 0.35 : otherwise
    this.#hitStop = Math.max(0, this.#hitStop - dt)
    this.#slowMo = Math.max(0, this.#slowMo - dt)
    return timeScale
  }

  /** Nouveau tir : un nouveau gros plan est possible. */
  newShot() {
    this.punch = null
    this.#punchUsed = false
  }

  /** Nouvelle étape d'un grand siège. */
  newStage() {
    this.#punchUsed = false
  }
}
