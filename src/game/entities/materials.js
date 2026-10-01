import { deepFreeze } from '../../core/utils/Guard.js'

/**
 * Matériaux de construction. La progression du jeu suit l'ordre des matériaux :
 * chapitre 1 bois et paille, chapitre 2 pierre, chapitre 3 fer, chapitre 4 tout à la fois.
 *
 * - density     : densité Matter.js (masse = densité × surface)
 * - hp          : énergie de choc nécessaire pour détruire le bloc
 * - flammable   : peut prendre feu (pot de feu, explosion)
 * - score       : points accordés à la destruction
 * - sound       : famille de son et de sous-titre
 */
export const MATERIALS = deepFreeze({
  straw: { density: 0.0006, hp: 40, friction: 0.9, restitution: 0.02, flammable: true, score: 20, sound: 'straw' },
  wood: { density: 0.0011, hp: 110, friction: 0.75, restitution: 0.04, flammable: true, score: 50, sound: 'wood' },
  glass: { density: 0.0016, hp: 22, friction: 0.4, restitution: 0.1, flammable: false, score: 40, sound: 'glass' },
  stone: { density: 0.0026, hp: 520, friction: 0.85, restitution: 0.02, flammable: false, score: 120, sound: 'stone' },
  iron: { density: 0.0042, hp: 1300, friction: 0.6, restitution: 0.05, flammable: false, score: 250, sound: 'iron' },
})

export const MATERIAL_NAMES = Object.freeze(Object.keys(MATERIALS))
