# Publier Catapulte Mania sur les boutiques et les portails

Ce guide liste ce qui est **déjà prêt dans le code** et ce qui demande **vos comptes** (je ne peux pas le faire à votre place).

## Ce qui est prêt

| Élément | Où |
|---|---|
| Versions portails (SDK, pubs, sauvegarde synchronisée, liens d'invitation) | `npm run build:crazygames`, `npm run build:poki` |
| Application installable (PWA) : manifeste, icônes 192/512/maskable, captures, hors-ligne | `public/manifest.webmanifest`, `build/sw.js` |
| Visuels des fiches (couvertures, captures, image de partage) | `docs/store/` |
| Page de confidentialité à indiquer dans les fiches | `privacy.html` à la racine du site |
| Boutique d'achats intégrés : point de branchement préparé, désactivé | `src/services/StoreService.js` |

## 1. Portails web (v5.6 : cinq portails non exclusifs)

CrazyGames est mis de côté pour l'instant. Les cinq portails retenus n'exigent **aucune exclusivité** : ils ne se gênent pas entre eux et n'empêchent pas un retour sur CrazyGames plus tard.

| Portail | Kit (SDK) | Ce qu'il faut de votre côté |
|---|---|---|
| **GameDistribution** | oui (pubs entre niveaux, vidéos récompensées) | créer le jeu, récupérer son **gameId**, activer « Rewarded ads » |
| **itch.io** | non | rien : téléverser le zip |
| **GamePix** | oui (pubs, vidéos, stockage, langue) | compte développeur, suivre les onglets du formulaire |
| **Y8** | oui (pauses publicitaires, vidéos) | créer le jeu, récupérer **Game ID** et **App ID** |
| **Newgrounds** | non | rien : téléverser le zip, vote des joueurs ensuite |

Tout se prépare d'une commande : `npm run release:portals` (dossier `release/`, un sous-dossier par portail : le zip du jeu, les images aux bons formats, 5 captures, la fiche `LISTING.md` avec la marche à suivre). Avec les identifiants : `npm run release:portals -- --gd-id <gameId> --y8-game <Game ID> --y8-app <App ID>`.

Écartés : **Poki** (exclusivité web de cinq ans par défaut, sinon forfait unique sans partage des revenus), **GameMonetize** (doublon du réseau GameDistribution), **Playgama** (diffuse aussi sur Discord et YouTube Playables), **Game Jolt** (audience faible), **Kongregate** (soumissions fermées). Les builds CrazyGames et Poki restent disponibles (`npm run build:crazygames`, `npm run build:poki`).

## 2. Microsoft Store (PC)

1. Inscription développeur individuelle gratuite (Partner Center).
2. Aller sur **pwabuilder.com**, entrer l'adresse du site Netlify, générer le paquet Windows.
3. Téléverser le paquet dans Partner Center, avec les visuels de `docs/store/`.

## 3. Google Play (Android)

1. Compte Google Play Console (25 $ une fois).
2. Générer une **Trusted Web Activity** avec pwabuilder.com (paquet Android).
3. Publier le fichier `/.well-known/assetlinks.json` fourni par PWABuilder sur le site (lien entre l'appli et le domaine).
4. Achats intégrés : ils passent obligatoirement par Google Play Billing, avec **un petit serveur pour vérifier les reçus** (sinon n'importe qui simule un achat). Le branchement est prévu dans `StoreService` ; c'est la seule brique qui demande un serveur.

## 4. App Store (iPhone)

Plus exigeant : Apple refuse les simples sites empaquetés (règle 4.2). Il faut une application Capacitor avec des fonctions natives (Game Center, vibrations, notifications du défi du jour). À envisager après les portails.

## Avant chaque soumission

- `npm test` et `npm run check:levels` (et `-- --engine trebuchet`) au vert.
- Lighthouse ≥ 95 sur les quatre indices (script `perf.mjs` de la chaîne d'outils).
- Relire la fiche dans les trois langues.
