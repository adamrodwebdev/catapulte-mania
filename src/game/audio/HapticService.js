/**
 * Retour haptique (vibrations) sur les appareils compatibles.
 * Utile aux joueurs malentendants : les chocs importants se ressentent.
 */
const PATTERNS = Object.freeze({
  launch: [18],
  // Visée (v5.2) : repère tous les 5° / 10 %, à peine perceptible.
  tick: [4],
  impact: [12],
  explosion: [60, 30, 90],
  kill: [25, 20, 25],
  victory: [40, 40, 40, 40, 120],
  defeat: [200],
})

export class HapticService {
  enabled = true

  get supported() {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
  }

  pulse(name) {
    if (!this.enabled || !this.supported || !PATTERNS[name]) return
    try {
      navigator.vibrate(PATTERNS[name])
    } catch {
      /* ignoré */
    }
  }
}
