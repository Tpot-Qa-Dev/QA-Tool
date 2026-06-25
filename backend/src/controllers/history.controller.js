// ─────────────────────────────────────────────────────────────────────────────
//  controllers/history.controller.js
//  HTTP layer for /api/history — list, fetch by id, delete.
// ─────────────────────────────────────────────────────────────────────────────
import {
  listReports,
  getReport,
  deleteReport,
  saveReport,
  getStats,
  clearAll,
  purgeOlderThan,
  rebuildIndexNow,
} from '../services/history.service.js'

// Admins see every report; a normal user is scoped to the reports they own.
// `undefined` means "no owner filter" (admin); a number scopes to that user.
function scopeFor(req) {
  return req.user?.role === 'admin' ? undefined : req.user?.id
}

export async function getHistoryList(req, res) {
  try {
    const { q, module, limit, offset } = req.query
    const result = await listReports({ q, module, limit, offset, ownerId: scopeFor(req) })
    res.json(result) // { reports, total, limit, offset }
  } catch (err) {
    console.error('[history] list error:', err)
    res.status(500).json({ error: err.message })
  }
}

export async function getHistoryItem(req, res) {
  try {
    const report = await getReport(req.params.id, { ownerId: scopeFor(req) })
    if (!report) return res.status(404).json({ error: 'Report not found' })
    res.json({ report })
  } catch (err) {
    console.error('[history] get error:', err)
    res.status(400).json({ error: err.message })
  }
}

// PUT /api/history/:id  { report } — save (upsert) a report to history from the
// UI, so the user can explicitly keep it in the tool without downloading a file.
export async function putHistoryItem(req, res) {
  try {
    const report = req.body?.report
    if (!report || typeof report !== 'object') {
      return res.status(400).json({ error: 'A report object is required' })
    }
    const meta = await saveReport(req.params.id, report, req.user?.id ?? null)
    res.json({ ok: true, meta })
  } catch (err) {
    console.error('[history] save error:', err)
    res.status(400).json({ error: err.message })
  }
}

export async function deleteHistoryItem(req, res) {
  try {
    const ok = await deleteReport(req.params.id, { ownerId: scopeFor(req) })
    if (!ok) return res.status(404).json({ error: 'Report not found' })
    res.json({ ok: true })
  } catch (err) {
    console.error('[history] delete error:', err)
    res.status(400).json({ error: err.message })
  }
}

// ── Maintenance ───────────────────────────────────────────────────────────────

export async function getHistoryStats(_req, res) {
  try {
    res.json(await getStats())
  } catch (err) {
    console.error('[history] stats error:', err)
    res.status(500).json({ error: err.message })
  }
}

// POST /api/history/maintenance { action: 'clear' | 'rebuild' | 'purge', days? }
export async function postHistoryMaintenance(req, res) {
  const { action, days } = req.body || {}
  try {
    let result
    if (action === 'clear') result = await clearAll()
    else if (action === 'rebuild') result = await rebuildIndexNow()
    else if (action === 'purge') result = await purgeOlderThan(days)
    else return res.status(400).json({ error: `Unknown action: ${action}` })
    res.json({ ok: true, ...result })
  } catch (err) {
    console.error('[history] maintenance error:', err)
    res.status(400).json({ error: err.message })
  }
}
