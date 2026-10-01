<script setup>
/**
 * Illustration d'accueil en SVG (légère, nette sur tous les écrans).
 * Le motif central est la parabole en pointillés qui relie la catapulte au
 * château : l'essence du jeu. Elle se trace une fois au chargement.
 */
</script>

<template>
  <svg class="landscape" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="ls-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" class="landscape__sky-top" />
        <stop offset="1" class="landscape__sky-bottom" />
      </linearGradient>
      <radialGradient id="ls-sun" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" class="landscape__sun-core" />
        <stop offset="1" class="landscape__sun-halo" />
      </radialGradient>
    </defs>
    <rect width="1600" height="900" fill="url(#ls-sky)" />
    <circle cx="1180" cy="250" r="220" fill="url(#ls-sun)" />
    <circle cx="1180" cy="250" r="62" class="landscape__sun" />

    <path class="landscape__far" d="M0 640 L120 560 L260 600 L420 500 L560 580 L700 520 L860 590 L1000 470 L1160 560 L1300 500 L1460 580 L1600 520 V900 H0Z" />
    <path class="landscape__near" d="M0 720 Q300 660 620 700 T1200 670 Q1420 650 1600 690 V900 H0Z" />

    <!-- Château sur sa colline -->
    <g class="landscape__castle">
      <path d="M1040 690 Q1230 600 1460 690Z" />
      <rect x="1120" y="520" width="240" height="150" />
      <rect x="1095" y="440" width="58" height="230" />
      <rect x="1327" y="440" width="58" height="230" />
      <rect x="1205" y="380" width="70" height="290" />
      <path d="M1095 440 l29 -58 l29 58Z M1327 440 l29 -58 l29 58Z M1205 380 l35 -70 l35 70Z" />
      <path d="M1120 520 h20 v-16 h20 v16 h20 v-16 h20 v16 h20 v-16 h20 v16 h20 v-16 h20 v16 h20 v-16 h20 v16 h20 v-16 h20 v16 h20 v-16 h20 v16" />
      <rect x="1222" y="600" width="36" height="70" rx="18" class="landscape__gate" />
      <path d="M1240 310 v-60 l46 16 -46 16" class="landscape__flag" />
    </g>

    <!-- Trajectoire -->
    <path class="landscape__arc" d="M300 600 Q760 80 1215 470" />
    <circle cx="1215" cy="470" r="14" class="landscape__stone" />

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
  </svg>
</template>
