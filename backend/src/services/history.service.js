// ─────────────────────────────────────────────────────────────────────────────
//  services/history.service.js
//  File-based persistence of audit reports under backend/reports/<id>.json.
//  The directory is created on demand; reports are kept indefinitely.
//
//  Listing is backed by a single lightweight index file (reports/_index.json)
//  that holds only the metadata rows. It is updated on every save/delete so the
//  list endpoint never has to open and parse every full report (which can be
//  50–200 KB each). The index self-heals: if it is missing or unreadable it is
//  rebuilt by scanning the directory once.
// ─────────────────────────────────────────────────────────────────────────────
import { promises as fs } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve, join } from 'path'

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const REPORTS_DIR = join(backendRoot, 'reports')
const INDEX_FILE  = join(REPORTS_DIR, '_index.json')

// Reject anything that isn't a safe report-id (alnum + dash, no path chars).
const SAFE_ID = /^[A-Za-z0-9_-]+$/
function assertSafeId(id) {
  if (!id || !SAFE_ID.test(id)) throw new Error('Invalid report id')
}

async function ensureDir() {
  await fs.mkdir(REPORTS_DIR, { recursive: true })
}

// Is `f` a stored report file (not the index, not a dotfile)?
const isReportFile = f => f.endsWith('.json') && !f.startsWith('_')

// ── Index ─────────────────────────────────────────────────────────────────────
// The index is persisted as { id: metadata } so upsert/delete are trivial.

async function writeIndex(map) {
  await fs.writeFile(INDEX_FILE, JSON.stringify(map, null, 2), 'utf8')
}

// Rebuild the index from scratch by scanning every report file. Used on first
// run after this feature shipped (no index yet) and to recover from corruption.
async function rebuildIndex() {
  await ensureDir()
  const files = (await fs.readdir(REPORTS_DIR)).filter(isReportFile)
  const map   = {}
  await Promise.all(files.map(async f => {
    try {
      const raw  = await fs.readFile(join(REPORTS_DIR, f), 'utf8')
      const meta = toMetadata(JSON.parse(raw))
      if (meta.id) map[meta.id] = meta
    } catch { /* skip unreadable / malformed file */ }
  }))
  await writeIndex(map)
  return map
}

// Read the index, rebuilding it if it is missing or unreadable.
async function readIndex() {
  await ensureDir()
  try {
    const raw    = await fs.readFile(INDEX_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed
    return rebuildIndex()
  } catch (err) {
    if (err.code === 'ENOENT') return rebuildIndex()
    // Corrupt index — rebuild rather than fail the request.
    console.warn('[history] index unreadable, rebuilding:', err.message)
    return rebuildIndex()
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

// Save a report under reports/<id>.json and upsert its row in the index.
// Returns the metadata row.
export async function saveReport(id, report) {
  assertSafeId(id)
  await ensureDir()
  const payload = { id, ...report }
  await fs.writeFile(join(REPORTS_DIR, `${id}.json`), JSON.stringify(payload, null, 2), 'utf8')

  const meta = toMetadata(payload)
  try {
    const idx = await readIndex()
    idx[id] = meta
    await writeIndex(idx)
  } catch (err) {
    // Index update is best-effort — the next list call rebuilds it anyway.
    console.warn('[history] index update failed (will self-heal):', err.message)
  }
  return meta
}

// List report metadata rows with optional search, module filter and paging.
//   q       — case-insensitive substring matched against url / headline / id
//   module  — exact module id filter
//   limit   — max rows to return (default 25; capped at 200)
//   offset  — rows to skip (for pagination)
// Returns { reports, total, limit, offset } where `total` is the filtered
// count before paging.
export async function listReports({ q, module, limit, offset } = {}) {
  const idx = await readIndex()
  let rows  = Object.values(idx)

  if (module) rows = rows.filter(r => r.module === module)

  if (q) {
    const needle = String(q).trim().toLowerCase()
    if (needle) {
      rows = rows.filter(r =>
        `${r.url || ''} ${r.headline || ''} ${r.id || ''}`.toLowerCase().includes(needle))
    }
  }

  rows.sort((a, b) => (b.generatedAt || '').localeCompare(a.generatedAt || ''))

  const total = rows.length
  const off   = Number.isFinite(+offset) && +offset > 0 ? Math.floor(+offset) : 0
  const lim   = Number.isFinite(+limit) && +limit > 0 ? Math.min(Math.floor(+limit), 200) : 25
  const page  = rows.slice(off, off + lim)

  return { reports: page, total, limit: lim, offset: off }
}

// Load a full report by id, or null if it doesn't exist.
export async function getReport(id) {
  assertSafeId(id)
  try {
    const raw = await fs.readFile(join(REPORTS_DIR, `${id}.json`), 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}

// Delete a report by id and drop it from the index.
// Returns true if removed, false if it didn't exist.
export async function deleteReport(id) {
  assertSafeId(id)
  try {
    await fs.unlink(join(REPORTS_DIR, `${id}.json`))
  } catch (err) {
    if (err.code === 'ENOENT') return false
    throw err
  }
  try {
    const idx = await readIndex()
    if (idx[id]) { delete idx[id]; await writeIndex(idx) }
  } catch (err) {
    console.warn('[history] index delete failed (will self-heal):', err.message)
  }
  return true
}

// All metadata rows (newest first) — cheap, reads only the index. Used by the
// admin dashboard to compute aggregate stats.
export async function getAllMetadata() {
  const idx = await readIndex()
  return Object.values(idx)
    .sort((a, b) => (b.generatedAt || '').localeCompare(a.generatedAt || ''))
}

// ── Maintenance ───────────────────────────────────────────────────────────────

// Count of stored reports + total bytes on disk (reports + index).
export async function getStats() {
  await ensureDir()
  const files = (await fs.readdir(REPORTS_DIR)).filter(f => f.endsWith('.json'))
  let totalBytes = 0
  let count = 0
  await Promise.all(files.map(async f => {
    try {
      const st = await fs.stat(join(REPORTS_DIR, f))
      totalBytes += st.size
      if (isReportFile(f)) count++
    } catch { /* ignore */ }
  }))
  return { count, totalBytes }
}

// Force a full index rebuild from the report files on disk. Returns the count.
export async function rebuildIndexNow() {
  const map = await rebuildIndex()
  return { count: Object.keys(map).length }
}

// Delete every stored report and reset the index. Returns how many were removed.
export async function clearAll() {
  await ensureDir()
  const files = (await fs.readdir(REPORTS_DIR)).filter(isReportFile)
  await Promise.all(files.map(f => fs.unlink(join(REPORTS_DIR, f)).catch(() => {})))
  await writeIndex({})
  return { removed: files.length }
}

// Delete reports older than `days` (by generatedAt). Returns how many removed.
export async function purgeOlderThan(days) {
  const n = Number(days)
  if (!Number.isFinite(n) || n < 0) throw new Error('days must be a non-negative number')
  const cutoff = Date.now() - n * 86_400_000
  const idx    = await readIndex()
  const stale  = Object.values(idx).filter(r => {
    const t = Date.parse(r.generatedAt || '')
    return Number.isFinite(t) && t < cutoff
  })
  for (const r of stale) {
    await fs.unlink(join(REPORTS_DIR, `${r.id}.json`)).catch(() => {})
    delete idx[r.id]
  }
  await writeIndex(idx)
  return { removed: stale.length }
}

// Reduce a full report to the fields shown in the history list.
function toMetadata(report) {
  const m = report?.modules || {}
  const counts = Object.values(m).reduce((acc, v) => {
    const s = v?.status
    if (s === 'pass') acc.pass++
    else if (s === 'warn') acc.warn++
    else if (s === 'fail') acc.fail++
    return acc
  }, { pass: 0, warn: 0, fail: 0 })

  return {
    id:          report.id,
    url:         report.url || '',
    module:      report.module || '',
    score:       typeof report.overallScore === 'number' ? report.overallScore : null,
    grade:       report.grade || null,
    headline:    report.headline || '',
    generatedAt: report.generatedAt || null,
    counts,
  }
}
