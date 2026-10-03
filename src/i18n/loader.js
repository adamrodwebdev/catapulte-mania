/**
 * Chargement des dictionnaires à la demande (v3.5).
 *
 * Chaque langue est un fichier JavaScript séparé (« chunk ») : le joueur ne
 * télécharge que la sienne, et les autres seulement s'il change de langue.
 * Le build de démo (fichier unique) les intègre toutes.
 */
const LOADERS = Object.freeze({
  fr: () => import('./fr.js'),
  en: () => import('./en.js'),
  id: () => import('./id.js'),
})

/** Nom de chaque langue dans sa propre langue (sélecteur). */
export const LANGUAGE_NAMES = Object.freeze({ fr: 'Français', en: 'English', id: 'Bahasa Indonesia' })

/**
 * @param {string} locale
 * @returns {Promise<object>} le dictionnaire (gelé)
 */
export async function loadDictionary(locale) {
  if (!Object.hasOwn(LOADERS, locale)) throw new Error(`unknown locale "${locale}"`)
  const mod = await LOADERS[locale]()
  return Object.freeze(mod.default)
}
