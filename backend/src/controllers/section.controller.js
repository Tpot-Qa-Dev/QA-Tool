// ─────────────────────────────────────────────────────────────────────────────
//  controllers/section.controller.js
//  POST /api/section-report — section-by-section live-web audit. Deterministic
//  (Playwright only, no Claude): splits the page into sections, screenshots and
//  measures each. The Figma side is filled in later when a token is available.
// ─────────────────────────────────────────────────────────────────────────────
import { auditWebSections } from '../tools/playwright.tools.js'

function isHttpUrl(value) {
  try {
    const u = new URL(String(value))
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export async function postSectionReport(req, res) {
  const { url } = req.body || {}
  if (!url || !isHttpUrl(url)) {
    return res.status(400).json({ error: 'A valid http(s) url is required' })
  }
  try {
    const result = await auditWebSections(url)
    result.generatedAt = new Date().toISOString()
    res.json(result)
  } catch (err) {
    console.error('[section] error:', err)
    res.status(500).json({ error: err.message })
  }
}
