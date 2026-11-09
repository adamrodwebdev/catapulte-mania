import { onMounted, onBeforeUnmount } from 'vue'

/** Flèches de visée (v5.2) : maintien avec accélération, Maj pour la précision (voir AimInput). */
export const ARROW_KEYS = Object.freeze({ ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' })

/**
 * Commandes du clavier (codes physiques, indépendants de la disposition).
 *  - once : la répétition d'une touche tenue est ignorée ;
 *  - notOnButton : sans effet quand un bouton a le focus (il réagit lui-même à Espace et Entrée) ;
 *  - dir : sens du déplacement de l'engin (v6.2 : A et D, Q et D en AZERTY).
 * Pas d'Échap : sur les portails, cette touche sert au navigateur (sortie du plein écran).
 */
export const GAME_KEYS = Object.freeze({
  Space: Object.freeze({ command: 'fire', once: true, notOnButton: true }),
  Enter: Object.freeze({ command: 'fire', once: true, notOnButton: true }),
  KeyP: Object.freeze({ command: 'pause' }),
  // Seau d'eau (v5.8).
  KeyB: Object.freeze({ command: 'bucket' }),
  KeyA: Object.freeze({ command: 'drive', dir: -1, once: true }),
  KeyD: Object.freeze({ command: 'drive', dir: 1, once: true }),
})

/**
 * Les mêmes tables, cherchées par nom de touche (v6.3.1). Le nom vient de
 * l'extérieur (événement du navigateur, d'une extension, d'un clavier virtuel) :
 * une recherche dans un objet ordinaire prenait `constructor` ou `toString`
 * pour une flèche ou une commande, et `['Space']` pour la barre d'espace. Une
 * Map ne connaît que ses propres clés, et seulement des textes.
 */
const ARROWS = new Map(Object.entries(ARROW_KEYS))
const COMMANDS = new Map(Object.entries(GAME_KEYS))
/** Munitions : touches 1 à 9, dans l'ordre de la barre (neuf munitions depuis la v6.1). */
const AMMO_SLOTS = new Map(Array.from({ length: 9 }, (_, i) => [`Digit${i + 1}`, i]))

/** Flèche de visée d'une touche, ou null. */
export function arrowFor(code) {
  return ARROWS.get(code) ?? null
}

/** Commande d'une touche (tir, pause, seau, engin), ou null. */
export function gameKeyFor(code) {
  return COMMANDS.get(code) ?? null
}

/** Place dans la barre des munitions d'une touche 1 à 9 (0 à 8), ou null. */
export function ammoSlotFor(code) {
  return AMMO_SLOTS.get(code) ?? null
}

/**
 * Clavier de la partie (v6.2, sorti de l'écran de jeu) : visée aux flèches
 * (cible au sol pour le trébuchet), tir, pause, seau d'eau, munitions, et
 * déplacement de l'engin — dont le sens tenu par les boutons à l'écran :
 * fenêtre quittée (Alt+Tab, appel), le relâcher ne viendra jamais, l'engin s'arrête.
 * Les écouteurs sont posés au montage, avant ceux que l'écran enregistre ensuite.
 * @param {{
 *   controller: () => object | null,
 *   phase: import('vue').Ref<string>,
 *   showPowers: import('vue').Ref<boolean>,
 *   isTrebuchet: import('vue').Ref<boolean>,
 *   hud: import('vue').Ref<object | null>,
 *   coach: (event: string, detail?: unknown) => void,
 *   actions: { resume: () => void, pause: () => void, fire: () => void, bucket: () => void, selectAmmo: (type: string) => void, stopWatching: () => void },
 * }} game
 * @returns {{ drive: (dir: -1 | 0 | 1) => void, stopDriving: () => void }}
 */
export function useGameKeyboard({ controller, phase, showPowers, isTrebuchet, hud, coach, actions }) {
  /** Sens de déplacement tenu (touche ou bouton à l'écran) : 0, -1 ou 1. */
  let driveKey = 0

  /** Avancer (1), reculer (-1), s'arrêter (0) : boutons maintenus ou touches A / D. */
  function drive(dir) {
    driveKey = dir
    const c = controller()
    if (!c) return
    if (dir !== 0 && phase.value !== 'playing') return
    if (c.drive(dir) && dir !== 0) coach('drive')
  }

  /** Fenêtre quittée : l'engin s'arrête. */
  function stopDriving() {
    if (driveKey !== 0) drive(0)
  }

  function run(key) {
    if (key.command === 'fire') actions.fire()
    else if (key.command === 'pause') actions.pause()
    else if (key.command === 'bucket') actions.bucket()
    else if (key.command === 'drive') drive(key.dir)
  }

  function onKeyUp(e) {
    const arrow = arrowFor(e.code)
    if (arrow) controller()?.aimKey(arrow, false)
    const dir = gameKeyFor(e.code)?.dir
    if (dir && dir === driveKey) drive(0)
  }

  function onKey(e) {
    if (e.target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'range') return
    if (phase.value === 'paused' && (e.key === 'p' || e.key === 'P')) return actions.resume()
    if (phase.value !== 'playing' || showPowers.value) return
    const c = controller()
    if (c?.replaying) {
      if (e.code === 'KeyP') actions.stopWatching()
      return
    }
    const arrow = arrowFor(e.code)
    if (arrow) {
      if (e.target?.type === 'range') return
      // Trébuchet : ← → déplacent la cible au sol (Maj : par petits pas).
      if (isTrebuchet.value) {
        if (arrow !== 'left' && arrow !== 'right') return
        e.preventDefault()
        c?.trebNudge(arrow === 'left' ? -1 : 1, e.shiftKey)
        return
      }
      e.preventDefault()
      c?.aimKey(arrow, true, e.shiftKey)
      coach('aim')
      return
    }
    const key = gameKeyFor(e.code)
    const slot = ammoSlotFor(e.code)
    if (key) {
      if (key.notOnButton && e.target instanceof globalThis.HTMLButtonElement) return
      if (!(key.once && e.repeat)) run(key)
    } else if (slot !== null) {
      const a = hud.value?.ammo[slot]
      if (a) actions.selectAmmo(a.type)
    } else return
    e.preventDefault()
  }

  onMounted(() => {
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', stopDriving)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('blur', stopDriving)
    window.removeEventListener('keyup', onKeyUp)
  })

  return { drive, stopDriving }
}
