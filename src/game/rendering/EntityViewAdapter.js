/**
 * Adaptateurs de vue des entités (v6.2, sortis du Renderer) : ce que le dessin
 * de chaque sorte d'entité lit d'elle (`extra` de l'état de dessin, voir
 * AssetRegistry). Les règles (sonné, empoisonné, trempé…) sont celles des
 * entités ; ici, on ne fait que les traduire pour le dessin.
 *
 * Le premier adaptateur qui s'applique l'emporte : défenseur, créature volante,
 * ouvrage, roche du décor ; aucune donnée en plus pour les autres.
 */
const VIEWS = [
  {
    applies: (e) => e.kind === 'target',
    extra: (e, f) => ({
      hurt: e.hurtMs > 0 || e.damageRatio > 0.6, team: e.team, still: f.animate === false, alert: f.alert, frozen: e.frozenMs > 0, walking: e.walking && e.frozenMs <= 0, facing: e.facing,
      swing: f.worldTime - (e.swatAt ?? -Infinity), torch: e.torch, sprinting: e.sprinting && e.walking, working: e.working, aura: e.aura > 1, raid: e.raid,
      climbing: Boolean(e.climbing), general: e.generalId, order: f.worldTime - (e.orderAt ?? -Infinity),
      // v6.1 : il repousse (ms depuis le geste), bras levés, sonné ou électrisé, empoisonné.
      push: f.worldTime - (e.pushAt ?? -Infinity), brace: Boolean(e.bracing), stun: e.stunAt(f.worldTime),
      poisoned: e.poisonedAt(f.worldTime),
    }),
  },
  {
    applies: (e) => e.kind === 'flyer',
    extra: (e, f) => ({ flap: f.animate === false ? 0.25 : e.flap, facing: e.facing, carrying: e.carrying }),
  },
  {
    applies: (e) => e.prop,
    extra: (e, f) => ({ mill: e.mill?.angle ?? 0, frozen: e.frozenMs > 0, quenched: e.quenchedAt(f.worldTime), still: f.animate === false }),
  },
  {
    applies: (e) => e.material === 'rock',
    extra: (e, f) => ({ theme: f.theme }),
  },
]

/**
 * Données propres au dessin d'une entité, pour cette image.
 * @param {object} e entité
 * @param {{ time: number, worldTime: number, animate: boolean, alert: boolean, theme: number }} frame
 *   horloge de rendu, temps du monde, animations, projectile en vol (les défenseurs lèvent les yeux), chapitre
 * @returns {object | undefined}
 */
export function viewExtra(e, frame) {
  for (const v of VIEWS) if (v.applies(e)) return v.extra(e, frame)
  return undefined
}

/**
 * Vitesse (px par pas de 1/60 s) au-dessus de laquelle un carreau de baliste suit
 * sa course (v6.2). En vol, il va bien plus vite (14 au moins) ; en dessous, il
 * glisse, s'arrête ou tremble sur place : il garde son dernier cap.
 */
export const BOLT_STEER_SPEED = 6

/**
 * Cap affiché des carreaux de baliste (v6.2) : le sens de leur course, gardé
 * quand ils ne font plus que glisser ou trembler (hier, un carreau planté
 * oscillait au gré des rebonds infimes). Mémoire du rendu, par carreau.
 */
export class BoltHeadings {
  /** @type {WeakMap<object, number>} */
  #last = new WeakMap()

  /** Cap (radians) du carreau `e` pour cette image. */
  of(e) {
    const v = e.body.velocity
    if (!this.#last.has(e) || Math.hypot(v.x, v.y) > BOLT_STEER_SPEED) this.#last.set(e, Math.atan2(v.y, v.x))
    return this.#last.get(e)
  }
}
