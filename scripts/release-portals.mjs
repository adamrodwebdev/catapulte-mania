/**
 * Paquets d'envoi pour les cinq portails retenus (v5.6) :
 *   npm run release:portals
 *   npm run release:portals -- --gd-id <gameId GameDistribution> --y8-game <Game ID Y8> --y8-app <App ID Y8>
 *
 * Pour chaque portail, le dossier release/<portail>/ contient :
 *   - <portail>-game.zip : le jeu (index.html à la racine), prêt à téléverser ;
 *   - les images de la fiche aux formats du portail (docs/store/portals/) ;
 *   - les captures de jeu communes ;
 *   - LISTING.md : les textes de la fiche et la marche à suivre.
 *
 * GameDistribution et Y8 donnent leurs identifiants dans leur tableau de bord,
 * APRÈS la création du jeu : relancer alors la commande avec ces identifiants.
 * Sans eux, le jeu est construit sans publicité pour ces deux portails.
 */
import { execSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateRawSync } from 'node:zlib'

const args = process.argv.slice(2)
const arg = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : '')
const ID = /^[\w-]{1,64}$/
const ids = { gd: arg('--gd-id'), y8Game: arg('--y8-game'), y8App: arg('--y8-app') }
for (const [k, v] of Object.entries(ids)) if (v && !ID.test(v)) throw new Error(`identifiant invalide (${k})`)

/** Portail → cible de build et variables d'environnement. */
const PLATFORMS = [
  { id: 'itchio', target: 'standalone', env: {} },
  { id: 'newgrounds', target: 'standalone', env: {} },
  { id: 'gamedistribution', target: 'gamedistribution', env: { CTC_GAME_ID: ids.gd } },
  { id: 'gamepix', target: 'gamepix', env: {} },
  { id: 'y8', target: 'y8', env: { CTC_GAME_ID: ids.y8Game, CTC_APP_ID: ids.y8App } },
]

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT = join(ROOT, 'release')
const STORE = join(ROOT, 'docs/store/portals')

/* ---------- Zip minimal (sans dépendance) ---------- */
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function zipDir(dir, file) {
  const files = []
  const walk = (d) => readdirSync(d).forEach((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : files.push(join(d, f))))
  walk(dir)
  const chunks = []
  const central = []
  let offset = 0
  for (const f of files.sort()) {
    const name = Buffer.from(relative(dir, f).split('\\').join('/'))
    const data = readFileSync(f)
    const packed = deflateRawSync(data, { level: 9 })
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6) // noms en UTF-8
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(packed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    chunks.push(local, name, packed)
    const head = Buffer.alloc(46)
    head.writeUInt32LE(0x02014b50, 0)
    head.writeUInt16LE(20, 4)
    head.writeUInt16LE(20, 6)
    head.writeUInt16LE(0x0800, 8)
    head.writeUInt16LE(8, 10)
    head.writeUInt32LE(crc, 16)
    head.writeUInt32LE(packed.length, 20)
    head.writeUInt32LE(data.length, 24)
    head.writeUInt16LE(name.length, 28)
    head.writeUInt32LE(offset, 42)
    central.push(head, name)
    offset += 30 + name.length + packed.length
  }
  const cd = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  writeFileSync(file, Buffer.concat([...chunks, cd, end]))
  return files.length
}

/* ---------- Construction ---------- */
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const built = new Map()
for (const p of PLATFORMS) {
  const key = `${p.target}:${JSON.stringify(p.env)}`
  if (!built.has(key)) {
    console.log(`→ build ${p.target}`)
    execSync(`npx vite build --mode ${p.target}`, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...p.env } })
    const snapshot = join(OUT, `.build-${built.size}`)
    cpSync(join(ROOT, `dist-${p.target}`), snapshot, { recursive: true })
    // Fichiers propres à notre site (hébergeur, application installable, fiche) : inutiles sur un portail.
    for (const f of ['_headers', 'manifest.webmanifest', 'og-image.png', 'screenshots']) rmSync(join(snapshot, f), { recursive: true, force: true })
    built.set(key, snapshot)
  }
  const dir = join(OUT, p.id)
  mkdirSync(dir, { recursive: true })
  const n = zipDir(built.get(key), join(dir, `${p.id}-game.zip`))
  if (existsSync(join(STORE, p.id))) cpSync(join(STORE, p.id), join(dir, 'images'), { recursive: true })
  cpSync(join(STORE, 'screenshots'), join(dir, 'screenshots'), { recursive: true })
  if (existsSync(join(STORE, 'LISTINGS', `${p.id}.md`))) cpSync(join(STORE, 'LISTINGS', `${p.id}.md`), join(dir, 'LISTING.md'))
  const kb = Math.round(statSync(join(dir, `${p.id}-game.zip`)).size / 1024)
  const missing = (p.id === 'gamedistribution' && !ids.gd) || (p.id === 'y8' && !ids.y8Game) ? ' — SANS identifiant : publicité désactivée' : ''
  console.log(`✓ ${p.id} : ${n} fichiers, ${kb} Ko${missing}`)
}
for (const d of built.values()) rmSync(d, { recursive: true, force: true })
console.log(`\nPaquets prêts dans ${relative(process.cwd(), OUT) || OUT}/`)
