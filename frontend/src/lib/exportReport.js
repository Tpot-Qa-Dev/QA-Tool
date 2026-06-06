// ─────────────────────────────────────────────────────────────────────────────
//  lib/exportReport.js
//  Client-side report export helpers — HTML, CSV, JSON, and clipboard summary.
// ─────────────────────────────────────────────────────────────────────────────
import { toResultItems, reportStats } from './reportStats.js'

// The exported HTML is a standalone dark-themed file, so it uses literal hex.
const scoreHex = (n) => (n >= 80 ? '#00FF94' : n >= 50 ? '#FF9F43' : '#FF4560')
const STATUS_CLASS = { pass: 'pass', warn: 'warn', fail: 'fail' }

// Trigger a browser download for the given Blob.
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Build a safe download filename: prefer the user's custom name, else default.
// Strips any path/illegal chars and the given extension (re-added by caller).
function buildName(custom, fallback, ext) {
  let base = (custom && custom.trim() ? custom.trim() : fallback)
    .replace(new RegExp(`\\.${ext}$`, 'i'), '')   // drop extension if typed
    .replace(/[^A-Za-z0-9 ._-]+/g, '-')            // strip illegal chars
    .replace(/\s+/g, '-')
    .slice(0, 80) || fallback
  return `${base}.${ext}`
}

// Escape a value for safe inclusion in a CSV cell.
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`

// Escape a value for safe inclusion in HTML text/attributes.
const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

const SEV_CLASS = {
  critical: 'fail', high: 'fail', p0: 'fail',
  medium: 'warn', p1: 'warn',
  low: 'pass', p2: 'pass',
}

// ── Selectable report sections ────────────────────────────────────────────────
// Enumerate the sections a report can be exported with, so the UI can let the
// user choose which ones go into a single combined HTML file.
export function reportSections(report) {
  if (!report) return []
  const secs = []
  if (report.checks?.length)      secs.push({ key: 'checks',      label: 'Checks Tested', kind: 'special' })
  if (report.screenshots?.length) secs.push({ key: 'screenshots', label: 'Screenshots',   kind: 'special' })
  for (const name of Object.keys(report.modules || {})) {
    secs.push({ key: `module:${name}`, label: name, kind: 'module' })
  }
  if (report.criticalIssues?.length) secs.push({ key: 'criticalIssues', label: 'Critical Issues', kind: 'list' })
  if (report.positives?.length)      secs.push({ key: 'positives',      label: 'What’s Working', kind: 'list' })
  if (report.nextSteps?.length)      secs.push({ key: 'nextSteps',      label: 'Next Steps',    kind: 'list' })
  return secs
}

// ── Section renderers ─────────────────────────────────────────────────────────
// Each module: what was tested (summary) + a findings table (the problems +
// their severity and fix).
// One finding rendered fully expanded (problem + solution + location + the
// highlighted screenshot). Used in exports so the delivered HTML/PDF shows
// everything — no collapsed <details> (which print empty in a PDF).
function findingHtml(f) {
  const sev = (f.severity || f.priority || 'medium')
  const sol = f.solution || f.fix
  const codeProblem = f.codeProblem || f.codeActual
  return `<div class="finding">
    <div class="finding-head">
      <span class="badge ${SEV_CLASS[String(sev).toLowerCase()] || 'warn'}">${esc(String(sev).toUpperCase())}</span>
      <strong>${esc(f.issue)}</strong>
    </div>
    ${f.problem ? `<p class="finding-line"><b style="color:#FF4560">Problem:</b> ${esc(f.problem)}</p>` : ''}
    ${sol ? `<p class="finding-line"><b style="color:#00FF94">Solution:</b> ${esc(sol)}</p>` : ''}
    ${codeProblem ? `<div class="code-label fail">✕ Current code</div><pre class="code-block fail">${esc(codeProblem)}</pre>` : ''}
    ${f.codeFix ? `<div class="code-label pass">✓ Fixed code</div><pre class="code-block pass">${esc(f.codeFix)}</pre>` : ''}
    ${(f.location || f.owner) ? `<p class="finding-meta">${f.location ? `📍 ${esc(f.location)}` : ''}${f.location && f.owner ? ' · ' : ''}${f.owner ? `👤 ${esc(f.owner)}` : ''}</p>` : ''}
    ${f.shot ? `<figure class="finding-shot"><img src="data:${esc(f.shotMime || 'image/png')};base64,${f.shot}" alt="${esc(f.issue)}" /><figcaption>▲ highlighted: the element this issue refers to</figcaption></figure>` : ''}
  </div>`
}

function moduleBlock(name, m) {
  const findings = (m.findings || []).map(findingHtml).join('')
  return `<section class="block">
    <h2>${esc(name)} <span class="badge ${STATUS_CLASS[m.status] || 'warn'}">${esc((m.status || '').toUpperCase())}</span>
      <span class="score">${m.score ?? '—'}/100</span></h2>
    ${m.summary ? `<p class="sum-text">${esc(m.summary)}</p>` : ''}
    ${findings || '<p class="sum-text">No problems found.</p>'}
  </section>`
}

function listBlock(report, key) {
  if (key === 'criticalIssues') {
    const rows = report.criticalIssues.map(findingHtml).join('')
    return `<section class="block"><h2>Critical Issues</h2>${rows}</section>`
  }
  if (key === 'positives') {
    const rows = report.positives.map(p => `<li>✅ ${esc(p)}</li>`).join('')
    return `<section class="block"><h2>What’s Working</h2><ul class="card-list">${rows}</ul></section>`
  }
  if (key === 'nextSteps') {
    const rows = report.nextSteps.map(s => `<li>→ ${esc(s.step)} ${s.timeline ? `<span class="owner">${esc(s.timeline)}</span>` : ''}</li>`).join('')
    return `<section class="block"><h2>Next Steps</h2><ul class="card-list">${rows}</ul></section>`
  }
  return ''
}

// What was tested — the checks the user requested.
function checksBlock(report) {
  if (!report.checks?.length) return ''
  const chips = report.checks.map(c => `<span class="chip">${esc(c)}</span>`).join('')
  return `<section class="block"><h2>Checks Tested</h2><div class="chips">${chips}</div></section>`
}

// Captured screenshot(s), embedded inline so the file is self-contained.
// base64 is a safe charset (no HTML-special chars) so it isn't escaped.
function screenshotsBlock(report) {
  if (!report.screenshots?.length) return ''
  const imgs = report.screenshots.map((s, i) => `<figure class="shot">
      <figcaption class="shot-cap">${esc(s.url || `Screenshot ${i + 1}`)}</figcaption>
      <img src="data:${esc(s.mimeType || 'image/png')};base64,${s.base64}" alt="Screenshot ${i + 1}" />
    </figure>`).join('')
  return `<section class="block"><h2>Screenshots</h2><div class="shots">${imgs}</div></section>`
}

function renderBlock(report, s) {
  if (s.kind === 'module')  return moduleBlock(s.label, report.modules[s.label])
  if (s.kind === 'list')    return listBlock(report, s.key)
  if (s.key === 'checks')   return checksBlock(report)
  if (s.key === 'screenshots') return screenshotsBlock(report)
  return ''
}

// Banner stating whether the audited site is live or still in development /
// staging, mirroring the in-app EnvBanner.
const ENV_LABEL = {
  production:  '🟢 Live production site',
  staging:     '🚧 Staging / pre-launch site',
  development: '🛠️ Development site (work in progress)',
  maintenance: '🚧 Maintenance / coming-soon site',
}
function envBannerHtml(environment) {
  if (!environment) return ''
  const live = environment.isProduction
  const label = ENV_LABEL[environment.environment] || ENV_LABEL.production
  const sig = environment.signals?.length ? `<span class="sig">Signals: ${esc(environment.signals.map(s => s.signal).join(' · '))}</span>` : ''
  const note = live ? '' : 'Reviewed as <b style="display:inline;color:inherit">pre-launch</b> — not marked down for noindex, missing analytics, or placeholder content.'
  return `<div class="env-banner ${live ? 'live' : 'dev'}"><div><b>${esc(label)}</b>${note ? `<span>${note}</span>` : ''}${sig}</div></div>`
}

// Shared <head> + summary scaffold so both exports look identical.
function renderDoc(report, reportId, blocks) {
  const { score, pass, warn, fail } = reportStats(report)
  const urlLink = report.url
    ? `<a href="${esc(report.url)}" target="_blank" rel="noopener noreferrer" style="color:#00E5FF">${esc(report.url)}</a>`
    : '—'
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>QA Report — ${esc(reportId)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;background:#0A0B0F;color:#E8ECF4;padding:40px 20px;max-width:900px;margin:0 auto;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  /* Keep cards/images whole across PDF page breaks and force colour printing. */
  @media print {
    body{padding:0 6px}
    .block,.sum-card,.shot,figure,tr,.finding,.finding-shot{break-inside:avoid;page-break-inside:avoid}
    h1,h2{break-after:avoid;page-break-after:avoid}
  }
  h1{font-size:24px;margin-bottom:6px}
  h2{font-size:16px;margin-bottom:10px;display:flex;align-items:center;gap:10px}
  .meta{font-size:12px;color:#6B7280;margin-bottom:28px;font-family:monospace;word-break:break-all}
  .summary{display:flex;gap:14px;margin-bottom:28px;flex-wrap:wrap}
  .sum-card{background:#13151C;border:1px solid #252836;border-radius:10px;padding:16px 24px}
  .sum-num{font-size:28px;font-weight:700}.sum-label{font-size:12px;color:#6B7280}
  .sum-text{color:#9CA3AF;font-size:13px;margin-bottom:12px;line-height:1.5}
  .block{background:#13151C;border:1px solid #252836;border-radius:10px;padding:20px;margin-bottom:18px}
  .score{font-size:12px;color:#6B7280;font-family:monospace;margin-left:auto}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th{background:#1A1D28;font-size:12px;color:#6B7280;text-align:left;padding:10px 14px}
  td{padding:10px 14px;font-size:13px;border-top:1px solid #1A1D28;vertical-align:top}
  .badge{font-size:11px;padding:3px 8px;border-radius:4px;font-family:monospace;white-space:nowrap}
  .pass{background:#00FF9422;color:#00FF94}.warn{background:#FF9F4322;color:#FF9F43}.fail{background:#FF456022;color:#FF4560}
  .card-list{list-style:none}.card-list li{padding:10px 0;border-top:1px solid #1A1D28;font-size:13px}
  .card-list li:first-child{border-top:none}
  .owner{font-size:11px;color:#6B7280;font-family:monospace;margin-left:6px}
  .fix{color:#9CA3AF;font-size:12px;margin-top:4px}
  .chips{display:flex;flex-wrap:wrap;gap:6px}
  .chip{background:#1A1D28;border:1px solid #252836;border-radius:12px;padding:4px 10px;font-size:12px;color:#9CA3AF}
  .shots{display:flex;flex-direction:column;gap:16px}
  .shot-cap{font-size:11px;color:#6B7280;font-family:monospace;margin-bottom:6px;word-break:break-all}
  .shot img{width:100%;border:1px solid #252836;border-radius:8px;display:block}
  .pair{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
  .pane{background:#0A0B0F;border:1px solid #252836;border-radius:8px;padding:8px}
  .pane-cap{font-size:11px;color:#6B7280;font-family:monospace;margin-bottom:6px}
  .pane img{width:100%;border-radius:5px;display:block}
  .pane-ph{display:flex;align-items:center;justify-content:center;min-height:120px;color:#3D4251;font-size:12px;text-align:center;border:1px dashed #252836;border-radius:5px}
  .checks{list-style:none;margin:6px 0 4px;display:flex;flex-direction:column;gap:5px}
  .chk{font-size:12px;display:flex;gap:8px;align-items:baseline;color:#9CA3AF}
  .chk-i{font-weight:700;width:14px;flex-shrink:0}
  .chk.pass .chk-i{color:#00FF94}.chk.warn .chk-i{color:#FF9F43}.chk.fail .chk-i{color:#FF4560}
  .chk b{color:#E8ECF4;font-weight:600}
  details summary{cursor:pointer;font-size:12px;color:#6B7280;margin-top:8px}
  .finding{border:1px solid #252836;border-left:3px solid #FF9F43;border-radius:8px;padding:12px 14px;margin-bottom:10px;background:#0F1117}
  .finding-head{display:flex;align-items:center;gap:10px;margin-bottom:8px}
  .finding-head strong{font-size:13px}
  .finding-line{font-size:12.5px;line-height:1.55;color:#9CA3AF;margin-bottom:6px}
  .finding-meta{font-size:11.5px;color:#6B7280;margin-bottom:6px}
  .finding-shot{margin:8px 0 0}
  .finding-shot img{width:100%;border:1px solid #252836;border-radius:8px;display:block}
  .finding-shot figcaption{font-size:10.5px;color:#6B7280;font-family:monospace;margin-top:4px}
  .code-label{font-size:10.5px;font-weight:700;font-family:monospace;margin:6px 0 3px}
  .code-label.fail{color:#FF4560}.code-label.pass{color:#00FF94}
  .code-block{margin:0 0 8px;padding:8px 10px;background:#0A0B0F;border:1px solid #252836;border-radius:6px;font-size:11.5px;line-height:1.5;font-family:monospace;color:#9CA3AF;white-space:pre-wrap;word-break:break-word;overflow-x:auto}
  .code-block.fail{border-left:3px solid #FF4560}.code-block.pass{border-left:3px solid #00FF94}
  .env-banner{display:flex;gap:10px;align-items:flex-start;padding:10px 14px;border-radius:8px;margin-bottom:22px;font-size:12.5px;line-height:1.5}
  .env-banner.live{border:1px solid #00FF9455;background:#00FF9412}
  .env-banner.dev{border:1px solid #FF9F4355;background:#FF9F4312}
  .env-banner b{display:block}
  .env-banner.live b{color:#00FF94}.env-banner.dev b{color:#FF9F43}
  .env-banner .sig{color:#6B7280;font-size:11px;margin-top:4px;font-family:monospace}
  footer{margin-top:36px;font-size:11px;color:#3D4251;font-family:monospace;text-align:center}
</style></head><body>
<h1>🔬 QA Automation Report</h1>
<div class="meta">Report ID: ${esc(reportId)} · Module: ${esc(report.module || '—')} · URL: ${urlLink} · ${esc(new Date(report.generatedAt || Date.now()).toLocaleString())}</div>
<div class="summary">
  <div class="sum-card"><div class="sum-num" style="color:${scoreHex(score)}">${score}%</div><div class="sum-label">Overall Score</div></div>
  <div class="sum-card"><div class="sum-num" style="color:#00FF94">${pass}</div><div class="sum-label">Passed</div></div>
  <div class="sum-card"><div class="sum-num" style="color:#FF9F43">${warn}</div><div class="sum-label">Warnings</div></div>
  <div class="sum-card"><div class="sum-num" style="color:#FF4560">${fail}</div><div class="sum-label">Failed</div></div>
</div>
${report.headline ? `<p class="sum-text" style="margin-bottom:24px">${esc(report.headline)}</p>` : ''}
${envBannerHtml(report.environment)}
${blocks || '<p class="sum-text">No content.</p>'}
<footer>Generated by QA Automation Tool v1.0 · ${esc(reportId)}</footer>
</body></html>`
}

// Build the full standalone report HTML (shared by the HTML and PDF exports):
// checks tested, screenshots, every module's findings, critical issues,
// positives, next steps, and the section-by-section breakdown.
function buildReportHtml(report, reportId) {
  let blocks = reportSections(report).map(s => renderBlock(report, s)).join('\n')
  if (report.sections?.length) {
    blocks += `\n<h2 style="margin:26px 0 14px">Section-by-Section (${report.sections.length})</h2>\n`
      + report.sections.map((s, i) => sectionCardHtml(s, i + 1, report.checks)).join('\n')
  }
  return renderDoc(report, reportId, blocks)
}

// ── Standalone HTML report (everything) ───────────────────────────────────────
export function exportHtmlReport(report, reportId, fileName) {
  downloadBlob(new Blob([buildReportHtml(report, reportId)], { type: 'text/html' }),
    buildName(fileName, `qa-report-${reportId}`, 'html'))
}

// ── PDF report ────────────────────────────────────────────────────────────────
// Renders the same styled HTML through the browser's print engine (crisp text +
// images, no extra libraries). The print dialog's "Save as PDF" produces the
// file; the document title seeds the default filename. Uses a hidden iframe so
// no popup is opened (popup blockers don't interfere).
export function exportPdfReport(report, reportId, fileName) {
  const name = buildName(fileName, `qa-report-${reportId}`, 'pdf').replace(/\.pdf$/i, '')
  const html = buildReportHtml(report, reportId)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(name)}</title>`)

  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(iframe)

  const win = iframe.contentWindow
  const doc = win.document
  doc.open(); doc.write(html); doc.close()

  // Wait until every screenshot (base64 <img>) has decoded, then print, so no
  // image is missing from the PDF. Falls back after a short timeout.
  const imgs = [...doc.images]
  const ready = Promise.all(imgs.map(img => img.complete
    ? Promise.resolve()
    : new Promise(res => { img.onload = img.onerror = res })))

  const print = () => {
    win.focus()
    win.print()
    // Remove the iframe after the dialog has had time to capture the content.
    setTimeout(() => iframe.remove(), 1000)
  }

  Promise.race([ready, new Promise(res => setTimeout(res, 4000))]).then(print)
}

// ── Selective HTML export ─────────────────────────────────────────────────────
// Build ONE standalone HTML file with only the sections the user picked.
export function exportHtmlReportSelective(report, reportId, selectedKeys) {
  const set = new Set(selectedKeys)
  const blocks = reportSections(report)
    .filter(s => set.has(s.key))
    .map(s => renderBlock(report, s))
    .join('\n')
  const body = blocks || '<p class="sum-text">No sections selected.</p>'
  downloadBlob(new Blob([renderDoc(report, reportId, body)], { type: 'text/html' }), `qa-report-${reportId}-custom.html`)
}

// ── Section-by-section live-web report (standalone HTML) ──────────────────────
// Renders the same side-by-side layout as the in-app view: per section, the
// Figma design pane (reserved until a token is added) next to the live-web
// screenshot, plus a measured-aspects table and a summary.
// Which measured aspects to surface, based on the ticked checks (mirrors the
// in-app AuditReport logic). No clear match (or no checks) → show everything.
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

// Measured rows for a section, filtered to the aspects the checks asked for.
const sectionAspects = (s, show) => {
  const m = s.measured, c = s.counts || {}
  const rows = []
  if (show.typography) {
    rows.push(['Heading', `${m.headingFont} · ${m.headingSize} · weight ${m.headingWeight}`])
    rows.push(['Body text', `${m.bodyFont} · ${m.bodySize}`])
  }
  if (show.colors)  rows.push(['Colors', `bg ${m.background} · text ${m.textColor}`])
  if (show.spacing) rows.push(['Padding (Y)', m.paddingY])
  if (show.layout)  rows.push(['Layout', `${m.columns} · ${m.heightPx}px tall`])
  rows.push(['Elements', `${c.links} links · ${c.buttons} btn · ${c.images} img · ${c.headings} headings${c.forms ? ` · ${c.forms} form` : ''}`])
  return rows
}

const VBADGE = { pass: 'pass', warn: 'warn', fail: 'fail' }
const VICON  = { pass: '✓', warn: '!', fail: '✕' }

function sectionCardHtml(s, n, checks) {
  // Only show the Figma side when there's an actual design to compare against.
  const hasFigma = !!s.figma
  const checkList = (s.checks || []).map(c => `<li class="chk ${VBADGE[c.status]}">
      <span class="chk-i">${VICON[c.status] || '•'}</span><b>${esc(c.label)}</b> — ${esc(c.detail)}</li>`).join('')
  const verdict = s.verdict ? `<span class="badge ${VBADGE[s.verdict]}">${VICON[s.verdict]} ${esc(s.verdict)}</span>` : ''
  const webImg = s.screenshot
    ? `<img src="data:${esc(s.mimeType || 'image/png')};base64,${s.screenshot}" alt="${esc(s.name)}" />`
    : '<div class="pane-ph">No screenshot</div>'

  // Visual: web-only (single pane) unless a Figma design is present.
  const visual = hasFigma
    ? `<div class="pair">
        <figure class="pane"><figcaption class="pane-cap">Figma (design)</figcaption>${s.figma}</figure>
        <figure class="pane"><figcaption class="pane-cap">Web (live)</figcaption>${webImg}</figure>
      </div>`
    : `<figure class="pane"><figcaption class="pane-cap">Web (live)</figcaption>${webImg}</figure>`

  // Measured table: shown directly (not collapsed) so the report is easy to
  // read. Only rendered when measured styles are present; filtered to the
  // aspects the ticked checks asked for. Drop the Figma column with no design.
  const hasMeasured = !!(s.measured && s.counts)
  const head = hasFigma
    ? `<tr><th>Aspect</th><th>Figma (design intent)</th><th>Web (computed)</th></tr>`
    : `<tr><th>Aspect</th><th>Web (computed)</th></tr>`
  const rows = hasMeasured ? sectionAspects(s, aspectsForChecks(checks)).map(([k, v]) => hasFigma
    ? `<tr><td>${esc(k)}</td><td class="dim">—</td><td>${esc(v)}</td></tr>`
    : `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('') : ''

  return `<section class="block">
    <h2>${n} — ${esc(s.name)} <span class="badge tag">${esc(s.tag)}</span> ${verdict}</h2>
    ${visual}
    ${checkList ? `<ul class="checks">${checkList}</ul>` : ''}
    ${hasMeasured ? `<table><thead>${head}</thead><tbody>${rows}</tbody></table>` : ''}
  </section>`
}

export function exportSectionHtml(report, reportId = report.url) {
  const blocks = (report.sections || []).map((s, i) => sectionCardHtml(s, i + 1)).join('\n')
  const summaryRows = (report.sections || []).map((s, i) => {
    const issues = (s.checks || []).filter(c => c.status !== 'pass').map(c => c.label)
    return `<tr>
      <td>${i + 1} — ${esc(s.name)}</td>
      <td><span class="badge ${VBADGE[s.verdict] || 'warn'}">${VICON[s.verdict] || ''} ${esc(s.verdict || '')}</span></td>
      <td>${issues.length ? esc(issues.join(', ')) : '<span class="muted">none</span>'}</td>
    </tr>`
  }).join('')
  const urlLink = report.url ? `<a href="${esc(report.url)}" target="_blank" rel="noopener noreferrer" style="color:#00E5FF">${esc(report.url)}</a>` : '—'

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Section-by-Section — ${esc(report.url || '')}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;background:#0A0B0F;color:#E8ECF4;padding:36px 20px;max-width:1100px;margin:0 auto}
  h1{font-size:22px;margin-bottom:6px}
  h2{font-size:15px;margin-bottom:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .meta{font-size:12px;color:#6B7280;margin-bottom:24px;font-family:monospace;word-break:break-all}
  .note{background:#1A1D28;border:1px solid #252836;border-radius:8px;padding:10px 14px;font-size:12px;color:#9CA3AF;margin-bottom:24px}
  .block{background:#13151C;border:1px solid #252836;border-radius:12px;padding:20px;margin-bottom:20px}
  .pair{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}
  .pane{background:#0A0B0F;border:1px solid #252836;border-radius:8px;padding:8px;min-height:80px}
  .pane-cap{font-size:11px;color:#6B7280;font-family:monospace;margin-bottom:6px}
  .pane img{width:100%;border-radius:5px;display:block}
  .pane-ph{display:flex;align-items:center;justify-content:center;min-height:120px;color:#3D4251;font-size:12px;text-align:center;border:1px dashed #252836;border-radius:5px}
  table{width:100%;border-collapse:collapse;margin-top:4px}
  th{background:#1A1D28;font-size:11px;color:#6B7280;text-align:left;padding:8px 12px}
  td{padding:8px 12px;font-size:12px;border-top:1px solid #1A1D28;vertical-align:top}
  td.dim{color:#3D4251}.muted{color:#3D4251}
  .badge{font-size:10px;padding:2px 7px;border-radius:4px;font-family:monospace;white-space:nowrap}
  .tag{background:#252836;color:#9CA3AF}
  .pass{background:#00FF9422;color:#00FF94}.warn{background:#FF9F4322;color:#FF9F43}.fail{background:#FF456022;color:#FF4560}
  .checks{list-style:none;margin:6px 0 4px;display:flex;flex-direction:column;gap:5px}
  .chk{font-size:12px;display:flex;gap:8px;align-items:baseline;color:#9CA3AF}
  .chk-i{font-weight:700;width:14px;flex-shrink:0}
  .chk.pass .chk-i{color:#00FF94}.chk.warn .chk-i{color:#FF9F43}.chk.fail .chk-i{color:#FF4560}
  .chk b{color:#E8ECF4;font-weight:600}
  details summary{cursor:pointer;font-size:12px;color:#6B7280;margin-top:8px}
  footer{margin-top:30px;font-size:11px;color:#3D4251;font-family:monospace;text-align:center}
</style></head><body>
<h1>🔬 Section-by-Section — Live Web QA</h1>
<div class="meta">URL: ${urlLink} · ${esc(report.sectionCount || (report.sections||[]).length)} sections · ${esc(new Date(report.generatedAt || Date.now()).toLocaleString())}</div>
<div class="note">Each section shows what's <b style="color:#00FF94">right</b> and <b style="color:#FF4560">wrong</b> from the live web. The <b>Figma (design)</b> column is reserved — add a <b>FIGMA_TOKEN</b> to render the design side and compare.</div>
${blocks || '<div class="note">No sections detected.</div>'}
<section class="block"><h2>Summary</h2>
  <table><thead><tr><th>Section</th><th>Verdict</th><th>Issues</th></tr></thead><tbody>${summaryRows}</tbody></table>
</section>
<footer>Generated by QA Automation Tool v1.0 · section-by-section (web)</footer>
</body></html>`

  downloadBlob(new Blob([html], { type: 'text/html' }), `section-report-${(reportId || 'web').replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.html`)
}

// ── CSV export ───────────────────────────────────────────────────────────────
export function exportCsvReport(report, reportId, fileName) {
  const items = toResultItems(report)
  const csv = ['Check,Status,Message,Detail']
    .concat(items.map(r => [r.label, r.status, r.message, r.detail].map(csvCell).join(',')))
    .join('\n')
  downloadBlob(new Blob([csv], { type: 'text/csv' }), buildName(fileName, `qa-report-${reportId}`, 'csv'))
}

// ── JSON export ──────────────────────────────────────────────────────────────
export function exportJsonReport(report, reportId, fileName) {
  const payload = JSON.stringify({ reportId, ...report }, null, 2)
  downloadBlob(new Blob([payload], { type: 'application/json' }), buildName(fileName, `qa-report-${reportId}`, 'json'))
}

// ── Clipboard summary ────────────────────────────────────────────────────────
export function copyReportSummary(report, reportId) {
  const { pass, warn, fail, score } = reportStats(report)
  return navigator.clipboard.writeText(
    `QA Report ${reportId}\n` +
    `Module: ${report.module || '—'}\n` +
    `URL: ${report.url || '—'}\n` +
    `Score: ${score}% · ✅ ${pass}  ⚠️ ${warn}  ❌ ${fail}\n` +
    `${report.headline || ''}`
  )
}
