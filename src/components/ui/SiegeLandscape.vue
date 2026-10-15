<script setup>
/**
 * Illustration d'accueil en SVG (légère, nette sur tous les écrans).
 * Le motif central est la parabole en pointillés qui relie la catapulte au
 * château : l'essence du jeu. Elle se trace une fois au chargement.
 *
 * v6 (2026) : un diorama en plans (chaînes lointaines dans la brume, collines,
 * château aux fenêtres éclairées, torche qui vacille à la porte, étoiles qui
 * scintillent, nuages qui dérivent) et une légère parallaxe qui suit le
 * pointeur sur ordinateur (variables --px / --py posées par l'écran
 * d'accueil). Tout est en CSS : figé si les animations sont réduites.
 */

/** Étoiles : position et taille déterministes (aucun hasard au rendu). */
const STARS = Array.from({ length: 46 }, (_, i) => [((i * 337) % 1600) + 7, ((i * 191) % 380) + 12, 0.8 + ((i * 7) % 5) * 0.35])
</script>

<template>
  <svg class="landscape" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="ls-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" class="landscape__sky-top" />
        <stop offset="0.62" class="landscape__sky-mid" />
        <stop offset="1" class="landscape__sky-bottom" />
      </linearGradient>
      <radialGradient id="ls-sun" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" class="landscape__sun-core" />
        <stop offset="1" class="landscape__sun-halo" />
      </radialGradient>
      <linearGradient id="ls-haze" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" class="landscape__haze-top" />
        <stop offset="1" class="landscape__haze-bottom" />
      </linearGradient>
      <radialGradient id="ls-glow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#ffcf6b" stop-opacity="0.55" />
        <stop offset="1" stop-color="#ffcf6b" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="ls-vignette" cx="0.5" cy="0.45" r="0.75">
        <stop offset="0.55" stop-color="#000" stop-opacity="0" />
        <stop offset="1" stop-color="#000" stop-opacity="0.45" />
      </radialGradient>
    </defs>
    <rect width="1600" height="900" fill="url(#ls-sky)" />

    <!-- Étoiles (visibles la nuit) -->
    <g class="landscape__stars">
      <circle v-for="(s, i) in STARS" :key="i" :cx="s[0]" :cy="s[1]" :r="s[2]" :style="{ animationDelay: `${(i % 7) * 0.6}s` }" />
    </g>

    <g class="landscape__layer landscape__layer--sky">
      <circle cx="1180" cy="250" r="240" fill="url(#ls-sun)" />
      <circle cx="1180" cy="250" r="62" class="landscape__sun" />
      <!-- Nuages qui dérivent -->
      <g class="landscape__clouds">
        <path class="landscape__cloud" d="M120 210 q40 -50 100 -20 q40 -40 90 0 q50 -10 60 30 q-120 20 -250 -10z" />
        <path class="landscape__cloud landscape__cloud--far" d="M760 150 q30 -36 74 -14 q34 -30 70 0 q40 -8 48 22 q-96 16 -192 -8z" />
        <path class="landscape__cloud" d="M1380 330 q34 -40 84 -16 q36 -34 78 0 q44 -8 52 26 q-108 18 -214 -10z" />
      </g>
    </g>

    <g class="landscape__layer landscape__layer--far">
      <path class="landscape__distant" d="M0 600 L90 540 L190 575 L330 470 L470 545 L600 500 L760 560 L900 455 L1040 530 L1190 480 L1320 540 L1460 470 L1600 520 V900 H0Z" />
      <rect y="440" width="1600" height="260" fill="url(#ls-haze)" />
      <path class="landscape__far" d="M0 640 L120 560 L260 600 L420 500 L560 580 L700 520 L860 590 L1000 470 L1160 560 L1300 500 L1460 580 L1600 520 V900 H0Z" />
    </g>

    <g class="landscape__layer landscape__layer--near">
      <path class="landscape__near" d="M0 720 Q300 660 620 700 T1200 670 Q1420 650 1600 690 V900 H0Z" />
      <!-- Château sur sa colline -->
      <g class="landscape__castle">
        <circle cx="1240" cy="560" r="230" fill="url(#ls-glow)" class="landscape__glow" />
        <path d="M1040 690 Q1230 600 1460 690Z" />
        <rect x="1120" y="520" width="240" height="150" />
        <rect x="1095" y="440" width="58" height="230" />
        <rect x="1327" y="440" width="58" height="230" />
        <rect x="1205" y="380" width="70" height="290" />
        <path d="M1095 440 l29 -58 l29 58Z M1327 440 l29 -58 l29 58Z M1205 380 l35 -70 l35 70Z" />
        <path d="M1120 520 h20 v-16 h20 v16 h20 v-16 h20 v16 h20 v-16 h20 v16 h20 v-16 h20 v16 h20 v-16 h20 v16 h20 v-16 h20 v16 h20 v-16 h20 v16" />
        <!-- Fenêtres éclairées -->
        <g class="landscape__windows">
          <rect x="1118" y="480" width="10" height="18" rx="5" />
          <rect x="1350" y="470" width="10" height="18" rx="5" />
          <rect x="1234" y="430" width="12" height="22" rx="6" />
          <rect x="1170" y="560" width="10" height="16" rx="5" />
          <rect x="1300" y="560" width="10" height="16" rx="5" />
        </g>
        <rect x="1222" y="600" width="36" height="70" rx="18" class="landscape__gate" />
        <circle cx="1210" cy="610" r="22" fill="url(#ls-glow)" class="landscape__torch" />
        <path d="M1240 310 v-60 l46 16 -46 16" class="landscape__flag" />
      </g>
    </g>

    <!-- Trajectoire -->
    <path class="landscape__arc" d="M300 600 Q760 80 1215 470" />
    <circle cx="1215" cy="470" r="14" class="landscape__stone" />

    <g class="landscape__layer landscape__layer--front">
      <!-- Catapulte au premier plan -->
      <g class="landscape__catapult" transform="translate(250 700)">
        <rect x="-110" y="-30" width="220" height="20" rx="4" />
        <path d="M-60 -26 L4 -110 L16 -110 L-44 -26Z M70 -26 L16 -110 L4 -110 L54 -26Z" />
        <rect x="40" y="-170" width="16" height="150" rx="4" />
        <g transform="translate(10 -110) rotate(-58)">
          <rect x="-18" y="-8" width="175" height="16" rx="6" />
          <ellipse cx="160" cy="-12" rx="24" ry="15" />
        </g>
        <circle cx="-72" cy="-10" r="26" class="landscape__wheel" />
        <circle cx="72" cy="-10" r="26" class="landscape__wheel" />
      </g>
      <path class="landscape__ground" d="M0 770 Q400 735 800 760 T1600 750 V900 H0Z" />
    </g>
    <rect width="1600" height="900" fill="url(#ls-vignette)" class="landscape__vignette" />
  </svg>
</template>

