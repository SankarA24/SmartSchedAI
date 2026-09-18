import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { applyTheme, getInitialTheme } from './lib/theme.js'

// Apply the theme before the first render so there is no flash of the wrong palette.
applyTheme(getInitialTheme())

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
