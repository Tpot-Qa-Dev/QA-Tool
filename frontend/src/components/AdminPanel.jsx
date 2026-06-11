// ─────────────────────────────────────────────────────────────────────────────
//  components/AdminPanel.jsx
//  Full-screen admin dashboard: metrics, per-module breakdown (bars), quality
//  split, recent audits, cumulative token spend, prompt inspection, and the test
//  catalogue. Read-only insight; management actions live in Settings.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState, useCallback } from 'react'
import { getAdminOverview, getAdminPrompts, resetUsage, getAdminConfig, updateAdminConfig,
  getCustomChecks, addCustomCheck, deleteCustomCheck, updateCustomCheck, setBuiltinDisabled, runHistoryMaintenance,
  getSettings, saveSettings,
  getPromptConfig, getPromptVersion, savePromptVersion, setActivePromptVersion, deletePromptVersion } from '../api/client.js'
import { MODULES } from '../config/modules.js'
import { applyAppearance } from '../lib/applyAppearance.js'
import DescriptionIcon from '@mui/icons-material/Description'
import SpeedIcon       from '@mui/icons-material/Speed'
import BoltIcon        from '@mui/icons-material/Bolt'
import TokenIcon       from '@mui/icons-material/Toll'

const MODULE = Object.fromEntries(MODULES.map(m => [m.id, m]))
const fmt = (n) => (n ?? 0).toLocaleString()
const scoreColor = (n) => (n >= 80 ? 'var(--pass)' : n >= 50 ? 'var(--warn)' : 'var(--fail)')

// CONCEPT-style stat card: value + label on the left, colored icon circle right.
function StatCard({ num, label, icon, color }) {
  return (
    <div className="admin-card admin-stat">
      <div>
        <div className="admin-card-num" style={{ color }}>{num}</div>
        <div className="admin-card-label">{label}</div>
      </div>
      <div className="admin-stat-icon" style={{ color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}>{icon}</div>
    </div>
  )
}

export default function AdminPanel({ open, onClose }) {
  const [ov,      setOv]      = useState(null)
  const [prompts, setPrompts] = useState(null)
  const [cfg,     setCfg]     = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [busy,    setBusy]    = useState(false)
  const [cfgNotice, setCfgNotice] = useState(null)
  // Config form fields (secrets blank = leave unchanged).
  const [form, setForm] = useState({ claudeKey: '', psiKey: '', figmaToken: '', nodeEnv: 'development', frontendUrl: '' })
  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Custom checks editor.
  const [cc, setCc]           = useState({})   // { moduleId: [custom items] }
  const [ccDisabled, setCcDisabled] = useState({}) // { moduleId: [disabled builtin ids] }
  const [ccModule, setCcModule] = useState(MODULES[0].id)
  const [ccForm, setCcForm]   = useState({ type: 'checkbox', label: '', group: 'Custom Checks', options: '', default: false, tools: '' })
  const setCcField = (k, v) => setCcForm(f => ({ ...f, [k]: v }))

  // Filters for the overview/charts.
  const [fDays,   setFDays]   = useState('')   // '' = all time
  const [fModule, setFModule] = useState('')   // '' = all modules

  // Which admin section is shown (driven by the admin's own sidebar).
  const [section, setSection] = useState('overview')

  // Editable prompt instructions + version history.
  const [pcfg,     setPcfg]     = useState(null)  // { versions, activeId, usingDefault, defaultBody }
  const [pcBody,   setPcBody]   = useState('')    // editor textarea
  const [pcLabel,  setPcLabel]  = useState('')    // optional version label
  const [pcBusy,   setPcBusy]   = useState(false)
  const [pcNotice, setPcNotice] = useState(null)

  // Appearance (admin-managed UI).
  const [uiForm, setUiForm] = useState(null)
  const setUiField = (k, v) => setUiForm(f => ({ ...f, [k]: v }))

  // Static data (prompts/config/custom-checks) — loaded once on open.
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [p, c, cks, s, pc] = await Promise.all([getAdminPrompts(), getAdminConfig(), getCustomChecks(), getSettings(), getPromptConfig()])
      setPrompts(p); setCfg(c)
      setCc(cks.customChecks || {}); setCcDisabled(cks.disabledChecks || {})
      setForm(f => ({ ...f, nodeEnv: c.nodeEnv, frontendUrl: c.frontendUrl }))
      setUiForm(s.settings.ui)
      setPcfg(pc)
      // Prefill the editor with whatever is active (active version body or default).
      const activeBody = pc.activeId
        ? (await getPromptVersion(pc.activeId)).body
        : pc.defaultBody
      setPcBody(activeBody)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [])

  // ── Prompt editor actions ────────────────────────────────────────────────
  const refreshPrompts = async () => { setPrompts(await getAdminPrompts()) }

  const pcSave = async () => {
    if (!pcBody.trim()) return
    setPcBusy(true); setError(null); setPcNotice(null)
    try {
      setPcfg(await savePromptVersion(pcLabel, pcBody))
      setPcLabel('')
      await refreshPrompts()
      setPcNotice('Saved as new version — now active')
    } catch (err) { setError(err.message) } finally { setPcBusy(false) }
  }

  const pcLoadIntoEditor = async (id) => {
    setPcBusy(true); setError(null); setPcNotice(null)
    try {
      const v = await getPromptVersion(id)
      setPcBody(v.body)
      setPcNotice(`Loaded "${v.label}" into the editor — edit and Save, or Restore to use as-is`)
    } catch (err) { setError(err.message) } finally { setPcBusy(false) }
  }

  const pcRestore = async (id) => {
    setPcBusy(true); setError(null); setPcNotice(null)
    try {
      const cfg2 = await setActivePromptVersion(id)
      setPcfg(cfg2)
      const body = id === 'default' ? cfg2.defaultBody : (await getPromptVersion(id)).body
      setPcBody(body)
      await refreshPrompts()
      setPcNotice(id === 'default' ? 'Reverted to built-in default' : 'Version restored — now active')
    } catch (err) { setError(err.message) } finally { setPcBusy(false) }
  }

  const pcDelete = async (id) => {
    if (!confirm('Delete this prompt version?')) return
    setPcBusy(true); setError(null); setPcNotice(null)
    try { setPcfg(await deletePromptVersion(id)); await refreshPrompts(); setPcNotice('Version deleted') }
    catch (err) { setError(err.message) } finally { setPcBusy(false) }
  }

  const saveAppearance = async () => {
    setBusy(true); setError(null); setCfgNotice(null)
    try {
      const s = await saveSettings({ ui: uiForm })
      setUiForm(s.settings.ui)
      applyAppearance(s.settings.ui)   // live: accent / radius / density / effects
      setCfgNotice('Appearance saved & applied. (MUI components update on next page load.)')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  // Overview/charts — reloaded when filters change.
  const loadOverview = useCallback(async () => {
    try { setOv(await getAdminOverview({ days: fDays, module: fModule })) }
    catch (err) { setError(err.message) }
  }, [fDays, fModule])

  // Maintenance shortcuts (reuse history/usage endpoints), then refresh.
  const maintenance = async (action, extra, confirmMsg) => {
    if (confirmMsg && !confirm(confirmMsg)) return
    setBusy(true); setError(null); setCfgNotice(null)
    try {
      if (action === 'reset-usage') { await resetUsage(); setCfgNotice('Token counter reset.') }
      else { const r = await runHistoryMaintenance(action, extra); setCfgNotice(`${action}: ${r.removed ?? r.count ?? 'done'}`) }
      await loadOverview()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const addCheck = async () => {
    if (!ccForm.label.trim()) { setError('Label is required'); return }
    setBusy(true); setError(null); setCfgNotice(null)
    try {
      const item = {
        type:  ccForm.type,
        label: ccForm.label.trim(),
        group: ccForm.group.trim() || 'Custom Checks',
        default: ccForm.type === 'checkbox' ? ccForm.default : '',
        tools: ccForm.tools.split(',').map(t => t.trim()).filter(Boolean),
      }
      if (ccForm.type === 'dropdown') item.options = ccForm.options.split(',').map(o => o.trim()).filter(Boolean)
      applyStore(await addCustomCheck(ccModule, item))
      setCcForm(f => ({ ...f, label: '', options: '' }))
      setCfgNotice('Custom check added — it appears in the audit wizard (refresh the audit page).')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const applyStore = (s) => { setCc(s.customChecks || {}); setCcDisabled(s.disabledChecks || {}) }

  const removeCheck = async (id) => {
    setBusy(true); setError(null)
    try { applyStore(await deleteCustomCheck(ccModule, id)) } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const toggleCheck = async (id, enabled) => {
    setBusy(true); setError(null)
    try { applyStore(await updateCustomCheck(ccModule, id, { enabled })) } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  // Enable/disable a built-in (available) check for the selected module.
  const toggleBuiltin = async (checkId, disabled) => {
    setBusy(true); setError(null)
    try { applyStore(await setBuiltinDisabled(ccModule, checkId, disabled)) } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const saveConfig = async () => {
    setBusy(true); setError(null); setCfgNotice(null)
    try {
      const patch = { nodeEnv: form.nodeEnv, frontendUrl: form.frontendUrl }
      if (form.claudeKey.trim())  patch.claudeKey  = form.claudeKey.trim()
      if (form.psiKey.trim())     patch.psiKey     = form.psiKey.trim()
      if (form.figmaToken.trim()) patch.figmaToken = form.figmaToken.trim()
      const res = await updateAdminConfig(patch)
      setCfg(res.status)
      setForm(f => ({ ...f, claudeKey: '', psiKey: '', figmaToken: '' })) // clear secrets
      setCfgNotice(`Saved (${res.updated.join(', ') || 'no changes'}). Restart the backend to apply.`)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  useEffect(() => { if (open) load() }, [open, load])
  useEffect(() => { if (open) loadOverview() }, [open, loadOverview]) // initial + on filter change
  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const maxCount = ov ? Math.max(1, ...ov.byModule.map(m => m.count)) : 1
  const totalQ = ov ? (ov.totals.pass + ov.totals.warn + ov.totals.fail) || 1 : 1

  const SECTIONS = [
    { key: 'overview',   label: 'Overview',      icon: '📊' },
    { key: 'config',     label: 'Configuration', icon: '🔑' },
    { key: 'appearance', label: 'Appearance',    icon: '🎨' },
    { key: 'checks',     label: 'Custom Checks',  icon: '☑' },
    { key: 'prompts',    label: 'Prompts',       icon: '📝' },
    { key: 'catalogue',  label: 'Catalogue',     icon: '📚' },
  ]
  const activeLabel = SECTIONS.find(s => s.key === section)?.label || 'Admin'

  return (
    <div className="admin-page">
      {/* Admin's own sidebar — all admin options */}
      <aside className="admin-side">
        <div className="admin-side-brand">📊 Admin</div>
        <nav className="admin-side-nav">
          {SECTIONS.map(s => (
            <button key={s.key} className={`admin-side-item ${section === s.key ? 'active' : ''}`} onClick={() => setSection(s.key)}>
              <span className="admin-side-ic">{s.icon}</span> {s.label}
            </button>
          ))}
        </nav>
        <button className="admin-side-back" onClick={onClose}>← Back to app</button>
      </aside>

      <div className="admin-main">
        <div className="admin-topbar">
          <div className="admin-topbar-title">{activeLabel}</div>
          {section === 'overview' && (
            <>
              <select className="history-filter" value={fDays} onChange={e => setFDays(e.target.value)} title="Date range">
                <option value="">All time</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
              </select>
              <select className="history-filter" value={fModule} onChange={e => setFModule(e.target.value)} title="Module">
                <option value="">All modules</option>
                {MODULES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </>
          )}
          <button className="ghost-btn" onClick={() => { load(); loadOverview() }} disabled={loading} style={{ marginLeft: 'auto' }}>↻ Refresh</button>
        </div>

      <div className="admin-content">
        {error && <div className="error-box" style={{ marginBottom: 16 }}>✗ {error}</div>}
        {cfgNotice && <div className="notice-box" style={{ marginBottom: 16 }}>✓ {cfgNotice}</div>}

        {section === 'overview' && (loading || !ov ? (
          <div className="sec-empty">Loading dashboard…</div>
        ) : (
          <>
            {/* Metric cards (CONCEPT-style with icon circles) */}
            <div className="admin-cards">
              <StatCard num={fmt(ov.reports)} label="Reports generated" color="var(--accent)" icon={<DescriptionIcon />} />
              <StatCard num={ov.avgScore != null ? `${ov.avgScore}%` : '—'} label="Average score" color={scoreColor(ov.avgScore ?? 0)} icon={<SpeedIcon />} />
              <StatCard num={fmt(ov.usage?.audits)} label="Audits run" color="var(--accent-2)" icon={<BoltIcon />} />
              <StatCard num={fmt(ov.usage?.totalTokens)} label="Total tokens" color="var(--warn)" icon={<TokenIcon />} />
            </div>

            <div className="admin-2col">
              {/* By module */}
              <div className="admin-block">
                <div className="admin-block-title">Audits by module</div>
                {ov.byModule.length === 0 && <div className="sec-empty" style={{ padding: 24 }}>No audits yet.</div>}
                {ov.byModule.map(m => {
                  const mod = MODULE[m.module]
                  return (
                    <div className="admin-mrow" key={m.module}>
                      <div className="admin-mname"><span style={{ color: mod?.color }}>{mod?.icon || '◆'}</span> {mod?.label || m.module}</div>
                      <div className="admin-mbars">
                        <div className="admin-bar-track"><div className="admin-bar-fill" style={{ width: `${(m.count / maxCount) * 100}%`, background: mod?.color || 'var(--accent)' }} /></div>
                        <span className="admin-bar-val">{m.count} run{m.count === 1 ? '' : 's'}</span>
                      </div>
                      <div className="admin-mscore" style={{ color: scoreColor(m.avgScore ?? 0) }}>{m.avgScore != null ? `${m.avgScore}%` : '—'}</div>
                    </div>
                  )
                })}
              </div>

              {/* Quality donut + tokens */}
              <div className="admin-block">
                <div className="admin-block-title">Result quality (all reports)</div>
                {(() => {
                  const p = (ov.totals.pass / totalQ) * 100
                  const w = (ov.totals.warn / totalQ) * 100
                  return (
                    <div className="admin-donut-wrap">
                      <div className="admin-donut" style={{ background: `conic-gradient(var(--pass) 0 ${p}%, var(--warn) ${p}% ${p + w}%, var(--fail) ${p + w}% 100%)` }}>
                        <div className="admin-donut-hole">
                          <strong>{fmt(ov.totals.pass + ov.totals.warn + ov.totals.fail)}</strong>
                          <span>checks</span>
                        </div>
                      </div>
                      <div className="admin-qlegend admin-qlegend-col">
                        <span style={{ color: 'var(--pass)' }}>● {fmt(ov.totals.pass)} pass</span>
                        <span style={{ color: 'var(--warn)' }}>● {fmt(ov.totals.warn)} warn</span>
                        <span style={{ color: 'var(--fail)' }}>● {fmt(ov.totals.fail)} fail</span>
                      </div>
                    </div>
                  )
                })()}

                <div className="admin-block-title" style={{ marginTop: 22 }}>Token spend</div>
                <div className="admin-trow"><span>Input</span><span>{fmt(ov.usage?.inputTokens)}</span></div>
                <div className="admin-trow"><span>Output</span><span>{fmt(ov.usage?.outputTokens)}</span></div>
                <div className="admin-trow"><span><b>Total</b></span><span><b>{fmt(ov.usage?.totalTokens)}</b></span></div>
                {ov.usage?.since && <div className="admin-since">since {new Date(ov.usage.since).toLocaleString()}</div>}
                <button className="history-btn" disabled={busy} onClick={() => maintenance('reset-usage', {}, 'Reset the cumulative token counter to zero?')} style={{ marginTop: 10 }}>Reset token counter</button>
              </div>
            </div>

            {/* Charts */}
            <div className="admin-2col">
              <div className="admin-block">
                <div className="admin-block-title">Score distribution{ov.filter?.days ? ` · last ${ov.filter.days}d` : ''}</div>
                {Object.entries(ov.scoreBuckets).map(([label, n]) => {
                  const max = Math.max(1, ...Object.values(ov.scoreBuckets))
                  const color = label.startsWith('80') ? 'var(--pass)' : label.startsWith('50') ? 'var(--warn)' : 'var(--fail)'
                  return (
                    <div className="admin-mrow" key={label} style={{ gridTemplateColumns: '70px 1fr auto' }}>
                      <div className="admin-mname">{label}</div>
                      <div className="admin-bar-track"><div className="admin-bar-fill" style={{ width: `${(n / max) * 100}%`, background: color }} /></div>
                      <div className="admin-mscore">{n}</div>
                    </div>
                  )
                })}
                <div className="admin-block-title" style={{ marginTop: 20 }}>Grade distribution</div>
                {Object.keys(ov.gradeDist).length === 0 && <div className="sec-empty" style={{ padding: 12 }}>No data.</div>}
                {Object.entries(ov.gradeDist).sort((a, b) => a[0].localeCompare(b[0])).map(([g, n]) => {
                  const max = Math.max(1, ...Object.values(ov.gradeDist))
                  return (
                    <div className="admin-mrow" key={g} style={{ gridTemplateColumns: '70px 1fr auto' }}>
                      <div className="admin-mname">Grade {g}</div>
                      <div className="admin-bar-track"><div className="admin-bar-fill" style={{ width: `${(n / max) * 100}%`, background: 'var(--accent)' }} /></div>
                      <div className="admin-mscore">{n}</div>
                    </div>
                  )
                })}
              </div>

              <div className="admin-block">
                <div className="admin-block-title">Audits per day{ov.filter?.days ? ` · last ${ov.filter.days}d` : ' · last 14d'}</div>
                <div className="admin-spark">
                  {ov.timeline.map(t => {
                    const max = Math.max(1, ...ov.timeline.map(x => x.count))
                    return (
                      <div className="admin-spark-col" key={t.date} title={`${t.date}: ${t.count}`}>
                        <div className="admin-spark-bar" style={{ height: `${Math.max(3, (t.count / max) * 100)}%`, opacity: t.count ? 1 : 0.25 }} />
                      </div>
                    )
                  })}
                </div>
                <div className="admin-spark-axis">
                  <span>{ov.timeline[0]?.date.slice(5)}</span>
                  <span>{ov.timeline[ov.timeline.length - 1]?.date.slice(5)}</span>
                </div>

                <div className="admin-block-title" style={{ marginTop: 20 }}>Maintenance</div>
                <div className="settings-actions">
                  <button className="history-btn" disabled={busy} onClick={() => maintenance('rebuild')}>Rebuild index</button>
                  <button className="history-btn" disabled={busy} onClick={() => maintenance('purge', { days: 30 }, 'Delete audits older than 30 days?')}>Purge &gt; 30d</button>
                  <button className="action-btn danger" disabled={busy} onClick={() => maintenance('clear', {}, 'Delete ALL stored audits? This cannot be undone.')}>Clear all history</button>
                </div>
              </div>
            </div>
          </>
        ))}

        {/* CONFIGURATION */}
        {section === 'config' && (cfg ? (
              <div className="admin-block">
                <div className="admin-block-title">Configuration — Keys &amp; Mode</div>
                <p className="settings-hint">Edits <code>backend/.env</code>. Changes need a <b>server restart</b> to take effect. Secret values are never shown — leave a key blank to keep it unchanged.</p>

                <div className="admin-cfg-grid">
                  <label className="settings-field">
                    <span>Claude API key {cfg.keys.claude ? <span className="tag-on">set</span> : <span className="tag-off">missing</span>}</span>
                    <input className="history-search" type="password" placeholder="sk-ant-… (leave blank to keep)"
                      value={form.claudeKey} onChange={e => setField('claudeKey', e.target.value)} />
                  </label>
                  <label className="settings-field">
                    <span>PageSpeed API key {cfg.keys.psi ? <span className="tag-on">set</span> : <span className="tag-off">not set</span>}</span>
                    <input className="history-search" type="password" placeholder="(leave blank to keep)"
                      value={form.psiKey} onChange={e => setField('psiKey', e.target.value)} />
                  </label>
                  <label className="settings-field">
                    <span>Figma token {cfg.keys.figma ? <span className="tag-on">set</span> : <span className="tag-off">not set</span>}</span>
                    <input className="history-search" type="password" placeholder="figd_… (leave blank to keep)"
                      value={form.figmaToken} onChange={e => setField('figmaToken', e.target.value)} />
                  </label>
                  <label className="settings-field">
                    <span>Run mode (active: {cfg.nodeEnv})</span>
                    <select className="history-filter" value={form.nodeEnv} onChange={e => setField('nodeEnv', e.target.value)}>
                      <option value="development">development</option>
                      <option value="production">production</option>
                    </select>
                  </label>
                  <label className="settings-field" style={{ gridColumn: '1 / -1' }}>
                    <span>Frontend URL (CORS in production)</span>
                    <input className="history-search" type="text"
                      value={form.frontendUrl} onChange={e => setField('frontendUrl', e.target.value)} />
                  </label>
                </div>
                <button className="action-btn primary" disabled={busy} onClick={saveConfig} style={{ marginTop: 12 }}>
                  {busy ? 'Saving…' : 'Save configuration'}
                </button>
              </div>
        ) : <div className="sec-empty">Loading…</div>)}

        {/* APPEARANCE */}
        {section === 'appearance' && (uiForm ? (
              <div className="admin-block">
                <div className="admin-block-title">Appearance</div>
                <p className="settings-hint">Neon-3D UI controls. Saved app-wide; accent/radius/density/effects apply live, MUI components on next load.</p>
                <div className="admin-cfg-grid">
                  <label className="settings-field"><span>Accent color</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="color" value={uiForm.accent || '#00E5FF'} onChange={e => setUiField('accent', e.target.value)} style={{ width: 44, height: 34, border: 0, background: 'none' }} />
                      <input className="history-search" value={uiForm.accent} placeholder="(theme default)" onChange={e => setUiField('accent', e.target.value)} />
                    </div>
                  </label>
                  <label className="settings-field"><span>Secondary color</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="color" value={uiForm.accent2 || '#A78BFA'} onChange={e => setUiField('accent2', e.target.value)} style={{ width: 44, height: 34, border: 0, background: 'none' }} />
                      <input className="history-search" value={uiForm.accent2} placeholder="(theme default)" onChange={e => setUiField('accent2', e.target.value)} />
                    </div>
                  </label>
                  <label className="settings-field"><span>Default theme</span>
                    <select className="history-filter" value={uiForm.defaultTheme} onChange={e => setUiField('defaultTheme', e.target.value)}>
                      <option value="dark">dark</option><option value="light">light</option>
                    </select>
                  </label>
                  <label className="settings-field"><span>Density</span>
                    <select className="history-filter" value={uiForm.density} onChange={e => setUiField('density', e.target.value)}>
                      <option value="comfortable">comfortable</option><option value="compact">compact</option>
                    </select>
                  </label>
                  <label className="settings-field"><span>Corner radius: {uiForm.radius}px</span>
                    <input type="range" min={0} max={28} value={uiForm.radius} onChange={e => setUiField('radius', Number(e.target.value))} />
                  </label>
                  <label className="settings-row" style={{ cursor: 'pointer' }}><span>3D effects &amp; animations</span>
                    <input type="checkbox" checked={uiForm.effects} onChange={e => setUiField('effects', e.target.checked)} />
                  </label>
                </div>
                <button className="action-btn primary" disabled={busy} onClick={saveAppearance} style={{ marginTop: 12 }}>Save appearance</button>
              </div>
        ) : <div className="sec-empty">Loading…</div>)}

        {/* CUSTOM CHECKS */}
        {section === 'checks' && (
            <div className="admin-block">
              <div className="admin-block-title">Custom Checks</div>
              <p className="settings-hint">Add extra checkboxes or dropdowns to a module — they appear in the audit wizard and are sent with the audit. Optional "required tools" force those tools to run. (Refresh the audit page to pick up new ones.)</p>

              <label className="settings-field" style={{ maxWidth: 320 }}>
                <span>Module</span>
                <select className="history-filter" value={ccModule} onChange={e => setCcModule(e.target.value)}>
                  {MODULES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </label>

              {/* Built-in (available) checks — enable/disable */}
              <div className="admin-block-title" style={{ marginTop: 14 }}>Built-in checks (enable / disable)</div>
              <div style={{ margin: '6px 0 4px' }}>
                {(() => {
                  const dset = new Set(ccDisabled[ccModule] || [])
                  return (MODULE[ccModule]?.checkboxGroups || []).flatMap(g => g.items).map(it => {
                    const on = !dset.has(it.id)
                    return (
                      <div className="settings-row" key={it.id} style={{ opacity: on ? 1 : 0.5 }}>
                        <span>{it.label} <span className="muted">· {it.tools?.length ? `⚙ ${it.tools.join(', ')}` : 'built-in'}{on ? '' : ' · disabled'}</span></span>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 11 }} title={on ? 'Disable (hide from wizard)' : 'Enable'}>
                          <input type="checkbox" checked={on} disabled={busy} onChange={e => toggleBuiltin(it.id, !e.target.checked)} /> on
                        </label>
                      </div>
                    )
                  })
                })()}
              </div>

              <div className="admin-block-title" style={{ marginTop: 14 }}>Custom checks</div>
              <div style={{ margin: '6px 0' }}>
                {(cc[ccModule] || []).length === 0 && <div className="settings-hint">No custom checks for this module yet.</div>}
                {(cc[ccModule] || []).map(it => {
                  const on = it.enabled !== false
                  return (
                    <div className="settings-row" key={it.id} style={{ opacity: on ? 1 : 0.5 }}>
                      <span>
                        {it.type === 'dropdown' ? '▾' : '☑'} {it.label}
                        <span className="muted"> · {it.group}{it.type === 'dropdown' ? ` · ${(it.options || []).join(' / ')}` : ''}{it.tools?.length ? ` · ⚙ ${it.tools.join(', ')}` : ''}{on ? '' : ' · disabled'}</span>
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <label title={on ? 'Disable (hide from wizard)' : 'Enable'} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 11 }}>
                          <input type="checkbox" checked={on} disabled={busy} onChange={e => toggleCheck(it.id, e.target.checked)} /> on
                        </label>
                        <button className="history-row-del" disabled={busy} title="Remove" onClick={() => removeCheck(it.id)}>×</button>
                      </span>
                    </div>
                  )
                })}
              </div>

              <div className="admin-cfg-grid">
                <label className="settings-field"><span>Type</span>
                  <select className="history-filter" value={ccForm.type} onChange={e => setCcField('type', e.target.value)}>
                    <option value="checkbox">Checkbox</option>
                    <option value="dropdown">Dropdown</option>
                  </select>
                </label>
                <label className="settings-field"><span>Label</span>
                  <input className="history-search" value={ccForm.label} onChange={e => setCcField('label', e.target.value)} placeholder="e.g. Check cookie banner" />
                </label>
                <label className="settings-field"><span>Group</span>
                  <input className="history-search" value={ccForm.group} onChange={e => setCcField('group', e.target.value)} placeholder="Custom Checks" />
                </label>
                {ccForm.type === 'dropdown' ? (
                  <label className="settings-field"><span>Options (comma-separated)</span>
                    <input className="history-search" value={ccForm.options} onChange={e => setCcField('options', e.target.value)} placeholder="Desktop, Mobile, Tablet" />
                  </label>
                ) : (
                  <label className="settings-row" style={{ cursor: 'pointer' }}><span>Checked by default</span>
                    <input type="checkbox" checked={ccForm.default} onChange={e => setCcField('default', e.target.checked)} />
                  </label>
                )}
                <label className="settings-field" style={{ gridColumn: '1 / -1' }}><span>Required tools (optional, comma-separated)</span>
                  <input className="history-search" value={ccForm.tools} onChange={e => setCcField('tools', e.target.value)} placeholder="playwright_console_errors, playwright_screenshot" />
                </label>
              </div>
              <button className="action-btn primary" disabled={busy || !ccForm.label.trim()} onClick={addCheck} style={{ marginTop: 12 }}>
                + Add check
              </button>
            </div>
        )}

        {/* RECENT AUDITS (part of overview) */}
        {section === 'overview' && ov?.recent?.length > 0 && (
              <div className="admin-block">
                <div className="admin-block-title">Recent audits</div>
                <table className="sec-table">
                  <thead><tr><th>URL</th><th>Module</th><th>Score</th><th>Grade</th><th>When</th></tr></thead>
                  <tbody>
                    {ov.recent.map(r => (
                      <tr key={r.id}>
                        <td className="admin-recent-url" title={r.url}>{r.url || '(no url)'}</td>
                        <td>{MODULE[r.module]?.label || r.module || '—'}</td>
                        <td style={{ color: scoreColor(r.score ?? 0) }}>{r.score != null ? `${r.score}%` : '—'}</td>
                        <td>{r.grade || '—'}</td>
                        <td className="muted">{r.generatedAt ? new Date(r.generatedAt).toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
        )}

        {/* PROMPTS */}
        {section === 'prompts' && (prompts ? (
              <div className="admin-block">

                {/* Editable persona/instructions + version history */}
                <div className="admin-block-title">Edit Prompt (persona &amp; instructions)</div>
                <p className="settings-hint">
                  Edit how the agent behaves. The JSON report structure, the requested checks and the
                  required tools are added automatically each run and can’t be edited away — so a change
                  here can’t break the report output. <strong>Save</strong> creates a new version; you can
                  <strong> Restore</strong> any earlier version or the built-in default.
                </p>
                {pcNotice && <div className="notice-box" style={{ marginBottom: 10 }}>✓ {pcNotice}</div>}
                {pcfg && (
                  <div className="settings-row" style={{ marginBottom: 8 }}>
                    <span>Currently active</span>
                    <span className={pcfg.usingDefault ? 'tag-off' : 'tag-on'}>
                      {pcfg.usingDefault ? 'Built-in default' : (pcfg.versions.find(v => v.active)?.label || 'custom version')}
                    </span>
                  </div>
                )}
                <textarea
                  className="history-search"
                  style={{ width: '100%', minHeight: 260, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, lineHeight: 1.5 }}
                  value={pcBody}
                  onChange={e => setPcBody(e.target.value)}
                  placeholder="Persona + how the agent should work…"
                />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
                  <input className="history-search" style={{ flex: 1, minWidth: 160 }} type="text"
                    placeholder="Version label (optional, e.g. 'stricter accessibility')"
                    value={pcLabel} onChange={e => setPcLabel(e.target.value)} />
                  <button className="action-btn primary" disabled={pcBusy || !pcBody.trim()} onClick={pcSave}>
                    {pcBusy ? 'Saving…' : '💾 Save as new version'}
                  </button>
                  <button className="history-btn" disabled={pcBusy} onClick={() => setPcBody(pcfg?.defaultBody || '')} title="Load default text into the editor">
                    ↺ Load default text
                  </button>
                  <button className="history-btn" disabled={pcBusy || pcfg?.usingDefault} onClick={() => pcRestore('default')} title="Make the built-in default active">
                    Reset to default
                  </button>
                </div>

                {/* Version history */}
                <div className="admin-block-title" style={{ marginTop: 22 }}>Version history</div>
                {(!pcfg || pcfg.versions.length === 0) ? (
                  <p className="settings-hint">No saved versions yet — the built-in default is in use. Edit above and Save to create the first version.</p>
                ) : (
                  <table className="sec-table">
                    <thead><tr><th>Version</th><th>Saved</th><th>Preview</th><th></th></tr></thead>
                    <tbody>
                      {[...pcfg.versions].reverse().map(v => (
                        <tr key={v.id}>
                          <td>{v.label} {v.active && <span className="tag-on" style={{ marginLeft: 6 }}>active</span>}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{new Date(v.createdAt).toLocaleString()}</td>
                          <td style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{v.preview}…</td>
                          <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                            <button className="history-btn" disabled={pcBusy} onClick={() => pcLoadIntoEditor(v.id)}>Edit</button>{' '}
                            <button className="history-btn" disabled={pcBusy || v.active} onClick={() => pcRestore(v.id)}>Restore</button>{' '}
                            <button className="history-btn" disabled={pcBusy} onClick={() => pcDelete(v.id)}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <div className="admin-block-title" style={{ marginTop: 22 }}>Prompts used in tests</div>
                <p className="settings-hint">Model <code>{prompts.model}</code> · temperature {prompts.temperature}. Reflects the active prompt above; checks + required tools are injected per run — this is exactly what the agent receives.</p>
                <details className="custom-export"><summary>System prompt — standard module</summary><pre className="admin-pre">{prompts.standard}</pre></details>
                <details className="custom-export"><summary>System prompt — Figma vs Web</summary><pre className="admin-pre">{prompts.figma}</pre></details>
                <details className="custom-export"><summary>Example (with checks + required tools)</summary><pre className="admin-pre">{prompts.example}</pre></details>
                <details className="custom-export"><summary>User message template</summary><pre className="admin-pre">{prompts.userMessageTemplate}</pre></details>
                <details className="custom-export"><summary>Report JSON shape</summary><pre className="admin-pre">{prompts.reportShape}</pre></details>
              </div>
        ) : <div className="sec-empty">Loading…</div>)}

        {/* CATALOGUE */}
        {section === 'catalogue' && (
            <div className="admin-block">
              <div className="admin-block-title">Test catalogue</div>
              <table className="sec-table">
                <thead><tr><th>Module</th><th>Checks</th><th>Groups</th></tr></thead>
                <tbody>
                  {MODULES.map(m => (
                    <tr key={m.id}>
                      <td><span style={{ color: m.color }}>{m.icon}</span> {m.label}</td>
                      <td>{m.checkboxGroups.reduce((a, g) => a + g.items.length, 0)}</td>
                      <td className="muted">{m.checkboxGroups.map(g => g.group).join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        )}
      </div>{/* admin-content */}
      </div>{/* admin-main */}
    </div>
  )
}
