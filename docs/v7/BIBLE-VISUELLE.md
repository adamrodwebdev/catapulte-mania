# Bible visuelle de Catapulte Mania 3D (v7)

Étape 1 de la [feuille de route](../../ROADMAP.md), commencée le 2026-11-25.

## Direction retenue (second passage, 2026-11-25)

Le premier passage (low-poly « diorama », plus bas) est **abandonné** : ce style est partout. Le
monde se construit désormais autour de **Fumivore**, la police victorienne de la fonderie Ressac
(`type-foundry/build/vapeur/`) :

- **Médiéval rencontre la vapeur.** Le siège reste médiéval ; Mordrac industrialise son royaume.
  Au chapitre 1 (Regular), son premier engin fume déjà dans le fort de bois : une chaudière rivetée
  sous un appentis, sa cheminée, des plaques rivetées sur la porte et les plateformes des tours.
- **La grammaire des lettres** devient celle des formes : montants fins, dalles lourdes (contraste
  inversé), une plaque rivetée au bout de chaque dalle ; la fumée dessinée comme le reste.
- **La gravure vivante** (`--look engrave`) : une seule matière pour tout. La lumière est lue en
  valeur (EEVEE, Shader to RGB), découpée en quatre tons qui assombrissent une teinte d'estampe
  (couleur de face désaturée de moitié, multipliée par le papier) ; l'ombre est hachurée en
  diagonale sous 0,36, croisée sous 0,16, traits plus épais à mesure qu'elle fonce ; un grain de
  papier ; contours à l'encre (Freestyle ici, une passe de bords dans le jeu) ; ciel couleur papier.
- **Palette de l'affiche** : encre `#1e1f21`, papier `#e7dfcc`, laiton `#b88d3e`, cuivre
  `#a8582f`, fer `#3f4246`, suie `#2a2826`, fumée `#cfc8ba`.
- **Comparaison** : `--look poster` donne la même scène en aplats sans hachures (plus net, plus
  plat). La gravure a plus de caractère : c'est elle qui est retenue.

## Troisième passage (2026-11-25)

- **La catapulte à vapeur du joueur** (`engine.py`) : roues à rayons cerclées de fer, plateau-dalle
  bleu de Prusse riveté aux quatre bouts, montants fins sous une traverse rivetée, chaudière de
  cuivre, **manomètre de laiton** (cadran papier, aiguille d'encre, zone rouge), piston qui pousse
  le bras, petite cheminée, fanion bleu. Au repos, le godet est en bas à l'arrière avec sa pierre.
- **La grammaire sur le fort** : un anneau de lourdes dalles sous le toit des tours, un linteau
  riveté sur des montants fins à la porte de la salle, des plaques rivetées aux angles des rondins.
- **Le casting** : épaulières en plaques rivetées et plastron du chevalier et du général ; le
  général porte un **heaume en cheminée** cerclé de laiton ; l'ingénieur devient le **chauffeur**
  (tablier de suie, lunettes de laiton, pelle) ; l'**ogre à vapeur** est voûté, avec un collier de
  fer riveté et une chaudière sur le dos.
- **Le ciel gravé** : papier réglé de traits horizontaux vers le haut de l'image, nuages dessinés.
- **Le HUD en Fumivore** (`.scratch/v7-hud/`, maquette en paysage 844 × 390, 568 × 320, l'invite
  en portrait 320 × 568 et l'écran titre) : plaques d'encre rivetées pour le chapitre et les
  compteurs, manomètre de laiton pour la puissance, **le mot PRESSURE dont l'axe PRES suit la
  puissance** (la chasse ne bouge pas), bouton FIRE en laiton, tube de guidage qui se vide en vol,
  le titre en Riveted.
- **Constat typographique** : les rivets ne se lisent qu'à partir d'environ 60 px. Les petits
  libellés du HUD restent entre Regular et Pressure (0 à 50) ; le stade Riveted est réservé aux
  grands mots (titre, annonces comme « Steady hand! »).
- **Budget** : la scène complète (fort, terrain, garnison, catapulte, nuages) fait 117 000
  triangles, juste sous la cible du niveau bas (120 000) : les rondins seront instanciés dans le jeu.

## Quatrième passage : les personnages (2026-11-25)

- **Le corps refait** (`cast.body`) : torse en douze côtés passant par les hanches, la taille, les
  côtes et la poitrine, épaules tombantes ; jambes avec genou et mollet, bras avec deltoïde, coude
  et avant-bras effilé ; mains en moufle avec un pouce ; un crâne et une mâchoire, toujours sans
  visage, têtes agrandies de 12 % pour se lire de loin.
- **Une pose détendue** : le poids sur la jambe droite, le genou gauche en avant, les pieds
  ouverts, les coudes pliés. Elle reste proche de la pose en A pour le gréement.
- **Des vêtements qui ont de la matière** : gambison matelassé, jupe plissée à l'ourlet, ceinture
  à boucle de laiton et sacoches, poignets, revers de bottes, camail de mailles sous le chapeau de
  fer ; tabards et tabliers **épousent le corps** (panneaux suivant les rayons du torse et de la
  jupe) avec un galon à l'ourlet.
- **L'armure dans la grammaire de Fumivore** : épaulières bombées avec une lame dessous et des
  rivets, plastron riveté.
- Chaque vêtement suit l'orientation du personnage (corrigé : les tabards restaient face à la
  caméra quand un personnage tournait).
- **Planche** : `--scene heroes`, vues `heroes` (face) et `heroes_34` (trois quarts).
- **Budget** : environ 2 700 triangles par personnage ; la scène complète passe à 136 000, au-dessus
  du niveau bas (120 000). Il faudra un LOD des personnages (environ 800 triangles) pour le niveau
  bas et au-delà de 30 m.

Reste à faire sur les personnages : l'ogre (bras encore en blocs, tête collée à la cheminée), le
gréement et une première animation (repos, marche), les visages de casque des autres rôles.

## Cinquième passage : couleurs plus claires et premier gréement (2026-11-25)

- **Couleurs plus claires** (demande de l'utilisateur) : papier `#efe8d8`, teintes moins
  désaturées (22 % au lieu de 50 %) et moins assombries par le papier, tons relevés
  (0,66 / 0,84 / 1,0 / 1,14), hachures réservées aux ombres plus profondes.
- **Le soldat gréé** (`rig.py`, `--scene poses`) : 16 os posés sur les repères mêmes du corps
  (hanches, colonne, cou, tête ; cuisse, tibia, pied ; bras, avant-bras, main de chaque côté).
  Peau rigide : chaque pièce a été marquée de son os à la construction (`cast.bone`), le torse et le
  tabard se partagent entre hanches et colonne selon la hauteur, la lance suit la main gauche.
- **Les états** posés par directions d'os : au repos, course, à genoux, à l'abri (derrière un muret),
  caché (derrière des tonneaux, bras sur la tête), touché (projeté en arrière). Vues `poses`,
  `poses_side`, `poses_back`.
- **Le ragdoll** : la table `RAGDOLL` donne pour chaque os une capsule, une part de masse (75 kg) et
  des limites d'articulation (cône, torsion, charnières aux genoux et aux coudes) ; `ragdoll_table()`
  l'exporte pour la physique du jeu.
- **Finitions du soldat** (même jour) :
  - la lance a son propre os d'accessoire (`spear`, enfant de la main gauche) : droite derrière le
    muret, **posée au sol** quand il se cache, **arrachée de la main** quand il est touché ;
  - des **rotules** aux hanches, genoux, épaules et coudes, sur l'os enfant : plus de fente quand
    un membre plie ;
  - son équipement : baudrier en travers du torse, dague à la hanche droite, gourde à la gauche ;
  - **le cycle de course** (`run_phase(t)`, `--scene run`, vue `run_strip`) : cuisse, genou et
    pied lus dans des tables de clés sur une foulée (passage, contact, amorti, passage, poussée),
    la jambe droite décalée d'une demi-foulée, les hanches qui rebondissent deux fois par foulée
    (au plus bas à l'amorti), le torse penché de 14°, les bras opposés aux jambes, coudes près de
    90°. Dans le jeu, la phase avancera avec la distance parcourue, pas avec le temps : les pieds
    ne glisseront pas.
- **Les transitions animées** (`anim.py`, `--scene anim`, 175 images à 24 images/s, 7,3 s) : au
  repos qui respire → sursaut (accroupissement d'anticipation, tête qui se lève) → alarme → course
  de deux foulées (l'objet avance avec la foulée) → freinage → plongeon à l'abri avec dépassement
  puis tassement → coup d'œil par-dessus le muret, retrait, second coup d'œil → touché (projeté en
  arrière, la lance arrachée) → chute, petit rebond, étendu. Chaque clé part de la pose de repos
  (aucune torsion accumulée), courbes adoucies ; la tête, les mains et la lance suivent le corps
  avec deux images de retard. La chute tient la place du ragdoll du jeu.
  Corrigé le même jour, mesures à l'appui :
  - **les pieds ne glissent plus** : une première passe mesure le pied posé pendant la course
    (127,5 mm de recul par image, cheville la plus basse à 5,8 cm) ; la seconde relève les hanches
    de 4,2 cm (la cheville posée revient à 10,2 cm, sa hauteur debout) et fait **avancer le corps
    par le pied posé** (à chaque image, le corps avance de ce dont le pied recule sous lui ; en vol,
    à la vitesse moyenne). Glissement du pied posé : 44 mm par image à vitesse constante,
    **0,3 mm** ainsi. Le jeu fera de même (mouvement racine tiré du pied d'appui) ;
  - **la lance** ne redevient plus droite : dès qu'elle quitte la main, sa trajectoire (un arc et
    une rotation jusqu'au sol) est cuite image par image dans l'espace du squelette, sans plus
    suivre la main.
## Sixième passage : l'ogre et la vouivre gréés, leurs contres (2026-11-25)

Tout est dans `art/v7/blender/creatures.py`.

- **L'ogre à vapeur** refait sur le corps humanoïde (× 1,75, carrure 1,45, ventre 1,45) : son dos voûté
  est désormais **une pose** de la colonne et du cou (plus une déformation du maillage), la tête
  se dégage de la cheminée, ramenée à l'omoplate et réduite. Collier riveté (os du cou), chaudière
  de cuivre cerclée sur le dos (colonne), massue dans la main gauche.
  États (`--scene ogres`) : au repos voûté, armé (massue derrière l'épaule, poids en arrière),
  frappe (massue à plat devant, à hauteur de la pierre), accompagnement (la massue emportée à
  droite, le corps qui suit), touché.
- **Le contre de l'ogre** (`--scene ogre_anim`, 64 images) : il voit venir la pierre (la tête se
  lève), arme, attend, frappe ; la pierre rencontre la massue à l'image 30, au point mesuré sur l'os
  de la main, puis repart en cloche d'où elle venait ; accompagnement et retour au repos.
- **La vouivre** refaite et gréée en créature : corps, cou en deux os, tête et mâchoire articulée
  (cornes, dents, crête de plaques dorsales comme les dalles de Fumivore), queue en quatre os
  terminée en pique, ailes en trois os (bras, avant-bras, doigt), pattes. La membrane de chaque aile
  est **une seule nappe** dont chaque sommet appartient à l'os le plus proche : elle s'étire quand
  l'aile se replie, sans se déchirer.
  États (`--scene wyverns`) : plané, battement bas, battement haut, morsure (plongée, gueule
  ouverte), coup de queue, touchée.
- **Le contre de la vouivre** (`--scene wyvern_anim`, 62 images) : elle bat des ailes sur place,
  **arme sa queue de l'autre côté** (anticipation), la fouette, frappe la pierre avec la pique à
  l'image 39 et la renvoie par-dessus son dos, puis reprend le vol plané.
- Reste à faire : une vouivre plus menaçante (la tête fait encore chien), les cris et le sang, la
  physique réelle (ragdolls, rebond de la pierre calculé par Rapier dans le jeu).

- Fait depuis : les contres de l'ogre et de la vouivre (sixième passage), les transitions animées
  et la lance (cinquième passage). Reste : les cris et le sang (moteur sonore et effets du jeu,
  étape 3 de la feuille de route).

Prochains passages : les dix matières en blocs de château, un chapitre de pierre et de fer pour voir
l'axe Pressure monter, et le choix de la police de texte courant (la maquette utilise IM Fell
English en attendant).

---

# Premier passage (abandonné) : low-poly diorama

Les scènes se reconstruisent sans interface, en une quinzaine de secondes par vue :

```
blender -b --factory-startup -P art/v7/blender/stage.py -- --scene fort --with-cast --out <dossier> --shots establishing,player,gate,yard
blender -b --factory-startup -P art/v7/blender/stage.py -- --scene cast --out <dossier> --shots cast,cast_side
```

| Fichier | Rôle |
|---|---|
| `art/v7/blender/kit.py` | les pièces : rondin taillé, ligature de corde, pierre des champs, planche, poutre, chaume (pyramide et pignon), tonneau, sapin, chêne, rocher, bannière |
| `art/v7/blender/fort.py` | le fort du chapitre 1, son terrain, ses arbres et ses montagnes |
| `art/v7/blender/cast.py` | les personnages sans visage, la planche de présentation et la garnison du fort |
| `art/v7/blender/stage.py` | lumière, ciel, caméras et rendu (EEVEE) |

## Les principes

1. **Un diorama de bois taillé à la main.** Du low-poly détaillé à facettes : chaque pièce est un
   peu irrégulière (rondins de hauteurs et de diamètres variés, légèrement courbés, coins de pierre
   repoussés), jamais une forme parfaite répétée.
2. **Lisible à 60 m.** La silhouette, la couleur et le couvre-chef disent le rôle. Rouge carmin et
   or pour l'ennemi ; bleu royal et chêne doré pour le joueur. Les personnages sont à l'échelle
   héroïque (× 1,12) pour se lire de loin.
3. **Pas de visage.** La tête est un œuf de couleur argile ; casques, capuches et couronnes font le
   reste. Le modelage et l'animation en sont plus simples, et le style plus net.
4. **La couleur dans la géométrie.** Une couleur par face (attribut `Col`, exporté en glTF
   `COLOR_0`), une matière par famille de surface (bois, pierre, sol, feuillage, tissu, métal,
   lueur). Aucune texture au niveau bas ; peu d'appels de dessin à tous les niveaux.
5. **Une lumière de fin d'après-midi au chapitre 1.** Soleil chaud à 32° derrière l'épaule gauche
   du joueur, ciel bleu en appoint, AgX contraste moyen-haut (three.js : `AgXToneMapping`, le même
   rendu dans le jeu). La brume se fait dans les couleurs (montagnes bleutées), pas en volume.

## La palette du chapitre 1 (sRGB)

| Famille | Couleurs |
|---|---|
| Bois | écorce `#5e4029`, écorce sombre `#4a3220`, bois taillé `#c99d68`, planche `#7a5638`, planche grise `#7f6a55` |
| Liens et paille | corde `#b39058`, chaume `#b08b4b` et `#86662f`, dessous du chaume `#4d3a22`, foin `#d8b45a` |
| Pierre et fer | pierre `#8d887e` et `#a49e92`, mortier `#6c675f`, fer `#45484d`, cotte de mailles `#7c8086` |
| Terrain | herbe `#5a7a35`, `#788f43`, herbe sèche `#8f8f4c`, terre `#86684a` et `#6b533a`, rocher `#7f8584` |
| Lointain | collines `#7d9488` → `#9fb1b6`, montagnes `#9aabbd` → `#b9c6d3`, neige `#eef1f3` |
| Camps | ennemi : carmin `#a1262a`, or `#d6a23f` ; joueur : bleu royal `#2e5dab` ; tête argile `#b98f6a` |

Toutes les couleurs restent entre 3 % et 85 % de réflectance (valeurs mesurées du monde réel) :
rien de noir pur ni de blanc pur.

## Les budgets (premières mesures)

| Ce qui est mesuré | Triangles |
|---|---|
| Le fort complet (palissade, tours, porte, chemin de ronde, salle, huttes, accessoires) | environ 33 000 |
| La palissade seule (environ 170 rondins liés) | 19 300 |
| Un personnage | 600 à 1 200 (ogre et vouivre compris) |
| La garnison (13 personnages, 2 corbeaux, 1 vouivre) | 12 400 |
| Le terrain, les arbres, les rochers et les montagnes | environ 45 000 |
| **La scène entière** | **90 000** |

Cibles proposées par niveau de qualité (à confirmer sur de vrais téléphones à l'étape 2) :

| Niveau | Triangles à l'écran | Ombres | Densité de pixels | Images/s |
|---|---|---|---|---|
| Bas (Android 4 Go) | 120 000 | une seule carte, 1 024 px, ou ombres en tache | 1 | 30 |
| Moyen | 250 000 | 2 048 px | 1,5 | 60 |
| Haut | 500 000 | 2 048 px, ombres douces | 2 | 60 |

La scène actuelle tient déjà dans le niveau bas. Les rondins de la palissade seront des instances
dans le jeu (une forme, des centaines de copies), le terrain lointain un modèle simplifié.

## Ce que ce passage montre, et ce qui reste à faire

Fait : le fort, la lumière, le terrain, la planche des dix rôles et des deux volants, la garnison
en place.

Prochain passage, selon vos retours :

- l'**ogre** : bossu, tête en avant, avant-bras énormes, jambes courtes (il ressemble encore à un robot) ;
- le **chaume** des toits à pignon : des mèches plus marquées, une crête moins lisse ;
- la **planche des dix matières** (bois, paille, pierre, brique, grès, verre, fer, glace, marbre,
  chaume) en blocs de château ;
- la **catapulte du joueur** au premier plan, en bleu royal ;
- les **feux** : torches, braseros, fumée ; l'**eau** et la **lave** des autres chapitres ;
- les **maquettes de l'interface** en paysage (568 × 320 d'abord), écran « Tournez votre téléphone » compris.
