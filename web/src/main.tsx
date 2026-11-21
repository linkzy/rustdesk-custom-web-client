import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTheme, readThemePreference, resolveTheme, systemPrefersDark } from './utils/theme'
import { applyLocale, detectLocale, readStoredLocale } from './i18n'

// Set the theme before the first paint so a light-theme visitor doesn't see a dark flash.
applyTheme(resolveTheme(readThemePreference(), systemPrefersDark()))

// Same for the language: <html lang> should be right from the first frame, for
// screen readers and for the browser's own hyphenation/font selection.
applyLocale(readStoredLocale() ?? detectLocale())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
