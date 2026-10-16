import { WORLD } from './constants.js'

/**
 * Objets qui tombent ou roulent vers un défenseur (v6.1).
 *
 * Fonctions pures, partagées par la physique (le contact : repousser ou
 * encaisser) et par les défenseurs (anticiper : bras levés pour repousser ce
 * qui arrive doucement). Les vitesses sont celles de Matter.js : des pixels
 * par image de 16,7 ms (Body.getVelocity), y vers le bas.
 *
 * Règles :
 *  - en dessous de HIT.SAFE, un contact est un frôlement : rien ;
 *  - un objet LENT (≤ PUSH.SPEED) dont la quantité de mouvement (masse ×
 *    vitesse) ne dépasse pas la force du défenseur est repoussé, sans dégâts ;
 *  - sinon c'est un coup : ½·masse·(vitesse − HIT.SAFE)², multiplié par la
 *    dureté de l'objet et HIT.K (la masse est plafonnée : au-delà, un bloc
 *    n'écrase pas « plus mort ») ;
 *  - une chute (ou un défenseur projeté contre un mur) coûte une part de ses
 *    points de vie qui croît avec le carré de la vitesse au-delà de FALL.SAFE.
 */

/** Gravité en pixels par image² (unités des vitesses Matter, image de 1000/60 ms). */
export const G_FRAME = WORLD.GRAVITY * WORLD.GRAVITY_SCALE * (1000 / 60) ** 2

/** Dureté des matériaux pour un choc sur un personnage (la paille est molle, le fer cogne). */
export const HARDNESS = Object.freeze({ straw: 0.3, glass: 0.8, wood: 1, ice: 1, sandstone: 1, brick: 1.1, stone: 1.2, marble: 1.3, rock: 1.3, iron: 1.4 })
const BARREL_HARDNESS = 0.8

/**
 * Vitesse de chute d'un corps (composante vers le bas, ≥ 0).
 * @param {{ x: number, y: number }} v vitesse (Body.getVelocity)
 */
export function fallSpeed(v) {
  return Math.max(0, v.y)
}

/**
 * Vitesse verticale au contact après une chute de `dy` pixels (dy > 0 : l'objet
 * est encore au-dessus du point de contact) : v² = vy² + 2·g·dy.
 * @param {number} vy vitesse verticale actuelle (positive vers le bas)
 * @param {number} dy hauteur restant à tomber
 */
export function contactSpeed(vy, dy) {
  // Qu'il monte encore ou descende déjà, il repasse à cette hauteur à la même vitesse.
  return Math.sqrt(Math.max(0, vy * vy + 2 * G_FRAME * Math.max(0, dy)))
}

/**
 * Images (de 16,7 ms) avant le contact, ou Infinity si l'objet ne descend pas.
 * @param {number} vy
 * @param {number} dy
 */
export function framesToContact(vy, dy) {
  if (dy <= 0) return 0
  const v = contactSpeed(vy, dy)
  if (!(v > 0)) return Infinity
  return (v - vy) / G_FRAME
}

/**
 * Dureté d'un objet qui frappe un défenseur : matériau du bloc, baril, ou
 * facteur de choc du projectile (les tirs élémentaires sont mous, la botte
 * de paille ne fait rien).
 * @param {{ kind: string, material?: string, impactFactor?: number }} other
 */
export function hardnessOf(other) {
  if (!other) return 1
  if (other.kind === 'projectile') return other.impactFactor ?? 1
  if (other.kind === 'barrel') return BARREL_HARDNESS
  if (other.kind === 'block') return HARDNESS[other.material] ?? 1
  return 0.5
}

/**
 * Énergie d'un coup (unités du jeu) : ½·min(m, cap)·(v − sûr)².
 * @param {number} mass
 * @param {number} rel vitesse relative au contact
 */
export function hitEnergy(mass, rel) {
  const v = rel - WORLD.HIT.SAFE
  if (!(v > 0)) return 0
  return 0.5 * Math.min(mass, WORLD.HIT.MASS_CAP) * v * v
}

/**
 * Dégâts d'un coup porté par `other` à un défenseur.
 * @param {{ kind: string, mass: number, material?: string, impactFactor?: number }} other
 * @param {number} rel
 */
export function hitDamage(other, rel) {
  return WORLD.HIT.K * hardnessOf(other) * hitEnergy(other.mass, rel)
}

/**
 * Dégâts d'une chute (ou d'un défenseur projeté contre un obstacle) à la vitesse
 * `v` : une part de ses points de vie qui croît au carré de la vitesse en trop. Un bond
 * de 30 px ne coûte rien, un étage (≈ 7,5) plus de la moitié, un étage et demi tue un soldat.
 * @param {{ maxHp: number, baseToughness?: number }} unit
 * @param {number} v
 */
export function fallDamage(unit, v) {
  const over = v - WORLD.FALL.SAFE
  if (!(over > 0) || !Number.isFinite(unit.maxHp)) return 0
  const k = over / (WORLD.FALL.LETHAL_DV * Math.sqrt(unit.baseToughness ?? 1))
  return unit.maxHp * k * k
}

/**
 * Le défenseur peut-il repousser cet objet maintenant ?
 * @param {object} unit Target
 * @param {{ mass: number, kind: string }} other
 * @param {number} rel vitesse relative au contact
 * @param {number} time ms de monde
 */
export function canPush(unit, other, rel, time) {
  if (!unit.alive || !(unit.pushCapacity > 0) || !other || other.kind === 'target') return false
  if (!unit.ableAt?.(time)) return false
  // Un projectile encore en vol n'est jamais lent : seul ce qui roule ou retombe se repousse.
  if (other.kind === 'projectile' && !other.hasImpacted) return false
  // Un tablier sur sa charnière, une charge à sa corde : on ne les renvoie pas d'une main.
  if (other.hinged || other.tethered > 0 || other.body?.isStatic) return false
  if (rel > WORLD.PUSH.SPEED * (unit.pushSpeedFactor ?? 1)) return false
  return other.mass * Math.max(rel, 0.25) <= unit.pushCapacity
}

/**
 * Verdict anticipé pour un objet qui arrive sur un défenseur (au-dessus de lui
 * et qui descend, ou qui roule vers lui au sol) :
 *  - 'none'   : il ne le touchera pas (pas au-dessus, ou remonte) ;
 *  - 'push'   : lent et assez léger : il le repoussera ;
 *  - 'hurt'   : il fera mal ; 'lethal' : il tuera (points de vie actuels).
 * @param {object} unit Target (x, y, width, height, hp, pushCapacity…)
 * @param {{ x: number, y: number, mass: number, kind: string, width: number, height: number, body: any }} other
 * @param {{ x: number, y: number }} v vitesse de l'objet
 * @param {number} time
 * @returns {{ verdict: 'none'|'push'|'hurt'|'lethal', speed: number, frames: number, damage: number }}
 */
export function assess(unit, other, v, time) {
  const none = { verdict: 'none', speed: 0, frames: Infinity, damage: 0 }
  const halfW = unit.width / 2 + other.width / 2
  if (Math.abs(other.x - unit.x) > halfW + Math.abs(v.x) * 12) return none
  const top = unit.y - unit.height / 2
  const bottom = other.y + other.height / 2
  const dy = top - bottom
  if (dy < -unit.height * 0.6) return none
  if (v.y <= 0 && dy > 2) return none
  const speed = contactSpeed(v.y, dy)
  const frames = framesToContact(v.y, dy)
  if (canPush(unit, other, speed, time)) return { verdict: 'push', speed, frames, damage: 0 }
  const damage = hitDamage(other, speed)
  if (damage < 1) return { verdict: 'none', speed, frames, damage }
  return { verdict: damage >= unit.hp ? 'lethal' : 'hurt', speed, frames, damage }
}
