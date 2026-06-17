// ─────────────────────────────────────────────────────────────────────────────
//  mcp/server.js
//  MCP Server — exposes the Playwright QA tools over the stdio transport.
//
//  Usage:
//    node mcp/server.js          ← standalone stdio MCP server
//    Add to Claude Desktop config.json to use with Claude Desktop
//
//  Claude Desktop config (~/.config/Claude/claude_desktop_config.json):
//  {
//    "mcpServers": {
//      "qa-playwright": {
//        "command": "node",
//        "args": ["/path/to/qa-tool-v2/backend/mcp/server.js"],
//        "env": { "FIGMA_TOKEN": "figd_...", "PSI_API_KEY": "AIza..." }
//      }
//    }
//  }
//
//  Tool schemas live in ./tool-schemas.js; implementations in ../src/tools/.
// ─────────────────────────────────────────────────────────────────────────────
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

import { config } from '../src/config/index.js'
import { MCP_TOOL_SCHEMAS } from './tool-schemas.js'
import {
  takeScreenshot,
  captureConsoleErrors,
  checkAllLinks,
  auditForms,
  getWebVitals,
  detectTracking,
  checkAccessibility,
  auditPageMeta,
} from '../src/tools/playwright.tools.js'
import { runPageSpeed } from '../src/tools/pagespeed.tool.js'
import { fetchFigmaDesign } from '../src/tools/figma.tool.js'

// ── Dispatch a tool call to its implementation ────────────────────────────────
async function callTool(name, args) {
  switch (name) {
    case 'take_screenshot': {
      const shot = await takeScreenshot(args.url, { fullPage: args.fullPage !== false })
      // Don't include base64 in MCP responses (too large) — return metadata only.
      return { ...shot, base64: '[screenshot captured — use via backend API]' }
    }
    case 'capture_console_errors':
      return captureConsoleErrors(args.url)
    case 'check_all_links':
      return checkAllLinks(args.url)
    case 'audit_forms':
      return auditForms(args.url)
    case 'get_web_vitals':
      return getWebVitals(args.url)
    case 'detect_tracking':
      return detectTracking(args.url)
    case 'check_accessibility':
      return checkAccessibility(args.url)
    case 'audit_page_meta':
      return auditPageMeta(args.url)
    case 'run_pagespeed':
      return runPageSpeed(args.url, config.keys.psi)
    case 'fetch_figma_design':
      return fetchFigmaDesign(args.figmaUrl, args.token || config.keys.figma)
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

// ── MCP Server ────────────────────────────────────────────────────────────────
const server = new Server(
  { name: 'qa-playwright-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: MCP_TOOL_SCHEMAS }))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  try {
    const result = await callTool(name, args)
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Tool error: ${err.message}` }],
      isError: true,
    }
  }
})

// ── Start ─────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport()
await server.connect(transport)
console.error('[QA MCP] Server running — Playwright tools ready')
