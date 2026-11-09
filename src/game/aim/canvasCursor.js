/**
 * Curseur de la scène (règle du 9 novembre 2026 : le curseur dit ce qui se
 * clique). Module pur, testé : la scène est un canevas, c'est lui qui dit où un
 * clic agit, et la flèche reste partout ailleurs.
 *
 *  - Catapulte et baliste en visée : toute la scène est la fronde (on la saisit
 *    où l'on veut et on tire vers l'arrière) : la main ouverte, fermée pendant
 *    le geste. Bras en mouvement : la flèche.
 *  - Trébuchet : le viseur pour planter le fanion au point d'impact, puis la
 *    main pour figer la jauge ; la flèche pendant le balancier.
 *  - En vol : la main seulement quand un appui agit (diviser la mitraille,
 *    faire plonger le météore ou le faucon).
 *  - Pause, relecture d'un défi, entre deux tours, fin de partie : la flèche.
 */

/** Curseur du trébuchet en visée, selon son étape (TrebuchetInput.phase). */
const TREBUCHET_CURSORS = new Map([
  ['target', 'crosshair'],
  ['power', 'pointer'],
])

/**
 * @param {{ paused: boolean, replaying: boolean, aiming: boolean, flying: boolean, trebuchet: boolean,
 *   trebPhase: string | null, busy: boolean, canActivate: boolean, dragging: boolean }} scene
 *   l'état de la partie vu par la scène : busy, le bras de la catapulte ou de la baliste
 *   en mouvement ; dragging, un geste de visée en cours
 * @returns {'default' | 'pointer' | 'crosshair' | 'grab' | 'grabbing'}
 */
export function canvasCursor({ paused, replaying, aiming, flying, trebuchet, trebPhase, busy, canActivate, dragging }) {
  if (paused || replaying) return 'default'
  if (flying) return canActivate ? 'pointer' : 'default'
  if (!aiming) return 'default'
  if (trebuchet) return TREBUCHET_CURSORS.get(trebPhase) ?? 'default'
  if (busy) return 'default'
  return dragging ? 'grabbing' : 'grab'
}
