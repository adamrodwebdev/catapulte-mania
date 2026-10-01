import fr from './fr.js'
import en from './en.js'
import id from './id.js'
import { deepFreeze } from '../core/utils/Guard.js'

/**
 * Dictionnaires disponibles. Pour ajouter une langue :
 *   1. copier fr.js en xx.js et traduire les valeurs (jamais les clés) ;
 *   2. l'ajouter ci-dessous et dans GAME.LANGUAGES (config/gameConfig.js) ;
 *   3. lancer `npm test` : un test vérifie qu'aucune clé ne manque.
 */
export const DICTIONARIES = deepFreeze({ fr, en, id })

/** Nom de chaque langue dans sa propre langue (sélecteur). */
export const LANGUAGE_NAMES = Object.freeze({ fr: 'Français', en: 'English', id: 'Bahasa Indonesia' })
