/**
 * Ce que le jeu accepte de l'extérieur (règle du 9 novembre 2026), en un seul
 * endroit : chaque texte, chaque entrée du stockage et chaque argument lu à
 * une porte a sa limite ici. Une valeur trop longue est refusée, jamais
 * coupée (voir `readText` dans core/utils/input.js). Le jeu n'écrit jamais
 * plus qu'il ne relirait.
 */

/** Le plus long texte lu à une porte, en caractères (points de code) une fois nettoyé. */
export const TEXT_LIMITS = Object.freeze({
  /**
   * Nom d'un profil, d'un joueur (modes à deux) ou d'un château de l'atelier :
   * la règle `PROFILE_NAME` en permet 16. C'est aussi le `maxlength` de leurs champs.
   */
  name: 16,
  /** Étiquette de langue (adresse, navigateur, portail : « pt-BR ») : 35 au plus (BCP 47). */
  languageTag: 35,
  /** Jour (AAAA-MM-JJ) écrit dans une sauvegarde ou un lien. */
  dayKey: 10,
  /** Semaine ISO (AAAA-Www) écrite dans une sauvegarde ou un lien. */
  weekKey: 8,
  /** Code d'un défi « Bats mon tir » reçu par lien (journal de 200 gestes au plus). */
  replayCode: 6000,
  /** Code d'un château de l'atelier (60 pièces au plus), reçu par lien ou gardé sur l'appareil. */
  castleCode: 4000,
  /**
   * Paramètre d'invitation reçu d'un portail ou d'une ancre (`#defi=`, `#chateau=`,
   * `#coupe=`) : le plus long des codes qu'il peut porter.
   */
  invite: 6000,
  /** Lien d'invitation rendu par un portail (« Bats mon tir », atelier, coupe). */
  inviteLink: 2048,
  /** Valeur d'un argument des scripts (`--levels 13,29,41-50`, `--gd-id …`). */
  scriptArgument: 400,
})

/** Le plus d'éléments lus dans une liste venue de l'extérieur ; au-delà, le reste est ignoré ou refusé. */
export const LIST_LIMITS = Object.freeze({
  /** Langues du navigateur et du portail essayées pour choisir la langue du jeu. */
  languages: 20,
})

/**
 * La plus longue entrée lue dans le stockage (celui du navigateur ou du
 * portail), en unités UTF-16, vérifiée avant `JSON.parse`. Mesuré le
 * 9 novembre 2026 : le profil le plus plein que le schéma permette (100
 * niveaux dans chaque parcours, chaque compteur à son maximum, nom de 16
 * lettres hors du plan de base) fait 26 535 unités avec sa signature.
 */
export const SAVE_LIMITS = Object.freeze({
  entry: 65_536,
})
