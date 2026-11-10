import { render } from 'preact'
import './styles.css'
import App from './App.tsx'
import { applyToDocument } from './i18n.ts'

applyToDocument()

render(<App />, document.getElementById('root')!)
