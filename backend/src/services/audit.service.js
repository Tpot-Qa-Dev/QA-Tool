// ─────────────────────────────────────────────────────────────────────────────
//  services/audit.service.js
//  Core audit business logic: runs the Claude agentic loop, calling Playwright
//  tools until a final report is produced.
//
//  Transport-agnostic — it reports progress through an `emit(event, data)`
//  callback so it can be driven by SSE, websockets, tests, etc.
// ─────────────────────────────────────────────────────────────────────────────
import Anthropic from '@anthropic-ai/sdk'
import { config } from '../config/index.js'
import { TOOL_DEFINITIONS, executeTool } from '../tools/index.js'
import {
  auditWebSections,
  captureFindingHighlights,
  detectEnvironment,
} from '../tools/playwright.tools.js'
import { buildSystemPrompt } from './prompts.js'
import { saveReport } from './history.service.js'
import { getSettings } from './settings.service.js'
import { addUsage } from './usage.service.js'
import { resolveToken as resolveFigmaToken } from './figmaProjects.service.js'
import { getActiveInstructions } from './promptConfig.service.js'
import { getActiveProfile, getSelectableProfile } from './aiModels.service.js'
import { makeGeminiClient } from '../tools/geminiAdapter.js'
import { makeOpenRouterClient } from '../tools/openrouterAdapter.js'

const anthropic = new Anthropic({ apiKey: config.keys.claude })

// Fallback audit parameters — overridden per run by persisted settings.
const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 8192
const MAX_ITERATIONS = 12
// How many times we'll send Claude back to run still-missing required tools
// before giving up and finalizing anyway (avoids looping on a tool that keeps
// failing). Each nudge can still trigger several tool calls.
const MAX_NUDGES = 2
// Hard cap on the text length of any single tool result fed back to Claude, so
// one unexpectedly huge payload can't blow the context window. ~55k tokens.
const MAX_RESULT_CHARS = 200_000
const capText = (s) =>
  s.length > MAX_RESULT_CHARS ? s.slice(0, MAX_RESULT_CHARS) + '…[truncated]' : s

// A transient network/connection failure to the Anthropic API (DNS blip, socket
// reset, dropped stream, the SDK's APIConnectionError "Connection error.").
// Worth retrying — a brief blip shouldn't kill the whole audit.
const isConnectionError = (e) =>
  e?.name === 'APIConnectionError' ||
  e?.name === 'APIConnectionTimeoutError' ||
  /connection error|fetch failed|network error|socket hang up|terminated|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED/i.test(
    e?.message || '',
  ) ||
  /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|UND_ERR/i.test(
    String(e?.cause?.code || e?.cause?.message || ''),
  )

// Transient Anthropic errors worth retrying (server busy / overloaded / rate /
// dropped connection).
const isRetryable = (e) =>
  [429, 500, 503, 529].includes(e?.status) ||
  e?.error?.error?.type === 'overloaded_error' ||
  e?.error?.type === 'overloaded_error' ||
  /overloaded|rate.?limit|temporarily/i.test(e?.message || '') ||
  isConnectionError(e)

// Call Claude with retry + exponential backoff so a brief overload (HTTP 529) or
// a dropped connection doesn't kill the whole audit. Emits a visible status.
async function createWithRetry(client, params, emit, maxRetries = 4) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.messages.create(params)
    } catch (err) {
      if (!isRetryable(err) || attempt >= maxRetries) throw err
      const waitMs = Math.min(8000, 800 * 2 ** attempt)
      const why = isConnectionError(err)
        ? 'Connection to Claude dropped'
        : 'Claude is busy (overloaded)'
      emit('status', {
        message: `${why} — retrying in ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/${maxRetries})…`,
      })
      await new Promise((r) => setTimeout(r, waitMs))
    }
  }
}

// Extract the final JSON report from Claude's closing message.
function extractReport(finalText, { url, module, allToolResults }) {
  let report = null
  const jsonMatch =
    finalText.match(/```json\s*([\s\S]*?)\s*```/) ||
    finalText.match(/(\{[\s\S]*"overallScore"[\s\S]*\})/)
  if (jsonMatch) {
    try {
      report = JSON.parse(jsonMatch[1] || jsonMatch[0])
    } catch {
      /* fall through */
    }
  }
  if (!report) {
    report = { raw: finalText, overallScore: 0, grade: 'N/A', headline: 'Report generated' }
  }

  report.toolResults = allToolResults
  report.url = url
  report.module = module
  report.generatedAt = new Date().toISOString()
  return report
}

// Build the opening user message describing the audit request.

function buildUserMessage({ url, figmaUrl, checks, environment, sections }) {
  const envLine =
    environment && !environment.isProduction
      ? `Heads up: this site looks like a ${environment.environment} (not live) site — ${environment.signals.map((s) => s.signal).join(', ')}. Review it as pre-launch (see the environment instructions in your system prompt).`
      : ''
  const sectionLine =
    sections && sections.length
      ? `Only review these page sections of the site: ${sections.join(', ')}. Ignore all other sections — do not report on them.`
      : ''
  return [
    `Please run a complete QA audit on this website: ${url}`,
    figmaUrl ? `Figma design URL: ${figmaUrl}` : '',
    checks.length ? `Specific checks requested: ${checks.join(', ')}` : 'Run all relevant checks.',
    sectionLine,
    envLine,
    'Use the available Playwright tools to gather real browser data before analyzing.',
  ]
    .filter(Boolean)
    .join('\n')
}

// Run a full audit. Resolves with the final report; reports progress via emit().
// `client` defaults to the shared Anthropic instance; it can be injected in
// tests to drive the agentic loop without hitting the live API.
// Map the UI's link-type choice to an environment classification.
const HINT_TO_ENV = { local: 'development', staging: 'staging', live: 'production' }

export async function runAudit(
  {
    url,
    figmaUrl,
    module = 'full',
    checks = [],
    requiredTools = [],
    reportId,
    environmentHint,
    figmaProject,
    sections,
    aiModelId,
    ownerId = null,
  },
  emit,
  client = anthropic,
) {
  emit('status', { message: 'Audit started', progress: 2 })

  // Apply persisted settings: model / token budget / iteration cap, plus which
  // tools the agent is allowed to use. Falls back to the constants above.
  const settings = await getSettings()
  let model = settings.audit.model || MODEL
  const maxTokens = settings.audit.maxTokens || MAX_TOKENS
  const maxIterations = settings.audit.maxIterations || MAX_ITERATIONS
  const temperature = settings.audit.temperature
  const isEnabled = (name) => settings.enabledTools[name] !== false
  const activeTools = TOOL_DEFINITIONS.filter((t) => isEnabled(t.name))

  // Active AI model profile (Admin → AI Models): overrides the model and uses
  // its OWN API key + provider. Claude runs natively; Gemini runs via an adapter
  // that mimics the Anthropic client. Other providers are gated until wired.
  // Only override the injected client when it's the shared default (tests pass
  // their own client and must keep it).
  let activeClient = client
  try {
    // The user's per-audit pick wins (if the admin permitted it); otherwise the
    // admin's active default model is used.
    const profile = (aiModelId && (await getSelectableProfile(aiModelId))) || (await getActiveProfile())
    if (profile) {
      if (!profile.runnable) {
        emit('error', {
          message: `Active AI model "${profile.label}" uses provider "${profile.provider}", which can't run audits yet. Pick a Claude or Gemini model in Admin → AI Models.`,
        })
        return null
      }
      if (profile.model) model = profile.model

      if (profile.provider === 'google') {
        if (!profile.apiKey) {
          emit('error', {
            message: `The active model "${profile.label}" (Gemini) has no API key. Add one in Admin → AI Models → Edit.`,
          })
          return null
        }
        activeClient = makeGeminiClient(profile.apiKey)
      } else if (profile.provider === 'openrouter') {
        if (!profile.apiKey) {
          emit('error', {
            message: `The active model "${profile.label}" (OpenRouter) has no API key. Add one in Admin → AI Models → Edit.`,
          })
          return null
        }
        activeClient = makeOpenRouterClient(profile.apiKey)
      } else {
        // anthropic
        if (client === anthropic && profile.apiKey)
          activeClient = new Anthropic({ apiKey: profile.apiKey })
      }
      emit('status', {
        message: `Using AI model: ${profile.label} (${profile.model})`,
        progress: 3,
      })
    }
  } catch (err) {
    console.warn('[audit] ai-model resolve failed:', err.message)
  }

  // Detect whether this is a live production site or still in dev/staging so
  // the whole report is framed correctly (a pre-launch site isn't marked down
  // for noindex / missing analytics / placeholder content like a live one is).
  // Best-effort: a failure here must not block the audit.
  let environment = null
  try {
    emit('status', { message: 'Checking whether the site is live or in development…', progress: 4 })
    environment = await detectEnvironment(url)
    emit('status', {
      message: environment.isProduction
        ? 'Site looks live (production)'
        : `Site looks like ${environment.environment} (not live) — report will be framed as pre-launch`,
      progress: 6,
    })
  } catch (err) {
    console.warn('[audit] environment detection failed:', err.message)
  }

  // If the operator declared the link type in the UI (Local / Staging / Live),
  // that is authoritative for how the report is framed. We still keep the
  // auto-detected result as a cross-check and surface any mismatch.
  const declared = HINT_TO_ENV[environmentHint]
  if (declared) {
    const detected = environment
    const mismatch = detected && detected.environment !== declared
    environment = {
      tool: 'environment',
      url,
      environment: declared,
      isProduction: declared === 'production',
      source: 'user-declared',
      confidence: 'high',
      httpStatus: detected?.httpStatus ?? null,
      signals: detected?.signals || [],
      detected: detected
        ? {
            environment: detected.environment,
            isProduction: detected.isProduction,
            signals: detected.signals,
          }
        : null,
      summary:
        `Operator marked this as a ${declared} link.` +
        (mismatch
          ? ` (Auto-detection saw signs of "${detected.environment}" — ${detected.signals.map((s) => s.signal).join(', ') || 'no strong signals'}.)`
          : ''),
    }
    emit('status', {
      message: `Marked as ${environmentHint} link${mismatch ? ` (auto-detection saw ${detected.environment})` : ''}`,
      progress: 6,
    })
  }

  // Selected page sections to scope the audit to (Phase 2 picker). null/empty
  // = no filter (all sections). Matched by name against the scanned sections.
  const selectedSections = Array.isArray(sections)
    ? sections.filter((s) => typeof s === 'string' && s.trim())
    : null
  const messages = [
    {
      role: 'user',
      content: buildUserMessage({ url, figmaUrl, checks, environment, sections: selectedSections }),
    },
  ]
  const allToolResults = []
  // Only enforce required tools that are actually enabled — we can't force a
  // tool the operator has globally disabled in Settings.
  const required = [...new Set(requiredTools)].filter(isEnabled)
  // The editable persona/instructions (Admin → Prompts active version, else the
  // built-in default). Best-effort — fall back to default on any read error.
  let activeInstructions = ''
  try {
    activeInstructions = await getActiveInstructions()
  } catch {
    /* use default */
  }
  const systemPrompt = buildSystemPrompt(
    module,
    checks,
    required,
    settings.audit.extraInstructions,
    environment,
    activeInstructions,
  )

  // Resolve which project-wise Figma token to use for this run (chosen project
  // → active project → .env fallback). Injected into figma_fetch calls below.
  let figmaToken = ''
  if (figmaUrl || (module && module.includes('figma')) || required.includes('figma_fetch')) {
    try {
      const f = await resolveFigmaToken(figmaProject)
      figmaToken = f.token
      if (f.projectName)
        emit('status', { message: `Using Figma project: ${f.projectName}`, progress: 8 })
    } catch (err) {
      console.warn('[audit] figma token resolve failed:', err.message)
    }
  }

  // Required tools that have been *attempted* (success or failure). We nudge
  // only for tools never attempted — a tool that fails for a permanent reason
  // (e.g. missing FIGMA_TOKEN) must not be retried forever; it's reported as
  // failed instead. `failedTools` tracks the ones whose last attempt errored.
  const calledTools = new Set()
  const failedTools = new Set()
  let nudges = 0
  // Running token tally across every Claude call this audit. `byModel` keys the
  // same totals by model name so the UI can show a live per-model breakdown and
  // the cumulative counter can total spend per model over time.
  const usage = { inputTokens: 0, outputTokens: 0, calls: 0, byModel: {} }
  // Whether Claude grabbed a full-page screenshot while gathering data. We don't
  // embed that full-page shot in the report (the user wants targeted evidence
  // shots of actual mistakes, not a whole-page screenshot) — it's only used to
  // decide whether a visual/section pass is warranted.
  let claudeUsedScreenshot = false
  // figma_fetch is rate-limited and hits the Figma API twice per call. Cache the
  // first outcome (success OR error) per file so repeat calls in the same run
  // replay it instead of hammering Figma into a 429 loop.
  const figmaResults = new Map()

  emit('status', { message: 'Connecting to Claude AI…', progress: 8 })

  // ── Agentic loop: Claude calls tools until it has enough data ───────────────
  // Wrapped in try/finally so the cumulative token counter is updated on EVERY
  // exit — success, max-iterations, or a thrown error (e.g. credit/connection
  // failure mid-run). This keeps the Admin token total accurate, not just for
  // audits that finished cleanly.
  try {
    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      const response = await createWithRetry(
        activeClient,
        {
          model,
          max_tokens: maxTokens,
          temperature,
          system: systemPrompt,
          // Omit `tools` entirely when none are enabled — the SDK rejects [].
          ...(activeTools.length ? { tools: activeTools } : {}),
          messages,
        },
        emit,
      )

      // Tally tokens for this call (usage may be absent on some error shapes).
      if (response.usage) {
        const inT = response.usage.input_tokens || 0
        const outT = response.usage.output_tokens || 0
        usage.inputTokens += inT
        usage.outputTokens += outT
        usage.calls += 1
        // Per-model running totals (keyed by the active model name).
        const m = (usage.byModel[model] ||= { inputTokens: 0, outputTokens: 0, calls: 0 })
        m.inputTokens += inT
        m.outputTokens += outT
        m.calls += 1
        // Stream the live tally so the UI can show tokens climbing in real time.
        emit('usage_update', {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.inputTokens + usage.outputTokens,
          calls: usage.calls,
          model,
          byModel: usage.byModel,
        })
      }

      const textBlocks = response.content.filter((b) => b.type === 'text')
      if (textBlocks.length) {
        emit('thinking', {
          text: textBlocks.map((b) => b.text).join(''),
          progress: Math.min(10 + iteration * 7, 85),
        })
      }

      // Claude is done — extract and return the final report.
      // Treat max_tokens as terminal too: there will be no more tool calls, so
      // salvage whatever JSON the model already produced rather than spinning to
      // MAX_ITERATIONS and returning no report.
      if (response.stop_reason === 'end_turn' || response.stop_reason === 'max_tokens') {
        // Enforce required tools: if Claude tries to finish before every tool a
        // ticked check needs has actually run, send it back to run the rest.
        // (Skip on max_tokens — it can't continue — and after MAX_NUDGES.)
        const missing = required.filter((t) => !calledTools.has(t))
        if (response.stop_reason === 'end_turn' && missing.length && nudges < MAX_NUDGES) {
          nudges++
          messages.push({ role: 'assistant', content: response.content })
          messages.push({
            role: 'user',
            content:
              `You have not yet run these required checks: ${missing.join(', ')}. ` +
              `Call each of these tools now using the same URL, then produce the final report. ` +
              `Do not write the report until they have all run.`,
          })
          emit('status', {
            message: `Running required checks: ${missing.join(', ')}`,
            progress: Math.min(10 + iteration * 7, 85),
          })
          continue
        }

        const finalText = textBlocks.map((b) => b.text).join('')
        const report = extractReport(finalText, { url, module, allToolResults })
        report.checks = checks // what was tested
        if (environment) report.environment = environment // live vs dev/staging
        if (missing.length) report.skippedRequiredTools = missing // never attempted
        const failedRequired = required.filter((t) => failedTools.has(t))
        if (failedRequired.length) report.failedRequiredTools = failedRequired // ran but errored
        if (response.stop_reason === 'max_tokens') {
          report.truncated = true
          report.headline =
            (report.headline || 'Report generated') + ' (truncated — max_tokens reached)'
        }
        report.usage = { ...usage, totalTokens: usage.inputTokens + usage.outputTokens }
        // (Cumulative usage is rolled up in the loop's `finally` so failed audits
        // are counted too — see below.)

        // Visual evidence is attached only when a selected check actually needs it
        // — i.e. a ticked check uses the screenshot tool, or Claude already
        // captured a screenshot while gathering data. Non-visual audits (console
        // errors, web vitals, forms, tracking) get NO auto screenshots, so the
        // report reflects only the requested checks instead of a generic
        // full-page-screenshot + boilerplate section scan on every report.
        const needsVisual = required.includes('playwright_screenshot') || claudeUsedScreenshot

        if (needsVisual) {
          try {
            emit('status', { message: 'Capturing section-by-section screenshots…', progress: 94 })
            const sec = await auditWebSections(url)
            // Keep the section screenshot PLUS the measured data (typography,
            // colors, spacing, layout, element counts) — that measured data is the
            // real, check-relevant content the report shows per section (e.g. font
            // family/size/weight for a Typography check). Drop only the generic
            // accessibility checks/verdict, which aren't tied to the selection.
            let secList = (sec.sections || []).map((s) => ({
              index: s.index,
              name: s.name,
              tag: s.tag,
              screenshot: s.screenshot,
              mimeType: s.mimeType,
              measured: s.measured,
              counts: s.counts,
            }))
            // Honour the section picker: keep ONLY the sections the user selected
            // (matched by name). Empty/no selection = keep all.
            if (selectedSections && selectedSections.length) {
              const want = new Set(selectedSections)
              const filtered = secList.filter((s) => want.has(s.name))
              if (filtered.length) secList = filtered
            }
            report.sections = secList
            report.sectionCount = secList.length
            if (selectedSections && selectedSections.length)
              report.selectedSections = selectedSections

            // Section-wise screenshots only — never a full-page hero shot. The
            // only other images in the report are the targeted evidence shots of
            // actual faulty elements (captured below).
            delete report.screenshots
          } catch (err) {
            console.warn('[audit] section pass failed:', err.message)
          }
        }

        // Evidence screenshots: for every finding that points at a faulty element
        // — via a CSS selector OR a snippet of its visible text — capture ONE
        // highlighted shot (red box + arrow). A screenshot is attached wherever
        // there is a real, locatable mistake.
        try {
          const targets = []
          const addTarget = (id, f) => {
            if (f && (f.selector || f.textMatch)) {
              targets.push({
                id,
                selector: f.selector || null,
                textMatch: f.textMatch || null,
                label: f.issue,
                ref: f,
              })
            }
          }
          for (const [name, m] of Object.entries(report.modules || {})) {
            ;(m.findings || []).forEach((f, i) => addTarget(`m:${name}:${i}`, f))
          }
          ;(report.criticalIssues || []).forEach((c, i) => addTarget(`c:${i}`, c))

          if (targets.length) {
            emit('status', {
              message: `Capturing evidence screenshots for ${targets.length} issue(s)…`,
              progress: 96,
            })
            const shots = await captureFindingHighlights(
              url,
              targets.map(({ id, selector, textMatch, label }) => ({
                id,
                selector,
                textMatch,
                label,
              })),
            )
            const byId = Object.fromEntries(shots.map((s) => [s.id, s]))
            let captured = 0
            for (const t of targets) {
              const s = byId[t.id]
              if (s) {
                t.ref.shot = s.base64
                t.ref.shotMime = s.mimeType
                captured++
                // If Claude didn't supply the faulty code, use the element's real
                // markup captured from the page as the "current code" evidence.
                if (s.html && !t.ref.codeProblem) t.ref.codeActual = s.html
              }
            }
            emit('status', {
              message: `Attached ${captured}/${targets.length} evidence screenshot(s)`,
              progress: 97,
            })
          }
        } catch (err) {
          console.warn('[audit] highlight pass failed:', err.message)
        }

        // Persist to history before emitting so the file exists by the time
        // the frontend re-fetches the history list.
        if (reportId) {
          try {
            await saveReport(reportId, report, ownerId)
          } catch (err) {
            console.error('[audit] history save failed:', err.message)
          }
        }
        emit('complete', { report, progress: 100 })
        return report
      }

      const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use')
      if (!toolUseBlocks.length) break

      messages.push({ role: 'assistant', content: response.content })

      // Execute each requested tool call and collect the results.
      const toolResults = []
      for (const toolCall of toolUseBlocks) {
        emit('tool_call', {
          tool: toolCall.name,
          input: toolCall.input,
          message: `Running: ${toolCall.name}`,
          progress: Math.min(10 + iteration * 7, 85),
        })

        try {
          let result
          if (toolCall.name === 'figma_fetch') {
            // Only ever hit Figma once per file per run; replay the first outcome
            // for any repeat call so a rate limit can't be hammered into a loop.
            const key = String(toolCall.input?.figmaUrl || figmaUrl || 'figma')
            const cached = figmaResults.get(key)
            if (cached) {
              if (!cached.ok) throw new Error(cached.error) // re-surface, no API hit
              result = cached.result
            } else {
              // Supply the resolved project-wise token unless Claude passed one.
              const toolInput =
                figmaToken && !toolCall.input?.token
                  ? { ...toolCall.input, token: figmaToken }
                  : toolCall.input
              try {
                result = await executeTool(toolCall.name, toolInput)
                figmaResults.set(key, { ok: true, result })
              } catch (e) {
                figmaResults.set(key, { ok: false, error: e.message })
                throw e
              }
            }
          } else {
            result = await executeTool(toolCall.name, toolCall.input)
          }

          // Don't push base64 screenshots over the wire — send metadata only.
          const wireResult =
            toolCall.name === 'playwright_screenshot'
              ? { ...result, base64: undefined, hasScreenshot: true }
              : result

          emit('tool_result', { tool: toolCall.name, result: wireResult })
          // Store the trimmed result — base64 screenshots must not bloat the
          // final SSE payload that ships with the `complete` event.
          allToolResults.push({ tool: toolCall.name, result: wireResult })
          calledTools.add(toolCall.name) // attempted + succeeded
          failedTools.delete(toolCall.name) // clear any prior failure (retry worked)

          // Note that Claude looked at the page visually (used only to decide
          // whether the section pass runs) — the full-page image itself is not
          // embedded in the report.
          if (toolCall.name === 'playwright_screenshot' && result.base64) {
            claudeUsedScreenshot = true
          }

          // Feed the result back to Claude. A screenshot's base64 must NEVER go
          // back as text — it's ~hundreds of thousands of tokens and blows the
          // context window. Send it as a real image block (Claude can see it,
          // ~1.5k tokens) plus the metadata; everything else goes as JSON text.
          const content =
            toolCall.name === 'playwright_screenshot' && result.base64
              ? [
                  {
                    type: 'image',
                    source: {
                      type: 'base64',
                      media_type: result.mimeType || 'image/png',
                      data: result.base64,
                    },
                  },
                  { type: 'text', text: capText(JSON.stringify(wireResult)) },
                ]
              : capText(JSON.stringify(result))

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content,
          })
        } catch (err) {
          emit('tool_error', { tool: toolCall.name, error: err.message })
          // Count it as attempted so the nudge loop won't keep retrying a tool
          // that fails for a permanent reason (e.g. a missing API key).
          calledTools.add(toolCall.name)
          failedTools.add(toolCall.name)
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: `Error: ${err.message}`,
            is_error: true,
          })
        }
      }

      // Feed the tool results back to Claude for the next turn.
      messages.push({ role: 'user', content: toolResults })
    }

    emit('error', { message: 'Max iterations reached without final report' })
    return null
  } finally {
    // Record token spend on any exit — including failed/aborted audits — so the
    // Admin token total reflects real usage. Only when at least one call ran.
    if (usage.calls > 0) addUsage(usage).catch(() => {})
  }
}
