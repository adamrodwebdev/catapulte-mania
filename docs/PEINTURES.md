# Fonds peints : licence, provenance et ciels vivants (v6.4)

## Licence

Les dix fonds des chapitres (`art/backgrounds/chapter-N.png`, encodés dans
`src/game/assets/backgrounds/`) sont des images générées par **FLUX.1 [schnell]**
(Black Forest Labs), modèle ouvert sous **licence Apache 2.0** : « can be used for
personal, scientific, and commercial purposes »
(https://huggingface.co/black-forest-labs/FLUX.1-schnell). Elles servent donc partout,
y compris là où le jeu rapporte (Playgama partage ses revenus publicitaires).

Les peintures d'avant (v6.2 – v6.3) venaient de **Dola** (SPRING (SG) Pte. Ltd.), dont les
conditions (4 septembre 2026, https://www.dola.com/legal/terms/en) réservent le service à
un usage « private and non-commercial ». Elles ne sont plus dans aucun build ; leurs PNG
restent seulement en local (`art/backgrounds-dola/`, non versionné).

## Provenance des dix images

Générées le **18 octobre 2026**, en local (carte graphique NVIDIA), avec
**stable-diffusion.cpp** `master-973-f0aac52` (licence MIT) et les poids
**second-state/FLUX.1-schnell-GGUF** (https://huggingface.co/second-state/FLUX.1-schnell-GGUF) :

| Fichier | SHA-256 |
|---|---|
| `sd-master-f0aac52-bin-win-cuda12-x64.zip` | `68a7b08b87925a39dc1661d872a7625e633df90dc6e3c32165e7cb8815b7febf` |
| `cudart-sd-bin-win-cu12-x64.zip` | `fe20366827d357c00797eebb58244dddab7fd9a348d70090c3871004c320f38d` |
| `flux1-schnell-Q4_0.gguf` | `b338a7ab5c81600a54be46c4cf950edb3761a52ae163e419beafd250976fb566` |
| `t5xxl-Q5_0.gguf` | `f4df16c641a05c4a6ca717068ba3ee312875000f6fac0efbd152915553b5fc3e` |
| `clip_l.safetensors` | `660c6f5b1abae9dc498ac2d21e1347d2abdb0cf6c0c0c8576cd796491d9a6cdd` |
| `ae.safetensors` | `afc8e28272cd15db3919bacdb6918ce9c1ed22e96cb12c4d5ed0fba823529e38` |

Une image, 2048 × 1024, 4 étapes (environ 75 s) :

```
sd-cli --diffusion-model flux1-schnell-Q4_0.gguf --vae ae.safetensors --clip_l clip_l.safetensors --t5xxl t5xxl-Q5_0.gguf -p "<texte du chapitre> <style commun>" --cfg-scale 1.0 --sampling-method euler --steps 4 -W 2048 -H 1024 -s <graine> --backend te=cpu --vae-tiling -o chapter-N.png
```

Deux candidates par chapitre (graines 101 × N + 10 et + 11 ; 1020 et 1021 pour le
chapitre 10), comparées seules et dans le jeu ; la retenue :

| Chapitre | Graine | Générée (UTC) |
|---|---|---|
| 1. La Palissade | 111 | 10 h 46 |
| 2. Le Fort de pierre | 213 | 10 h 50 |
| 3. La Forteresse | 313 | 10 h 51 |
| 4. La Citadelle | 415 | 10 h 55 |
| 5. Les Marais | 515 | 10 h 56 |
| 6. Le Désert | 616 | 10 h 59 |
| 7. La Montagne | 717 | 11 h 01 |
| 8. L'Hiver | 818 | 11 h 04 |
| 9. L'Orage | 919 | 11 h 06 |
| 10. Le Trône | 1020 | 11 h 09 |

### Style commun (placé après le texte du chapitre)

FLUX.1 [schnell] ne lit que les 256 premiers jetons : le texte du chapitre passe d'abord.
Le rendu voulu est **photoréaliste** (demande du 17 octobre 2026 : un style plat ou
dessiné a été refusé).

> Photorealistic, highly detailed cinematic matte painting of a fantasy landscape: realistic natural light, volumetric sunbeams and atmospheric haze, detailed rock, grass and forest textures, deep aerial perspective, vivid natural colors, sharp distant detail. Ultra-wide 2:1 panorama at ground level, open rolling ground along the whole bottom edge, no buildings, people, animals or birds in the foreground, no text, no frame.

### Textes des chapitres

1. *Sunny alpine valley at midday: green meadows and dark pine trees on the left foreground, rolling green hills, a range of tall snow-capped rocky peaks across the middle distance with the highest peak at the left third, a bright white sun high in the upper right with soft rays, a few small white cumulus clouds, light blue sky fading to pale at the horizon.*
2. *Granite moorland just after the rain: purple heather and golden grass in the foreground, scattered large rounded boulders, a tall waterfall pouring off a rocky shelf in the lower left quarter with white spray at its foot, a ruined old stone bridge on a distant ridge, a lone tall pine at the far left edge, storm clouds parting in the upper left where bright beams of sunlight stream down, big white cumulus clouds on the right, blue sky.*
3. *Dramatic sunset: a large glowing sun low over the horizon right of center, orange and gold sky blending into deep purple at the top, a few lit pink clouds, jagged dark mountains on the left, a dark grassy hill rising on the left side with pine silhouettes, tall ruined stone towers silhouetted on the far right horizon, warm haze over distant valleys.*
4. *Calm moonlit night: deep indigo and violet sky with scattered small stars, a bright crescent moon in the upper right, thin dark clouds, layered rolling purple hills receding into blue mist, a dark pine forest silhouette at the left edge, faint mist in the valleys.*
5. *Misty green swamp at dawn: pale green-gray fog, still dark water pools and tall reeds across the lower left and middle, tall bare dead trees with twisted branches right of center, faint conifers and soft hills fading into the fog, muted pastel greens and grays, no visible sun.*
6. *Hot desert at noon: golden sand dunes with sharp crests in the middle distance, red sandstone mesas and rock arches on the left and far right, wind lifting thin sand from the dune crests, scattered dry shrubs, clear deep blue sky with a few thin high clouds, heat haze near the horizon.*
7. *High snowy mountain range in bright sunshine: sharp white peaks with blue shadows, the tallest at the left third, snow-covered slopes with a few dark fir trees in the foreground, a bright sun in the upper right corner with a soft glare, puffy white clouds in a clear blue sky, glittering snowfields.*
8. *Cold winter morning: a wide snow-covered plain, frosted fir trees on the left, distant pale snowy mountains in bluish haze, a small white winter sun in the upper right with long thin rays, pale blue sky with light wispy clouds, no falling snow.*
9. *Stormy night: heavy blue-black thunderclouds filling the sky, a pale moon half hidden behind the clouds near the top center lighting the cloud edges, distant layered dark hills and a line of trees, a dark rocky cliff with a twisted tree at the far left edge, cold blue tones, no rain, no lightning.*
10. *Volcanic wasteland at night: an erupting volcano in the middle with dark smoke plumes lit red from below, glowing orange lava rivers across the land, jagged black rocks, a black castle silhouette far away on the right, a crescent moon in the upper right, deep purple and crimson sky, a dark cliff edge at the far left.*

## Remplacer une image

1. La générer comme ci-dessus et l'enregistrer sous `art/backgrounds/chapter-N.png`
   (noter sa graine ici).
2. `npm run backgrounds` : WebP de sa largeur (2048 px) et version allégée de 1600 px,
   sans rognage ni retouche (les tables de retouche d'`encode.mjs` sont vides).
3. Dans `src/game/assets/backgrounds.js` : sa ligne de sol (`ground`), ses sommets
   (`peaks`, d'où le vent arrache neige, sable ou cendre) et son centre d'intérêt
   (`focus`, pour les téléphones en portrait).
4. Dans `src/game/sky/skyConfig.js` : la place de ce que le ciel vivant anime (soleil,
   lune, cascade, eau, cratère, bandes de brume…), puis vérifier le chapitre dans le jeu,
   à l'horizontale et en portrait.

## Ciels vivants sur des photographies

Les effets des ciels vivants (v6.3) ont été replacés peinture par peinture. Ce qui change
avec des photographies :

- **Rais de lumière** (`shafts`, chapitres 1, 2, 3, 7 et 8) : les rayons d'une photo sont
  des voiles de lumière trop doux pour être lus comme les traits d'une peinture (la
  lecture prenait les crêtes et les bords des nuages). Des faisceaux doux partent du
  soleil, respirent chacun à son rythme et pâlissent quand un nuage le voile.
- **Nuages du vent** : sur une peinture, ceux qui montrent le vent sont des voiles doux
  qui dérivent, plus des nuages dessinés.
- **Étoiles** : seuils propres au chapitre (les étoiles photographiées sont plus pâles),
  sans la lune ni le bord éclairé des nuages.
- **Eau** (chapitre 5) : l'eau des mares prend la teinte verte de la brume et se ride de
  reflets ; les ronds dans l'eau la trouvent quand même.
- **Lave** (chapitre 10) : seulement dans ses zones (le ciel rougi par l'éruption n'en est
  pas), d'un orange qui ne vire jamais au citron ; la fumée roule depuis le pied de la
  colonne peinte, au-dessus de la fontaine de lave.
- **Téléphone en portrait** : la peinture se cadre sur son centre d'intérêt (le grand
  sommet, la cascade, le volcan) au lieu de son milieu.

## Performances (mesurées le 18 octobre 2026)

Banc de rendu (vrai moteur de rendu, téléphone 844 × 390 à densité 2, processeur ralenti
6 fois), temps moyen d'une image, décor dessiné → peinture et son ciel vivant :

| Chapitre | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Dessiné (ms) | 12,6 | 15,5 | 14,4 | 17,8 | 11,8 | 11,5 | 17,9 | 13,8 | 12,9 | 16,1 |
| Peint (ms) | 8,0 | 10,0 | 8,9 | 10,8 | 9,5 | 9,5 | 13,4 | 10,1 | 9,3 | 9,9 |

La peinture coûte 18 à 39 % de moins ; ses pires images (5 %) restent sous 14 ms, sauf
au chapitre 7, dont le niveau mesuré a des pics avec ou sans peinture. Au Fort de pierre,
où cascade, risées, ombres et brume s'additionnent, les rais de lumière sont moins
nombreux et plus courts (ils coûtaient 2,4 ms de plus). Les poids : 1,6 Mo pour les dix
peintures, 0,83 Mo pour leurs versions allégées (1600 px), que chargent les petites vues ;
un appareil qui peine voit son ciel vivant se figer (`src/game/feel/FrameGuard.js`).
