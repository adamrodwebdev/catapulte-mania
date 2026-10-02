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
 * - armor       : part des dégâts de choc réellement subis (1 = tous). Le fer
 *                 encaisse mieux les boulets ; seules les explosions et le feu
 *                 l'entament pleinement
 * - bearing     : part de `hp` qu'un tir doit atteindre pour faire céder un mur
 *                 porteur (voir StructuralIntegrity) : la pierre et le fer exigent
 *                 un tir puissant et bien placé
 */
/*
 * v3 : résistances ×2,2 et densités ×4 à ×6 : un château pèse bien plus lourd que
 * la pierre de base, qui ne suffit plus à renverser un mur de pierre. Les personnages sont fragiles
 * (la moindre collision les tue) ; ce sont les châteaux qui les protègent, et
 * il faut le bon projectile ou les améliorations de l'atelier pour les percer.
 */
export const MATERIALS = deepFreeze({
  straw: { density: 0.0025, hp: 90, friction: 0.9, restitution: 0.02, flammable: true, score: 20, sound: 'straw', bearing: 0.15 },
  wood: { density: 0.005, hp: 260, friction: 0.75, restitution: 0.04, flammable: true, score: 50, sound: 'wood', bearing: 0.2 },
  glass: { density: 0.006, hp: 55, friction: 0.4, restitution: 0.1, flammable: false, score: 40, sound: 'glass', bearing: 0.15 },
  stone: { density: 0.015, hp: 1150, friction: 0.85, restitution: 0.02, flammable: false, score: 120, sound: 'stone', bearing: 0.55 },
  // Nouveaux matériaux (v3), introduits aux chapitres 5 à 10.
  brick: { density: 0.0115, hp: 800, friction: 0.85, restitution: 0.02, flammable: false, score: 90, sound: 'stone', bearing: 0.4 },
  sandstone: { density: 0.0125, hp: 650, friction: 0.95, restitution: 0.02, flammable: false, score: 80, sound: 'stone', bearing: 0.35 },
  ice: { density: 0.005, hp: 160, friction: 0.04, restitution: 0.12, flammable: false, score: 60, sound: 'glass', bearing: 0.15 },
  marble: { density: 0.016, hp: 1500, friction: 0.7, restitution: 0.03, flammable: false, score: 160, sound: 'stone', bearing: 0.6 },
  iron: { density: 0.022, hp: 2900, friction: 0.95, restitution: 0.05, flammable: false, score: 250, sound: 'iron', bearing: 0.8, armor: 0.4 },
})

export const MATERIAL_NAMES = Object.freeze(Object.keys(MATERIALS))
