import fr from './fr.js'
import en from './en.js'
import id from './id.js'
import { deepFreeze } from '../core/utils/Guard.js'

/**
 * Dictionnaires disponibles. Pour ajouter une langue :
 *   1. copier fr.js en xx.js et traduire les valeurs (jamais les clés) ;
 *   2. l'ajouter ci-dessous, dans loader.js et dans GAME.LANGUAGES (config/gameConfig.js) ;
 *   3. lancer `npm test` : un test vérifie qu'aucune clé ne manque.
 */
export const DICTIONARIES = deepFreeze({ fr, en, id })

export { LANGUAGE_NAMES } from './loader.js'

// Remarque : l'application charge les langues à la demande (loader.js). Ce module,
// qui les importe toutes, sert aux tests et aux scripts de contrôle.
