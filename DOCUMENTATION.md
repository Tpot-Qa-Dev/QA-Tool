# QA Automation Tool — Full Documentation

A complete guide to what this project is, how it works, and how to run it.
Written so that **anyone** — even without deep technical background — can understand it.

---

## Table of Contents

1. [What is this project?](#1-what-is-this-project)
2. [The core idea (in plain words)](#2-the-core-idea-in-plain-words)
3. [How it works — the full flow](#3-how-it-works--the-full-flow)
4. [Architecture](#4-architecture)
5. [Project structure (file by file)](#5-project-structure-file-by-file)
6. [The tools the audit uses](#6-the-tools-the-audit-uses)
7. [Installation & setup](#7-installation--setup)
8. [Running the project](#8-running-the-project)
9. [Using the app (the 4-step wizard)](#9-using-the-app-the-4-step-wizard)
10. [The MCP server (optional, separate)](#10-the-mcp-server-optional-separate)
11. [Configuration (environment variables)](#11-configuration-environment-variables)
12. [Troubleshooting](#12-troubleshooting)
13. [Tech stack](#13-tech-stack)
14. [Glossary](#14-glossary)

---

## 1. What is this project?

**QA Automation Tool** is a web application that **automatically tests websites for quality
problems** — broken links, slow loading, JavaScript errors, accessibility issues, SEO gaps,
form failures, and design mismatches.

Instead of a human manually checking each thing, the tool:

- Opens the target website in a **real browser** (Chromium),
- Inspects it with automated checks,
- Uses **Claude AI** to decide what to test and to write a clear report.

You give it a URL, tick the checks you want, click Run — and a few moments later you get a
graded report (score out of 100, pass/warn/fail, findings, and fixes).

---

## 2. The core idea (in plain words)

There are three "characters" in this project:

| Character | Role | Analogy |
|-----------|------|---------|
| **Playwright** | Controls a real Chromium browser, gathers facts about the page | The *hands* — actually opens and pokes the website |
| **Claude AI** | Decides which checks to run, reads the results, writes the report | The *brain* — the QA expert making decisions |
| **The app** (frontend + backend) | Connects them and shows you the result | The *workspace* — where you and the tools meet |

The key concept: **Claude is the orchestrator.** The backend does not hard-code a fixed test
script. It hands Claude a set of *tools* (screenshot, check links, measure speed, …) and a
goal ("audit this website"). Claude then calls those tools — one after another — until it has
enough information, then writes the final report. This is called an **agentic loop**.

---

## 3. How it works — the full flow

Here is exactly what happens, start to finish, when you run an audit:

```
   YOU                FRONTEND              BACKEND               CLAUDE AI            PLAYWRIGHT
    │                    │                     │                     │                    │
    │ pick module,       │                     │                     │                    │
    │ enter URL, tick    │                     │                     │                    │
    │ checkboxes, Run ──► │                     │                     │                    │
    │                    │ POST /api/audit ──► │                     │                    │
    │                    │                     │ "audit this URL,    │                    │
    │                    │                     │  here are tools" ─► │                    │
    │                    │                     │                     │ "run screenshot"   │
    │                    │                     │ ◄─────────────────  │                    │
    │                    │                     │ executeTool() ──────┼──────────────────► │
    │                    │                     │                     │     opens Chromium,│
    │                    │                     │ ◄───────────────────┼──── returns data ──│
    │                    │  ◄── SSE progress ── │ send result back ─► │                    │
    │  see live progress │     events          │                     │ "run check_links"  │
    │                    │                     │        … loop repeats until Claude is done …
    │                    │                     │                     │                    │
    │                    │                     │ ◄── final JSON ──── │ writes report      │
    │                    │  ◄── SSE complete ── │                     │                    │
    │  see the report    │                     │                     │                    │
```

### Step by step

1. **You configure the audit** in the browser — choose one of 5 modules, type the website
   URL, and tick which checks to run.
2. The frontend sends a `POST /api/audit` request to the backend with `{ url, module, checks }`.
3. The backend **opens a streaming connection** (Server-Sent Events) so it can send live
   updates back as the audit runs.
4. The backend asks **Claude** to audit the URL, and tells Claude which **tools** are available.
5. Claude replies: *"call the `playwright_screenshot` tool"* (for example).
6. The backend **runs that tool** — Playwright launches Chromium and does the real work.
7. The tool result is **sent back to Claude**.
8. Steps 5–7 **repeat** (the agentic loop) — Claude keeps calling tools until it has enough
   data. Each step is streamed to your screen as a progress update.
9. When Claude has enough information, it writes the **final report as JSON**.
10. The backend streams that report to the frontend, which displays it on **Step 4**.

> The loop is capped at **12 iterations** so it can never run forever.

---

## 4. Architecture

The project has **two independent programs** that talk to each other, plus an optional third:

```
┌─────────────────────────┐         ┌──────────────────────────────────┐
│   FRONTEND               │  HTTP   │   BACKEND                         │
│   React + Vite           │ ──────► │   Node.js + Express               │
│   Port 5173              │ ◄────── │   Port 3001                       │
│   (the user interface)   │   SSE   │   (the brain + tool runner)       │
│   No API keys here       │         │                                   │
└─────────────────────────┘         │   ├─ talks to Claude API          │
                                     │   └─ runs Playwright (Chromium)   │
                                     └──────────────────────────────────┘

         OPTIONAL, SEPARATE:
┌─────────────────────────┐         ┌──────────────────────────────────┐
│   Claude Desktop app    │  stdio  │   MCP SERVER                      │
│                         │ ──────► │   backend/mcp/server.js           │
│                         │ ◄────── │   exposes the SAME Playwright     │
│                         │         │   tools to Claude Desktop         │
└─────────────────────────┘         └──────────────────────────────────┘
```

**Why two programs?**
- The **frontend** is what you see — buttons, forms, the report. It is "dumb" on purpose: it
  holds no secrets and just talks to the backend.
- The **backend** holds the API keys, talks to Claude, and runs the browser. Keeping keys here
  (never in the frontend) is a basic security rule.

**Why a separate MCP server?**
- The web app is one way to use the tools. The **MCP server** is a second way — it lets
  *Claude Desktop* use the same Playwright tools directly. It is optional and not part of the
  web app flow. See [section 10](#10-the-mcp-server-optional-separate).

---

## 5. Project structure (file by file)

```
qa-tool-v2/
│
├── README.md                  Quick-start summary
├── DOCUMENTATION.md           This file — the full guide
├── .gitignore                 Files git should never commit (e.g. .env)
│
├── backend/                   ── THE BACKEND (Node.js + Express) ──
│   ├── package.json           Backend dependencies & scripts
│   ├── .env.example           Template for environment variables
│   ├── .env                   Your real keys (you create this — never shared)
│   │
│   ├── src/
│   │   ├── server.js          Entry point — starts the HTTP server
│   │   ├── app.js             Builds the Express app (middleware + routes)
│   │   │
│   │   ├── config/
│   │   │   └── index.js       Loads .env into one config object
│   │   │
│   │   ├── routes/            ── WHICH URL goes WHERE ──
│   │   │   ├── index.js         Combines all routes under /api
│   │   │   ├── health.routes.js GET  /api/health
│   │   │   └── audit.routes.js  POST /api/audit
│   │   │
│   │   ├── controllers/       ── HANDLES the request/response ──
│   │   │   ├── health.controller.js  Reports server + key status
│   │   │   └── audit.controller.js   Validates input, opens the SSE stream
│   │   │
│   │   ├── services/          ── THE BUSINESS LOGIC ──
│   │   │   ├── audit.service.js  The agentic loop (talks to Claude)
│   │   │   └── prompts.js        Builds the instructions sent to Claude
│   │   │
│   │   ├── tools/             ── THE ACTUAL TESTS ──
│   │   │   ├── index.js              Tool registry (names → functions)
│   │   │   ├── playwright.tools.js    8 real browser checks
│   │   │   ├── pagespeed.tool.js      Google PageSpeed Insights API
│   │   │   └── figma.tool.js          Figma design API
│   │   │
│   │   └── utils/
│   │       └── sse.js         Helpers for live streaming to the browser
│   │
│   └── mcp/                   ── OPTIONAL MCP SERVER ──
│       ├── server.js          Standalone server for Claude Desktop
│       └── tool-schemas.js    Tool descriptions for MCP
│
└── frontend/                  ── THE FRONTEND (React + Vite) ──
    ├── package.json           Frontend dependencies & scripts
    ├── index.html             The HTML shell
    ├── vite.config.js         Dev server config (proxies /api to backend)
    │
    └── src/
        ├── main.jsx           React entry point
        ├── App.jsx            The 4-step wizard (ties everything together)
        │
        ├── api/
        │   └── client.js      Talks to the backend, decodes the SSE stream
        │
        ├── config/
        │   └── modules.js     The 5 modules + their checkbox groups
        │
        ├── hooks/
        │   ├── useAudit.js    Holds audit state (progress, logs, report)
        │   └── useTheme.js    Dark / light theme state
        │
        ├── lib/
        │   ├── colors.js      Colour helpers (theme-aware)
        │   ├── reportStats.js Turns the report into pass/warn/fail rows
        │   └── exportReport.js Export to HTML / CSV / JSON / clipboard
        │
        ├── styles/
        │   ├── theme.css      Colour tokens for dark & light themes
        │   ├── global.css     Page reset + fonts
        │   └── app.css        All component styling
        │
        └── components/
            ├── Header.jsx         Logo, report id, status, theme toggle
            ├── ThemeToggle.jsx    Dark/light switch
            ├── StepIndicator.jsx  The 1-2-3-4 progress bar
            ├── Checkbox.jsx       Custom checkbox with a tick
            └── steps/
                ├── SelectModule.jsx    Step 1 — pick a module
                ├── ConfigureAudit.jsx  Step 2 — URLs + checkboxes
                ├── RunningAudit.jsx    Step 3 — live progress
                └── AuditReport.jsx     Step 4 — the final report
```

### How the backend layers fit together

A request flows through the layers like this — each layer has **one job**:

```
  HTTP request
      │
      ▼
  routes/      → "POST /api/audit goes to the audit controller"
      │
      ▼
  controllers/ → checks the input is valid, opens the live stream
      │
      ▼
  services/    → runs the agentic loop (the real work)
      │
      ▼
  tools/       → executes a single check (e.g. take a screenshot)
```

This separation is why the code is easy to read: if links checking is broken you look in
`tools/`, if the loop misbehaves you look in `services/`, if a URL is wrong you look in
`routes/`.

---

## 6. The tools the audit uses

Claude can call any of these **10 tools**. It picks which ones based on the module and the
checks you ticked.

### Playwright tools (real browser — `playwright.tools.js`)

| Tool | What it checks |
|------|----------------|
| `screenshot` | Captures a full-page screenshot in real Chromium |
| `console_errors` | JavaScript errors, warnings, failed network requests |
| `check_links` | Every link on the page — finds 404s / broken links |
| `audit_forms` | Form fields, labels, validation, method, accessibility |
| `web_vitals` | Real performance metrics (LCP, FCP, TTFB) |
| `detect_tracking` | Analytics scripts — GA4, GTM, FB Pixel, Hotjar, Clarity |
| `accessibility` | Missing alt text, unlabelled inputs, heading structure |
| `meta_audit` | Title, meta description, Open Graph tags, schema markup |

### External API tools

| Tool | What it does |
|------|--------------|
| `pagespeed` | Calls Google PageSpeed Insights for Lighthouse scores |
| `figma` | Fetches a Figma design file's colours, fonts, and styles |

---

## 7. Installation & setup

### Prerequisites

- **Node.js 20 or newer** (the project is tested on Node 24)
- An **Anthropic API key** — required, the audit cannot run without it
- (Optional) a Google PageSpeed key and a Figma token

### Step 1 — Install the backend

```bash
cd backend
npm install
npm run install-browsers      # downloads the Chromium browser for Playwright
```

### Step 2 — Add your API key

```bash
cp .env.example .env
```

Then open `backend/.env` and fill in your key:

```
CLAUDE_API_KEY=sk-ant-api03-...your key here...
```

Get a key at **console.anthropic.com → API Keys**.
`PSI_API_KEY` and `FIGMA_TOKEN` are optional and can be left blank.

### Step 3 — Install the frontend

```bash
cd ../frontend
npm install
```

---

## 8. Running the project

You need **two terminals** — one for each program.

```bash
# Terminal 1 — Backend (start this first)
cd backend
npm run dev          # auto-restarts on file changes
#  → "QA Tool Backend — http://localhost:3001"

# Terminal 2 — Frontend
cd frontend
npm run dev
#  → opens http://localhost:5173
```

Open **http://localhost:5173** in your browser.

| Script | What it does |
|--------|--------------|
| `npm start` | Run the backend normally |
| `npm run dev` | Run the backend with auto-restart on changes |
| `npm run mcp` | Run the standalone MCP server |
| `npm run install-browsers` | Download Chromium for Playwright |

> If `npm run dev` fails with "nodemon not found", run `npm install` in `backend/` first.

---

## 9. Using the app (the 4-step wizard)

The interface is a **4-step wizard** — a progress bar at the top shows where you are.

### Step 1 — Select Module

Pick one of five test modules. Each focuses on a different area:

| Module | Tests for |
|--------|-----------|
| **Figma vs Web** | Design accuracy — does the live site match the Figma design? |
| **SEHSHAT Tracking** | Links, buttons, forms, and analytics/tracking scripts |
| **Form Submission** | Whether forms work and validate correctly |
| **Console Errors** | JavaScript errors and network failures |
| **Core Web Vitals** | Speed metrics and HTML markup quality |

### Step 2 — Configure

- Enter the **website URL** (required).
- For *Figma vs Web*, also enter the **Figma file URL**.
- **Tick the checkboxes** for exactly what you want tested. Each module has two groups of
  checks; use **Select all / Deselect all** to toggle a whole group.
- The ticked checks are sent to Claude so it focuses the audit on what you chose.

### Step 3 — Running

Watch the audit happen live:
- A progress bar (0–100%),
- Stage pills (Launching browser → Loading page → …),
- The real Playwright tool calls as Claude makes them,
- A streaming log.

### Step 4 — Report

The finished report shows:
- An overall **score (%)** and letter grade,
- **Pass / Warning / Failed** counts,
- A detailed **results list**,
- Recommended **next steps**,
- **Export** buttons — HTML, CSV, JSON, or copy a summary to the clipboard,
- **Re-run** (same settings) or **New Audit** (start over).

### Dark / light theme

The toggle in the top-right switches between dark and light mode. Your choice is remembered
between visits.

---

## 10. The MCP server (optional, separate)

**MCP** (Model Context Protocol) is a standard that lets AI apps like **Claude Desktop**
use external tools.

This project includes an MCP server (`backend/mcp/server.js`) that exposes the **same 10
tools** to Claude Desktop. It is **completely separate** from the web app — the web app does
not use it.

To use it, add this to Claude Desktop's config file
(`~/.config/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "qa-playwright": {
      "command": "node",
      "args": ["C:/Users/admin/Downloads/qa-tool-v2/backend/mcp/server.js"],
      "env": {
        "PSI_API_KEY": "AIza...",
        "FIGMA_TOKEN": "figd_..."
      }
    }
  }
}
```

Then Claude Desktop can run "take a screenshot of example.com" directly.

**Two ways to use the tools, pick one:**
- **Web app** → Frontend → Backend → Claude API → Playwright
- **MCP** → Claude Desktop → MCP server → Playwright

---

## 11. Configuration (environment variables)

All settings live in `backend/.env`:

| Variable | Required | Purpose |
|----------|----------|---------|
| `CLAUDE_API_KEY` | ✅ Yes | Anthropic API key — the audit cannot run without it |
| `PSI_API_KEY` | ○ Optional | Google PageSpeed key (works without one at a lower rate) |
| `FIGMA_TOKEN` | ○ Optional | Figma access token — needed only for the Figma module |
| `PORT` | ○ Optional | Backend port (default `3001`) |
| `FRONTEND_URL` | ○ Optional | Allowed frontend origin for CORS (default `http://localhost:5173`) |
| `HEADLESS` | ○ Optional | `true` (default) runs the browser invisibly; `false` shows the Chromium window — useful for debugging |

> **Never commit `.env` to git.** It contains secrets and is already listed in `.gitignore`.

---

## 12. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Claude: ✗ MISSING` on startup | No API key set | Add `CLAUDE_API_KEY` to `backend/.env` and restart |
| **"Your credit balance is too low"** | The Anthropic account has no credits | Add credits at console.anthropic.com → Plans & Billing. *This is a billing issue, not a code bug.* |
| Header shows **"offline"** | Backend not running | Start the backend (`npm run dev` in `backend/`) |
| Run button stays disabled | URL empty, no checks ticked, or backend offline | Fill the URL, tick at least one check, ensure the backend is up |
| `npm run dev` — "nodemon not found" | Dependencies not installed | Run `npm install` in `backend/` |
| Playwright errors about a missing browser | Chromium not downloaded | Run `npm run install-browsers` in `backend/` |
| Audit reaches "Max iterations" | Claude could not finish in 12 steps | Try fewer checks, or a simpler/faster page |

### About cost

The Claude API has **no free tier** — every audit spends a small amount of credit (a few
cents for a full audit). You must keep a positive balance in your Anthropic account.

---

## 13. Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite 5 |
| Backend | Node.js, Express 4 |
| AI | Anthropic Claude API (`claude-sonnet-4`) |
| Browser automation | Playwright (Chromium) |
| Live updates | Server-Sent Events (SSE) |
| Tool protocol (optional) | Model Context Protocol (MCP) |
| External APIs | Google PageSpeed Insights, Figma REST API |
| Dev reload | nodemon |
| Fonts | Space Grotesk, JetBrains Mono |

---

## 14. Glossary

| Term | Meaning |
|------|---------|
| **Agentic loop** | The cycle where Claude calls a tool, sees the result, then decides the next tool — repeating until done |
| **Tool / tool-use** | A function Claude can ask the backend to run (e.g. "take a screenshot") |
| **SSE (Server-Sent Events)** | A one-way live stream from server to browser — used to show audit progress in real time |
| **MCP (Model Context Protocol)** | A standard way to expose tools to AI apps like Claude Desktop |
| **Playwright** | A library that controls a real browser (Chromium) with code |
| **Headless** | Running the browser invisibly, with no window on screen |
| **Core Web Vitals** | Google's key performance metrics: LCP, FID/INP, CLS |
| **Module** | A preset bundle of related checks (e.g. "Console Errors") |
| **Report** | The final graded result Claude produces — score, findings, fixes |

---

*QA Automation Tool v1.0 — Claude AI + Playwright. For the short version, see [README.md](README.md).*
