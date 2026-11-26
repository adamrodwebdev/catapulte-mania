import { orElse, readText } from '../src/core/utils/input.js'
import { TEXT_LIMITS } from '../src/config/limits.js'

/** Adresse publique par défaut (fichier .env absent lors d'un déploiement). */
export const DEFAULT_SITE_URL = 'https://catapulte-mania.netlify.app'
/** Une adresse https, sans espace, guillemet, chevron, accent grave ni barre oblique inverse. */
const SITE_URL = /^https:\/\/[^\s"'<>\\`]+$/

/**
 * VITE_SITE_URL lue à la porte (v6.3.1) : elle est écrite telle quelle dans
 * index.html (balise canonique, Open Graph, JSON-LD), le plan du site et
 * robots.txt. Absente : l'adresse par défaut ; mal formée : le build s'arrête
 * plutôt que de publier une page cassée.
 * @param {unknown} value
 * @returns {string}
 */
export function readSiteUrl(value) {
  if (value === undefined || value === '') return DEFAULT_SITE_URL
  const url = orElse(() => readText(value, { maxLength: TEXT_LIMITS.siteUrl, required: true, pattern: SITE_URL }, 'VITE_SITE_URL'), null)
  if (url === null) throw new Error(`VITE_SITE_URL invalide : une adresse https de ${TEXT_LIMITS.siteUrl} caractères au plus (ex. ${DEFAULT_SITE_URL}).`)
  return url
}
