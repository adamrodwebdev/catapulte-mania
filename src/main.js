/**
 * Point d'entrée de l'application.
 * Monte le composant racine Vue dans #app.
 */
import { createApp } from 'vue'
import App from './App.vue'
import './styles/tokens.css'
import './styles/base.css'

createApp(App).mount('#app')
