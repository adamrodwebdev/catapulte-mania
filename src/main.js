/**
 * Point d'entrée de l'application.
 * 1. Crée le contexte (services + état réactif).
 * 2. Monte le composant racine Vue dans #app.
 */
import { createApp } from 'vue'
import App from './App.vue'
import { createAppContext, provideApp } from './app/AppContext.js'
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

try {
  history.replaceState({ screen: 'home' }, '')
} catch {
  /* contexte sans historique (iframe sandbox) */
}
