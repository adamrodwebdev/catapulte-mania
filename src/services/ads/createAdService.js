import { IS_DEMO } from '../../config/gameConfig.js'
import { NoAdService } from './AdService.js'


/**
 * Service de publicité du build en cours. Le code d'un portail n'est importé
 * (chunk séparé) que dans le build de ce portail : notre site n'en contient rien.
 * @returns {Promise<import('./AdService.js').AdService>}
 */
export async function createAdService() {
  if (IS_DEMO) return new NoAdService()
  try {
    let service = null
    // __TARGET__ est remplacé au build par la plateforme visée : les branches des
    // autres portails disparaissent du bundle (aucune trace des SDK sur notre site).
    if (__TARGET__ === 'crazygames') service = new (await import('./CrazyGamesAdService.js')).CrazyGamesAdService()
    else if (__TARGET__ === 'poki') service = new (await import('./PokiAdService.js')).PokiAdService()
    else if (__TARGET__ === 'gamedistribution') service = new (await import('./GameDistributionAdService.js')).GameDistributionAdService()
    else if (__TARGET__ === 'gamepix') service = new (await import('./GamePixAdService.js')).GamePixAdService()
    else if (__TARGET__ === 'y8') service = new (await import('./Y8AdService.js')).Y8AdService()
    if (!service) return new NoAdService()
    await service.init()
    return service
  } catch {
    return new NoAdService()
  }
}
