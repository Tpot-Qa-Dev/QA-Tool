# QA Automation Tool — Separate Frontend + Backend + MCP + Playwright

Real browser automation QA suite. Claude AI orchestrates Playwright tools via the MCP protocol.

> 📖 **New here? Read [DOCUMENTATION.md](DOCUMENTATION.md)** — the full guide that explains what
> the project is, how it works, and how to run it, written for anyone.

## Architecture

Each file has a single responsibility — routing, HTTP handling, business logic,
and tool implementations are kept in separate layers.

```
backend/   ← Node.js + Express (port 3001)
├── src/
│   ├── server.js                  Entry point — starts the HTTP server
│   ├── app.js                     Express app: middleware + routes
│   ├── config/index.js            Loads .env into a typed config object
│   ├── routes/                    Route definitions only
│   │   ├── index.js                 Aggregates all routers under /api
│   │   ├── health.routes.js
│   │   └── audit.routes.js
│   ├── controllers/               HTTP request/response handling
│   │   ├── health.controller.js
│   │   └── audit.controller.js
│   ├── services/                  Business logic
│   │   ├── audit.service.js         Claude agentic loop with tool_use
│   │   └── prompts.js               System-prompt construction
│   ├── tools/                     Tool implementations + registry
│   │   ├── index.js                 Claude tool schemas + executor
│   │   ├── playwright.tools.js       8 real Playwright browser tools
│   │   ├── pagespeed.tool.js          Google PSI API
│   │   └── figma.tool.js              Figma REST API
│   └── utils/sse.js               Server-Sent Events helpers
└── mcp/
    ├── server.js                  Standalone MCP server (stdio)
    └── tool-schemas.js            MCP tool descriptors

frontend/  ← React + Vite (port 5173) — no API keys, calls backend only
└── src/
    ├── main.jsx                   React entry point
    ├── App.jsx                    Layout + tab composition
    ├── api/client.js              Backend API client (SSE streaming)
    ├── config/modules.js          Audit module catalogue
    ├── hooks/useAudit.js          Audit run state + SSE event handling
    ├── lib/                       Pure helpers (colors, report export)
    ├── styles/                    global.css + app.css
    └── components/                One component per file
        ├── Header.jsx · AuditProgress.jsx
        ├── setup/                 ModulePicker · UrlInputs · ApiStatus · SetupView
        └── results/               ReportNav · OverviewTab · FindingsTab ·
                                    ToolLogsTab · RawJsonTab · ExportBar · ResultsView
```

## API Keys Needed

| API | Key Format | Required | Get It |
|-----|-----------|----------|--------|
| **Claude API** | `sk-ant-api03-...` | ✅ YES | https://console.anthropic.com → API Keys |
| **Google PageSpeed** | `AIza...` | ○ optional | https://developers.google.com/speed/docs/insights/v5/get-started |
| **Figma Token** | `figd_...` | ○ optional (Figma module only) | Figma → Settings → Access Tokens |
| **Playwright** | — | ✅ YES (npm package) | `npm install` then `npx playwright install chromium` |
| **MCP SDK** | — | ✅ YES (npm package) | Included in `npm install` |

## Playwright Tools (real browser automation)

| Tool | What it does |
|------|-------------|
| `screenshot` | Full-page screenshot in real Chromium |
| `console_errors` | Captures JS errors + failed network requests |
| `check_links` | Checks all page links for 404s |
| `audit_forms` | Field types, labels, validation, method |
| `web_vitals` | Real LCP/FCP/TTFB via Performance API |
| `detect_tracking` | GA4, GTM, FB Pixel, Hotjar, Clarity |
| `accessibility` | Alt text, labels, H1, ARIA, skip links |
| `meta_audit` | Title, OG tags, canonical, schema markup |

## Quick Start

```bash
# Terminal 1 — Backend
cd backend
npm install
npm run install-browsers     # npx playwright install chromium --with-deps
cp .env.example .env
# Add CLAUDE_API_KEY to .env
npm start                    # node src/server.js

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

## MCP Server (Claude Desktop)

Add to `~/.config/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "qa-playwright": {
      "command": "node",
      "args": ["/absolute/path/to/backend/mcp/server.js"],
      "env": {
        "PSI_API_KEY":  "AIza...",
        "FIGMA_TOKEN":  "figd_..."
      }
    }
  }
}
```
