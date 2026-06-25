// ─────────────────────────────────────────────────────────────────────────────
//  services/history.service.js
//  Postgres-backed persistence of audit reports (table `reports`). The full
//  report JSON lives in the `data` JSONB column; a few fields are mirrored into
//  columns so listing can filter/sort/search without parsing every blob.
//
//  Owner scoping: pass `ownerId` to restrict to one user's reports. Omit it
//  (undefined) for an admin view that sees everything, including legacy reports
//  with no owner. The exported function names are unchanged from the old
//  file-based store so controllers only need to thread ownership through.
// ─────────────────────────────────────────────────────────────────────────────
import pool from '../config/database.js'

// Reject anything that isn't a safe report-id (alnum + dash/underscore).
const SAFE_ID = /^[A-Za-z0-9_-]+$/
function assertSafeId(id) {
  if (!id || !SAFE_ID.test(id)) throw new Error('Invalid report id')
}

// Reduce a full report to the fields shown in the history list.
function toMetadata(report, id) {
  const m = report?.modules || {}
  const counts = Object.values(m).reduce(
    (acc, v) => {
      const s = v?.status
      if (s === 'pass') acc.pass++
      else if (s === 'warn') acc.warn++
      else if (s === 'fail') acc.fail++
      return acc
    },
    { pass: 0, warn: 0, fail: 0 },
  )
  return {
    id: id ?? report.id,
    url: report.url || '',
    module: report.module || '',
    score: typeof report.overallScore === 'number' ? report.overallScore : null,
    grade: report.grade || null,
    headline: report.headline || '',
    generatedAt: report.generatedAt || null,
    counts,
  }
}

// Build the "WHERE owner …" fragment. undefined → no restriction (admin).
function ownerClause(ownerId, params) {
  if (ownerId === undefined || ownerId === null) return ''
  params.push(ownerId)
  return ` AND owner_id = $${params.length}`
}

// ── Public API ──────────────────────────────────────────────────────────────

// Upsert a report. `ownerId` stamps the owner on first insert; on re-save an
// explicit owner wins but a missing one preserves the existing owner.
export async function saveReport(id, report, ownerId = null) {
  assertSafeId(id)
  const payload = { id, ...report }
  const score = typeof report.overallScore === 'number' ? Math.round(report.overallScore) : null
  await pool.query(
    `INSERT INTO reports (id, module, url, title, score, data, owner_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET
       module   = EXCLUDED.module,
       url      = EXCLUDED.url,
       title    = EXCLUDED.title,
       score    = EXCLUDED.score,
       data     = EXCLUDED.data,
       owner_id = COALESCE(EXCLUDED.owner_id, reports.owner_id)`,
    [id, report.module || null, report.url || null, report.headline || null, score, payload, ownerId],
  )
  return toMetadata(payload, id)
}

// List report metadata with optional search / module filter / paging, scoped to
// `ownerId` unless it's an admin (ownerId undefined).
export async function listReports({ q, module, limit, offset, ownerId } = {}) {
  const params = []
  let where = 'WHERE 1=1'
  where += ownerClause(ownerId, params)
  if (module) { params.push(module); where += ` AND module = $${params.length}` }
  if (q && String(q).trim()) {
    params.push(`%${String(q).trim()}%`)
    const p = `$${params.length}`
    where += ` AND (url ILIKE ${p} OR id ILIKE ${p} OR (data->>'headline') ILIKE ${p})`
  }

  const totalRes = await pool.query(`SELECT count(*)::int AS n FROM reports ${where}`, params)
  const total = totalRes.rows[0]?.n ?? 0

  const lim = Number.isFinite(+limit) && +limit > 0 ? Math.min(Math.floor(+limit), 200) : 25
  const off = Number.isFinite(+offset) && +offset > 0 ? Math.floor(+offset) : 0
  params.push(lim, off)
  const { rows } = await pool.query(
    `SELECT id, data FROM reports ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )
  const reports = rows.map((r) => toMetadata(r.data, r.id))
  return { reports, total, limit: lim, offset: off }
}

// Load a full report by id (scoped to owner unless admin). null if not found.
export async function getReport(id, { ownerId } = {}) {
  assertSafeId(id)
  const params = [id]
  let where = 'WHERE id = $1'
  where += ownerClause(ownerId, params)
  const { rows } = await pool.query(`SELECT data FROM reports ${where}`, params)
  return rows[0]?.data || null
}

// Delete a report (scoped to owner unless admin). true if a row was removed.
export async function deleteReport(id, { ownerId } = {}) {
  assertSafeId(id)
  const params = [id]
  let where = 'WHERE id = $1'
  where += ownerClause(ownerId, params)
  const { rowCount } = await pool.query(`DELETE FROM reports ${where}`, params)
  return rowCount > 0
}

// All metadata rows (newest first), scoped to owner unless admin. Used by the
// admin dashboard to compute aggregate stats.
export async function getAllMetadata({ ownerId } = {}) {
  const params = []
  let where = 'WHERE 1=1'
  where += ownerClause(ownerId, params)
  const { rows } = await pool.query(
    `SELECT id, data FROM reports ${where} ORDER BY created_at DESC`,
    params,
  )
  return rows.map((r) => toMetadata(r.data, r.id))
}

// ── Maintenance (admin) ───────────────────────────────────────────────────────

export async function getStats() {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS count, COALESCE(sum(octet_length(data::text)), 0)::bigint AS bytes FROM reports`,
  )
  return { count: rows[0]?.count ?? 0, totalBytes: Number(rows[0]?.bytes ?? 0) }
}

// The Postgres store needs no external index, so "rebuild" just reports the
// current count (kept for API compatibility with the old file-based store).
export async function rebuildIndexNow() {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM reports')
  return { count: rows[0]?.n ?? 0 }
}

export async function clearAll() {
  const { rowCount } = await pool.query('DELETE FROM reports')
  return { removed: rowCount }
}

export async function purgeOlderThan(days) {
  const n = Number(days)
  if (!Number.isFinite(n) || n < 0) throw new Error('days must be a non-negative number')
  const { rowCount } = await pool.query(
    `DELETE FROM reports WHERE created_at < now() - ($1 || ' days')::interval`,
    [String(n)],
  )
  return { removed: rowCount }
}
