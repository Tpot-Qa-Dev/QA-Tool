// ─────────────────────────────────────────────────────────────────────────────
//  tools/index.js
//  Tool registry — the single place that maps Claude tool names to the
//  underlying implementations. The Anthropic API receives TOOL_DEFINITIONS;
//  executeTool() dispatches a requested call to its handler.
// ─────────────────────────────────────────────────────────────────────────────
import { config } from '../config/index.js'
import {
  takeScreenshot,
  captureConsoleErrors,
  checkAllLinks,
  auditForms,
  getWebVitals,
  detectTracking,
  checkAccessibility,
  auditPageMeta,
  detectEnvironment,
} from './playwright.tools.js'
import { runPageSpeed }     from './pagespeed.tool.js'
import { fetchFigmaDesign } from './figma.tool.js'

// A url-only input schema — shared by most Playwright tools.
const urlInput = { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] }

// ── Tool definitions sent to the Claude API ───────────────────────────────────
export const TOOL_DEFINITIONS = [
  { name: 'playwright_screenshot',      description: 'Capture a real screenshot of a webpage using Playwright Chromium browser',                 input_schema: urlInput },
  { name: 'playwright_console_errors',  description: 'Capture all real JavaScript console errors and failed network requests on a page',         input_schema: urlInput },
  { name: 'playwright_check_links',     description: 'Check all links on a page and detect broken ones (404, errors)',                            input_schema: urlInput },
  { name: 'playwright_audit_forms',     description: 'Audit all forms on a page: fields, labels, validation, method, accessibility',              input_schema: urlInput },
  { name: 'playwright_web_vitals',      description: 'Measure real Core Web Vitals (LCP, FCP, TTFB) in a real browser',                           input_schema: urlInput },
  { name: 'playwright_tracking',        description: 'Detect analytics scripts (GA4, GTM, FB Pixel, Hotjar, Clarity) on a page',                  input_schema: urlInput },
  { name: 'playwright_accessibility',   description: 'Run accessibility checks: missing alt text, unlabelled inputs, H1 structure',               input_schema: urlInput },
  { name: 'playwright_meta_audit',      description: 'Extract all page metadata: title, OG tags, canonical, headings, schema',                    input_schema: urlInput },
  { name: 'playwright_detect_environment', description: 'Detect whether the URL is a live production site or still in development/staging/maintenance (noindex, staging hostnames, placeholder content, "coming soon", visible errors)', input_schema: urlInput },
  { name: 'pagespeed_audit',            description: 'Call Google PageSpeed Insights API for Lighthouse scores and CWV benchmarks',               input_schema: urlInput },
  {
    name: 'figma_fetch',
    description: 'Fetch Figma design file styles and tokens for design-vs-web comparison',
    input_schema: {
      type: 'object',
      properties: {
        figmaUrl: { type: 'string' },
        token:    { type: 'string' },
      },
      required: ['figmaUrl'],
    },
  },
]

// ── Handler map — one entry per tool name above ──────────────────────────────
const HANDLERS = {
  playwright_screenshot:     (i) => takeScreenshot(i.url),
  playwright_console_errors: (i) => captureConsoleErrors(i.url),
  playwright_check_links:    (i) => checkAllLinks(i.url),
  playwright_audit_forms:    (i) => auditForms(i.url),
  playwright_web_vitals:     (i) => getWebVitals(i.url),
  playwright_tracking:       (i) => detectTracking(i.url),
  playwright_accessibility:  (i) => checkAccessibility(i.url),
  playwright_meta_audit:     (i) => auditPageMeta(i.url),
  playwright_detect_environment: (i) => detectEnvironment(i.url),
  pagespeed_audit:           (i) => runPageSpeed(i.url, config.keys.psi),
  figma_fetch:               (i) => fetchFigmaDesign(i.figmaUrl, i.token || config.keys.figma),
}

// Execute a Claude-requested tool call.
export async function executeTool(toolName, toolInput) {
  const handler = HANDLERS[toolName]
  if (!handler) throw new Error(`Unknown tool: ${toolName}`)
  return handler(toolInput)
}
