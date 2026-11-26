/**
 * Composants privés (v6.4) : le verrou est lu champ par champ, et rien de ce qu'il liste ne peut
 * revenir par accident dans ce dépôt public.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { FOLDER, LOCK_FILE, PRIVATE_PATH, REPOSITORY, parseLock } from '../scripts/private-assets.mjs'

const ROOT = new URL('..', import.meta.url)
const real = readFileSync(new URL(LOCK_FILE, ROOT), 'utf8')
const file = (over = {}) => ({ path: 'src/game/assets/backgrounds/chapter-1.webp', size: 10, sha256: 'a'.repeat(64), ...over })
const lock = (over = {}) => JSON.stringify({ repository: REPOSITORY, folder: FOLDER, commit: 'b'.repeat(40), files: [file()], ...over })

test('le verrou du dépôt est valide et liste les fonds et les portraits', () => {
  const parsed = parseLock(real)
  const paths = parsed.files.map((f) => f.path)
  for (let n = 1; n <= 10; n++) {
    assert.ok(paths.includes(`src/game/assets/backgrounds/chapter-${n}.webp`), `chapitre ${n}`)
    assert.ok(paths.includes(`src/game/assets/backgrounds/chapter-${n}-lite.webp`), `chapitre ${n} (allégé)`)
  }
  assert.ok(paths.includes('src/game/story/portraits.data.js'))
})

test('chaque fichier du verrou est ignoré par git : il ne peut pas revenir dans le dépôt public', () => {
  for (const { path } of parseLock(real).files) {
    assert.doesNotThrow(() => execFileSync('git', ['check-ignore', '-q', path], { cwd: ROOT }), `${path} n'est pas ignoré`)
  }
})

test('le verrou refuse ce qui ne va pas', () => {
  const bad = [
    ['autre dépôt', lock({ repository: 'someone/else' })],
    ['autre dossier', lock({ folder: 'lumirift' })],
    ['commit court', lock({ commit: 'abc' })],
    ['aucun fichier', lock({ files: [] })],
    ['chemin hors liste', lock({ files: [file({ path: 'src/main.js' })] })],
    ['remontée de dossier', lock({ files: [file({ path: '../private-assets/catapulte-mania/x.webp' })] })],
    ['chemin absolu', lock({ files: [file({ path: '/etc/passwd' })] })],
    ['chapitre 11', lock({ files: [file({ path: 'src/game/assets/backgrounds/chapter-11.webp' })] })],
    ['doublon', lock({ files: [file(), file()] })],
    ['taille nulle', lock({ files: [file({ size: 0 })] })],
    ['taille texte', lock({ files: [file({ size: '10' })] })],
    ['taille énorme', lock({ files: [file({ size: 1e12 })] })],
    ['empreinte courte', lock({ files: [file({ sha256: 'abc' })] })],
    ['empreinte majuscule', lock({ files: [file({ sha256: 'A'.repeat(64) })] })],
    ['tableau', '[]'],
    ['trop long', ' '.repeat(40000)],
  ]
  for (const [name, text] of bad) assert.throws(() => parseLock(text), undefined, name)
})

test('la liste fermée des chemins', () => {
  assert.ok(PRIVATE_PATH.test('src/game/assets/backgrounds/chapter-10-lite.webp'))
  assert.ok(PRIVATE_PATH.test('src/game/story/portraits.data.js'))
  assert.ok(!PRIVATE_PATH.test('src/game/assets/backgrounds/chapter-1.png'))
  assert.ok(!PRIVATE_PATH.test('src/game/assets/backgrounds/../../main.js'))
  assert.ok(!PRIVATE_PATH.test('docs/store/cover-800x800.png'))
})
