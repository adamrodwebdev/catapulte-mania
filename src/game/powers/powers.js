import { Power } from './Power.js'

/** Accalmie : le vent tombe pour ce tir. */
export class CalmPower extends Power {
  constructor() {
    super({ id: 'calm', unlockAfter: 4, cost: 150, icon: 'wind' })
  }
  modifyShot(shot) {
    shot.windOverride = 0
  }
}

/** Force du Titan : projectile 2,2 fois plus lourd. */
export class TitanPower extends Power {
  constructor() {
    super({ id: 'titan', unlockAfter: 7, cost: 250, icon: 'fist' })
  }
  modifyShot(shot) {
    shot.mods.massFactor = 2.2
  }
}

/** Feu grégeois : le projectile enflamme ce qu'il touche. */
export class GreekFirePower extends Power {
  constructor() {
    super({ id: 'greekfire', unlockAfter: 15, cost: 200, icon: 'flame' })
  }
  modifyShot(shot) {
    shot.mods.ignites = true
  }
}

/** Salve : trois projectiles tirés en éventail. */
export class VolleyPower extends Power {
  constructor() {
    super({ id: 'volley', unlockAfter: 18, cost: 350, icon: 'volley' })
  }
  modifyShot(shot) {
    shot.count = 3
  }
}

/** Charge de poudre : le projectile explose à l'impact. */
export class PowderPower extends Power {
  constructor() {
    super({ id: 'powder', unlockAfter: 21, cost: 300, icon: 'bomb' })
  }
  modifyShot(shot) {
    shot.mods.explodes = true
  }
}

/** Séisme : la terre tremble immédiatement et ébranle les structures. */
export class QuakePower extends Power {
  constructor() {
    super({ id: 'quake', unlockAfter: 30, cost: 400, icon: 'quake', immediate: true })
  }
  activate(session) {
    session.world.quake(1)
  }
}
