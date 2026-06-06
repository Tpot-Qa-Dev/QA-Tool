// ─────────────────────────────────────────────────────────────────────────────
//  components/SectionReport.jsx
//  Full-screen overlay: section-by-section live-web audit. Enter a URL, generate,
//  and see each page section side-by-side (Figma pane reserved until a token is
//  added) with a measured-aspects table + summary. Exportable as standalone HTML.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react'
import { runSectionReport } from '../api/client.js'
import { exportSectionHtml } from '../lib/exportReport.js'

const aspects = (s) => ([
  ['Background',   s.measured.background],
  ['Heading type', `${s.measured.headingFont} · ${s.measured.headingSize}`],
  ['Body type',    `${s.measured.bodyFont} · ${s.measured.bodySize}`],
  ['Layout',       s.measured.columns],
  ['Padding (Y)',  s.measured.paddingY],
  ['Elements',     `${s.counts.links} links · ${s.counts.buttons} btn · ${s.counts.images} img${s.counts.forms ? ` · ${s.counts.forms} form` : ''}`],
])

const VICON = { pass: '✓', warn: '!', fail: '✕' }
const vClass = { pass: 'b-pass', warn: 'b-warn', fail: 'b-fail' }

export default function SectionReport({ open, onClose, initialUrl = '', autoRun = false }) {
  const [url,     setUrl]     = useState(initialUrl)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [report,  setReport]  = useState(null)

  const generate = async (target) => {
    const u = (target ?? url).trim()
    if (!u) return
    setUrl(u)
    setLoading(true); setError(null); setReport(null)
    try {
      setReport(await runSectionReport(u))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // When opened (e.g. from a finished report), sync the URL and auto-generate.
  useEffect(() => {
    if (!open) return
    if (initialUrl) {
      setUrl(initialUrl)
      if (autoRun) generate(initialUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialUrl])

  if (!open) return null

  return (
    <div className="sec-overlay">
      <div className="sec-bar">
        <div className="sec-title">🧩 Section-by-Section — Live Web</div>
        <input
          className="input-field sec-url"
          type="url"
          placeholder="https://your-website.com"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') generate() }}
        />
        <button className="run-btn sec-go" disabled={loading || !url.trim()} onClick={() => generate()}>
          {loading ? 'Capturing…' : '▶ Generate'}
        </button>
        {report && (
          <button className="ghost-btn" onClick={() => exportSectionHtml(report)}>⬇ Export HTML</button>
        )}
        <button className="ghost-btn" onClick={onClose} style={{ marginLeft: 'auto' }}>✕ Close</button>
      </div>

      <div className="sec-body">
        {error && <div className="error-box" style={{ marginBottom: 16 }}>✗ {error}</div>}

        {!report && !loading && !error && (
          <div className="sec-empty">Enter a URL and press Generate to capture every section of the live page.</div>
        )}
        {loading && <div className="sec-empty">Launching browser and capturing sections… this can take ~20–40s.</div>}

        {report && (
          <>
            <div className="sec-note">
              ⚠ The <b>Figma (design)</b> column is reserved — add a <code>FIGMA_TOKEN</code> to render the design side
              and turn verdicts into real Same / Different comparisons. This shows the measured live-web side.
              <span style={{ color: 'var(--text-muted)' }}> · {report.sectionCount} sections · {report.url}</span>
            </div>

            {report.sections.map((s, i) => (
              <div className="sec-card" key={i}>
                <div className="sec-card-head">
                  <span className="sec-num">{i + 1}</span>
                  <span className="sec-name">{s.name}</span>
                  <span className="badge tag">{s.tag}</span>
                  {s.verdict && <span className={`badge ${vClass[s.verdict]}`}>{VICON[s.verdict]} {s.verdict}</span>}
                </div>

                <div className="sec-pair">
                  <figure className="sec-pane">
                    <figcaption>Figma (design)</figcaption>
                    <div className="sec-ph">Add FIGMA_TOKEN to show the design side</div>
                  </figure>
                  <figure className="sec-pane">
                    <figcaption>Web (live)</figcaption>
                    {s.screenshot
                      ? <img src={`data:${s.mimeType || 'image/png'};base64,${s.screenshot}`} alt={s.name} />
                      : <div className="sec-ph">No screenshot</div>}
                  </figure>
                </div>

                {s.checks?.length > 0 && (
                  <ul className="sec-checks">
                    {s.checks.map((c, k) => (
                      <li key={k} className={`sec-check ${c.status}`}>
                        <span className="sec-check-icon">{VICON[c.status] || '•'}</span>
                        <span className="sec-check-label">{c.label}</span>
                        <span className="sec-check-detail">{c.detail}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <details className="custom-export">
                  <summary>Measured styles (Web vs Figma)</summary>
                  <table className="sec-table">
                    <thead><tr><th>Aspect</th><th>Figma (design intent)</th><th>Web (computed)</th></tr></thead>
                    <tbody>
                      {aspects(s).map(([k, v]) => (
                        <tr key={k}>
                          <td>{k}</td>
                          <td className="dim">— <span className="muted">(add token)</span></td>
                          <td>{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </div>
            ))}

            <div className="sec-card">
              <div className="sec-card-head">
                <span className="sec-name">Summary</span>
                {['fail', 'warn', 'pass'].map(v => {
                  const n = report.sections.filter(s => s.verdict === v).length
                  return n > 0 ? <span key={v} className={`badge ${vClass[v]}`}>{VICON[v]} {n} {v}</span> : null
                })}
              </div>
              <table className="sec-table">
                <thead><tr><th>Section</th><th>Verdict</th><th>Issues</th></tr></thead>
                <tbody>
                  {report.sections.map((s, i) => {
                    const issues = (s.checks || []).filter(c => c.status !== 'pass')
                    return (
                      <tr key={i}>
                        <td>{i + 1} — {s.name}</td>
                        <td><span className={`badge ${vClass[s.verdict]}`}>{VICON[s.verdict]} {s.verdict}</span></td>
                        <td>{issues.length ? issues.map(c => c.label).join(', ') : <span className="muted">none</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
