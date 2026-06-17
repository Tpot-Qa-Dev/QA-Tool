// ─────────────────────────────────────────────────────────────────────────────
//  services/prompts.js
//  System-prompt construction for the audit agent. Kept separate so prompt
//  wording can evolve without touching orchestration logic.
// ─────────────────────────────────────────────────────────────────────────────

// The JSON shape Claude is asked to return as its final report.
// Each finding is written like a senior QA engineer's ticket: a clear problem
// statement, the real-world impact, a concrete fix, where it is, and — when a
// single element is at fault — a CSS selector so the tool can screenshot and
// highlight it. `selector` MUST be null unless a specific element is the issue.
export const REPORT_SHAPE = `{
  "overallScore": <0-100>,
  "grade": "A|B|C|D|F",
  "headline": "one-sentence executive summary",
  "modules": {
    "<module_name>": {
      "score": <0-100>,
      "status": "pass|warn|fail",
      "findings": [{
        "issue": "short title of the problem (max ~8 words)",
        "severity": "critical|high|medium|low",
        "problem": "precisely what is wrong AND why it matters (user/business impact)",
        "solution": "specific, actionable fix a developer can apply — code/attribute/value level when possible",
        "location": "where on the page (section name / human description of the element)",
        "selector": "a CSS selector matching the exact faulty element, or null if no single element is at fault",
        "textMatch": "a short snippet of the visible text on/near the faulty element (used to screenshot it if the selector misses), or null",
        "codeProblem": "the actual faulty code/markup as it is now (short HTML/CSS/JS snippet), or null if not code-specific",
        "codeFix": "the corrected code snippet showing how it should be written, or null"
      }],
      "summary": "string",
      "data": <raw tool result>
    }
  },
  "criticalIssues": [{
    "issue": "string", "priority": "P0|P1|P2", "owner": "Dev|Design|Marketing",
    "problem": "what is broken and its impact", "solution": "how to fix it",
    "location": "where", "selector": "CSS selector or null", "textMatch": "visible text near the element or null",
    "codeProblem": "the actual faulty code snippet, or null", "codeFix": "the corrected code snippet, or null"
  }],
  "positives": ["string"],
  "nextSteps": [{ "step": "string", "owner": "string", "timeline": "immediate|this-week|this-sprint" }]
}`

// Describe the detected site environment so Claude frames the report correctly:
// a live production site is held to public standards; a dev/staging/maintenance
// site is reviewed as pre-launch and not marked down for things that are normal
// before launch (noindex, missing analytics, placeholder content).
function buildEnvBlock(environment) {
  if (!environment) return ''
  if (environment.isProduction) {
    return `\nSite environment: LIVE PRODUCTION (no development/staging signals detected). Audit it as a public, live website and hold it to production standards.\n`
  }
  const sigs = (environment.signals || []).map((s) => `  • ${s.detail}`).join('\n')
  const env = String(environment.environment || 'staging').toUpperCase()
  return (
    `\nSite environment: ${env} — this is NOT a finished live website. Detected signals:\n${sigs}\n` +
    `Frame the report as a pre-launch / ${env.toLowerCase()} review:\n` +
    `- State clearly in the headline that this is a ${env.toLowerCase()} (not live) site.\n` +
    `- Do NOT mark it down as if it were live for things that are normal before launch (noindex/search blocking, missing analytics or tracking, placeholder copy/images, "coming soon"). List those as "before going live" items in nextSteps instead of failures.\n` +
    `- IGNORE transport security on a pre-launch site: do NOT report HTTP-instead-of-HTTPS, mixed-content (http:// assets on the page), "insecure resource", or SSL/TLS certificate warnings as findings or criticalIssues, and do NOT lower the score for them — staging/dev sites commonly run on HTTP and this is fixed when the site goes live behind HTTPS. At most add a single "serve over HTTPS before launch" note to nextSteps.\n` +
    `- Keep the score focused on REAL defects that are wrong regardless of launch status: broken functionality, JS/console errors, broken links, accessibility problems, and genuine security flaws (exposed secrets, injection) — but NOT HTTP/TLS/mixed-content.\n`
  )
}

// The EDITABLE part of the system prompt — the agent's persona and how it
// works. Operators can override this from Admin → Prompts (with version history
// + restore). The run context (requested checks, required tools, environment,
// extra instructions) and the JSON report contract (REPORT_SHAPE) are always
// appended by buildSystemPrompt() and are NOT editable, so a prompt edit can
// never break the structured report output.
export const DEFAULT_INSTRUCTIONS = `You are a Principal QA Engineer with 15+ years auditing production websites. You are meticulous, evidence-driven, and never guess. You have access to real Playwright browser tools running in a real Chromium browser. Use them to thoroughly test the given URL.

How a senior engineer works (follow this):
- Gather REAL data with the tools first. Every finding must be backed by tool evidence (a measured value, an error string, a count, a URL) — never assume.
- Be accurate and precise. Do NOT invent issues. If something passes, say so in "positives". A short, correct report beats a long, padded one.
- Quantify: cite exact numbers, selectors, colours (hex), sizes (px), URLs, and error messages from the tools.
- For every finding, write it like a ticket a developer can act on immediately:
  • problem = what is wrong AND the concrete user/business impact (not vague).
  • solution = the specific fix (attribute, CSS value, code change, config) — actionable, not "review this".
  • location = the section/element in plain words.
  • selector = a precise CSS selector for the ONE faulty element when a single element is at fault (so the tool can screenshot + highlight it); otherwise null. Prefer ids/stable classes; make it match exactly one element.
  • textMatch = a short, exact snippet of the VISIBLE text on or right next to that element (e.g. a button label, a heading, an error sentence). This is REQUIRED whenever the problem is visible on the page — it lets the tool screenshot the mistake even if the CSS selector is wrong. Use null only when the issue is genuinely not tied to anything visible (e.g. a console error with no on-page element).
  • EVERY finding about something a user can SEE on the page MUST have a selector and/or a textMatch so an evidence screenshot can be captured. Do not leave both null for a visible problem.
  • codeProblem + codeFix = when the fix is code-level, show the ACTUAL faulty snippet (codeProblem) and the corrected snippet (codeFix). Keep them short — just the relevant line(s) of HTML/CSS/JS. Use null for both when the issue isn't code-specific.
- Severity must reflect real impact: critical = broken/blocking, high = serious, medium = should fix, low = polish.`

// Build the system prompt for a given module and set of requested checks.
// `requiredTools` is the set of backend tools that must be called to satisfy
// the ticked checks — the agent loop enforces them, and they are spelled out
// here so Claude knows up front exactly what data it must gather.
// `instructions` is the editable persona/instructions block (defaults to the
// built-in DEFAULT_INSTRUCTIONS); the run context + REPORT_SHAPE below are
// always appended by code and cannot be edited away.
export function buildSystemPrompt(
  module,
  checks,
  requiredTools = [],
  extraInstructions = '',
  environment = null,
  instructions = '',
) {
  const persona = instructions && instructions.trim() ? instructions.trim() : DEFAULT_INSTRUCTIONS

  const requiredBlock = requiredTools.length
    ? `\nRequired tools — you MUST call EACH of these at least once before writing the report (each maps to a requested check):\n${requiredTools.map((t) => `- ${t}`).join('\n')}\n`
    : ''

  const extraBlock =
    extraInstructions && extraInstructions.trim()
      ? `\nAdditional instructions from the operator (follow these too):\n${extraInstructions.trim()}\n`
      : ''

  const envBlock = buildEnvBlock(environment)

  const dynamicRules =
    (checks.length
      ? '- ONLY test the checks listed above. Ignore everything else. Do not report on unchecked categories.\n'
      : '') +
    (requiredTools.length
      ? '- You MUST call every tool in the "Required tools" list above before producing the report. Do not finalize until each has run.\n'
      : '')

  const base = `${persona}

— Run context (added automatically each run) —
Checks requested: ${checks.join(', ') || '(run all relevant checks)'}
${requiredBlock}${envBlock}${extraBlock}${dynamicRules}
Return ONLY the final report as JSON with this exact structure (no prose around it):
${REPORT_SHAPE}`

  // Any module whose id mentions "figma" gets the design-comparison addendum.
  if (module && module.includes('figma')) {
    return (
      base +
      '\n\nFor Figma comparison: fetch both the Figma design and audit the web page metadata, then compare design tokens, colors, and typography.'
    )
  }
  return base
}
