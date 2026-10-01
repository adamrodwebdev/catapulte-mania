/**
 * Point d'entrée de l'application.
 * 1. Crée le contexte (services + état réactif).
 * 2. Monte le composant racine Vue dans #app.
 */
import { createApp } from 'vue'
import App from './App.vue'
import { createAppContext, provideApp } from './app/AppContext.js'
import { IS_DEMO } from './config/gameConfig.js'
import './styles/tokens.css'
import './styles/base.css'
import './styles/ui.css'
import './styles/screens.css'
import './styles/game.css'

const ctx = createAppContext()
const app = createApp(App)
provideApp(app, ctx)

// En production, aucune erreur interne n'est affichée à l'utilisateur ni exposée.
app.config.errorHandler = (err) => {
  console.error('[Crush the Castle]', err)
}

app.mount('#app')

/*
 * Mode hors-ligne (PWA) : uniquement pour la version complète publiée en HTTPS.
 * La démo en fichier unique n'en a pas besoin (elle fonctionne déjà hors-ligne).
 */
if (import.meta.env?.PROD !== false && !IS_DEMO && 'serviceWorker' in navigator && location.protocol === 'https:') {
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
