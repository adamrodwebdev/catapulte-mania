/**
 * Bornes de visée de la catapulte, dans un module à part : le code des liens
 * de défi peut les vérifier sans charger les dessins du jeu (accueil léger).
 */
export const AIM = Object.freeze({
  MIN_ANGLE: 5,
  MAX_ANGLE: 80,
  MIN_SPEED: 8,
  MAX_SPEED: 27,
})
