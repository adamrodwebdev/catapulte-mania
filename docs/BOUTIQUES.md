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

## 1. Portails web (priorité)

1. **CrazyGames** : créer un compte développeur, téléverser le dossier `dist-crazygames` (zip), renseigner la fiche avec `docs/store/`. Tester d'abord dans leur outil de test (QA) : publicités, sauvegarde, lien « Bats mon tir ».
2. **Poki** : soumission sur dossier (sélection à l'entrée), avec `dist-poki`. Vérifier dans leur inspecteur que `shareableURL` renvoie bien les liens de défi.
3. **itch.io** : téléverser un zip de `dist` (version sans publicité) en « HTML ». Vous choisissez la part reversée à itch.io (10 % par défaut).

Classements CrazyGames : réservés aux jeux invités, avec une clé de chiffrement. Le jeu a déjà ses records locaux (défi du jour, siège sans fin) ; on branchera les classements quand CrazyGames aura invité le jeu.

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
