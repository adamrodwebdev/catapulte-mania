/**
 * Plans de châteaux réutilisables (niveaux 41 à 100).
 *
 * Chaque plan assemble les préfabriqués du StructureBuilder à partir de quelques
 * paramètres (matériaux, hauteur, position) et place lui-même les défenseurs.
 * Les niveaux de levelSpecs2.js combinent ces plans : un plan = une idée de jeu
 * (tour à renverser, point de rupture, tir en cloche, crypte blindée…).
 *
 * Conventions : `m` = matériau des murs, `s` = matériau des planchers,
 * `top` = matériau des étages hauts, `x` = centre au sol.
 */

/** Matériaux par étage : `low` pour les `split` premiers étages, puis `high`. */
const mix = (low, high, split) => (floors) => Array.from({ length: floors }, (_, i) => (i < split ? low : high))

export const BP = {
  /** Donjon d'un seul tenant : un défenseur par étage, roi éventuel au sommet. */
  keep(b, { x = 1500, floors = 5, m = 'stone', top = m, split = 2, s = 'stone', w = 130, h = 95, t = 24, roof = 'wood', king = false, knights = 0, double = 0 }) {
    const rooms = b.tower(x, { floors, mats: mix(m, top, split)(floors), slab: s, w, h, t, roof })
    rooms.forEach((r, i) => {
      const type = king && i === floors - 1 ? 'king' : i < knights ? 'knight' : 'soldier'
      if (i < double && w >= 150) {
        b.target(r, type, -w / 4)
        b.target(r, 'soldier', w / 4)
      } else b.target(r, type)
    })
    return rooms
  },

  /** Deux tours de même hauteur reliées au sommet, guetteurs sur la passerelle. */
  twins(b, { x = 1500, gap = 300, floors = 4, m = 'stone', top = m, split = 2, s = 'stone', t = 24, h = 95, plank = 'wood', watchers = 1 }) {
    const opts = { floors, mats: mix(m, top, split)(floors), slab: s, t, h }
    const a = b.tower(x - gap / 2, opts)
    const c = b.tower(x + gap / 2, opts)
    const y = a[floors - 1].topY
    b.plank(x - gap / 2, x + gap / 2, y, { mat: plank })
    for (let i = 0; i < watchers; i++) b.target(b.spot(x - gap / 4 + (i * gap) / 2 / Math.max(1, watchers - 1 || 1), y - 20))
    a.forEach((r, i) => i % 2 === 0 && b.target(r))
    c.forEach((r, i) => i % 2 === 1 && b.target(r, i === 1 ? 'knight' : 'soldier'))
    return { a, c }
  },

  /** Donjon large flanqué de deux tours plus basses. */
  fortress(b, { x = 1560, floors = 5, side = 3, m = 'stone', top = 'wood', split = 2, s = 'stone', t = 24, h = 95, king = true, barrel = false }) {
    const l = b.tower(x - 270, { floors: side, mats: mix(m, top, split)(side), slab: s, t, h, roof: 'straw' })
    const k = b.tower(x, { floors, mats: mix(m, top, split)(floors), slab: s, w: 170, t, h, roof: 'wood' })
    const r = b.tower(x + 270, { floors: side, mats: mix(m, top, split)(side), slab: s, t, h, roof: 'straw' })
    b.target(l[side - 1])
    b.target(r[side - 1])
    b.target(l[0], 'knight')
    b.target(k[0], 'knight', -40)
    if (barrel) b.barrel(k[0], 40)
    else b.target(k[0], 'soldier', 40)
    for (let i = 1; i < floors; i++) b.target(k[i], king && i === floors - 1 ? 'king' : 'soldier')
    return { l, k, r }
  },

  /** Point de rupture : un château posé sur des pilotis fragiles. */
  stiltCastle(b, { x = 1520, legs = 3, legMat = 'glass', deck = 'stone', h = 130, floors = 3, m = 'brick', s = 'stone', twin = true, t = 24 }) {
    const w = twin ? 300 : 180
    const d = b.stilts(x, { legs, mat: legMat, deck, w, h, legW: 22, t })
    if (twin) {
      const a = b.tower(x - 85, { floors, mat: m, slab: s, w: 110, t, floorY: d.floorY })
      const c = b.tower(x + 85, { floors, mat: m, slab: s, w: 110, t, floorY: d.floorY })
      a.forEach((r, i) => b.target(r, i === 0 ? 'knight' : 'soldier'))
      c.forEach((r) => b.target(r))
    } else {
      const k = b.tower(x, { floors, mat: m, slab: s, w: 150, t, floorY: d.floorY, roof: 'wood' })
      k.forEach((r, i) => b.target(r, i === floors - 1 ? 'king' : 'soldier'))
    }
  },

  /** Tir en cloche : château au sommet d'un socle massif. */
  mesa(b, { x = 1600, baseW = 340, baseH = 160, baseMat = 'sandstone', floors = 3, m = 'sandstone', s = 'wood', t = 24, h = 95, annex = true }) {
    const top = b.base(x, { w: baseW, h: baseH, mat: baseMat, rows: Math.max(2, Math.round(baseH / 40)) })
    const k = b.tower(x - (annex ? 50 : 0), { floors, mat: m, slab: s, t, h, floorY: top, roof: 'wood' })
    k.forEach((r, i) => b.target(r, i === 0 ? 'knight' : 'soldier'))
    if (annex) {
      const a = b.tower(x + 110, { floors: Math.max(1, floors - 2), mat: 'wood', w: 90, floorY: top, roof: 'straw' })
      b.target(a[a.length - 1])
    }
  },

  /** Forteresse en escalier : chaque tour cache la suivante. */
  stairs(b, { x0 = 1280, step = 160, count = 5, start = 2, m = 'stone', top = 'wood', s = 'stone', t = 24, h = 92, king = true, powder = false }) {
    for (let i = 0; i < count; i++) {
      const floors = start + i
      const r = b.tower(x0 + i * step, { floors, mats: mix(m, top, 2)(floors), slab: s, w: 110, t, h, roof: i === count - 1 ? 'stone' : 'straw' })
      b.target(r[floors - 1], king && i === count - 1 ? 'king' : i % 2 ? 'knight' : 'soldier')
      if (floors >= 5) b.target(r[1])
      // Poudrière au pied des grandes tours (v3.7) : un point faible accessible
      // aussi aux tirs plongeants du trébuchet.
      if (powder && floors >= 5) b.barrel(r[0])
    }
  },

  /** Aqueduc : salles perchées sur des piliers, pilier central = point de rupture. */
  aqueduct(b, { x = 1550, span = 200, height = 240, pillar = 'stone', deck = 'wood', room = 'wood', vault = 'iron', piers = 3 }) {
    const xs = Array.from({ length: piers }, (_, i) => x - ((piers - 1) * span) / 2 + i * span)
    xs.forEach((px) => b.wall(px, { mat: pillar, w: 36, h: height, n: 4 }))
    const top = b.ground - height
    for (let i = 0; i < piers - 1; i++) {
      b.plank(xs[i], xs[i + 1], top, { mat: deck, t: 22 })
      const r = b.room((xs[i] + xs[i + 1]) / 2, top - 22, { mat: room, w: 120, h: 95 })
      b.target(r, 'soldier', -20)
      b.target(r, i % 2 ? 'knight' : 'soldier', 25)
    }
    b.target(b.room(xs[0] + span / 2, b.ground, { mat: 'stone', slab: vault, w: 120, t: 24 }), 'knight')
  },

  /** Crypte blindée sous une salle fragile : il faut ouvrir par le haut. */
  crypt(b, { x = 1520, vault = 'iron', hall = 'wood', floors = 3, barrels = 3, side = true, sideMat = 'stone' }) {
    const cellar = b.room(x, b.ground, { mat: vault, slab: 'stone', w: 190, t: 26 })
    for (let i = 0; i < barrels; i++) b.barrel(cellar, -50 + (100 * i) / Math.max(1, barrels - 1))
    const up = b.tower(x, { floors, mat: hall, w: 170, floorY: cellar.topY, roof: 'wood' })
    b.target(up[0], 'knight', -35)
    b.target(up[0], 'soldier', 35)
    for (let i = 1; i < floors; i++) b.target(up[i], i === floors - 1 ? 'king' : 'soldier')
    if (side) b.tower(x + 290, { floors: 2, mat: sideMat, slab: 'iron', t: 26 }).forEach((r, i) => b.target(r, i ? 'soldier' : 'knight'))
  },

  /** Dominos : tours serrées, la première entraîne les autres. */
  dominoes(b, { x0 = 1260, gap = 140, count = 5, floors = 4, m = 'brick', s = 'wood', w = 100, h = 100 }) {
    for (let i = 0; i < count; i++) {
      const r = b.tower(x0 + i * gap, { floors, mat: m, slab: s, w, h, roof: 'straw' })
      b.target(r[floors - 1])
      if (i % 2) b.target(r[0])
    }
  },

  /** Poudrière : barils au pied d'une haute tour, tout saute si on les atteint. */
  magazine(b, { x = 1500, floors = 6, m = 'brick', s = 'stone', barrels = 2, w = 140 }) {
    const t = b.tower(x, { floors, mats: ['wood', ...Array(floors - 1).fill(m)], slab: s, w, t: 24, h: 92, roof: 'wood' })
    for (let i = 0; i < barrels; i++) b.barrel(t[0], -26 + (52 * i) / Math.max(1, barrels - 1))
    t.slice(1).forEach((r) => b.target(r))
  },

  /** Pont-levis : une salle suspendue entre deux tours. */
  drawbridge(b, { x = 1550, gap = 400, floors = 4, m = 'stone', s = 'iron', hall = 'wood', t = 26 }) {
    const a = b.tower(x - gap / 2, { floors, mat: m, slab: s, t })
    const c = b.tower(x + gap / 2, { floors, mat: m, slab: s, t })
    b.plank(x - gap / 2, x + gap / 2, a[floors - 1].topY, { mat: 'wood', t: 22 })
    const r = b.room(x, a[floors - 1].topY - 22, { mat: hall, w: 150, h: 95 })
    b.target(r, 'knight', -30)
    b.target(r, 'soldier', 30)
    b.target(a[1])
    b.target(c[0], 'knight')
    b.target(c[floors - 2])
  },

  /** Hameau : maisons dispersées (mitraille, feu). */
  hamlet(b, { x0 = 1240, gap = 165, count = 6, m = 'wood', roof = 'straw' }) {
    for (let i = 0; i < count; i++) {
      const h = b.tower(x0 + i * gap, { floors: 1 + (i % 3 === 1 ? 1 : 0), mat: m, w: 100, roof })
      b.target(h[h.length - 1])
    }
  },

  /** Rempart crénelé : salles basses en enfilade sous une longue galerie. */
  rampart(b, { x0 = 1300, rooms = 4, w = 130, m = 'brick', s = 'stone', gallery = 'wood', t = 24 }) {
    const rs = []
    for (let i = 0; i < rooms; i++) rs.push(b.room(x0 + i * (w + 10), b.ground, { mat: m, slab: s, w, t }))
    for (let i = 0; i < rooms - 1; i++) b.plank(rs[i].x, rs[i + 1].x, rs[0].topY, { mat: gallery })
    rs.forEach((r, i) => b.target(r, i % 2 ? 'knight' : 'soldier'))
    for (let i = 0; i < rooms - 1; i++) b.target(b.spot((rs[i].x + rs[i + 1].x) / 2, rs[0].topY - 20))
  },
}
