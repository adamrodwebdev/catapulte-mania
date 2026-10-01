import { Guard } from './Guard.js'

/**
 * Bus d'événements minimaliste (patron Observateur).
 * Permet aux services et au moteur de communiquer sans dépendre les uns des autres :
 * le moteur émet « target:destroyed », l'audio, les sous-titres et le score s'y abonnent.
 */
export class EventBus {
  /** @type {Map<string, Set<Function>>} */
  #listeners = new Map()

  /**
   * Abonne une fonction à un événement.
   * @param {string} event
   * @param {(payload: any) => void} handler
   * @returns {() => void} fonction de désabonnement
   */
  on(event, handler) {
    Guard.string(event, 'event', { minLength: 1, maxLength: 64 })
    Guard.func(handler, 'handler')
    if (!this.#listeners.has(event)) this.#listeners.set(event, new Set())
    this.#listeners.get(event).add(handler)
    return () => this.off(event, handler)
  }

  /** Abonnement à usage unique. */
  once(event, handler) {
    const off = this.on(event, (payload) => {
      off()
      handler(payload)
    })
    return off
  }

  off(event, handler) {
    this.#listeners.get(event)?.delete(handler)
  }

  /**
   * Émet un événement. Une erreur dans un abonné n'interrompt pas les autres.
   * @param {string} event
   * @param {any} [payload]
   */
  emit(event, payload) {
    const set = this.#listeners.get(event)
    if (!set) return
    for (const handler of [...set]) {
      try {
        handler(payload)
      } catch (err) {
        console.error(`[EventBus] "${event}" handler failed`, err)
      }
    }
  }

  clear() {
    this.#listeners.clear()
  }
}
