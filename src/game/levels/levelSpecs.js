/**
 * Les 40 niveaux, regroupés en 4 chapitres à difficulté croissante.
 *
 *  Chapitre 1 — La Palissade (1-10)      : bois et paille, soldats, pierres.
 *  Chapitre 2 — Le Fort de pierre (11-20) : pierre, rocher (11), barils (13),
 *                                          vitraux (14), chevaliers (15), feu grégeois (16).
 *  Chapitre 3 — La Forteresse (21-30)    : fer et boulets explosifs (21), mitraille (25), roi (30).
 *  Chapitre 4 — La Citadelle (31-40)     : tout combiné, de nuit, vent fort.
 *
 * Principes de conception (v1.3) :
 *  - des châteaux HAUTS et sans rempart devant : on peut viser chaque étage ;
 *  - plus de cibles par niveau pour compenser (viser haut est plus facile) ;
 *  - des « points de rupture » : un pied en verre, un étage en paille, une
 *    poudrière… qui font tomber un château entier si on les trouve ;
 *  - d'autres niveaux demandent de l'ingéniosité : tirs en cloche par-dessus
 *    une tour, dominos, pont à couper, cave blindée à ouvrir par le haut.
 *
 * Chaque niveau : nombre de tirs (difficulté normale), vent max (0..1),
 * munitions spéciales en plus des pierres illimitées, un nom de travail
 * (commentaire) et une fonction `build(b)` qui assemble les préfabriqués
 * du StructureBuilder. Chaque niveau est vérifié par `npm run check:levels`
 * (stable au repos et gagnable en Difficile).
 */

/** @typedef {import('./StructureBuilder.js').StructureBuilder} B */

/** Une cible par étage (du bas vers le haut), avec un type au choix par étage. */
function garrison(b, rooms, types = []) {
  rooms.forEach((r, i) => b.target(r, types[i] || 'soldier'))
}

export const LEVEL_SPECS = [
  /* ===== Chapitre 1 — La Palissade ===== */

  // 1. Premier tir : une tour de bois à deux étages.
  {
    shots: 3, wind: 0, ammo: {},
    build(b) {
      garrison(b, b.tower(1350, { floors: 2, roof: 'straw' }))
    },
  },

  // 2. Le grenier : trois étages, un soldat à chaque niveau.
  {
    shots: 3, wind: 0, ammo: {},
    build(b) {
      garrison(b, b.tower(1450, { floors: 3, roof: 'straw' }))
    },
  },

  // 3. Sur pilotis (point de rupture) : cassez un pied de paille, la cabane tombe.
  {
    shots: 3, wind: 0, ammo: {},
    build(b) {
      const deck = b.stilts(1450, { mat: 'straw', h: 150, w: 150, legW: 18 })
      garrison(b, b.tower(1450, { floors: 2, w: 130, floorY: deck.floorY, roof: 'straw' }))
    },
  },

  // 4. Les jumelles : deux tours reliées au sommet, un guetteur sur la passerelle.
  {
    shots: 4, wind: 0.15, ammo: {},
    build(b) {
      const a = b.tower(1300, { floors: 3 })
      const c = b.tower(1600, { floors: 3 })
      b.plank(1300, 1600, a[2].topY)
      b.target(a[0])
      b.target(c[1])
      b.target(b.spot(1450, a[2].topY - 20))
      b.target(c[2])
    },
  },

  // 5. Tutoriel de l'Accalmie : le donjon de bois dans un vent fort.
  {
    shots: 4, wind: 0.6, ammo: {},
    build(b) {
      const k = b.tower(1500, { floors: 4, w: 180, roof: 'wood' })
      b.target(k[0], 'soldier', -35)
      b.target(k[0], 'soldier', 35)
      b.target(k[1], 'soldier', -35)
      b.target(k[1], 'soldier', 35)
      b.target(k[2])
      b.target(k[3])
    },
  },

  // 6. Château de cartes (point de rupture) : le rez-de-chaussée est en paille.
  {
    shots: 3, wind: 0.25, ammo: {},
    build(b) {
      const t = b.tower(1450, { floors: 5, mats: ['straw', 'wood'], h: 95, roof: 'straw' })
      garrison(b, t.slice(1))
    },
  },

  // 7. La passerelle : trois tours reliées au sommet, deux guetteurs sur les planches.
  {
    shots: 4, wind: 0.3, ammo: {},
    build(b) {
      const l = b.tower(1250, { floors: 3 })
      const m = b.tower(1500, { floors: 3 })
      const r = b.tower(1750, { floors: 3 })
      b.plank(1250, 1500, m[2].topY)
      b.plank(1500, 1750, m[2].topY)
      b.target(b.spot(1375, m[2].topY - 20))
      b.target(b.spot(1625, m[2].topY - 20))
      b.target(l[0])
      b.target(m[0])
      b.target(m[2])
      b.target(r[1])
    },
  },

  // 8. Tutoriel de la Force du Titan : le moulin, une tour fine de six étages à faire basculer.
  {
    shots: 4, wind: 0.3, ammo: {},
    build(b) {
      const t = b.tower(1500, { floors: 6, w: 110, h: 90, roof: 'straw' })
      b.target(t[1])
      b.target(t[3])
      b.target(t[5])
      b.target(b.room(1720, b.ground, { mat: 'straw', slab: 'wood' }))
    },
  },

  // 9. Tutoriel du feu grégeois : quatre greniers serrés, le rez-de-chaussée en
  //    paille. Un pot de feu sur la paille, et l'incendie fait tomber les dominos.
  {
    shots: 4, wind: 0.2, ammo: { fire: 2 },
    build(b) {
      for (const x of [1300, 1440, 1580, 1720]) {
        const t = b.tower(x, { floors: 3, mats: ['straw', 'wood', 'wood'], slab: 'wood', w: 100, h: 105, roof: 'straw' })
        b.target(t[2])
        if (x === 1440 || x === 1720) b.target(t[1])
      }
    },
  },

  // 10. Le fort de la palissade : un donjon et deux tours, sept défenseurs.
  {
    shots: 5, wind: 0.4, ammo: {},
    build(b) {
      const l = b.tower(1300, { floors: 3, roof: 'straw' })
      const k = b.tower(1560, { floors: 4, w: 170, roof: 'wood' })
      const r = b.tower(1820, { floors: 3, roof: 'straw' })
      b.target(l[1])
      b.target(k[0], 'soldier', -30)
      b.target(k[0], 'soldier', 30)
      b.target(k[2])
      b.target(k[3])
      b.target(r[0])
      b.target(r[2])
    },
  },

  /* ===== Chapitre 2 — Le Fort de pierre ===== */

  // 11. Tutoriel du rocher. Pierre et bois : la base résiste, le haut beaucoup moins.
  {
    shots: 4, wind: 0.3, ammo: { boulder: 1 },
    build(b) {
      const t = b.tower(1450, { floors: 4, mats: ['stone', 'stone', 'wood'], t: 24, roof: 'wood' })
      garrison(b, t)
    },
  },

  // 12. La tour de guet : cinq étages, le guetteur tout en haut.
  {
    shots: 4, wind: 0.35, ammo: { boulder: 1 },
    build(b) {
      const t = b.tower(1500, { floors: 5, mats: ['stone', 'stone', 'wood'], t: 24, h: 95, roof: 'straw' })
      garrison(b, t.slice(1))
      b.target(b.room(1250, b.ground, { mat: 'wood' }))
    },
  },

  // 13. La poudrière (point de rupture) : deux barils sous une tour de pierre.
  {
    shots: 4, wind: 0.35, ammo: { boulder: 1 },
    build(b) {
      const t = b.tower(1500, { floors: 5, mats: ['wood', 'stone'], slab: 'stone', w: 140, t: 24, h: 95, roof: 'wood' })
      b.barrel(t[0], -26)
      b.barrel(t[0], 26)
      garrison(b, t.slice(1))
    },
  },

  // 14. Les vitraux : une chapelle de verre et de pierre.
  {
    shots: 4, wind: 0.4, ammo: { boulder: 2 },
    build(b) {
      const c = b.tower(1500, { floors: 3, mats: ['glass', 'stone', 'glass'], slab: 'stone', w: 180, t: 24, roof: 'stone' })
      b.target(c[0], 'soldier', -40)
      b.target(c[0], 'soldier', 40)
      b.target(c[1])
      b.target(c[2])
      const bell = b.tower(1750, { floors: 4, mats: ['stone', 'stone', 'glass'], slab: 'stone', w: 100, t: 22, roof: 'wood' })
      b.target(bell[3])
    },
  },

  // 15. Le chevalier : un donjon de pierre, le chevalier au rez-de-chaussée.
  {
    shots: 5, wind: 0.4, ammo: { boulder: 2 },
    build(b) {
      const k = b.tower(1550, { floors: 4, mat: 'stone', w: 150, t: 26, roof: 'wood' })
      garrison(b, k, ['knight'])
      const side = b.tower(1300, { floors: 2, roof: 'straw' })
      b.target(side[1])
      b.barrel(side[0])
    },
  },

  // 16. Tutoriel du pouvoir Feu grégeois : trois greniers de paille, aucun pot
  //     de feu en réserve ; le pouvoir enflamme n'importe quel projectile.
  {
    shots: 4, wind: 0.45, ammo: { boulder: 2 },
    build(b) {
      for (const x of [1300, 1520, 1740]) {
        const t = b.tower(x, { floors: 3, mats: ['wood', 'straw'], slab: 'wood', roof: 'straw' })
        b.target(t[1])
        b.target(t[2])
      }
    },
  },

  // 17. Clé de voûte (point de rupture) : une tour de pierre posée sur un pont de bois.
  {
    shots: 4, wind: 0.45, ammo: { boulder: 2, fire: 1 },
    build(b) {
      b.wall(1420, { mat: 'stone', w: 34, h: 160, n: 4 })
      b.wall(1620, { mat: 'stone', w: 34, h: 160, n: 4 })
      const bridgeTop = b.ground - 160
      b.plank(1395, 1645, bridgeTop, { mat: 'wood', t: 22 })
      const t = b.tower(1520, { floors: 3, mat: 'stone', t: 24, floorY: bridgeTop - 22, roof: 'wood' })
      garrison(b, t)
      b.target(b.room(1520, b.ground, { mat: 'wood', w: 100, h: 90 }))
    },
  },

  // 18. Les deux donjons : des barils entre deux tours, l'explosion les fait vaciller.
  {
    shots: 5, wind: 0.5, ammo: { boulder: 2, fire: 1 },
    build(b) {
      const a = b.tower(1380, { floors: 4, mat: 'stone', t: 24, roof: 'wood' })
      const c = b.tower(1720, { floors: 4, mat: 'stone', t: 24, roof: 'wood' })
      const mid = b.room(1550, b.ground, { mat: 'wood', w: 130 })
      b.barrel(mid, -20)
      b.barrel(mid, 20)
      garrison(b, a.slice(1))
      garrison(b, c, ['knight'])
    },
  },

  // 19. Tutoriel de la Salve : une nef de verre et un clocher de cinq étages.
  {
    shots: 5, wind: 0.5, ammo: { boulder: 2, fire: 2 },
    build(b) {
      const nave = b.tower(1450, { floors: 2, mats: ['glass', 'glass'], slab: 'stone', w: 200, t: 22, roof: 'stone' })
      const bell = b.tower(1720, { floors: 5, mats: ['stone', 'stone', 'stone', 'glass'], slab: 'stone', t: 24, h: 95, roof: 'wood' })
      b.target(nave[0], 'knight', -45)
      b.barrel(nave[0], 45)
      b.target(nave[1], 'soldier', -40)
      b.target(nave[1], 'soldier', 40)
      b.target(bell[2])
      b.target(bell[4])
    },
  },

  // 20. Le fort de pierre : deux tours, un donjon, des passerelles. Huit défenseurs.
  {
    shots: 6, wind: 0.55, ammo: { boulder: 3, fire: 2 },
    build(b) {
      const l = b.tower(1300, { floors: 4, mat: 'stone', t: 24, roof: 'wood' })
      const k = b.tower(1570, { floors: 4, mats: ['stone', 'stone', 'wood'], w: 180, t: 26, roof: 'wood' })
      const r = b.tower(1840, { floors: 4, mats: ['stone', 'stone', 'wood'], t: 24, roof: 'straw' })
      b.target(l[1])
      b.target(l[3])
      b.target(k[0], 'knight', -35)
      b.barrel(k[0], 35)
      b.target(k[1], 'soldier', -30)
      b.target(k[1], 'soldier', 30)
      b.target(k[3])
      b.target(r[2], 'knight')
    },
  },

  /* ===== Chapitre 3 — La Forteresse ===== */

  // 21. Tutoriel de la bombe. Planchers de fer : seuls les boulets explosifs les font céder.
  {
    shots: 4, wind: 0.5, ammo: { boulder: 1, bomb: 2 },
    build(b) {
      const t = b.tower(1500, { floors: 4, mat: 'stone', slab: 'iron', t: 26, roof: 'wood' })
      garrison(b, t, ['knight'])
    },
  },

  // 22. Tutoriel de la Charge de poudre : une salle de fer au sol, trois étages
  //     de bois au-dessus. Sans bombe en réserve, le pouvoir ouvre le coffre.
  {
    shots: 5, wind: 0.5, ammo: { boulder: 2 },
    build(b) {
      const vault = b.room(1500, b.ground, { mat: 'iron', slab: 'iron', w: 150, t: 26 })
      b.target(vault, 'knight')
      const up = b.tower(1500, { floors: 3, mat: 'wood', w: 150, floorY: vault.topY, roof: 'straw' })
      b.target(up[0], 'soldier', -30)
      b.target(up[0], 'soldier', 30)
      b.target(up[1])
      b.target(up[2])
    },
  },

  // 23. Sur la colline : il faut tirer en cloche.
  {
    shots: 5, wind: 0.55, ammo: { boulder: 1, bomb: 1, fire: 1 },
    build(b) {
      const top = b.base(1550, { w: 300, h: 120, mat: 'stone', rows: 3 })
      const t = b.tower(1550, { floors: 4, mats: ['stone', 'stone', 'wood'], t: 24, floorY: top, roof: 'wood' })
      garrison(b, t, ['knight'])
    },
  },

  // 24. Le pilier de verre (point de rupture) : toute la forteresse repose sur trois pieds de verre.
  {
    shots: 4, wind: 0.55, ammo: { boulder: 2, bomb: 1 },
    build(b) {
      const deck = b.stilts(1550, { legs: 3, mat: 'glass', deck: 'iron', w: 220, h: 140, legW: 22, t: 24 })
      const a = b.tower(1490, { floors: 3, mat: 'stone', t: 22, w: 100, floorY: deck.floorY, roof: 'wood' })
      const c = b.tower(1610, { floors: 2, mat: 'stone', t: 22, w: 100, floorY: deck.floorY, roof: 'straw' })
      garrison(b, a, ['knight'])
      garrison(b, c)
    },
  },

  // 25. Tutoriel de la mitraille. Le hameau : six maisons éparpillées.
  {
    shots: 5, wind: 0.5, ammo: { split: 3, bomb: 2 },
    build(b) {
      ;[1250, 1420, 1590, 1760, 1930, 2100].forEach((x, i) => {
        const h = b.tower(x, { floors: 1 + (i % 2), w: 100, roof: 'straw' })
        b.target(h[h.length - 1])
      })
    },
  },

  // 26. La tour de Babel : sept étages, du fer au milieu.
  {
    shots: 5, wind: 0.6, ammo: { boulder: 2, bomb: 2, split: 1 },
    build(b) {
      const t = b.tower(1550, { floors: 7, mats: ['stone', 'stone', 'iron', 'stone', 'wood', 'wood', 'wood'], slab: 'stone', t: 24, h: 92, roof: 'wood' })
      b.target(t[0], 'knight')
      b.target(t[2], 'knight')
      b.target(t[4])
      b.target(t[5])
      b.target(t[6])
    },
  },

  // 27. L'aqueduc : une passerelle haute sur trois piliers. Abattez le pilier central.
  {
    shots: 6, wind: 0.6, ammo: { boulder: 2, bomb: 2, fire: 1 },
    build(b) {
      for (const x of [1350, 1550, 1750]) b.wall(x, { mat: 'stone', w: 36, h: 240, n: 4 })
      const top = b.ground - 240
      b.plank(1330, 1550, top, { mat: 'wood', t: 22 })
      b.plank(1550, 1770, top, { mat: 'wood', t: 22 })
      const a = b.room(1440, top - 22, { mat: 'wood', w: 120, h: 95 })
      const c = b.room(1660, top - 22, { mat: 'wood', w: 120, h: 95 })
      b.target(a, 'soldier', -20)
      b.target(a, 'knight', 25)
      b.target(c, 'soldier', -20)
      b.target(c, 'soldier', 25)
      b.target(b.room(1450, b.ground, { mat: 'wood', slab: 'stone', w: 120, t: 24 }), 'knight')
    },
  },

  // 28. Le pont-levis : une salle suspendue entre deux tours. Coupez le pont.
  {
    shots: 5, wind: 0.6, ammo: { boulder: 2, bomb: 2, split: 1 },
    build(b) {
      const a = b.tower(1350, { floors: 4, mat: 'stone', slab: 'iron', t: 26 })
      const c = b.tower(1750, { floors: 4, mat: 'stone', slab: 'iron', t: 26 })
      b.plank(1350, 1750, a[3].topY, { mat: 'wood', t: 22 })
      const hall = b.room(1550, a[3].topY - 22, { mat: 'wood', w: 150, h: 95 })
      b.target(hall, 'knight', -30)
      b.target(hall, 'soldier', 30)
      b.target(a[1])
      b.target(c[0], 'knight')
      b.target(c[2])
    },
  },

  // 29. Le monastère : une nef basse et un campanile de six étages.
  {
    shots: 6, wind: 0.65, ammo: { boulder: 2, bomb: 2, fire: 2 },
    build(b) {
      const nave = b.tower(1400, { floors: 2, mats: ['glass', 'stone'], slab: 'stone', w: 220, t: 22, roof: 'stone' })
      const tower = b.tower(1680, { floors: 6, mats: ['stone', 'stone', 'iron', 'stone', 'glass'], slab: 'stone', t: 24, h: 92, roof: 'wood' })
      b.target(nave[0], 'soldier', -50)
      b.barrel(nave[0], 0)
      b.target(nave[0], 'knight', 50)
      b.target(nave[1])
      b.target(tower[1], 'knight')
      b.target(tower[3])
      b.target(tower[5])
    },
  },

  // 30. Le roi : il se cache au sommet du donjon, gardé par deux tours.
  {
    shots: 7, wind: 0.65, ammo: { boulder: 4, bomb: 2, split: 1, fire: 1 },
    build(b) {
      const l = b.tower(1320, { floors: 4, mat: 'stone', slab: 'iron', t: 26, roof: 'wood' })
      const k = b.tower(1580, { floors: 6, mats: ['iron', 'stone', 'stone', 'stone', 'wood'], slab: 'stone', w: 150, t: 26, h: 92, roof: 'wood' })
      const r = b.tower(1840, { floors: 4, mat: 'stone', slab: 'iron', t: 26, roof: 'wood' })
      b.target(l[0], 'knight')
      b.target(l[3])
      b.target(k[0], 'knight', -28)
      b.barrel(k[0], 28)
      b.target(k[2], 'knight')
      b.target(k[4])
      b.target(k[5], 'king')
      b.target(r[1], 'knight')
      b.target(r[3])
    },
  },

  /* ===== Chapitre 4 — La Citadelle (de nuit) ===== */

  // 31. Tutoriel du Séisme. Trois tours dans la nuit, une poudrière au centre.
  {
    shots: 5, wind: 0.6, ammo: { boulder: 2, bomb: 1, fire: 2 },
    build(b) {
      for (const x of [1300, 1550, 1800]) {
        const t = b.tower(x, { floors: 4, mats: ['stone', 'stone', 'wood'], t: 24, roof: 'straw' })
        b.target(t[1])
        b.target(t[3])
        if (x === 1550) b.barrel(t[0])
      }
    },
  },

  // 32. La citadelle sur le roc : tir en cloche obligatoire.
  {
    shots: 5, wind: 0.65, ammo: { boulder: 2, bomb: 2, split: 1 },
    build(b) {
      const top = b.base(1600, { w: 340, h: 160, mat: 'stone', rows: 4 })
      const t = b.tower(1540, { floors: 4, mat: 'stone', slab: 'iron', t: 26, floorY: top, roof: 'wood' })
      const s = b.tower(1690, { floors: 2, mat: 'wood', w: 100, floorY: top, roof: 'straw' })
      garrison(b, t, ['knight', 'knight'])
      garrison(b, s)
    },
  },

  // 33. Le château de paille (point de rupture) : le deuxième étage est en paille.
  {
    shots: 4, wind: 0.7, ammo: { boulder: 2, bomb: 1, fire: 2 },
    build(b) {
      const t = b.tower(1500, { floors: 6, mats: ['stone', 'straw', 'wood'], slab: 'wood', w: 150, t: 22, h: 92, roof: 'straw' })
      b.target(t[0], 'knight')
      b.target(t[2], 'soldier', -30)
      b.target(t[2], 'soldier', 30)
      b.target(t[3])
      b.target(t[4])
      b.target(t[5])
    },
  },

  // 34. La tour d'ivoire : huit étages, fer en bas. Il faut la faire basculer par le haut.
  {
    shots: 5, wind: 0.7, ammo: { boulder: 3, bomb: 2, split: 2 },
    build(b) {
      const t = b.tower(1550, { floors: 8, mats: ['iron', 'iron', 'stone', 'stone', 'stone', 'wood'], slab: 'stone', w: 110, t: 22, h: 85, roof: 'wood' })
      b.target(t[0], 'knight')
      b.target(t[3])
      b.target(t[5])
      b.target(t[7], 'knight')
      b.target(b.room(1780, b.ground, { mat: 'wood', w: 110 }))
    },
  },

  // 35. La crypte : une cave de barils sous une grande salle. Trouvez l'entrée.
  {
    shots: 5, wind: 0.75, ammo: { boulder: 2, bomb: 2, fire: 1 },
    build(b) {
      const cellar = b.room(1520, b.ground, { mat: 'iron', slab: 'stone', w: 190, t: 26 })
      b.barrel(cellar, -50)
      b.barrel(cellar, 0)
      b.barrel(cellar, 50)
      const hall = b.tower(1520, { floors: 3, mat: 'wood', w: 170, floorY: cellar.topY, roof: 'wood' })
      b.target(hall[0], 'knight', -35)
      b.target(hall[0], 'soldier', 35)
      b.target(hall[1])
      b.target(hall[2], 'king')
      const side = b.tower(1800, { floors: 2, mat: 'stone', slab: 'iron', t: 26 })
      garrison(b, side, ['knight'])
    },
  },

  // 36. Les quatre tours : deux paires reliées par des passerelles, à deux hauteurs.
  {
    shots: 6, wind: 0.75, ammo: { boulder: 3, bomb: 2, split: 2, fire: 1 },
    build(b) {
      const opts = { mats: ['stone', 'iron', 'wood'], slab: 'stone', t: 24, h: 95 }
      const t0 = b.tower(1300, { ...opts, floors: 3 })
      const t1 = b.tower(1500, { ...opts, floors: 3 })
      const t2 = b.tower(1720, { ...opts, floors: 5 })
      const t3 = b.tower(1920, { ...opts, floors: 5 })
      b.plank(1300, 1500, t0[2].topY)
      b.plank(1720, 1920, t2[4].topY)
      b.target(b.spot(1400, t0[2].topY - 20))
      b.target(t0[0], 'knight')
      b.target(t1[1])
      b.barrel(t2[0])
      b.target(t2[2], 'knight')
      b.target(t2[4])
      b.target(t3[1])
      b.target(t3[4], 'king')
      b.target(b.spot(1820, t2[4].topY - 20))
    },
  },

  // 37. Pilotis de pierre (point de rupture) : deux tours sur une dalle portée par quatre pieds de verre.
  {
    shots: 4, wind: 0.8, ammo: { boulder: 2, bomb: 1, split: 1 },
    build(b) {
      const deck = b.stilts(1560, { legs: 4, mat: 'glass', deck: 'iron', w: 300, h: 130, legW: 22, t: 26 })
      const a = b.tower(1470, { floors: 3, mat: 'stone', slab: 'iron', w: 110, t: 24, floorY: deck.floorY })
      const c = b.tower(1650, { floors: 3, mat: 'stone', slab: 'iron', w: 110, t: 24, floorY: deck.floorY })
      b.plank(1470, 1650, a[2].topY, { mat: 'stone' })
      garrison(b, a, ['knight'])
      garrison(b, c, ['knight', 'soldier', 'king'])
    },
  },

  // 38. La forteresse en escalier : chaque tour cache la suivante. Tirez en cloche vers le fond.
  {
    shots: 6, wind: 0.8, ammo: { boulder: 3, bomb: 2, split: 2, fire: 2 },
    build(b) {
      const steps = [[1300, 2], [1460, 3], [1620, 4], [1780, 5], [1940, 6]]
      steps.forEach(([x, floors], i) => {
        const t = b.tower(x, { floors, mats: ['stone', 'stone', 'wood'], slab: i > 2 ? 'iron' : 'stone', w: 110, t: 24, h: 92, roof: i === 4 ? 'stone' : 'straw' })
        b.target(t[floors - 1], i === 4 ? 'king' : i % 2 ? 'knight' : 'soldier')
        if (floors >= 4) b.target(t[1])
      })
    },
  },

  // 39. Le labyrinthe : des salles de fer au sol, une superstructure de bois fragile au-dessus.
  {
    shots: 6, wind: 0.85, ammo: { boulder: 3, bomb: 3, split: 2, fire: 2 },
    build(b) {
      const v1 = b.room(1420, b.ground, { mat: 'iron', slab: 'iron', w: 130, t: 26 })
      const v2 = b.room(1600, b.ground, { mat: 'iron', slab: 'iron', w: 130, t: 26 })
      b.target(v1, 'knight')
      b.target(v2, 'king')
      b.plank(1420, 1600, v1.topY, { mat: 'stone', t: 22 })
      const up = b.tower(1510, { floors: 4, mats: ['wood', 'straw', 'wood'], slab: 'wood', w: 170, floorY: v1.topY - 22, roof: 'straw' })
      b.target(up[0], 'soldier', -35)
      b.barrel(up[0], 35)
      b.target(up[1])
      b.target(up[3], 'knight')
      const watch = b.tower(1830, { floors: 3, mat: 'stone', slab: 'iron', t: 24, roof: 'wood' })
      b.target(watch[2])
    },
  },

  // 40. La grande citadelle : socle de fer, donjon de sept étages, le roi au sommet.
  {
    shots: 7, wind: 0.9, ammo: { boulder: 4, bomb: 3, split: 2, fire: 2 },
    build(b) {
      const top = b.base(1650, { w: 520, h: 80, mat: 'iron', rows: 2 })
      const l = b.tower(1460, { floors: 4, mats: ['stone', 'stone', 'wood'], slab: 'iron', t: 26, floorY: top, roof: 'wood' })
      const k = b.tower(1650, { floors: 7, mats: ['iron', 'stone', 'stone', 'glass', 'stone', 'wood'], slab: 'stone', w: 140, t: 24, h: 88, floorY: top, roof: 'stone' })
      const r = b.tower(1840, { floors: 4, mats: ['stone', 'stone', 'wood'], slab: 'iron', t: 26, floorY: top, roof: 'wood' })
      b.target(l[1], 'knight')
      b.barrel(l[0])
      b.target(l[3])
      b.target(k[0], 'knight', -25)
      b.barrel(k[0], 25)
      b.target(k[2], 'knight')
      b.target(k[4])
      b.target(k[6], 'king')
      b.target(r[0], 'knight')
      b.target(r[2])
      b.barrel(r[1])
    },
  },
]
