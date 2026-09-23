import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { applyTheme, getInitialTheme } from './lib/theme.js'
import { TooltipProvider } from './components/ui/tooltip.jsx'
import { Toaster } from './components/ui/sonner.jsx'

// Apply the theme before the first render so there is no flash of the wrong palette.
applyTheme(getInitialTheme())

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TooltipProvider>
      <App />
      <Toaster />
    </TooltipProvider>
  </StrictMode>,
)
