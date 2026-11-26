/**
 * Nos propres composants (v6.4) : les fonds des chapitres et les portraits encodés ne sont plus dans ce
 * dépôt public (règle « nos composants restent les nôtres » du 26 novembre 2026). Ils sont dans le dépôt
 * privé adamrodwebdev/private-assets, dossier catapulte-mania/, aux mêmes chemins qu'ici ; cette étape les
 * copie à leur place avant la génération, le serveur de développement et les tests.
 *
 *   npm run assets         copie les fichiers de private-assets.lock.json (la génération et les tests le font)
 *   npm run assets:lock    épingle le commit actuel du dépôt privé (copie locale) et l'empreinte de chaque fichier
 *
 * Le verrou (public) donne le commit du dépôt privé et, pour chaque fichier, sa taille et son SHA-256. Un
 * fichier déjà en place et intact n'est pas relu. Sinon, dans l'ordre :
 *  1. une copie locale du dépôt privé : PRIVATE_ASSETS_DIR, ou un dossier private-assets/ voisin d'un
 *     dossier parent du dépôt (…/claude/private-assets), lu au commit épinglé (git show) ;
 *  2. l'API de GitHub au commit épinglé, avec le jeton en lecture seule PRIVATE_ASSETS_TOKEN (secret des
 *     Actions, variable de Netlify), ou hors de Netlify et de la CI `gh auth token`.
 * Un fichier manquant, une taille ou une empreinte fausse, ni copie ni jeton : la génération s'arrête et
 * nomme chaque problème. Le jeton n'est jamais écrit dans un journal.
 */
/* global fetch, AbortSignal -- globals of Node 18 and later */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, parse, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const LOCK_FILE = 'private-assets.lock.json'
export const REPOSITORY = 'adamrodwebdev/private-assets'
/** Le dossier du jeu dans le dépôt privé, qui en sert d'autres. */
export const FOLDER = 'catapulte-mania'
const LIMITS = Object.freeze({ lockBytes: 32 * 1024, fileBytes: 4 * 1024 * 1024, files: 64, pathChars: 1024 })
/** Les seuls chemins qu'un fichier privé peut prendre ici : une liste fermée. */
export const PRIVATE_PATH = /^(src\/game\/assets\/backgrounds\/chapter-(10|[1-9])(-lite)?\.webp|src\/game\/story\/portraits\.data\.js)$/
const COMMIT = /^[0-9a-f]{40}$/
const SHA256 = /^[0-9a-f]{64}$/
const TOKEN = /^[A-Za-z0-9_]{20,255}$/

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Le verrou, vérifié champ par champ : tout ce qui ne va pas est refusé. */
export function parseLock(text) {
  if (typeof text !== 'string' || text.length > LIMITS.lockBytes) throw new RangeError(`${LOCK_FILE} : plus de ${LIMITS.lockBytes} octets`)
  const lock = JSON.parse(text)
  if (!isPlainObject(lock)) throw new TypeError(`${LOCK_FILE} : un objet est attendu`)
  if (lock.repository !== REPOSITORY) throw new TypeError(`${LOCK_FILE} : dépôt inattendu`)
  if (lock.folder !== FOLDER) throw new TypeError(`${LOCK_FILE} : dossier inattendu`)
  if (typeof lock.commit !== 'string' || !COMMIT.test(lock.commit)) throw new TypeError(`${LOCK_FILE} : commit invalide`)
  if (!Array.isArray(lock.files) || lock.files.length === 0 || lock.files.length > LIMITS.files) {
    throw new RangeError(`${LOCK_FILE} : de 1 à ${LIMITS.files} fichiers`)
  }
  const seen = new Set()
  const files = lock.files.map((file, i) => {
    const where = `${LOCK_FILE}, fichier ${i + 1}`
    if (!isPlainObject(file)) throw new TypeError(`${where} : un objet est attendu`)
    const { path, size, sha256: hash } = file
    if (typeof path !== 'string' || !PRIVATE_PATH.test(path) || seen.has(path)) throw new TypeError(`${where} : chemin refusé`)
    if (!Number.isSafeInteger(size) || size < 1 || size > LIMITS.fileBytes) throw new RangeError(`${where} : taille hors limites`)
    if (typeof hash !== 'string' || !SHA256.test(hash)) throw new TypeError(`${where} : empreinte invalide`)
    seen.add(path)
    return Object.freeze({ path, size, sha256: hash })
  })
  return Object.freeze({ repository: lock.repository, folder: lock.folder, commit: lock.commit, files: Object.freeze(files) })
}

/** Un chemin venu de l'environnement : un vrai texte, sans caractère de contrôle, de longueur bornée. */
function envPath(value) {
  if (typeof value !== 'string' || value.length === 0) return null
  // eslint-disable-next-line no-control-regex
  if (value.length > LIMITS.pathChars || /[\u0000-\u001f\u007f]/.test(value)) throw new TypeError('PRIVATE_ASSETS_DIR refusé')
  return resolve(value)
}

const git = (dir, args, encoding = 'utf8') =>
  execFileSync('git', ['-C', dir, ...args], { encoding, maxBuffer: LIMITS.fileBytes + 1, stdio: ['ignore', 'pipe', 'ignore'] })

/** La copie locale du dépôt privé : la variable, sinon un dossier private-assets/ à côté d'un parent du dépôt. */
export function localCheckout(root, env) {
  const asked = envPath(env.PRIVATE_ASSETS_DIR)
  if (asked) return asked
  let dir = resolve(root)
  const top = parse(dir).root
  while (dir !== top) {
    const candidate = join(dirname(dir), 'private-assets')
    if (existsSync(join(candidate, '.git')) && existsSync(join(candidate, FOLDER))) return candidate
    dir = dirname(dir)
  }
  return null
}

/** Le jeton : la variable d'environnement, sinon (sur un poste, ni Netlify ni CI) celui de la commande gh. */
function token(env) {
  const raw = typeof env.PRIVATE_ASSETS_TOKEN === 'string' ? env.PRIVATE_ASSETS_TOKEN.trim() : ''
  if (raw) {
    if (!TOKEN.test(raw)) throw new TypeError('PRIVATE_ASSETS_TOKEN n’a pas la forme d’un jeton GitHub')
    return raw
  }
  if (env.NETLIFY === 'true' || env.CI === 'true') return null
  try {
    const fromGh = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000 }).trim()
    return TOKEN.test(fromGh) ? fromGh : null
  } catch {
    return null
  }
}

/** Lit un fichier au commit épinglé dans la copie locale. */
function fromCheckout(dir, commit) {
  try {
    git(dir, ['cat-file', '-e', `${commit}^{commit}`])
  } catch {
    throw new Error(`la copie locale ${dir} n'a pas le commit ${commit.slice(0, 12)} : git -C "${dir}" fetch`)
  }
  return async ({ path }) => git(dir, ['show', `${commit}:${FOLDER}/${path}`], 'buffer')
}

/** Lit un fichier au commit épinglé par l'API de GitHub (contenu brut), taille bornée avant lecture. */
function fromGitHub(secret, commit) {
  return async ({ path, size }) => {
    const url = `https://api.github.com/repos/${REPOSITORY}/contents/${FOLDER}/${path}?ref=${commit}`
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: 'application/vnd.github.raw+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'catapulte-mania-build',
      },
      signal: AbortSignal.timeout(30000),
    })
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error(`GitHub répond ${response.status} : le jeton doit lire ${REPOSITORY} (Contents : lecture seule)`)
    }
    const declared = response.headers.get('content-length')
    if (declared !== null && (!/^\d{1,10}$/.test(declared) || Number(declared) !== size)) {
      await response.body?.cancel()
      throw new Error(`${declared} octets annoncés, ${size} attendus`)
    }
    return readAtMost(response.body, size)
  }
}

/** Le corps d'une réponse, refusé dès qu'il dépasse `size` octets. */
async function readAtMost(body, size) {
  if (!body) return Buffer.alloc(0)
  const chunks = []
  let total = 0
  for await (const chunk of body) {
    total += chunk.length
    if (total > size) throw new RangeError(`plus de ${size} octets reçus`)
    chunks.push(chunk)
  }
  return Buffer.concat(chunks, total)
}

/** Copie chaque fichier du verrou à sa place. Renvoie la liste des problèmes (vide si tout est en place). */
export async function fetchPrivateAssets(root, { env = process.env, log = console.log } = {}) {
  const lock = parseLock(await readFile(join(root, LOCK_FILE), 'utf8'))
  const missing = []
  for (const file of lock.files) {
    const current = await readFile(join(root, file.path)).catch(() => null)
    if (!current || current.length !== file.size || sha256(current) !== file.sha256) missing.push(file)
  }
  if (missing.length === 0) {
    log(`✔ composants privés : ${lock.files.length} fichiers en place (${lock.commit.slice(0, 12)})`)
    return []
  }

  let read
  let source
  try {
    const checkout = localCheckout(root, env)
    if (checkout) {
      read = fromCheckout(checkout, lock.commit)
      source = `copie locale ${checkout}`
    } else {
      const secret = token(env)
      if (secret) {
        read = fromGitHub(secret, lock.commit)
        source = `GitHub (${REPOSITORY})`
      }
    }
  } catch (error) {
    return [error.message]
  }
  if (!read) {
    return [
      `${missing.length} fichier(s) privé(s) manquant(s), et ni copie locale ni jeton pour les lire :`,
      ...missing.map((file) => `  ${file.path}`),
      `En CI et sur Netlify : PRIVATE_ASSETS_TOKEN (jeton en lecture seule de ${REPOSITORY}).`,
      'Sur un poste : cloner le dépôt privé à côté du dossier du jeu, ou PRIVATE_ASSETS_DIR, ou gh auth login.',
    ]
  }

  const results = await Promise.all(missing.map(async (file) => {
    try {
      const bytes = await read(file)
      if (bytes.length !== file.size) return `${file.path} : ${bytes.length} octets, ${file.size} attendus`
      if (sha256(bytes) !== file.sha256) return `${file.path} : empreinte différente de celle du verrou`
      await mkdir(dirname(join(root, file.path)), { recursive: true })
      await writeFile(join(root, file.path), bytes)
      return null
    } catch (error) {
      return `${file.path} : ${error.message}`
    }
  }))
  const problems = results.filter(Boolean)
  if (problems.length === 0) log(`✔ composants privés : ${missing.length} fichier(s) copié(s) depuis ${source} (${lock.commit.slice(0, 12)})`)
  return problems
}

/** Épingle le commit actuel de la copie locale : chaque fichier permis du dossier du jeu, taille et empreinte. */
export async function writeLock(root, { env = process.env, log = console.log } = {}) {
  const dir = localCheckout(root, env)
  if (!dir) throw new Error('aucune copie locale du dépôt privé (dossier private-assets voisin ou PRIVATE_ASSETS_DIR)')
  // Ce que GitHub a (la branche suivie), pas le HEAD local : la copie est partagée entre les projets, et
  // un commit local d'un autre projet n'est pas encore lisible par la CI ni par Netlify.
  let commit
  try {
    commit = git(dir, ['rev-parse', '@{upstream}']).trim()
  } catch {
    throw new Error(`la copie locale ${dir} ne suit aucune branche de GitHub`)
  }
  const prefix = `${FOLDER}/`
  const paths = git(dir, ['ls-tree', '-r', '--name-only', commit, '--', FOLDER])
    .split('\n')
    .filter((p) => p.startsWith(prefix) && PRIVATE_PATH.test(p.slice(prefix.length)))
    .map((p) => p.slice(prefix.length))
    .sort()
  const files = paths.map((path) => {
    const bytes = git(dir, ['show', `${commit}:${prefix}${path}`], 'buffer')
    return { path, size: bytes.length, sha256: sha256(bytes) }
  })
  const text = `${JSON.stringify({ repository: REPOSITORY, folder: FOLDER, commit, files }, null, 2)}\n`
  parseLock(text)
  await writeFile(join(root, LOCK_FILE), text)
  log(`✔ ${LOCK_FILE} : ${files.length} fichiers au commit ${commit.slice(0, 12)}`)
}

/** Plugin Vite : la même vérification avant le serveur de développement et chaque génération. */
export function privateAssetsPlugin(root) {
  return {
    name: 'ctc-private-assets',
    async buildStart() {
      const problems = await fetchPrivateAssets(root)
      if (problems.length) this.error(`composants privés :\n  ${problems.join('\n  ')}`)
    },
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  try {
    if (process.argv.includes('--lock')) {
      await writeLock(root)
    } else {
      const problems = await fetchPrivateAssets(root)
      if (problems.length) {
        console.error(`✘ composants privés :\n  ${problems.join('\n  ')}`)
        process.exit(1)
      }
    }
  } catch (error) {
    console.error(`✘ composants privés : ${error.message}`)
    process.exit(1)
  }
}
