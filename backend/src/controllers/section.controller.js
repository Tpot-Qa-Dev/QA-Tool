// ─────────────────────────────────────────────────────────────────────────────
//  controllers/section.controller.js
//  POST /api/section-report — section-by-section live-web audit. Deterministic
//  (Playwright only, no Claude): splits the page into sections, screenshots and
//  measures each. The Figma side is filled in later when a token is available.
// ─────────────────────────────────────────────────────────────────────────────
import { auditWebSections } from '../tools/playwright.tools.js'

function isAuditableUrl(value) {
  try {
    const u = new URL(String(value))
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'file:'
  } catch {
    return false
  }
}

export async function postSectionReport(req, res) {
  const { url } = req.body || {}
  if (!url || !isAuditableUrl(url)) {
    return res.status(400).json({ error: 'A valid http(s) or file:// url is required' })
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

// Lightweight section LIST for the picker — names/tags only, no screenshots,
// so it returns fast. The wizard uses this to let the user choose which page
// sections to test.
export async function postSectionList(req, res) {
  const { url } = req.body || {}
  if (!url || !isAuditableUrl(url)) {
    return res.status(400).json({ error: 'A valid http(s) or file:// url is required' })
  }
  try {
    const result = await auditWebSections(url, { withShots: false })
    res.json({
      url,
      sections: (result.sections || []).map(s => ({
        index: s.index, name: s.name, tag: s.tag, counts: s.counts,
      })),
    })
  } catch (err) {
    console.error('[section-list] error:', err)
    res.status(500).json({ error: err.message })
  }
}
