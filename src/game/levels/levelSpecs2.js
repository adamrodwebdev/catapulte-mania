import { BP } from './blueprints.js'

/**
 * Niveaux 41 à 100 : six nouveaux chapitres, chacun avec son climat et ses matériaux.
 *
 *  Chapitre 5 — Les Marais (41-50)        : brique, pilotis, brume.
 *  Chapitre 6 — Le Désert (51-60)         : grès, forts massifs, plateaux.
 *  Chapitre 7 — La Montagne (61-70)       : nids d'aigle sur les rochers, tirs en cloche.
 *  Chapitre 8 — L'Hiver (71-80)           : glace glissante, neige.
 *  Chapitre 9 — L'Orage (81-90)           : fer et brique, vent violent.
 *  Chapitre 10 — Le Trône (91-100)        : marbre, rois, citadelles finales.
 *
 * Même format que levelSpecs.js : tirs (difficulté normale), vent max,
 * munitions spéciales, et `build(b)`. Vérifiés par `npm run check:levels`.
 */
export const LEVEL_SPECS_2 = [
  /* ===== Chapitre 5 — Les Marais ===== */
  // 41. La maison de briques : la brique résiste mieux que le bois.
  { shots: 4, wind: 0.3, ammo: { boulder: 2 }, build: (b) => BP.keep(b, { x: 1450, floors: 3, m: 'brick', s: 'wood', roof: 'straw' }) },
  // 42. Sur pilotis : un pied de paille, et tout plonge.
  { shots: 4, wind: 0.3, ammo: { boulder: 1, fire: 1 }, build: (b) => BP.stiltCastle(b, { legs: 2, legMat: 'straw', deck: 'wood', m: 'brick', s: 'wood', floors: 2, twin: false }) },
  // 43. Le hameau des marais.
  { shots: 4, wind: 0.35, ammo: { fire: 2, split: 1 }, build: (b) => BP.hamlet(b, { m: 'wood', roof: 'straw' }) },
  // 44. Les jumelles de brique et leur passerelle.
  { shots: 5, wind: 0.35, ammo: { boulder: 2, fire: 1 }, build: (b) => BP.twins(b, { floors: 4, m: 'brick', top: 'wood', s: 'wood', plank: 'wood' }) },
  // 45. La poudrière des marais.
  { shots: 4, wind: 0.4, ammo: { boulder: 1, fire: 1 }, build: (b) => BP.magazine(b, { floors: 5, m: 'brick', s: 'wood' }) },
  // 46. Le rempart de briques.
  { shots: 5, wind: 0.4, ammo: { boulder: 2, bomb: 1 }, build: (b) => BP.rampart(b, { rooms: 4, m: 'brick', s: 'wood' }) },
  // 47. Les dominos du marais.
  { shots: 5, wind: 0.3, ammo: { boulder: 2, bomb: 2 }, build: (b) => BP.dominoes(b, { count: 5, floors: 3, m: 'brick', s: 'wood' }) },
  // 48. Le manoir sur l'eau : deux tours sur des pieds de verre.
  { shots: 4, wind: 0.45, ammo: { boulder: 2, bomb: 1 }, build: (b) => BP.stiltCastle(b, { legs: 3, legMat: 'glass', deck: 'stone', m: 'brick', s: 'stone', floors: 3 }) },
  // 49. Le grand moulin : huit étages de brique et de bois.
  { shots: 5, wind: 0.45, ammo: { boulder: 2, fire: 2 }, build: (b) => BP.keep(b, { x: 1550, floors: 7, m: 'brick', top: 'wood', split: 3, s: 'wood', w: 120, h: 88, knights: 1 }) },
  // 50. Le fort des marais.
  { shots: 6, wind: 0.5, ammo: { boulder: 3, fire: 2, bomb: 1 }, build: (b) => BP.fortress(b, { floors: 5, side: 3, m: 'brick', top: 'wood', s: 'wood', barrel: true }) },

  /* ===== Chapitre 6 — Le Désert ===== */
  // 51. Le fortin de grès.
  { shots: 4, wind: 0.3, ammo: { boulder: 2 }, build: (b) => BP.keep(b, { x: 1500, floors: 4, m: 'sandstone', s: 'wood', w: 150, double: 1, roof: 'wood' }) },
  // 52. La mesa : tirez en cloche.
  { shots: 5, wind: 0.35, ammo: { boulder: 2, bomb: 1 }, build: (b) => BP.mesa(b, { baseH: 160, floors: 3 }) },
  // 53. L'oasis : maisons de pisé dispersées.
  { shots: 4, wind: 0.4, ammo: { split: 2, fire: 2 }, build: (b) => BP.hamlet(b, { m: 'sandstone', roof: 'wood', count: 6 }) },
  // 54. La citadelle des sables.
  { shots: 5, wind: 0.4, ammo: { boulder: 2, bomb: 2 }, build: (b) => BP.fortress(b, { floors: 5, side: 3, m: 'sandstone', top: 'wood', s: 'stone' }) },
  // 55. Le caravansérail : salles en enfilade sous une galerie.
  { shots: 6, wind: 0.45, ammo: { boulder: 2, split: 3 }, build: (b) => BP.rampart(b, { rooms: 5, w: 120, m: 'sandstone', s: 'wood' }) },
  // 56. Les tours du vent.
  { shots: 5, wind: 0.5, ammo: { boulder: 2, bomb: 1 }, build: (b) => BP.twins(b, { gap: 340, floors: 5, m: 'sandstone', top: 'wood', s: 'stone', watchers: 2 }) },
  // 57. La poudrière du sultan.
  { shots: 4, wind: 0.5, ammo: { boulder: 1, bomb: 1 }, build: (b) => BP.magazine(b, { floors: 6, m: 'sandstone', s: 'stone', barrels: 2 }) },
  // 58. Le grand escalier.
  { shots: 7, wind: 0.5, ammo: { boulder: 2, bomb: 3, split: 1 }, build: (b) => BP.stairs(b, { count: 5, start: 2, m: 'sandstone', top: 'wood', s: 'stone' }) },
  // 59. La mesa fortifiée.
  { shots: 5, wind: 0.55, ammo: { boulder: 2, bomb: 2 }, build: (b) => BP.mesa(b, { baseH: 200, baseW: 380, floors: 4, m: 'sandstone', s: 'stone' }) },
  // 60. Le palais des dunes.
  { shots: 6, wind: 0.55, ammo: { boulder: 3, bomb: 2, fire: 2 }, build: (b) => BP.fortress(b, { floors: 6, side: 4, m: 'sandstone', top: 'brick', split: 3, s: 'stone', barrel: true }) },

  /* ===== Chapitre 7 — La Montagne ===== */
  // 61. Le nid d'aigle.
  { shots: 5, wind: 0.45, ammo: { boulder: 2, bomb: 1 }, build: (b) => BP.mesa(b, { baseMat: 'stone', baseH: 200, baseW: 300, floors: 3, m: 'stone', s: 'wood' }) },
  // 62. Le col gardé : aqueduc de pierre.
  { shots: 5, wind: 0.5, ammo: { boulder: 2, bomb: 1 }, build: (b) => BP.aqueduct(b, { pillar: 'stone', deck: 'wood', room: 'wood', vault: 'iron' }) },
  // 63. La tour du guetteur : neuf étages.
  { shots: 5, wind: 0.5, ammo: { boulder: 2, bomb: 2 }, build: (b) => BP.keep(b, { x: 1520, floors: 8, m: 'stone', top: 'wood', split: 4, s: 'stone', w: 115, h: 84, knights: 2 }) },
  // 64. Le refuge sur pilotis de pierre.
  { shots: 4, wind: 0.5, ammo: { boulder: 2, bomb: 1 }, build: (b) => BP.stiltCastle(b, { legs: 4, legMat: 'glass', deck: 'iron', m: 'stone', s: 'iron', floors: 3 }) },
  // 65. L'escalier de la montagne.
  { shots: 7, wind: 0.45, ammo: { boulder: 3, bomb: 3 }, build: (b) => BP.stairs(b, { count: 5, start: 3, m: 'stone', top: 'sandstone', s: 'iron', powder: true }) },
  // 66. La crypte du monastère.
  { shots: 5, wind: 0.55, ammo: { boulder: 2, bomb: 2, fire: 1 }, build: (b) => BP.crypt(b, { vault: 'iron', hall: 'wood', floors: 3 }) },
  // 67. Les deux pics.
  { shots: 5, wind: 0.6, ammo: { boulder: 2, bomb: 2 }, build: (b) => BP.twins(b, { gap: 360, floors: 5, m: 'stone', top: 'stone', s: 'iron', plank: 'stone' }) },
  // 68. Le pont du gouffre.
  { shots: 5, wind: 0.6, ammo: { boulder: 2, bomb: 2, split: 1 }, build: (b) => BP.drawbridge(b, { floors: 4, m: 'stone', s: 'iron' }) },
  // 69. La poudrière de la mine.
  { shots: 4, wind: 0.6, ammo: { boulder: 1, bomb: 2 }, build: (b) => BP.magazine(b, { floors: 7, m: 'stone', s: 'stone', barrels: 2, w: 150 }) },
  // 70. La forteresse des cimes.
  { shots: 6, wind: 0.65, ammo: { boulder: 3, bomb: 3, fire: 1 }, build: (b) => BP.fortress(b, { floors: 6, side: 4, m: 'stone', top: 'iron', split: 3, s: 'iron' }) },

  /* ===== Chapitre 8 — L'Hiver ===== */
  // 71. La tour de glace : tout glisse.
  { shots: 4, wind: 0.4, ammo: { boulder: 2 }, build: (b) => BP.keep(b, { x: 1500, floors: 4, m: 'ice', s: 'wood', roof: 'wood' }) },
  // 72. Le palais de glace sur pilotis.
  { shots: 4, wind: 0.45, ammo: { boulder: 2, fire: 1 }, build: (b) => BP.stiltCastle(b, { legs: 3, legMat: 'ice', deck: 'stone', m: 'ice', s: 'stone', floors: 3 }) },
  // 73. Le village enneigé.
  { shots: 4, wind: 0.5, ammo: { split: 2, fire: 2 }, build: (b) => BP.hamlet(b, { m: 'wood', roof: 'wood', count: 6 }) },
  // 74. Les dominos gelés.
  { shots: 4, wind: 0.5, ammo: { boulder: 2 }, build: (b) => BP.dominoes(b, { count: 5, floors: 4, m: 'ice', s: 'stone' }) },
  // 75. Les jumelles givrées.
  { shots: 5, wind: 0.55, ammo: { boulder: 2, bomb: 1 }, build: (b) => BP.twins(b, { floors: 5, m: 'stone', top: 'ice', s: 'stone', plank: 'ice', watchers: 2 }) },
  // 76. Le rempart d'hiver.
  { shots: 5, wind: 0.55, ammo: { boulder: 2, bomb: 2 }, build: (b) => BP.rampart(b, { rooms: 4, m: 'stone', s: 'ice', gallery: 'ice' }) },
  // 77. La crypte sous la glace.
  { shots: 5, wind: 0.6, ammo: { boulder: 2, bomb: 2 }, build: (b) => BP.crypt(b, { vault: 'stone', hall: 'ice', floors: 3, barrels: 2, sideMat: 'ice' }) },
  // 78. L'escalier gelé.
  { shots: 6, wind: 0.6, ammo: { boulder: 2, bomb: 2, split: 1 }, build: (b) => BP.stairs(b, { count: 5, start: 2, m: 'stone', top: 'ice', s: 'stone' }) },
  // 79. La poudrière du glacier.
  { shots: 4, wind: 0.65, ammo: { boulder: 1, bomb: 1, fire: 1 }, build: (b) => BP.magazine(b, { floors: 6, m: 'ice', s: 'stone', barrels: 2 }) },
  // 80. La citadelle de glace.
  { shots: 6, wind: 0.65, ammo: { boulder: 3, bomb: 3 }, build: (b) => BP.fortress(b, { floors: 6, side: 4, m: 'stone', top: 'ice', split: 3, s: 'stone', barrel: true }) },

  /* ===== Chapitre 9 — L'Orage ===== */
  // 81. La tour de fer sous l'orage.
  { shots: 5, wind: 0.6, ammo: { boulder: 2, bomb: 2 }, build: (b) => BP.keep(b, { x: 1520, floors: 5, m: 'brick', top: 'iron', split: 2, s: 'iron', knights: 2 }) },
  // 82. L'aqueduc de brique.
  { shots: 5, wind: 0.65, ammo: { boulder: 2, bomb: 2 }, build: (b) => BP.aqueduct(b, { pillar: 'brick', deck: 'wood', room: 'brick', vault: 'iron', piers: 3 }) },
  // 83. Le pont-levis de fer.
  { shots: 5, wind: 0.65, ammo: { boulder: 2, bomb: 2, fire: 1 }, build: (b) => BP.drawbridge(b, { floors: 5, m: 'brick', s: 'iron', hall: 'wood' }) },
  // 84. La crypte du chevalier noir.
  { shots: 5, wind: 0.7, ammo: { boulder: 2, bomb: 3 }, build: (b) => BP.crypt(b, { vault: 'iron', hall: 'brick', floors: 4, barrels: 3, sideMat: 'iron' }) },
  // 85. Les dominos de fer.
  { shots: 5, wind: 0.55, ammo: { boulder: 4, bomb: 2 }, build: (b) => BP.dominoes(b, { count: 5, floors: 5, m: 'brick', s: 'iron', h: 92 }) },
  // 86. Le manoir foudroyé, sur pilotis de verre.
  { shots: 4, wind: 0.7, ammo: { boulder: 2, bomb: 1, split: 1 }, build: (b) => BP.stiltCastle(b, { legs: 4, legMat: 'glass', deck: 'iron', m: 'iron', s: 'iron', floors: 3 }) },
  // 87. Le grand rempart.
  { shots: 6, wind: 0.75, ammo: { boulder: 3, bomb: 2, split: 2 }, build: (b) => BP.rampart(b, { rooms: 5, w: 120, m: 'iron', s: 'brick', gallery: 'wood' }) },
  // 88. L'escalier de fer.
  { shots: 7, wind: 0.75, ammo: { boulder: 3, bomb: 4 }, build: (b) => BP.stairs(b, { count: 5, start: 2, m: 'brick', top: 'iron', s: 'stone', powder: true }) },
  // 89. La poudrière dans la tempête.
  { shots: 4, wind: 0.8, ammo: { boulder: 2, bomb: 1 }, build: (b) => BP.magazine(b, { floors: 6, m: 'iron', s: 'stone', barrels: 2, w: 150 }) },
  // 90. Le donjon de l'orage.
  { shots: 7, wind: 0.8, ammo: { boulder: 3, bomb: 3, fire: 2, split: 1 }, build: (b) => BP.fortress(b, { floors: 7, side: 4, m: 'iron', top: 'brick', split: 3, s: 'iron', barrel: true }) },

  /* ===== Chapitre 10 — Le Trône ===== */
  // 91. La tour de marbre.
  { shots: 5, wind: 0.6, ammo: { boulder: 2, bomb: 2 }, build: (b) => BP.keep(b, { x: 1520, floors: 5, m: 'marble', top: 'glass', split: 3, s: 'marble', king: true, knights: 1 }) },
  // 92. La galerie des glaces.
  { shots: 5, wind: 0.65, ammo: { boulder: 2, bomb: 2, split: 1 }, build: (b) => BP.rampart(b, { rooms: 4, m: 'marble', s: 'glass', gallery: 'marble' }) },
  // 93. Les jumelles royales.
  { shots: 5, wind: 0.65, ammo: { boulder: 2, bomb: 2 }, build: (b) => BP.twins(b, { gap: 340, floors: 6, m: 'marble', top: 'brick', split: 3, s: 'marble', plank: 'marble', watchers: 2, h: 90 }) },
  // 94. Le trésor royal : crypte de fer, salle de marbre.
  { shots: 5, wind: 0.7, ammo: { boulder: 2, bomb: 3 }, build: (b) => BP.crypt(b, { vault: 'iron', hall: 'marble', floors: 3, barrels: 3, sideMat: 'marble' }) },
  // 95. Le belvédère du roi, sur pilotis de verre.
  { shots: 4, wind: 0.7, ammo: { boulder: 2, bomb: 1 }, build: (b) => BP.stiltCastle(b, { legs: 3, legMat: 'glass', deck: 'marble', m: 'marble', s: 'marble', floors: 3, twin: false }) },
  // 96. L'escalier d'honneur.
  { shots: 8, wind: 0.25, ammo: { boulder: 4, bomb: 6, split: 1 }, build: (b) => BP.stairs(b, { count: 5, start: 3, m: 'marble', top: 'iron', s: 'marble', powder: true }) },
  // 97. Le pont du sacre.
  { shots: 5, wind: 0.75, ammo: { boulder: 2, bomb: 3, fire: 1 }, build: (b) => BP.drawbridge(b, { floors: 5, gap: 420, m: 'marble', s: 'iron', hall: 'brick' }) },
  // 98. La poudrière de la couronne.
  { shots: 4, wind: 0.8, ammo: { boulder: 2, bomb: 2 }, build: (b) => BP.magazine(b, { floors: 8, m: 'marble', s: 'marble', barrels: 2, w: 150 }) },
  // 99. L'aqueduc impérial.
  { shots: 6, wind: 0.85, ammo: { boulder: 3, bomb: 3, split: 2 }, build: (b) => BP.aqueduct(b, { pillar: 'marble', deck: 'stone', room: 'marble', vault: 'iron', piers: 4, span: 190, height: 260 }) },
  // 100. Le Trône : la citadelle finale.
  { shots: 7, wind: 0.9, ammo: { boulder: 4, bomb: 6, fire: 2, split: 2 }, build: (b) => BP.fortress(b, { floors: 8, side: 5, m: 'marble', top: 'iron', split: 4, s: 'marble', h: 86, barrel: true }) },
]
