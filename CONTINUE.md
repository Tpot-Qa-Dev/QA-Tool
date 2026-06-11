# Continue here — session handoff

> ⚠️ **Current state lives in [`SESSION_LOG.md`](SESSION_LOG.md) → "▶ Resume here".**
> That file has the up-to-date status, what's pending (Markdown export Phase 1, GitHub push), how to run, and gotchas. The notes below are the original 2026-06-01 handoff, kept for reference.

---

Quick context so you can resume fast next session.

## ▶ Start the app
```
# Terminal 1 — backend (port 3001)
cd backend
npm run dev        # nodemon, auto-reloads on file change

# Terminal 2 — frontend (port 5173)
cd frontend
npm run dev        # Vite, open http://localhost:5173
```

## ⚠️ IMPORTANT — restart the backend first
A lot of backend code changed today. **A server started earlier in the day is stale.** Restart it so everything is live, otherwise:
- `/api/admin/*` returns **404** (Admin dashboard won't load)
- screenshots + checks won't appear in reports
- the "no futile retry" enforcement won't apply

`npm run dev` (nodemon) auto-reloads on save; plain `node src/server.js` does **not** — restart manually.

## 🔑 API keys (backend/.env)
- `CLAUDE_API_KEY` — ✅ set and working (the daily/monthly usage limit reset today).
- `FIGMA_TOKEN` — ❌ not set → `figma_fetch` returns 403 (Figma vs Web needs this).
- `PSI_API_KEY` — ❌ not set → `pagespeed_audit` returns 429 (optional, Core Web Vitals).

These two ✗ are **expected/handled** — the audit still finishes; only those data points are missing. Add the keys + restart to enable them. The other 8 Playwright tools need no keys.

## ✅ What was done today (all built + verified, frontend builds clean)
1. **Critical fix:** screenshot base64 was sent to Claude as text → "prompt too long (2.2M tokens)". Now sent as an **image block** (Claude can see it, ~1.5k tokens). + 200k-char cap on any tool result. (`audit.service.js`, bug #11)
2. **Enforcement loop:** required tools that fail for a permanent reason (missing key) are attempted once, not retried forever; reported as `failedRequiredTools` vs `skippedRequiredTools`.
3. **Rich HTML report:** embeds the **screenshot**, "Checks Tested" chips, per-module **Problem / Severity / How-to-fix** tables, critical issues, positives, next steps. Both full + custom-section export. (`report.screenshots`, `report.checks` added backend-side.)
4. **Recent URLs:** website + **Figma** URL remembered (localStorage), shown as datalist + chips.
5. **More Settings:** temperature, extra instructions, browser viewport/timeout/maxLinks, audit defaults (default module, checks-all-on), token usage + reset.
6. **📊 Admin dashboard** (new header button): reports count, token spend, per-module stats, recent audits, **prompt inspection**, test catalogue. Read-only.
7. Select-all checks toggle; clickable logo → home; report links open in new tab (rel=noopener).

## ⏭ Suggested next steps
- **Run one real end-to-end audit** from the UI (key quota is back) and confirm: it completes, screenshot shows in the report + HTML export, and it lands in History. This is the last thing not yet confirmed against live Claude.
- If you want Figma vs Web: add `FIGMA_TOKEN`, restart, retry.
- Optional polish: ✕-to-remove on recent-URL chips; if history files get big from embedded screenshots, switch to storing screenshots as separate files; optionally merge management actions into Admin.

## 🗂 Where things live
- Backend services: `backend/src/services/` (audit, history, settings, usage, admin, prompts)
- Tools: `backend/src/tools/` (playwright.tools.js, figma.tool.js, pagespeed.tool.js, index.js)
- Frontend panels: `frontend/src/components/` (HistoryPanel, SettingsPanel, AdminPanel)
- Steps: `frontend/src/components/steps/` (SelectModule, ConfigureAudit, RunningAudit, AuditReport)
- Docs: `SETTINGS.md` (settings reference), this file.

Full details are in Claude's memory (`MEMORY.md` index): project-overview, -architecture, -modules, -tools, -history, -settings, -ux, -admin, -bugs.
