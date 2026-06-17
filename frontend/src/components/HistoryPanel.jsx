// ─────────────────────────────────────────────────────────────────────────────
//  components/HistoryPanel.jsx
//  Slide-over panel listing past audit runs. Supports search, module filtering
//  and "load more" pagination — the backend serves lightweight metadata rows
//  from an index file, so listing stays cheap even with many stored audits.
//  Clicking a row loads the full report; deleting removes it server-side.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState, useCallback } from 'react'
import { listHistory, getHistoryReport, deleteHistoryReport } from '../api/client.js'
import { MODULES } from '../config/modules.js'
import { scoreColor } from '../lib/colors.js'
import { mergeReports } from '../lib/mergeReports.js'

const MODULE_BY_ID = Object.fromEntries(MODULES.map((m) => [m.id, m]))
const PAGE = 25

function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

// Just the domain of a URL (for a clean, readable row title).
function domainOf(url) {
  if (!url) return '(no url)'
  try {
    return new URL(url).hostname || url
  } catch {
    return url
  }
}

export default function HistoryPanel({ open, onClose, onOpenReport, onOpenMerged }) {
  const [q, setQ] = useState('')
  const [moduleFilter, setModuleFilter] = useState('')
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false) // initial / filter load
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null) // id currently loading/deleting
  // Merge mode: tick several reports → combine into one.
  const [mergeMode, setMergeMode] = useState(false)
  const [selected, setSelected] = useState(() => new Set()) // selected report ids
  const [merging, setMerging] = useState(false)

  const toggleSelect = (id, e) => {
    e.stopPropagation()
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Fetch the full reports for the ticked ids, merge them, hand back to App.
  // No blocking confirm() — a mixed-URL warning is shown inline in the merge bar
  // instead, so the merge never silently aborts (e.g. in webviews where
  // confirm() is suppressed).
  const doMerge = async () => {
    if (selected.size < 2) return
    setMerging(true)
    setError(null)
    try {
      const full = (await Promise.all([...selected].map((id) => getHistoryReport(id)))).filter(
        Boolean,
      )
      if (full.length < 2) throw new Error('Could not load the selected reports to merge.')
      const merged = mergeReports(full)
      if (!merged) throw new Error('Merge produced no report.')
      onOpenMerged(merged)
      setMergeMode(false)
      setSelected(new Set())
    } catch (err) {
      setError(err.message)
    } finally {
      setMerging(false)
    }
  }

  // Distinct URLs among the ticked rows (from the lightweight list metadata) —
  // used only to show a non-blocking "different sites" warning before merging.
  const selectedUrlCount = new Set(
    rows.filter((r) => selected.has(r.id)).map((r) => (r.url || '').replace(/\/+$/, '')),
  ).size

  // Fetch a page. offset 0 replaces the list; >0 appends ("load more").
  const load = useCallback(
    async (offset = 0) => {
      const append = offset > 0
      append ? setLoadingMore(true) : setLoading(true)
      setError(null)
      try {
        const res = await listHistory({ q, module: moduleFilter, limit: PAGE, offset })
        setTotal(res.total)
        setRows((prev) => (append ? [...prev, ...res.reports] : res.reports))
      } catch (err) {
        setError(err.message)
      } finally {
        append ? setLoadingMore(false) : setLoading(false)
      }
    },
    [q, moduleFilter],
  )

  // (Re)load from the top whenever the panel opens or the query/filter changes.
  // Debounced so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => load(0), 200)
    return () => clearTimeout(t)
  }, [open, q, moduleFilter, load])

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const openRow = async (id) => {
    setBusyId(id)
    try {
      const report = await getHistoryReport(id)
      onOpenReport(report)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const deleteRow = async (id, e) => {
    e.stopPropagation()
    if (!confirm(`Delete report ${id}?`)) return
    setBusyId(id)
    try {
      await deleteHistoryReport(id)
      setRows((rs) => rs.filter((r) => r.id !== id))
      setTotal((t) => Math.max(0, t - 1))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const filtering = !!q || !!moduleFilter
  const hasMore = rows.length < total

  return (
    <>
      <div className={`history-scrim ${open ? 'open' : ''}`} onClick={onClose} />
      <aside
        className={`history-panel ${open ? 'open' : ''}`}
        role="dialog"
        aria-label="Audit history"
      >
        <div className="history-head">
          <div className="section-label" style={{ margin: 0 }}>
            Audit History{total > 0 ? ` · ${total}` : ''}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="ghost-btn"
              onClick={() => {
                setMergeMode((m) => !m)
                setSelected(new Set())
              }}
              style={{
                padding: '6px 12px',
                fontSize: 12,
                ...(mergeMode ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}),
              }}
              title="Combine several audits of the same site into one report"
            >
              {mergeMode ? '✕ Cancel merge' : '⧉ Merge'}
            </button>
            <button
              className="ghost-btn"
              onClick={onClose}
              style={{ padding: '6px 12px', fontSize: 12 }}
            >
              ✕ Close
            </button>
          </div>
        </div>

        {mergeMode && (
          <div
            className="merge-bar"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              marginBottom: 12,
              background: 'var(--surface-2)',
              border: '1px solid var(--accent)',
              borderRadius: 8,
            }}
          >
            <span style={{ fontSize: 12, color: 'var(--text-2)', flex: 1 }}>
              {selected.size === 0
                ? 'Tick 2+ audits of the same site to merge into one report.'
                : `${selected.size} selected`}
              {selectedUrlCount > 1 && (
                <span style={{ color: 'var(--warn)', marginLeft: 8 }}>
                  ⚠ {selectedUrlCount} different URLs — they'll still be merged.
                </span>
              )}
            </span>
            <button
              className="action-btn primary"
              disabled={selected.size < 2 || merging}
              onClick={doMerge}
              style={{ padding: '6px 14px', fontSize: 12 }}
            >
              {merging ? '⏳ Merging…' : `⧉ Merge ${selected.size || ''}`}
            </button>
          </div>
        )}

        <div className="history-controls">
          <input
            className="history-search"
            type="search"
            placeholder="Search by URL, headline or id…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="history-filter"
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            aria-label="Filter by module"
          >
            <option value="">All modules</option>
            {MODULES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="error-box" style={{ marginBottom: 12 }}>
            ✗ {error}
          </div>
        )}

        {loading && <div className="history-empty">Loading…</div>}

        {!loading && rows.length === 0 && (
          <div className="history-empty">
            {filtering
              ? 'No audits match your search.'
              : 'No past audits yet — run one and it will appear here.'}
          </div>
        )}

        <div className="history-list">
          {rows.map((r) => {
            const mod = MODULE_BY_ID[r.module]
            const accent = mod?.color || 'var(--accent)'
            return (
              <div
                key={r.id}
                className={`history-row ${busyId === r.id ? 'busy' : ''} ${mergeMode && selected.has(r.id) ? 'selected' : ''}`}
                onClick={(e) => (mergeMode ? toggleSelect(r.id, e) : openRow(r.id))}
                style={{
                  borderLeft: `3px solid ${accent}`,
                  ...(mergeMode && selected.has(r.id) ? { background: 'var(--surface-2)' } : {}),
                }}
              >
                {mergeMode && (
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onClick={(e) => toggleSelect(r.id, e)}
                    onChange={() => {}}
                    style={{ marginRight: 10, alignSelf: 'center', cursor: 'pointer' }}
                    aria-label={`Select ${r.id} for merge`}
                  />
                )}
                <div className="history-row-main">
                  <div className="history-row-title">
                    <span style={{ color: accent }}>{mod?.icon || '◆'}</span>
                    <span className="history-row-url">
                      {mod?.label || r.module || 'Audit'} · {domainOf(r.url)}
                    </span>
                  </div>
                  <div className="history-row-meta">🕒 {formatDate(r.generatedAt)}</div>
                  <div className="history-row-id" title={`Report id: ${r.id}`}>
                    {r.url || ''}
                  </div>
                </div>
                <div className="history-row-right">
                  <div className="history-row-score" style={{ color: scoreColor(r.score ?? 0) }}>
                    {r.score != null ? `${r.score}%` : '—'}
                  </div>
                  <div className="history-row-counts">
                    <span style={{ color: 'var(--pass)' }}>✓{r.counts?.pass ?? 0}</span>
                    <span style={{ color: 'var(--warn)' }}>!{r.counts?.warn ?? 0}</span>
                    <span style={{ color: 'var(--fail)' }}>✕{r.counts?.fail ?? 0}</span>
                  </div>
                  <button
                    className="history-row-del"
                    title="Delete report"
                    onClick={(e) => deleteRow(r.id, e)}
                  >
                    ×
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {hasMore && !loading && (
          <button
            className="history-loadmore"
            disabled={loadingMore}
            onClick={() => load(rows.length)}
          >
            {loadingMore ? 'Loading…' : `Load more (${total - rows.length})`}
          </button>
        )}
      </aside>
    </>
  )
}
