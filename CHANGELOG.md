# Journal des modifications

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), numérotation [SemVer](https://semver.org/lang/fr/).

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
