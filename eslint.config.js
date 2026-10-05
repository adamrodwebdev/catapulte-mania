/**
 * Configuration ESLint (format « flat config »).
 * Les fichiers .vue sont vérifiés par le compilateur de Vite au build.
 */
import js from '@eslint/js'

const browserGlobals = Object.fromEntries(
  [
    'window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'location', 'history',
    'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'crypto', 'TextEncoder',
    'TextDecoder', 'console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
    'matchMedia', 'getComputedStyle', 'Image', 'HTMLElement', 'HTMLCanvasElement',
    'CanvasRenderingContext2D', 'AudioContext', 'URL', 'URLSearchParams', 'structuredClone',
    'CustomEvent', 'Event', 'EventTarget', 'ResizeObserver', 'KeyboardEvent', 'PointerEvent',
    'DOMException', 'queueMicrotask', 'btoa', 'atob', 'Path2D', 'createImageBitmap', 'OffscreenCanvas',
  ].map((name) => [name, 'readonly']),
)

export default [
  { ignores: ['dist/**', 'dist-demo/**', 'dist-crazygames/**', 'dist-poki/**', 'node_modules/**', 'coverage/**', '.scratch/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...browserGlobals, __DEMO__: 'readonly', __APP_VERSION__: 'readonly', __TARGET__: 'readonly', process: 'readonly' },
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
    languageOptions: { globals: { Netlify: 'readonly', Response: 'readonly', Request: 'readonly' } },
  },
]
