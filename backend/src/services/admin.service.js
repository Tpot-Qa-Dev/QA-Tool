// ─────────────────────────────────────────────────────────────────────────────
//  services/admin.service.js
//  Read-only aggregates for the Admin dashboard: how many reports, token spend,
//  per-module breakdown, and the actual prompts the agent uses in a test.
// ─────────────────────────────────────────────────────────────────────────────
import { getAllMetadata } from './history.service.js'
import { getUsage } from './usage.service.js'
import { getSettings } from './settings.service.js'
import { buildSystemPrompt, REPORT_SHAPE } from './prompts.js'
import { getActiveInstructions } from './promptConfig.service.js'

const round = (n) => Math.round(n)

// Aggregate stats across stored reports (from the lightweight index) plus
// cumulative token usage. Optional filters: `days` (only reports newer than N
// days) and `module`. Also returns chart data: grade & score distributions and
// a daily audit timeline.
export async function getOverview({ days, module } = {}) {
  const [all, usage] = await Promise.all([getAllMetadata(), getUsage()])

  const d = Number(days)
  const cutoff = Number.isFinite(d) && d > 0 ? Date.now() - d * 86_400_000 : null
  const rows = all.filter((r) => {
    if (module && r.module !== module) return false
    if (cutoff != null) {
      const t = Date.parse(r.generatedAt || '')
      if (!(Number.isFinite(t) && t >= cutoff)) return false
    }
    return true
  })

  // Per-module: count + average score.
  const byModuleMap = {}
  let scoreSum = 0,
    scoreCount = 0
  const totals = { pass: 0, warn: 0, fail: 0 }
  const gradeDist = {}
  const scoreBuckets = { '80–100': 0, '50–79': 0, '0–49': 0 }

  for (const r of rows) {
    const key = r.module || 'unknown'
    const m =
      byModuleMap[key] || (byModuleMap[key] = { module: key, count: 0, scoreSum: 0, scoreCount: 0 })
    m.count++
    if (typeof r.score === 'number') {
      m.scoreSum += r.score
      m.scoreCount++
      scoreSum += r.score
      scoreCount++
      scoreBuckets[r.score >= 80 ? '80–100' : r.score >= 50 ? '50–79' : '0–49']++
    }
    totals.pass += r.counts?.pass || 0
    totals.warn += r.counts?.warn || 0
    totals.fail += r.counts?.fail || 0
    const g = r.grade || '—'
    gradeDist[g] = (gradeDist[g] || 0) + 1
  }

  const byModule = Object.values(byModuleMap)
    .map((m) => ({
      module: m.module,
      count: m.count,
      avgScore: m.scoreCount ? round(m.scoreSum / m.scoreCount) : null,
    }))
    .sort((a, b) => b.count - a.count)

  // Daily audit count timeline (span = filter days, else 14; capped 90).
  const span = Math.min(Number.isFinite(d) && d > 0 ? d : 14, 90)
  const byDay = {}
  for (const r of rows) {
    const t = Date.parse(r.generatedAt || '')
    if (Number.isFinite(t)) {
      const k = new Date(t).toISOString().slice(0, 10)
      byDay[k] = (byDay[k] || 0) + 1
    }
  }
  const timeline = []
  const todayMs = Date.now()
  for (let i = span - 1; i >= 0; i--) {
    const k = new Date(todayMs - i * 86_400_000).toISOString().slice(0, 10)
    timeline.push({ date: k, count: byDay[k] || 0 })
  }

  return {
    reports: rows.length,
    avgScore: scoreCount ? round(scoreSum / scoreCount) : null,
    totals,
    byModule,
    gradeDist,
    scoreBuckets,
    timeline,
    usage,
    filter: { days: cutoff != null ? d : null, module: module || null },
    recent: rows.slice(0, 8).map((r) => ({
      id: r.id,
      url: r.url,
      module: r.module,
      score: r.score,
      grade: r.grade,
      generatedAt: r.generatedAt,
    })),
  }
}

// The prompts the agent actually uses, rendered so the operator can inspect
// exactly what is sent to Claude. Returns the standard + figma variants, a
// fully-rendered example (with checks + required tools + extra instructions),
// the user-message template, and the report JSON shape.
export async function getPrompts() {
  const settings = await getSettings()
  const extra = settings.audit.extraInstructions
  // Render with the active (possibly operator-edited) instructions so the
  // inspection shows exactly what the agent currently receives.
  const instructions = await getActiveInstructions()

  return {
    reportShape: REPORT_SHAPE,
    standard: buildSystemPrompt('generic', [], [], extra, null, instructions),
    figma: buildSystemPrompt('figma_vs_web', [], [], extra, null, instructions),
    example: buildSystemPrompt(
      'console_errors',
      ['JavaScript runtime errors', 'Network / Fetch failures'],
      ['playwright_console_errors'],
      extra,
      null,
      instructions,
    ),
    userMessageTemplate:
      'Please run a complete QA audit on this website: <url>\n' +
      'Figma design URL: <figmaUrl>        (only when provided)\n' +
      'Specific checks requested: <checks> (or "Run all relevant checks.")\n' +
      'Use the available Playwright tools to gather real browser data before analyzing.',
    extraInstructions: extra || '',
    model: settings.audit.model,
    temperature: settings.audit.temperature,
  }
}
