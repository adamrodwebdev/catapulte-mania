# Journal des modifications

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), numérotation [SemVer](https://semver.org/lang/fr/).

## [3.4.0] – 2026-10-03
### Ajouté
- **Campagne à deux** : les 100 niveaux de l'histoire en coopération. Les
  joueurs tirent à tour de rôle, partagent tirs, munitions et score, gagnent
  ensemble ; meilleur joueur désigné à la renommée ; progression enregistrée à
  part dans le profil choisi (sauvegarde v5), Chronique et répliques comprises.
- **Renommée** (modes à deux) : soldat 1, chevalier 2, roi 4, +2 pour le coup
  de grâce, créditée à l'auteur du tir (même si la chute finit au tour suivant).
### Modifié
- **Duel : la conquête** : le plus renommé gagne ; « victoire assurée » dès que
  l'écart ne peut plus être rattrapé ; départage au score.
- **Chacun sa partie : le tournoi** en trois manches sur trois niveaux : manche
  gagnée par le château pris en moins de tirs (ou le plus de défenseurs
  abattus) ; match au meilleur des trois ; celui qui commence alterne.
- **Face-à-face : le siège** : un roi dans chaque château ; régicide = victoire
  immédiate ; sinon conquête, ou château le plus solide quand les tirs sont
  épuisés. Six nouvelles arènes, plus grandes et plus solides.
- **Tous les modes à deux se jouent en Difficile.**
- Écrans de fin dédiés : tableau du tournoi, raison de la victoire, meilleur joueur.

## [3.3.0] – 2026-10-03
### Ajouté
- **Personnages en pixel art** : Ysolde, Maître Gontran, le duc Mordrac et le
  roi Aubert, convertis depuis les illustrations fournies. Aucune image dans le
  jeu : chaque portrait est une palette (52 couleurs au plus) et une suite de
  pixels compressée, redessinée dans un canevas (16 Ko compressés au total,
  chargés seulement quand un personnage apparaît). Scripts de conversion et
  d'encodage dans scripts/portraits/, maîtres retouchables dans art/portraits/.
- **Une réplique avant chaque niveau** (100 répliques, en FR, EN et ID), dite
  par le personnage le plus concerné, dans la fenêtre d'introduction.
- Maître Gontran guide les tutoriels et accueille le joueur à l'atelier.
### Modifié
- **La Chronique réécrite** autour des personnages : le roi Aubert est captif
  de Mordrac, Ysolde mène la reconquête, Gontran et son apprenti (le joueur)
  manient la catapulte. Les épisodes sont mis en scène : celui qui parle est au
  premier plan, les autres dans l'ombre.
- L'emplacement prévu pour des illustrations (public/story/) est retiré.

## [3.2.1] – 2026-10-02
### Modifié
- Campagne : toute munition découverte reste disponible jusqu'à la fin (au
  moins une de chaque type dans chaque niveau, même en Difficile), pour que le
  joueur puisse expérimenter librement. Les niveaux qui en prévoient davantage
  gardent leur dotation.

## [3.2.0] – 2026-10-02
### Ajouté
- **Tutoriels guidés** : chaque nouvel outil s'apprend dans un niveau dédié
  (viser au niveau 1, Accalmie 5, Force du Titan 8, feu grégeois 9, rocher 11,
  pouvoir Feu grégeois 16, Salve 19, bombe 21, Charge de poudre 22,
  mitraille 25, Séisme 31). Une bulle guide pas à pas, met en valeur le bon
  bouton et affiche la trajectoire ; la munition présentée reste disponible
  en Difficile. Désactivables dans les Réglages.
- **La Chronique** : récit de la campagne (prologue, un épisode par chapitre,
  épilogue), avec un emplacement prévu pour les illustrations ; les épisodes
  lus se relisent depuis la carte des niveaux. Texte provisoire, à enrichir.
- **Bande son adaptative** composée en direct (vielle, luth, flûte, tambourin,
  chalemie) : 4 morceaux selon le chapitre, 4 niveaux d'intensité qui suivent
  l'action, sous-titre « ♪ La musique s'emballe ». Volume séparé.
- **18 défis** au lieu de 8, en trois familles (style, exploit, thème) ; un de
  chaque par niveau, choisis selon le contenu, seuils croissants.
### Modifié
- **Niveau 9** : il devient le tutoriel du feu grégeois (rez-de-chaussée en
  paille, 2 pots de feu). Sans amélioration, il était presque impossible.
- Pouvoirs : Force du Titan après 7 niveaux, Feu grégeois après 15, Charge de
  poudre après 21, pour que chacun ait son niveau tutoriel. Niveau 5 plus venté
  (Accalmie), niveaux 16 et 22 sans la munition qui rendait le pouvoir inutile.
- **Or des défis** : 100 pièces par défi relevé, 50 de plus quand les trois
  défis d'un niveau sont réussis. Tout l'atelier (26 870 pièces) devient
  accessible au joueur perfectionniste (jusqu'à 42 500 pièces).
- Sauvegarde v4 : les anciens succès sont remis à zéro (défis renouvelés),
  l'or et les étoiles sont conservés.

## [3.1.0] – 2026-10-02
### Ajouté
- **Succès** : trois défis par niveau (300 en tout) : Puriste, Économe, Feu
  d'artifice, Régicide, Réaction en chaîne, Pyromane, Démolisseur, Sans artifice.
  Affichés avant et après chaque niveau, cumulables d'une partie à l'autre,
  comptés par le moteur de score (impossible de les déclarer depuis la console).
- **Atelier** : deux améliorations, Poix (zone de feu +35 %/niveau) et Poudre
  fine (explosions +15 %/niveau) ; bras et lest passent à 4 niveaux.
- Réglage **Puissance au début du tour** : 100 % par défaut (75 %, 50 % ou garder).
### Modifié
- **Étoiles au nombre de tirs** : 3 étoiles en un seul tir (deux pour les
  châteaux de 6 défenseurs ou plus), 2 étoiles en peu de tirs, 1 étoile sinon.
- **Or** : récompense la maîtrise (première victoire 30, nouvelle étoile 15,
  nouveau succès 25, victoire rejouée 5). Les améliorations coûtent bien plus cher
  et leurs meilleurs paliers exigent des étoiles : on ne peut pas tout acheter.
- **Feu** : le bois brûle jusqu'à céder (plus lentement que la paille, et il
  propage cinq fois moins) ; une cible qui s'enflamme succombe.
- Sauvegarde v3 : les profils existants gardent étoiles et or, leurs
  améliorations sont remboursées.
### Corrigé
- Si le feu ou un pouvoir abat les dernières cibles pendant la visée, la
  victoire est accordée tout de suite (il fallait tirer un boulet dans le vide).
- Un séisme lancé avant le premier tir arme désormais les règles de chute et de
  renversement : les défenseurs renversés comptent comme éliminés.
- Au dernier tir, la partie attend que le feu ait fini son œuvre avant de conclure.

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
