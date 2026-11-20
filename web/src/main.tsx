import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTheme, readThemePreference, resolveTheme, systemPrefersDark } from './utils/theme'

// Set the theme before the first paint so a light-theme visitor doesn't see a dark flash.
applyTheme(resolveTheme(readThemePreference(), systemPrefersDark()))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
