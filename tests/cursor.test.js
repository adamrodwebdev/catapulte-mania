/**
 * Le curseur dit ce qui se clique (règle du 9 novembre 2026) : le bloc des
 * curseurs est posé une seule fois dans base.css, aucune autre règle ne donne
 * la main, et la scène de jeu ne la montre que là où un clic agit (v6.3.1).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { canvasCursor } from '../src/game/aim/canvasCursor.js'
import { GameSession } from '../src/game/GameSession.js'
import { LevelRepository } from '../src/game/levels/LevelRepository.js'

const STYLES = new URL('../src/styles/', import.meta.url)
const noComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const css = (file) => noComments(readFileSync(new URL(file, STYLES), 'utf8'))
const base = css('base.css')
/** Toutes les déclarations `cursor` des styles, avec leur fichier. */
const declarations = readdirSync(STYLES)
  .filter((f) => f.endsWith('.css'))
  .flatMap((f) => [...css(f).matchAll(/cursor:\s*([a-z-]+)/g)].map((m) => `${f}: ${m[1]}`))

test('curseur : la flèche est celle de toute la page', () => {
  assert.match(base, /html\s*\{\s*cursor:\s*default;\s*\}/)
})

test('curseur : la main n’est donnée que par le bloc de base.css et l’écran du studio', () => {
  assert.deepEqual(declarations.filter((d) => d.endsWith(': pointer')).sort(), ['base.css: pointer', 'base.css: pointer', 'studio.css: pointer'])
  assert.match(base, /:where\(a\[href\], area\[href\], button, select, summary, label\[for\],/)
  assert.match(base, /:where\(label:has\(> input:not\(:disabled\)\)\)\s*\{\s*cursor:\s*pointer;\s*\}/)
})

test('curseur : barre de texte dans les champs, « interdit » sur une commande désactivée', () => {
  assert.match(base, /textarea, \[contenteditable='true'\]\) \{ cursor: text; \}/)
  assert.match(base, /:disabled, \[aria-disabled='true'\] \{ cursor: not-allowed; \}/)
  assert.match(base, /:where\(label:has\(> input:disabled\)\) \{ cursor: not-allowed; \}/)
})

test('curseur : aucune règle d’un composant ne pose le sien, hors le viseur de l’atelier', () => {
  assert.deepEqual(declarations.sort(), [
    'base.css: default',
    'base.css: not-allowed',
    'base.css: not-allowed',
    'base.css: pointer',
    'base.css: pointer',
    'base.css: text',
    'modes.css: crosshair',
    'studio.css: pointer',
  ])
  assert.match(css('modes.css'), /\.editor__canvas \{[^}]*cursor: crosshair;/)
})

/* ---------- La scène ---------- */

const scene = (over = {}) => ({ paused: false, replaying: false, aiming: true, flying: false, trebuchet: false, trebPhase: null, busy: false, canActivate: false, dragging: false, ...over })

test('scène : la catapulte et la baliste en visée se saisissent (main ouverte, fermée pendant le geste)', () => {
  assert.equal(canvasCursor(scene()), 'grab')
  assert.equal(canvasCursor(scene({ dragging: true })), 'grabbing')
  assert.equal(canvasCursor(scene({ busy: true })), 'default', 'bras en mouvement : rien à saisir')
})

test('scène : le trébuchet vise un point (viseur), puis fige sa jauge au clic (main)', () => {
  assert.equal(canvasCursor(scene({ trebuchet: true, trebPhase: 'target' })), 'crosshair')
  assert.equal(canvasCursor(scene({ trebuchet: true, trebPhase: 'power' })), 'pointer')
  for (const phase of [null, 'swing', 'constructor', 'toString']) {
    assert.equal(canvasCursor(scene({ trebuchet: true, trebPhase: phase })), 'default', String(phase))
  }
})

test('scène : en vol, la main seulement quand un appui agit', () => {
  assert.equal(canvasCursor(scene({ aiming: false, flying: true, canActivate: true })), 'pointer')
  assert.equal(canvasCursor(scene({ aiming: false, flying: true })), 'default')
})

test('scène : pause, relecture d’un défi, entre deux tours : la flèche', () => {
  assert.equal(canvasCursor(scene({ paused: true })), 'default')
  assert.equal(canvasCursor(scene({ replaying: true })), 'default')
  assert.equal(canvasCursor(scene({ aiming: false })), 'default')
  assert.equal(canvasCursor(scene({ aiming: false, flying: true, canActivate: true, paused: true })), 'default')
})

test('scène : GameSession.canActivate suit le HUD, seulement en vol (météore)', () => {
  const s = new GameSession(LevelRepository.get(16), { difficulty: 'normal', completedLevels: 15, reducedMotion: true })
  for (let i = 0; i < 200 && s.state !== 'aiming'; i++) s.update(33)
  assert.equal(s.canActivate, false, 'en visée')
  assert.ok(s.usePower('meteor'))
  s.aim(45, 0.9)
  s.fire()
  for (let i = 0; i < 40 && !s.hud.canActivate; i++) s.update(33)
  assert.equal(s.hud.canActivate, true)
  assert.equal(s.canActivate, true)
  s.destroy()
})
