// ─────────────────────────────────────────────────────────────────────────────
//  lib/muiTheme.js
//  Builds an MUI theme that matches the app's existing dark/light design tokens
//  (see styles/theme.css), so migrated MUI components look consistent with the
//  not-yet-migrated ones during the staged migration.
// ─────────────────────────────────────────────────────────────────────────────
import { createTheme } from '@mui/material/styles'

const TOKENS = {
  dark: {
    bg: '#0A0B0F', surface: '#13151C', surface2: '#1A1D28', border: '#252836',
    text: '#E8ECF4', text2: '#C4C9D4', muted: '#6B7280',
    accent: '#00E5FF', accent2: '#A78BFA', onAccent: '#0A0B0F',
    pass: '#00FF94', warn: '#FF9F43', fail: '#FF4560',
  },
  light: {
    bg: '#EEF0F5', surface: '#FFFFFF', surface2: '#F6F7FA', border: '#E3E5EC',
    text: '#14161D', text2: '#3A3F4C', muted: '#828896',
    accent: '#0891B2', accent2: '#7C3AED', onAccent: '#FFFFFF',
    pass: '#059669', warn: '#D97706', fail: '#DC2626',
  },
}

export function buildMuiTheme(mode = 'dark', ui = {}) {
  const t = TOKENS[mode] || TOKENS.dark
  const accent  = ui.accent  || t.accent
  const accent2 = ui.accent2 || t.accent2
  const radius  = Number.isFinite(ui.radius) ? ui.radius : 14
  return createTheme({
    palette: {
      mode,
      primary:    { main: accent, contrastText: t.onAccent },
      secondary:  { main: accent2 },
      success:    { main: t.pass },
      warning:    { main: t.warn },
      error:      { main: t.fail },
      info:       { main: t.accent },
      background: { default: t.bg, paper: t.surface },
      text:       { primary: t.text, secondary: t.text2, disabled: t.muted },
      divider:    t.border,
    },
    shape: { borderRadius: radius },
    typography: {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      fontSize: 13,
      h6: { fontWeight: 700, letterSpacing: '-0.3px' },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiButton:  { defaultProps: { disableElevation: true }, styleOverrides: { root: { borderRadius: 20 } } },
      MuiAppBar:  { styleOverrides: { root: { background: t.surface, color: t.text, boxShadow: 'none', borderBottom: `1px solid ${t.border}` } } },
      MuiChip:    { styleOverrides: { root: { fontFamily: "'JetBrains Mono', monospace" } } },
      MuiPaper:   { styleOverrides: { root: { backgroundImage: 'none' } } },
    },
  })
}
