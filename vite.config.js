/**
 * Configuration Vite.
 *
 * - `npm run build`             → version complète pour notre site, sans publicité (dist/)
 * - `npm run build:demo`        → démo autonome en UN SEUL fichier HTML (dist-demo/index.html)
 * - `npm run build:crazygames`  → version CrazyGames, avec son SDK (dist-crazygames/)
 * - `npm run build:poki`        → version Poki, avec son SDK (dist-poki/)
 * - `npm run build:gamedistribution`, `build:gamepix`, `build:y8` → portails avec SDK
 * - `npm run build:playgama`    → version Playgama, avec son Bridge (dist-playgama/, v6.4)
 * - `npm run build:standalone`  → portails sans SDK (itch.io, Newgrounds)
 * - `npm run release:portals`   → les cinq paquets prêts à envoyer (release/)
 *
 * Sécurité : une Content-Security-Policy stricte est injectée uniquement au build
 * (le serveur de dev de Vite a besoin de styles injectés à la volée).
 */
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCsp } from './build/csp.js'
import { buildServiceWorker, PUBLIC_PRECACHE } from './build/sw.js'
import { privateAssetsPlugin } from './scripts/private-assets.mjs'

/** Racine du dépôt : les composants privés y sont copiés avant le serveur et chaque génération. */
const ROOT = fileURLToPath(new URL('.', import.meta.url))

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const LANGS = ['fr', 'en', 'id']
const PORTALS = ['crazygames', 'poki', 'gamedistribution', 'gamepix', 'y8', 'playgama', 'standalone']

/**
 * Réglages du Bridge Playgama (v6.4), livrés à côté d'index.html dans le seul
 * build Playgama : interstitiel entre deux niveaux, vidéo récompensée à la
 * demande, les deux orientations (le jeu s'adapte au portrait).
 */
const PLAYGAMA_BRIDGE_CONFIG = {
  advertisement: {
    minimumDelayBetweenInterstitial: 60,
    interstitial: { placementFallback: 'level_end', placements: [{ id: 'level_end' }] },
    rewarded: { placementFallback: 'bonus', placements: [{ id: 'bonus' }] },
  },
  device: { useBuiltInOrientationPopup: false, supportedOrientations: ['landscape', 'portrait'] },
}

/** Injecte la CSP dans index.html au moment du build. */
function cspPlugin(target) {
  return {
    name: 'ctc-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${buildCsp({ target })}">`)
    },
  }
}

/**
 * Remplace %VITE_SITE_URL% dans index.html (balise canonique, Open Graph, hreflang).
 * Utilise la valeur par défaut si la variable n'est pas définie (ex. fichier .env
 * absent lors d'un déploiement), pour ne jamais publier le texte brut.
 */
function siteUrlPlugin(siteUrl) {
  const base = siteUrl.replace(/\/+$/, '')
  return {
    name: 'ctc-site-url',
    transformIndexHtml: { order: 'pre', handler: (html) => html.replaceAll('%VITE_SITE_URL%', base) },
  }
}

/** Génère robots.txt et sitemap.xml (avec alternatives hreflang) à partir de VITE_SITE_URL. */
function seoFilesPlugin(siteUrl) {
  return {
    name: 'ctc-seo-files',
    apply: 'build',
    generateBundle() {
      const base = siteUrl.replace(/\/+$/, '')
      const alternates = LANGS.map(
        (l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${base}/?lang=${l}"/>`,
      ).join('\n')
      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>${base}/</loc>
${alternates}
    <xhtml:link rel="alternate" hreflang="x-default" href="${base}/"/>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap })
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\n\nSitemap: ${base}/sitemap.xml\n` })
    },
  }
}

/**
 * Mode démo : regroupe JS + CSS dans index.html pour obtenir un fichier unique,
 * jouable hors-ligne et partageable. Les scripts/styles en ligne sont autorisés
 * par empreinte SHA-256 dans la CSP (pas de 'unsafe-inline').
 */
function singleFilePlugin() {
  const sha = (s) => `'sha256-${createHash('sha256').update(s).digest('base64')}'`
  return {
    name: 'ctc-single-file',
    apply: 'build',
    enforce: 'post',
    // order 'post' : après le plugin interne de Vite qui remplit ses marqueurs de
    // préchargement (sinon « __VITE_PRELOAD__ » reste dans le code et le jeu
    // reste bloqué sur « Chargement… »).
    generateBundle: { order: 'post', handler(_opts, bundle) {
      const htmlFile = Object.values(bundle).find((f) => f.fileName.endsWith('.html'))
      if (!htmlFile) return
      let html = String(htmlFile.source)
      const scriptHashes = []
      const styleHashes = []
      for (const [name, file] of Object.entries(bundle)) {
        if (file.type === 'chunk' && name.endsWith('.js')) {
          // Fichier unique : rien à précharger (même valeur que Vite avec modulePreload: false).
          const code = file.code.replaceAll('__VITE_PRELOAD__', 'void 0').replace(/<\/script/gi, '<\\/script')
          if (/__VITE_[A-Z_]+__/.test(code)) this.error(`marqueur Vite non remplacé dans ${name}`)
          const re = new RegExp(`<script[^>]*src="[^"]*${escapeRe(name)}"[^>]*></script>`)
          if (re.test(html)) {
            html = html.replace(re, () => `<script type="module">${code}</script>`)
            scriptHashes.push(sha(code))
            delete bundle[name]
          }
        } else if (file.type === 'asset' && name.endsWith('.css')) {
          const css = String(file.source)
          const re = new RegExp(`<link[^>]*href="[^"]*${escapeRe(name)}"[^>]*>`)
          if (re.test(html)) {
            html = html.replace(re, () => `<style>${css}</style>`)
            styleHashes.push(sha(css))
            delete bundle[name]
          }
        }
      }
      html = html.replace(
        /<meta http-equiv="Content-Security-Policy" content="[^"]*">/,
        `<meta http-equiv="Content-Security-Policy" content="${buildCsp({
          scriptSrc: ["'self'", ...scriptHashes],
          styleSrc: ["'self'", ...styleHashes],
        })}">`,
      )
      // Le manifest et les fichiers SEO n'ont pas de sens pour un fichier isolé.
      html = html.replace(/<link rel="manifest"[^>]*>\n?/, '').replace(/ *<link rel="apple-touch-icon"[^>]*>\n?/, '')
      // La démo n'est pas indexée : la page de référence reste le jeu complet (lien canonique).
      html = html.replace(/<meta name="robots"[^>]*>/, '<meta name="robots" content="noindex, follow">')
      htmlFile.source = html
    } },
  }
}

/** Service worker (version complète uniquement) : jeu jouable hors-ligne. */
function serviceWorkerPlugin() {
  return {
    name: 'ctc-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_opts, bundle) {
      // Les peintures allégées (v6.4) ne sont pas pré-chargées : seuls les petits écrans s'en servent,
      // et le service worker les garde à leur première utilisation.
      const files = Object.keys(bundle).filter((f) => f !== 'index.html' && f !== 'sitemap.xml' && f !== 'robots.txt' && !/chapter-\d+-lite-[\w-]+\.webp$/.test(f))
      const version = createHash('sha256').update(files.sort().join('|')).digest('hex').slice(0, 12)
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: buildServiceWorker([...files, ...PUBLIC_PRECACHE], version) })
    },
  }
}

/**
 * Fonds peints d'un portail (v6.4, Playgama) : le script unique (format iife) n'a pas
 * d'import.meta ; les peintures, et leurs versions allégées, sont copiées dans
 * `backgrounds/` à côté d'index.html et chargées chapitre par chapitre (voir
 * src/game/assets/backgrounds.js).
 */
function portalPaintingsPlugin() {
  return {
    name: 'ctc-portal-paintings',
    apply: 'build',
    generateBundle() {
      const dir = fileURLToPath(new URL('./src/game/assets/backgrounds/', import.meta.url))
      for (const file of readdirSync(dir).filter((f) => /^chapter-\d+(-lite)?\.webp$/.test(f))) {
        this.emitFile({ type: 'asset', fileName: `backgrounds/${file}`, source: readFileSync(join(dir, file)) })
      }
    },
  }
}

/**
 * Portails : le jeu tourne dans un cadre isolé (iframe « sandbox », origine
 * « null »). Le navigateur y refuse les modules JavaScript et les polices
 * venant du serveur sans en-têtes CORS : on livre donc un script classique
 * unique (sans découpage) et des polices intégrées au CSS.
 */
function portalScriptPlugin(target) {
  return {
    name: 'ctc-portal-script',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html) {
      // GamePix : son SDK doit être le premier script de <head>.
      if (target === 'gamepix') html = html.replace('<head>', '<head>\n    <script src="https://integration.gamepix.com/sdk/v3/gamepix.sdk.js"></script>')
      if (target === 'playgama') {
        // Playgama (v6.4) : le Bridge, seul script venu d'ailleurs, chargé avant le jeu.
        html = html.replace('<head>', '<head>\n    <script src="https://bridge.playgama.com/v2/stable/playgama-bridge.js"></script>')
        // Aucune adresse extérieure dans la page : ni référencement, ni aperçus de partage.
        html = html
          .replace(/^\s*<link rel="(canonical|alternate)"[^>]*>\n?/gm, '')
          .replace(/^\s*<meta (property|name)="(og|twitter):[^"]*"[^>]*>\n?/gm, '')
          .replace(/^\s*<script type="application\/ld\+json">[\s\S]*?<\/script>\n?/gm, '')
          .replace(/^\s*<meta name="(description|keywords|author|robots)"[^>]*>\n?/gm, '')
          .replace(/^\s*<!-- Open Graph[^>]*-->\n?/gm, '')
          // Le titre du jeu, tel qu'il apparaît en jeu et sur la fiche ; l'anglais, langue par défaut de Playgama.
          .replace(/<title>[^<]*<\/title>/, '<title>Catapulte Mania</title>')
          .replace('<html lang="fr"', '<html lang="en"')
          // Écran de chargement sans texte (le même dans toutes les langues), le temps que le Bridge s'initialise.
          .replace(/<p class="boot__text">[^<]*<\/p>\s*<p class="boot__loading"[^>]*>[^<]*<\/p>/, '<div class="boot__bar" role="progressbar" aria-label="Catapulte Mania"></div>')
      }
      // Les portails référencent le jeu eux-mêmes : pas de manifeste d'application.
      html = html.replace(/<link rel="manifest"[^>]*>\n?/, '')
      return html
        .replace(/<script type="module" crossorigin src=/g, '<script defer src=')
        .replace(/<link rel="stylesheet" crossorigin href=/g, '<link rel="stylesheet" href=')
        .replace(/<link rel="modulepreload"[^>]*>\n?/g, '')
    },
    generateBundle() {
      // Playgama : les réglages du Bridge, à côté d'index.html (ce build seulement).
      if (target === 'playgama') this.emitFile({ type: 'asset', fileName: 'playgama-bridge-config.json', source: `${JSON.stringify(PLAYGAMA_BRIDGE_CONFIG, null, 2)}\n` })
    },
  }
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const isDemo = mode === 'demo'
  /** Plateforme visée : notre site ('web'), ou un portail (mode du même nom). */
  const target = PORTALS.includes(mode) ? mode : 'web'
  const siteUrl = env.VITE_SITE_URL || 'https://catapulte-mania.netlify.app'
  /**
   * Fonds peints et ciels vivants (v6.4) : sur notre site et sur Playgama (photographies
   * FLUX.1 [schnell], licence Apache 2.0, voir docs/PEINTURES.md) ; CTC_PAINTED=off les
   * retire. La démo et les autres portails gardent le décor dessiné, plus léger.
   */
  const painted = !isDemo && (target === 'web' || target === 'playgama') && process.env.CTC_PAINTED !== 'off'
  /** Portails : un seul script (format iife), tout intégré ; les peintures sont copiées à part (v6.4). */
  const iife = !isDemo && target !== 'web'

  return {
    base: './',
    plugins: [
      privateAssetsPlugin(ROOT),
      vue(),
      siteUrlPlugin(siteUrl),
      cspPlugin(target),
      // Portails : ni service worker ni fichiers SEO (ils servent et référencent le jeu eux-mêmes).
      ...(isDemo ? [singleFilePlugin()] : target === 'web' ? [seoFilesPlugin(siteUrl), serviceWorkerPlugin()] : [portalScriptPlugin(target)]),
      ...(iife && painted ? [portalPaintingsPlugin()] : []),
    ],
    define: {
      __DEMO__: JSON.stringify(isDemo),
      __TARGET__: JSON.stringify(target),
      __PAINTED__: JSON.stringify(painted),
      __IIFE__: JSON.stringify(iife),
      __APP_VERSION__: JSON.stringify(pkg.version),
      // CTC_ADS=off : build sans publicité (période de test d'un portail).
      __ADS__: JSON.stringify(process.env.CTC_ADS !== 'off'),
      // Identifiants du portail (tableau de bord GameDistribution / Y8), si fournis.
      __PORTAL_GAME_ID__: JSON.stringify(/^[\w-]{0,64}$/.test(process.env.CTC_GAME_ID || '') ? process.env.CTC_GAME_ID || '' : ''),
      __PORTAL_APP_ID__: JSON.stringify(/^[\w-]{0,64}$/.test(process.env.CTC_APP_ID || '') ? process.env.CTC_APP_ID || '' : ''),
    },
    build: {
      outDir: isDemo ? 'dist-demo' : target === 'web' ? 'dist' : `dist-${target}`,
      target: 'es2020',
      sourcemap: false,
      // Démo : CSS dans le fichier unique. Portails (format iife) : un seul fichier
      // CSS lié dans index.html ; sinon Vite l'injecterait depuis le JavaScript
      // et le premier affichage attendrait l'exécution du script.
      cssCodeSplit: !isDemo && target === 'web',
      assetsInlineLimit: isDemo || target !== 'web' ? Number.MAX_SAFE_INTEGER : 4096,
      modulePreload: target === 'web' && !isDemo ? undefined : false,
      // Portal builds: one classic script. With format 'iife', Vite 8 (Rolldown) turns code splitting
      // off by itself, so inlineDynamicImports would only add a warning (checked on Vite 8.3.8).
      rollupOptions: isDemo ? { output: { codeSplitting: false } } : target !== 'web' ? { output: { format: 'iife' } } : {},
    },
    server: { host: true },
  }
})
