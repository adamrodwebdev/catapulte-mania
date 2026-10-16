/**
 * Les donjons des généraux (v6.0) : deuxième étape des grands sièges de fin
 * de chapitre (niveaux 50 à 100 ; ceux des niveaux 10 à 40 sont décrits avec
 * leur niveau dans levelSpecs.js).
 *
 * Chaque plan pose le général là où on le voit, une garde réduite, et un point
 * faible lisible. Le terrain du niveau reste en place : `floorAt(x)` donne le
 * dessus du plateau de roche (ou le sol) à cette abscisse.
 */
export const GK = {
  /** Le ponton du baron Fangebourbe : longue plate-forme sur pilotis, sa cabane au bout (il s'y replie). */
  jetty(b, floorAt) {
    const deck = b.stilts(1650, { legs: 4, mat: 'wood', deck: 'wood', w: 460, h: 110, floorY: floorAt(1650) })
    const hut = b.room(1822, deck.floorY, { mat: 'brick', slab: 'wood', w: 128, h: 95 })
    b.general(b.spot(1480, deck.floorY), 'anselme')
    b.target(hut, 'knight')
    b.target(b.spot(1822, hut.topY), 'soldier')
  },

  /** Le fort des mercenaires d'Ilsa : deux tours de grès reliées par un chemin de ronde. */
  mercenaries(b) {
    const l = b.tower(1500, { floors: 2, mat: 'sandstone', slab: 'wood', w: 130, t: 22 })
    const r = b.tower(1820, { floors: 2, mat: 'sandstone', slab: 'wood', w: 130, t: 22 })
    const top = l[1].topY
    b.plank(1500, 1820, top, { mat: 'wood' })
    b.general(b.spot(1660, top - 20), 'ilsa')
    b.target(l[0], 'scout')
    b.target(r[1], 'scout')
    b.target(r[0], 'soldier')
  },

  /** L'aire du fauconnier : une haute tour de pierre sur le plateau, Hugues tout en haut. */
  eyrie(b, floorAt) {
    const k = b.tower(1720, { floors: 4, mats: ['stone', 'stone', 'wood', 'wood'], slab: 'stone', w: 150, h: 92, t: 22, roof: 'wood', floorY: floorAt(1720) })
    b.target(k[0], 'knight')
    b.target(k[1], 'soldier')
    b.general(k[3], 'hugues')
  },

  /** Le palais du margrave : marbre et glace sur le plateau gelé, deux chevaliers à la porte. */
  frostPalace(b, floorAt) {
    const k = b.tower(1760, { floors: 3, mats: ['marble', 'ice', 'ice'], slab: 'stone', w: 210, t: 24, roof: 'wood', floorY: floorAt(1760) })
    b.target(k[0], 'knight', -45)
    b.target(k[0], 'knight', 45)
    b.general(k[1], 'ulric')
    b.target(k[2], 'soldier')
  },

  /** La tour de l'orage : brique et fer, un ogre en bas, Baudouin au troisième étage. */
  stormTower(b, floorAt) {
    const k = b.tower(1760, { floors: 4, mats: ['brick', 'brick', 'iron', 'iron'], slab: 'iron', w: 160, t: 24, h: 94, roof: 'wood', floorY: floorAt(1760) })
    b.target(k[0], 'ogre')
    b.target(k[1], 'knight')
    b.general(k[2], 'baudouin')
    b.target(k[3], 'soldier')
  },

  /** La barbacane du Trône : deux tours de marbre et un chemin de ronde de fer. */
  barbican(b, floorAt) {
    const y = floorAt(1750)
    const l = b.tower(1600, { floors: 3, mat: 'marble', slab: 'marble', w: 130, t: 22, floorY: y })
    const r = b.tower(1900, { floors: 3, mat: 'marble', slab: 'marble', w: 130, t: 22, floorY: y })
    const top = l[2].topY
    b.plank(1600, 1900, top, { mat: 'iron' })
    b.target(l[0], 'knight')
    b.target(r[0], 'knight')
    b.target(l[1], 'soldier')
    b.target(r[2], 'soldier')
    b.target(b.spot(1750, top - 20), 'shieldbearer')
  },

  /** La salle du trône : Mordrac et sa garde, sous la galerie de son étendard. */
  throneRoom(b, floorAt) {
    const hall = b.room(1780, floorAt(1780), { mat: 'marble', slab: 'marble', w: 380, h: 112, t: 26 })
    const gallery = b.room(1780, hall.topY, { mat: 'iron', slab: 'marble', w: 220, h: 96, t: 24 })
    b.roof(1780, gallery.topY, { mat: 'iron', w: 240 })
    b.general(hall, 'mordrac', 60)
    b.target(hall, 'shieldbearer', -40)
    b.target(gallery, 'bannerman')
  },
}
