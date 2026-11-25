# Playgama — fiche Catapulte Mania (v6.4)

## Marche à suivre
1. Console développeur Playgama → **Add Game**.
2. **Title** : `Catapulte Mania` (le titre affiché dans le jeu, dans les trois langues). **Game Engine** : `js` (JavaScript, sans moteur).
3. **Game Archive** : `catapulte-mania-playgama-<version>.zip` (`index.html` à la racine, noms de fichiers latins, Bridge Playgama v2 chargé en premier, `playgama-bridge-config.json` à côté d'`index.html`). Attendre que le contrôle du build soit passé.
4. **Description** et **How to play** : textes ci-dessous (100 caractères au moins chacun, en anglais).
5. **Supported Devices** : Desktop, Android, iOS. **Screen Orientation** : paysage **et** portrait (le jeu s'adapte aux deux).
6. **Game Features** : aucune (pas de classement Playgama, pas de multijoueur en ligne ni d'achats intégrés ; les modes à deux se jouent sur le même appareil).
7. **Game Languages** : English, French, Indonesian.
8. **Media** : `images/cover-800x800.png`, `images/cover-1080x1920.png`, `images/cover-1920x1080.png` (les trois sont exigées pour la Sandbox).
9. **Distribution** : à décider (par défaut, Playgama diffuse le jeu sur ses plateformes partenaires où il n'est pas déjà publié ; on peut en exclure).
10. **Link** : `https://catapulte-mania.netlify.app` (le jeu y est déjà publié).
11. **IA** : agent `claude-code`, modèle `claude-opus`, version « Claude Opus 5.5 ».
12. **Save Changes**, puis **Continue** → choisir le build → **Publish to Sandbox**. Le catalogue s'ouvre quand la Sandbox atteint ses objectifs (100 parties, 5 min de jeu en moyenne).

## Title
Catapulte Mania

## Description
Bring down the castle, one perfect shot at a time. Catapulte Mania is a medieval physics game: aim your siege engine, pick the right ammunition and watch towers of wood, stone, ice and marble collapse on their defenders. Every block, barrel and soldier is simulated, so no two collapses are alike.

100 handmade levels across ten lands, from straw huts to marble citadels: lava moats, snowfields, mountains you cannot destroy, crows that catch your shots, armored knights, ogres and warlords. Three siege engines (catapult, trebuchet, ballista), six kinds of ammunition (boulders, Greek fire, frost, bombs, grapeshot) and powers such as the falcon's eye or the earthquake.

More to play: a daily challenge, an endless siege, a castle workshop to build your own fortress, upgrades, achievements, two-player modes on the same device and three difficulty levels. In English, French and Indonesian, with a trajectory aid, high contrast and sound subtitles.

## How to play
Destroy every defender of the castle with the shots you have; fewer shots earn more stars.
Catapult and ballista: drag back from anywhere on the screen to aim, release to fire. Hold still (or Shift, or a second finger) for fine aiming; release near the start to cancel. Keyboard: arrow keys to aim, Space or Enter to fire.
Trebuchet: tap or click exactly where the projectile must land, then tap again to choose between a high lob and a flat shot.
Keys 1-6 choose the ammunition; tap or press Space during flight to split grapeshot. P pauses the game.

## Genre et mots-clés (si le formulaire en demande)
Physics, puzzle, strategy — castle, catapult, siege, medieval, destruction, trebuchet, skill.

## Ce que le build Playgama fait (v6.4)
- Bridge v2 initialisé avant tout ; langue de `bridge.platform.language` (anglais à défaut) ; sauvegarde par `bridge.storage` (une lecture groupée au démarrage, écritures groupées).
- `game_ready` une fois l'écran titre affiché ; étapes `level_started` / `level_paused` / `level_resumed` / `level_completed` / `level_failed`.
- Son coupé et partie en pause sur les événements de la plateforme (son, pause, publicité qu'elle lance).
- Interstitiel entre deux niveaux seulement (2 minutes au moins entre deux, aucun au premier niveau) ; vidéos récompensées à la demande, récompense seulement sur `rewarded`.
- Bloqueur de publicités : aucune vidéo proposée, rien n'attend une publicité ; une publicité qui ne s'ouvre pas en 12 s est abandonnée.
- Aucun lien vers l'extérieur (partage, courriel) ni adresse extérieure dans le code, hormis le Bridge.

## Fichiers de ce dossier
- `catapulte-mania-playgama-<version>.zip` : le jeu, `index.html` à la racine.
- `images/` : les trois couvertures (scène du jeu mise en scène, titre seul).
- `screenshots/` : captures de jeu 1280×720.

## Mise à jour (18 octobre 2026)
- Sandbox mise à jour avec `catapulte-mania-playgama-6.4.0-r3` (archive `cmvdsz8so9fqgmz0hfpeusfyn`, révision `cmvdt7plg9gngmz0hl0i0ut8s`) : les dix fonds photographiés (FLUX.1 [schnell], licence Apache 2.0) et leurs ciels vivants. Contrôle du build réussi (Bridge 2.3.1, chargement 772 ms, téléchargement initial 454 Ko ; les peintures se chargent chapitre par chapitre).
- Trois couvertures remplacées : la même scène devant le couchant peint.
- Outil de test : SDK initialisé, `game_ready`, sauvegarde par `bridge.storage`, langue de la plateforme ; niveau 1 joué avec sa peinture et son ciel vivant. Publicités non rejouées (Chrome avec bloqueur : aucune proposée, rien n'attend) ; leur code est celui vérifié sur r2.

## Publication (17 octobre 2026)
- Sandbox : https://playgama.ai/play/zifjwuawwwnzl2 (build `catapulte-mania-playgama-6.4.0-r2`, contrôle du build réussi, chargement 621 ms).
- Diffusion partenaires : cochée (par défaut). Trois « Free Starter Boost » disponibles (environ 100 parties chacun, sur 3 jours).
