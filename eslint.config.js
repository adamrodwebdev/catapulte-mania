/**
 * Configuration ESLint (format « flat config »).
 * Les fichiers .vue sont vérifiés par le compilateur de Vite au build.
 *
 * Règles recommandées : lues directement dans ESLint (celles que l'équipe
 * d'ESLint marque « recommended »). Le paquet @eslint/js en version 10.0.0
 * est obsolète et en oublie plusieurs : on ne l'utilise plus.
 */
import { builtinRules } from 'eslint/use-at-your-own-risk'

const recommended = {
  rules: Object.fromEntries([...builtinRules].filter(([, rule]) => rule.meta?.docs?.recommended).map(([name]) => [name, 'error'])),
}

const browserGlobals = Object.fromEntries(
  [
    'window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'location', 'history',
    'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'crypto', 'TextEncoder',
    'TextDecoder', 'console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
    'matchMedia', 'getComputedStyle', 'Image', 'HTMLElement', 'HTMLCanvasElement',
    'CanvasRenderingContext2D', 'AudioContext', 'URL', 'URLSearchParams', 'structuredClone',
    'CustomEvent', 'Event', 'EventTarget', 'ResizeObserver', 'KeyboardEvent', 'PointerEvent',
    'DOMException', 'ImageData', 'DOMMatrix', 'queueMicrotask', 'btoa', 'atob', 'Path2D', 'createImageBitmap', 'OffscreenCanvas',
  ].map((name) => [name, 'readonly']),
)

export default [
  { ignores: ['dist/**', 'dist-demo/**', 'dist-crazygames/**', 'dist-poki/**', 'node_modules/**', 'coverage/**', '.scratch/**', 'src/game/story/portraits.data.js'] },
  recommended,
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...browserGlobals, __DEMO__: 'readonly', __APP_VERSION__: 'readonly', __TARGET__: 'readonly', __ADS__: 'readonly', process: 'readonly' },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    // Fonction edge Netlify (environnement Deno) : verrou d'accès du site.
    files: ['netlify/**/*.js'],
    languageOptions: { globals: { Netlify: 'readonly', Response: 'readonly', Request: 'readonly', console: 'readonly' } },
  },
  {
    // Tests automatiques (Node).
    files: ['tests/**/*.js', 'scripts/**/*.{js,mjs}'],
    languageOptions: { globals: { Buffer: 'readonly' } },
  },
]
