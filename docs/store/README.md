# Visuels pour les fiches des portails

Générés automatiquement depuis le jeu (aucun montage) :

| Fichier | Usage |
|---|---|
| `cover-1920x1080.png` | Couverture paysage (CrazyGames, Poki, itch.io) |
| `cover-800x1200.png` | Couverture portrait |
| `cover-800x800.png` | Couverture carrée |
| `og-image.png` | Image de partage (réseaux sociaux), copiée dans `public/` |
| `screenshot-1.png` à `screenshot-4.png` | Captures de jeu 1280 × 720, sans interface |
| `screenshot-hud-*.png` | Captures 1280 × 720 avec l'interface |

Vérifiez les formats exacts demandés par chaque portail au moment de la soumission : ils changent parfois.
La page de confidentialité à indiquer dans les fiches est `privacy.html` (à la racine du site).

## CrazyGames (`crazygames/`)

Couvertures conformes à leurs règles : **seulement le titre** (pas de slogan, pas de score, pas de logo), sans bordure.

| Fichier | Format demandé |
|---|---|
| `crazygames/cover-1920x1080.png` | Paysage 16:9 |
| `crazygames/cover-800x1200.png` | Portrait 2:3 |
| `crazygames/cover-800x800.png` | Carré 1:1 |
| `crazygames/preview-landscape-1920x1080.mp4` | Vidéo d'aperçu paysage (16,6 s, sans son, commence par la couverture) |
| `crazygames/preview-portrait-1080x1620.mp4` | Vidéo d'aperçu portrait 2:3 (mêmes images, fond flouté) |

## Portails non exclusifs (`portals/`, v5.6)

| Dossier | Contenu |
|---|---|
| `portals/itchio/` | couverture 630×500 |
| `portals/newgrounds/` | icône 600×600, bannière 1280×720 |
| `portals/gamedistribution/` | 512×512, 512×384, 512×340, 1280×720, 1280×550 |
| `portals/gamepix/` | icône 256×256 et couverture 1360×850, **sans texte** (règle GamePix) |
| `portals/y8/` | vignettes 512×384, 480×360, 512×512, couverture 1280×720 |
| `portals/screenshots/` | 5 captures de jeu 1280×720 |
| `portals/LISTINGS/` | fiche de chaque portail : marche à suivre, titre, description, commandes, tags |

`npm run release:portals` assemble ces fichiers avec le zip du jeu de chaque portail dans `release/`.
