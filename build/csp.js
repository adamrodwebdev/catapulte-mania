/**
 * Content-Security-Policy appliquée en production.
 * Aucune exécution de code dynamique (pas de 'unsafe-eval'), aucun script tiers,
 * aucune connexion réseau sortante : le jeu fonctionne entièrement dans le navigateur.
 * @param {{ scriptSrc?: string[], styleSrc?: string[] }} [options]
 * @returns {string}
 */
export function buildCsp({ scriptSrc = ["'self'"], styleSrc = ["'self'"] } = {}) {
  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    `style-src ${styleSrc.join(' ')}`,
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self' data: blob:",
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ')
}
