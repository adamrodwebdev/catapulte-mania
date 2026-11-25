/**
 * Charge un script tiers (SDK de portail) une seule fois, avec délai maximal.
 * Seules les adresses https listées dans SDK_URLS sont acceptées ; la CSP du
 * build du portail n'autorise de toute façon que ces domaines pour les scripts.
 *
 * v6.4 : le build d'un portail ne garde que l'adresse de son propre SDK (les
 * autres se replient en chaîne vide au build) : aucune adresse d'un autre portail
 * dans le code livré. Hors build (tests), toutes sont présentes.
 */
export const SDK_URLS = Object.freeze({
  crazygames: typeof __TARGET__ === 'undefined' || __TARGET__ === 'crazygames' ? 'https://sdk.crazygames.com/crazygames-sdk-v3.js' : '',
  poki: typeof __TARGET__ === 'undefined' || __TARGET__ === 'poki' ? 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js' : '',
  gamedistribution: typeof __TARGET__ === 'undefined' || __TARGET__ === 'gamedistribution' ? 'https://html5.api.gamedistribution.com/main.min.js' : '',
  gamepix: typeof __TARGET__ === 'undefined' || __TARGET__ === 'gamepix' ? 'https://integration.gamepix.com/sdk/v3/gamepix.sdk.js' : '',
  y8: typeof __TARGET__ === 'undefined' || __TARGET__ === 'y8' ? 'https://cdn.y8.com/minimal-sdk/2-0/y8.min.js' : '',
  playgama: typeof __TARGET__ === 'undefined' || __TARGET__ === 'playgama' ? 'https://bridge.playgama.com/v2/stable/playgama-bridge.js' : '',
})

const loading = new Map()

/**
 * @param {string} url une des valeurs de SDK_URLS
 * @param {number} [timeoutMs]
 * @returns {Promise<void>}
 */
export function loadScript(url, timeoutMs = 8000) {
  if (!url || !Object.values(SDK_URLS).includes(url)) return Promise.reject(new Error('script not allowed'))
  if (!loading.has(url)) {
    const p = new Promise((resolve, reject) => {
      const el = document.createElement('script')
      el.src = url
      el.async = true
      const timer = setTimeout(() => reject(new Error('sdk timeout')), timeoutMs)
      el.onload = () => {
        clearTimeout(timer)
        resolve()
      }
      el.onerror = () => {
        clearTimeout(timer)
        reject(new Error('sdk blocked'))
      }
      document.head.append(el)
    })
    p.catch(() => loading.delete(url))
    loading.set(url, p)
  }
  return loading.get(url)
}
