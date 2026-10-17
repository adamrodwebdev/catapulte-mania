import { Guard } from '../core/utils/Guard.js'
import { GAME, PLAYABLE_LEVELS } from '../config/gameConfig.js'
import { SaveSlot } from '../domain/SaveSlot.js'
import { GOLD, maxGoldFor } from '../game/progression/GoldRules.js'
import { LevelRepository } from '../game/levels/LevelRepository.js'

/**
 * Profils de test du serveur de développement (v6.2) : `?unlock=all` et
 * `?unlock=complete` (`npm run dev:unlocked`).
 *
 * Ce module n'est chargé que sous `import.meta.env.DEV` (voir AppContext) :
 * il est absent des versions publiées. Il ne touche jamais l'intérieur d'un
 * profil : il part de sa copie (`toJSON()`), la modifie, et la fait relire et
 * valider comme une sauvegarde (`SaveSlot.fromJSON`).
 */

/** Nom du profil de test. */
export const TEST_PROFILE = 'Test'

/** Relit une copie modifiée comme une sauvegarde (même emplacement, même contrôle). */
function reload(slot, data) {
  return SaveSlot.fromJSON(slot.index, data)
}

/**
 * Ouvre toute la campagne jusqu'au niveau `upTo` en « passant » chaque niveau
 * pas encore réussi qui le précède : aucune étoile, ni or ni score, à prendre
 * pour de bon ensuite. Les niveaux déjà réussis restent tels quels.
 * @param {SaveSlot} slot
 * @returns {{ slot: SaveSlot, passed: number }} le profil ouvert (nouvel objet) et le nombre de niveaux passés
 */
export function unlockCampaign(slot, upTo = GAME.LEVEL_COUNT, now = Date.now()) {
  Guard.int(upTo, 'upTo', { min: 1, max: GAME.LEVEL_COUNT })
  const data = slot.toJSON()
  let passed = 0
  for (let id = 1; id < upTo; id++) {
    if (data.levels[id]) continue
    data.levels[id] = { stars: 0, best: 0, attempts: 1, shots: 0, ach: 0, skipped: true }
    passed++
  }
  data.frontier = { level: 0, fails: 0 }
  data.updatedAt = Math.max(now, data.updatedAt)
  return { slot: reload(slot, data), passed }
}

/**
 * Profil de test « complet » : chaque niveau pris avec trois étoiles et ses
 * trois succès, et l'or que cela rapporte (la maîtrise et ses récompenses).
 * @param {SaveSlot} slot
 * @param {Array<{ id: number, shots: number, best: number }>} records
 *   par niveau : tirs d'une victoire à trois étoiles, un score possible
 * @returns {SaveSlot} le profil maîtrisé (nouvel objet)
 */
export function masterCampaign(slot, records, now = Date.now()) {
  const data = slot.toJSON()
  for (const { id, shots, best } of records) {
    Guard.int(id, 'levelId', { min: 1, max: GAME.LEVEL_COUNT })
    data.levels[id] = { stars: 3, best: Guard.int(best, 'best', { min: 0, max: GAME.MAX_LEVEL_SCORE }), attempts: 1, shots: Guard.int(shots, 'shots', { min: 1, max: 100 }), ach: 7 }
  }
  // L'or d'une campagne parfaite (la réserve tient compte de ce qui a déjà été dépensé).
  const earned = Math.min(GOLD.MAX_BALANCE, data.legacyGold + maxGoldFor(data.levels) - Object.keys(data.levels).length * GOLD.REPLAY)
  const spent = data.goldEarned - data.gold
  if (earned > data.goldEarned) {
    data.goldEarned = earned
    data.gold = earned - spent
  }
  data.frontier = { level: 0, fails: 0 }
  data.updatedAt = Math.max(now, data.updatedAt)
  return reload(slot, data)
}

/** Une victoire à trois étoiles possible pour chaque niveau de la campagne. */
export function perfectRecords() {
  return LevelRepository.all().map((l) => ({ id: l.id, shots: l.par, best: Math.min(l.maxScore, l.reference) }))
}

/**
 * `?unlock=all` : ouvre le profil « Test » (repris, ou créé dans le premier
 * emplacement libre ; `&difficulty=hard` pour le régler), y ouvre tous les
 * niveaux de la campagne et affiche la carte des niveaux. `?unlock=complete` :
 * en plus, toutes les étoiles et tous les succès (la maîtrise et ses
 * récompenses). Les autres profils ne sont jamais touchés.
 * @param {{
 *   state: object,
 *   saves: import('../services/SaveManager.js').SaveManager,
 *   refreshSlots: () => Promise<void>,
 *   openProfile: (index: number) => Promise<boolean>,
 *   createProfile: (index: number, name: string, difficulty: string) => Promise<void>,
 *   go: (screen: string, opts?: object) => void,
 *   activeSlot: () => SaveSlot | null,
 *   adopt: (slot: SaveSlot) => void,
 * }} app accès du contexte applicatif, réservés au développement
 * @param {string} [search] ex. location.search
 */
export async function openTestCampaign(app, search = globalThis.location?.search || '') {
  const params = new URLSearchParams(search)
  const unlock = params.get('unlock')
  if (unlock !== 'all' && unlock !== 'complete') return
  await app.refreshSlots()
  const existing = app.state.slots.find((s) => s.status === 'ok' && s.name === TEST_PROFILE)
  const free = app.state.slots.find((s) => s.status === 'empty')
  const difficulty = GAME.DIFFICULTIES.includes(params.get('difficulty')) ? params.get('difficulty') : null
  if (existing) await app.openProfile(existing.index)
  else if (free) await app.createProfile(free.index, TEST_PROFILE, difficulty ?? 'normal')
  else return console.warn('[Catapulte Mania] ?unlock=all : aucun emplacement libre pour le profil « Test ».')
  let slot = unlockCampaign(app.activeSlot(), PLAYABLE_LEVELS).slot
  if (unlock === 'complete') {
    slot = masterCampaign(slot, perfectRecords())
    slot.grantMastery()
  }
  if (difficulty) slot.difficulty = difficulty
  app.adopt(slot)
  await app.saves.save(slot)
  await app.refreshSlots()
  app.go('levels', { replace: true })
}
