/**
 * Affichage du déplacement de l'engin (v6.2) : l'état des commandes pour
 * l'interface, et les flèches plantées au sol à la portée des archers pour le
 * rendu. Calculé depuis EngineDrive, sans rien modifier.
 */
import { clamp } from '../../core/utils/math.js'
import { DRIVE, extentOf } from './driveRules.js'

/**
 * Commandes de déplacement : sens en cours, ouvertes ou non, et bornes atteintes.
 * @param {import('./EngineDrive.js').EngineDrive} drive
 */
export function driveControls(drive, engine, world, open) {
  const b = drive.bounds(engine, world)
  return { dir: drive.dir, open, front: engine.x >= b.max - 0.5, back: engine.x <= b.min + 0.5 }
}

/**
 * Flèches plantées au sol à la portée des archers : visibles quand l'engin
 * roule, s'en approche, ou vient d'y buter (jamais quand un obstacle l'arrête avant).
 * @param {import('./EngineDrive.js').EngineDrive} drive
 * @returns {{ x: number, alpha: number } | null}
 */
export function rangeMarker(drive, engine, world) {
  const b = drive.bounds(engine, world)
  if (b.ahead !== 'range') return null
  const near = clamp(1 - (b.max - engine.x - 60) / 220, 0, 1)
  const recent = clamp(1 - (world.time - drive.movedAt) / 2500, 0, 1)
  const alpha = Math.max(near * 0.9, recent * 0.6)
  if (alpha < 0.02) return null
  return { x: b.max + extentOf(engine.kind).front + DRIVE.GAP, alpha }
}
