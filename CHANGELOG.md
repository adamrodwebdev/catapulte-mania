# Journal des modifications

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), numérotation [SemVer](https://semver.org/lang/fr/).

## [3.0.0] – 2026-10-02
### Ajouté
- **100 niveaux** (au lieu de 40) : six nouveaux chapitres (Marais, Désert,
  Montagne, Hiver, Orage, Salle du trône), construits à partir de plans de
  châteaux réutilisables (donjon, tours jumelles, forteresse, pilotis, plateau,
  escalier, aqueduc, crypte blindée, dominos, poudrière, pont-levis, hameau,
  rempart).
- **Nouvelles textures et matériaux** : brique, grès, glace (glissante, fragile)
  et marbre (le plus solide après le fer), avec leurs débris et leurs sons.
- **Nouveaux décors** : brume des marais, désert aride, sommets enneigés, neige,
  pluie d'orage et salle du trône nocturne.
- **Duel** : six châteaux dédiés, bien plus grands, avec 10 à 15 défenseurs et
  8 à 9 tirs chacun ; le second joueur a toujours l'occasion de tirer.
### Modifié
- **Personnages fragiles** : retour à l'ancienne règle, en plus strict. Le
  moindre contact avec un bloc en mouvement, un bloc posé sur la tête ou deux
  blocs qui les serrent les tuent ; une cible renversée est hors de combat.
- **Structures beaucoup plus solides** : tous les matériaux sont 4 à 6 fois plus
  lourds et 2,2 fois plus résistants ; le sol retient mieux les murs. Un boulet
  de pierre ne renverse plus une cabane de pierre ; il faut viser juste ou
  choisir la bonne munition.
- **Atelier** : le bras renforcé (+7 % de vitesse par niveau) et le lest
  (+20 % de masse par niveau) changent réellement ce qu'on peut abattre.
- **Difficile** : moitié moins de munitions spéciales (arrondi vers le bas).
### Vérifié
- Les 100 niveaux sont stables au repos et gagnables en Difficile.

## [2.1.0] – 2026-10-02
### Modifié (équilibrage : le jeu était devenu trop facile)
- Pierre de base ramenée à son poids d'origine : trop lourde, elle rendait les
  munitions spéciales inutiles (rocher, feu et poudre restent plus lourds).
- Fer : vrai blindage. Il ne subit que 40 % des dégâts de choc, glisse beaucoup
  moins (frottement élevé) et ne cède plus aux boulets de pierre ; il faut des
  explosifs ou le feu.
- Écrasement : il faut un débris lourd ou rapide (énergie ≥ 5 × la résistance
  de la cible) ; un mur qui glisse ou une planchette ne tue plus. Un bloc posé
  sur une cible doit peser assez lourd pour l'écraser. Les chevaliers, plus
  résistants, survivent mieux aux éboulements.
- Une cible renversée n'est mise hors de combat que si elle est déjà blessée
  (2,5 s au sol) : un soldat simplement bousculé reste à abattre.
- Étoiles plus exigeantes : 2 étoiles à 70 % du score de référence, 3 étoiles à
  105 % (tir quasi parfait). Les profils existants sont recalculés au chargement.
### Mesures
- Part des tirs au hasard qui gagnent un niveau d'un coup : niveau 5 de 45 % à
  18 %, niveau 22 de 17 % à 2 %, niveau 34 de 12 % à 5 %.
- Parties jouées au hasard sur les premiers niveaux : 3 étoiles dans environ
  5 à 15 % des cas (contre 30 % avant).
- 40/40 niveaux toujours gagnables en Difficile ; 60 tests.

## [2.0.0] – 2026-10-02
### Ajouté
- **Mode libre** : rejouer les niveaux terminés avec tirs et munitions
  illimités et pouvoirs gratuits ; rien n'est enregistré.
- **Deux joueurs** sur le même appareil, trois formules :
  duel (même château, tirs alternés, points au tireur), chacun sa partie
  (deux manches, scores comparés), face-à-face (deux catapultes, deux
  châteaux, 5 arènes symétriques, défenseurs verts pour le joueur 2).
- **Atelier** : or gagné en campagne (victoire, étoiles, première victoire),
  5 améliorations à plusieurs niveaux et 7 apparences (catapulte, traînée).
- Boutique premium préparée mais désactivée (`StoreService`), documentée.
- Sauvegarde v2 (migration automatique des profils existants) avec contrôle
  de cohérence de l'or.
### Corrigé
- Personnages et blocs suspendus dans le vide quand leur appui disparaissait
  (niveaux 4, 6, 7…) : les corps « endormis » sans appui sont réveillés.
- Conditions de mort calculées en continu : chute lourde, renversé plus de
  1,5 s, en plus de l'écrasement, du coincement, du choc et du feu.
- Projectiles environ 25 % plus lourds (moins d'effet tunnel).
- Téléphone en mode vertical : sous-titres compacts en haut, conseil de
  rotation qui s'efface, bandeau à deux joueurs lisible.
- Libellé « Puissance » tronqué dans le panneau de visée.
### Qualité
- 58 tests (dont 15 pour l'économie et les modes), 40/40 niveaux stables et
  gagnables en Difficile.

## [1.4.0] – 2026-10-01
### Corrigé
- Cibles coincées : une cible sur laquelle repose un bloc (mur, plancher, toit)
  ou prise en étau entre deux blocs meurt écrasée. Un niveau ne peut plus
  rester bloqué avec une cible emmurée et intouchable.
- Écrasement par un bloc en mouvement : seuils abaissés (un mur ou un toit qui
  tombe ou glisse sur une cible la tue).
### Qualité
- Le contrôle des niveaux vérifie aussi qu'aucune cible n'est coincée dès le
  départ ; 3 nouveaux tests (41 au total).

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
