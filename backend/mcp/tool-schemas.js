// ─────────────────────────────────────────────────────────────────────────────
//  mcp/tool-schemas.js
//  MCP tool descriptors advertised to MCP clients (e.g. Claude Desktop).
//  Schema definitions only — implementations live in src/tools/.
// ─────────────────────────────────────────────────────────────────────────────

// Shared single-URL input schema used by most tools.
const urlInput = (description) => ({
  type:       'object',
  properties: { url: { type: 'string', description } },
  required:   ['url'],
})

export const MCP_TOOL_SCHEMAS = [
  {
    name:        'take_screenshot',
    description: 'Navigate to a URL and capture a full-page screenshot in real Chromium browser',
    inputSchema: {
      type: 'object',
      properties: {
        url:      { type: 'string',  description: 'Full URL including https://' },
        fullPage: { type: 'boolean', description: 'Capture full scrollable page (default: true)' },
      },
      required: ['url'],
    },
  },
  {
    name:        'capture_console_errors',
    description: 'Open a page in Chromium and capture all real JavaScript errors, warnings, and failed network requests',
    inputSchema: urlInput('URL to audit'),
  },
  {
    name:        'check_all_links',
    description: 'Extract all links from a page and verify each one returns a successful HTTP status (finds 404s, broken links)',
    inputSchema: urlInput('Page URL to scan for links'),
  },
  {
    name:        'audit_forms',
    description: 'Detect all forms on a page and audit their fields, labels, method, validation, and accessibility',
    inputSchema: urlInput('Page URL to audit forms on'),
  },
  {
    name:        'get_web_vitals',
    description: 'Measure real Core Web Vitals (LCP, FCP, TTFB, DOM load) by running the page in a real browser',
    inputSchema: urlInput('URL to measure performance of'),
  },
  {
    name:        'detect_tracking',
    description: 'Detect all analytics and tracking scripts on a page (GA4, GTM, FB Pixel, Hotjar, Clarity, etc.)',
    inputSchema: urlInput('Page URL to scan for tracking scripts'),
  },
  {
    name:        'check_accessibility',
    description: 'Run accessibility checks: missing alt text, unlabelled inputs, H1 structure, ARIA, skip links',
    inputSchema: urlInput('Page URL to check accessibility on'),
  },
  {
    name:        'audit_page_meta',
    description: 'Extract and audit all page metadata: title, description, OG tags, canonical, headings, schema markup',
    inputSchema: urlInput('Page URL to audit'),
  },
  {
    name:        'run_pagespeed',
    description: 'Call Google PageSpeed Insights API for real Lighthouse performance scores and Core Web Vitals',
    inputSchema: urlInput('URL to test with PageSpeed Insights'),
  },
  {
    name:        'fetch_figma_design',
    description: 'Fetch Figma design file: styles, color tokens, text styles, page structure for design-vs-web comparison',
    inputSchema: {
      type: 'object',
      properties: {
        figmaUrl: { type: 'string', description: 'Figma file URL (https://www.figma.com/file/...)' },
        token:    { type: 'string', description: 'Figma personal access token (optional if set in env)' },
      },
      required: ['figmaUrl'],
    },
  },
]


