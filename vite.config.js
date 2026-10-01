/**
 * Configuration Vite.
 *
 * - `npm run build`       → version complète (dist/)
 * - `npm run build:demo`  → démo autonome en UN SEUL fichier HTML (dist-demo/index.html)
 *
 * Sécurité : une Content-Security-Policy stricte est injectée uniquement au build
 * (le serveur de dev de Vite a besoin de styles injectés à la volée).
 */
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { buildCsp } from './build/csp.js'
import { buildServiceWorker, PUBLIC_PRECACHE } from './build/sw.js'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const LANGS = ['fr', 'en', 'id']

/** Injecte la CSP dans index.html au moment du build. */
function cspPlugin() {
  return {
    name: 'ctc-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${buildCsp()}">`)
    },
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
    generateBundle(_opts, bundle) {
      const htmlFile = Object.values(bundle).find((f) => f.fileName.endsWith('.html'))
      if (!htmlFile) return
      let html = String(htmlFile.source)
      const scriptHashes = []
      const styleHashes = []
      for (const [name, file] of Object.entries(bundle)) {
        if (file.type === 'chunk' && name.endsWith('.js')) {
          const code = file.code.replace(/<\/script/gi, '<\\/script')
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
      htmlFile.source = html
    },
  }
}

/** Service worker (version complète uniquement) : jeu jouable hors-ligne. */
function serviceWorkerPlugin() {
  return {
    name: 'ctc-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle).filter((f) => f !== 'index.html' && f !== 'sitemap.xml' && f !== 'robots.txt')
      const version = createHash('sha256').update(files.sort().join('|')).digest('hex').slice(0, 12)
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: buildServiceWorker([...files, ...PUBLIC_PRECACHE], version) })
    },
  }
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const isDemo = mode === 'demo'
  const siteUrl = env.VITE_SITE_URL || 'https://catapulte-mania.netlify.app'

  return {
    base: './',
    plugins: [vue(), cspPlugin(), ...(isDemo ? [singleFilePlugin()] : [seoFilesPlugin(siteUrl), serviceWorkerPlugin()])],
    define: {
      __DEMO__: JSON.stringify(isDemo),
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    build: {
      outDir: isDemo ? 'dist-demo' : 'dist',
      target: 'es2020',
      sourcemap: false,
      cssCodeSplit: !isDemo,
      assetsInlineLimit: isDemo ? Number.MAX_SAFE_INTEGER : 4096,
      rollupOptions: isDemo ? { output: { inlineDynamicImports: true } } : {},
    },
    server: { host: true },
  }
})
