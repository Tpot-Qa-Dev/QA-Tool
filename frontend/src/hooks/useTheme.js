// ─────────────────────────────────────────────────────────────────────────────
//  hooks/useTheme.js
//  Dark / light theme state. Persists the choice to localStorage and reflects
//  it on <html data-theme="…">, which drives all colours in styles/theme.css.
//
//  An inline script in index.html applies the saved theme before React mounts
//  to avoid a flash of the wrong theme.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'qa-tool-theme'

function getInitialTheme() {
  // Prefer the value the inline script already placed on <html>.
  const current = document.documentElement.getAttribute('data-theme')
  if (current === 'light' || current === 'dark') return current

  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'light' || saved === 'dark') return saved

  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const toggle = useCallback(() => {
    setTheme(t => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  // Set an explicit mode (used to apply the admin's default theme for fresh users).
  const setMode = useCallback((mode) => {
    if (mode === 'light' || mode === 'dark') setTheme(mode)
  }, [])

  return { theme, toggle, setMode }
}
