import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SaveSlot } from '../src/domain/SaveSlot.js'
import { LOGIN_CYCLE, loginStatus } from '../src/game/progression/LoginRewards.js'

const day = (d) => new Date(2026, 9, d, 12, 0, 0)

test('connexion : un coffre par jour, le cycle avance les jours consécutifs', () => {
  const slot = SaveSlot.create(0, 'Ada', 'normal', day(1).getTime())
  assert.equal(slot.loginStatus(day(1)).canClaim, true)
  assert.equal(slot.claimLogin(day(1)), LOGIN_CYCLE[0])
  assert.equal(slot.claimLogin(day(1)), 0, 'déjà ouvert aujourd’hui')
  assert.equal(slot.gold, LOGIN_CYCLE[0])
  let total = LOGIN_CYCLE[0]
  for (let d = 2; d <= 7; d++) total += slot.claimLogin(day(d))
  assert.equal(total, LOGIN_CYCLE.reduce((a, b) => a + b, 0), 'sept jours d’affilée : tout le cycle')
  assert.equal(slot.loginStatus(day(8)).day, 1, 'après le 7e jour, on recommence')
  // La sauvegarde reste valide (or des coffres compté dans l'or gagné).
  const again = SaveSlot.fromJSON(0, slot.toJSON())
  assert.equal(again.gold, total)
})

test('connexion : un jour manqué ramène au jour 1', () => {
  const slot = SaveSlot.create(0, 'Ada', 'normal', day(1).getTime())
  slot.claimLogin(day(1))
  slot.claimLogin(day(2))
  const s = slot.loginStatus(day(5))
  assert.equal(s.day, 1)
  assert.equal(s.broken, true)
})

test('connexion : remettre l’horloge en arrière ne donne rien', () => {
  const slot = SaveSlot.create(0, 'Ada', 'normal', day(1).getTime())
  slot.claimLogin(day(10))
  const s = slot.loginStatus(day(4))
  assert.equal(s.canClaim, false)
  assert.equal(s.locked, true)
  assert.equal(slot.claimLogin(day(4)), 0)
})

test('connexion : une sauvegarde trafiquée est refusée', () => {
  const slot = SaveSlot.create(0, 'Ada', 'normal', day(1).getTime())
  slot.claimLogin(day(1))
  const json = slot.toJSON()
  // Plus de coffres que de jours écoulés depuis la création du profil.
  assert.throws(() => SaveSlot.fromJSON(0, { ...json, login: { ...json.login, claims: 30, gold: 30 * 250 }, gold: json.gold + 7460, goldEarned: json.goldEarned + 7460 }), /login/)
  // Plus d'or que le plus gros coffre par jour.
  assert.throws(() => SaveSlot.fromJSON(0, { ...json, login: { ...json.login, gold: 9999 }, gold: 9999, goldEarned: 9999 }), /login/)
  // Or du coffre gonflé sans le déclarer : l'or gagné dépasse ce qui est possible.
  assert.throws(() => SaveSlot.fromJSON(0, { ...json, gold: 5000, goldEarned: 5000 }), /gold/)
  assert.equal(loginStatus({ last: '', day: 0 }, day(3)).reward, LOGIN_CYCLE[0])
})
