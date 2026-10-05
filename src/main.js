/**
 * Point d'entrée de l'application.
 * 1. Crée le contexte (services + état réactif), après avoir téléchargé la langue du joueur.
 * 2. Monte le composant racine Vue dans #app.
 */
import { createApp } from 'vue'
import App from './App.vue'
import { createAppContext, provideApp } from './app/AppContext.js'
import { createAdService } from './services/ads/createAdService.js'
import { IS_DEMO, IS_PORTAL } from './config/gameConfig.js'
import './styles/tokens.css'
import './styles/base.css'
import './styles/ui.css'
import './styles/screens.css'
import './styles/game.css'
import './styles/modes.css'
import './styles/studio.css'

// Portails : le SDK s'initialise d'abord (sauvegarde synchronisée). Notre site : rien à charger.
createAdService()
  .then((ads) =>
    createAppContext({ ads }).catch((err) => {
      // Dernier recours : sans les services du portail plutôt qu'un écran vide.
      console.error('[Catapulte Mania] démarrage avec le portail impossible', err)
      return createAppContext()
    }),
  )
  .then((ctx) => {
    const app = createApp(App)
    provideApp(app, ctx)
    // En production, aucune erreur interne n'est affichée à l'utilisateur ni exposée.
    app.config.errorHandler = (err) => {
      console.error('[Catapulte Mania]', err)
    }
    app.mount('#app')
    ctx.services.ads.loadingFinished()
  })

/*
 * Mode hors-ligne (PWA) : uniquement pour la version complète publiée en HTTPS.
 * La démo en fichier unique n'en a pas besoin (elle fonctionne déjà hors-ligne),
 * et les portails servent le jeu eux-mêmes.
 */
if (import.meta.env?.PROD !== false && !IS_DEMO && !IS_PORTAL && 'serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
      /* hors-ligne indisponible : le jeu fonctionne normalement */
    })
  })
}

try {
  history.replaceState({ screen: 'home' }, '')
} catch {
  /* contexte sans historique (iframe sandbox) */
}
