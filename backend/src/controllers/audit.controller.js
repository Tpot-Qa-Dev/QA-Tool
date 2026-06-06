// ─────────────────────────────────────────────────────────────────────────────
//  controllers/audit.controller.js
//  HTTP layer for POST /api/audit — validates the request, opens an SSE
//  stream, and delegates the actual work to the audit service.
// ─────────────────────────────────────────────────────────────────────────────
import { config } from '../config/index.js'
import { initSSE, sendSSE } from '../utils/sse.js'
import { runAudit } from '../services/audit.service.js'

// True when value is a well-formed http/https link. When `allowFile` is set
// (a declared Local link), a file:// path to a local HTML file is also valid.
function isHttpUrl(value, { allowFile = false } = {}) {
  try {
    const u = new URL(String(value))
    return u.protocol === 'http:' || u.protocol === 'https:' || (allowFile && u.protocol === 'file:')
  } catch {
    return false
  }
}

export async function postAudit(req, res) {
  const { url, figmaUrl, module = 'full', checks = [], requiredTools = [], reportId, environmentHint, figmaProject } = req.body

  const allowFile = environmentHint === 'local'
  if (!url) return res.status(400).json({ error: 'url is required' })
  if (!isHttpUrl(url, { allowFile })) {
    return res.status(400).json({ error: allowFile ? 'url must be a valid http(s) or file:// link' : 'url must be a valid http(s) link' })
  }
  if (figmaUrl && !isHttpUrl(figmaUrl)) {
    return res.status(400).json({ error: 'figmaUrl must be a valid http(s) link' })
  }

  // Figma comparison modules need two different URLs — reject identical ones.
  if (module && module.includes('figma') && figmaUrl) {
    const norm = (u) => String(u).trim().toLowerCase().replace(/\/+$/, '')
    if (norm(url) === norm(figmaUrl)) {
      return res.status(400).json({ error: 'Website URL and Figma URL must be different' })
    }
  }

  if (!config.keys.claude) {
    return res.status(500).json({ error: 'CLAUDE_API_KEY not set in .env' })
  }

  // Stream progress back to the client over Server-Sent Events.
  initSSE(res)
  const emit = (event, data) => sendSSE(res, event, data)

  try {
    await runAudit({ url, figmaUrl, module, checks, requiredTools, reportId, environmentHint, figmaProject }, emit)
  } catch (err) {
    console.error('[audit] Error:', err)
    emit('error', { message: err.message })
  } finally {
    res.end()
  }
}
