/**
 * Arguments des scripts lus à la porte (règle du 9 novembre 2026) : un argument
 * inconnu, répété, sans sa valeur ou illisible arrête le script avec le code 2,
 * avant tout travail, au lieu de contrôler autre chose (ou rien) et de passer.
 * Chaque test de régression a échoué sur l'ancienne logique (v6.3.1).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { InvalidInput } from '../src/core/utils/input.js'
import { readCheckLevelsArguments, readEncodeArguments, readReleaseArguments } from '../scripts/arguments.mjs'
import { DEFAULT_SITE_URL, readSiteUrl } from '../build/siteUrl.js'

const CORES = 8

/* ---------- npm run check:levels ---------- */

for (const args of [
  ['--levels', 'abc'],
  ['--levels', '1e1'],
  ['--levels', '50-41'],
  ['--levels', '0'],
  ['--levels', '101'],
  ['--levels', '1-200'],
  ['--levels', '1,1'],
  ['--levels', '1--5'],
  ['--levels', '--workers', '4'],
  ['--levels'],
  ['--level', '5'],
  ['--track', 'duke', '--levels', '6'],
  ['--track', 'duc'],
  ['--difficulty', 'hrad'],
  ['--engine', 'trebuchett'],
  ['--ammo', 'stones'],
  ['--workers', 'abc'],
  ['--workers', '0'],
  ['--workers', '1e1'],
  ['--workers', '9'],
  ['--workers'],
  ['--workers', '4', '--workers', '2'],
  ['--boss=yes'],
  ['13'],
]) {
  test(`check:levels ${args.join(' ')} : refusé (correctif v6.3.1)`, () => {
    assert.throws(() => readCheckLevelsArguments(args, CORES), InvalidInput)
  })
}

test('check:levels sans argument : les 100 niveaux en Difficile, sur tous les cœurs (inchangé)', () => {
  const run = readCheckLevelsArguments([], CORES)
  assert.deepEqual(run.ids, Array.from({ length: 100 }, (_, i) => i + 1))
  assert.deepEqual({ ...run, ids: undefined }, { ids: undefined, track: 'campaign', difficulty: 'hard', engine: 'catapult', ammo: 'all', demo: false, boss: false, workers: CORES })
})

test('check:levels : les exemples du README se lisent, avec ou sans « = »', () => {
  const a = readCheckLevelsArguments(['--levels', '13,29,41-50', '--engine', 'trebuchet', '--workers', '4'], CORES)
  assert.deepEqual(a.ids, [13, 29, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50])
  assert.equal(a.engine, 'trebuchet')
  assert.equal(a.workers, 4)
  const b = readCheckLevelsArguments(['--difficulty=normal', '--ammo=stone', '--track=duke', '--levels=1-3', '--boss'], CORES)
  assert.deepEqual([b.difficulty, b.ammo, b.track, b.ids, b.boss], ['normal', 'stone', 'duke', [1, 2, 3], true])
})

test('check:levels : un argument refusé arrête le script (code 2) avant de lancer le moindre contrôle (correctif v6.3.1)', () => {
  const script = fileURLToPath(new URL('../scripts/check-levels.mjs', import.meta.url))
  const result = spawnSync(process.execPath, [script, '--levels', 'abc'], { encoding: 'utf8', timeout: 60_000 })
  assert.equal(result.status, 2, result.stdout + result.stderr)
  assert.doesNotMatch(result.stdout, /niveaux valides/)
  assert.match(result.stderr, /--levels/)
})

/* ---------- npm run release:portals ---------- */

for (const args of [
  ['--gd-id', '--y8-game', '123'],
  ['--gd', '123'],
  ['--gd-id'],
  ['--gd-id', 'a', '--gd-id', 'b'],
  ['--gd-id', 'abc!'],
  ['--y8-app', 'x'.repeat(65)],
]) {
  test(`release:portals ${args.join(' ')} : refusé (correctif v6.3.1)`, () => {
    assert.throws(() => readReleaseArguments(args), InvalidInput)
  })
}

test('release:portals : identifiants des portails lus, absents par défaut', () => {
  assert.deepEqual(readReleaseArguments([]), { gd: '', y8Game: '', y8App: '' })
  assert.deepEqual(readReleaseArguments(['--gd-id', 'abc-123_x', '--y8-game', 'g1', '--y8-app=a2']), { gd: 'abc-123_x', y8Game: 'g1', y8App: 'a2' })
})

/* ---------- Variable du build ---------- */

test('VITE_SITE_URL : une adresse https sans guillemet ni chevron, sinon le build s’arrête (v6.3.1)', () => {
  assert.equal(readSiteUrl(undefined), DEFAULT_SITE_URL)
  assert.equal(readSiteUrl(''), DEFAULT_SITE_URL)
  assert.equal(readSiteUrl('https://catapulte.example/jeu/'), 'https://catapulte.example/jeu/')
  assert.equal(readSiteUrl(' https://catapulte.example '), 'https://catapulte.example', 'bords nettoyés')
  for (const bad of ['http://catapulte.example', 'https://x.example/"><script>alert(1)</script>', "https://x.example/' onload='x", 'https://x y.example', `https://${'a'.repeat(200)}.example`, 'catapulte.example']) {
    assert.throws(() => readSiteUrl(bad), /VITE_SITE_URL/, bad)
  }
})

/* ---------- npm run backgrounds ---------- */

for (const args of [
  ['--crop', 'abc'],
  ['--crop'],
  ['--crop', '2'],
  ['--crop', '0'],
  ['--width', '1e4'],
  ['--width', '2560.5'],
  ['--width', '0x100'],
  ['--quality', '1.5'],
  ['--quality', 'NaN'],
  ['--boxes', 'yes'],
  ['--box'],
]) {
  test(`backgrounds ${args.join(' ')} : refusé, rien n'est encodé (correctif v6.3.1)`, () => {
    assert.throws(() => readEncodeArguments(args), InvalidInput)
  })
}

test('backgrounds : valeurs par défaut et réglages lus en nombres', () => {
  assert.deepEqual(readEncodeArguments([]), { crop: 0.885, width: 2560, quality: 0.84, boxes: false })
  assert.deepEqual(readEncodeArguments(['--crop', '0.9', '--width', '1920', '--quality=0.8', '--boxes']), { crop: 0.9, width: 1920, quality: 0.8, boxes: true })
})
