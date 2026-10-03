/**
 * Content-Security-Policy appliquée en production.
 * Notre site : aucune exécution de code dynamique (pas de 'unsafe-eval'), aucun
 * script tiers, aucune connexion réseau sortante. Les builds de portail ont leur
 * propre politique (voir buildPortalCsp).
 * @param {{ scriptSrc?: string[], styleSrc?: string[] }} [options]
 * @returns {string}
 */
export function buildCsp({ scriptSrc = ["'self'"], styleSrc = ["'self'"], target = 'web' } = {}) {
  if (target !== 'web') return buildPortalCsp(target)
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

/** Domaine du SDK de chaque portail (seuls scripts tiers autorisés à démarrer). */
export const PORTAL_SDK_ORIGINS = Object.freeze({
  crazygames: 'https://sdk.crazygames.com',
  poki: 'https://game-cdn.poki.com',
})

/**
 * CSP des builds de portail (v3.5).
 *
 * Les régies publicitaires des portails chargent leurs propres scripts, cadres,
 * styles en ligne et vidéos depuis de nombreux domaines : on les autorise en
 * HTTPS uniquement. Restent interdits : eval, plugins (object), changement de
 * <base> et envoi de formulaires. Notre site (cible « web ») garde la CSP stricte.
 * @param {string} target 'crazygames' | 'poki'
 */
export function buildPortalCsp(target) {
  const sdk = PORTAL_SDK_ORIGINS[target]
  if (!sdk) throw new Error(`unknown target "${target}"`)
  return [
    "default-src 'self'",
    `script-src 'self' ${sdk} https:`,
    "style-src 'self' 'unsafe-inline' https:",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "connect-src 'self' https: wss:",
    "media-src 'self' data: blob: https:",
    "frame-src https:",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ')
}
