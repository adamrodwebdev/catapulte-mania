import { Power } from './Power.js'

/*
 * Pouvoirs spéciaux (v5.0, refonte) : chacun change la façon de jouer le tour,
 * pas seulement un chiffre. Un pouvoir par tour, payé en points.
 *
 *  Œil du faucon  → on VOIT où tombera le tir (trajectoire complète) et le vent tombe ;
 *  Force du Titan → un boulet géant qui perce les murs de pierre ;
 *  Pierre d'aimant → le tir s'infléchit en vol vers le défenseur le plus proche ;
 *  Météore        → touchez l'écran en vol : le projectile pique à la verticale et
 *                   pulvérise ce qu'il frappe (onde de choc) ;
 *  Pluie de feu   → cinq pots de feu grégeois en éventail ;
 *  Foudre         → trois éclairs s'abattent aussitôt sur les points les plus hauts ;
 *  Séisme         → la terre tremble aussitôt sous le château.
 */

/** Œil du faucon : trajectoire entière affichée pour ce tir, et plus un souffle de vent. */
export class FalconPower extends Power {
  constructor() {
    super({ id: 'falcon', unlockAfter: 5, cost: 120, icon: 'eye' })
  }
  modifyShot(shot) {
    shot.windOverride = 0
  }
}

/** Force du Titan : boulet géant (1,6 fois plus grand) et plus lourd. */
export class TitanPower extends Power {
  constructor() {
    super({ id: 'titan', unlockAfter: 8, cost: 200, icon: 'fist' })
  }
  modifyShot(shot) {
    shot.mods.massFactor = 1.4
    shot.mods.radiusFactor = 1.6
  }
}

/** Pierre d'aimant : le projectile est attiré par le défenseur le plus proche. */
export class LodestonePower extends Power {
  constructor() {
    super({ id: 'lodestone', unlockAfter: 11, cost: 250, icon: 'magnet' })
  }
  modifyShot(shot) {
    shot.mods.homing = true
  }
}

/** Météore : en vol, un toucher fait piquer le projectile, qui explose en onde de choc. */
export class MeteorPower extends Power {
  constructor() {
    super({ id: 'meteor', unlockAfter: 15, cost: 250, icon: 'meteor' })
  }
  modifyShot(shot) {
    shot.mods.dive = true
  }
}

/** Pluie de feu : cinq pots de feu grégeois en éventail. */
export class FirestormPower extends Power {
  constructor() {
    super({ id: 'firestorm', unlockAfter: 19, cost: 350, icon: 'flame' })
  }
  modifyShot(shot) {
    shot.count = 5
    shot.mods.ignites = true
  }
}

/** Foudre : trois éclairs frappent aussitôt les points les plus hauts du château. */
export class LightningPower extends Power {
  constructor() {
    super({ id: 'lightning', unlockAfter: 24, cost: 400, icon: 'bolt', immediate: true })
  }
  activate(session) {
    session.world.lightning(3)
  }
}

/** Séisme : la terre tremble immédiatement et ébranle les structures. */
export class QuakePower extends Power {
  constructor() {
    super({ id: 'quake', unlockAfter: 30, cost: 300, icon: 'quake', immediate: true })
  }
  activate(session) {
    session.world.quake(1.25)
  }
}
