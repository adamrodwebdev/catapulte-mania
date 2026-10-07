import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ParticleSystem } from '../src/game/effects/ParticleSystem.js'
import { WORLD } from '../src/game/physics/constants.js'

function run(ps, ms) {
  for (let t = 0; t < ms; t += 16) ps.update(16)
}

test('sang : aucune flaque posée d’avance, les gouttes tachent le sol où elles tombent', () => {
  const ps = new ParticleSystem()
  // Un personnage tué en haut d'une tour (300 unités au-dessus du sol).
  ps.blood(1000, WORLD.GROUND_Y - 300, WORLD.GROUND_Y, 0)
  assert.equal(ps.countOf('stain'), 0, 'pas de flaque en l’air au moment de la mort')
  assert.ok(ps.countOf('drop') > 10)
  run(ps, 2500)
  assert.ok(ps.countOf('stain') > 5, 'les gouttes ont taché le sol')
  assert.equal(ps.countOf('drop'), 0, 'plus aucune goutte suspendue')
})

test('sang : une goutte qui rencontre un mur s’y écrase au lieu de le traverser', () => {
  const ps = new ParticleSystem()
  // Un mur plein sous le personnage : tout ce qui est plus bas que y = 500 est « solide ».
  ps.surfaceAt = (x, y) => y > 500
  ps.blood(1000, 480, WORLD.GROUND_Y, 0)
  run(ps, 2500)
  assert.equal(ps.countOf('stain'), 0, 'aucune goutte n’a atteint le sol à travers le mur')
})
