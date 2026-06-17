// ─────────────────────────────────────────────────────────────────────────────
//  lib/validation.js
//  Input validation helpers. Each validator returns null when the value is
//  valid, or an error message string when it is not.
// ─────────────────────────────────────────────────────────────────────────────

// Normalise a URL for comparison: trim, lowercase, drop trailing slashes.
export const normalizeUrl = (u) => u.trim().toLowerCase().replace(/\/+$/, '')

// Hostname of a URL, or '' if it cannot be parsed.
function hostOf(value) {
  try {
    return new URL(value.trim()).hostname
  } catch {
    return ''
  }
}

// Validate that a value is a proper http/https link. When `allowFile` is set
// (the Local link type), a file:// path to a local HTML file is also accepted.
export function validateUrl(value, { allowFile = false } = {}) {
  const v = value.trim()
  if (v === '') return null // emptiness is handled separately (required field)

  let parsed
  try {
    parsed = new URL(v)
  } catch {
    return 'Enter a valid link, e.g. https://example.com'
  }
  const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:'
  const isFile = parsed.protocol === 'file:'
  if (!isHttp && !(allowFile && isFile)) {
    return allowFile
      ? 'Link must start with http://, https:// or file://'
      : 'Link must start with http:// or https://'
  }
  // A file:// path points at a local file — no host/TLD to check.
  if (isFile) return null
  // Allow localhost / 127.x for local dev sites, otherwise require a TLD.
  const isLocal = parsed.hostname === 'localhost' || /^127\./.test(parsed.hostname)
  if (!isLocal && !parsed.hostname.includes('.')) {
    return 'Enter a complete link including the domain'
  }
  return null
}

// Validate that a value is a proper link AND points at figma.com.
export function validateFigmaUrl(value) {
  const base = validateUrl(value)
  if (base) return base

  const host = hostOf(value)
  if (host && !/(^|\.)figma\.com$/i.test(host)) {
    return 'Enter a valid Figma link (figma.com/…)'
  }
  return null
}
