import { deepFreeze } from '../../core/utils/Guard.js'

/**
 * Maîtrise du royaume (v6.2) : toutes les étoiles et tous les succès de la
 * campagne (3 de chaque par niveau). Elle fait du joueur le « Grand Ingénieur
 * du Royaume » et ouvre ses récompenses :
 *  - un titre et un écusson d'or (profil, accueil) ;
 *  - une page cachée de la Chronique, « La Légende » ;
 *  - l'Engin d'or (catapulte, trébuchet et baliste dorés, bannière royale) et
 *    la Comète d'or, une traînée d'étincelles ;
 *  - les Terres du Duc, chapitre secret de cinq châteaux ;
 *  - la Campagne héroïque (« nouvelle partie + ») et les paliers héroïques de l'atelier.
 */

/** Étoiles et succès d'une campagne parfaite (100 niveaux × 3). */
export const MASTERY_TOTAL = 300

/** Récompenses d'apparence offertes à la maîtrise (jamais vendues). */
export const MASTERY_COSMETICS = Object.freeze(['gold', 'comet'])

/**
 * Les Terres du Duc : nombre de châteaux du chapitre secret (v6.2). Seule
 * source du nombre : la sauvegarde (SaveSlot), les parcours (Tracks) et les
 * écrans le lisent ici ; un test vérifie que DukeRepository en bâtit autant.
 */
export const DUKE_COUNT = 5

/**
 * Campagne héroïque : la même campagne, plus dure, pour qui la maîtrise.
 *  - FORTIFY : châteaux plus solides (points de vie des blocs et des
 *    défenseurs, solidité des jonctions) ;
 *  - SHOTS : un tir de moins par niveau (jamais moins de deux) ;
 *  - RAID_FROM : un pillard de plus dès ce niveau (de givre en hiver), trois au plus ;
 *  - WIND : vent plus fort.
 * Elle a ses propres médailles (bronze, argent, or : une, deux, trois étoiles).
 */
export const HEROIC = deepFreeze({
  FORTIFY: { blocks: 1.35, targets: 1.25, joints: 1.5 },
  SHOTS: -1,
  RAID_FROM: 4,
  MAX_RAIDERS: 3,
  WIND: 1.3,
})

/** Médaille d'un résultat héroïque ou des Terres du Duc (selon les étoiles). */
export function medalFor(stars) {
  return stars >= 3 ? 'gold' : stars === 2 ? 'silver' : stars === 1 ? 'bronze' : null
}
