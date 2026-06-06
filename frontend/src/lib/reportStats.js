// ─────────────────────────────────────────────────────────────────────────────
//  lib/reportStats.js
//  Turns the backend's structured report into a flat list of result rows and
//  pass / warn / fail tallies for the report screen and exports.
// ─────────────────────────────────────────────────────────────────────────────

// Flatten a report into result rows: { label, message, status, detail }.
export function toResultItems(report) {
  if (!report) return []
  const items = []

  if (report.modules) {
    for (const [name, m] of Object.entries(report.modules)) {
      items.push({
        label:   name,
        message: m.summary || `Module score ${m.score ?? '—'}/100`,
        status:  m.status || 'warn',
        detail:  `score ${m.score ?? '—'}/100`,
      })
    }
  }

  for (const c of report.criticalIssues || []) {
    items.push({
      label:   c.issue,
      message: c.fix || '',
      status:  c.priority === 'P0' ? 'fail' : 'warn',
      detail:  [c.priority, c.owner].filter(Boolean).join(' · '),
    })
  }

  for (const p of report.positives || []) {
    items.push({ label: 'Working well', message: p, status: 'pass', detail: '' })
  }

  return items
}

// Sort order for result rows — failures first, passes last.
const ORDER = { fail: 0, warn: 1, pass: 2 }
export const sortByStatus = (items) =>
  [...items].sort((a, b) => (ORDER[a.status] ?? 1) - (ORDER[b.status] ?? 1))

// Pass / warn / fail counts and an overall score for a report.
export function reportStats(report) {
  const items = toResultItems(report)
  return {
    items,
    pass:  items.filter(i => i.status === 'pass').length,
    warn:  items.filter(i => i.status === 'warn').length,
    fail:  items.filter(i => i.status === 'fail').length,
    score: typeof report?.overallScore === 'number' ? report.overallScore : 0,
  }
}
