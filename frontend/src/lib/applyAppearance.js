// ─────────────────────────────────────────────────────────────────────────────
//  lib/applyAppearance.js
//  Applies the admin-managed UI appearance (accent, radius, density, effects)
//  to <html> as CSS variables / attributes that the neon-3D style layer reads.
// ─────────────────────────────────────────────────────────────────────────────
export function applyAppearance(ui = {}) {
  const r = document.documentElement
  if (ui.accent)  r.style.setProperty('--accent', ui.accent)
  else            r.style.removeProperty('--accent')
  if (ui.accent2) r.style.setProperty('--accent-2', ui.accent2)
  else            r.style.removeProperty('--accent-2')
  r.style.setProperty('--radius', `${ui.radius ?? 14}px`)
  r.setAttribute('data-density', ui.density || 'comfortable')
  r.classList.toggle('fx-off', ui.effects === false)
}
