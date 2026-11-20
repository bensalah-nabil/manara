import { render } from 'preact'
import './styles.css'
import App from './App.tsx'
import { applyToDocument } from './i18n.ts'

applyToDocument()

render(<App />, document.getElementById('root')!)

// Makes the console installable as an app (public/sw.js). It caches no console data. Only in a
// production build: in development it would get in the way of reloading.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
}
