// ─────────────────────────────────────────────────────────────────────────────
//  lib/muiTheme.js
//  Builds an MUI theme that matches the app's existing dark/light design tokens
//  (see styles/theme.css), so migrated MUI components look consistent with the
//  not-yet-migrated ones during the staged migration.
// ─────────────────────────────────────────────────────────────────────────────
import { createTheme } from '@mui/material/styles'

// Mirrors styles/theme.css (Neutral / minimal mono palette). Keep in sync.
const TOKENS = {
  dark: {
    bg: '#0e1116',
    surface: '#171a21',
    surface2: '#1e222b',
    border: '#2a2f3a',
    text: '#e6e8ec',
    text2: '#b8bdc7',
    muted: '#6b7280',
    accent: '#3b82f6',
    accent2: '#64748b',
    onAccent: '#ffffff',
    pass: '#22c55e',
    warn: '#f59e0b',
    fail: '#ef4444',
  },
  light: {
    bg: '#f7f8fa',
    surface: '#ffffff',
    surface2: '#f1f3f6',
    border: '#e2e5eb',
    text: '#14161d',
    text2: '#3a3f4c',
    muted: '#828896',
    accent: '#2563eb',
    accent2: '#64748b',
    onAccent: '#ffffff',
    pass: '#16a34a',
    warn: '#d97706',
    fail: '#dc2626',
  },
}

export function buildMuiTheme(mode = 'dark', ui = {}) {
  const t = TOKENS[mode] || TOKENS.dark
  const accent = ui.accent || t.accent
  const accent2 = ui.accent2 || t.accent2
  const radius = Number.isFinite(ui.radius) ? ui.radius : 8
  return createTheme({
    palette: {
      mode,
      primary: { main: accent, contrastText: t.onAccent },
      secondary: { main: accent2 },
      success: { main: t.pass },
      warning: { main: t.warn },
      error: { main: t.fail },
      info: { main: t.accent },
      background: { default: t.bg, paper: t.surface },
      text: { primary: t.text, secondary: t.text2, disabled: t.muted },
      divider: t.border,
    },
    shape: { borderRadius: radius },
    typography: {
      fontFamily: "'Inter', system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      fontSize: 13,
      h6: { fontWeight: 700, letterSpacing: '-0.3px' },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { borderRadius: 8 } },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            background: t.surface,
            color: t.text,
            boxShadow: 'none',
            borderBottom: `1px solid ${t.border}`,
          },
        },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    },
  })
}
