import { createApp } from 'vue'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/800.css'
import '@fontsource/barlow-condensed/700-italic.css'
import '@fontsource/barlow-condensed/800-italic.css'
import '@fontsource/barlow-condensed/900-italic.css'
import './styles/main.css'
import App from './App.vue'
import { router } from './router.js'
import { initPwa } from './lib/pwa.js'

initPwa()
createApp(App).use(router).mount('#app')
