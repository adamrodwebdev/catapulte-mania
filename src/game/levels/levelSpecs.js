/**
 * Les 40 niveaux, regroupés en 4 chapitres à difficulté croissante.
 *
 *  Chapitre 1 — La Palissade (1-10)      : bois et paille, soldats, pierres.
 *  Chapitre 2 — Le Fort de pierre (11-20) : pierre, vitraux, barils (13),
 *                                          chevaliers (15), rocher (11), feu grégeois (16).
 *  Chapitre 3 — La Forteresse (21-30)    : fer, boulets explosifs (21), mitraille (25), roi (30).
 *  Chapitre 4 — La Citadelle (31-40)     : tout combiné, de nuit, vent fort.
 *
 * Chaque niveau : nombre de tirs (difficulté normale), vent max (0..1),
 * munitions spéciales disponibles en plus des pierres illimitées, et une
 * fonction `build(b)` qui assemble les préfabriqués du StructureBuilder.
 */

/** @typedef {import('./StructureBuilder.js').StructureBuilder} B */

export const LEVEL_SPECS = [
  /* ===== Chapitre 1 — La Palissade ===== */
  {
    shots: 3, wind: 0, ammo: {},
    build(b) {
      const r = b.room(1350)
      b.target(r)
    },
  },
  {
    shots: 3, wind: 0, ammo: {},
    build(b) {
      b.target(b.room(1250))
      b.target(b.room(1600), 'soldier')
    },
  },
  {
    shots: 3, wind: 0, ammo: {},
    build(b) {
      const [r1, r2] = b.tower(1400, { floors: 2, roof: 'straw' })
      b.target(r1)
      b.target(r2)
    },
  },
  {
    shots: 3, wind: 0.15, ammo: {},
    build(b) {
      b.palisade(1200, { count: 3, h: 110 })
      const r = b.room(1420)
      b.roof(1420, r.topY, { mat: 'straw' })
      b.target(r, 'soldier', -18)
      b.target(r, 'soldier', 18)
    },
  },
  {
    shots: 4, wind: 0.25, ammo: {},
    build(b) {
      const [a1, a2] = b.tower(1350, { floors: 2 })
      b.target(a1)
      b.target(a2)
      const r = b.room(1650, b.ground, { mat: 'straw', slab: 'wood' })
      b.target(r)
    },
  },
  {
    shots: 4, wind: 0.3, ammo: {},
    build(b) {
      b.palisade(1180, { count: 4, h: 150 })
      const r1 = b.room(1420)
      b.roof(1420, r1.topY, { mat: 'straw' })
      b.target(r1)
      const r2 = b.room(1600)
      b.roof(1600, r2.topY, { mat: 'straw' })
      b.target(r2)
    },
  },
  {
    shots: 4, wind: 0.3, ammo: {},
    build(b) {
      const rooms = b.tower(1500, { floors: 3, roof: 'wood' })
      rooms.forEach((r) => b.target(r))
    },
  },
  {
    shots: 4, wind: 0.35, ammo: {},
    build(b) {
      const left = b.tower(1300, { floors: 2 })
      const right = b.tower(1620, { floors: 2 })
      b.plank(1300, 1620, left[1].topY)
      b.target(left[0])
      b.target(right[1])
      b.target(right[0])
    },
  },
  {
    shots: 4, wind: 0.4, ammo: {},
    build(b) {
      const near = b.room(1250, b.ground, { mat: 'straw', slab: 'wood' })
      b.target(near)
      const far = b.tower(2000, { floors: 2, roof: 'straw' })
      b.target(far[0])
      b.target(far[1])
    },
  },
  {
    shots: 5, wind: 0.4, ammo: {},
    build(b) {
      b.palisade(1150, { count: 3, h: 140 })
      const t1 = b.tower(1380, { floors: 2, roof: 'straw' })
      const keep = b.tower(1640, { floors: 2, w: 160, roof: 'wood' })
      const t2 = b.tower(1900, { floors: 2, roof: 'straw' })
      b.target(t1[1])
      b.target(keep[0], 'soldier', -25)
      b.target(keep[1], 'soldier', 25)
      b.target(t2[0])
      b.target(t2[1])
    },
  },

  /* ===== Chapitre 2 — Le Fort de pierre ===== */
  {
    shots: 4, wind: 0.3, ammo: { boulder: 1 },
    build(b) {
      const r = b.room(1400, b.ground, { mat: 'stone', slab: 'wood', t: 24 })
      b.target(r)
      b.target(b.room(1650), 'soldier')
    },
  },
  {
    shots: 4, wind: 0.35, ammo: { boulder: 1 },
    build(b) {
      const rooms = b.tower(1500, { floors: 2, mats: ['stone', 'wood'], roof: 'wood', t: 24 })
      b.target(rooms[0])
      b.target(rooms[1])
    },
  },
  {
    shots: 4, wind: 0.35, ammo: { boulder: 1 },
    build(b) {
      const store = b.room(1350, b.ground, { mat: 'wood' })
      b.barrel(store, -16)
      b.barrel(store, 16)
      const r = b.room(1520, b.ground, { mat: 'stone', slab: 'stone', t: 24 })
      b.target(r)
      const r2 = b.room(1690, b.ground, { mat: 'stone', slab: 'wood', t: 24 })
      b.target(r2)
    },
  },
  {
    shots: 4, wind: 0.4, ammo: { boulder: 2 },
    build(b) {
      const rooms = b.tower(1500, { floors: 2, mats: ['stone', 'glass'], slab: 'stone', t: 24, roof: 'stone' })
      b.target(rooms[0], 'soldier', 16)
      b.barrel(rooms[0], -18)
      b.target(rooms[1])
    },
  },
  {
    shots: 5, wind: 0.4, ammo: { boulder: 2 },
    build(b) {
      const keep = b.tower(1550, { floors: 2, mat: 'stone', w: 150, t: 26, roof: 'wood' })
      b.target(keep[0], 'knight')
      b.target(keep[1], 'soldier')
      const hut = b.room(1300)
      b.barrel(hut)
    },
  },
  {
    shots: 4, wind: 0.45, ammo: { boulder: 1, fire: 2 },
    build(b) {
      for (const x of [1300, 1500, 1700]) {
        const r = b.room(x, b.ground, { mat: 'straw', slab: 'wood' })
        b.roof(x, r.topY, { mat: 'straw' })
        b.target(r)
      }
    },
  },
  {
    shots: 5, wind: 0.45, ammo: { boulder: 2, fire: 1 },
    build(b) {
      b.wall(1250, { mat: 'stone', h: 220, n: 5, w: 34 })
      const t = b.tower(1500, { floors: 2, mats: ['stone', 'wood'], t: 24 })
      b.target(t[0])
      b.target(t[1])
      b.barrel(t[0], -30)
    },
  },
  {
    shots: 5, wind: 0.5, ammo: { boulder: 2, fire: 1 },
    build(b) {
      const a = b.tower(1350, { floors: 2, mat: 'stone', t: 24, roof: 'wood' })
      const c = b.tower(1750, { floors: 2, mat: 'stone', t: 24, roof: 'wood' })
      const mid = b.room(1550, b.ground, { mat: 'wood' })
      b.barrel(mid, -18)
      b.barrel(mid, 18)
      b.target(a[1])
      b.target(c[0], 'knight')
      b.target(c[1])
    },
  },
  {
    shots: 5, wind: 0.5, ammo: { boulder: 2, fire: 2 },
    build(b) {
      const g = b.tower(1350, { floors: 2, mats: ['stone', 'glass'], slab: 'stone', t: 24 })
      const k = b.tower(1600, { floors: 3, mats: ['stone', 'stone', 'glass'], slab: 'stone', t: 24, roof: 'stone' })
      b.target(g[1])
      b.barrel(g[0])
      b.target(k[0], 'knight')
      b.target(k[2])
      b.barrel(k[1], 20)
      b.target(k[1], 'soldier', -18)
    },
  },
  {
    shots: 6, wind: 0.55, ammo: { boulder: 2, fire: 2 },
    build(b) {
      b.wall(1200, { mat: 'stone', h: 160, n: 4, w: 34 })
      const left = b.tower(1420, { floors: 3, mat: 'stone', t: 26, roof: 'wood' })
      const keep = b.tower(1700, { floors: 2, mat: 'stone', w: 170, t: 26 })
      const right = b.tower(1980, { floors: 3, mats: ['stone', 'stone', 'wood'], t: 26, roof: 'straw' })
      b.target(left[2])
      b.target(left[0], 'knight')
      b.target(keep[0], 'knight', -30)
      b.barrel(keep[0], 30)
      b.target(keep[1])
      b.target(right[1])
    },
  },

  /* ===== Chapitre 3 — La Forteresse ===== */
  {
    shots: 4, wind: 0.5, ammo: { boulder: 1, bomb: 2 },
    build(b) {
      const r = b.room(1450, b.ground, { mat: 'stone', slab: 'iron', w: 140, t: 26 })
      b.target(r, 'knight')
      const r2 = b.room(1700, b.ground, { mat: 'stone', slab: 'iron', t: 26 })
      b.target(r2)
    },
  },
  {
    shots: 5, wind: 0.5, ammo: { boulder: 2, bomb: 1 },
    build(b) {
      for (const x of [1350, 1650]) {
        const t = b.tower(x, { floors: 2, mat: 'stone', slab: 'iron', t: 26 })
        b.target(t[0], 'knight')
        b.target(t[1])
      }
    },
  },
  {
    shots: 5, wind: 0.55, ammo: { boulder: 1, bomb: 1, fire: 1 },
    build(b) {
      const t = b.tower(1550, { floors: 3, mats: ['stone', 'stone', 'wood'], slab: 'stone', w: 150, t: 26, roof: 'wood' })
      b.barrel(t[0], -30)
      b.barrel(t[0], 0)
      b.barrel(t[0], 30)
      b.target(t[1], 'knight', -20)
      b.target(t[1], 'knight', 20)
      b.target(t[2])
    },
  },
  {
    shots: 5, wind: 0.55, ammo: { boulder: 2, bomb: 2 },
    build(b) {
      b.wall(1250, { mat: 'iron', h: 180, n: 3, w: 30 })
      const t = b.tower(1500, { floors: 3, mats: ['stone', 'wood', 'wood'], t: 24, roof: 'straw' })
      t.forEach((r, i) => b.target(r, i === 0 ? 'knight' : 'soldier'))
    },
  },
  {
    shots: 4, wind: 0.5, ammo: { split: 2, bomb: 1 },
    build(b) {
      for (const x of [1300, 1480, 1660, 1840]) {
        const r = b.room(x, b.ground, { mat: 'wood', w: 100 })
        b.target(r)
      }
    },
  },
  {
    shots: 5, wind: 0.6, ammo: { boulder: 2, bomb: 1, split: 1 },
    build(b) {
      const t = b.tower(1550, { floors: 4, mats: ['stone', 'stone', 'iron', 'wood'], slab: 'stone', t: 26, roof: 'wood' })
      b.target(t[0], 'knight')
      b.barrel(t[1])
      b.target(t[2], 'knight')
      b.target(t[3])
    },
  },
  {
    shots: 5, wind: 0.6, ammo: { boulder: 2, bomb: 2, fire: 1 },
    build(b) {
      const top = b.base(1600, { w: 340, h: 80, mat: 'stone', rows: 2 })
      const t1 = b.tower(1500, { floors: 2, mat: 'stone', t: 24, floorY: top })
      const t2 = b.tower(1720, { floors: 1, mat: 'wood', floorY: top, roof: 'straw' })
      b.target(t1[0], 'knight')
      b.target(t1[1])
      b.target(t2[0])
      b.barrel(t2[0], 24)
    },
  },
  {
    shots: 6, wind: 0.6, ammo: { boulder: 2, bomb: 2, split: 1 },
    build(b) {
      b.wall(1250, { mat: 'stone', h: 140, n: 4, w: 34 })
      const towers = [1450, 1750, 2050].map((x) => b.tower(x, { floors: 2, mat: 'stone', slab: 'iron', t: 26 }))
      b.plank(1450, 1750, towers[0][1].topY, { mat: 'wood' })
      b.plank(1750, 2050, towers[1][1].topY, { mat: 'wood' })
      b.target(towers[0][1])
      b.target(towers[1][0], 'knight')
      b.target(towers[1][1])
      b.target(towers[2][0], 'knight')
    },
  },
  {
    shots: 6, wind: 0.65, ammo: { boulder: 2, bomb: 2, fire: 2 },
    build(b) {
      const nave = b.tower(1550, { floors: 2, mats: ['glass', 'glass'], slab: 'stone', w: 180, t: 22, roof: 'stone' })
      const bell = b.tower(1820, { floors: 3, mats: ['stone', 'stone', 'glass'], slab: 'stone', t: 24, roof: 'wood' })
      b.target(nave[0], 'knight', -30)
      b.barrel(nave[0], 30)
      b.target(nave[1])
      b.target(bell[2])
      b.target(bell[0], 'knight')
    },
  },
  {
    shots: 6, wind: 0.65, ammo: { boulder: 3, bomb: 2, split: 1, fire: 1 },
    build(b) {
      b.wall(1250, { mat: 'iron', h: 160, n: 4, w: 30 })
      const left = b.tower(1450, { floors: 2, mat: 'stone', slab: 'iron', t: 26 })
      const keep = b.tower(1720, { floors: 3, mats: ['stone', 'iron', 'stone'], slab: 'iron', w: 160, t: 28, roof: 'wood' })
      b.target(left[0], 'knight')
      b.barrel(left[1])
      b.target(keep[0], 'knight', -28)
      b.barrel(keep[0], 28)
      b.target(keep[2], 'king')
      b.target(keep[1], 'knight')
    },
  },

  /* ===== Chapitre 4 — La Citadelle (de nuit) ===== */
  {
    shots: 5, wind: 0.6, ammo: { boulder: 2, bomb: 1, fire: 2 },
    build(b) {
      for (const x of [1300, 1550, 1800]) {
        const t = b.tower(x, { floors: 2, mats: ['stone', 'wood'], t: 24, roof: 'straw' })
        b.target(t[1])
        if (x === 1550) b.barrel(t[0])
      }
    },
  },
  {
    shots: 5, wind: 0.65, ammo: { boulder: 2, bomb: 2, split: 1 },
    build(b) {
      const top = b.base(1600, { w: 300, h: 100, mat: 'stone', rows: 2 })
      const t = b.tower(1600, { floors: 3, mat: 'stone', slab: 'iron', t: 26, floorY: top, roof: 'wood' })
      b.target(t[0], 'knight')
      b.target(t[1], 'knight')
      b.target(t[2])
    },
  },
  {
    shots: 6, wind: 0.7, ammo: { boulder: 2, bomb: 2, fire: 2 },
    build(b) {
      b.palisade(1150, { count: 5, h: 170, mat: 'wood' })
      const a = b.tower(1450, { floors: 3, mats: ['wood', 'wood', 'straw'], roof: 'straw' })
      const c = b.tower(1700, { floors: 3, mats: ['stone', 'wood', 'wood'], t: 24, roof: 'straw' })
      a.forEach((r) => b.target(r))
      b.target(c[2])
      b.barrel(c[0])
    },
  },
  {
    shots: 6, wind: 0.7, ammo: { boulder: 3, bomb: 2, split: 2 },
    build(b) {
      b.wall(1220, { mat: 'iron', h: 120, n: 3, w: 30 })
      b.wall(1300, { mat: 'stone', h: 200, n: 5, w: 34 })
      const k = b.tower(1600, { floors: 3, mat: 'stone', slab: 'iron', w: 150, t: 28, roof: 'stone' })
      b.target(k[0], 'knight', -22)
      b.target(k[0], 'knight', 22)
      b.target(k[2], 'king')
    },
  },
  {
    shots: 6, wind: 0.75, ammo: { boulder: 2, bomb: 3, fire: 1 },
    build(b) {
      const cellar = b.room(1500, b.ground, { mat: 'iron', slab: 'stone', w: 180, t: 26 })
      b.barrel(cellar, -45)
      b.barrel(cellar, 0)
      b.barrel(cellar, 45)
      const up = b.tower(1500, { floors: 2, mat: 'wood', w: 160, floorY: cellar.topY, roof: 'wood' })
      b.target(up[0], 'knight', -25)
      b.target(up[0], 'soldier', 25)
      b.target(up[1], 'king')
      const side = b.room(1800, b.ground, { mat: 'stone', slab: 'iron', t: 26 })
      b.target(side, 'knight')
    },
  },
  {
    shots: 6, wind: 0.75, ammo: { boulder: 3, bomb: 2, split: 2, fire: 1 },
    build(b) {
      const towers = [1350, 1600, 1850, 2100].map((x, i) =>
        b.tower(x, { floors: 2 + (i % 2), mats: ['stone', 'iron', 'wood'], slab: 'stone', t: 26, roof: i % 2 ? 'wood' : 'straw' }),
      )
      b.target(towers[0][1])
      b.target(towers[1][2], 'knight')
      b.barrel(towers[2][0])
      b.target(towers[2][1])
      b.target(towers[3][2], 'king')
    },
  },
  {
    shots: 6, wind: 0.8, ammo: { boulder: 2, bomb: 2, fire: 2, split: 1 },
    build(b) {
      const top = b.base(1700, { w: 420, h: 120, mat: 'stone', rows: 3 })
      const l = b.tower(1580, { floors: 2, mats: ['stone', 'glass'], slab: 'stone', t: 24, floorY: top })
      const r = b.tower(1820, { floors: 2, mats: ['stone', 'glass'], slab: 'stone', t: 24, floorY: top })
      b.plank(1580, 1820, l[1].topY, { mat: 'wood' })
      b.target(l[0], 'knight')
      b.target(l[1])
      b.target(r[0], 'knight')
      b.target(r[1], 'king')
    },
  },
  {
    shots: 7, wind: 0.8, ammo: { boulder: 3, bomb: 3, split: 2, fire: 2 },
    build(b) {
      b.wall(1200, { mat: 'iron', h: 160, n: 4, w: 30 })
      const gate = b.tower(1420, { floors: 2, mat: 'stone', slab: 'iron', t: 26, roof: 'wood' })
      const hall = b.tower(1700, { floors: 2, mats: ['stone', 'wood'], slab: 'stone', w: 200, t: 26, roof: 'wood' })
      const spire = b.tower(2000, { floors: 4, mats: ['stone', 'stone', 'iron', 'glass'], slab: 'stone', t: 26, roof: 'stone' })
      b.target(gate[0], 'knight')
      b.barrel(hall[0], -50)
      b.target(hall[0], 'knight', 30)
      b.target(hall[1], 'soldier', -30)
      b.target(hall[1], 'soldier', 30)
      b.target(spire[3], 'king')
      b.barrel(spire[1])
    },
  },
  {
    shots: 7, wind: 0.85, ammo: { boulder: 3, bomb: 3, split: 2, fire: 2 },
    build(b) {
      b.palisade(1120, { count: 3, h: 160, mat: 'stone' })
      const towers = [1400, 1720, 2040].map((x) => b.tower(x, { floors: 3, mats: ['iron', 'stone', 'stone'], slab: 'iron', t: 28 }))
      b.plank(1400, 1720, towers[0][2].topY, { mat: 'stone' })
      b.plank(1720, 2040, towers[1][2].topY, { mat: 'stone' })
      b.target(towers[0][2], 'knight')
      b.target(towers[1][0], 'knight')
      b.barrel(towers[1][1])
      b.target(towers[1][2], 'king')
      b.target(towers[2][1], 'knight')
    },
  },
  {
    shots: 8, wind: 0.9, ammo: { boulder: 4, bomb: 3, split: 2, fire: 2 },
    build(b) {
      b.wall(1180, { mat: 'iron', h: 200, n: 5, w: 30 })
      b.wall(1240, { mat: 'stone', h: 120, n: 3, w: 34 })
      const top = b.base(1700, { w: 500, h: 80, mat: 'iron', rows: 2 })
      const l = b.tower(1520, { floors: 3, mats: ['stone', 'stone', 'wood'], slab: 'iron', t: 26, floorY: top, roof: 'wood' })
      const keep = b.tower(1720, { floors: 4, mats: ['iron', 'stone', 'stone', 'glass'], slab: 'iron', w: 150, t: 28, floorY: top, roof: 'stone' })
      const r = b.tower(1920, { floors: 3, mats: ['stone', 'stone', 'wood'], slab: 'iron', t: 26, floorY: top, roof: 'wood' })
      b.target(l[1], 'knight')
      b.barrel(l[0])
      b.target(keep[0], 'knight', -22)
      b.barrel(keep[1])
      b.target(keep[2], 'knight')
      b.target(keep[3], 'king')
      b.target(r[2])
      b.barrel(r[0])
    },
  },
]
