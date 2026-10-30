import '@dskripchenko/ui/styles/all.css'
import { createApp } from 'vue'
import App from './App.vue'

const params = new URLSearchParams(location.search)
document.documentElement.dataset.theme = params.get('theme') === 'dark' ? 'dark' : 'light'
if (params.get('lang')) document.documentElement.lang = params.get('lang')!
createApp(App).mount('#app')
