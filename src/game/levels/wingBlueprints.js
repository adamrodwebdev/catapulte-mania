/**
 * Plans des ailes (v6.2) : l'annexe accolée au château, et son défenseur. Les
 * règles (laquelle, à partir de quel niveau, sa largeur au sol) sont dans
 * campaignRules.js (WINGS) ; le placement, dans LevelCurve.js.
 *
 * Chaque plan bâtit sur `surface`, centré en `x`, et loge un défenseur `type`.
 * Le baril perché renvoie la place de son garde (au pied du mur, côté château),
 * que l'appelant ajoute avec les autres gardes.
 */
import { TARGET_TYPES } from '../entities/catalog.js'

/** @type {Readonly<Record<string, (b: import('./StructureBuilder.js').StructureBuilder, x: number, surface: number, type: string, side: number) => ({ x: number, y: number } | void)>>} */
export const WING_BUILDERS = Object.freeze({
  // Remise de paille : le feu y prend d'un coup.
  straw(b, x, surface, type) {
    const shed = b.room(x, surface, { mat: 'straw', slab: 'wood', w: 76, h: 70, t: 16 })
    b.roof(x, shed.topY, { mat: 'straw', w: 86, h: 40 })
    b.target(shed, type)
  },
  // Bastion de glace : le feu le fait fondre en vapeur brûlante, la bombe en éclats.
  ice(b, x, surface, type) {
    const low = b.room(x, surface, { mat: 'ice', w: 70, h: 64, t: 18 })
    b.target(b.spot(x, low.topY), type)
    b.block('ice', x - 26, low.topY - 20, 16, 40)
    b.block('ice', x + 26, low.topY - 20, 16, 40)
  },
  // Poudrière : deux barils derrière un mur de pierre, et leur gardien.
  powder(b, x, surface, type) {
    const vault = b.room(x, surface, { mat: 'stone', slab: 'wood', w: 90, h: 60, t: 18 })
    b.barrel(vault, -22)
    b.barrel(vault, 22)
    b.target(b.spot(x, vault.topY), type)
  },
  // Galerie de verre sur pilotis : la mitraille brise les pieds.
  glass(b, x, surface, type) {
    const deck = b.stilts(x, { legs: 2, mat: 'glass', deck: 'wood', w: 86, h: 84, legW: 14, floorY: surface })
    b.target(deck, type)
  },
  // Casemate de fer, son guetteur debout dessus : la foudre et le fer rougi le cueillent.
  iron(b, x, surface, type) {
    const box = b.room(x, surface, { mat: 'iron', w: 56, h: 56, t: 16 })
    b.target(b.spot(x, box.topY), type)
  },
  // Baril perché sur un mur, au bout de l'aile ; le garde à son pied, côté château :
  // la botte de paille fait tomber le baril sur lui.
  perch(b, x, surface, type, side) {
    const wx = x + side * 25
    const wall = b.wall(wx, { mat: 'stone', w: 32, h: 132, n: 4, floorY: surface })
    b.barrel(b.spot(wx, wall.topY))
    return { x: x - side * 25, y: surface - TARGET_TYPES[type].h / 2 - 1 }
  },
})
