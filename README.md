# 🏰 Catapulte Mania

**Jeu de catapulte médiéval, 100 % dans le navigateur.**
Réglez l'angle et la puissance, calculez la trajectoire, et faites tomber les forteresses pour atteindre les soldats cachés à l'intérieur.

- 100 niveaux répartis en 10 chapitres : du bois et de la paille au début, puis la pierre, le fer, la brique, le grès, la glace et le marbre, des barils explosifs et de nouveaux projectiles
- 3 difficultés (Facile, Normal, Difficile : un tir et la moitié des munitions spéciales en moins)
- **Terrains vivants** : lacs (le boulet ricoche une fois puis coule), lave (tout fond, sauf le givre qui la fige), neige (le boulet roule et grossit en boule de neige), montagnes indestructibles, corbeaux qui arrêtent les tirs et vouivres porteuses de feu grégeois
- **6 munitions** débloquées tôt (feu au niveau 3, rocher au 5, givre au 7, bombe au 10, mitraille au 14) ; le rocher **perce** les murs de pierre ; le **givre** rend les blocs cassants, et le feu sur la glace libère une vapeur brûlante
- **Rondes et ogres** : des défenseurs qui patrouillent, et des ogres qui renvoient les tirs d'un revers de massue
- **3 engins** : catapulte, trébuchet (deux clics : on touche le point d'impact, puis on fige la jauge entre tir en cloche et tir tendu) et, pour les meilleurs joueurs, la **baliste** (70 niveaux et 180 étoiles) dont le carreau traverse les montagnes
- 7 pouvoirs spéciaux qui changent la partie (Œil du faucon, Force du Titan, Pierre d'aimant, Météore, Pluie de feu, Colère du ciel, Séisme) : un seul par tour, chaque utilisation coûte des points
- **Mode libre** : rejouer les niveaux terminés sans limite de tirs ni de munitions
- **Deux joueurs** sur le même appareil : la campagne à deux en coopération, le duel, le tournoi et le face-à-face, chacun avec ses propres conditions de victoire
- **Une histoire** : la Chronique, avec quatre personnages en pixel art, une réplique avant chaque niveau et un épisode à chaque chapitre
- **Tutoriels guidés** : chaque nouvelle munition et chaque nouveau pouvoir s'apprennent dans un niveau dédié
- **Bande son médiévale** composée en direct, qui s'intensifie aux moments forts
- **300 succès** : trois défis par niveau, tirés de 21 défis différents (sur le fil, carton, chirurgien, éboulement…)
- **Atelier** : de l'or gagné en jouant pour améliorer sa catapulte et changer son apparence
- Français, English, Bahasa Indonesia
- Thème clair, thème sombre et mode contraste élevé
- Jouable sur téléphone, tablette et ordinateur, à la souris, au doigt ou au clavier ; sur téléphone et tablette, les commandes sont rangées autour de la scène, jamais dessus
- Pensé pour les personnes malvoyantes et malentendantes
- Fonctionne hors connexion après la première visite
- Aucun serveur, aucun compte, aucune donnée envoyée sur Internet

---

## Sommaire

1. [Essayer le jeu en 30 secondes (la démo)](#1-essayer-le-jeu-en-30-secondes-la-démo)
2. [Comment jouer](#2-comment-jouer)
3. [Accessibilité](#3-accessibilité)
4. [Petit lexique pour débuter avec Git et GitHub](#4-petit-lexique-pour-débuter-avec-git-et-github)
5. [Récupérer le projet sur son ordinateur](#5-récupérer-le-projet-sur-son-ordinateur)
6. [Lancer le jeu en mode développement](#6-lancer-le-jeu-en-mode-développement)
7. [Fabriquer la version finale et la mettre en ligne](#7-fabriquer-la-version-finale-et-la-mettre-en-ligne)
8. [Organisation du code](#8-organisation-du-code)
9. [Sécurité et anti-triche](#9-sécurité-et-anti-triche)
10. [Qualité : tests et contrôles](#10-qualité--tests-et-contrôles)
11. [Historique des versions](#11-historique-des-versions)
12. [Personnaliser le jeu](#12-personnaliser-le-jeu)

---

## 1. Essayer le jeu en 30 secondes (la démo)

La **démo** est un seul fichier, `crush-the-castle-demo.html`, qui contient tout le jeu : 10 niveaux choisis pour montrer le meilleur (baril, trébuchet, feu, bombe, mitraille, châteaux de fin de partie) et l’atelier d’améliorations.

1. Téléchargez le fichier.
2. Double-cliquez dessus : il s'ouvre dans votre navigateur (Chrome, Firefox, Edge ou Safari).
3. C'est tout. Pas d'installation, pas de connexion Internet nécessaire.

On peut l'envoyer par e-mail, le mettre sur une clé USB ou l'héberger sur n'importe quel site.

> Pour fabriquer à nouveau ce fichier à partir du code : `npm run build:demo` (voir la section 7). Le résultat se trouve dans `dist-demo/index.html`.

---

## 2. Comment jouer

| Action | Souris / doigt | Clavier |
|---|---|---|
| Viser | Glisser vers l'arrière depuis la catapulte, ou utiliser les curseurs « Angle » et « Puissance » | Flèches ← → (angle) et ↑ ↓ (puissance). Avec Maj : pas de 5 |
| Tirer | Bouton rouge « Tirer » | Espace ou Entrée |
| Choisir un projectile | Cliquer sur un projectile en bas | Touches 1 à 5 |
| Diviser la mitraille en vol | Bouton « Diviser » | Espace |
| Pause | Bouton ⏸ en haut à gauche | P ou Échap |
| **Trébuchet** : 1. choisir le point d'impact | Toucher exactement l'endroit visé (glisser pour l'ajuster), ou bouton « Viser ici » | Flèches ← → pour déplacer le point (Maj : petits pas), Espace ou Entrée pour valider |
| **Trébuchet** : 2. choisir l'arc et tirer | Toucher à nouveau quand la jauge (cloche ↔ tendu) convient, ou bouton « Tirer ! » | Espace ou Entrée |

**Autres modes (v4.0) :**
- **Siège sans fin** : des châteaux qui s'enchaînent, de plus en plus durs ; chaque château abattu rapporte des tirs, le siège s'arrête quand un château résiste.
- **Atelier de châteaux** : construisez votre château pièce par pièce, prenez-le vous-même, puis envoyez le lien à vos amis.
- **Événements de saison** : Nuit des citrouilles en automne, Siège d'hiver en décembre, avec un décor et une récompense pour le défi du jour.

**Le défi du jour (v3.9) :** chaque jour, le même niveau et le même engin pour tout le monde, en Normal, sans pouvoirs ni améliorations. Réussissez-le plusieurs jours de suite pour faire grandir votre série. Après une victoire, **« Défier un ami »** crée un lien : votre ami voit votre tir rejoué, puis tente de faire mieux. Le lien ne contient que vos gestes : le score est recalculé par le jeu, impossible à truquer.

**Le trébuchet (v3.7) :** débloqué après le niveau 3 (le niveau 4 l'enseigne), il se choisit ensuite avant chaque niveau, à la place de la catapulte (sauf au face-à-face). Il ne se vise pas : **il se joue uniquement au clic**. Le premier clic libère le contrepoids, le bras se met à tourner ; le second lâche la fronde. Lâcher tôt donne un tir en cloche (trop tôt : le projectile part en arrière), lâcher tard un tir tendu (trop tard : dans le sol). Il tire de plus loin que la catapulte, mais frappe plus fort (ses pierres sont une fois et demie plus lourdes), et la caméra suit le projectile jusqu'au château puis reste sur l'effondrement. La physique est réelle : le bras obéit à son contrepoids, le projectile est une masse au bout d'une corde, et il part avec la vitesse qu'il avait au moment du lâcher.

**Viser au trébuchet (v5.4) :** touchez exactement l'endroit où le projectile doit percuter : un fanion s'y plante. Une jauge se met alors à osciller entre **tir en cloche** et **tir tendu**, et la courbe du tir suit en direct : on voit si l'arc passe au-dessus du rempart ou s'il frappe le mur de face. Touchez une seconde fois pour figer la jauge : le trébuchet tire tout seul, et le projectile arrive pile sur le fanion (en Difficile, les rafales de vent peuvent encore le dévier). Sans l'aide à la trajectoire, seul le début de la courbe est montré.

**Astuce :** certains châteaux ont un point faible (un pied en verre, un étage en paille, une poudrière…). Trouvez-le et tout s'écroule.

**Le but :** éliminer tous les personnages (soldats, chevaliers, rois) avant d'avoir épuisé ses tirs.
**Le vent** (indiqué en haut à droite) dévie les projectiles. On le voit aussi dans le décor : traînées d'air dans le ciel, manche à air près de la catapulte, fanion au sommet du château, nuages et fumée qui dérivent. **En Difficile**, il devient un adversaire : bien plus fort, plus fort encore en altitude (un tir en cloche dérive bien plus qu'un tir tendu), il souffle **en rafales** (les traînées plus claires qui approchent annoncent la prochaine, un badge « Rafale » et un sous-titre la signalent) et pousse le feu dans son sens. Les projectiles lourds lui résistent : le boulet dévie deux fois moins que la pierre, la mitraille bien plus.
**La physique :** les personnages tombent **au moindre choc** (un bloc qui bouge, un projectile, un débris, une chute). Ce sont les **châteaux** qui les protègent, et ils sont solides : une simple pierre ne renverse pas un mur de pierre. Il faut choisir le bon projectile (le rocher pour enfoncer, les explosifs pour la pierre, le marbre et le fer) ou améliorer sa catapulte à l'atelier. Frappez un mur porteur de face et assez fort : il cède et ce qu'il soutenait s'effondre. Rien ne reste jamais suspendu dans le vide.
**Le feu :** le feu grégeois enflamme ce qu'il touche. La paille flambe en deux secondes et propage le feu partout ; le bois brûle plus longtemps, finit par céder, mais propage beaucoup moins. Une cible qui prend feu succombe.

**Les étoiles** dépendent du nombre de tirs : **3 étoiles en un seul tir** (deux pour les grands châteaux, indiqué avant chaque niveau), 2 étoiles en peu de tirs, 1 étoile pour une victoire. Si le feu ou un pouvoir (séisme) abat les derniers défenseurs pendant que vous visez, la victoire est accordée tout de suite, sans avoir à tirer.

**Les succès :** chaque niveau propose trois défis, un de chaque famille, affichés avant la partie et à la fin. Ils se cumulent d'une partie à l'autre et rapportent de l'or. Les seuils montent avec la progression (la chaîne demandée passe de 6 à 14 destructions, le « Carton » de 2 à 4 cibles). Il y en a 300 en tout, tirés de 18 défis :

| Famille | Défis |
|---|---|
| **Style** (comment on joue) | Puriste (aucun boulet spécial) · Sans artifice (aucun pouvoir) · Économe (au plus la moitié des tirs) · Parcimonie (au plus un boulet spécial) · Sur le fil (gagner au tout dernier tir) · Contre vents et marées (ni pouvoir ni boulet spécial, par grand vent) |
| **Exploit** (adresse) | Réaction en chaîne (N destructions d'un tir) · Carton (N cibles d'un même tir) · Entrée fracassante (la moitié des cibles dès le premier tir) · D'un seul coup (toutes les cibles d'un même tir) · Démolisseur (raser une grande part du château) · Chirurgien (gagner en détruisant très peu) |
| **Thème** (propre au niveau) | Feu d'artifice (tous les barils) · Régicide (le roi en premier) · Pyromane (deux cibles par le feu) · Artificier (deux cibles par une explosion) · Éboulement (deux cibles écrasées) · Chute libre (une cible tombée de haut) |

**Les tutoriels :** la première fois qu'un outil apparaît, son niveau devient un tutoriel guidé : une bulle explique quoi faire, met en valeur le bon bouton et avance au rythme du joueur ; la trajectoire est affichée pendant l'apprentissage. Ils peuvent être désactivés dans les Réglages.

| Niveau | Outil appris |
|---|---|
| 1 | Viser et tirer |
| 5 | Accalmie (pouvoir) |
| 8 | Force du Titan (pouvoir) |
| 9 | Feu grégeois (munition) |
| 11 | Rocher (munition) |
| 16 | Feu grégeois (pouvoir) |
| 19 | Salve (pouvoir) |
| 21 | Bombe (munition) |
| 22 | Charge de poudre (pouvoir) |
| 25 | Mitraille (munition) |
| 31 | Séisme (pouvoir) |

**La Chronique :** un récit accompagne la campagne. Le duc Mordrac a pris la capitale et enfermé le vieux roi Aubert dans sa tour ; la princesse Ysolde lève une armée, avec Maître Gontran, l'ingénieur royal, et vous, son apprenti, aux commandes de la catapulte.

| Personnage | Rôle |
|---|---|
| Princesse Ysolde | Héritière du royaume, elle mène la reconquête |
| Maître Gontran | Ingénieur royal : il vous guide dans les tutoriels et tient l'atelier |
| Le duc Mordrac | L'usurpateur, qui vous nargue avant chaque forteresse de fin de chapitre |
| Le roi Aubert | Le roi captif, qui écrit à sa fille dans les derniers chapitres |

Chaque niveau s'ouvre sur une réplique d'un personnage ; chaque chapitre, sur un épisode de quelques pages mis en scène ; l'épilogue suit la victoire finale. Les épisodes déjà lus se relisent depuis la carte des niveaux, et l'histoire peut être masquée dans les Réglages.

**Des personnages sans images :** les quatre personnages sont du pixel art redessiné par le code, à partir d'une palette et d'une suite de pixels compressée. Ils pèsent 16 Ko en tout, contre 14 Mo pour les illustrations d'origine, ne coûtent aucun téléchargement d'image et restent nets à toutes les tailles.

**La musique** est jouée note à note par des instruments médiévaux synthétiques (vielle, luth, flûte, tambourin, chalemie). Calme dans les menus, elle prend le tambour quand on vise, s'accélère quand le projectile vole et explose en contre-chant lors des effondrements, des explosions et face à la dernière cible. Son volume est réglable à part ; pour les personnes malentendantes, un sous-titre « ♪ La musique s'emballe » signale ces moments.

### La progression

| Chapitre | Niveaux | Nouveautés |
|---|---|---|
| 1. La Palissade | 1 à 10 | Bois et paille, faciles à casser. On apprend à viser, puis le feu grégeois. |
| 2. Le Fort de pierre | 11 à 20 | Pierre et vitraux, barils explosifs, chevaliers en armure, rocher |
| 3. La Forteresse | 21 à 30 | Fer, boulets de poudre, mitraille, le roi |
| 4. La Citadelle | 31 à 40 | Tout combiné, de nuit, vent fort |
| 5. Les Marais | 41 à 50 | Brique, pilotis, brume |
| 6. Le Désert | 51 à 60 | Grès, forts massifs, plateaux à viser en cloche |
| 7. La Montagne | 61 à 70 | Nids d'aigle sur les rochers, sommets enneigés |
| 8. L'Hiver | 71 à 80 | Glace glissante, neige |
| 9. L'Orage | 81 à 90 | Fer et brique sous la pluie, vent violent |
| 10. Le Trône | 91 à 100 | Marbre, rois, citadelles finales |

Une munition découverte reste ensuite disponible dans **tous** les niveaux de la campagne (au moins une de chaque type, même en Difficile) : à vous d'expérimenter.

### Les pouvoirs spéciaux

Un seul pouvoir par tour. Chaque utilisation retire des points au score final.

| Pouvoir | Débloqué après | Coût | Effet |
|---|---|---|---|
| Accalmie | 4 niveaux | 150 | Supprime le vent pour ce tir |
| Force du Titan | 7 niveaux | 250 | Projectile beaucoup plus lourd et destructeur |
| Feu grégeois | 15 niveaux | 200 | Le projectile enflamme ce qu'il touche |
| Salve | 18 niveaux | 350 | Tire trois projectiles en éventail |
| Charge de poudre | 21 niveaux | 300 | Le projectile explose à l'impact |
| Séisme | 30 niveaux | 400 | Secoue toutes les structures immédiatement |

### Les modes de jeu

| Mode | Où le trouver | Principe |
|---|---|---|
| **Campagne** | Jouer → profil → carte des niveaux | Les 100 niveaux dans l'ordre. Rapporte des étoiles et de l'or. |
| **Mode libre** | Carte des niveaux → « Mode libre » | Rejouer un niveau déjà terminé avec tirs et munitions illimités (celles découvertes en campagne) et pouvoirs gratuits (toujours un par tour). Rien n'est enregistré. |
| **Campagne à deux** | Accueil → Deux joueurs | Les 100 niveaux de l'histoire, à deux et en coopération (voir ci-dessous). |
| **Duel : la conquête** | Accueil → Deux joueurs | Le même grand château, un tir chacun (voir ci-dessous). |
| **Chacun sa partie : le tournoi** | Accueil → Deux joueurs | Trois manches sur trois niveaux, au meilleur des trois. |
| **Face-à-face : le siège** | Accueil → Deux joueurs | Chacun sa catapulte, son château et son roi (6 arènes symétriques). |

**À deux, tout se joue en Difficile** : deux humains face aux châteaux, il fallait des défis à leur mesure (un tir de moins, vent plus fort, défenseurs plus résistants, moitié moins de munitions spéciales). Chaque défenseur abattu rapporte de la **renommée** à celui qui a tiré : soldat 1, chevalier 2, roi 4, et 2 de plus pour le **coup de grâce** (le dernier défenseur).

| Mode | Comment on gagne |
|---|---|
| **Campagne à deux** | Ensemble : les deux joueurs tirent à tour de rôle, se partagent les tirs du niveau et les munitions, et ont un score commun. Les étoiles se gagnent au nombre total de tirs. Le plus renommé est désigné **meilleur joueur**. La progression à deux est enregistrée à part dans le profil choisi, avec la Chronique et ses répliques. |
| **Duel** | Le plus renommé l'emporte. Dès que l'écart ne peut plus être rattrapé, la partie s'arrête (**victoire assurée**). À égalité de renommée, le meilleur score départage. Six grands châteaux de 10 à 15 défenseurs. |
| **Tournoi** | Chacun joue le niveau à son tour (celui qui commence alterne). Une manche est gagnée par celui qui prend le château, et s'ils le prennent tous les deux, par celui qui a utilisé **le moins de tirs**. S'ils échouent tous les deux, c'est le plus de défenseurs abattus qui compte, puis le score. Le premier à deux manches gagne. |
| **Face-à-face** | **Régicide** : abattre le roi adverse donne la victoire aussitôt. Sinon, il faut abattre tous ses défenseurs. Si les tirs s'épuisent, le château le plus solide encore debout l'emporte (renommée des survivants, puis leur nombre). Abattre ses propres défenseurs ne rapporte rien : tirez en cloche par-dessus votre château ! |

À deux, les joueurs sont repérés par une couleur **et** une forme (rond rouge, carré vert) et par leur nom, pour rester lisibles par les personnes daltoniennes. Le tournoi propose le chapitre 1 et tout ce que vos profils ont déjà débloqué.

### L'atelier et l'or

L'or récompense la **maîtrise**, pas la répétition : 30 pièces pour la première victoire d'un niveau, 15 pour chaque nouvelle étoile, **100 pour chaque défi relevé**, et 50 de plus quand les trois défis d'un niveau sont réussis. Rejouer une victoire déjà obtenue ne rapporte que 5 pièces, une défaite rien.

Le perfectionniste peut **tout débloquer** : la campagne rapporte jusqu'à 42 500 pièces, l'atelier complet (améliorations et apparences) en coûte 26 870. Avec environ 70 % des défis relevés, tout est déjà à portée ; sans les défis, il faut choisir.

Les meilleurs paliers demandent aussi des **étoiles** (colonne « Étoiles requises »).

| Amélioration | Effet par niveau | Prix | Étoiles requises |
|---|---|---|---|
| Bras renforcé (4 niveaux) | Lancer 7 % plus rapide | 300 · 700 · 1 300 · 2 200 | 0 · 30 · 90 · 180 |
| Boulets lestés (4 niveaux) | Projectiles 20 % plus lourds | 250 · 600 · 1 100 · 1 900 | 0 · 25 · 80 · 170 |
| Poix (3 niveaux) | Le feu grégeois embrase une zone 35 % plus large | 350 · 900 · 1 600 | 10 · 50 · 120 |
| Poudre fine (3 niveaux) | Explosions 15 % plus larges et plus fortes | 450 · 1 100 · 2 000 | 20 · 70 · 150 |
| Réserve de munitions (3 niveaux) | +1 munition spéciale de chaque type | 500 · 1 200 · 2 200 | 15 · 60 · 140 |
| Stratège (2 niveaux) | Pouvoirs 15 % moins chers | 400 · 1 000 | 10 · 60 |
| Éclaireur (2 niveaux) | Un tir supplémentaire dans chaque niveau | 1 500 · 3 500 | 60 · 200 |

S'y ajoutent des **apparences** sans effet sur le jeu : catapulte (chêne, bannière royale, ébène, dragon) et traînée du projectile (fumée, braises, étincelles d'or).

Elles changent vraiment la façon de jouer : avec un bras renforcé et des boulets lestés au maximum, une simple pierre fait plus de deux fois plus de dégâts ; la poix et la poudre fine font du feu et des explosifs une vraie stratégie.

Les profils créés avant la v3.1 gardent leurs étoiles et leur or ; leurs améliorations sont remboursées car les prix ont changé. En v3.2, les défis ont été renouvelés : les anciens succès sont remis à zéro (l'or déjà gagné est conservé) et peuvent être relevés à nouveau. Les améliorations s’appliquent en campagne et en mode libre, **jamais à deux joueurs**, pour que les parties restent équitables.

**Pour une future version payante (Play Store, site) :** une boutique « premium » est prête dans le code mais désactivée (`src/services/StoreService.js`). Le fichier explique comment brancher un système de paiement. Un petit serveur sera alors nécessaire pour vérifier les achats, sinon n'importe qui pourrait les simuler.

### Les sauvegardes

La partie est enregistrée automatiquement dans le navigateur (3 emplacements de profil). Effacer les données du navigateur efface aussi les sauvegardes.

---

## 3. Accessibilité

Tout se règle dans **Réglages** (et une partie directement depuis la pause) :

- **Aide à la visée** : affiche la trajectoire prévue du projectile en pointillés.
- **Puissance au début du tour** : 100 % par défaut (ou 75 %, 50 %, ou « Garder » la dernière visée).
- **Jauge lente** (trébuchet) : la jauge cloche ↔ tendu oscille plus lentement, l'arc est plus facile à choisir. Un **tic sonore** de plus en plus aigu suit l'angle de la fronde pendant le balancier.
- **Tutoriels guidés** et **récit** (la Chronique) : activables ou non.
- **Musique** : volume séparé des effets sonores (0 % pour la couper). Ses moments intenses sont aussi sous-titrés.
- **Sous-titres des sons** (malentendants) : chaque bruit important est écrit à l'écran avec sa direction, par exemple `◀ [Bois brisé]`.
- **Vibrations** sur téléphone pour les impacts et explosions.
- **Lecteur d'écran** (malvoyants) : l'interface est entièrement en HTML (pas seulement dessinée), chaque tour est annoncé (« Tour 2, 3 cibles restantes, vent 12 km/h vers la gauche »).
- **Contraste élevé**, **taille du texte** (100 %, 115 %, 130 %) et **thème sombre**.
- **Effets de sang** désactivables : un nuage de poussière les remplace.
- **Animations réduites** : désactive les tremblements d'écran et le suivi de caméra. Respecte automatiquement le réglage du système.
- **Jouable entièrement au clavier**, avec des zones tactiles d'au moins 44 pixels.

---

## 4. Petit lexique pour débuter avec Git et GitHub

Pas besoin d'être développeur pour s'y retrouver :

| Mot | Ce que ça veut dire |
|---|---|
| **Git** | Un logiciel qui garde l'historique de toutes les modifications d'un projet, comme un « historique des versions » de Word, mais pour tout un dossier. |
| **GitHub** | Un site web qui héberge des projets Git en ligne pour les partager en équipe. |
| **Dépôt** (*repository*) | Le dossier du projet avec tout son historique. |
| **Commit** | Une sauvegarde nommée dans l'historique : « j'ai ajouté telle fonction ». Chaque commit a un message qui explique le changement. |
| **Tag** / **version** | Une étiquette posée sur un commit important, par exemple `v1.0.0`. |
| **Cloner** | Télécharger un dépôt sur son ordinateur. |
| **Branche** | Une copie de travail parallèle, pour essayer quelque chose sans toucher à la version principale. |
| **Pull request** | Une demande pour intégrer les modifications d'une branche dans la version principale, avec relecture par l'équipe. |

### Voir l'historique sans rien installer

Sur la page GitHub du projet : cliquez sur **Commits** pour lire la liste des modifications, ou sur **Tags** / **Releases** pour voir les grandes versions.

---

## 5. Récupérer le projet sur son ordinateur

### Option A : sans Git (le plus simple)

Sur la page GitHub du projet, bouton vert **Code** → **Download ZIP**, puis décompressez l'archive.

### Option B : avec Git

1. Installez Git : <https://git-scm.com/downloads>
2. Ouvrez un terminal (sous Windows : « Invite de commandes » ou « PowerShell » ; sous macOS : « Terminal »).
3. Tapez :

```bash
git clone <adresse-du-dépôt>
cd catapulte-mania
```

---

## 6. Lancer le jeu en mode développement

**Prérequis :** Node.js en version **22 (22.13 ou plus) ou 24** : <https://nodejs.org> (prendre la version « LTS »). Les versions impaires (23, 25) ne sont pas prises en charge par les outils.

Dans le terminal, à l'intérieur du dossier du projet :

```bash
npm install      # une seule fois : télécharge les outils (quelques minutes)
npm run dev      # démarre le jeu
```

Le terminal affiche une adresse comme `http://localhost:5173`. Ouvrez-la dans le navigateur. Chaque modification du code s'affiche immédiatement.

Pour tester sur un téléphone connecté au même Wi-Fi : utilisez l'adresse « Network » affichée par le terminal.

---

## 7. Fabriquer la version finale et la mettre en ligne

| Commande | Résultat |
|---|---|
| `npm run build` | Version complète optimisée dans le dossier `dist/` |
| `npm run build:demo` | Démo en un seul fichier dans `dist-demo/index.html` |
| `npm run build:crazygames:basic` | Version CrazyGames sans publicité ni bouton vidéo, pour leur période de test (« Basic launch ») |
| `npm run build:crazygames` | Version pour le portail CrazyGames (avec ses publicités) dans `dist-crazygames/` |
| `npm run build:poki` | Version pour le portail Poki (avec ses publicités) dans `dist-poki/` |
| `npm run preview` | Affiche la version `dist/` en local pour vérifier avant publication |

**Avant de publier**, ouvrez le fichier `.env` et remplacez l'adresse `VITE_SITE_URL` par celle de votre site. Elle sert au référencement (Google, partages sur les réseaux sociaux).

**Mise en ligne gratuite avec Netlify** (déjà configuré, fichier `netlify.toml`) :

1. Créez un compte sur <https://netlify.com>.
2. « Add new site » → « Import an existing project » → choisissez le dépôt GitHub.
3. Netlify lit la configuration tout seul et publie le site. À chaque nouveau commit sur GitHub, le site se met à jour.

**Accès limité à quelques appareils (verrou du site Netlify)** :

Notre site Netlify n'est ouvert qu'aux appareils autorisés (deux aujourd'hui). La démo et les versions pour portails n'ont pas de verrou.

- Chaque appareil reçoit sa propre **clé d'accès**. La première fois qu'on ouvre le site, une page demande la clé : une fois saisie, elle est **liée à cet appareil** (à ce navigateur) et ne fonctionne plus ailleurs.
- Les clés se règlent dans Netlify : *Project configuration → Environment variables*.
  - `ACCESS_KEYS` : les clés, séparées par des virgules (une par appareil, au moins 20 caractères : lettres, chiffres, `-` ou `_`) ;
  - `GATE_SECRET` : un texte secret d'au moins 32 caractères (il signe le « badge » enregistré dans le navigateur).
- **Ajouter un appareil** : ajouter une clé à `ACCESS_KEYS`, puis redéployer.
- **Retirer ou remplacer un appareil** (appareil perdu, données du navigateur effacées) : remplacer sa clé par une nouvelle, puis redéployer. L'ancienne clé ne fonctionne plus.
- Sans ces deux variables, le site reste fermé (sécurité par défaut) et affiche « verrou non configuré ». Après avoir ajouté ou modifié une variable, il faut **redéployer** (Deploys → Trigger deploy → Deploy site) pour qu'elle soit prise en compte.

Le code du verrou se trouve dans `netlify/gate/AccessGate.js` (logique, testée) et `netlify/edge-functions/gate.js` (branchement sur Netlify).

Tout autre hébergeur de fichiers statiques convient (GitHub Pages, Cloudflare Pages, OVH…) : il suffit d'envoyer le contenu du dossier `dist/`.

### Publier sur les cinq portails retenus (v5.6)

Une seule commande prépare tout l'envoi pour **itch.io, Newgrounds, GameDistribution, GamePix et Y8** :

```
npm run release:portals
```

Le dossier `release/` contient alors un sous-dossier par portail : le jeu en `.zip` (prêt à téléverser), les images aux formats demandés, des captures d'écran et un fichier `LISTING.md` (textes de la fiche à copier-coller et marche à suivre, étape par étape).

GameDistribution et Y8 donnent un identifiant de jeu **après** la création de la fiche dans leur tableau de bord. Relancez alors la commande avec ces identifiants pour activer la publicité :

```
npm run release:portals -- --gd-id <id GameDistribution> --y8-game <Game ID Y8> --y8-app <App ID Y8>
```

### Publier sur un portail de jeux (CrazyGames, Poki)

Le guide complet (portails, Microsoft Store, Google Play, App Store) est dans [`docs/BOUTIQUES.md`](docs/BOUTIQUES.md).

Notre site reste **sans publicité**. Les portails, eux, apportent des joueurs et partagent les revenus publicitaires. Chaque portail a sa propre version du jeu :

1. Lancez `npm run build:crazygames` (ou `npm run build:poki`).
2. Compressez le **contenu** du dossier `dist-crazygames/` (ou `dist-poki/`) en un fichier `.zip`.
3. Envoyez ce zip depuis l'espace développeur du portail, puis testez-le avec leur outil d'aperçu.

Ce que contient une version portail :

- **Vidéos récompensées, toujours au choix du joueur** : un dernier tir quand les munitions sont épuisées (une fois par partie, campagne solo), ou l'or d'une victoire doublé.
- **Publicités entre deux niveaux** seulement, jamais pendant une visée : pas avant deux niveaux joués, puis au plus une toutes les 3 minutes (Poki décide lui-même de sa fréquence).
- **Son coupé et jeu masqué** pendant chaque publicité.
- **Sauvegarde synchronisée** sur CrazyGames : la progression suit le joueur connecté d'un appareil à l'autre. Les profils déjà présents sur l'appareil sont repris au premier lancement.
- Pas de mode hors-ligne : le portail sert le jeu lui-même.

Si le SDK du portail ne se charge pas (bloqueur de publicités, réseau), le jeu fonctionne normalement, simplement sans vidéo.

---

## 8. Organisation du code

Le code suit une **programmation orientée objet** : chaque notion du jeu est une classe avec une responsabilité unique.

```
src/
├── main.js                 Point d'entrée
├── App.vue                 Composant racine (Vue 3)
├── app/AppContext.js       État de l'application et accès aux services
├── config/gameConfig.js    Constantes du jeu (gelées)
├── core/utils/             Outils génériques : Guard (vérification des types), EventBus, hasard reproductible
├── domain/                 Objets métier : SaveSlot (profil), LevelResult (résultat de niveau)
├── services/               Services : StorageService, SaveManager, SaveSigner, SettingsService, I18nService, StoreService
├── i18n/                   Traductions fr, en, id
├── game/
│   ├── GameController.js   Relie le moteur au canevas (boucle, entrées, redimensionnement)
│   ├── GameSession.js      Une partie : joueurs, tours, tirs, fin de partie
│   ├── modes/              GameMode → StoryMode, FreeMode, CoopMode, DuelMode, HotSeatMode, VersusMode ; HotSeatMatch (tournoi), Renown
│   ├── progression/        UpgradeCatalog (atelier), GoldRules (barème de l'or), Achievements (les 18 défis)
│   ├── tutorial/           TutorialCoach : les tutoriels guidés, étape par étape
│   ├── story/              StoryRepository (la Chronique), Portraits (personnages pixel art dessinés par le code)
│   ├── Catapult.js         Visée et lancement
│   ├── Trebuchet.js        Trébuchet à contrepoids : balancier et fronde simulés, lâcher au clic
│   ├── TrajectoryPredictor Calcul de la trajectoire prévue (aide à la visée)
│   ├── physics/            Monde physique (Matter.js)
│   ├── entities/           Entity → Block, Projectile, Target, Barrel
│   ├── levels/             Les 100 niveaux (plans réutilisables), les arènes du face-à-face, les châteaux de duel
│   ├── aim/                AimInput → la visée au geste et au clavier ; TrebuchetInput → point d'impact, jauge et calcul du tir du trébuchet (modules purs, testés)
│   ├── powers/             Power → les 7 pouvoirs, PowerRegistry
│   ├── score/              ScoreKeeper, règles de score et d'étoiles
│   ├── rendering/          Renderer, Camera
│   ├── assets/             Graphismes (procéduraux ou images, interchangeables)
│   ├── audio/              Sons synthétisés, musique adaptative (MusicDirector), vibrations
│   └── effects/            Particules (éclats, fumée, feu)
├── components/             Composants Vue : écrans, HUD, éléments d'interface
└── styles/                 CSS : jetons de design, thèmes, écrans
tests/                      Tests automatiques
scripts/check-levels.mjs    Contrôle automatique des 100 niveaux
build/                      Sécurité (CSP) et service worker générés au build
```

**Choix techniques**

- **Vue 3 + Vite** : interface réactive, build rapide, fichiers légers.
- **Matter.js** : moteur physique 2D éprouvé. Il n'est téléchargé qu'à l'ouverture d'un niveau, pour que l'accueil s'affiche instantanément.
- **Graphismes procéduraux** : tous les éléments médiévaux sont dessinés par le code. Le jeu pèse moins de 400 Ko et reste net sur tous les écrans.
- **Sons et musique synthétisés** (Web Audio) : aucun fichier audio à télécharger, la musique se compose en direct et s'adapte à l'action.

---

## 9. Sécurité et anti-triche

- **Vérification des types à chaque entrée** : toute donnée venant de l'extérieur (sauvegarde, réglages, paramètres d'URL, saisies) passe par `Guard` et des schémas de validation. Une valeur invalide est rejetée ou remplacée par une valeur sûre.
- **Sauvegardes signées** (HMAC-SHA256) : modifier une sauvegarde à la main la rend invalide.
- **Contrôles de cohérence** : un score impossible, un niveau débloqué sans avoir fini le précédent, ou des étoiles incohérentes sont refusés.
- **Étoiles et succès non déclarables** : ils sont calculés par le moteur de jeu à partir de ce qui s'est réellement passé (tirs, munitions, destructions). Au chargement, les étoiles sont recalculées à partir du nombre de tirs enregistré, et une amélioration achetée sans les étoiles requises est refusée.
- **Or et améliorations vérifiés** : au chargement, le solde doit être exactement égal à l'or gagné moins l'or dépensé, et l'or gagné ne peut pas dépasser ce que les niveaux joués permettent. Une amélioration inconnue ou au-delà de son maximum est refusée.
- **Score scellé** : le score ne peut changer qu'en réaction au moteur physique ; il n'est pas accessible depuis la console du navigateur.
- **Objets gelés** : configuration, niveaux et règles sont figés (`Object.freeze`) et ne peuvent pas être modifiés pendant la partie.
- **Content-Security-Policy stricte** sur notre site : aucun script tiers, aucun `eval`, aucune connexion réseau sortante. Les versions portail autorisent en plus les régies publicitaires (en HTTPS uniquement), toujours sans `eval` ni plugin.
- **Récompenses publicitaires infalsifiables** : un tir supplémentaire ou de l'or doublé n'est accordé que sur présentation d'un « ticket » émis par le service de publicité après une vidéo vue en entier. Chaque ticket ne sert qu'une fois, pour une seule récompense. L'or gagné grâce aux vidéos est comptabilisé à part dans la sauvegarde et plafonné : il ne peut jamais dépasser l'or gagnable en jouant.
- **En-têtes HTTP de sécurité** (fichier `public/_headers`) : protection contre l'intégration dans une autre page, le reniflage de type, etc.
- **Aucune utilisation de `innerHTML`** avec des données du joueur (le nom du profil est toujours affiché comme du texte).

> **Limite à connaître :** sans serveur, tout le code s'exécute sur l'appareil du joueur. Une personne très déterminée et experte peut toujours modifier ce qui tourne dans son propre navigateur. Ces protections arrêtent la triche facile (modifier la sauvegarde, la console) et rendent le reste difficile. Pour un classement en ligne vraiment inviolable, il faudrait un serveur qui rejoue et valide les parties.

---

## 10. Qualité : tests et contrôles

```bash
npm test              # tests automatiques (validation, sauvegarde, physique, gameplay, traductions)
npm run check:levels  # un joueur automatique vérifie que les 100 niveaux sont stables et gagnables en Difficile
npm run check:levels -- --engine trebuchet   # même contrôle, joué au trébuchet
npm run lint          # vérification du style de code
```

### Contrôles automatiques sur GitHub

À chaque envoi sur GitHub, l'onglet **Actions** du dépôt lance tout seul :

1. l'installation des outils, les tests et la vérification du style ;
2. la fabrication de la version complète et de la démo (téléchargeables en bas de la page du contrôle, rubrique « Artifacts ») ;
3. un audit **Lighthouse** sur mobile (3 passages) qui échoue si une note (Performance, Accessibilité, Bonnes pratiques, SEO) descend sous 95. Le rapport complet est accessible par un lien dans le détail de l'étape ;
4. la vérification des 100 niveaux.

Une coche verte ✅ à côté d'un commit signifie que tout est bon ; une croix rouge ❌ indique l'étape à corriger.

**Performance** : mesurée avec le profil mobile de Lighthouse (processeur ralenti 4×, connexion 4G lente) : affichage en moins d'une seconde, aucun décalage de mise en page. Pour vérifier vous-même : dans Chrome, ouvrez le site publié, puis `F12` → onglet **Lighthouse** → **Analyze page load**.

---

## 11. Historique des versions

Chaque grande étape est un commit commenté avec une étiquette de version. Le détail est dans [CHANGELOG.md](CHANGELOG.md). Les idées d'évolution sont dans [docs/IDEES.md](docs/IDEES.md).

| Version | Contenu |
|---|---|
| v0.1.0 | Initialisation du projet Vue 3 + Vite |
| v0.2.0 | Services : validation des données, sauvegarde signée, réglages, traductions |
| v0.3.0 | Moteur : physique, entités, rendu, graphismes |
| v0.4.0 | Gameplay : catapulte, 40 niveaux, difficultés, pouvoirs, score anti-triche |
| v0.5.0 | Interface : écrans, HUD, langues, thèmes, accessibilité |
| v0.6.0 | Mode hors-ligne, référencement, équilibrage des niveaux |
| v1.0.0 | Documentation et version de présentation |
| v1.1.0 | Physique : écrasement des cibles, murs porteurs, effondrement des toits, effets de sang |
| v1.2.0 | Murs en pierre et en fer plus exigeants (tirs de face et puissants) |
| v1.3.0 | 40 niveaux redessinés : châteaux plus hauts, points de rupture, niveaux d'ingéniosité |
| v1.4.0 | Les personnages coincés sous un toit ou entre deux murs meurent écrasés |
| v2.0.0 | Plus rien ne flotte, boulets plus lourds, mode libre, deux joueurs (3 formules), atelier et or |
| v2.1.0 | Équilibrage : pierre au poids d'origine, fer blindé, écrasement plus exigeant, étoiles plus dures |
| v3.0.0 | 100 niveaux, 4 nouveaux matériaux et 6 climats, personnages fragiles et châteaux solides, grands châteaux de duel |
| v3.1.0 | 300 succès, étoiles au nombre de tirs, atelier plus exigeant (poix, poudre fine, étoiles requises), le bois brûle, victoire immédiate par le feu ou un pouvoir |
| v3.2.0 | Tutoriels guidés pour chaque outil, feu grégeois dès le niveau 9, 18 défis variés et or des défis (tout l'atelier devient accessible), bande son adaptative, la Chronique (récit entre les chapitres) |
| v3.2.1 | Les munitions découvertes restent disponibles pendant toute la campagne |
| v3.3.0 | Les personnages de la Chronique en pixel art (sans images), une réplique avant chaque niveau, histoire réécrite |
| v3.4.0 | Campagne à deux en coopération, nouvelles conditions de victoire (renommée, tournoi, régicide), tout en Difficile à deux, 6 arènes avec un roi |
| v3.5.0 | Versions pour les portails CrazyGames et Poki (vidéos récompensées facultatives, publicités entre les niveaux, sauvegarde synchronisée), langues chargées à la demande |
| v4.3.0 | Rendu modernisé : particules (fumée douce, feu lumineux, échardes, étincelles, explosions avec onde de choc, confettis), décor plus riche (nuages ombrés, arbres, oiseaux, brume), blocs biseautés |
| v4.4.0 | Engins et personnages redessinés : bois veiné, fer, cordes et cuir réalistes ; flou du bras, contrepoids qui se balance, fanion ; personnages qui respirent, clignent des yeux et réagissent aux coups |
| v4.5.0 | Châteaux aux matières réalistes (pierre, brique, grès, marbre, bois, chaume, fer, vitrail, glace) ; personnages animés et attentifs aux tirs ; sang en particules ; le boulet enflammé embrase ce sur quoi il retombe |
| v4.6.0 | Châteaux plus lointains, sur plateaux rocheux, avec plus de barils et de défenseurs ; coffre d'or quotidien ; démo de 10 niveaux vitrine ; atelier signalé dès qu'une amélioration est abordable |
| v5.0.0 | Terrains (lacs, lave, neige, montagnes), corbeaux et vouivres, boulet de givre et vapeur, percée des murs, 7 pouvoirs repensés, munitions débloquées tôt, chevaliers en armure, aide à la visée réactivable en jeu, cris des soldats |
| v5.1.0 | Lacs et lave réalistes, rondes des défenseurs, ogres, repère d'impact du trébuchet, baliste (arme ultime) |
| v5.2.0 | Visée professionnelle : module AimInput (pas de 0,5°, mode précision, annulation, clavier accéléré, molette), viseur gradué et repères du tir précédent |
| v5.3.0 | Commande du trébuchet : module TrebuchetInput (fanion-cible, instant de lâcher calculé, cercle d'approche et décompte sonore, geste unique, note de chaque lâcher, aide en Facile) |
| v5.4.0 | Trébuchet à deux clics : point d'impact exact, puis jauge cloche ↔ tendu avec la courbe en direct ; balancier fluide (dessin interpolé) |
| v5.4.1 | Identité AdamRodWebDev : logo du portfolio (hexagone d'or) dans le générique, nom du studio mis à jour partout |
| v5.5.0 | Interface mobile : plus aucun bouton sur la scène (colonne de commandes à droite à l'horizontale, plateau en bas à la verticale et sur tablette) |
| v5.6.0 | Cinq portails non exclusifs (GameDistribution, itch.io, GamePix, Y8, Newgrounds) : kits intégrés, paquets d'envoi et fiches (`npm run release:portals`) |
| v4.2.0 | Qualité des premières minutes (refus CrazyGames) : premier tir réussi, tutoriel en images, tirer-relâcher, barre de commandes compacte, caméra qui garde l'impact visible, trébuchet dès le niveau 4 |
| v4.1.1 | Versions portails jouables dans le cadre isolé de CrazyGames (script classique unique), démarrage plus robuste |
| v4.1.0 | Conformité CrazyGames : vidéos récompensées hors du jeu, langue du portail (anglais à défaut), démarrage en un clic, son coupé par le portail |
| v4.0.2 | Atelier : château en construction et preuve de victoire réellement enregistrés (le partage fonctionne) |
| v4.0.1 | Studio renommé Adamrodwebtech, adresse de contact, verrou du site Netlify (accès limité à deux appareils) |
| v4.0.0 | Siège sans fin, atelier de châteaux (éditeur et partage), vidéos récompensées facultatives (indice, pouvoir offert), événements saisonniers, préparation des boutiques |
| v3.9.0 | Défi du jour (même défi pour tous, série de jours) et liens « Bats mon tir » rejoués par le moteur ; célébrations et progression sur les portails |
| v3.8.0 | Nouveau nom : Catapulte Mania ; générique du studio Solo Levelling ; trébuchet rééquilibré (fenêtre de tir plus longue) et balancier infini ; sang désactivé par défaut sur les portails ; page de confidentialité ; visuels des fiches |
| v3.7.1 | Les 100 niveaux gagnables au trébuchet en Difficile : pierres plus lourdes au trébuchet, poudrières aux niveaux 36, 65, 88 et 96, niveaux 47, 96 et 100 rééquilibrés |
| v3.7.0 | Nouvel engin : le trébuchet, joué uniquement au clic (balancier puis lâcher), château plus loin, caméra qui suit le tir ; niveau d'apprentissage, choix de l'engin avant chaque niveau, balancier lent et repère sonore pour l'accessibilité |
| v3.6.0 | Vent repensé en Difficile (altitude, rafales, prise au vent selon le projectile, feu attisé) et représentation visuelle du vent (traînées, manche à air, fanion, HUD, sous-titres) |

Pour revenir à une version précise avec Git : `git checkout v0.4.0` (puis `git checkout main` pour revenir à la dernière).

---

## 12. Personnaliser le jeu

- **Ajouter une langue** : copier `src/i18n/en.js` sous un nouveau nom (ex. `es.js`), traduire les textes, puis l'ajouter dans `src/i18n/index.js` (avec son nom dans `LANGUAGE_NAMES`) et dans `LANGUAGES` de `src/config/gameConfig.js`. Lancer `npm test` : un test signale toute traduction manquante.
- **Modifier un niveau** : `src/game/levels/levelSpecs.js` (chaque niveau est décrit en quelques lignes), puis lancer `npm run check:levels` pour vérifier qu'il reste gagnable.
- **Remplacer les graphismes par des images** : déposer les images et les déclarer dans `src/game/assets/assets.config.js`. Le jeu bascule automatiquement de l'élément dessiné à l'image.
- **Changer les couleurs de l'interface** : `src/styles/tokens.css`.
- **Modifier l'histoire** : les textes sont dans les fichiers de traduction (rubriques `story` et `characters`) ; qui parle, et qui est sur scène, dans `src/game/story/StoryRepository.js`.
- **Retoucher ou ajouter un personnage** : les « maîtres » pixel art sont dans `art/portraits/` (PNG d'environ 100 × 120 pixels, 52 couleurs au plus), modifiables dans n'importe quel éditeur de pixel art. Lancer ensuite `python3 scripts/portraits/encode.py` pour régénérer les données du jeu. Pour partir d'une grande illustration sur fond en damier : `python3 scripts/portraits/convert.py image.png identifiant` (voir l'aide en tête du script).

---

*Polices : Cinzel (licence SIL Open Font License, voir `src/assets/fonts/OFL-Cinzel.txt`). Moteur physique : Matter.js (licence MIT). Interface : Vue.js (licence MIT).*
