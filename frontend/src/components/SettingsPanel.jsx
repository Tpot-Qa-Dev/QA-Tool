// ─────────────────────────────────────────────────────────────────────────────
//  components/SettingsPanel.jsx
//  Slide-over panel for maintaining the tool. Sections:
//   1. Tool & key status (read-only diagnostics from /health + /settings)
//   2. Audit run settings (model, iterations, token budget, headless)
//   3. Claude behavior (temperature, extra instructions)
//   4. Browser settings (viewport, nav timeout, max links)
//   5. Audit defaults (default module, checks all-on)
//   6. Enabled tools (which tools the agent may call)
//   7. Token usage (cumulative + reset)
//   8. History maintenance (stats + clear / purge / rebuild index)
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState, useCallback } from 'react'
import {
  getSettings, saveSettings,
  getHistoryStats, runHistoryMaintenance,
  getUsage, resetUsage,
  listFigmaProjects, addFigmaProject, deleteFigmaProject, setActiveFigmaProject,
} from '../api/client.js'
import { MODULES } from '../config/modules.js'

function formatBytes(n) {
  if (!n) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`
}

function formatNum(n) {
  return (n ?? 0).toLocaleString()
}

export default function SettingsPanel({ open, onClose, health }) {
  const [settings,  setSettings]  = useState(null)
  const [tools,     setTools]     = useState([])
  const [presets,   setPresets]   = useState([])
  const [stats,     setStats]     = useState(null)
  const [usage,     setUsage]     = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState(null)
  const [notice,    setNotice]    = useState(null)
  const [purgeDays, setPurgeDays] = useState(30)
  const [figma,     setFigma]     = useState({ projects: [], activeId: '' })
  const [newProj,   setNewProj]   = useState({ name: '', token: '' })

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [s, st, u, fp] = await Promise.all([getSettings(), getHistoryStats(), getUsage(), listFigmaProjects()])
      setSettings(s.settings)
      setTools(s.tools)
      setPresets(s.modelPresets || [])
      setStats(st)
      setUsage(u)
      setFigma(fp)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (open) load() }, [open, load])

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Persist a patch and adopt the server's normalized (clamped) response.
  const persist = async (patch) => {
    setSaving(true); setError(null); setNotice(null)
    try {
      const s = await saveSettings(patch)
      setSettings(s.settings)
      setTools(s.tools)
      setNotice('Settings saved')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const setAudit   = (key, val) => setSettings(s => ({ ...s, audit:   { ...s.audit,   [key]: val } }))
  const setBrowser = (key, val) => setSettings(s => ({ ...s, browser: { ...s.browser, [key]: val } }))

  const doResetUsage = async () => {
    if (!confirm('Reset the cumulative token counter to zero?')) return
    setSaving(true); setError(null); setNotice(null)
    try {
      setUsage(await resetUsage())
      setNotice('Token usage reset')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const maintenance = async (action, extra, confirmMsg) => {
    if (confirmMsg && !confirm(confirmMsg)) return
    setSaving(true); setError(null); setNotice(null)
    try {
      const res = await runHistoryMaintenance(action, extra)
      setStats(await getHistoryStats())
      setNotice(
        action === 'clear'   ? `Cleared ${res.removed} report(s)` :
        action === 'purge'   ? `Purged ${res.removed} old report(s)` :
        action === 'rebuild' ? `Index rebuilt (${res.count} report(s))` : 'Done'
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Figma project tokens ─────────────────────────────────────────────────
  const addProject = async () => {
    if (!newProj.name.trim() || !newProj.token.trim()) return
    setSaving(true); setError(null); setNotice(null)
    try {
      setFigma(await addFigmaProject(newProj.name.trim(), newProj.token.trim()))
      setNewProj({ name: '', token: '' })
      setNotice('Figma project added')
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }
  const removeProject = async (id, name) => {
    if (!confirm(`Remove the Figma token for "${name}"?`)) return
    setSaving(true); setError(null); setNotice(null)
    try { setFigma(await deleteFigmaProject(id)); setNotice('Figma project removed') }
    catch (err) { setError(err.message) } finally { setSaving(false) }
  }
  const chooseActive = async (id) => {
    setSaving(true); setError(null); setNotice(null)
    try { setFigma(await setActiveFigmaProject(id)) }
    catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  const keys = health?.keys || {}
  const KEY_ROWS = [
    { id: 'claude', label: 'Claude API key', required: true },
    { id: 'psi',    label: 'PageSpeed API key', required: false },
    { id: 'figma',  label: 'Figma token', required: false },
  ]

  return (
    <>
      <div className={`history-scrim ${open ? 'open' : ''}`} onClick={onClose} />
      <aside className={`history-panel ${open ? 'open' : ''}`} role="dialog" aria-label="Settings">
        <div className="history-head">
          <div className="section-label" style={{ margin: 0 }}>Settings</div>
          <button className="ghost-btn" onClick={onClose} style={{ padding: '6px 12px', fontSize: 12 }}>✕ Close</button>
        </div>

        {error  && <div className="error-box"   style={{ marginBottom: 12 }}>✗ {error}</div>}
        {notice && <div className="notice-box"  style={{ marginBottom: 12 }}>✓ {notice}</div>}
        {loading && <div className="history-empty">Loading…</div>}

        {!loading && settings && (
          <div className="settings-body">

            {/* 1 ── Tool & key status ───────────────────────────────────────── */}
            <section className="settings-section">
              <div className="settings-title">Tool &amp; Key Status</div>
              <div className="settings-row">
                <span>Backend</span>
                <span className={health?.ok ? 'tag-on' : 'tag-off'}>{health?.ok ? 'online' : 'offline'}</span>
              </div>
              {KEY_ROWS.map(k => (
                <div className="settings-row" key={k.id}>
                  <span>{k.label}{k.required && <em className="req"> *</em>}</span>
                  <span className={keys[k.id] ? 'tag-on' : 'tag-off'}>
                    {keys[k.id] ? 'configured' : (k.required ? 'missing' : 'not set')}
                  </span>
                </div>
              ))}
              <p className="settings-hint">Keys are set in <code>backend/.env</code> and require a server restart.</p>
            </section>

            {/* 1b ── Figma project tokens ──────────────────────────────────── */}
            <section className="settings-section">
              <div className="settings-title">Figma Project Tokens</div>
              <p className="settings-hint">
                Add a Figma access token per project. The <strong>active</strong> one is used by default;
                you can also pick a project when configuring a Figma audit. Tokens are stored on the
                backend and shown masked.
              </p>

              {figma.projects.length === 0 && (
                <div className="settings-row"><span style={{ color: 'var(--text-muted)' }}>No project tokens yet.</span></div>
              )}
              {figma.projects.map(p => (
                <div className="settings-row" key={p.id} style={{ gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1, minWidth: 0 }} title="Use as default">
                    <input type="radio" name="figma-active" checked={p.active} onChange={() => chooseActive(p.id)} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name} {p.active && <span className="tag-on" style={{ marginLeft: 4 }}>active</span>}
                    </span>
                  </label>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--text-muted)' }}>{p.tokenHint}</span>
                  <button className="history-btn" disabled={saving} onClick={() => removeProject(p.id, p.name)}>Remove</button>
                </div>
              ))}

              <div className="settings-field" style={{ marginTop: 10 }}>
                <span>Add a project token</span>
                <input className="history-search" type="text" placeholder="Project name (e.g. Acme Website)"
                  value={newProj.name} onChange={e => setNewProj(s => ({ ...s, name: e.target.value }))} />
                <input className="history-search" type="password" placeholder="Figma personal access token" style={{ marginTop: 8 }}
                  value={newProj.token} onChange={e => setNewProj(s => ({ ...s, token: e.target.value }))} />
              </div>
              <button className="action-btn primary" disabled={saving || !newProj.name.trim() || !newProj.token.trim()}
                onClick={addProject}>
                {saving ? 'Saving…' : '+ Add Figma project'}
              </button>
            </section>

            {/* 2 ── Audit run settings ─────────────────────────────────────── */}
            <section className="settings-section">
              <div className="settings-title">Audit Run Settings</div>

              <label className="settings-field">
                <span>Model</span>
                <select
                  className="history-filter"
                  value={settings.audit.model}
                  onChange={e => setAudit('model', e.target.value)}
                >
                  {[...new Set([...presets, settings.audit.model])].map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </label>

              <label className="settings-field">
                <span>Max iterations (1–30)</span>
                <input className="history-search" type="number" min={1} max={30}
                  value={settings.audit.maxIterations}
                  onChange={e => setAudit('maxIterations', Number(e.target.value))} />
              </label>

              <label className="settings-field">
                <span>Max tokens (1024–16000)</span>
                <input className="history-search" type="number" min={1024} max={16000} step={256}
                  value={settings.audit.maxTokens}
                  onChange={e => setAudit('maxTokens', Number(e.target.value))} />
              </label>

              <label className="settings-row" style={{ cursor: 'pointer' }}>
                <span>Headless browser</span>
                <input type="checkbox"
                  checked={settings.audit.headless}
                  onChange={e => setAudit('headless', e.target.checked)} />
              </label>

              <button className="action-btn primary" disabled={saving}
                onClick={() => persist({ audit: settings.audit })}>
                {saving ? 'Saving…' : 'Save run settings'}
              </button>
            </section>

            {/* 3 ── Claude behavior ────────────────────────────────────────── */}
            <section className="settings-section">
              <div className="settings-title">Claude Behavior</div>

              <label className="settings-field">
                <span>Temperature ({settings.audit.temperature}) — 0 precise · 1 creative</span>
                <input type="range" min={0} max={1} step={0.1}
                  value={settings.audit.temperature}
                  onChange={e => setAudit('temperature', Number(e.target.value))} />
              </label>

              <label className="settings-field">
                <span>Extra instructions (added to every audit prompt)</span>
                <textarea className="history-search" rows={3} maxLength={2000}
                  placeholder="e.g. Always note GDPR cookie-banner issues."
                  value={settings.audit.extraInstructions}
                  onChange={e => setAudit('extraInstructions', e.target.value)} />
              </label>

              <button className="action-btn primary" disabled={saving}
                onClick={() => persist({ audit: settings.audit })}>
                {saving ? 'Saving…' : 'Save behavior'}
              </button>
            </section>

            {/* 4 ── Browser settings ───────────────────────────────────────── */}
            <section className="settings-section">
              <div className="settings-title">Browser Settings</div>

              <div className="settings-field">
                <span>Viewport (width × height)</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="history-search" type="number" min={320} max={3840} style={{ width: 100 }}
                    value={settings.browser.viewportWidth}
                    onChange={e => setBrowser('viewportWidth', Number(e.target.value))} />
                  <span style={{ alignSelf: 'center', color: 'var(--text-muted)' }}>×</span>
                  <input className="history-search" type="number" min={240} max={2160} style={{ width: 100 }}
                    value={settings.browser.viewportHeight}
                    onChange={e => setBrowser('viewportHeight', Number(e.target.value))} />
                </div>
              </div>

              <label className="settings-field">
                <span>Navigation timeout (5–120 sec)</span>
                <input className="history-search" type="number" min={5} max={120}
                  value={settings.browser.navTimeoutSec}
                  onChange={e => setBrowser('navTimeoutSec', Number(e.target.value))} />
              </label>

              <label className="settings-field">
                <span>Max links to check (1–500)</span>
                <input className="history-search" type="number" min={1} max={500}
                  value={settings.browser.maxLinks}
                  onChange={e => setBrowser('maxLinks', Number(e.target.value))} />
              </label>

              <button className="action-btn primary" disabled={saving}
                onClick={() => persist({ browser: settings.browser })}>
                {saving ? 'Saving…' : 'Save browser settings'}
              </button>
            </section>

            {/* 5 ── Audit defaults ─────────────────────────────────────────── */}
            <section className="settings-section">
              <div className="settings-title">Audit Defaults</div>

              <label className="settings-field">
                <span>Default module on launch</span>
                <select className="history-filter"
                  value={settings.audit.defaultModule}
                  onChange={e => persist({ audit: { ...settings.audit, defaultModule: e.target.value } })}>
                  <option value="">None</option>
                  {MODULES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </label>

              <label className="settings-row" style={{ cursor: 'pointer' }}>
                <span>Start with all checks ticked</span>
                <input type="checkbox"
                  checked={settings.audit.checksAllOn}
                  onChange={e => persist({ audit: { ...settings.audit, checksAllOn: e.target.checked } })} />
              </label>
              <p className="settings-hint">Applies the next time you open the app or pick a module.</p>
            </section>

            {/* 6 ── Tool enable/disable ────────────────────────────────────── */}
            <section className="settings-section">
              <div className="settings-title">Enabled Tools</div>
              <p className="settings-hint">Disabled tools are not offered to the agent on any audit.</p>
              {tools.map(t => (
                <label className="settings-row" key={t.name} style={{ cursor: 'pointer' }} title={t.description}>
                  <span className="tool-name">{t.name}</span>
                  <input type="checkbox" checked={t.enabled}
                    onChange={e => persist({ enabledTools: { [t.name]: e.target.checked } })} />
                </label>
              ))}
            </section>

            {/* 7 ── Token usage ────────────────────────────────────────────── */}
            <section className="settings-section">
              <div className="settings-title">Token Usage</div>
              <div className="settings-row"><span>Audits run</span><span>{formatNum(usage?.audits)}</span></div>
              <div className="settings-row"><span>Input tokens</span><span>{formatNum(usage?.inputTokens)}</span></div>
              <div className="settings-row"><span>Output tokens</span><span>{formatNum(usage?.outputTokens)}</span></div>
              <div className="settings-row"><span><strong>Total tokens</strong></span><span><strong>{formatNum(usage?.totalTokens)}</strong></span></div>
              {usage?.since && (
                <p className="settings-hint">Since {new Date(usage.since).toLocaleString()}</p>
              )}
              <div className="settings-actions">
                <button className="history-btn" disabled={saving} onClick={doResetUsage}>Reset counter</button>
              </div>
            </section>

            {/* 8 ── History maintenance ────────────────────────────────────── */}
            <section className="settings-section">
              <div className="settings-title">History Maintenance</div>
              <div className="settings-row">
                <span>Stored audits</span>
                <span>{stats?.count ?? '—'} · {formatBytes(stats?.totalBytes)}</span>
              </div>

              <div className="settings-field">
                <span>Delete audits older than</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="history-search" type="number" min={0} style={{ width: 80 }}
                    value={purgeDays} onChange={e => setPurgeDays(Number(e.target.value))} />
                  <span style={{ alignSelf: 'center', fontSize: 12, color: 'var(--text-muted)' }}>days</span>
                  <button className="history-btn" disabled={saving}
                    onClick={() => maintenance('purge', { days: purgeDays },
                      `Delete all audits older than ${purgeDays} days?`)}>Purge</button>
                </div>
              </div>

              <div className="settings-actions">
                <button className="history-btn" disabled={saving}
                  onClick={() => maintenance('rebuild')}>Rebuild index</button>
                <button className="action-btn danger" disabled={saving}
                  onClick={() => maintenance('clear', {}, 'Delete ALL stored audits? This cannot be undone.')}>
                  Clear all history
                </button>
              </div>
            </section>
          </div>
        )}
      </aside>
    </>
  )
}
