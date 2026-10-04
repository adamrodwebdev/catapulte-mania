/**
 * Génère le service worker (sw.js) de la version complète.
 *
 * Rôle : rendre le jeu jouable hors-ligne après une première visite (PWA).
 * Stratégie :
 *  - à l'installation, met en cache la page et tous les fichiers du build
 *    (leurs noms contiennent une empreinte : un fichier modifié = un nouveau nom) ;
 *  - ensuite « cache d'abord » pour ces fichiers, et « réseau d'abord » pour la page
 *    afin de toujours proposer la dernière version quand on est en ligne ;
 *  - les anciens caches sont supprimés à l'activation d'une nouvelle version.
 * Aucune requête vers un autre domaine n'est interceptée.
 *
 * @param {string[]} files chemins relatifs à la racine du site
 * @param {string} version identifiant unique de la build
 * @returns {string}
 */
export function buildServiceWorker(files, version) {
  const list = JSON.stringify(['./', ...files.filter((f) => typeof f === 'string' && !f.endsWith('.map'))])
  return `/* Catapulte Mania – service worker ${version} (généré au build) */
const CACHE = 'ctc-${version}'
const PRECACHE = ${list}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ctc-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('./', copy))
          return res
        })
        .catch(() => caches.match('./')),
    )
    return
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)))
})
`
}

/** Fichiers du dossier public/ à mettre en cache hors-ligne. */
export const PUBLIC_PRECACHE = [
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'og-image.png',
]
