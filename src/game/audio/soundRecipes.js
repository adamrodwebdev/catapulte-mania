/**
 * Recettes des effets sonores (v6.2, sorties du grand `switch` d'AudioService) :
 * une fonction par son, faite des briques de SynthVoices (`v`). `out` : sortie
 * du son (panoramique), `t` : instant de départ, `k` : intensité (0,2 à 1,5).
 * Les briques sont appelées dans le même ordre qu'avant (mêmes tirages au hasard).
 * @type {Readonly<Record<string, (v: import('./SynthVoices.js').SynthVoices, out: AudioNode, t: number, k: number) => void>>}
 */
export const SOUND_RECIPES = Object.freeze({
  breach(v, out, t, _k) {
    // Mur qui éclate : grave sourd, craquement, gravats qui roulent.
    v.tone(out, t, { freq: 62, to: 28, decay: 0.7, peak: 0.75 })
    v.noiseHit(out, t, { type: 'highpass', freq: 2500, decay: 0.03, peak: 0.5 })
    v.noiseHit(out, t, { type: 'lowpass', freq: 1500, sweepTo: 180, decay: 0.8, peak: 0.7 })
    v.rattle(out, t + 0.08, 9, { freq: 1100, spread: 0.12, peak: 0.22 })
  },
  frost(v, out, t, k) {
    // Givre : tintements cristallins et craquement aigu.
    for (const [i, f] of [2093, 2637, 3136, 3951].entries()) v.tone(out, t + i * 0.035, { freq: f, decay: 0.45, peak: 0.07 * k })
    v.noiseHit(out, t, { type: 'highpass', freq: 5000, decay: 0.25, peak: 0.25 })
    v.rattle(out, t + 0.02, 5, { freq: 4200, spread: 0.06, peak: 0.08 })
  },
  steam(v, out, t, k) {
    // Vapeur : sifflement qui monte, chuintement.
    v.noiseHit(out, t, { type: 'highpass', freq: 2500, sweepTo: 6000, attack: 0.04, decay: 0.9 * k, peak: 0.35 * k })
    v.tone(out, t, { type: 'sine', freq: 1800, to: 2600, attack: 0.05, decay: 0.6, peak: 0.04 })
  },
  splash(v, out, t, k) {
    // Plongeon : claquement de surface, bulle qui remonte, pluie de gouttes.
    v.noiseHit(out, t, { type: 'bandpass', freq: 1100, sweepTo: 280, q: 0.8, attack: 0.006, decay: 0.5 * k, peak: 0.5 * k })
    v.tone(out, t + 0.02, { type: 'sine', freq: 380, to: 1200, decay: 0.12, peak: 0.1 })
    v.rattle(out, t + 0.12, 7, { freq: 2600, spread: 0.1, peak: 0.06 * k })
  },
  snow(v, out, t, _k) {
    v.noiseHit(out, t, { type: 'lowpass', freq: 700, decay: 0.25, peak: 0.25 })
    v.noiseHit(out, t + 0.03, { type: 'bandpass', freq: 3000, q: 1, decay: 0.15, peak: 0.06 })
  },
  flyer(v, out, t, _k) {
    // Croassement ou cri de la vouivre (rauque, bref).
    v.tone(out, t, { type: 'sawtooth', freq: 340, to: 220, attack: 0.01, decay: 0.18, peak: 0.12 })
    v.tone(out, t + 0.16, { type: 'sawtooth', freq: 300, to: 180, attack: 0.01, decay: 0.2, peak: 0.1 })
    v.rattle(out, t + 0.05, 4, { freq: 3000, spread: 0.08, peak: 0.05 })
  },
  thunder(v, out, t, _k) {
    v.noiseHit(out, t, { type: 'highpass', freq: 1800, decay: 0.08, peak: 0.6 })
    v.noiseHit(out, t + 0.05, { type: 'lowpass', freq: 600, sweepTo: 60, attack: 0.03, decay: 1.8, peak: 0.9 })
    v.tone(out, t + 0.05, { freq: 48, to: 28, decay: 1.4, peak: 0.55 })
    v.noiseHit(out, t + 0.5, { type: 'lowpass', freq: 300, sweepTo: 80, attack: 0.2, decay: 1.4, peak: 0.4 })
  },
  zap(v, out, t, k) {
    // Orbe d'orage (v6.1) : grésillement électrique, claquement sec, bourdon qui s'éteint.
    v.tone(out, t, { type: 'square', freq: 110, to: 60, attack: 0.002, decay: 0.35, peak: 0.12 * k })
    v.noiseHit(out, t, { type: 'highpass', freq: 4200, decay: 0.05, peak: 0.45 * k })
    v.rattle(out, t + 0.01, 8, { freq: 5200, spread: 0.05, peak: 0.12 * k })
    v.noiseHit(out, t + 0.03, { type: 'bandpass', freq: 1800, sweepTo: 600, q: 3, attack: 0.005, decay: 0.3, peak: 0.25 * k })
  },
  hiss(v, out, t, k) {
    // Pot de poison (v6.1) : le grès éclate, le gaz fuse et bouillonne.
    v.noiseHit(out, t, { type: 'highpass', freq: 3500, decay: 0.05, peak: 0.35 })
    v.noiseHit(out, t + 0.02, { type: 'bandpass', freq: 2400, sweepTo: 1200, q: 1.2, attack: 0.03, decay: 0.8 * k, peak: 0.25 * k })
    for (let i = 0; i < 4; i++) v.tone(out, t + 0.1 + i * 0.07, { type: 'sine', freq: 300 + i * 90, to: 700 + i * 120, attack: 0.005, decay: 0.06, peak: 0.05 })
  },
  lock(v, out, t, _k) {
    // « C'est le moment » : deux notes claires et montantes.
    v.tone(out, t, { type: 'triangle', freq: 988, decay: 0.08, peak: 0.16 })
    v.tone(out, t + 0.07, { type: 'triangle', freq: 1480, decay: 0.16, peak: 0.16 })
  },
  bolt(v, out, t, _k) {
    // Baliste : claquement de corde tendue et sifflement du carreau.
    v.tone(out, t, { type: 'sawtooth', freq: 180, to: 70, attack: 0.002, decay: 0.12, peak: 0.25 })
    v.noiseHit(out, t, { type: 'highpass', freq: 3000, decay: 0.02, peak: 0.35 })
    v.noiseHit(out, t, { type: 'bandpass', freq: 2200, sweepTo: 900, q: 2, attack: 0.01, decay: 0.35, peak: 0.3 })
  },
  scream(v, out, t, k) {
    // L'intensité porte la voix : soldat (aigu), chevalier (grave), roi (entre les deux).
    v.scream(out, t, k >= 1.2 ? 170 : k <= 0.6 ? 230 : 300)
  },
  launch(v, out, t, _k) {
    // Le bras se détend (grincement), fend l'air, et frappe la traverse.
    v.tone(out, t, { type: 'sawtooth', freq: 85, to: 120, attack: 0.01, decay: 0.12, peak: 0.06 })
    v.noiseHit(out, t, { type: 'bandpass', freq: 300, sweepTo: 1900, q: 0.9, attack: 0.06, decay: 0.4, peak: 0.42 })
    v.tone(out, t + 0.12, { type: 'sine', freq: 120, to: 52, attack: 0.002, decay: 0.22, peak: 0.5 })
    v.noiseHit(out, t + 0.12, { type: 'bandpass', freq: 520, q: 4, attack: 0.001, decay: 0.12, peak: 0.35 })
    v.noiseHit(out, t + 0.12, { type: 'bandpass', freq: 880, q: 6, attack: 0.001, decay: 0.09, peak: 0.2 })
  },
  whoosh(v, out, t, k) {
    v.noiseHit(out, t, { type: 'bandpass', freq: 420, sweepTo: 1400, q: 1.1, attack: 0.12, decay: 0.35 * k, peak: 0.28 * k })
  },
  creak(v, out, t, _k) {
    v.tone(out, t, { type: 'sawtooth', freq: 70, to: 90, attack: 0.02, decay: 0.18, peak: 0.06 })
    v.noiseHit(out, t, { type: 'bandpass', freq: 1200, q: 9, attack: 0.03, decay: 0.15, peak: 0.04 })
  },
  roll(v, out, t, k) {
    // Roues ferrées sur la terre (v6.2) : grondement sourd, cailloux écrasés, léger choc du bois.
    v.noiseHit(out, t, { type: 'lowpass', freq: 220, attack: 0.04, decay: 0.32, peak: 0.26 * k })
    v.noiseHit(out, t + 0.02, { type: 'bandpass', freq: 900, q: 3, attack: 0.01, decay: 0.08, peak: 0.07 * k })
    v.tone(out, t, { type: 'triangle', freq: 95, to: 70, attack: 0.01, decay: 0.12, peak: 0.08 * k })
  },
  wood(v, out, t, k) {
    // Craquement sec, puis le bois « sonne » sur deux modes de résonance.
    const m = 0.85 + Math.random() * 0.4
    v.noiseHit(out, t, { type: 'highpass', freq: 2800, attack: 0.001, decay: 0.025, peak: 0.45 * k })
    v.noiseHit(out, t, { type: 'bandpass', freq: 420 * m, q: 9, attack: 0.001, decay: 0.16 * k, peak: 0.6 * k })
    v.noiseHit(out, t, { type: 'bandpass', freq: 1150 * m, q: 7, attack: 0.001, decay: 0.08, peak: 0.3 * k })
    v.tone(out, t, { type: 'triangle', freq: 210 * m, to: 120, decay: 0.12, peak: 0.2 * k })
    if (k > 0.7) v.rattle(out, t + 0.05, 3, { freq: 900, spread: 0.12, peak: 0.08 * k })
  },
  straw(v, out, t, k) {
    v.noiseHit(out, t, { type: 'highpass', freq: 2500, decay: 0.2, peak: 0.25 * k })
    v.noiseHit(out, t + 0.02, { type: 'bandpass', freq: 5200, q: 2, decay: 0.3, peak: 0.08 * k })
  },
  stone(v, out, t, k) {
    // Choc mat, poids, puis cailloux.
    v.noiseHit(out, t, { type: 'bandpass', freq: 1800, q: 1.5, attack: 0.001, decay: 0.03, peak: 0.35 * k })
    v.noiseHit(out, t, { type: 'lowpass', freq: 520, decay: 0.32 * k, peak: 0.6 * k })
    v.tone(out, t, { freq: 98, to: 46, decay: 0.32, peak: 0.5 * k })
    if (k > 0.6) v.rattle(out, t + 0.06, 4, { freq: 1600, spread: 0.15, peak: 0.1 * k })
  },
  iron(v, out, t, k) {
    // Cloche de métal : partiels inharmoniques qui battent légèrement.
    for (const [f, d] of [[523, 4], [1307, -6], [2210, 9], [3170, -3]]) v.tone(out, t, { type: 'sine', freq: f, decay: 0.8, peak: 0.11 * k, detune: d })
    v.noiseHit(out, t, { type: 'highpass', freq: 3000, decay: 0.05, peak: 0.25 })
    v.tone(out, t, { freq: 140, to: 80, decay: 0.2, peak: 0.25 * k })
  },
  glass(v, out, t, _k) {
    v.noiseHit(out, t, { type: 'highpass', freq: 4000, decay: 0.3, peak: 0.35 })
    for (const f of [2637, 3520, 4186]) v.tone(out, t + Math.random() * 0.06, { freq: f, decay: 0.3, peak: 0.08 })
    v.rattle(out, t + 0.05, 8, { freq: 5200, spread: 0.08, peak: 0.07 })
  },
  hit(v, out, t, _k) {
    // Coup sur un défenseur : choc sourd et cliquetis d'armure.
    v.tone(out, t, { type: 'sine', freq: 160, to: 70, attack: 0.002, decay: 0.14, peak: 0.3 })
    v.noiseHit(out, t, { type: 'bandpass', freq: 3400, q: 5, attack: 0.001, decay: 0.07, peak: 0.12 })
  },
  down(v, out, t, _k) {
    // Le défenseur tombe : chute sur le sol, armure qui claque, petit glas.
    v.tone(out, t, { type: 'sine', freq: 130, to: 55, attack: 0.003, decay: 0.3, peak: 0.45 })
    v.noiseHit(out, t, { type: 'lowpass', freq: 700, decay: 0.2, peak: 0.3 })
    v.rattle(out, t + 0.04, 4, { freq: 3200, spread: 0.08, peak: 0.1 })
    v.tone(out, t + 0.05, { type: 'triangle', freq: 660, to: 330, attack: 0.005, decay: 0.4, peak: 0.12 })
  },
  hammer(v, out, t, k) {
    // Marteau sur le bois : choc mat, puis le fer qui tinte un peu.
    for (let i = 0; i < 3; i++) {
      const at = t + i * 0.22
      v.noiseHit(out, at, { type: 'bandpass', freq: 700, q: 5, attack: 0.001, decay: 0.07, peak: 0.35 * k })
      v.tone(out, at, { type: 'triangle', freq: 260, to: 170, attack: 0.001, decay: 0.08, peak: 0.18 * k })
      v.tone(out, at, { freq: 2100, attack: 0.001, decay: 0.09, peak: 0.03 * k })
    }
  },
  rubble(v, out, t, k) {
    // Effondrement : grondement et longue pluie de gravats.
    v.noiseHit(out, t, { type: 'lowpass', freq: 380, sweepTo: 120, attack: 0.03, decay: 1.1 * k, peak: 0.45 * k })
    v.rattle(out, t + 0.05, 16, { freq: 1200, spread: 0.18, peak: 0.16 * k })
  },
  gust(v, out, t, k) {
    // Souffle qui monte puis retombe (bruit filtré, balayage lent).
    v.noiseHit(out, t, { type: 'bandpass', freq: 380, sweepTo: 950, q: 0.7, attack: 0.45, decay: 1.3, peak: 0.22 * k })
  },
  explosion(v, out, t, _k) {
    // Craquement, souffle grave, boule de feu qui gronde et débris qui retombent.
    v.noiseHit(out, t, { type: 'highpass', freq: 1500, attack: 0.001, decay: 0.06, peak: 0.8 })
    v.tone(out, t, { freq: 72, to: 24, attack: 0.003, decay: 1.0, peak: 0.85 })
    v.noiseHit(out, t, { type: 'lowpass', freq: 1200, sweepTo: 70, attack: 0.008, decay: 1.4, peak: 0.95 })
    v.noiseHit(out, t + 0.1, { type: 'bandpass', freq: 600, sweepTo: 200, q: 0.6, attack: 0.1, decay: 1.2, peak: 0.25 })
    v.rattle(out, t + 0.35, 10, { freq: 1300, spread: 0.2, peak: 0.12 })
  },
  fire(v, out, t, k) {
    // Embrasement : souffle qui prend, puis crépitements.
    v.noiseHit(out, t, { type: 'lowpass', freq: 500, sweepTo: 1400, attack: 0.08, decay: 0.4, peak: 0.18 * k })
    for (let i = 0; i < 7; i++) v.noiseHit(out, t + Math.random() * 0.5, { type: 'bandpass', freq: 1500 + Math.random() * 1500, q: 3, attack: 0.001, decay: 0.03, peak: 0.14 })
  },
  split(v, out, t, _k) {
    v.tone(out, t, { type: 'triangle', freq: 880, to: 1320, decay: 0.12, peak: 0.15 })
    v.noiseHit(out, t, { type: 'highpass', freq: 3500, decay: 0.05, peak: 0.15 })
  },
  power(v, out, t, _k) {
    // Magie : arpège en cloches et souffle qui monte.
    for (const [i, f] of [523, 659, 784, 1047, 1319].entries()) v.bell(out, t + i * 0.055, f, 0.06, 0.8)
    v.noiseHit(out, t, { type: 'bandpass', freq: 1200, sweepTo: 6000, q: 2, attack: 0.25, decay: 0.4, peak: 0.08 })
  },
  star(v, out, t, k) {
    // Étoile gagnée : cloche brillante (l'intensité monte d'un ton par étoile).
    v.bell(out, t, 1175 * (k > 1.1 ? 1.335 : k > 0.9 ? 1.122 : 1), 0.14, 1.1)
    v.noiseHit(out, t, { type: 'highpass', freq: 7000, decay: 0.35, peak: 0.05 })
  },
  combo(v, out, t, k) {
    // Enchaînement : plus le palier est haut, plus l'arpège monte et s'étoffe.
    const tier = k >= 1.3 ? 3 : k >= 1 ? 2 : 1
    const notes = [[784, 988, 1175], [784, 988, 1175, 1568], [784, 988, 1175, 1568, 1976]][tier - 1]
    notes.forEach((f, i) => v.bell(out, t + i * 0.045, f, 0.07, 0.6))
    v.brass(out, t, tier === 3 ? 392 : 294, 0.25, 0.06)
  },
  victory(v, out, t, _k) {
    // Fanfare : appel de trompettes, accord final tenu, timbales.
    const notes = [[392, 0, 0.14], [392, 0.15, 0.1], [523, 0.27, 0.14], [659, 0.43, 0.14], [784, 0.6, 0.9]]
    for (const [f, at, dur] of notes) v.brass(out, t + at, f, dur, 0.1)
    v.brass(out, t + 0.6, 523, 0.9, 0.07)
    v.brass(out, t + 0.6, 659, 0.9, 0.06)
    v.brass(out, t + 0.6, 262, 0.9, 0.07)
    v.timpani(out, t + 0.6, 98, 0.5)
    v.timpani(out, t, 131, 0.35)
    for (let i = 0; i < 5; i++) v.bell(out, t + 0.62 + i * 0.07, 1568 * (1 + i * 0.12), 0.025, 0.6)
  },
  defeat(v, out, t, _k) {
    // Cor grave qui descend, glas et timbale étouffée.
    for (const [i, f] of [[0, 294], [1, 277], [2, 262], [3, 196]]) v.brass(out, t + i * 0.28, f, i === 3 ? 1.1 : 0.24, 0.09)
    v.brass(out, t + 0.84, 233, 1.1, 0.05)
    v.timpani(out, t + 0.84, 73, 0.45)
    v.bell(out, t + 0.84, 220, 0.05, 1.6)
  },
  click(v, out, t, _k) {
    // Clic d'interface : petit choc boisé, doux.
    v.noiseHit(out, t, { type: 'bandpass', freq: 1800, q: 6, attack: 0.001, decay: 0.03, peak: 0.12 })
    v.tone(out, t, { type: 'triangle', freq: 880, decay: 0.03, peak: 0.04 })
  },
  swing(v, out, t, _k) {
    // Trébuchet : le contrepoids chute (souffle grave) et la corde grince.
    v.noiseHit(out, t, { type: 'lowpass', freq: 260, sweepTo: 700, q: 0.9, attack: 0.25, decay: 0.9, peak: 0.35 })
    v.tone(out, t + 0.05, { type: 'sawtooth', freq: 55, to: 85, attack: 0.08, decay: 0.5, peak: 0.07 })
    v.noiseHit(out, t + 0.1, { type: 'bandpass', freq: 900, q: 10, attack: 0.05, decay: 0.3, peak: 0.05 })
  },
  tick(v, out, t, k) {
    // Repère sonore du balancier : plus aigu à mesure que le tir se relève
    // (l'intensité porte l'angle du tir, voir GameSession). Aide les malvoyants.
    v.tone(out, t, { type: 'triangle', freq: 220 + k * 520, decay: 0.06, peak: 0.12 })
  },
  horn(v, out, t, k) {
    // Cor de guerre : appel grave qui monte d'une quinte et se tient, souffle dans le pavillon.
    // Bref (un seul appel) quand un général donne un ordre, entier quand une étape tombe.
    if (k < 0.8) {
      v.brass(out, t, 110, 0.34, 0.11 * k)
      v.brass(out, t, 55, 0.34, 0.05 * k)
      v.noiseHit(out, t, { type: 'bandpass', freq: 420, q: 1.4, attack: 0.05, decay: 0.4, peak: 0.04 * k })
      return
    }
    v.brass(out, t, 98, 0.32, 0.09 * k)
    v.brass(out, t + 0.3, 147, 1.1, 0.1 * k)
    v.brass(out, t + 0.3, 73.5, 1.1, 0.05 * k)
    v.noiseHit(out, t, { type: 'bandpass', freq: 420, q: 1.4, attack: 0.08, decay: 1.3, peak: 0.04 * k })
  },
  bonus(v, out, t, k) {
    // Tir restant changé en points : pièce qui tinte, un peu plus haut à chaque fois.
    v.bell(out, t, 988 * Math.pow(2, (k - 0.5) * 0.9), 0.08, 0.55)
    v.tone(out, t, { type: 'triangle', freq: 1976 * Math.pow(2, (k - 0.5) * 0.9), decay: 0.06, peak: 0.04 })
  },
  drumroll(v, out, t, k) {
    // Roulement de caisse claire qui enfle (environ 1,2 s), avant le coup de grâce.
    const n = 26
    for (let i = 0; i < n; i++) {
      const at = t + i * 0.046
      const swell = 0.25 + (i / n) * 0.75
      v.noiseHit(out, at, { type: 'bandpass', freq: 2300, q: 1.1, attack: 0.001, decay: 0.05, peak: 0.13 * swell * k })
      v.tone(out, at, { type: 'triangle', freq: 190, decay: 0.04, peak: 0.05 * swell * k })
    }
    v.timpani(out, t + n * 0.046, 98, 0.35 * k)
  },
})
