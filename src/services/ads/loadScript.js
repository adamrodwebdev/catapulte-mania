/**
 * Charge un script tiers (SDK de portail) une seule fois, avec délai maximal.
 * Seules les adresses https listées dans SDK_URLS sont acceptées ; la CSP du
 * build du portail n'autorise de toute façon que ces domaines pour les scripts.
 */
export const SDK_URLS = Object.freeze({
  crazygames: 'https://sdk.crazygames.com/crazygames-sdk-v3.js',
  poki: 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js',
  gamedistribution: 'https://html5.api.gamedistribution.com/main.min.js',
  gamepix: 'https://integration.gamepix.com/sdk/v3/gamepix.sdk.js',
  y8: 'https://cdn.y8.com/minimal-sdk/2-0/y8.min.js',
})

const loading = new Map()

/**
 * @param {string} url une des valeurs de SDK_URLS
 * @param {number} [timeoutMs]
 * @returns {Promise<void>}
 */
export function loadScript(url, timeoutMs = 8000) {
  if (!Object.values(SDK_URLS).includes(url)) return Promise.reject(new Error('script not allowed'))
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
