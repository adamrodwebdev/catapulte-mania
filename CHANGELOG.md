# Journal des modifications

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), numérotation [SemVer](https://semver.org/lang/fr/).

## [5.0.0] – 2026-10-08
### Terrains et créatures
- **Lacs** (dès le niveau 4) : un boulet qui touche l'eau ricoche une fois,
  puis coule au second contact ; un défenseur qui y tombe se noie. Le givre
  fige le lac en glace (on y glisse), le feu la refait fondre.
- **Lave** (dès le niveau 24) : tout projectile y fond, sauf le boulet de
  givre, qui la fige en une croûte de roche. Les défenseurs y brûlent, le bois
  s'y enflamme.
- **Neige** (dès le niveau 16, tout le chapitre Hiver) : le boulet y roule
  sans s'arrêter et grossit en boule de neige, de plus en plus lourde. Un
  boulet de feu la fait fondre là où il tombe.
- **Montagnes** (dès le niveau 8) : de la roche indestructible entre la
  catapulte et le château ; il faut tirer en cloche.
- **Créatures volantes** : des nuées de corbeaux (dès le niveau 12) arrêtent
  net les tirs qui les traversent ; une vouivre (dès le niveau 27) porte un
  pot de feu grégeois qu'elle lâche sur le château quand on l'abat. Leur vol
  dépend du seul temps de jeu (parties et relectures identiques).
- Chaque chapitre a sa dominante (Marais : lacs, Désert : lave, Montagne :
  montagnes, Hiver : neige et lacs gelés, Tempête : corbeaux, Trône : tout).

### Munitions et physique
- **Munitions débloquées tôt** : feu au niveau 3, rocher au 5, **givre** au 7,
  bombe au 10, mitraille au 14 ; une fois découvertes, elles restent
  disponibles.
- **Boulet de givre** (nouveau) : il gèle tout autour de l'impact. Les blocs
  gelés deviennent cassants (dégâts ×3, même le fer perd son blindage) et ne
  brûlent plus. Le feu au contact de la glace la fait éclater en **vapeur** :
  choc thermique qui fend le bloc, eau bouillante qui ébouillante les
  défenseurs proches, et réaction en chaîne sur les blocs gelés voisins.
- **Percée** : un projectile dont le choc détruit le bloc qu'il frappe le
  traverse et poursuit sa course avec l'énergie restante. Le rocher (et le
  boulet du Titan) perce plusieurs murs de pierre d'affilée ; une pierre
  ordinaire ne perce que le bois, la paille, le verre… ou un bloc gelé.
- **Chevaliers en armure** : ils encaissent les petits chocs (seuils ×2,2) ;
  des chevaliers montent la garde dès le niveau 15.
- **Garnison plus tôt** : défenseurs supplémentaires dès le niveau 3, barils
  dès le niveau 6, sentinelles sur les toits dès le niveau 18.

### Pouvoirs repensés (7)
- Œil du faucon (trajectoire entière jusqu'à l'impact, vent nul), Force du
  Titan (boulet géant qui perce la pierre), Pierre d'aimant (le tir
  s'infléchit vers le défenseur le plus proche), Météore (un toucher en vol :
  piqué vertical et onde de choc), Pluie de feu (cinq pots de feu grégeois),
  Colère du ciel (trois éclairs sur les points les plus hauts), Séisme.

### Accessibilité et confort
- **Bouton « aide à la visée »** à côté de « Tirer » : on l'active ou on la
  coupe à tout moment. La première fois qu'on joue sans elle (après les
  niveaux de premiers pas, démo comprise), une carte explique qu'elle est
  désactivée et comment la remettre.
- **Cris des soldats** synthétisés (sans fichier audio), désactivables dans
  les réglages ; sous-titrés pour les malentendants, comme tous les nouveaux
  sons (percée, givre, vapeur, eau, foudre, créatures).
- Aide : nouvelle rubrique « Terrains et créatures ».

### Contrôles
- Les 100 niveaux restent stables et gagnables en Difficile, à la catapulte
  comme au trébuchet, et les 10 niveaux de la démo aussi (contrôle
  automatique). Quelques réglages fins relevés par ce contrôle : pas de
  sentinelle sur deux toits qui oscillent (niveaux 28 et 68), gardes postés
  devant au niveau 66, un tir de plus quand une montagne s'ajoute à des douves.

### Succès, démo, relectures
- 3 nouveaux défis : Chasseur du ciel, Choc thermique, Terrain traître
  (21 défis au total).
- Démo : niveaux 1, 2, 3, 4, 5, 7, 10, 14, 24 et 39 (lac, montagne, lave,
  corbeaux, vouivre, chaque munition).
- Codes « Bats mon tir » en version 2 : instants de tir comptés depuis le
  début de la partie (les créatures volent pendant la visée). Les anciens
  liens ne sont plus acceptés.

## [4.6.0] – 2026-10-08
### Courbe de difficulté de la campagne
- **Distance** : les dix premiers niveaux restent proches, puis le château
  recule progressivement (jusqu'à environ 520 unités au niveau 100), toujours
  à portée de la catapulte et du trébuchet.
- **Décor** : nouvelle roche indestructible. À partir du chapitre 3, des
  châteaux se dressent sur un plateau rocheux bordé de talus (un défenseur
  qui en tombe ne se relève pas) ; à partir du chapitre 8, tous. Dès le
  niveau 57, une aiguille rocheuse derrière certains châteaux porte un baril
  de poudre à faire tomber sur le donjon.
- **Garnison** : jusqu'à 4 barils et 4 défenseurs de plus (devant les murs et
  à l'abri derrière), de plus en plus nombreux au fil des chapitres.
- Les 100 niveaux restent stables et gagnables en Difficile, à la catapulte
  comme au trébuchet (contrôle automatique).

### Récompenses de connexion
- Un coffre d'or par jour sur la carte des niveaux, sur un cycle de 7 jours
  (40 à 250 pièces) ; un jour manqué ramène au jour 1.
- Sauvegarde version 9, contrôlée : au plus un coffre par jour depuis la
  création du profil ; remettre l'horloge en arrière ne donne rien.

### Démo
- 10 niveaux choisis pour montrer le meilleur du jeu : premier tir, baril,
  point de rupture, trébuchet, boulet de feu, boulets lestés et barils,
  bombe et fer, mitraille, puis deux châteaux de fin de partie (plateau,
  aiguille et baril).
- **Atelier mis en avant** : dès que l'or suffit pour une amélioration, la
  carte des niveaux et l'écran de victoire le signalent, avec un accès direct.

### Caméra et finitions (4.5.1)
- Plan d'ouverture sur les défenseurs, gros plan sur le premier impact,
  cadrage serré sur les ruines ; étoiles de victoire animées ; premier baril
  dès le niveau 2.

## [4.5.0] – 2026-10-07
### Châteaux aux matières réalistes
- Chaque bloc reçoit un appareillage ajusté à sa taille, peint à partir de
  textures générées pixel par pixel : **pierre** taillée en assises (teinte
  propre à chaque pierre, arêtes, éclats, coulures), **brique** en quinconce,
  **grès** veiné en strates, **marbre** veiné et poli, **bois** en planches
  clouées et aboutées, **chaume** en bottes liées de ficelle, **fer** en tôles
  rivetées avec coulures de rouille, **vitrail** sous plomb translucide,
  **glace** translucide avec fractures, bulles et bords givrés.
- Baril de poudre à douelles et cercles de fer.
- Fissures à bord éclaté ; un bloc en feu noircit et sa braise palpite.
- Les textures sont préparées pendant le chargement (aucune saccade en jeu)
  et chaque bloc est recopié depuis une image en cache.

### Personnages vivants
- Personnages découpés en calques (corps, tête, bras ou écu) animés
  séparément : regard jeté derrière soi, lance soulevée puis reposée d'un coup
  sec, écu réajusté, sceptre brandi, hochements de tête, léger balancement.
- Quand un projectile est en vol, tous lèvent les yeux : les soldats pointent
  leur lance, les chevaliers lèvent leur écu, le roi brandit son sceptre.

### Sang en particules
- Plus de flaque posée d'avance (elle flottait en l'air quand le personnage
  était en haut d'une tour) : une gerbe de gouttes vole, retombe et tache le
  sol là où elle tombe ; une goutte qui rencontre un mur s'y écrase.

### Feu
- Le boulet enflammé reste brûlant 4,5 s après son premier choc : il met le
  feu au bois, à la paille, aux barils et aux personnages sur lesquels il
  rebondit, roule ou s'immobilise. La pierre, la brique, le fer, le verre et
  la glace ne prennent pas feu.

## [4.4.0] – 2026-10-07
### Engins et personnages redessinés
- **Matières réalistes** : bois de charpente veiné (texture générée pixel par
  pixel), arêtes éclairées, bois de bout à cernes, entailles ; fer forgé avec
  reflets et rivets ; cordes torsadées ; cuir cousu ; cotte de mailles.
- **Catapulte** : mangonneau à torsion avec écheveau de cordes tordues,
  rondelle de fer et levier, poteau d'arrêt et coussin de cuir, treuil
  arrière, roues à rayons cerclées de fer, flanc éloigné en profondeur.
- **Trébuchet** : poutres assemblées par ligatures et équerres, palier d'axe,
  caisse de contrepoids remplie de pierres, crochet de lâcher, fronde à deux
  cordes et poche de cuir, roues pleines.
- **Animations** : corde de rappel tendue tant que le bras est armé, flou de
  mouvement du bras au tir, contrepoids qui se balance, fanion qui ondule.
- **Personnages** : soldat en gambison et chapeau de fer, chevalier en grand
  heaume, mailles et écu armorié, roi en velours, hermine et couronne
  sertie ; visages ombrés. Ils respirent, clignent des yeux et grimacent ou
  tremblent quand ils sont touchés (le roi en perd sa couronne de travers).
- Le réglage « mouvements réduits » fige respiration, clignements et fanion.

### Performance
- Chaque engin et chaque personnage est dessiné une seule fois en image, à la
  résolution utile pour le zoom, puis recopié : l'image coûte moins cher
  qu'avant (mesuré : 53 à 58 images/s au repos, 44 à 46 pendant une explosion
  sur une machine sans carte graphique, contre 57 et 38 auparavant).
- Couvertures CrazyGames refaites avec les nouveaux engins.

## [4.3.0] – 2026-10-07
### Rendu et effets
- **Particules refaites** : fumée et poussière en volutes douces qui gonflent ;
  feu, braises, étincelles et éclairs en lumière additive (ils brillent) ;
  le bois se brise en échardes, la pierre en morceaux qui rebondissent au sol.
- **Chocs** : étincelles sur la pierre, le fer et le marbre, copeaux sur le
  bois, gerbe de terre quand un projectile touche le sol.
- **Explosions** : éclair, boule de feu, onde de choc, braises, colonne de
  fumée et trace de suie au sol.
- **Victoire** : pluie de confettis au-dessus des ruines.
- Scores flottants qui apparaissent en grossissant.
- **Décor** : nuages ombrés (dessous plus sombre), brume à l'horizon, voile
  atmosphérique sur les collines lointaines, rangées d'arbres, oiseaux,
  herbe en deux tons, couches de terre, blocs biseautés (arête éclairée,
  arête d'ombre).
- Couvertures et vidéos d'aperçu CrazyGames refaites avec ce rendu.

## [4.2.0] – 2026-10-07
Suite au refus CrazyGames (« qualité générale pas encore au niveau ») : les
premières minutes et l'interface de jeu revues.

### Prise en main
- **Premier tir réussi** : au niveau 1, la visée est déjà réglée pour toucher ;
  la trajectoire est montrée aux niveaux 1 à 3 quel que soit le réglage.
- **Tutoriel en images** : niveau 1 « appuyez sur Tirer », puis une main animée
  montre le geste (tirer vers l'arrière, relâcher) ; bulle d'une phrase,
  sans portrait, « Passer » en haut à droite.
- **Tirer, relâcher** : par défaut, relâcher après avoir tiré vers l'arrière
  déclenche le tir, comme une fronde.
- Portails : pas de générique du studio, sous-titres des bruitages désactivés
  par défaut (toujours disponibles dans les options).
- Le trébuchet se débloque après le niveau 3 (au lieu du 13) : ce qui
  distingue le jeu se voit dès les premières minutes.

### Interface
- **Barre de commandes compacte** : munitions + bouton Tirer, en bas à droite,
  sans panneau ; un petit repère « 35° · 47 % ». Les curseurs restent
  disponibles avec la nouvelle option « Visée précise ».
- Bandeau du haut allégé ; le terrain de jeu gagne environ un quart de
  l'écran.
- **Caméra** : pendant le vol, le sol et tout le château restent à l'écran ;
  l'impact et l'effondrement ne passent plus derrière les commandes.
- Fenêtres de début et de fin de niveau : les boutons (« À l'assaut ! »,
  « Niveau suivant ») restent visibles même sur un petit écran.

### Rendu
- Ombres de contact sous les blocs, les défenseurs et l'engin ; vignette
  légère.

### Technique
- Touche Échap retirée de la pause (réservée au navigateur sur les portails) ;
  P met en pause.
- Build sans publicité pour la période de test d'un portail
  (`npm run build:crazygames:basic`, variable `CTC_ADS=off`).

## [4.1.1] – 2026-10-05
### Corrigé
- **Versions portails : écran vide dans l'outil de test CrazyGames.** Le jeu y
  tourne dans un cadre isolé (iframe « sandbox ») où le navigateur refuse les
  modules JavaScript et les polices servis sans en-têtes CORS. Les versions
  portails sont désormais livrées en un script classique unique, polices
  intégrées au CSS. Vérifié dans des cadres isolés de tous types.
- Écran de jeu et atelier chargés de façon explicite : ils s'ouvraient mal
  quand tout le jeu tient dans un seul fichier (démo, portails).
- Démarrage plus robuste : délai maximal pour le SDK du portail, et si le
  démarrage avec le portail échoue, le jeu démarre quand même sans lui.

## [4.1.0] – 2026-10-05
### Modifié (conformité CrazyGames)
- **Vidéos récompensées hors du jeu** : l'indice de trajectoire et le pouvoir
  offert se proposent désormais sur l'écran d'introduction du niveau, plus
  jamais pendant qu'on joue (règle des portails). La récompense est gardée et
  utilisée ensuite : l'indice au premier tir, le pouvoir quand on le choisit.
- **Langue du portail** : sur CrazyGames, la langue fournie par le SDK passe en
  premier ; à défaut d'une langue disponible, l'anglais (et non plus le français).
- **Démarrage en un clic** sur les portails : un nouveau joueur qui clique sur
  « Jouer » part directement au premier niveau, avec un profil créé pour lui
  (nom par défaut, difficulté Normale) ; le tutoriel le guide en jeu.
- **Son coupé par le portail** : le jeu suit le réglage « muet » du site
  CrazyGames (SDK), en plus de ses propres réglages.
### Outillage
- Règles ESLint recommandées lues dans ESLint (le paquet @eslint/js 10.0.0,
  obsolète, est retiré) ; package-lock.json ajouté ; Node 22 ou 24.

## [4.0.2] – 2026-10-05
### Corrigé
- **Atelier** : le château en construction n'était jamais enregistré (nom de
  stockage refusé par le service de stockage, erreur passée sous silence).
  Après avoir pris son château, on revenait donc à un atelier vide et le
  partage restait impossible. Le brouillon est désormais bien conservé, et la
  preuve qu'on a pris son château est mémorisée sur l'appareil.
- Contrôles automatiques GitHub : l'étape « Style du code » repasse au vert.

## [4.0.1] – 2026-10-05
### Modifié
- Le studio s'appelle désormais **Adamrodwebtech** : générique de lancement,
  page « Confidentialité et mentions », page privacy.html, balise auteur.
- Adresse de contact affichée : adamrodwebdev@gmail.com.

### Ajouté
- **Verrou du site Netlify** : la version publiée sur notre site n'est ouverte
  qu'aux appareils autorisés (deux). Une clé d'accès par appareil, liée au
  premier appareil qui la saisit (cookie signé HMAC-SHA-256, HttpOnly, Secure ;
  liaison mémorisée dans Netlify Blobs). Sans cookie valide : page de saisie
  (401), rien n'est servi ni indexé. Fermé par défaut si la configuration
  manque. La démo et les versions portails ne sont pas concernées.

## [4.0.0] – 2026-10-04
### Ajouté
- **Siège sans fin** : des châteaux qui s'enchaînent, de plus en plus durs
  (de plus en plus loin dans la campagne). 6 tirs au départ, +3 par château
  abattu (+4 du premier coup), les tirs restants passent au château suivant.
  Records (score, châteaux) dans le profil. Débloqué après 10 niveaux.
  Anti-triche : le siège n'avance qu'avec des résultats authentiques du moteur,
  chacun une seule fois et pour le bon château.
- **Atelier de châteaux** (éditeur) : étages, murs, poutres, socles, toits, en
  9 matériaux, défenseurs et barils. Les pièces s'empilent ; défenseurs et
  barils se placent dans l'étage visé. Annuler, tout effacer, brouillon
  conservé, réglages (nom, décor, tirs, vent, munitions). Jouable au clavier.
  **Pour partager son château, il faut l'avoir pris soi-même** ; le lien
  (`#chateau=` ou lien du portail) est validé champ par champ puis reconstruit
  par le même schéma que les 100 niveaux.
- **Autres modes** : nouvel écran (siège sans fin, atelier, deux joueurs).
- **Vidéos récompensées supplémentaires** (portails, campagne solo, toujours
  facultatives, une fois par niveau) : indice de trajectoire pour un tir,
  pouvoir offert sans coût en points. Jamais en défi (équité).
- **Événements saisonniers** : la Nuit des citrouilles (15 octobre – 2 novembre)
  et le Siège d'hiver (15 décembre – 6 janvier). Décor de saison en jeu,
  bandeau d'accueil, et une traînée offerte (Citrouille, Flocons) pour une
  victoire au défi du jour pendant l'événement. Cosmétiques jamais vendus.
- **Préparation des boutiques** : manifeste complété (identifiant, captures),
  guide `docs/BOUTIQUES.md` (portails, Microsoft Store, Google Play, App Store).
### Modifié
- Sauvegarde **v8** (siège sans fin). Migration automatique.
- Niveau 85 : vent plus doux ; niveau 88 : un rocher et deux bombes de plus.
  Vérifié : 100/100 en Difficile, à la catapulte comme au trébuchet.

## [3.9.0] – 2026-10-04
### Ajouté
- **Défi du jour** : chaque jour, le même défi pour tous (un niveau et un engin
  tirés au sort à partir de la date, sans serveur). Difficulté Normale, sans
  pouvoirs ni améliorations. **Série** de jours réussis d'affilée (rompue après
  un jour manqué, insensible à une horloge reculée), record du jour, meilleure
  série. Accès depuis l'accueil.
- **« Bats mon tir »** : après une victoire, un lien à envoyer à un ami.
  - Le lien contient **les gestes**, pas le score : niveau, engin, munitions,
    angles et puissances, ou instants du lâcher, datés au pas de simulation près.
  - Le jeu les **rejoue dans le moteur** pour calculer le score à battre : un
    lien truqué ne peut pas afficher un faux score.
  - On peut regarder le tir de l'ami avant de jouer, puis renvoyer le défi.
  - Sur les portails, le lien d'invitation du portail est utilisé (CrazyGames
    `inviteLink`, Poki `shareableURL`) ; sur notre site, une adresse `#defi=`.
  - Partage natif sur mobile, sinon copie du lien.
- **Portails** : célébration du portail sur un record ou une série
  (CrazyGames `happytime`), progression de la campagne remontée au portail.
### Sécurité
- Le code d'un défi est une donnée non fiable : taille bornée, décodage sans
  `eval`, schéma strict champ par champ, pouvoirs et scores refusés, niveau et
  engin vérifiés contre le défi du jour quand le lien en porte la date.
### Modifié
- Sauvegarde **v7** (série et records du défi du jour). Migration automatique.

## [3.8.0] – 2026-10-04
### Modifié
- **Le jeu s'appelle désormais Catapulte Mania** (titre en jeu, page, partage,
  application installable). Les sauvegardes existantes sont conservées.
- **Trébuchet rééquilibré** : le ralenti du balancier devient variable. La
  montée du bras passe vite (≈ 1,2 s), puis le mouvement ralentit nettement dans
  la fenêtre de tir : ≈ 1,1 s pour choisir l'instant (contre ≈ 0,6 s avant).
  « Balancier lent » allonge la fenêtre à ≈ 1,6 s sans faire attendre la montée.
- Sur les portails (public familial), **le sang est désactivé par défaut**.
### Ajouté
- **Balancier infini** (réglage, sauf en Difficile et donc à deux) : sans second
  clic, le bras revient en position et recommence, à l'identique.
- **Générique du studio Solo Levelling** au lancement (2,6 s, une fois par
  session, passable d'un clic ou d'une touche, fixe en mouvement réduit,
  entièrement en CSS et SVG).
- **Page « Confidentialité et mentions »** dans le jeu, et `privacy.html` pour
  les fiches des portails.
- **Visuels des fiches** générés depuis le jeu (`docs/store/`) : couvertures
  paysage, portrait et carrée, image de partage, captures.

## [3.7.1] – 2026-10-04
### Modifié
- **Tous les niveaux sont désormais gagnables au trébuchet**, en Difficile
  (vérifié par le joueur automatique, comme à la catapulte) :
  - le trébuchet lance des **pierres plus lourdes** (×1,5) : ses tirs plongeants
    enfoncent les planchers jusqu'aux étages bas ;
  - **poudrières** ajoutées au pied des grandes tours des niveaux 36, 65, 88 et
    96 : un point faible accessible aussi aux tirs en cloche ;
  - niveau 47 : un tir de plus, vent plus doux et deux bombes ; niveau 96 : un
    tir, un rocher et deux bombes de plus (marbre et fer, il restait le plus
    dur) ; niveau 100 : deux bombes de plus (la tempête finale est conservée).
- Les mêmes niveaux restent gagnables à la catapulte (vérifié).

## [3.7.0] – 2026-10-04
### Ajouté
- **Le trébuchet**, un second engin de siège qui se joue **uniquement au clic** :
  - 1er clic : le contrepoids tombe, le bras se met à tourner ;
  - 2e clic : la fronde lâche le projectile. Lâcher tôt = tir en cloche (trop
    tôt : il part en arrière) ; lâcher tard = tir tendu (trop tard : dans le sol) ;
  - **physique réelle** : bras mû par son contrepoids (pendule amorti), projectile
    = masse au bout d'une corde (Verlet + contrainte), qui glisse dans l'auge puis
    décolle ; il part avec la vitesse exacte qu'il avait au lâcher. Simulation à
    pas fixe : un même instant de lâcher donne toujours le même tir ;
  - le lâcher correspond à l'**instant exact du clic** (le temps écoulé depuis la
    dernière image est compté), et non à l'image suivante ;
  - en retrait de la catapulte : **le château est plus loin**, mais le trébuchet
    frappe plus fort ; l'amélioration « Bras renforcé » alourdit son contrepoids ;
  - **caméra qui suit le tir** en gardant le sol à l'écran (elle dézoome quand le
    projectile monte), puis reste sur le château pendant l'effondrement ;
  - dessiné par le code (châssis, bras effilé, caisse de contrepoids, fronde), sons
    synthétisés (chute du contrepoids, grincement).
- **Déblocage** après le niveau 13 ; **le niveau 14 devient son niveau
  d'apprentissage** (tutoriel guidé, trébuchet imposé au premier passage, réplique
  de Maître Gontran). Ensuite, **choix de l'engin dans l'introduction de chaque
  niveau** (campagne, mode libre, et à deux sauf au face-à-face), mémorisé.
- **Commandes du trébuchet** : cadran de l'angle et de la vitesse du moment,
  bouton « Armer » puis « Lâcher ! », Espace ou Entrée au clavier.
- **Accessibilité** : réglage « Balancier lent » (bras deux fois plus lent) ;
  **tic sonore** de plus en plus aigu à chaque tranche de 15° de l'angle de tir
  (lâcher à l'oreille) ; sous-titre « Le contrepoids tombe » ; annonces adaptées
  aux lecteurs d'écran ; avec l'aide à la visée, la trajectoire du tir « si je
  lâchais maintenant » s'affiche en direct pendant le balancier.
- Contrôleur de niveaux : `--engine trebuchet` (le joueur automatique choisit
  l'instant du lâcher).
### Modifié
- Monde étendu vers l'arrière (traînées de vent, limites de sortie) pour le trébuchet.
- Aucun changement de sauvegarde : le déblocage se déduit de la progression.

## [3.6.0] – 2026-10-04
### Modifié
- **Le vent devient un vrai enjeu en Difficile** (Facile et Normal inchangés) :
  - 2,4 fois plus fort, et jamais une simple brise : un tir tendu dévie
    désormais de 30 à 50 px par vent moyen (contre 15), un tir en cloche de
    plusieurs centaines ;
  - **plus fort en altitude** (×1,6 à 800 px) : tendu ou en cloche devient un
    vrai choix ;
  - **rafales** : des fronts qui traversent le terrain dans le sens du vent ;
    le même tir ne tombe pas au même endroit selon l'instant ;
  - **prise au vent selon le projectile** (surface / masse) : le boulet résiste
    (×0,4), la mitraille s'envole (×1,5) ;
  - **le vent attise le feu** et le pousse dans son sens.
- **Aide à la trajectoire** : tient compte de l'altitude, du projectile choisi
  et de la rafale du moment (la courbe ondule avec le vent) ; les rafales à
  venir restent à anticiper.
- Le contrôleur de niveaux vise comme l'aide : les 100 niveaux restent
  réussissables en Difficile. Quatre niveaux rééquilibrés pour cela :
  30, 65 et 96 (vent modéré), 85 (vent modéré, un rocher et une bombe de plus).
### Ajouté
- **Représentation visuelle du vent** : traînées d'air (nombre = force, vitesse
  = force locale, plus rapides en altitude, plus claires dans une rafale qui
  approche), manche à air près de la catapulte, fanion au sommet du château,
  nuages, fumée et flammes qui suivent le vent. Mouvement réduit : traînées
  immobiles avec pointe de direction.
- HUD : vitesse réelle en km/h, couleur selon la force (brise, vent fort,
  tempête), badge « Rafale ».
- Accessibilité : son et sous-titre « Rafale de vent » (malentendants), vent
  lu aux lecteurs d'écran avec sa force et ses rafales ; aide mise à jour.

## [3.5.0] – 2026-10-03
### Ajouté
- **Versions pour les portails** : `npm run build:crazygames` et
  `npm run build:poki`. Chaque version embarque uniquement le SDK de son portail ;
  la version de notre site n'en contient aucune trace et reste sans publicité.
- **Service de publicité** orienté objet (`AdService`, une sous-classe par
  portail, `NoAdService` pour notre site) et règles de fréquence (`AdPolicy`) :
  publicités seulement entre deux niveaux, pas avant deux niveaux joués, au
  plus une toutes les 3 minutes ; son coupé et jeu masqué pendant la vidéo.
- **Vidéos récompensées, toujours facultatives** : un dernier tir quand les
  munitions sont épuisées (une fois par partie, campagne solo), ou l'or d'une
  victoire doublé.
- **Tickets de récompense** (anti-triche) : une récompense n'est accordée que
  contre un ticket émis après une vidéo vue en entier, à usage unique.
- **Sauvegarde synchronisée** sur CrazyGames (module `data`), avec reprise des
  profils déjà présents sur l'appareil.
### Modifié
- **Langues chargées à la demande** : seul le dictionnaire du joueur est
  téléchargé (−62 Ko au premier chargement) ; les autres le sont s'il change
  de langue. La démo en fichier unique les contient toujours toutes.
- Sauvegarde **v6** : l'or gagné grâce aux vidéos est compté à part et plafonné
  (jamais plus que l'or gagnable en jouant). Migration automatique.
- CSP par plateforme : stricte sur notre site, ouverte en HTTPS aux régies
  publicitaires sur les portails (toujours sans `eval` ni plugin).

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
