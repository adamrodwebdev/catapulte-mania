/**
 * Mises en forme partagées de l'interface (v6.2) : vitesse du vent, angle et
 * puissance de la visée, date d'un défi du jour. Fonctions pures : elles
 * reçoivent la traduction (`t`) ou la mise en forme des dates (`d`) du
 * contexte applicatif. Les unités sont des textes traduits (`units.*`) : chaque
 * langue écrit la sienne (« 75 % » en français, « 75% » en anglais).
 */

/** Vent du moteur → km/h, quand le HUD ne donne pas la vitesse (la session la calcule, voir GameSession). */
export const KMH_PER_WIND = 30

/**
 * Vitesse du vent en km/h : celle du HUD, sinon déduite de la force du vent.
 * @param {{ windKmh?: number } | null | undefined} hud
 * @param {number} wind force du vent (négative vers la gauche)
 */
export function windKmh(hud, wind) {
  return hud?.windKmh ?? Math.round(Math.abs(wind) * KMH_PER_WIND)
}

/** « 12 km/h » dans la langue du joueur. */
export function formatKmh(t, kmh) {
  return t('units.kmh', { value: kmh })
}

/*
 * Angle et puissance (demi-degrés, demi-points) : le nombre passe par Intl dans
 * la langue du joueur, comme tous les nombres (« 45,5° » en français, « 45.5° »
 * en anglais) ; l'unité suit la typographie de chaque langue.
 */

/** « 45° » (angle de visée). */
export function formatDegrees(t, value) {
  return t('units.degrees', { value })
}

/** « 75 % » (puissance du tir). */
export function formatPercent(t, value) {
  return t('units.percent', { value })
}

/**
 * Vent lu aux lecteurs d'écran : vitesse réelle, sens, et rafales en Difficile.
 * @param {(key: string, params?: object) => string} t
 * @param {{ windKmh?: number, windDynamic?: boolean } | null | undefined} hud
 * @param {number} wind force du vent (négative vers la gauche)
 */
export function windText(t, hud, wind) {
  const kmh = windKmh(hud, wind)
  if (!kmh) return t('game.windCalm')
  const base = `${formatKmh(t, kmh)} ${wind < 0 ? t('a11y.windLeft') : t('a11y.windRight')}`
  return hud?.windDynamic ? `${base}, ${t('a11y.windGusty')}` : base
}

/**
 * Date lisible d'un défi du jour (« vendredi 16 octobre »), ou la clé brute si
 * elle est illisible.
 * @param {(date: Date, options: Intl.DateTimeFormatOptions) => string} d
 * @param {string} key AAAA-MM-JJ
 */
export function formatDayKey(d, key) {
  const [y, m, day] = key.split('-').map(Number)
  try {
    return d(new Date(y, m - 1, day), { weekday: 'long', day: 'numeric', month: 'long' })
  } catch {
    return key
  }
}
