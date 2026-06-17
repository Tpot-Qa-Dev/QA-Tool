// ─────────────────────────────────────────────────────────────────────────────
//  lib/mergeReports.js
//  Combine several audit reports (different modules on the SAME site) into one
//  merged report object that renders/export exactly like a normal report.
// ─────────────────────────────────────────────────────────────────────────────
import { MODULES } from '../config/modules.js'

const MODULE_LABEL = Object.fromEntries(MODULES.map((m) => [m.id, m.label]))

const gradeFromScore = (n) => (n >= 90 ? 'A' : n >= 80 ? 'B' : n >= 65 ? 'C' : n >= 50 ? 'D' : 'F')

// Merge an array of full report objects into one. Returns the single report
// unchanged if only one is given, or null if none are valid.
export function mergeReports(reports) {
  const valid = (reports || []).filter(Boolean)
  if (valid.length === 0) return null
  if (valid.length === 1) return valid[0]

  const merged = {
    merged: true,
    mergedFrom: valid.map((r) => ({ id: r.id, module: r.module })),
    id: `MERGE-${Date.now().toString(36).toUpperCase()}`,
    url: valid[0].url || '',
    module: 'multi',
    generatedAt: new Date().toISOString(),
    modules: {},
    criticalIssues: [],
    positives: [],
    nextSteps: [],
    checks: [],
    sections: [],
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, calls: 0 },
  }

  const scores = []
  for (const r of valid) {
    const label = MODULE_LABEL[r.module] || r.module || 'Audit'

    // Merge each module block; on key collision, namespace by module label.
    for (const [k, v] of Object.entries(r.modules || {})) {
      const key = merged.modules[k] ? `${label} — ${k}` : k
      merged.modules[key] = v
    }

    merged.criticalIssues.push(...(r.criticalIssues || []))
    merged.positives.push(...(r.positives || []))
    merged.nextSteps.push(...(r.nextSteps || []))
    for (const c of r.checks || []) if (!merged.checks.includes(c)) merged.checks.push(c)

    // Sections are per-URL (same for every module on one site) — keep the first
    // non-empty set rather than duplicating screenshots across modules.
    if (!merged.sections.length && r.sections?.length) {
      merged.sections = r.sections
      merged.sectionCount = r.sectionCount
    }

    if (typeof r.overallScore === 'number') scores.push(r.overallScore)
    if (r.usage) {
      merged.usage.inputTokens += r.usage.inputTokens || 0
      merged.usage.outputTokens += r.usage.outputTokens || 0
      merged.usage.totalTokens +=
        r.usage.totalTokens || (r.usage.inputTokens || 0) + (r.usage.outputTokens || 0)
      merged.usage.calls += r.usage.calls || 0
    }
  }

  merged.overallScore = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0
  merged.grade = gradeFromScore(merged.overallScore)
  const modNames = valid.map((r) => MODULE_LABEL[r.module] || r.module).filter(Boolean)
  merged.headline = `Merged report — ${valid.length} audits (${modNames.join(', ')}) on ${merged.url}`

  return merged
}

// How many distinct URLs are in a set of reports (to warn before merging across
// different sites).
export function distinctUrls(reports) {
  return [...new Set((reports || []).filter(Boolean).map((r) => r.url || ''))]
}
