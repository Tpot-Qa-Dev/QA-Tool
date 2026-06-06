// ─────────────────────────────────────────────────────────────────────────────
//  lib/colors.js
//  Colour helpers for report views. Every value is a CSS variable reference,
//  so colours follow the active theme automatically (see styles/theme.css).
// ─────────────────────────────────────────────────────────────────────────────

export const COLORS = {
  pass:  'var(--pass)',
  warn:  'var(--warn)',
  fail:  'var(--fail)',
  info:  'var(--info)',
  muted: 'var(--text-muted)',
}

const STATUS_MAP = {
  pass: 'var(--pass)',
  good: 'var(--pass)',
  warn: 'var(--warn)',
  'needs-improvement': 'var(--warn)',
  fail: 'var(--fail)',
  poor: 'var(--fail)',
}

// Colour for a tool/module status string.
export const statusColor = (status) => STATUS_MAP[status] || 'var(--text-muted)'

// Colour for a 0-100 score.
export const scoreColor = (n) => (n >= 80 ? 'var(--pass)' : n >= 50 ? 'var(--warn)' : 'var(--fail)')

// Colour for a P0/P1/P2 issue priority.
export const priorityColor = (p) => (p === 'P0' ? 'var(--fail)' : p === 'P1' ? 'var(--warn)' : 'var(--info)')

// Colour for a finding severity.
export const severityColor = (s) => (s === 'critical' ? 'var(--fail)' : s === 'high' ? 'var(--warn)' : 'var(--info)')

// Colour for a next-step timeline.
export const timelineColor = (t) => (t === 'immediate' ? 'var(--fail)' : t === 'this-week' ? 'var(--warn)' : 'var(--pass)')

// Translucent fill / border derived from any colour — works with CSS variables.
export const soft       = (c) => `color-mix(in srgb, ${c} 14%, transparent)`
export const softBorder = (c) => `color-mix(in srgb, ${c} 38%, transparent)`
