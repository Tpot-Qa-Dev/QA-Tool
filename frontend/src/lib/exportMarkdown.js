// ─────────────────────────────────────────────────────────────────────────────
//  lib/exportMarkdown.js
//  Per-module Markdown export (Phase 3). Produces ONE .md file per audit module,
//  structured  Module → Section → Check, with screenshots saved as separate
//  .png files inside a ZIP and linked from the markdown. Strictly scoped:
//   • only the checks the user checked  (the audit only tested those)
//   • only the page sections that were scanned  (Phase 2 will let the user pick)
//   • each section shows only the aspects mapped to the checked checks
//  No mixing across modules — each file holds one module's data only.
// ─────────────────────────────────────────────────────────────────────────────
import JSZip from 'jszip'

// Filesystem-safe slug for file names.
const slug = (s) => String(s || 'report')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'report'

// Strip characters that would break markdown image alt text.
const altText = (s) => String(s || '').replace(/[[\]\r\n]/g, ' ').trim()

// Which measured aspects to show per section, from the checked checks — mirrors
// the in-app logic so the markdown matches the screen. No clear match → show all.
function aspectsForChecks(checks = []) {
  const has = (...kw) => checks.some(c => kw.some(k => c.toLowerCase().includes(k)))
  const show = {
    typography: has('typograph', 'font', 'heading', 'text', 'body'),
    colors:     has('color', 'colour', 'background'),
    spacing:    has('spacing', 'padding', 'margin'),
    layout:     has('layout', 'grid', 'align', 'respons', 'column'),
  }
  return Object.values(show).some(Boolean) ? show : { typography: true, colors: true, spacing: true, layout: true }
}

// Every finding (per-module + critical issues), worst-first.
const SEV_RANK = { critical: 0, p0: 0, high: 1, p1: 2, medium: 2, p2: 3, low: 4 }
function collectFindings(report) {
  const out = []
  for (const m of Object.values(report?.modules || {})) {
    for (const f of (m.findings || [])) out.push(f)
  }
  for (const c of (report?.criticalIssues || [])) out.push({ ...c, severity: c.severity || c.priority })
  return out.sort((a, b) =>
    (SEV_RANK[String(a.severity || a.priority).toLowerCase()] ?? 2) -
    (SEV_RANK[String(b.severity || b.priority).toLowerCase()] ?? 2))
}

// Build the markdown body + the list of images to embed for ONE module's report.
// Returns { md, images: [{ path, base64 }] }.
export function buildModuleMarkdown(report, moduleLabel) {
  const images = []
  const checks = report.checks || []
  const lines = []
  const L = (s = '') => lines.push(s)

  // ── Header ────────────────────────────────────────────────────────────────
  L(`# ${moduleLabel} — QA Report`)
  L()
  L(`- **URL:** ${report.url || '—'}`)
  L(`- **Generated:** ${new Date(report.generatedAt || Date.now()).toLocaleString()}`)
  if (report.environment) {
    const env = report.environment
    L(`- **Environment:** ${env.environment}${env.isProduction ? ' (live production)' : ' — not live, reviewed as pre-launch'}`)
  }
  L(`- **Score:** ${report.overallScore ?? '—'}/100 (grade ${report.grade || '—'})`)
  if (checks.length) L(`- **Checks tested:** ${checks.join(', ')}`)
  L()
  if (report.headline) { L(`> ${report.headline}`); L() }

  // ── Findings & Fixes (page-wide problems; scoped to checked checks already) ─
  const findings = collectFindings(report)
  if (findings.length) {
    L(`## Findings & Fixes`)
    L()
    findings.forEach((f, i) => {
      const sev = String(f.severity || f.priority || 'medium').toUpperCase()
      L(`### [${sev}] ${f.issue || 'Issue'}`)
      L()
      if (f.problem) { L(`**Problem:** ${f.problem}`); L() }
      const sol = f.solution || f.fix
      if (sol) { L(`**Solution:** ${sol}`); L() }
      if (f.location) { L(`**Location:** ${f.location}`); L() }
      const curCode = f.codeProblem || f.codeActual
      if (curCode) { L('**Current code:**'); L('```html'); L(curCode); L('```'); L() }
      if (f.codeFix) { L('**Fixed code:**'); L('```html'); L(f.codeFix); L('```'); L() }
      if (f.shot) {
        const path = `images/finding-${i + 1}.png`
        images.push({ path, base64: f.shot })
        L(`![${altText(f.issue) || 'evidence'}](${path})`)
        L(`*▲ Highlighted: the element this issue refers to.*`)
        L()
      }
    })
  }

  // ── Section-by-Section (only the aspects for the checked checks) ────────────
  if (report.sections?.length) {
    const show = aspectsForChecks(checks)
    L(`## Section-by-Section`)
    L()
    report.sections.forEach((s, i) => {
      const m = s.measured || {}
      const c = s.counts || {}
      L(`### ${i + 1}. ${s.name || 'Section'} \`${s.tag || ''}\``)
      L()
      if (s.screenshot) {
        const path = `images/section-${i + 1}.png`
        images.push({ path, base64: s.screenshot })
        L(`![${altText(s.name) || 'section'}](${path})`)
        L()
      }
      if (s.measured) {
        if (show.typography) {
          L(`- **Heading:** ${m.headingFont} · ${m.headingSize} · weight ${m.headingWeight}`)
          L(`- **Body text:** ${m.bodyFont} · ${m.bodySize}`)
        }
        if (show.colors)  L(`- **Colors:** bg ${m.background} · text ${m.textColor}`)
        if (show.spacing) L(`- **Padding (Y):** ${m.paddingY}`)
        if (show.layout)  L(`- **Layout:** ${m.columns} · ${m.heightPx}px tall`)
        L(`- **Elements:** ${c.links ?? 0} links · ${c.buttons ?? 0} buttons · ${c.images ?? 0} images · ${c.headings ?? 0} headings${c.forms ? ` · ${c.forms} form` : ''}`)
      }
      L()
    })
  }

  // ── Positives / Next steps ──────────────────────────────────────────────────
  if (report.positives?.length) {
    L(`## What's Working`); L()
    report.positives.forEach(p => L(`- ${p}`)); L()
  }
  if (report.nextSteps?.length) {
    L(`## Recommended Next Steps`); L()
    report.nextSteps.forEach(s => L(`- ${s.step}${s.timeline ? ` _(${s.timeline})_` : ''}`)); L()
  }

  return { md: lines.join('\n'), images }
}

// Trigger a browser download for a Blob.
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// Export ONE module's report as a ZIP: <module>.md + images/*.png.
// (Phase 1 will pass an array of module reports → one .md each in the same ZIP.)
export async function exportMarkdownZip(report, moduleLabel, reportId) {
  const label = moduleLabel || report.module || 'Report'
  const { md, images } = buildModuleMarkdown(report, label)

  const zip = new JSZip()
  zip.file(`${slug(label)}.md`, md)
  for (const img of images) zip.file(img.path, img.base64, { base64: true })

  const blob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(blob, `qa-report-${slug(reportId || label)}.zip`)
}
