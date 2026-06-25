// ─────────────────────────────────────────────────────────────────────────────
//  components/steps/ConfigureAudit.jsx
//  Wizard step 2 — enter URLs and tick the checks to run.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import Checkbox from '../Checkbox.jsx'
import { listSections } from '../../api/client.js'

// The three link types the audit can target. The choice tells the backend how
// to frame the report (a Local/Staging link is reviewed as pre-launch; a Live
// link is held to production standards).
const ENVIRONMENTS = [
  {
    id: 'local',
    icon: '🖥️',
    label: 'Local',
    desc: 'Runs on your machine',
    placeholder: 'http://localhost:3000',
  },
  {
    id: 'staging',
    icon: '🚧',
    label: 'Staging / Dev',
    desc: 'On a dev/staging server',
    placeholder: 'https://staging.your-site.com',
  },
  {
    id: 'live',
    icon: '🟢',
    label: 'Live',
    desc: 'Production site',
    placeholder: 'https://your-website.com',
  },
]

export default function ConfigureAudit({
  mod,
  inputs,
  setInput,
  setEnvironment,
  errors,
  checkState,
  toggleCheck,
  setCheckValue,
  toggleAll,
  setAllChecks,
  recentUrls = [],
  recentFigmaUrls = [],
  figmaProjects = { projects: [], activeId: '' },
  aiModels = { profiles: [], activeId: '' },
  health,
  canRun,
  onBack,
  onChangeModule,
  onRun,
}) {
  const env = inputs.environment || 'live'
  const currentEnv = ENVIRONMENTS.find((e) => e.id === env) || ENVIRONMENTS[2]

  // ── Page-section picker ──────────────────────────────────────────────────
  const [scanning, setScanning] = useState(false)
  const [scanned, setScanned] = useState([]) // [{ index, name, tag, counts }]
  const [scanErr, setScanErr] = useState(null)
  const selectedSections = inputs.sections || []

  const scanSections = async () => {
    const url = inputs.website_url.trim()
    if (!url || errors?.website) return
    setScanning(true)
    setScanErr(null)
    try {
      const res = await listSections(url)
      const list = res.sections || []
      setScanned(list)
      // Default: select every detected section.
      setInput(
        'sections',
        list.map((s) => s.name),
      )
    } catch (err) {
      setScanErr(err.message)
      setScanned([])
    } finally {
      setScanning(false)
    }
  }

  const toggleSection = (name) => {
    const set = new Set(selectedSections)
    set.has(name) ? set.delete(name) : set.add(name)
    setInput('sections', [...set])
  }
  const allSectionsOn =
    scanned.length > 0 && scanned.every((s) => selectedSections.includes(s.name))
  const accent = mod.color
  const needsFigma = mod.inputs.includes('figma_url')
  const isCheckbox = (i) => (i.type || 'checkbox') === 'checkbox'
  const selectedCount = Object.values(checkState).filter(Boolean).length
  const checkboxItems = mod.checkboxGroups.flatMap((g) => g.items).filter(isCheckbox)
  const allSelected = checkboxItems.length > 0 && checkboxItems.every((i) => checkState[i.id])

  const backendDown = !health?.ok
  const noKey = health?.ok && !health?.keys?.claude

  return (
    <div className="fade-in">
      {/* Selected-module banner */}
      <div
        className="card"
        style={{ borderColor: `color-mix(in srgb, ${accent} 33%, transparent)` }}
      >
        <div className="mod-banner">
          <span className="mod-banner-icon">{mod.icon}</span>
          <div>
            <div className="mod-banner-title" style={{ color: accent }}>
              {mod.label}
            </div>
            <div className="mod-banner-desc">{mod.desc}</div>
          </div>
          <button
            className="ghost-btn"
            style={{ marginLeft: 'auto', padding: '8px 14px', fontSize: 12 }}
            onClick={onChangeModule}
          >
            ← Change
          </button>
        </div>
      </div>

      {backendDown && (
        <div className="warn-box">
          ✗ Backend offline — start it with <code>cd backend &amp;&amp; npm start</code>
        </div>
      )}
      {noKey && (
        <div className="warn-box">
          ✗ CLAUDE_API_KEY missing — add it to <code>backend/.env</code>
        </div>
      )}

      {/* URL inputs */}
      <div className="card">
        <div className="section-label">02 — Enter URLs</div>

        {/* Link type — Local / Staging / Live. Picks how the report is framed
            and recalls a separate saved URL per type. */}
        <div className="input-group">
          <div className="input-label">🔗 Link type</div>
          <div className="env-seg" role="radiogroup" aria-label="Link type">
            {ENVIRONMENTS.map((e) => {
              const active = e.id === env
              return (
                <button
                  key={e.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={`env-seg-btn ${active ? 'active' : ''}`}
                  onClick={() => setEnvironment?.(e.id)}
                  title={e.desc}
                  style={
                    active
                      ? {
                          borderColor: accent,
                          color: accent,
                          background: `color-mix(in srgb, ${accent} 14%, transparent)`,
                        }
                      : undefined
                  }
                >
                  <span className="env-seg-icon">{e.icon}</span>
                  <span className="env-seg-label">{e.label}</span>
                  <span className="env-seg-desc">{e.desc}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="input-group">
          <div className="input-label">
            🌐 Website URL <span className="tag">required</span>
          </div>
          <input
            className="input-field"
            type="url"
            list="recent-urls"
            placeholder={currentEnv.placeholder}
            value={inputs.website_url}
            onChange={(e) => setInput('website_url', e.target.value)}
            style={errors?.website ? { borderColor: 'var(--fail)' } : undefined}
          />
          {recentUrls.length > 0 && (
            <datalist id="recent-urls">
              {recentUrls.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          )}
          {recentUrls.length > 0 && (
            <div className="recent-urls">
              {recentUrls.slice(0, 5).map((u) => (
                <button
                  key={u}
                  type="button"
                  className="recent-chip"
                  title={u}
                  onClick={() => setInput('website_url', u)}
                >
                  {u}
                </button>
              ))}
            </div>
          )}
          {env === 'local' && (
            <div className="file-name-hint" style={{ marginTop: 6 }}>
              Tip: you can paste a <code>file:///…/page.html</code> path to audit a local HTML file
              directly.
            </div>
          )}
          {errors?.website && <div className="field-error">⚠ {errors.website}</div>}
        </div>

        {needsFigma && (
          <div className="input-group">
            <div className="input-label">
              ⬡ Figma Design URL <span className="tag">required for pixel check</span>
            </div>
            <input
              className="input-field"
              type="url"
              list="recent-figma-urls"
              placeholder="https://www.figma.com/file/..."
              value={inputs.figma_url}
              onChange={(e) => setInput('figma_url', e.target.value)}
              style={errors?.figma ? { borderColor: 'var(--fail)' } : undefined}
            />
            {recentFigmaUrls.length > 0 && (
              <datalist id="recent-figma-urls">
                {recentFigmaUrls.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            )}
            {recentFigmaUrls.length > 0 && (
              <div className="recent-urls">
                {recentFigmaUrls.slice(0, 5).map((u) => (
                  <button
                    key={u}
                    type="button"
                    className="recent-chip"
                    title={u}
                    onClick={() => setInput('figma_url', u)}
                  >
                    {u}
                  </button>
                ))}
              </div>
            )}
            {errors?.figma && <div className="field-error">⚠ {errors.figma}</div>}

            {/* Which saved Figma token to use for this audit. */}
            <div className="input-group" style={{ marginTop: 12 }}>
              <div className="input-label">🔑 Figma project token</div>
              {figmaProjects.projects.length === 0 ? (
                <div className="file-name-hint">
                  No project tokens saved. Add one in{' '}
                  <strong>⚙ Settings → Figma Project Tokens</strong> (or set{' '}
                  <code>FIGMA_TOKEN</code> in <code>backend/.env</code>).
                </div>
              ) : (
                <select
                  className="input-field"
                  value={inputs.figmaProject || ''}
                  onChange={(e) => setInput('figmaProject', e.target.value)}
                >
                  <option value="">
                    Active default
                    {(() => {
                      const a = figmaProjects.projects.find((p) => p.id === figmaProjects.activeId)
                      return a ? ` (${a.name})` : ''
                    })()}
                  </option>
                  {figmaProjects.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.tokenHint}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}
      </div>

      {/* AI model — optional per-audit pick from the models the admin permitted.
          Leaving it on the default uses the admin's active model. */}
      {aiModels.profiles.length > 0 && (
        <div className="card">
          <div className="input-group">
            <div className="input-label">🤖 AI model</div>
            <select
              className="input-field"
              value={inputs.aiModelId || ''}
              onChange={(e) => setInput('aiModelId', e.target.value)}
            >
              <option value="">
                Recommended default
                {(() => {
                  const a = aiModels.profiles.find((p) => p.id === aiModels.activeId)
                  return a ? ` (${a.label})` : ''
                })()}
              </option>
              {aiModels.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} — {p.model}
                </option>
              ))}
            </select>
            <div className="file-name-hint">
              Applies to this audit only. Leave on the default to use the admin’s active model.
            </div>
          </div>
        </div>
      )}

      {/* Page sections — optional. Scan the page and pick which sections to test;
          unticked sections are skipped entirely in the audit + report. */}
      <div className="card">
        <div className="cbx-head-row">
          <div className="section-label" style={{ margin: 0 }}>
            Page Sections <span className="tag">optional</span>
          </div>
          {scanned.length > 0 && (
            <span
              className="all-toggle"
              style={{ color: accent }}
              onClick={() => setInput('sections', allSectionsOn ? [] : scanned.map((s) => s.name))}
            >
              {allSectionsOn ? 'Deselect all' : 'Select all'}
            </span>
          )}
        </div>
        <div className="file-name-hint" style={{ marginBottom: 10 }}>
          Scan the page and choose which sections to test. Leave empty to test the whole page.
        </div>
        <button
          type="button"
          className="ghost-btn"
          disabled={scanning || !inputs.website_url.trim() || !!errors?.website}
          onClick={scanSections}
          style={{ padding: '8px 14px', fontSize: 12 }}
        >
          {scanning
            ? '⏳ Scanning…'
            : scanned.length
              ? '↻ Re-scan sections'
              : '🔍 Scan page sections'}
        </button>
        {scanErr && (
          <div className="field-error" style={{ marginTop: 8 }}>
            ⚠ {scanErr}
          </div>
        )}
        {scanned.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {scanned.map((s) => (
              <div key={s.index} className="cbx-item" onClick={() => toggleSection(s.name)}>
                <Checkbox checked={selectedSections.includes(s.name)} accent={accent} />
                <span className={`cbx-label ${selectedSections.includes(s.name) ? 'checked' : ''}`}>
                  {s.name} <span className="badge tag">{s.tag}</span>
                  {s.counts && (
                    <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 6 }}>
                      {s.counts.links ?? 0} links · {s.counts.images ?? 0} img ·{' '}
                      {s.counts.headings ?? 0} headings
                    </span>
                  )}
                </span>
              </div>
            ))}
            <div className="cbx-summary">
              {selectedSections.length === 0
                ? 'No sections selected — the whole page will be tested.'
                : `✓ ${selectedSections.length} of ${scanned.length} sections selected`}
            </div>
          </div>
        )}
      </div>

      {/* Checkbox groups */}
      <div className="card">
        <div className="cbx-head-row">
          <div className="section-label" style={{ margin: 0 }}>
            03 — Select Checks
          </div>
          <label className="cbx-all" onClick={() => setAllChecks?.(!allSelected)}>
            <Checkbox checked={allSelected} accent={accent} />
            <span style={{ color: accent }}>{allSelected ? 'Deselect all' : 'Select all'}</span>
          </label>
        </div>
        <div className="cbx-groups">
          {mod.checkboxGroups.map((g) => {
            const boxes = g.items.filter(isCheckbox)
            const allOn = boxes.length > 0 && boxes.every((i) => checkState[i.id])
            return (
              <div key={g.group}>
                <div className="cbx-group-head">
                  <div className="cbx-group-title">{g.group}</div>
                  {boxes.length > 0 && (
                    <span
                      className="all-toggle"
                      style={{ color: accent }}
                      onClick={() => toggleAll(g, !allOn)}
                    >
                      {allOn ? 'Deselect all' : 'Select all'}
                    </span>
                  )}
                </div>
                {g.items.map((item) =>
                  isCheckbox(item) ? (
                    <div key={item.id} className="cbx-item" onClick={() => toggleCheck(item.id)}>
                      <Checkbox checked={!!checkState[item.id]} accent={accent} />
                      <span className={`cbx-label ${checkState[item.id] ? 'checked' : ''}`}>
                        {item.label}
                        {item.custom && <span className="cbx-custom-tag">custom</span>}
                      </span>
                    </div>
                  ) : (
                    <div key={item.id} className="cbx-item dropdown-item">
                      <span className="cbx-label">
                        {item.label}
                        {item.custom && <span className="cbx-custom-tag">custom</span>}
                      </span>
                      <select
                        className="history-filter"
                        value={checkState[item.id] || ''}
                        onChange={(e) => setCheckValue(item.id, e.target.value)}
                        style={{ marginLeft: 'auto' }}
                      >
                        <option value="">— none —</option>
                        {(item.options || []).map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>
                  ),
                )}
              </div>
            )
          })}
        </div>

        <div className="cbx-summary">
          ✓ {selectedCount} {selectedCount === 1 ? 'check' : 'checks'} selected · Claude will focus
          the audit on these
        </div>
      </div>

      <div className="row-end">
        <button className="ghost-btn" onClick={onBack}>
          ← Back
        </button>
        <button
          className="run-btn"
          disabled={!canRun}
          onClick={onRun}
          style={
            canRun ? { background: `linear-gradient(135deg, ${accent}, ${accent}BB)` } : undefined
          }
        >
          ▶ Run Audit
        </button>
      </div>
    </div>
  )
}
