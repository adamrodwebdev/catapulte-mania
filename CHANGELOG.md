# Journal des modifications

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), numérotation [SemVer](https://semver.org/lang/fr/).

## [1.3.0] – 2026-10-01
### Modifié
- Les 40 niveaux sont entièrement redessinés : châteaux plus hauts (jusqu'à
  huit étages), plus aucun rempart ni palissade devant les tirs, et plus de
  cibles (2 à 3 au début, jusqu'à 8 à la fin) pour compenser.
- Sous-titres des sons et astuce de visée déplacés en bas de l'écran, au-dessus
  des commandes : ils ne masquent plus la trajectoire ni le haut des châteaux.
### Ajouté
- Niveaux à « point de rupture » qui font tomber un château entier : pilotis
  de paille (3), rez-de-chaussée en paille (6), poudrière (13), pont de bois
  sous une tour de pierre (17), pieds de verre (24, 37), aqueduc (27),
  étage de paille (33).
- Niveaux d'ingéniosité : dominos (9), tirs en cloche sur une colline (23, 32),
  pont-levis à couper (28), tour d'ivoire à faire basculer par le haut (34),
  forteresse en escalier (38), salles de fer sous une superstructure fragile (39).
- Préfabriqués `stilts` (pilotis) et `spot` (poser une cible sur une passerelle).

## [1.2.0] – 2026-10-01
### Modifié
- Murs porteurs plus exigeants : il faut les frapper de face (un projectile
  qui retombe sur le sommet ne suffit pas) et avec une énergie propre au
  matériau : 20 % de sa résistance pour le bois, 55 % pour la pierre (rocher
  lancé fort), 80 % pour le fer (en pratique : explosifs).
- Écrasement : le bloc doit être réellement lancé ou en chute (seuils relevés),
  un simple glissement de mur ne suffit plus.
### Corrigé
- Le relevé des appuis ignorait les blocs « endormis » par le moteur : il est
  désormais géométrique (bas d'un bloc posé sur le haut d'un autre).

## [1.1.0] – 2026-10-01
### Ajouté
- Écrasement : une cible touchée par un bloc en mouvement meurt sur le coup.
- Murs porteurs : un projectile qui frappe assez fort un mur qui soutient un
  toit ou un plancher le fait céder ; ce qu'il porte s'effondre. Le seuil
  dépend du matériau (le bois cède plus facilement que la pierre ou le fer).
- Mort d'une cible : gerbe de sang et brève tache au sol (option « Effets de
  sang » dans les réglages ; désactivée, un nuage de poussière la remplace).
- Sous-titre « Le mur porteur cède » pour les malentendants.
### Corrigé
- Un toit ou un plancher restait suspendu dans le vide quand son mur
  disparaissait (corps en veille jamais réveillés par le moteur physique).

## [1.0.0] – 2026-10-01
### Ajouté
- README accessible aux personnes qui ne connaissent pas Git/GitHub.
- Journal des modifications et propositions d'évolution (`docs/IDEES.md`).
- Démo autonome en un seul fichier HTML (8 niveaux).

## [0.6.0] – 2026-10-01
### Ajouté
- Mode hors-ligne (service worker généré au build, cache versionné).
- Image de partage Open Graph 1200×630.
### Modifié
- Équilibrage des niveaux 5 et 20, validé par le joueur automatique en Difficile.
- Couleurs `theme-color` alignées sur les thèmes clair et sombre.

## [0.5.0] – 2026-10-01
### Ajouté
- Écrans Vue : accueil, profils, campagne, réglages, aide, jeu.
- HUD accessible : visée au curseur, boutons et clavier ; munitions ; pouvoirs.
- Sous-titres des sons avec direction, annonces pour lecteurs d'écran.
- Thèmes clair, sombre, contraste élevé ; taille du texte réglable.
- Cadrage de la caméra adapté à la place prise par le HUD (téléphone, tablette, ordinateur).

## [0.4.0]
### Ajouté
- Catapulte, 40 niveaux en 4 chapitres, 3 difficultés.
- 6 pouvoirs spéciaux déblocables (un par tour, coût en points).
- Score scellé et résultat de niveau authentifié.

## [0.3.0]
### Ajouté
- Moteur physique (Matter.js), entités (blocs, projectiles, cibles, barils).
- Rendu canvas, caméra, particules ; graphismes procéduraux remplaçables par des images.

## [0.2.0]
### Ajouté
- Validation systématique des types (`Guard`, schémas).
- Sauvegardes signées HMAC-SHA256 avec contrôles de cohérence.
- Service de réglages et de traduction (FR / EN / ID).

## [0.1.0]
### Ajouté
- Initialisation du projet Vue 3 + Vite, configuration qualité et sécurité (CSP).
