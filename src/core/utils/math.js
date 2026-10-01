/** Petites fonctions mathématiques partagées. */

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v))
export const lerp = (a, b, t) => a + (b - a) * t
export const toRad = (deg) => (deg * Math.PI) / 180
export const toDeg = (rad) => (rad * 180) / Math.PI
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay)
/** Arrondit à `step` près (ex. angle au degré). */
export const snap = (v, step) => Math.round(v / step) * step
