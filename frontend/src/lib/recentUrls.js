// ─────────────────────────────────────────────────────────────────────────────
//  lib/recentUrls.js
//  Remembers recently-used URLs in localStorage so the user can pick one instead
//  of pasting it again. Two independent lists: 'web' (website URLs) and 'figma'
//  (Figma design URLs). Newest first, de-duplicated, capped.
// ─────────────────────────────────────────────────────────────────────────────
const KEYS = { web: 'qa.recentUrls', figma: 'qa.recentFigmaUrls' }
const MAX  = 10

const keyFor = (kind) => KEYS[kind] || KEYS.web

export function getRecentUrls(kind = 'web') {
  try {
    const arr = JSON.parse(localStorage.getItem(keyFor(kind)) || '[]')
    return Array.isArray(arr) ? arr.filter(u => typeof u === 'string') : []
  } catch {
    return []
  }
}

// Add a URL to the front of its list (moving an existing one up). Returns the
// new list so callers can update state without a second read.
export function addRecentUrl(url, kind = 'web') {
  const clean = (url || '').trim()
  if (!clean) return getRecentUrls(kind)
  const next = [clean, ...getRecentUrls(kind).filter(u => u !== clean)].slice(0, MAX)
  try { localStorage.setItem(keyFor(kind), JSON.stringify(next)) } catch { /* ignore quota */ }
  return next
}

export function clearRecentUrls(kind = 'web') {
  try { localStorage.removeItem(keyFor(kind)) } catch { /* ignore */ }
  return []
}
