# Propositions d'évolution

Idées pour aller plus loin, inspirées de jeux du genre (Angry Birds, Crush the Castle, Worms, Besiege) et des bonnes pratiques d'accessibilité. Classées par rapport valeur / effort.

## Rapides à ajouter

1. **Défi du jour** : un niveau généré chaque jour à partir de la date (le générateur de hasard reproductible `SeededRandom` existe déjà). Tout le monde joue le même niveau, sans serveur.
2. **Succès / trophées** : « Abattre un château en un seul tir », « Finir un chapitre sans pouvoir », « Faire exploser 3 barils d'un coup ». Rejouabilité forte pour peu d'effort.
3. **Palettes pour daltoniens** (deutéranopie, protanopie, tritanopie) en plus du contraste élevé : les cibles et barils restent distinguables par la forme ET la couleur.
4. **Lecture audio de la visée** (malvoyants) : un son dont la hauteur suit l'angle et la puissance, et un « bip » quand la trajectoire prévue passe près d'une cible.

## Moyennes

5. **Choix de l'engin de siège** : catapulte (tir courbe), trébuchet (plus puissant, plus lent), baliste (tir tendu). Chaque engin change la façon de calculer la trajectoire.
6. **Encyclopédie médiévale** : à chaque nouveauté (feu grégeois, trébuchet, chevalier…), une courte fiche historique débloquée. Aspect pédagogique, utile pour un public scolaire.
7. **Ralenti de l'impact** et **rejeu du meilleur tir** (le moteur est déterministe : on peut rejouer un tir à partir de ses seuls réglages).
8. **Éditeur de niveaux** avec partage par code (texte signé à copier-coller), sans serveur.

## Plus ambitieuses

9. **Mode « deux joueurs sur le même appareil »** : chacun son château, tour par tour.
10. **Classement en ligne vérifié** : nécessite un petit serveur qui rejoue les tirs envoyés pour valider le score (seule façon de rendre un classement réellement inviolable).
11. **Graphismes peints à la main** : la couche d'assets est déjà prête à recevoir des images (voir `src/game/assets/assets.config.js`).
