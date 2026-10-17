# Journal des modifications

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), numérotation [SemVer](https://semver.org/lang/fr/).

## [6.2.0] – 2026-10-17
### Des châteaux qui tiennent ensemble
- **Assemblage des châteaux** (`CastleJoints.js`) : au premier tir, chaque bloc
  est soudé à ses voisins (appui, contact de côté) et les fondations au sol,
  par un liant qui dépend des matériaux : mortier (pierre, brique, grès,
  marbre), chevilles (bois), liens (paille), rivets (fer), glace, plomb
  (verre) ; entre deux matériaux, le plus faible l'emporte. Un coup use les
  jonctions du bloc frappé selon son énergie et propage le choc, atténué, à
  ses voisins ; une charge qui dure (porte-à-faux, bascule) les use aussi.
  Usée, une jonction se lézarde, craque, puis cède : le château encaisse,
  fléchit et s'effondre par morceaux. Le feu ronge chevilles et liens et fait
  fondre la glace, le gel rend les jonctions cassantes, une explosion les
  arrache dans son rayon.
- **Clés de voûte** : les blocs qui portent le plus sans relais ont des
  jonctions déjà fragiles, et une lézarde les signale. Entamées, elles se
  désagrègent et lâchent tout ce qu'elles tiennent. Une carte les présente au
  niveau 5.
- **Combos d'éléments** (`ElementCombos.js`), annoncés dans le ciel : **fer
  rougi** (le feu chauffe le fer, qui enflamme le bois et la paille voisins et
  brûle qui le touche), **trempe** (du givre ou de l'eau sur du fer rougi : il
  se fend), **fer électrisé** (la foudre le laisse chargé un instant), **eau
  électrisée** (la foudre court chez tous les défenseurs trempés), **éclats de
  glace** (une explosion brise la glace, dont les éclats blessent alentour),
  **vapeur brûlante** (glace et feu).
- **Ailes** : les châteaux ne sont plus symétriques. Une annexe s'accole au
  château (une seconde dès le niveau 40, derrière s'il reste à portée), chacune
  défaite par sa munition : remise de paille (le feu), bastion de glace (le feu
  ou la bombe), poudrière (deux barils derrière un mur), galerie de verre sur
  pilotis (la mitraille), casemate de fer (la foudre, le fer rougi), baril
  perché sur un mur (la botte de paille). Chacune abrite un des gardes :
  autant de défenseurs qu'avant. Jamais là où s'abat un pont-levis.

### L'engin roule
- **Avancer et reculer** (dès le niveau 2) : maintenez ◀ ou ▶ sous la scène
  (Q et D en AZERTY, A et D en QWERTY) entre deux tirs. La catapulte et la
  baliste roulent, roues qui tournent, poussière, grincements, et se cabrent à
  l'accélération. La roche, l'eau, la glace, la lave, un débris ou un
  défenseur les arrêtent, et elles ne s'approchent jamais du château plus près
  que la portée de ses archers, que des flèches plantées au sol montrent (au
  plus 380 px d'avance, jusqu'au bord du camp en arrière). De plus près, le
  tir est plus sûr… mais les pillards arrivent plus vite. Un pillard qui
  frappait l'engin ne l'atteint plus s'il recule, mais le rattrape au tir
  suivant. Le trébuchet reste en place.
- Chaque déplacement est noté au pas près : les relectures et les liens
  « Bats mon tir » refont le même chemin.

### Pillards et grands sièges
- **Des pillards avant chaque grand siège** : les trois derniers niveaux de
  chaque chapitre (le grand siège compris) en ont au moins un, soit 21
  niveaux de plus. Au niveau 8, le tout premier attend embusqué dans le champ,
  de ce côté-ci de la montagne et des douves : il jaillit au premier tir et
  court droit sur l'engin (une seule idée : le pillard et le seau d'eau).
- **Des pillards qui pressent** : le saboteur et l'ogre chargent l'engin,
  échelles et ponts se dressent plus vite (2 s et 2,5 s au lieu de 3 et 4),
  on grimpe plus vite et l'on se laisse glisser pour descendre. Le pillard
  atteint désormais l'engin vers le troisième tir (le quatrième pour l'ogre
  qui franchit la montagne au niveau 98) ; il lui en fallait jusqu'à six, si
  bien qu'aux niveaux 32, 37, 71 et 95 la menace ne se faisait jamais sentir.

### Interface
- **Barres de vie** (`HealthBar.js`), les mêmes pour les défenseurs, les
  généraux et l'engin : une pilule de verre découpée en cellules (on compte
  les coups qu'il reste), du vert à l'ambre puis au rouge, teintée par le
  poison, le feu ou le gel. Un coup se voit : éclair, sursaut, petite
  secousse, le morceau perdu se détache et tombe, et la traînée claire se
  vide en douceur. En danger, la barre bat en rouge ; un défenseur en armure
  a un liseré d'acier. Rien de tout cela ne bouge en mouvement réduit.
- **Infos en haut de l'écran** : les sous-titres et l'astuce de visée passent
  sous le bandeau (sous la barre du général pendant un grand siège), trois au
  plus à la fois : le bas de l'écran, où se joue la partie, reste dégagé.
- **La caméra ne suit plus un boulet qui roule au loin** : après l'impact,
  elle ne suit un tir que tant qu'il laboure le château. Un boulet qui file
  au-delà du château, repart vers l'engin ou survit à la dernière cible
  s'efface dans un petit nuage de poussière, au lieu de retenir le tour.

### Repères des défenseurs
- **Le dernier défenseur debout** est désigné par un chevron d'or qui flotte
  au-dessus de lui, où qu'il soit.
- **Un défenseur au bord de l'écran** : pendant la visée, quand un défenseur
  atteint la marge droite de la scène visible, ou passe au-delà, une pastille
  au bord de l'écran, à sa hauteur, pointe vers lui (d'or si c'est le
  dernier, double chevron quand plusieurs sont proches).
- Chevron et pastilles battent doucement, immobiles en mouvement réduit, et
  passent au jaune vif en contraste élevé. Ni l'un ni l'autre au face-à-face.

### Décor
- **Montagnes redessinées** (`mountains.js`) : une crête fractale (sommets,
  épaulements, cols), des versants éclairés côté soleil et à l'ombre de
  l'autre, une neige découpée dans la silhouette même (elle ne déborde plus),
  et des panaches de neige, de sable ou de poussière que le vent arrache aux
  crêtes, dans son sens et à sa force (aucun en mouvement réduit).
- **Fonds peints** : un paysage réaliste par chapitre, calé sur la ligne de
  sol du jeu (2560 px de large, WebP, 1,7 Mo pour les dix), dans la version
  web seulement : les versions des portails et la démo gardent le décor
  dessiné. `npm run backgrounds` rogne et encode les peintures
  (`art/backgrounds/`, non versionnées), et y efface les oiseaux peints
  (34, figés dans sept chapitres) : le jeu dessine les siens, qui volent.
  Le Fort de pierre a sa propre peinture (ce n'était qu'une variante plus
  grise de la vallée du chapitre 1) : des hautes terres de granit après
  l'averse, bruyère et herbe dorée, chaos de rochers, une cascade, un vieux
  pont de pierre au loin et une trouée de lumière dans les nuages.
  Chaque oiseau est comblé depuis son entourage (ciel, nuage, crête,
  pluie), les peintures d'origine restent intactes. Elle efface aussi ce
  qui doublait l'animation : la pluie de l'orage (chapitre 9) et les flocons
  de l'hiver (chapitre 8, 25, sur le ciel uni seulement : les sommets
  enneigés restent), que le jeu fait tomber, et les étoiles filantes figées
  de la nuit (chapitre 4, la lune épargnée). Chaque trait est repéré à son
  sens et repeint de la couleur du ciel, de part et d'autre.

### Maîtrise du royaume
- **Toutes les étoiles et tous les succès** (300 de chaque) font du joueur le
  **Grand Ingénieur du Royaume** : un titre et un écusson d'or sur le profil
  et l'accueil, et des récompenses qui ne s'achètent pas.
- **L'Engin d'or** (catapulte, trébuchet et baliste dorés, bannière royale à
  liseré et couronne d'or) et **la Comète d'or**, une traînée d'étincelles
  derrière le tir.
- **La Légende du Grand Ingénieur** : une page cachée de la Chronique,
  l'épilogue du royaume.
- **Les Terres du Duc** : un chapitre secret de cinq châteaux à médailles
  (bronze, argent, or) : le Gué du Duc, la Forge Royale, le Palais de Glace,
  les Aiguilles et la Citadelle de Mordrac, où le duc attend au sommet. La
  jauge de destruction y donne sa pierre de plus, comme dans la campagne.
- **Campagne héroïque** (nouvelle partie +) : la même campagne, plus dure,
  avec ses propres médailles. Châteaux plus solides (blocs +35 %, défenseurs
  +25 %, jonctions +50 %, renforts et rempart de glace des généraux compris),
  un tir de moins (jamais moins de deux), un
  pillard de plus dès le niveau 4 (de givre en hiver, trois au plus), vent
  plus fort (×1,3). Elle ouvre les **paliers héroïques de l'atelier**, un de
  plus pour le Bras renforcé, les Boulets lestés, la Poix, la Poudre fine, la
  Réserve de munitions, le Stratège et l'Éclaireur ; l'atelier les montre,
  fermés, tant qu'elle n'a pas commencé.

### Succès
- **Chute libre** se valide enfin : il suffit qu'un défenseur tombe de plus
  de 120 px sous son poste et touche durement le sol ; s'il meurt dans les
  1,5 s qui suivent, sous les débris ou d'un coup, la chute compte.

### Niveaux
- **Tous les niveaux se gagnent avec la pierre de départ** : le contrôle des
  niveaux le vérifie (`--ammo stone`, voir plus bas).
- **L'aiguille de roche** (un niveau sur trois à partir du 57, sauf le 96) se dresse de
  nouveau contre les murs, son baril au-dessus du donjon : l'aile arrière
  l'en éloignait. La roche ne tombe jamais : un défenseur posté derrière s'y
  mettait à l'abri de toute pierre, et s'y réfugiait même quand un tir
  arrivait sur lui. Elle tient donc l'arrière : plus personne ne s'y poste
  (jusqu'à deux gardes et un éclaireur de moins, l'aile arrière passe devant), et
  aucun baril dans son ombre.
- **Niveau 84** (la crypte du chevalier noir) : la tour d'à côté est en
  brique, sur ses planchers de fer. Toute de fer, et rivetée par
  l'assemblage, aucune pierre ne l'ouvrait.
- **Niveau 92** (la galerie des glaces) : un tir de plus (six) ; à la seule
  pierre, il restait un défenseur.
- **Niveau 96** (l'escalier d'honneur) : cinq marches serrées, d'un à cinq
  étages (trois à sept auparavant), et plus d'aiguille de roche. Au fond du
  champ, le sommet de sept étages était hors de portée de la pierre, même
  l'engin avancé jusqu'aux archers ; l'aiguille, collée à la plus haute tour,
  la calait. Le roi se tient désormais sur la terrasse du dernier gradin, à
  découvert : sous son toit de pierre, comme le garde du deuxième étage, il
  était emmuré dans le fer et le marbre. Les gardes que cette tour abritait se
  postent devant, comme au niveau 78.
- **La Citadelle de Mordrac** (Terres du Duc) : le rez-de-chaussée du donjon
  n'est plus que sa poudrière. Sous cinq étages de marbre et de fer, le garde
  qui s'y tenait était hors d'atteinte de la pierre ; le baril y reste pour
  les bombes. Et l'escalier de Mordrac a six tirs au lieu de quatre : Mordrac
  a quatre vies et n'en perd qu'une par tir ; à la seule pierre, ses renforts
  finissaient par l'emporter. Le par ne change pas : l'or reste à quatre tirs.
- **Résultats mesurés** (joueur automatique) :
  - **à la seule pierre de départ**, en Normal et sans amélioration : les 100
    niveaux de la campagne se gagnent (2,4 tirs en moyenne, 42 d'un seul
    tir), les niveaux 38, 73 et 92 sans rouler ; les cinq châteaux des Terres
    du Duc aussi, la Citadelle de Mordrac en visant d'abord le chef ;
  - **en Difficile**, toutes munitions : 100/100 et 5/5. La tolérance médiane
    des premiers tirs passe de 1,6 % à 0,4 % (moyenne : de 10,2 % à 5,1 %), et
    le joueur automatique a besoin de plus d'un tir sur 29 niveaux (26
    auparavant) : assemblés, les châteaux ne cèdent plus à un tir chanceux ;
  - **au trébuchet**, en Difficile : 100/100 (1,9 tir en moyenne, 65 d'un
    seul tir ; tolérance médiane des premiers tirs 0,6 %, moyenne 6,6 %) ;
  - **en Campagne héroïque** : les grands sièges des niveaux 70, 80 et 100,
    les plus durs, se gagnent en quatre ou cinq tirs.

### Outils
- **Profil de test** (développement seulement) : `npm run dev:unlocked`, ou
  `?unlock=all` dans l'adresse, ouvre toute la campagne sur un profil
  « Test » (sans étoile ni or, les vrais records restent) ; `?unlock=complete`
  le rend maître du royaume, pour essayer ses récompenses.
- `npm run check:levels` : `--ammo stone` (le joueur automatique ne tire que
  la pierre de départ), `--track heroic|duke` (Campagne héroïque, Terres du
  Duc). Le joueur automatique prépare chaque tir à l'instant où il part
  (défenseurs en marche, bras gelé qui lance moins loin : il s'arrêtait,
  croyant tout hors de portée), et roule comme un joueur : à chaque tour, il
  pèse aussi l'avance de l'engin jusqu'à la portée des archers et les tirs de
  là-bas ; s'il perd après avoir roulé, il rejoue le niveau sans rouler. Face
  à un général, s'il perd encore, il le rejoue en visant d'abord le chef (une
  vie de général pèse alors plus que trois défenseurs ; `--boss` : d'emblée).
  `--workers 4` : au plus quatre cœurs à la fois, plus lent, mais l'ordinateur
  chauffe moins. Tous les cœurs partagent une file de rejeux : les tirs essayés
  d'un même tour se répartissent entre eux, et les niveaux les plus longs
  passent devant, au lieu d'un cœur par niveau. Mêmes choix, mêmes résultats
  (vérifié niveau par niveau), environ trois fois plus vite sur une machine
  déjà chargée (la Citadelle de Mordrac : 6 min au lieu de 18).

### Technique
- Sauvegarde v11 (maîtrise, Campagne héroïque, Terres du Duc), migrée depuis
  la v10 et contrôlée comme les autres champs : un record héroïque exige une
  campagne héroïque commencée, l'Engin d'or la maîtrise.
- Un défenseur projeté au-delà du bord du monde quitte le champ de bataille et
  compte comme tombé (il y restait hors champ, hors d'atteinte) ; un général
  aussi, sans revenir.
- Une étape compte jusqu'à 24 défenseurs (20 auparavant) : la Campagne
  héroïque ajoute un pillard aux étapes déjà pleines.
- Lighthouse (mobile, version web) : Performance 98, Accessibilité 100,
  Bonnes pratiques 100, SEO 100. Le module des niveaux, préchargé au
  démarrage, passe de 169 à 78 Ko : l'accueil et les menus ne chargent plus
  Matter.js, qui arrive avec la première partie.

### Architecture : dessin, logique et règles séparés
- **GameSession** ne garde que la logique de la partie : le déplacement de
  l'engin passe dans `drive/` (EngineDrive, ses règles, son affichage), les
  effets (particules, sons, sous-titres, répliques) dans
  `effects/SessionEffects.js`, la sensation de jeu (arrêts sur image, ralenti,
  gros plan) dans `feel/GameFeel.js`. Les modes disent ce qu'ils permettent
  (deux camps, aides de la campagne) au lieu d'être reconnus à leur nom.
- **Courbe de la campagne** : l'algorithme de placement seul dans
  `LevelCurve.js` ; les règles (selon le rang) dans `campaignRules.js`, les
  plans des ailes dans `wingBlueprints.js` (une table au lieu d'une cascade de
  conditions).
- **Physique** : `PhysicsWorld.js` garde la simulation ; les réactions des
  éléments (feu, gel, vapeur, foudre) passent dans `ElementReactions.js`, les
  contacts des défenseurs (coups, chutes, renversements) dans
  `DefenderContacts.js`, les réglages dans `physicsRules.js` (réexportés sous
  les mêmes noms), et tous les combos dans `ElementCombos.js`. Un seul modèle
  d'événement « blessure » pour les coups, les chutes et les décharges.
- **Règles sans moteur physique** : celles de l'assemblage des châteaux
  (`castleRules.js`) et des créatures volantes (au catalogue). La géométrie de
  la catapulte vit avec la catapulte : la physique ne dépend plus du dessin.
- **Rendu** : `Renderer.js` ne fait plus qu'ordonner les calques (environ
  200 lignes) ; chacun a son peintre : décor, lumière, ouvrages et jonctions,
  états (clé de voûte, fer rougi, givre), nuages, engins, repères au-dessus
  des personnages, visée. `EntityViewAdapter` dit ce que le dessin lit de
  chaque entité. Les particules se dessinent à part (`ParticlePainter.js`),
  les palettes des chapitres sont des données (`themes.js`, `palette.js`), et
  chaque son est une recette (`soundRecipes.js`) faite de briques de synthèse
  (`SynthVoices.js`), au lieu d'un grand `switch`. Les entités ne lisent plus
  l'horloge du navigateur : le sursaut d'un défenseur touché suit le temps du
  jeu (pause, ralenti).
- **Interface** : l'écran de jeu affiche, il ne décide plus. La préparation
  d'une partie (`MatchSetup.js`), la fin de partie de chaque mode
  (`EndOfMatch.js`, une stratégie par mode), la vue du profil
  (`ProfilePresenter.js`), les mises en forme (`Formats.js`), les touches
  (`useGameKeyboard.js`), les parcours (`Tracks.js`), le front de la
  campagne et les records du défi du jour (`Frontier.js`, `DailyRecords.js`),
  le partage et le brouillon de l'atelier de châteaux (`ShareService.js`,
  `CastleDraftService.js`) ont chacun leur module ; l'offre d'une amélioration
  n'a plus qu'une règle (`SaveSlot.upgradeOffer`). Les couleurs des médailles,
  de l'écusson et des barres de vie sont des jetons des thèmes, et chaque
  commande tactile fait au moins 44 × 44 px.
- **Preuve que rien ne change** : une empreinte de 131 parties scriptées
  (score, survivants et leurs points de vie, château, jonctions, engin,
  interface, scène, chaque événement émis, particules, caméra), sur tous les
  modes et parcours, et des 215 niveaux générés, identique avant et après
  chaque étape de la réorganisation ; seuls les correctifs ci-dessous la
  changent, là où on l'attend. Des tests gardent les frontières
  (`separation.test.js`, `v62-physics.test.js`).

### Corrigé
- **Contraste élevé** : le réglage atteint enfin le jeu lui-même (visée,
  trajectoire et repères en jaune vif, barres de vie sur fond noir, sans
  poussières d'ambiance) ; il ne changeait que les menus.
- **Le pillard de feu qu'engage un général** porte sa torche, comme les
  autres : on le reconnaît, elle éclaire la nuit, et elle met le feu autour
  de lui quand il tombe.
- **Les renforts d'un général** ont la solidité des autres défenseurs : le
  coup de pouce après des défaites répétées (premier chapitre) les oubliait.
- **Victoire sans tir** (le feu ou un séisme achève le dernier défenseur
  pendant la visée) : la relecture conclut au même instant ; elle s'arrêtait à
  la visée, et un défi « Bats mon tir » ne comptait pas la victoire.
- **L'état de l'engin** (feu, gel, rouille) avance au pas de la physique, et
  non à chaque image : une partie et sa relecture restent les mêmes, quelle
  que soit la cadence de l'écran.
- **À deux et au siège sans fin**, une sauvegarde refusée (stockage plein,
  navigation privée) n'empêche plus le bilan de s'afficher, avec son
  avertissement.
- **Angle et puissance** s'écrivent dans la langue du joueur (« 45,5° » en
  français, « 45.5° » en anglais), à l'écran comme pour les lecteurs d'écran.

## [6.1.0] – 2026-10-15
### Des défenseurs qui encaissent, des chocs qui portent
- **Points de vie pour tous les défenseurs**, comme les généraux : soldat 30,
  chevalier 70, roi 40, éclaireur 20, pavoisier 50, porte-étendard et sapeur
  30, ogre 420. Blessé, un défenseur porte une barre de vie (crantée, la perte
  s'efface avec un temps de retard) et chaque coup affiche ses dégâts, de la
  couleur de leur cause (choc, feu, poison, foudre…). Réglage « Barres de
  vie », activé par défaut. Il lui arrive de crier quand il encaisse
  (« Ouille ! »).
- **Module des chutes** (`FallingObjects.js`, pur et testé) : vitesse d'un
  objet qui tombe et vitesse au contact (√(v² + 2gh)), images avant le
  contact, énergie et dégâts d'un choc, dégâts d'une chute, capacité de
  poussée d'un défenseur.
- **Des chocs qui comptent** : un coup coûte selon son énergie et la dureté de
  ce qui frappe (paille 0,3, verre 0,8, bois 1, pierre 1,2, fer 1,4) ; une
  chute, au-delà de 4 px par image à l'arrivée, selon la vitesse (l'armure
  amortit) ; renversé, un défenseur perd 35 % de ses points et se relève ;
  écrasé sous une lourde charge ou coincé entre deux blocs, il succombe.
- **Impact et puissance** : le survivant d'un coup recule et chancelle, la
  caméra encaisse le choc, et un gros coup projette le bloc frappé dans le
  sens du tir.
- **Repousser ce qui tombe** : un défenseur voit venir une planche, un
  tonneau ou un bloc qui tombe lentement, s'arc-boute et le rejette de côté
  (« Hop là ! »), s'il en a la force (un chevalier repousse plus lourd qu'un
  éclaireur). Sonné, il n'y peut rien ; un tablier sur sa charnière ou une
  charge à sa corde, il ne les soulève pas.

### Munitions
- **Botte de paille** (niveau 29, qui l'enseigne) : elle ne casse rien, ne
  blesse personne et ne fait jamais sauter un baril : elle pousse. Le baril
  perché sur le mur d'enceinte du monastère tombe sur la garde de la porte…
  Au contact d'une flamme, elle s'enflamme.
- **Orbe d'orage** (niveau 22) : la décharge frappe ce qu'il touche, puis
  saute de défenseur en défenseur (quatre sauts, de plus en plus faibles) ;
  le fer la relaie, l'armure la conduit (chevaliers, pavoisiers, généraux),
  l'eau aussi (défenseurs trempés, pluie de l'Orage). Les défenseurs frappés
  restent sonnés et ne repoussent plus rien ; un baril saute, ce qui est
  gelé éclate en vapeur.
- **Pot de poison** (niveau 37) : un nuage qui dérive au vent et ronge ceux
  qui le respirent (ils toussent, et le poison agit encore un peu après) ;
  une flamme le fait exploser, le givre le fige.
- **Munitions élémentaires moins écrasantes** : un coup direct de feu, de
  givre, d'orage ou de poison ôte au plus un quart des points d'un défenseur.
  Ce sont leurs effets qui comptent, et on les voit enfin.
- Le clavier choisit les munitions de 1 à 9 (de 1 à 6 auparavant : les trois
  nouvelles restaient hors d'atteinte).
- Les liens « Défier un ami » et l'atelier de châteaux connaissent les
  nouvelles munitions ; les liens et les châteaux déjà partagés restent
  valides.

### Ouvrages
- **Moulin** (niveaux 13, 49, 56, 63 et 76) : ses ailes s'emballent (une
  seconde de préavis), puis une rafale souffle vers l'engin et dévie les
  tirs ; gelé ou abattu, il se tait.
- Et d'autres ouvrages de siège : **forge** (niveaux 25 et 94 : ses flammes
  enflamment ce qui les traverse, la rafale d'un moulin en fait un jet de
  feu, la citerne l'éteint en vapeur), **citerne** (niveaux 38 et 87 :
  crevée, elle inonde ce qui est dessous : feu éteint, défenseurs trempés,
  gelés en Hiver), **ruche** (niveau 18 : l'essaim fond sur les gardes, les
  pique et les fait fuir ; la fumée le disperse), **sacs de farine** (niveau
  43 : le nuage de farine explose à la première flamme).

### Souffle du monde
- **Chaque chapitre a son vent**, et ce vent fait quelque chose : rafales à
  toutes les difficultés (Fort de pierre), braises qui portent le feu plus
  loin sous le vent (Forteresse), poches de miasmes qui dérivent sur le
  château et explosent au feu du joueur (Marais), sable qui étouffe le feu
  des tirs et les freine (Désert), colonnes d'air chaud qui portent les tirs
  (Montagne), bise qui givre le tir : il cogne deux fois moins les murs et
  éclate à l'impact, le feu s'y éteint (Hiver), vent d'orage qui charge le
  tir, qui se décharge sur les défenseurs proches (Orage), vent de feu qui
  enflamme le tir : feu grégeois offert, le givre y fond (Trône). La
  Palissade et la Citadelle gardent une simple brise. Rien ne s'embrase
  avant le premier tir, et les miasmes ne craignent pas les torches des
  veilleurs : seul le feu du joueur les allume.
- **Exposition** : un tir s'imprègne du vent qu'il traverse, trois fois plus
  vite dans la rafale d'un moulin ; l'aide à la visée marque le point où
  l'élément le saisira. Les effets se cumulent avec les ouvrages et entre eux
  (feu et givre s'annulent en vapeur, le feu embrase le gaz, l'eau conduit
  la foudre).
- Le nom du vent remplace « Vent » dans le bandeau, avec une pastille de sa
  couleur à côté de sa force (visible aussi sur téléphone) ; une carte le
  présente au premier niveau de son chapitre.
- Le trébuchet en tient compte : son projectile arrive sur le fanion,
  colonnes d'air chaud et rafale du moment comprises.

### Niveaux
- **Niveau 29** (le monastère, tutoriel de la botte de paille) : un baril
  perché sur le mur d'enceinte, au-dessus des gardes de la porte, à côté de
  la nef de verre.
- **Niveau 78** (l'escalier gelé) : la bise émousse les pierres ; deux
  boulets explosifs de plus, et les gardes qui se postaient derrière le
  dernier gradin, à l'abri de tout tir (ils ne mouraient que de
  l'effondrement, qu'ils encaissent désormais), se postent devant.
- `npm run check:levels` : le joueur automatique vise avec la courbe de
  l'aide à la visée (rafales des moulins, colonnes d'air chaud, sable).
- Résultat mesuré en Difficile : les 100 niveaux restent gagnables, et la
  tolérance médiane des premiers tirs passe de 3,4 % à 1,6 % (moyenne : de
  13,4 % à 10,2 %), surtout parce que les niveaux les plus larges se
  resserrent (niveau 8 : de 46 % à 11 %, niveau 13 : de 51 % à 20 %) ; le
  joueur automatique a besoin de plus d'un tir sur 26 niveaux (22
  auparavant).

### Corrigé
- **Dans le vent, un tir ne réveillait pas ce qu'il touchait** : Matter ne
  recalcule pas le mouvement d'un corps soumis à une force, si bien qu'un
  bloc ou un baril endormi restait de marbre et que le tir rebondissait
  comme sur un mur (sauf à le briser). Les tirs poussent et renversent
  désormais autant par vent que par temps calme.
- Grands sièges : le tour du général se compte en pas de simulation ; un
  rejeu pouvait diverger d'un pas après son ordre.
- Sur téléphone et tablette, les intitulés du bandeau (score, cibles, tirs,
  vent) sont de nouveau lus par les lecteurs d'écran ; la barre des
  munitions signale par un fondu celles qui sont cachées, et ramène en vue
  la munition choisie ou montrée par le tutoriel.
- README : tableaux des tutoriels et des pouvoirs remis à jour.

## [6.0.0] – 2026-10-15
### Les généraux de Mordrac et les grands sièges
- **Grands sièges** : chaque fin de chapitre (niveaux 10 à 100) se joue en
  plusieurs étapes. Le premier château pris, le donjon du général arrive sur le
  même terrain, avec quelques tirs en plus ; le Trône (niveau 100) en compte
  trois. La caméra, le score maximal et les étoiles tiennent compte des étapes.
- **Dix généraux**, un par chapitre, chacun avec son nom, son titre, sa devise
  et son caractère : Rufus Grosbois, Sire Galeran, Bertille Salpêtre
  (l'ancienne apprentie de Gontran), la comtesse Morgane, le baron Anselme,
  Ilsa la Rouge, Hugues de l'Aire, le margrave Ulric, Baudouin le Tonnant, et
  le duc Mordrac lui-même. Ils ont **plusieurs vies** (une au plus par tir,
  même sous un effondrement qui dure) et, entre deux tirs, donnent un
  **ordre annoncé à l'avance** : réparer, cri de guerre, mur de boucliers,
  saboteur, mercenaire, bombe, pot de feu, couvre-feu, flèches enflammées,
  repli, tempête de sable, faucons, éboulis, souffle glacé, rempart de glace,
  foudre, ouragan (17 ordres).
- **Dessinés en détail** sur la scène (casque, barbe, cape à fibule d'or,
  arme : hache, épée, bombe à mèche, bâton à orbe, dagues, cimeterre, faucon
  qui bat des ailes, marteau d'orage, lame noire) ; ils brandissent leur arme
  quand ils donnent un ordre, et leurs vies s'affichent en cœurs.
- **Interface** : barre du général (buste, nom, vies, prochain ordre, qui
  s'embrase quand il agit), bannières (étape prise, entrée en scène, ordre,
  vie perdue, chute), étape en cours dans le bandeau, fiche du général dans
  l'introduction du niveau, voile du couvre-feu, cor de guerre.
- **La Chronique** : chaque général se présente à l'ouverture de son chapitre
  et nargue la troupe avant son grand siège, avec son portrait pixel art tiré
  de son illustration (116 lignes, 52 couleurs au plus, comme les autres
  personnages). Un personnage à mi-corps (le roi Aubert, Bertille, Hugues)
  touche désormais le bas de la scène au lieu d'y flotter.

### Coup de grâce, défenseurs et mécanismes
- **Coup de grâce** : quand un tir file vers la dernière cible, le temps
  ralentit, la caméra se rapproche et le tambour roule. Puis « Victoire ! »,
  et chaque tir restant éclate en points au-dessus de l'engin, le score
  montant à mesure (sans ralenti ni gros plan en mouvement réduit).
- **Défenseurs assommés** : ils basculent et tournoient avant de disparaître.
  **Répliques en bulles** : un défenseur voit venir le tir, pleure un
  camarade, nargue après un tir manqué ; le général crie quand il perd une vie.
- **Mécanismes** : **potence** (une charge pendue à une corde : tranchez-la,
  elle tombe ; niveau 15) et **pont-levis** (brisez sa chaîne, le tablier
  s'abat sur la garde de la porte ; niveau 28). Cordes et chaînes se
  tranchent au tir ou à l'explosion.
- **Jauge de destruction** (à partir du niveau 6) : abattre la moitié d'un
  château donne une pierre de plus, une par étape ; elle évite une défaite et
  ne compte jamais pour les étoiles.

### Modes
- **Siège sans fin : la main de trois cartes.** Après chaque château pris, on
  garde une carte parmi trois (munitions, renforts, intendant, fortune),
  tirées de la graine du siège.
- **Coupe de la semaine** : cinq châteaux, les mêmes pour tous pendant la
  semaine (Normal, catapulte, sans pouvoirs), à rejouer à volonté ; la
  médaille (bronze, argent, or) dépend des étoiles ; on défie ses amis par un
  lien.
- **Moments forts** : le plus beau tir de la partie est filmé et proposé à la
  fin, à enregistrer ou partager (réglage ; rien n'est envoyé ; désactivé sur
  les portails).
- **Coup de pouce** : au premier chapitre, en Facile et Normal, après deux
  défaites d'affilée, les défenseurs encaissent un peu moins et le vent
  faiblit, sans le dire. Après trois défaites d'affilée, on peut **passer le
  niveau** (sans étoile) et revenir le prendre plus tard.

### Technique
- Relectures exactes même avec des pillards en marche : la fin de chaque tour
  est notée au pas près (liens « Bats mon tir » de 120 gestes au plus).
- Sauvegarde v10 (coupe de la semaine, défaites au front, niveaux passés),
  migrée depuis la v9 et contrôlée comme les autres champs.
- Portraits : encodeur en Node sans dépendance (`npm run portraits`), à la
  place du script Python.
- Contrôle des niveaux : les grands sièges sont jugés étape par étape, et
  `--levels` accepte une liste (`10,20,30`).

### Corrigé
- Un général au-delà de deux vies ne pouvait pas avoir trois étoiles : le par
  de son étape vaut au moins ses vies.
- Une sauvegarde refusée ne bloque plus la fin de partie : le bilan s'affiche
  avec l'avis « non enregistré ».
- Un tout petit château (atelier) pouvait recevoir un défi vide et faire
  échouer la fin de partie.

## [5.9.0] – 2026-10-15
### Interface 2026 : « Verre & Or »
L'identité ne change pas (or héraldique, bleu guède, capitales Cinzel) ; la
matière, si :
- **Jetons de design refaits** (`tokens.css`) : panneaux de verre fumé qui
  laissent deviner la scène (flou d'arrière-plan), liserés lumineux d'un pixel,
  ombres douces en couches, rayons plus généreux, actions principales en or
  dégradé, entrées « à ressort » (courbe `linear()`), échelle typographique
  fluide. Trois thèmes : clair, sombre et contraste élevé (sans transparence
  ni flou).
- **Accueil** : titre en or dégradé traversé d'un reflet, menu de verre aux
  entrées échelonnées, diorama en plans (brume, fenêtres éclairées, torche à
  la porte, étoiles qui scintillent, nuages qui dérivent) et légère parallaxe
  qui suit le pointeur.
- **Campagne** : statistiques en pastilles, chapitres en cartes illustrées
  (ciel, crêtes, soleil ou lune de chaque chapitre, progression et étoiles),
  écus en émail, le prochain niveau en or qui appelle.
- **En jeu** : bandeau de verre où le bouton pause s'emboîte dans l'arrondi,
  statistiques séparées d'un liseré, tirs restants en perles d'or ; munitions
  en touches de verre, la munition choisie s'allume d'or ; **bouton de tir en
  sceau de cire** bombé qui s'enfonce sous le doigt ; bulles du tutoriel,
  sous-titres, astuces et menu des pouvoirs en verre.
- **Fenêtres** : verre dépoli et liseré de couleur en tête ; la barre
  d'actions collante ne prend sa matière que lorsque du contenu défile
  dessous (le texte ne transparaît plus, une fenêtre courte reste d'un seul
  tenant).
- **Autres écrans** : modes de jeu illustrés (siège de nuit, plan
  d'architecte, duel aux couleurs des joueurs), atelier, préparation à deux
  (tuiles de format), succès (insigne en pointillés à faire, en or une fois
  gagné), éditeur de châteaux (barres de verre, outils en pastilles,
  matériaux à pastille de couleur), aide en colonnes sans trous, coffre du jour.
- La sélection se signale partout par l'or ; un bouton principal désactivé
  devient du verre neutre au lieu d'un or terni.
- Toujours pensé pour le téléphone d'abord : aucun défilement horizontal de
  320 à 1920 px, cibles tactiles de 44 px, bandeaux de commandes (v5.5) en
  verre presque opaque ; animations coupées en mouvement réduit.

### Corrigé
- **Pillard collé à la montagne (niveau 32)** : quand un tir renversait
  l'échelle pendant l'escalade, le grimpeur restait accroché au flanc,
  immobile pour toujours (il gardait le frottement « à l'arrêt » pris au pied
  de l'échelle, et aucune corniche n'était sous ses pieds). Il bascule
  maintenant loin de la paroi et tombe : d'en haut, la chute le met hors de
  combat ; près du pied, il se relève, rebâtit et repart. Un pillard resté de
  travers, ou hors de toute corniche, glisse jusqu'à un appui et se relève.
- **Ogres pillards (niveaux 95, 98 et 100)** : trop larges pour se tenir au
  pied prévu de l'échelle (à 18 px du bord), ils s'arrêtaient à quelques
  pixels et n'atteignaient jamais l'engin. Le pied de l'ouvrage tient compte
  de la largeur de chacun.
- **Pont rompu** : un pillard arrivé sur la berge après la rupture du pont
  attendait pour toujours (une portée ne se bâtissait qu'une fois). Il
  rebâtit maintenant le pont, comme une échelle renversée.
- **Échelles qui traversaient la roche** (16 échelles sur 11 niveaux) :
  l'itinéraire suit l'enveloppe du relief (pointes, coins des talus, obstacles
  bas) avec une garde ; le grimpeur suit exactement l'échelle dessinée, et un
  tir qui la renverse fait toujours tomber ceux qui y sont.
- Vérifié sur les 31 niveaux à pillards, en Normal et en Difficile : sans
  tir, chaque pillard atteint l'engin ; échelle renversée en hauteur, le
  grimpeur tombe ; au pied, il repart ; aucun ne reste coincé.
- Les sous-titres et l'astuce de visée chevauchaient le haut de la barre de
  munitions : ils se placent au-dessus du bord réel des commandes.
- Sur téléphone, une règle plus ancienne l'emportait sur la feuille mobile et
  le bandeau du haut ignorait les marges de sécurité de l'écran (encoche).

## [5.8.0] – 2026-10-15
### Confort : fini le zoom d'ouverture
- Le plan d'ouverture (zoom sur les défenseurs puis recul) donnait le mal des
  transports : supprimé. La partie s'ouvre directement sur la vue d'ensemble.
- Tous les zooms de la caméra sont adoucis : interpolés en échelle
  logarithmique, plus lents que le déplacement et à vitesse bornée ; le gros
  plan sur le premier impact est moins serré (×1,4 au lieu de ×2).

### Navigation des défenseurs (nouveau dossier `src/game/ai/`)
L'ancienne ronde (un aller-retour aveugle) est remplacée par une vraie navigation :
- `NavGraph` : graphe des « corniches » où l'on tient debout (sol, planchers
  entre deux murs, chemins de ronde, dessus des dalles), recalculé quand la
  structure bouge ; marches franchissables et petites descentes sans danger,
  jamais de chute mortelle.
- `Pathfinder` : A* (tas binaire) et exploration à budget (Dijkstra).
- `Steering` : accélération et freinage progressifs, arrivée en douceur, on
  attend qu'un camarade passe, on ne franchit jamais le bord.
- `Perception` : les défenseurs observent le projectile en vol, en déduisent
  sa course (pesanteur et vent compris) et devinent où il va tomber.
- `UnitBrain` : comportements par priorité, propres à chaque type (panique en
  feu, esquive, mise à l'abri, fuite devant le feu, réparation, garde, ronde
  avec des haltes et des regards au loin).
- `UnitDirector` : orchestre le tout à chaque pas de simulation. Tout est
  déterministe (graines par défenseur) : les liens « Bats mon tir » rejouent
  exactement la même partie.

### Quatre nouveaux défenseurs
- **Éclaireur** (capuche verte, arc) : il voit venir le tir et court à l'abri.
  Visez large (poudre, feu, mitraille) ou piégez-le dans une pièce.
- **Pavoisier** (grand pavois) : arrête les tirs tendus qui le frappent de face.
  Tir en cloche, trébuchet, ou le toit qui lui tombe dessus.
- **Porte-étendard** (bannière qui flotte) : ses voisins, dans le cercle d'or,
  encaissent bien mieux. Abattez-le d'abord.
- **Sapeur** (tablier et marteau) : entre deux tirs, il va réparer le bloc le
  plus abîmé qu'il peut atteindre. Finissez le travail d'un coup.
- **Veilleurs de nuit** (chapitres 4 et 10) : rondes et sentinelles portent
  une torche (flamme animée, halo qui éclaire les murs, escarbilles). Quand
  l'un d'eux tombe, sa torche met le feu au bois et à la poudre autour de lui.
- Les défenseurs ordinaires réagissent aussi : surpris à découvert, ils
  s'écartent d'un pas pressé du point de chute.
- Animations : course penchée en avant, coups de marteau, bannière et pavois,
  flamme de torche ; sons (marteau, ricochet sur le pavois), sous-titres et
  fiches « Nouveau » en français, anglais et indonésien.

### Pillards, état de l'engin et seaux d'eau
- **Pillards** : dès le premier tir, certains défenseurs courent attaquer
  votre engin, mais seulement pendant le vol de vos tirs (la pression reste
  au tour par tour). Un panneau « ! » rouge les signale. Douves, lave et
  montagnes ne les arrêtent plus : ils jettent des ponts et dressent des
  échelles (voir plus bas). Arrivés à l'engin, ils frappent quelques coups,
  puis vos servants les repoussent (jamais de pillard intouchable collé à
  l'engin).
  - torche (feu) : présentée au niveau 17, avec les premiers seaux d'eau ;
  - saboteur au marteau (dégâts bruts) : niveau 36 ;
  - pot de givre (bras gelé) : niveau 71, en hiver ;
  - l'ogre qui charge (massue) : niveau 95 ;
  - deux torches à la fois aux finales 40 et 90, et tout à la fois au 100.
- **État de l'engin** (nouveau module `src/domain/EngineCondition.js`) :
  points de vie (130 en Facile, 100 en Normal, 80 en Difficile) et avaries :
  - **feu** : l'intensité (1 à 3) monte tant qu'il reste de quoi brûler ; plus
    elle est forte, plus l'engin perd vite ses points de vie ; il finit par
    s'éteindre seul ; la pluie de l'orage l'affaiblit ;
  - **givre** : le bras raidi ne tire plus qu'à 70 % jusqu'au dégel ; le
    givre et le feu s'annulent ;
  - **dégâts bruts** : fissuré (puissance × 0,9), puis disloqué (× 0,78) ;
  - **rouille** : chaque seau d'eau, et la pluie de l'orage, ajoute une
    couche (−4 % de puissance, +12 % de dégâts subis) : l'eau a un prix.
  - Plus de points de vie : l'engin est détruit, la partie est perdue.
- **Seaux d'eau** (2 par niveau à torches, 1 en Difficile) : un bouton qui
  s'agite quand l'engin brûle (touche B), utilisable en visée comme en vol ;
  enregistrés dans les liens « Bats mon tir », rejoués à l'identique.
- Affichage : barre de vie au-dessus de l'engin et pastilles d'avaries
  (forme et couleur), jauge « Engin » dans le bandeau, flammes qui grossissent
  avec l'intensité, croûte de givre et stalactites, fissures et planche qui
  pend, taches de rouille ; sous-titres, annonces pour les lecteurs d'écran,
  sons, et la raison de la défaite à l'écran de fin. Trébuchet et baliste
  ont les mêmes avaries.

### Ponts et échelles
- Devant un lac, la lave ou la glace (jusqu'à 420 px), les pillards jettent un
  **pont de planches** (4 s de travail) ; devant une montagne ou au bord d'un
  plateau (jusqu'à 520 px de haut), ils dressent une **échelle** (3 s) et
  grimpent. La navigation A* compte chaque ouvrage comme un détour : un
  pillard ne bâtit que si cela lui fait gagner du chemin.
- Pendant le travail, il est immobile et ses coups de marteau s'entendent
  (sous-titres « Les pillards jettent un pont », « Un pillard dresse une
  échelle »).
- **Contre-jeu** : un tir brise le pont, et ceux qui sont dessus tombent à
  l'eau ou dans la lave ; un tir renverse l'échelle, avec ceux qui y
  grimpent. Les ouvrages ne rapportent aucun point : seuls les pillards
  comptent.
- Présentés seuls, avec leur fiche « Nouveau » : l'échelle au niveau 32, le
  pont au niveau 34.

### Niveaux plus retors
- Chaque défenseur est présenté seul, là où l'échec ne coûte rien, puis revient
  et se combine aux autres, avant un retournement : éclaireur (niveau 9, puis
  enfermé dans le château dès le 27), pavoisier (19, puis deux dès le 61),
  sapeur (26, puis à l'intérieur dès le 71), porte-étendard (33, puis chaque
  fin de chapitre), veilleurs (première nuit, niveau 31).
- **Fini le baril à la porte** : `check:levels` a montré que la plupart des
  tirs gagnants commençaient par l'explosion d'un baril posé au pied des
  murs ; chaque niveau se résolvait de la même façon. Dès le niveau 19, la
  porte est tenue par un pavoisier et les barils sont rangés derrière le
  château : il faut un long tir en cloche, précis, pour les atteindre. Les
  poudrières dessinées par les niveaux restent (et le baril qui lance les
  dominos de fer du niveau 85).
- Niveaux 33 et 35 : un veilleur posté sur la paille, un autre devant la
  cave à poudre. Les abattre ouvre une autre solution.
- `npm run check:levels` mesure désormais la « tolérance » de chaque niveau
  (part des premiers tirs essayés qui gagnent d'un coup) ; le joueur
  automatique prend 1,5 s pour viser, attend le dégel et jette un seau d'eau
  quand l'engin brûle, comme un humain.
- Résultat mesuré en Difficile : les 100 niveaux restent gagnables, et la
  tolérance médiane des premiers tirs passe de 8 % à 2,8 % (moyenne : de 22 %
  à 13 %) ; le joueur automatique a besoin de plus d'un tir sur 22 niveaux
  (16 auparavant).

### Corrigé
- Les défenseurs suivaient un chemin périmé quand la structure bougeait
  (les corniches sont renumérotées à chaque reconstruction du graphe) : le
  chemin est désormais recalculé.

## [5.7.0] – 2026-10-15
### Graphismes : profondeur et lumière
- **Décor en quatre plans** qui défilent à des vitesses différentes : chaînes
  lointaines noyées dans la brume (avec neiges éternelles en montagne et en
  hiver), collines, plan intermédiaire (haies, bosquets, sapins ou feuillus
  selon le climat) et **camp de siège** aux tentes rayées derrière l'engin.
  Plus un plan est loin, plus il prend la couleur du ciel.
- **Ciel** en trois temps, **rayons de soleil** discrets qui tournent
  lentement (par temps clair), astre au bord adouci, **lune** en croissant
  avec ses mers et son halo, étoiles qui scintillent.
- **Lumière des feux** : tout ce qui brûle, et le boulet enflammé, éclaire ce
  qui l'entoure (halo qui vacille), bien plus fort la nuit.
- **Étalonnage** : lumière chaude qui descend du soleil le jour, voile froid
  la nuit.
- **Poussières d'ambiance** : pollen au soleil, sable dans le désert, lucioles
  la nuit, braises au dernier chapitre (coupées en mouvement réduit et en
  contraste élevé).

### Ressenti des tirs
- **Tremblement « à traumatisme »** : l'amplitude suit le carré de l'intensité
  (petits chocs discrets, gros chocs qui secouent), mouvement lisse avec un
  léger roulis ; les plans lointains tremblent moins.
- **Arrêt sur image** de 40 à 90 ms sur les explosions, les percées et les
  très gros impacts : le choc « pèse ». Jamais en mouvement réduit.
- **Enchaînements** : deux défenseurs abattus à moins de 1,5 s pendant le même
  tir font un **Doublé !**, puis **Triplé !**, puis **Carnage !** : grand titre
  doré dans la scène, cloches qui montent, sous-titre (FR, EN, ID).

### Son et musique
- **Mixage de studio** : compresseur sur les effets, limiteur de sortie,
  **réverbération commune** (salle de pierre générée par le code) pour les
  effets, la musique et l'ambiance.
- **Effets refaits en couches** (attaque, corps, queue, gravats) et qui
  varient légèrement à chaque fois : bois qui craque et résonne, pierre et
  cailloux, métal qui sonne, explosion avec souffle et retombées, chute des
  défenseurs, nouvelle **fanfare de victoire** (trompettes et timbales) et cor
  de défaite. Nouveaux sons : souffle du tir, gravats, enchaînement.
- **Sifflement du boulet** en vol, qui suit sa vitesse et sa position.
- **Cloche à chaque étoile** de l'écran de fin, au rythme de leur apparition.
- **Ambiance de chaque chapitre** (nouveau module `AmbienceDirector`) : vent
  qui respire, oiseaux, grillons et chouette la nuit, grenouilles et corneilles
  dans les marais, faucon dans le désert et la montagne, vent qui hurle en
  hiver, pluie et tonnerre lointain, crépitement des braseros. Atténuée en
  pause, coupée dans les menus, réglée par le volume des effets.
- **Musique** : luth au timbre plus riche (onde harmonique, plectre), harpe
  qui ouvre les phrases au calme, tambours de guerre dès l'action, chœur
  d'hommes au paroxysme (dès l'action au dernier chapitre).

### Corrigé
- L'introduction du niveau 2 affichait « powers.undefined » au lieu du titre
  du tutoriel.

## [5.6.2] – 2026-10-09

### Corrigé — fenêtre de test GamePix
- Portails : les écrans longs (carte, modes, atelier, réglages) défilent dans le jeu lui-même. Le cadre de test du portail interdit le défilement de la page (iframe sans défilement) : on ne pouvait plus atteindre le bas des écrans.
- Atelier de châteaux sur petite hauteur ou écran étroit : barre et palettes sur une ligne chacune, la scène garde toujours de la place (elle disparaissait à 480×320) ; « Tester » et « Partager » restent visibles.
- GamePix : `interstitialAd` appelé à chaque passage entre deux niveaux (GamePix décide lui-même de montrer une pub ou non) ; aucune pub avant la fin de `GamePix.loaded()`, qui est asynchrone.
- Vérifié dans un cadre 640×360 sans défilement : vidéo récompensée (`rewardAd`) puis interstitiel (`interstitialAd`) appelés. 1 test de plus (213).

## [5.6.1] – 2026-10-09

### Corrigé — liste de contrôle d'intégration GamePix
- `GamePix.updateScore` : envoyé à chaque changement de score (sans doublon) et à la fin d'un niveau réussi.
- `GamePix.updateLevel` : envoyé quand un niveau est réussi.
- `GamePix.lang` : lu une fois au démarrage, même si le joueur a déjà choisi sa langue.
- `GamePix.happyMoment` : aussi déclenché par un record ou un premier passage dans la campagne.
- Premier interstitiel dès le premier niveau terminé (puis au plus un toutes les 90 s) pour que la validation GamePix le voie.
- 1 test de plus (212 au total).

## [5.6.0] – 2026-10-09
### Cinq portails non exclusifs
CrazyGames mis de côté, le jeu est prêt pour cinq portails qui n'exigent
aucune exclusivité : GameDistribution, itch.io, GamePix, Y8 et Newgrounds.
- **Kits des portails** (adaptateurs du service de publicité, chargés
  seulement dans le build du portail) :
  - GameDistribution : interstitiels entre les niveaux, vidéos récompensées
    (préchargement, récompense sur `SDK_REWARDED_WATCH_COMPLETE`), pause et
    son coupé sur `SDK_GAME_PAUSE` ;
  - GamePix : `loaded()` avant tout appel, interstitiels, vidéos récompensées,
    moments forts, langue du joueur, stockage du portail ; SDK en premier
    script de la page (règle GamePix) ;
  - Y8 : pauses « next » et vidéos « reward » (récompense sur `adViewed`).
  GameDistribution et Y8 demandent les identifiants de leur tableau de bord
  (variables `CTC_GAME_ID`, `CTC_APP_ID`) ; sans eux, aucun script tiers.
- **itch.io et Newgrounds** : build sans kit ni publicité, avec la politique de
  sécurité stricte de notre site.
- **`npm run release:portals`** : un dossier par portail avec le zip du jeu
  (`index.html` à la racine, sans les fichiers propres à notre site), les
  images aux formats demandés, 5 captures et la fiche (`LISTING.md`) :
  marche à suivre, description, commandes, tags.
- Visuels (`docs/store/portals/`) : citadelle de marbre à l'éclipse ; versions
  sans texte pour GamePix.

## [5.5.0] – 2026-10-09
### Interface mobile : plus aucun bouton sur le terrain de jeu
Sur téléphone et tablette, les commandes flottaient au-dessus de la scène et
la masquaient. Elles sont maintenant rangées dans des bandeaux dédiés, et la
scène n'occupe que l'espace qui reste (nouvelle feuille `src/styles/mobile.css`) :
- **Téléphone à l'horizontale** : bandeau fin en haut (pause, cibles, tirs,
  vent, pouvoirs ; l'étape du trébuchet ou l'angle de la catapulte à la place
  du titre) et **colonne de commandes à droite** (munitions en liste, aide à
  la visée, bouton de tir) : toute la hauteur va à la scène.
- **Téléphone à la verticale et tablettes** : bandeau fin en haut, **plateau
  en bas** (munitions sur une ligne, aide, tir, et le panneau du trébuchet),
  sous la scène.
- Boutons plus petits mais toujours faciles à toucher (40 px au moins), noms
  des munitions remplacés par leur icône, étiquettes des statistiques masquées
  (lues par les lecteurs d'écran).
- La caméra cadre la scène dans l'espace libre ; les gestes (viser, placer la
  cible du trébuchet) gardent leur précision.
- Ordinateur : interface inchangée.

## [5.4.1] – 2026-10-09
### Identité AdamRodWebDev
- Le générique d'ouverture adopte le logo du portfolio : l'hexagone d'or sur
  fond noir avec son « A », qui se trace puis tourne d'un sixième de tour, un
  éclat d'or qui parcourt le contour, puis « AdamRod**WebDev** » (WebDev en
  or) et « présente ». Toujours 2,6 s, passable d'un clic, image fixe en
  mouvement réduit, aucune requête réseau.
- Le studio s'appelle désormais AdamRodWebDev partout : générique, éditeur
  (page de confidentialité, écran d'aide), métadonnées de la page.

## [5.4.0] – 2026-10-09
### Trébuchet à deux clics (module `src/game/aim/TrebuchetInput.js` réécrit)
Le chronométrage du lâcher laissait trop peu de temps pour viser. Le trébuchet
se joue désormais en deux clics, sans aucun réflexe à avoir :
1. **Point d'impact** : on touche exactement l'endroit où le projectile doit
   percuter (un fanion s'y plante ; glisser l'ajuste, ← → au clavier).
2. **Arc** : une jauge oscille entre **tir en cloche** et **tir tendu** ; la
   courbe du tir suit en direct et s'arrête au premier obstacle (on voit si
   l'arc passe le rempart). Un second clic fige la jauge.

Le trébuchet tire alors tout seul : la fronde s'ouvre quand elle a l'angle
choisi, avec la vitesse calculée pour arriver **pile sur le point touché**
(écart mesuré : quelques pixels), dans la limite de la puissance de l'engin
(fanion gris barré si la cible est hors de portée). En Difficile, les rafales
de vent à venir peuvent encore dévier le tir ; un tir en cloche, plus long, y
est plus exposé.
- Jauge plus lente en Facile, plus vive en Difficile ; l'option « Balancier
  lent » devient « Jauge lente ». Sans l'aide à la trajectoire, seul le début
  de la courbe est montré.
- Cadran de la jauge au-dessus de l'engin, avec des pictogrammes (arc haut =
  cloche, trait = tendu) lisibles dans toutes les langues ; panneau en deux
  étapes (« 1. Touchez le point d'impact », « 2. Touchez pour fixer l'arc »),
  angle et puissance du tir.
- Tutoriel du niveau 4, aide, textes du clavier et histoire mis à jour (FR, EN, ID).
- Liens « Bats mon tir » : le point d'impact et la position de la jauge sont
  enregistrés, et le tir est recalculé à l'identique (jamais une vitesse
  fournie par le lien) ; les liens d'avant la v5.4 se rejouent encore.

### Balancier fluide
- Le bras tournait par à-coups : au ralenti, la simulation n'avançait qu'une
  image sur deux ou trois. Le balancier tourne maintenant à vitesse constante
  et son dessin est **interpolé** entre deux pas de simulation : il avance à
  chaque image, quelle que soit la fréquence de l'écran.
- Supprimés : décompte sonore, note du lâcher et balancier infini (sans objet
  sans chronométrage).

## [5.3.0] – 2026-10-08
### Commande du trébuchet (nouveau module `src/game/aim/TrebuchetInput.js`)
Même démarche que la visée de la v5.2, appliquée au trébuchet. Inspirée de la
jauge de swing des jeux de golf (un geste, un instant juste, une note), du
cercle d'approche des jeux de rythme (osu!), et des décomptes sonores. Module
pur, sans DOM, couvert par 12 tests.
- **Précise** : on vise un point. Un fanion doré se plante sur le terrain
  (d'un glissé, ou avec ← →, Maj pour les petits pas) ; le module calcule
  l'instant de lâcher qui y mène, pas de simulation par pas de simulation, et
  montre l'impact idéal. Cible hors de portée : fanion gris barré.
- **Concise** : un seul geste au choix. Appui bref = balancier, second appui
  = lâcher (comme avant), ou **appui maintenu** : la fronde part au relâcher.
  Même chose avec Espace.
- **Rapide** : une cible par défaut sur le défenseur le plus proche à chaque
  tour ; la table des lâchers est calculée une fois par tour (moins de 0,2 s),
  déplacer la cible ne coûte qu'une lecture.
- **Agréable** : pendant le balancier, un cercle se referme sur le fanion,
  trois tics comptent les temps puis une note claire marque l'instant parfait
  (avec vibration) ; chaque lâcher reçoit une note — **Parfait, Très bien,
  Bien, Raté** — en grand à l'écran, en sous-titre et lue aux lecteurs d'écran.
  La note juge le geste (écart à l'impact idéal), pas la position de la cible.
- **Difficulté** : en Facile, un lâcher à 26 ms près se cale sur l'instant
  parfait (l'instant corrigé est celui qui est rejoué) ; en Difficile, ni
  cercle ni impact idéal, seuls les tics guident.
- La barre du panneau montre la cible dès la visée.
- Téléphone en portrait : le panneau du trébuchet passe sur sa propre ligne au
  lieu de déborder, et la scène reste visible au-dessus.

## [5.2.0] – 2026-10-08
### Visée professionnelle (nouveau module `src/game/aim/AimInput.js`)
Inspirée de la fronde d'Angry Birds, du mode précision des jeux de golf, des
courbes de réponse des manettes et des réglages au clavier des jeux
d'artillerie (Worms, Pocket Tanks). Module pur, sans DOM, couvert par 12 tests.
- **Précise** : angle et puissance au pas de 0,5° et 0,5 % ; la valeur
  affichée est exactement celle qui part.
- **Stable** : zone morte au départ ; tant que le geste est court, l'angle ne
  suit que progressivement (fini les sauts de 10° pour un pixel).
- **Fine** : puissance sur une courbe progressive ; **mode précision** en
  restant immobile un instant, avec Maj ou un second doigt (le même geste règle
  alors bien plus finement) ; on en sort en bougeant franchement, sans à-coup.
- **Fluide** : l'affichage suit le doigt avec un lissage de 45 ms, quelle que
  soit la fréquence de l'écran.
- **Sûre** : un simple appui ne tire jamais ; relâcher près du point de
  départ **annule** le tir (et rétablit la visée d'avant).
- **Clavier** : flèches maintenues avec accélération (un appui = un pas
  exact), Maj pour la précision ; **molette** pour la puissance.
- **Viseur** : rapporteur gradué (tous les 5°, au degré en précision),
  jauge de puissance du vert au rouge, valeurs exactes toujours au même
  endroit, **repères du tir précédent** (angle, puissance et trajectoire en
  pointillés pâles), fronde tendue là où le doigt s'est posé, loupe en mode
  précision ; repère sonore et micro-vibration tous les 5° et 10 %.
- Même visée pour la baliste (de 0 à 60°).

## [5.1.0] – 2026-10-08
### Lacs et lave réalistes
- Textures calculées une fois au chargement (bruit fractal, cellules de
  Voronoï) puis animées : eau en profondeur avec rayons de lumière, vase,
  reflet du ciel et deux couches de vaguelettes, berges mouillées, roseaux et
  massettes ; glace laiteuse aux bulles et fissures, reflet qui glisse.
- Lave : magma qui palpite, croûte de basalte en plaques qui dérive, bords
  encore rouges, bulles qui gonflent puis crèvent, halo et air qui tremble.

### Rondes et ogres
- **Rondes** : les gardes au sol patrouillent dès le niveau 6, un défenseur sur
  trois va et vient dans sa pièce dès le niveau 12, les sentinelles des toits
  dès le 30. Demi-tour devant un mur, au bord du vide, d'un lac ou de la lave.
- **Ogre** (dès le niveau 35, puis à chaque niveau à partir du 85) : unité
  lourde qui renvoie d'un revers de massue les projectiles légers et repousse
  les blocs qui lui tombent dessus. Bombe, feu, givre, boulet lourd ou
  carreau de baliste en viennent à bout.

### Trébuchet : le bon moment
- Pendant le balancier, une cible balaie le terrain à l'endroit où tomberait
  le tir ; elle passe au vert sur le château, avec un tintement et un
  sous-titre « Sur la cible ». Le panneau montre la même chose sur une barre
  (zone du château et point d'impact). Plus floue en Difficile.

### Baliste (arme ultime)
- Débloquée après 70 niveaux ET 180 étoiles. Carreau de fer rapide et tendu,
  peu sensible au vent, qui perce tous les murs qu'il brise et traverse la
  roche des montagnes ; ligne de mire toujours affichée. Les munitions
  spéciales deviennent des carreaux de feu, de givre, de poudre, etc.

### Contrôles
- 183 tests ; les 100 niveaux restent stables et gagnables en Difficile à la
  catapulte et au trébuchet, la démo 10/10, et les niveaux 70 à 100 à la
  baliste. Les défenseurs en ronde marchent presque sans frottement (ils
  n'entraînent pas les planchers) et ne retardent pas la fin du tour ; au
  niveau 99, les gardes hors de portée se postent devant le château.

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
