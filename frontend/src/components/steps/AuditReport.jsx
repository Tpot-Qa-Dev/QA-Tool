// ─────────────────────────────────────────────────────────────────────────────
//  components/steps/AuditReport.jsx
//  Wizard step 4 — the finished audit report: summary, results, exports.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { COLORS, scoreColor } from '../../lib/colors.js'
import { reportStats, sortByStatus } from '../../lib/reportStats.js'
import {
  exportHtmlReport, exportPdfReport, exportJsonReport, exportCsvReport, copyReportSummary,
  reportSections, exportHtmlReportSelective,
} from '../../lib/exportReport.js'
import { exportMarkdownZip } from '../../lib/exportMarkdown.js'
import { saveHistoryReport } from '../../api/client.js'

const ICON   = { pass: '✓', warn: '!', fail: '✕' }
const HUE    = { pass: COLORS.pass, warn: COLORS.warn, fail: COLORS.fail }

const VICON  = { pass: '✓', warn: '!', fail: '✕' }
const VCLASS = { pass: 'b-pass', warn: 'b-warn', fail: 'b-fail' }

// Decide which measured aspects to surface per section based on what the user
// ticked, so a Typography audit shows fonts, a Colors audit shows swatches, etc.
// Falls back to showing everything when no check clearly maps (or none ticked).
function aspectsForChecks(checks = []) {
  const has = (...kw) => checks.some(c => kw.some(k => c.toLowerCase().includes(k)))
  const show = {
    typography: has('typograph', 'font', 'heading', 'text', 'body'),
    colors:     has('color', 'colour', 'background'),
    spacing:    has('spacing', 'padding', 'margin'),
    layout:     has('layout', 'grid', 'align', 'respons', 'column'),
  }
  return Object.values(show).some(Boolean)
    ? show
    : { typography: true, colors: true, spacing: true, layout: true }
}

// One measured row: a label + freeform value content (string or JSX).
function MeasuredRow({ label, children }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '6px 0', borderTop: '1px solid var(--border)', fontSize: 12 }}>
      <span style={{ minWidth: 92, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
      <span style={{ flex: 1, color: 'var(--text-2)', fontFamily: 'JetBrains Mono, monospace' }}>{children}</span>
    </div>
  )
}

// A small colour chip: swatch + hex.
function Swatch({ hex, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 14 }}>
      <span style={{ width: 14, height: 14, borderRadius: 3, border: '1px solid var(--border)', background: hex, display: 'inline-block' }} />
      {label}: {hex}
    </span>
  )
}

// A labelled code snippet (mono, scrollable). Used to show the actual faulty
// code and the corrected code inside a finding.
function CodeBlock({ label, code, tone }) {
  const hue = tone === 'fail' ? COLORS.fail : tone === 'pass' ? COLORS.pass : 'var(--text-muted)'
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: hue, fontFamily: 'JetBrains Mono, monospace', marginBottom: 3 }}>{label}</div>
      <pre style={{
        margin: 0, padding: '8px 10px', background: 'var(--surface)', border: `1px solid var(--border)`,
        borderLeft: `3px solid ${hue}`, borderRadius: 6, fontSize: 11.5, lineHeight: 1.5,
        fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-2)', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>{code}</pre>
    </div>
  )
}

// Banner stating whether the audited site is live or still in development /
// staging — so the reader knows the report was framed as pre-launch.
const ENV_STYLE = {
  production:  { icon: '🟢', label: 'Live production site', hue: COLORS.pass },
  staging:     { icon: '🚧', label: 'Staging / pre-launch site', hue: COLORS.warn },
  development: { icon: '🛠️', label: 'Development site (work in progress)', hue: COLORS.warn },
  maintenance: { icon: '🚧', label: 'Maintenance / coming-soon site', hue: COLORS.warn },
}
function EnvBanner({ environment }) {
  if (!environment) return null
  const e = ENV_STYLE[environment.environment] || ENV_STYLE.production
  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', marginBottom: 16,
      borderRadius: 8, border: `1px solid color-mix(in srgb, ${e.hue} 40%, transparent)`,
      background: `color-mix(in srgb, ${e.hue} 12%, transparent)`,
    }}>
      <span style={{ fontSize: 18, lineHeight: 1 }}>{e.icon}</span>
      <div style={{ fontSize: 12, lineHeight: 1.5 }}>
        <div style={{ fontWeight: 700, color: e.hue }}>{e.label}</div>
        {!environment.isProduction && (
          <div style={{ color: 'var(--text-2)', marginTop: 2 }}>
            Reviewed as <strong>pre-launch</strong> — not marked down for noindex, missing analytics, or placeholder content.
          </div>
        )}
        {environment.signals?.length > 0 && (
          <div style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 11 }}>
            Signals: {environment.signals.map(s => s.signal).join(' · ')}
          </div>
        )}
      </div>
    </div>
  )
}

// Severity → colour. Covers finding severities and critical-issue priorities.
const SEV_HUE = {
  critical: COLORS.fail, high: COLORS.fail, p0: COLORS.fail,
  medium: COLORS.warn, p1: COLORS.warn,
  low: COLORS.pass, p2: COLORS.pass,
}

// One finding rendered as a click-to-open accordion: header shows severity +
// title; the body shows the problem, the fix, where it is, and — when present —
// a highlighted screenshot of the faulty element.
function FindingAccordion({ f }) {
  const sevRaw  = (f.severity || f.priority || 'medium')
  const hue     = SEV_HUE[String(sevRaw).toLowerCase()] || COLORS.warn
  const solution = f.solution || f.fix
  return (
    <details className="finding-acc" style={{ border: '1px solid var(--border)', borderLeft: `3px solid ${hue}`, borderRadius: 8, padding: '8px 12px', marginBottom: 8, background: 'var(--surface-2)' }}>
      <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, listStyle: 'none' }}>
        <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', padding: '2px 7px', borderRadius: 4, color: hue, background: `color-mix(in srgb, ${hue} 18%, transparent)`, whiteSpace: 'nowrap' }}>
          {String(sevRaw).toUpperCase()}
        </span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{f.issue}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>▾</span>
      </summary>
      <div style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.55 }}>
        {f.problem && (
          <p style={{ marginBottom: 8 }}>
            <strong style={{ color: 'var(--fail)' }}>Problem: </strong>
            <span style={{ color: 'var(--text-2)' }}>{f.problem}</span>
          </p>
        )}
        {solution && (
          <p style={{ marginBottom: 8 }}>
            <strong style={{ color: 'var(--pass)' }}>Solution: </strong>
            <span style={{ color: 'var(--text-2)' }}>{solution}</span>
          </p>
        )}
        {(f.codeProblem || f.codeActual) && (
          <CodeBlock label="✕ Current code" tone="fail" code={f.codeProblem || f.codeActual} />
        )}
        {f.codeFix && <CodeBlock label="✓ Fixed code" tone="pass" code={f.codeFix} />}
        {(f.location || f.owner) && (
          <p style={{ marginBottom: 8, fontSize: 11.5, color: 'var(--text-muted)' }}>
            {f.location && <>📍 {f.location}</>}{f.location && f.owner ? ' · ' : ''}{f.owner && <>👤 {f.owner}</>}
          </p>
        )}
        {f.shot && (
          <figure style={{ margin: '8px 0 0' }}>
            <img
              src={`data:${f.shotMime || 'image/png'};base64,${f.shot}`}
              alt={f.issue}
              style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, display: 'block' }}
            />
            <figcaption style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'JetBrains Mono, monospace' }}>
              ▲ highlighted: the element this issue refers to
            </figcaption>
          </figure>
        )}
      </div>
    </details>
  )
}

// Pull every finding out of the report (per module + critical issues) so they
// can be shown as one prioritised, collapsible list. Sorted worst-first.
const SEV_RANK = { critical: 0, p0: 0, high: 1, p1: 2, medium: 2, p2: 3, low: 4 }
function collectFindings(report) {
  const out = []
  for (const [name, m] of Object.entries(report?.modules || {})) {
    for (const f of (m.findings || [])) out.push({ ...f, module: name })
  }
  for (const c of (report?.criticalIssues || [])) {
    out.push({ ...c, severity: c.severity || c.priority, module: 'Critical' })
  }
  return out.sort((a, b) =>
    (SEV_RANK[String(a.severity || a.priority).toLowerCase()] ?? 2) -
    (SEV_RANK[String(b.severity || b.priority).toLowerCase()] ?? 2))
}

export default function AuditReport({ mod, report, error, url, reportId, onRerun, onReset, onHome }) {
  // Custom download filename (defaults to the report id).
  const [fileName, setFileName] = useState('')

  // "Save to Tool" state: idle | saving | saved | error. Persists the current
  // report into the tool's History (no file download).
  const [saveState, setSaveState] = useState('idle')
  const saveToTool = async () => {
    if (!reportId || saveState === 'saving') return
    setSaveState('saving')
    try {
      await saveHistoryReport(reportId, report)
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2500)
    } catch {
      setSaveState('error')
      setTimeout(() => setSaveState('idle'), 3000)
    }
  }
  const SAVE_LABEL = {
    idle:   '💾 Save to Tool',
    saving: '⏳ Saving…',
    saved:  '✓ Saved to History',
    error:  '✗ Save failed — retry',
  }

  // Selectable sections for the custom combined-HTML export (default: all on).
  const sections = report ? reportSections(report) : []
  const [picked, setPicked] = useState(() => new Set(sections.map(s => s.key)))
  const togglePick = (key) => setPicked(p => {
    const next = new Set(p)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  // ── Error / no-report state ────────────────────────────────────────────────
  if (error || !report) {
    return (
      <div className="fade-in">
        <div className="error-box">✗ {error || 'No report was produced.'}</div>
        <div className="row-end" style={{ justifyContent: 'flex-start' }}>
          <button className="ghost-btn" onClick={onRerun}>↩ Back to Configure</button>
          <button className="ghost-btn" onClick={onHome || onReset}>🏠 Main menu</button>
        </div>
      </div>
    )
  }

  const { items, pass, warn, fail, score } = reportStats(report)
  const sorted = sortByStatus(items)

  return (
    <div className="fade-in">
      {/* Summary header */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ fontSize: 24 }}>{mod?.icon}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{mod?.label} — Audit Complete</div>
            <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {url
                ? <a href={url} target="_blank" rel="noopener noreferrer"
                     style={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', textDecoration: 'none' }}>{url}</a>
                : <span style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>—</span>}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 30, fontWeight: 800, color: scoreColor(score) }}>{score}%</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>grade {report.grade || '—'}</div>
          </div>
        </div>

        {report.headline && (
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16, lineHeight: 1.5 }}>{report.headline}</div>
        )}

        <EnvBanner environment={report.environment} />

        {report.usage && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 16 }}>
            🔢 {report.usage.totalTokens?.toLocaleString()} tokens
            ({report.usage.inputTokens?.toLocaleString()} in · {report.usage.outputTokens?.toLocaleString()} out)
            · {report.usage.calls} Claude call{report.usage.calls === 1 ? '' : 's'}
          </div>
        )}

        <div className="results-summary">
          <div className="summary-card">
            <div className="summary-num" style={{ color: COLORS.pass }}>{pass}</div>
            <div className="summary-label">✅ Passed</div>
          </div>
          <div className="summary-card">
            <div className="summary-num" style={{ color: COLORS.warn }}>{warn}</div>
            <div className="summary-label">⚠️ Warnings</div>
          </div>
          <div className="summary-card">
            <div className="summary-num" style={{ color: COLORS.fail }}>{fail}</div>
            <div className="summary-label">❌ Failed</div>
          </div>
        </div>
      </div>

      {/* What was tested */}
      {report.checks?.length > 0 && (
        <div className="card">
          <div className="section-label">Checks Tested</div>
          <div className="recent-urls" style={{ marginTop: 0 }}>
            {report.checks.map((c, i) => <span key={i} className="recent-chip" style={{ cursor: 'default' }}>{c}</span>)}
          </div>
        </div>
      )}

      {/* Screenshots */}
      {report.screenshots?.length > 0 && (
        <div className="card">
          <div className="section-label">Screenshots</div>
          {report.screenshots.map((s, i) => (
            <figure key={i} style={{ margin: '0 0 14px' }}>
              <figcaption style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 6, wordBreak: 'break-all' }}>{s.url || `Screenshot ${i + 1}`}</figcaption>
              <img
                src={`data:${s.mimeType || 'image/png'};base64,${s.base64}`}
                alt={`Screenshot ${i + 1}`}
                style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, display: 'block' }}
              />
            </figure>
          ))}
        </div>
      )}

      {/* Section-by-section: screenshot + the measured data for the ticked checks */}
      {report.sections?.length > 0 && (() => {
        const show = aspectsForChecks(report.checks)
        return (
          <div className="card">
            <div className="section-label">Section-by-Section ({report.sections.length})</div>
            {report.sections.map((s, i) => {
              const m = s.measured || {}
              const c = s.counts || {}
              return (
                <div className="sec-card" key={i} style={{ background: 'var(--surface-2)' }}>
                  <div className="sec-card-head">
                    <span className="sec-num">{i + 1}</span>
                    <span className="sec-name">{s.name}</span>
                    <span className="badge tag">{s.tag}</span>
                  </div>
                  {s.screenshot && (
                    <img className="sec-shot" src={`data:${s.mimeType || 'image/png'};base64,${s.screenshot}`} alt={s.name} />
                  )}
                  {s.measured && (
                    <div style={{ marginTop: 10 }}>
                      {show.typography && (
                        <>
                          <MeasuredRow label="Heading">
                            {m.headingFont} · {m.headingSize} · weight {m.headingWeight}
                          </MeasuredRow>
                          <MeasuredRow label="Body text">
                            {m.bodyFont} · {m.bodySize}
                          </MeasuredRow>
                        </>
                      )}
                      {show.colors && (
                        <MeasuredRow label="Colors">
                          <Swatch hex={m.background} label="bg" />
                          <Swatch hex={m.textColor} label="text" />
                        </MeasuredRow>
                      )}
                      {show.spacing && (
                        <MeasuredRow label="Padding (Y)">{m.paddingY}</MeasuredRow>
                      )}
                      {show.layout && (
                        <MeasuredRow label="Layout">
                          {m.columns} · {m.heightPx}px tall
                        </MeasuredRow>
                      )}
                      <MeasuredRow label="Elements">
                        {c.links ?? 0} links · {c.buttons ?? 0} buttons · {c.images ?? 0} images · {c.headings ?? 0} headings{c.forms ? ` · ${c.forms} form` : ''}
                      </MeasuredRow>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* Findings & Fixes — every issue as a click-to-open accordion (problem +
          solution + highlighted screenshot of the faulty element). */}
      {(() => {
        const findings = collectFindings(report)
        if (!findings.length) return null
        const withShot = findings.filter(f => f.shot).length
        return (
          <div className="card">
            <div className="section-label">
              Findings &amp; Fixes ({findings.length}){withShot ? ` · ${withShot} with evidence` : ''}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
              Click a finding to see the problem, the fix, and a highlighted screenshot where available.
            </div>
            {findings.map((f, i) => <FindingAccordion key={i} f={f} />)}
          </div>
        )
      })()}

      {/* Results list */}
      <div className="card">
        <div className="section-label">Audit Results</div>
        {sorted.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Claude returned a summary without structured results — see Raw JSON below.
          </div>
        )}
        {sorted.map((r, i) => (
          <div key={i} className="result-item">
            <div className="status-icon" style={{ background: `color-mix(in srgb, ${HUE[r.status]} 20%, transparent)`, color: HUE[r.status] }}>
              {ICON[r.status]}
            </div>
            <div className="result-content">
              <div className="result-label">{r.label}</div>
              {r.message && <div className="result-msg">{r.message}</div>}
              {r.detail && <div className="result-detail">{r.detail}</div>}
            </div>
            <span className="result-badge" style={{
              background: `color-mix(in srgb, ${HUE[r.status]} 20%, transparent)`,
              color: HUE[r.status],
              border: `1px solid color-mix(in srgb, ${HUE[r.status]} 40%, transparent)`,
            }}>
              {r.status.toUpperCase()}
            </span>
          </div>
        ))}
      </div>

      {/* Next steps */}
      {report.nextSteps?.length > 0 && (
        <div className="card">
          <div className="section-label">Recommended Next Steps</div>
          {report.nextSteps.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
              <span style={{ color: 'var(--accent)' }}>→</span>
              <span style={{ flex: 1, color: 'var(--text-2)' }}>{s.step}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>{s.timeline}</span>
            </div>
          ))}
        </div>
      )}

      {/* Export & share */}
      <div className="card">
        <div className="section-label">Export &amp; Share Report</div>

        {/* Save the report INTO the tool (History) — no file download. */}
        <div className="report-actions" style={{ marginBottom: 14 }}>
          <button
            className="action-btn primary"
            onClick={saveToTool}
            disabled={!reportId || saveState === 'saving'}
            style={saveState === 'saved' ? { background: COLORS.pass, borderColor: COLORS.pass }
                 : saveState === 'error' ? { background: COLORS.fail, borderColor: COLORS.fail } : undefined}
          >
            {SAVE_LABEL[saveState]}
          </button>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>
            Keeps this report in the tool — find it later in History.
          </span>
        </div>

        <div className="divider" />

        <label className="file-name-row">
          <span>File name</span>
          <input
            className="input-field"
            type="text"
            placeholder={`qa-report-${reportId}`}
            value={fileName}
            onChange={e => setFileName(e.target.value)}
          />
          <span className="file-name-hint">.html / .csv / .json added automatically</span>
        </label>

        <div className="report-actions">
          <button className="action-btn primary" onClick={() => exportPdfReport(report, reportId, fileName)}>📄 Download PDF</button>
          <button className="action-btn" onClick={() => exportHtmlReport(report, reportId, fileName)}>🌐 Download HTML</button>
          <button className="action-btn" onClick={() => exportMarkdownZip(report, mod?.label, reportId)}>⬇ Markdown (.zip)</button>
          <button className="action-btn" onClick={() => exportCsvReport(report, reportId, fileName)}>📊 Export CSV</button>
          <button className="action-btn" onClick={() => exportJsonReport(report, reportId, fileName)}>{'{ }'} JSON Export</button>
          <button className="action-btn" onClick={() => copyReportSummary(report, reportId)}>🔗 Copy Summary</button>
        </div>

        {/* Build one HTML file from just the sections you want */}
        {sections.length > 0 && (
          <details className="custom-export" style={{ marginTop: 14 }}>
            <summary>🧩 Custom HTML — pick sections to include</summary>
            <div className="custom-export-body">
              <div className="custom-pick-list">
                {sections.map(s => (
                  <label key={s.key} className="custom-pick" title={s.label}>
                    <input type="checkbox" checked={picked.has(s.key)} onChange={() => togglePick(s.key)} />
                    <span>{s.label}</span>
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button className="history-btn" onClick={() => setPicked(new Set(sections.map(s => s.key)))}>Select all</button>
                <button className="history-btn" onClick={() => setPicked(new Set())}>Clear</button>
                <button className="action-btn primary" disabled={picked.size === 0}
                  onClick={() => exportHtmlReportSelective(report, reportId, [...picked])}>
                  ⬇ Download selected ({picked.size})
                </button>
              </div>
            </div>
          </details>
        )}

        <div className="divider" />

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="ghost-btn" onClick={onRerun}>↩ Re-run</button>
          <button className="ghost-btn" onClick={onReset}>+ New Audit</button>
          <button className="ghost-btn" onClick={onHome || onReset}>🏠 Main menu</button>
        </div>

        <details className="raw-details" style={{ marginTop: 18 }}>
          <summary>{'{ }'} View raw report JSON</summary>
          <pre>{JSON.stringify(report, null, 2)}</pre>
        </details>
      </div>

      {/* Allure hint */}
      <div className="hint-box">
        <span style={{ fontSize: 20 }}>💡</span>
        <div>
          <div style={{ color: 'var(--text)', fontWeight: 600, marginBottom: 4 }}>Allure Report Integration</div>
          Run <code>npx allure generate ./qa-results --clean</code> locally to turn the JSON export
          into a full Allure dashboard with screenshots, timelines, and trends.
        </div>
      </div>
    </div>
  )
}
