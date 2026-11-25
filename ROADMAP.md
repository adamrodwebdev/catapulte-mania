# Feuille de route : Catapulte Mania 3D (v7)

Brouillon du 2026-11-25, à valider. Point de départ : la maquette jouable du chapitre 1
(`.scratch/v7-3d-mockup`, version publiée en privé), mode B « physique 3D complète ».

## Ce qui est décidé

- **Physique 3D complète.** Le château a de la profondeur, chaque bloc est un corps 3D, on vise et
  on guide le tir dans toutes les directions. Moteur prévu : Rapier 3D en version déterministe
  (rejeux, « Bats mon tir », défi du jour et vérificateur de niveaux en dépendent). Le choix se
  confirme par la mesure à l'étape 2.
- **Plus aucune peinture.** Les fonds peints quittent le jeu, les menus et les couvertures : tout
  vient de la 3D (les cartes de chapitre et les couvertures deviennent des rendus des scènes).
- **Le tir guidé.** Après le lâcher, la caméra suit le projectile à la première personne (ou en
  poursuite, au choix, et par défaut si le mouvement réduit est demandé). Guider ralentit le temps
  et vide une jauge d'environ 1,6 s ; un repère montre le point d'impact. L'étoile « main sûre »
  récompense un défenseur abattu sans guider : viser reste le cœur du jeu.
- **La v6 en 2D reste en ligne** (site et portails, Playgama compris) jusqu'à ce que la 3D la
  dépasse en contenu et en qualité. La v7 grandit sur `dev`, derrière le drapeau `?3d=1`.
- **La catapulte d'abord.** Le trébuchet et la baliste reviennent ensuite, repensés pour la 3D ;
  la distance du château se prépare dès le prototype pour les accueillir.
- **Modèles faits dans Blender** ; **personnages sans visage** : silhouette, couleur, casque,
  bouclier et arme disent le rôle.
- **Le style se construit autour de Fumivore** (décision du 2026-11-25, la police de la fonderie
  Ressac ; le low-poly « diorama », trop répandu, est abandonné) :
  - **un monde médiéval qui rencontre la vapeur** : Mordrac industrialise son royaume (chaudières,
    cheminées, plaques rivetées), la catapulte du joueur marche à la pression de vapeur ;
  - **la campagne joue l'axe Pressure de la police** : forts de bois au début (Regular), pierre et
    fer au milieu (Pressure), citadelles de fer rivetées à la fin (Riveted) ;
  - **la grammaire des lettres** : montants fins sous de lourdes dalles (contraste inversé), une
    plaque rivetée au bout de chaque dalle, de la fumée partout ;
  - **le rendu « gravure vivante »** : teintes d'estampe coloriée, ombres hachurées, contours à
    l'encre, ciel de papier (une passe de post-traitement dans le jeu) ;
  - **Fumivore pour les titres et le HUD** ; capitales seulement, donc une police de texte
    courant reste à choisir pour les phrases.
- **Petits forts d'abord** ; forteresses et champs de bataille plus tard.
- **Les téléphones modestes comptent** : trois niveaux de qualité, mesurés sur de vrais appareils.
- **Paysage seulement sur téléphone** (décision du 2026-11-25). Un téléphone tenu en portrait
  affiche un écran « Tournez votre téléphone » (lisible dès 320 × 568) et met le jeu en pause ; le
  plancher de mise en page devient 568 × 320. Android verrouille l'orientation en plein écran
  (`screen.orientation.lock`), iOS ne le permet pas : l'écran d'invite couvre les deux. Tablettes et
  ordinateurs gardent les deux orientations. La v6 en 2D n'est pas concernée.

## Étape 0 : ranger la v6.4

- Enregistrer la v6.4 sur `dev` (à votre demande), sans le prototype de fond WebGL2
  (`GpuBackdrop`) : la v7 remplace tout le rendu, ce prototype ne sert plus. *Recommandé, à valider.*
- Le code 3D vit à part (`src/game3d/`) ; le jeu 2D n'est pas touché tant que la 3D ne le remplace pas.

## Étape 1 : bible visuelle et maquettes (avant le code)

L'identité visuelle se décide sur image, pas dans le code.

- **Scène de référence dans Blender** : le fort du chapitre 1 au niveau de détail visé : blocs
  biseautés, rondins liés, chaume, pierre et mortier, accessoires (barils, moulin, forge, citerne,
  ruches, sacs de farine), sol, végétation, eau, ciel et lumière.
- **Matières et palettes** : les dix matériaux du jeu (bois, paille, pierre, brique, grès, verre,
  fer, glace, marbre, chaume) et une palette par chapitre, en valeurs mesurées.
- **Planche des personnages sans visage** : soldat, chevalier, roi, ogre, éclaireur, porte-bouclier,
  porte-étendard, ingénieur, général, pillard, corbeau, vouivre ; lisibles en silhouette à 60 m.
- **Budgets par niveau de qualité** (bas, moyen, haut) : triangles, appels de dessin, mémoire,
  ombres, densité de pixels. Cible basse : un Android de 4 Go à 30 images/s ; haute : 60 images/s.
- **Maquettes de l'interface** au téléphone (320 × 568 d'abord) et sur ordinateur, en clair et en
  sombre : visée, tir guidé, HUD, menus sans peintures.
- *Terminé quand* vous validez la bible et les maquettes.

## Étape 2 : socle technique (prototype, derrière le drapeau)

- Rendu three.js (WebGL2), trois niveaux de qualité qui se règlent seuls quand les images ralentissent.
- Physique Rapier 3D déterministe à pas fixe (120 Hz) ; même tir, même résultat sur Chromium,
  Firefox et WebKit (test automatique).
- Chargement : la 3D arrive en morceaux différés après l'écran titre, qui ne change pas
  (Lighthouse reste à 100). Taille de la 3D mesurée à chaque version.
- Format de château 3D en données (emprise, murs, tours, planchers, échelles) et son constructeur.
- Chaîne Blender → glTF compressé (meshopt), un atlas de matières.
- Vérificateur de niveaux sans écran (Rapier tourne dans Node) : la règle « gagnable avec la pierre
  de départ » s'applique à la 3D.
- *Terminé quand* le fort de la maquette tourne sur ce socle aux trois niveaux de qualité, mesuré.

## Étape 3 : le banc d'essai (toutes les mécaniques)

Un terrain d'essai autour d'un petit fort, avec un panneau pour choisir ce qu'on teste : munition,
unité, météo, distance, général. Chaque mécanique y est jouable, réglée et mesurée.

1. **Le tir** : visée 3D de la catapulte, tir guidé (première personne et poursuite), jauge,
   ralenti, repère d'impact, étoile « main sûre ».
2. **La distance** : château à 60, 120 et 200 m ; cadrage, durée de vol et jauge réglés pour
   chacune ; interface d'engin prête pour le trébuchet et la baliste.
3. **La destruction** : les dix matériaux (densité, dureté) ; dégâts selon l'énergie du choc ;
   jonctions qui se lézardent et cèdent, clés de voûte ; effondrement des étages ; pierre
   pré-fracturée qui éclate en morceaux ; le bois et le chaume brûlent ; débris qui se posent et
   s'endorment pour garder le téléphone fluide.
4. **Les munitions** : pierre, rocher, feu grégeois, bombe, mitraille, givre (glace, fragilité,
   vapeur), carreau, botte de paille, orbe d'orage (arc qui saute d'une cible à l'autre), pot de
   poison (nuage qui dérive), et leurs combinaisons d'éléments.
5. **Les unités** : soldat, chevalier, roi, ogre, éclaireur, porte-bouclier, porte-étendard,
   ingénieur, général, pillards (échelles et ponts), corbeaux et vouivres. Comportements : rondes,
   esquive, mise à l'abri, réparation, fuite, escalade ; navigation sur les planchers, escaliers
   et échelles du château ; animations faites dans Blender. Exigences de l'utilisateur
   (2026-11-25) :
   - **les états** que chaque unité sait tenir : au repos, course, à genoux, à l'abri, cachée,
     touchée (réaction), et pour l'ogre et la vouivre **contrer un projectile** (l'ogre le
     renvoie de sa massue, la vouivre d'un coup de queue ou de mâchoire) ;
   - **les morts en ragdoll** : un défenseur abattu tombe en corps physique (un corps Rapier par
     os, articulations limitées), jamais un simple nuage qui l'efface ;
   - **le sang activable et désactivable** dans les réglages : désactivé par défaut sur les
     portails (comme en v6), dessiné à l'encre rouge dans le style de la gravure quand il est actif ;
   - **ils crient et réagissent** : alerte, douleur, cri de mort, appel à se mettre à l'abri,
     moquerie, joués par le moteur sonore, sous-titrés pour les personnes sourdes (comme la musique).
6. **Le vent et la météo dynamique** : vent par rafales et selon l'altitude, visible (fanions,
   arbres, poussière, girouette) ; temps qui change pendant un niveau : pluie (le feu faiblit,
   l'orage porte plus loin), neige et glace (sols glissants), brume, orage et éclairs, tempête de sable.
7. **Les pouvoirs** : Œil du faucon, Force du Titan, Pierre d'aimant, Météore, Pluie de feu,
   Colère du ciel, Séisme, repensés pour la 3D. La Pierre d'aimant et le Météore recoupent le tir
   guidé : à redéfinir pendant l'essai.
8. **Les généraux** : leurs dix-sept talents (reconstruction, cri de guerre, mur de boucliers,
   saboteur, pillard engagé, bombe, pot de feu, couvre-feu, flèches enflammées, fuite, tempête de
   sable, faucons, rochers, souffle de givre, rempart de glace, foudre, ouragan), leur barre et leurs
   bannières, un siège en plusieurs étapes à petite échelle.
9. **L'identité visuelle en jeu** : la bible appliquée, feu et fumée qui éclairent, eau et lave,
   particules, travail de caméra ; le moteur sonore actuel réutilisé.
10. **Les performances** : mesures par niveau de qualité sur un Android modeste, un iPhone et un
    ordinateur ; pire image comptée.

*Terminé quand* chaque mécanique est jouable sur le banc, mesurée, et validée par vous ; les
changements décidés en chemin sont notés ici.

## Après le banc d'essai (à préciser une fois le banc validé)

- **La campagne 3D** : sa taille (nouvelle campagne plus courte pensée pour la 3D, ou conversion
  des 100 niveaux) se décide avec ce que le banc aura appris. Première tranche : le chapitre 1.
- **L'échelle** : forteresses, puis champs de bataille.
- **Les engins** : trébuchet, puis baliste.
- **Le reste du jeu** : modes à deux, atelier de châteaux, défi du jour, siège sans fin, coupe de
  la semaine, Terres du Duc et Campagne héroïque, Chronique ; reprise des profils, de l'or et des
  étoiles de la v6.
- **La relève de la v6** : quand la 3D la dépasse, elle la remplace sur le site.

## Gardé pour la fin

- Traductions française et indonésienne (l'anglais d'abord pendant les essais).
- Versions pour les portails (Playgama, CrazyGames) et leur revue de modération, une fois la v7
  solide et soignée ; couvertures et vidéos tirées des scènes 3D.

## Risques suivis

- **Téléphones modestes** : budgets par niveau de qualité, mesurés à chaque étape.
- **Poids du téléchargement** : Rapier (environ 500 Ko compressés, à mesurer), three.js, modèles.
- **Déterminisme** entre navigateurs : test automatique dès l'étape 2.
- **Mal des transports** en première personne : caméra de poursuite proposée, mouvement réduit respecté.
- **Ampleur** : la v6 reste en ligne, rien n'est remplacé avant d'être meilleur.
