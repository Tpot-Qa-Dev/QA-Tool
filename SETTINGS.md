# Settings & Tool Maintenance

The ⚙ **Settings** panel (header, next to History) lets you maintain the QA tool
without editing code. Settings are stored server-side in `backend/settings.json`
(gitignored) and applied to **every** audit — they are global, not per-request.

> **Status (2026-06-01):** complete and wired end-to-end — every setting below
> has a control in the Settings panel and is verified against the backend.

---

## 1. Tool & Key Status

Read-only diagnostics:

| Item | Meaning |
|------|---------|
| Backend | online / offline (from `/api/health`) |
| Claude API key `*` | configured / missing (**required**) |
| PageSpeed API key | configured / not set (optional) |
| Figma token | configured / not set (optional) |

API keys are **not** edited here — they live in `backend/.env` and require a
server restart. The panel only shows whether each is configured.

```
# backend/.env
CLAUDE_API_KEY=sk-ant-api03-...   # required
PSI_API_KEY=...                   # optional — Core Web Vitals (PageSpeed)
FIGMA_TOKEN=...                   # optional — Figma vs Web module
```

---

## 2. Audit Run Settings

Applied to every audit. Values are validated/clamped server-side on save.

| Setting | Range / type | Default | Effect |
|---------|--------------|---------|--------|
| **Model** | preset or any string | `claude-sonnet-4-6` | Which Claude model runs the audit |
| **Max iterations** | 1–30 | 12 | Max Claude tool-use turns per audit |
| **Max tokens** | 1024–16000 | 8192 | Output-token budget per Claude call |
| **Headless browser** | on/off | on | Hide/show the Chromium window |
| **Temperature** | 0–1 | 1 | Claude sampling — lower = more deterministic |
| **Extra instructions** | text (≤2000 chars) | — | Appended verbatim to every system prompt |
| **Default module** | module id or empty | — | Module pre-selected on launch |
| **Checks all-on** | on/off | off | Start every checkbox ticked vs. only its defaults |

Model presets offered: `claude-sonnet-4-6`, `claude-opus-4-8`,
`claude-haiku-4-5-20251001`.

---

## 3. Browser Settings

Wired into the Playwright tools (read at browser-launch / navigation time).

| Setting | Range | Default | Was hardcoded |
|---------|-------|---------|---------------|
| Viewport width | 320–3840 | 1280 | 1280 |
| Viewport height | 240–2160 | 800 | 800 |
| Navigation timeout (sec) | 5–120 | 30 | 30s |
| Max links to check | 1–500 | 80 | 80 |

---

## 4. Enabled Tools

A checkbox per tool. Disabled tools are **never offered to the agent** on any
audit. If a ticked check requires a tool you've disabled, that requirement is
dropped (the tool can't be force-run). The 10 tools:

`playwright_screenshot`, `playwright_console_errors`, `playwright_check_links`,
`playwright_audit_forms`, `playwright_web_vitals`, `playwright_tracking`,
`playwright_accessibility`, `playwright_meta_audit`, `pagespeed_audit`,
`figma_fetch`.

---

## 5. Token Usage

Cumulative Claude token consumption, persisted to `backend/usage.json`, updated
once per completed audit.

- Each report now includes `report.usage = { inputTokens, outputTokens, totalTokens, calls }`.
- A cumulative total (`inputTokens`, `outputTokens`, `audits`, `since`) is
  available via the API and can be reset.

> Token *quota/limits* are set on your Anthropic account
> (console.anthropic.com → Settings → Limits / Usage), **not** in this tool.
> This feature only tracks what the tool itself has spent.

---

## 6. History Maintenance

| Action | What it does |
|--------|--------------|
| Stored audits | Count + total disk size |
| Purge older than _N_ days | Delete audits older than N days (by `generatedAt`) |
| Rebuild index | Regenerate `reports/_index.json` from the report files |
| Clear all history | Delete every stored audit (confirm-guarded) |

---

## REST API reference

```
GET    /api/settings                 -> { settings, tools, modelPresets }
PUT    /api/settings                 body: { audit?, browser?, enabledTools? }
                                     -> { settings, tools, modelPresets }

GET    /api/usage                    -> { inputTokens, outputTokens, totalTokens, audits, since }
POST   /api/usage/reset              -> reset cumulative usage

GET    /api/history/stats            -> { count, totalBytes }
POST   /api/history/maintenance      body: { action: 'clear' | 'rebuild' | 'purge', days? }
```

### settings.json shape

```json
{
  "audit": {
    "model": "claude-sonnet-4-6",
    "maxIterations": 12,
    "maxTokens": 8192,
    "headless": true,
    "temperature": 1,
    "extraInstructions": "",
    "defaultModule": "",
    "checksAllOn": false
  },
  "browser": {
    "viewportWidth": 1280,
    "viewportHeight": 800,
    "navTimeoutSec": 30,
    "maxLinks": 80
  },
  "enabledTools": { "playwright_screenshot": true, "...": true }
}
```

---

## How it's wired (for developers)

- `backend/src/services/settings.service.js` — load/save/normalize; `applyRuntime()`
  mutates the shared `config.playwright` object so the Playwright tools pick up
  headless / viewport / timeout / maxLinks at launch with no plumbing.
- `backend/src/services/usage.service.js` — cumulative token counter.
- `backend/src/services/audit.service.js` — reads settings each run: model,
  maxTokens, maxIterations, temperature, extra instructions, enabled-tool filter;
  tallies `response.usage` into `report.usage` + the cumulative counter.
- `backend/src/services/prompts.js` — `buildSystemPrompt(module, checks, requiredTools, extraInstructions)`.
- `backend/src/tools/playwright.tools.js` — reads `config.playwright.{viewport,navTimeoutMs,maxLinks}`.
- Frontend: `frontend/src/components/SettingsPanel.jsx` (slide-over), `api/client.js`.
