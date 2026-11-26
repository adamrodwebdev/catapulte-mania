/**
 * Shaders du fond WebGL2 (v6.5, voir GpuBackdrop.js) : la peinture du chapitre, ses rais
 * de lumière et ses bandes de brume, en une passe plein écran. Les profils des rais
 * (largeur, fondu) reprennent ceux du sprite `beam` du ciel vivant (sky/skySprites.js),
 * les bandes de brume la place et la vitesse de l'effet `mist` (sky/effects.js).
 */

/** Rais et bandes au plus (taille des tableaux d'uniformes). */
export const MAX_BEAMS = 12
export const MAX_MIST = 4

export const BACKDROP_VERTEX = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`

export const BACKDROP_FRAGMENT = `#version 300 es
precision mediump float;

uniform sampler2D u_paint;
uniform vec2 u_res;          // taille du canevas (px réels)
uniform float u_dpr;
uniform vec4 u_place;        // peinture : x0, y0, largeur, hauteur (px CSS)
uniform float u_time;

uniform vec2 u_sun;          // soleil (px CSS)
uniform vec3 u_tint;         // couleur des rais (0..1)
uniform float u_reach;       // longueur des rais (px CSS)
uniform float u_shaftAlpha;  // force, voile du soleil compris
uniform int u_beamCount;
uniform vec4 u_beams[${MAX_BEAMS}];  // angle, largeur (px CSS), longueur (0..1), phase
uniform vec2 u_beamMotion[${MAX_BEAMS}]; // fréquence, balancement

uniform int u_mistCount;
uniform vec4 u_mist[${MAX_MIST}];    // y centre, hauteur, force, décalage (px CSS)
uniform vec3 u_mistTint;

out vec4 outColor;

const float TAU = 6.2831853;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

// Profil d'un rai : plein au centre, nul aux bords ; s'allume près du soleil, s'éteint au loin.
float across(float x) { return x < 0.5 ? mix(1.0, 0.35, x / 0.5) : mix(0.35, 0.0, (x - 0.5) / 0.5); }
float along(float q) {
  if (q < 0.08) return mix(0.0, 0.85, q / 0.08);
  if (q < 0.4) return mix(0.85, 0.45, (q - 0.08) / 0.32);
  return mix(0.45, 0.0, (q - 0.4) / 0.6);
}

void main() {
  vec2 css = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y) / u_dpr;
  vec2 uv = (css - u_place.xy) / u_place.zw;
  vec3 color = texture(u_paint, clamp(uv, 0.0, 1.0)).rgb;

  // Rais : chacun mélangé en « écran », comme le ciel vivant en 2D.
  float light = 0.0;
  vec2 d = css - u_sun;
  for (int i = 0; i < ${MAX_BEAMS}; i++) {
    if (i >= u_beamCount) break;
    vec4 b = u_beams[i];
    vec2 m = u_beamMotion[i];
    float a = b.x + m.y * sin(u_time * 0.07 + b.w);
    vec2 dir = vec2(cos(a), sin(a));
    float l = u_reach * b.z;
    float t = dot(d, dir);
    if (t <= 0.0 || t >= l) continue;
    float q = t / l;
    float half_w = 0.5 * b.y * (0.12 + 0.88 * q);
    float x = abs(dot(d, vec2(-dir.y, dir.x))) / half_w;
    if (x >= 1.0) continue;
    float breathe = 0.5 + 0.5 * sin(u_time * m.x * TAU + b.w);
    float v = across(x) * along(q) * u_shaftAlpha * (0.2 + 0.8 * breathe * breathe);
    light = 1.0 - (1.0 - light) * (1.0 - clamp(v, 0.0, 1.0));
  }
  color = 1.0 - (1.0 - color) * (1.0 - u_tint * light);

  // Brume : des bandes de bruit qui dérivent avec le vent.
  for (int i = 0; i < ${MAX_MIST}; i++) {
    if (i >= u_mistCount) break;
    vec4 m = u_mist[i];
    float dy = (css.y - m.x) / (0.5 * m.y);
    if (abs(dy) >= 1.0) continue;
    float band = (1.0 - dy * dy);
    float n = fbm(vec2((css.x + m.w) / (m.y * 1.6), css.y / (m.y * 0.6)));
    float a = clamp(m.z * band * band * smoothstep(0.35, 0.8, n) * 2.2, 0.0, 1.0);
    color = mix(color, u_mistTint, a);
  }

  outColor = vec4(color, 1.0);
}
`
