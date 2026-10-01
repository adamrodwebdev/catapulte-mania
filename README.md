# 🏰 Crush the Castle

**Jeu de catapulte médiéval, 100 % dans le navigateur.**
Réglez l'angle et la puissance, calculez la trajectoire, et faites tomber les forteresses pour atteindre les soldats cachés à l'intérieur.

- 40 niveaux répartis en 4 chapitres : du bois et de la paille au début, puis la pierre, le fer, les barils explosifs et de nouveaux projectiles
- 3 difficultés (Facile, Normal, Difficile)
- 6 pouvoirs spéciaux à débloquer (un seul par tour, chaque utilisation coûte des points)
- Français, English, Bahasa Indonesia
- Thème clair, thème sombre et mode contraste élevé
- Jouable sur téléphone, tablette et ordinateur, à la souris, au doigt ou au clavier
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

La **démo** est un seul fichier, `crush-the-castle-demo.html`, qui contient tout le jeu (les 8 premiers niveaux).

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

**Le but :** éliminer tous les personnages (soldats, chevaliers, rois) avant d'avoir épuisé ses tirs.
**Le vent** (indiqué en haut à droite) dévie les projectiles.
**La physique des bâtiments :** un bloc qui tombe sur un personnage l'écrase. Frappez un mur porteur de face et assez fort : il cède et le toit ou le plancher qu'il soutenait s'effondre. Le bois cède facilement, la pierre demande un rocher lancé avec force, le fer pratiquement des explosifs.
**Les étoiles :** 1 à 3 étoiles selon le score et le nombre de tirs restants.

### La progression

| Chapitre | Niveaux | Nouveautés |
|---|---|---|
| 1. La Palissade | 1 à 10 | Bois et paille, faciles à casser. On apprend à viser. |
| 2. Le Fort de pierre | 11 à 20 | Pierre et vitraux, barils explosifs, chevaliers en armure, rocher, feu grégeois |
| 3. La Forteresse | 21 à 30 | Fer, boulets de poudre, mitraille, le roi |
| 4. La Citadelle | 31 à 40 | Tout combiné, de nuit, vent fort |

### Les pouvoirs spéciaux

Un seul pouvoir par tour. Chaque utilisation retire des points au score final.

| Pouvoir | Débloqué après | Coût | Effet |
|---|---|---|---|
| Accalmie | 4 niveaux | 150 | Supprime le vent pour ce tir |
| Force du Titan | 8 niveaux | 250 | Projectile beaucoup plus lourd et destructeur |
| Feu grégeois | 12 niveaux | 200 | Le projectile enflamme ce qu'il touche |
| Volée | 18 niveaux | 350 | Tire trois projectiles en éventail |
| Charge de poudre | 24 niveaux | 300 | Le projectile explose à l'impact |
| Séisme | 30 niveaux | 400 | Secoue toutes les structures immédiatement |

### Les sauvegardes

La partie est enregistrée automatiquement dans le navigateur (3 emplacements de profil). Effacer les données du navigateur efface aussi les sauvegardes.

---

## 3. Accessibilité

Tout se règle dans **Réglages** (et une partie directement depuis la pause) :

- **Aide à la visée** : affiche la trajectoire prévue du projectile en pointillés.
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
cd crush-the-castle
```

---

## 6. Lancer le jeu en mode développement

**Prérequis :** Node.js version 22.12 ou plus récente : <https://nodejs.org> (prendre la version « LTS »).

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
| `npm run preview` | Affiche la version `dist/` en local pour vérifier avant publication |

**Avant de publier**, ouvrez le fichier `.env` et remplacez l'adresse `VITE_SITE_URL` par celle de votre site. Elle sert au référencement (Google, partages sur les réseaux sociaux).

**Mise en ligne gratuite avec Netlify** (déjà configuré, fichier `netlify.toml`) :

1. Créez un compte sur <https://netlify.com>.
2. « Add new site » → « Import an existing project » → choisissez le dépôt GitHub.
3. Netlify lit la configuration tout seul et publie le site. À chaque nouveau commit sur GitHub, le site se met à jour.

Tout autre hébergeur de fichiers statiques convient (GitHub Pages, Cloudflare Pages, OVH…) : il suffit d'envoyer le contenu du dossier `dist/`.

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
├── services/               Services : StorageService, SaveManager, SaveSigner, SettingsService, I18nService
├── i18n/                   Traductions fr, en, id
├── game/
│   ├── GameController.js   Relie le moteur au canevas (boucle, entrées, redimensionnement)
│   ├── GameSession.js      Une partie : tours, tirs, fin de niveau
│   ├── Catapult.js         Visée et lancement
│   ├── TrajectoryPredictor Calcul de la trajectoire prévue (aide à la visée)
│   ├── physics/            Monde physique (Matter.js)
│   ├── entities/           Entity → Block, Projectile, Target, Barrel
│   ├── levels/             Les 40 niveaux et leur assemblage
│   ├── powers/             Power → les 6 pouvoirs, PowerRegistry
│   ├── score/              ScoreKeeper, règles de score et d'étoiles
│   ├── rendering/          Renderer, Camera
│   ├── assets/             Graphismes (procéduraux ou images, interchangeables)
│   ├── audio/              Sons synthétisés et vibrations
│   └── effects/            Particules (éclats, fumée, feu)
├── components/             Composants Vue : écrans, HUD, éléments d'interface
└── styles/                 CSS : jetons de design, thèmes, écrans
tests/                      Tests automatiques
scripts/check-levels.mjs    Contrôle automatique des 40 niveaux
build/                      Sécurité (CSP) et service worker générés au build
```

**Choix techniques**

- **Vue 3 + Vite** : interface réactive, build rapide, fichiers légers.
- **Matter.js** : moteur physique 2D éprouvé. Il n'est téléchargé qu'à l'ouverture d'un niveau, pour que l'accueil s'affiche instantanément.
- **Graphismes procéduraux** : tous les éléments médiévaux sont dessinés par le code. Le jeu pèse moins de 400 Ko et reste net sur tous les écrans.
- **Sons synthétisés** (Web Audio) : aucun fichier audio à télécharger.

---

## 9. Sécurité et anti-triche

- **Vérification des types à chaque entrée** : toute donnée venant de l'extérieur (sauvegarde, réglages, paramètres d'URL, saisies) passe par `Guard` et des schémas de validation. Une valeur invalide est rejetée ou remplacée par une valeur sûre.
- **Sauvegardes signées** (HMAC-SHA256) : modifier une sauvegarde à la main la rend invalide.
- **Contrôles de cohérence** : un score impossible, un niveau débloqué sans avoir fini le précédent, ou des étoiles incohérentes sont refusés.
- **Score scellé** : le score ne peut changer qu'en réaction au moteur physique ; il n'est pas accessible depuis la console du navigateur.
- **Objets gelés** : configuration, niveaux et règles sont figés (`Object.freeze`) et ne peuvent pas être modifiés pendant la partie.
- **Content-Security-Policy stricte** : aucun script tiers, aucun `eval`, aucune connexion réseau sortante.
- **En-têtes HTTP de sécurité** (fichier `public/_headers`) : protection contre l'intégration dans une autre page, le reniflage de type, etc.
- **Aucune utilisation de `innerHTML`** avec des données du joueur (le nom du profil est toujours affiché comme du texte).

> **Limite à connaître :** sans serveur, tout le code s'exécute sur l'appareil du joueur. Une personne très déterminée et experte peut toujours modifier ce qui tourne dans son propre navigateur. Ces protections arrêtent la triche facile (modifier la sauvegarde, la console) et rendent le reste difficile. Pour un classement en ligne vraiment inviolable, il faudrait un serveur qui rejoue et valide les parties.

---

## 10. Qualité : tests et contrôles

```bash
npm test              # tests automatiques (validation, sauvegarde, physique, gameplay, traductions)
npm run check:levels  # un joueur automatique vérifie que les 40 niveaux sont stables et gagnables en Difficile
npm run lint          # vérification du style de code
```

### Contrôles automatiques sur GitHub

À chaque envoi sur GitHub, l'onglet **Actions** du dépôt lance tout seul :

1. l'installation des outils, les tests et la vérification du style ;
2. la fabrication de la version complète et de la démo (téléchargeables en bas de la page du contrôle, rubrique « Artifacts ») ;
3. un audit **Lighthouse** sur mobile (3 passages) qui échoue si une note (Performance, Accessibilité, Bonnes pratiques, SEO) descend sous 95. Le rapport complet est accessible par un lien dans le détail de l'étape ;
4. la vérification des 40 niveaux.

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

Pour revenir à une version précise avec Git : `git checkout v0.4.0` (puis `git checkout main` pour revenir à la dernière).

---

## 12. Personnaliser le jeu

- **Ajouter une langue** : copier `src/i18n/en.js` sous un nouveau nom (ex. `es.js`), traduire les textes, puis l'ajouter dans `src/i18n/index.js` (avec son nom dans `LANGUAGE_NAMES`) et dans `LANGUAGES` de `src/config/gameConfig.js`. Lancer `npm test` : un test signale toute traduction manquante.
- **Modifier un niveau** : `src/game/levels/levelSpecs.js` (chaque niveau est décrit en quelques lignes), puis lancer `npm run check:levels` pour vérifier qu'il reste gagnable.
- **Remplacer les graphismes par des images** : déposer les images et les déclarer dans `src/game/assets/assets.config.js`. Le jeu bascule automatiquement de l'élément dessiné à l'image.
- **Changer les couleurs de l'interface** : `src/styles/tokens.css`.

---

*Polices : Cinzel (licence SIL Open Font License, voir `src/assets/fonts/OFL-Cinzel.txt`). Moteur physique : Matter.js (licence MIT). Interface : Vue.js (licence MIT).*
