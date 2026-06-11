# Session Log — QA Tool v2

A running, human-readable log of work done with Claude Code: each request and what was built/fixed, newest sections appended at the bottom. For the terse machine-readable resume state, see Claude's memory (`MEMORY.md` / `project_status.md`).

---

## ▶ Resume here (continue next session)

_Last updated: 2026-06-09._

**Where we are:** the tool works end-to-end against live Claude. This session added: dev-vs-live detection + pre-launch framing (incl. ignoring HTTP/HTTPS on staging), link-type selector (Local/Staging/Live) with `file://` support, project-wise Figma tokens, figma 429 fix, merge-report fix, reliable evidence screenshots, an editable prompt + version history in Admin, per-tool **Markdown ZIP export** (Phase 3), the **page-section picker** (Phase 2), and **meaningful date-time report IDs**. See the dated sections below for details.

**Still pending / next up:**
1. **Markdown export — Phase 1:** multi-module selection (pick several modules in Step 1 → one `.md` per module in a single ZIP). Phases 2 (section picker) + 3 (per-module .md) are done.
2. **GitHub push (paused):** repo committed locally on branch `main`, no secrets committed; `gh` CLI installed but **not authenticated**. Open question: confirm canonical dir (`c:\projects\qa-tool-v2` vs `C:\projects\QA-Tool`) before pushing. Then `gh auth login` → `gh repo create qa-tool-v2 --public --source=. --remote=origin --push`. Decided: name `qa-tool-v2`, **public**.
3. Optional: group History by day ("Today"/"Yesterday"); surface active prompt-version name on the report.

**How to run:**
```
cd backend  && npm run dev    # http://localhost:3001  (nodemon — auto-reloads)
cd frontend && npm run dev    # http://localhost:5173
```

**Gotchas (bit us this session):**
- After backend code changes, **restart with `npm run dev`** — plain `npm start` (node) does NOT auto-reload, so new routes 404 and logic looks "not applied".
- Only one backend on **port 3001** at a time (`EADDRINUSE` = an old instance is still running — stop it first).
- Screenshots/findings appear only on **new** audits (captured at run time), not on old saved reports.

---

## 2026-06-04 → 2026-06-09 · Feature & fix session

### 0. Resume + verified the tool works against live Claude
- Started both servers (backend :3001, frontend :5173).
- Confirmed the live-Claude audit loop works end to end (History already had real audits from 2026-06-03 against `s48589.p938.sites.pressdns.com`; a fresh smoke test on example.com ran the full tool → report flow).
- Closed the only open item from the prior handoff ("run one real audit against live Claude").

### 1. Dev-vs-live detection + code snippets + targeted screenshots
**Request:** Only add a screenshot when there's a mistake (targeted, not full-page) with clear detail; detect whether the URL is a dev/staging site vs live and frame the report accordingly; include the problem code + the fix.
- **New tool `detect_environment`** (`playwright.tools.js`) → classifies **production / staging / development / maintenance** from signals: noindex, staging/preview hostnames (e.g. `.sites.pressdns.com`), "coming soon"/maintenance text, lorem-ipsum/placeholder content, visible server errors, thin content. Runs on **every** audit.
- Report is framed as **pre-launch** for dev/staging (not marked down for noindex / missing analytics / placeholder content — those become "before going live" items).
- Findings gained **`codeProblem` + `codeFix`** (actual faulty code + corrected code). For elements with a selector, the element's real `outerHTML` is captured as code evidence.
- Stopped embedding the **full-page** screenshot; targeted highlighted shots are the evidence.

### 2. Link-type selector (Local / Staging / Live) + `file://` support
**Request:** Add an option for the link type — one local, one staging/dev, one live.
- **Segmented selector** on the Configure step: 🖥️ Local · 🚧 Staging/Dev · 🟢 Live.
- Remembers a **separate URL per type** (localStorage); placeholder changes per type.
- Sent to the backend as the **authoritative environment** (overrides/cross-checks auto-detection; mismatches noted).
- **`file://` support** for the Local type — audit a local HTML file directly (e.g. `file:///C:/…/page.html`). Verified by auditing the user's local file.
- **Bug fixed:** `App.jsx` referenced `websiteError` but its definition was commented out → would crash the Configure screen. Restored it.

### 3. Project-wise Figma access tokens
**Request:** Multiple Figma tokens, each named per project; pick a project → use its token.
- Backend store `figmaProjects.service.js` → `backend/figma-projects.json`. Raw tokens never leave the backend; the public list **masks** them (`••••last4`).
- API: `GET/POST /api/figma-projects`, `PUT /api/figma-projects/active`, `DELETE /api/figma-projects/:id`.
- Token resolution priority: **selected project → active project → `.env` FIGMA_TOKEN**; injected into `figma_fetch` at run time.
- UI: **⚙ Settings → Figma Project Tokens** (add/active/remove) + a **per-audit project dropdown** on Figma modules.

### 4. Fixed `figma_fetch` 429 rate-limit loop
**Symptom:** Figma audit looped — `figma_fetch` called repeatedly, each "Figma API 429: Too Many Requests".
- Root cause: each call hit Figma twice in parallel and Claude retried on every 429 (~8 requests/run) → rate-limited; the vague error invited retries. (Token was valid — 429 not 403.)
- **Fix:** backoff honoring `Retry-After`; the two calls made **sequential**; a clear "stop retrying, finalize" message on persistent 429; and a **per-run cache** so `figma_fetch` hits Figma **at most once per audit**.

### 5. Fixed merge-report "button does nothing"
**Symptom:** History → Merge did nothing, no report, no error.
- Root cause: `doMerge` used a blocking `window.confirm()` for multi-URL merges; if cancelled — or **suppressed in an embedded/VS Code webview** (returns false) — it silently aborted.
- **Fix:** removed the blocking confirm; merge always proceeds with a **non-blocking inline warning** when reports span different URLs. Added real error messages and a proper "⧉ Merged Report" header.
- **Lesson:** avoid `confirm()`/`alert()` for app flow — they no-op in webviews.

### 6. Made evidence screenshots reliable
**Request:** Reports often had no screenshot for mistakes — must add a screenshot for visible mistakes and clearly address them.
- Root cause: screenshots were only captured when Claude's CSS `selector` matched the live DOM; it often returned `null` or a brittle selector.
- **Fix:** added a **`textMatch`** field (visible-text snippet); the capture tool now falls back to locating by text when the selector misses. Prompt rule: every visible mistake must have a selector and/or textMatch. Run reports "Attached N/M evidence screenshot(s)". Each shot shows the element boxed in red with a "▼ issue" label.

### 7. GitHub push — IN PROGRESS (paused)
- `c:\projects\qa-tool-v2` initialized as a git repo; **initial commit made** on branch `main`; **no secrets committed** (`.env`, `figma-projects.json`, `.claude/`, reports, `node_modules` all gitignored). Added `.env.example`.
- `gh` CLI v2.93 installed; **not yet authenticated** (`gh auth login` is interactive — user runs it).
- **Open question:** a `git init` was run in a *different* folder `C:\projects\QA-Tool`; need to confirm which directory is canonical before pushing.
- Decisions: repo name `qa-tool-v2`, **public**.
- **Next:** confirm canonical dir → `gh auth login` → `gh repo create qa-tool-v2 --public --source=. --remote=origin --push`.

### 8. Editable prompt + version history (Admin)
**Request:** Change the prompt in the Admin panel; keep a history of prompts; revert to an old one.
- Scope = **Guided** (chosen): only the persona/instructions are editable; the run context (checks, required tools, environment) + JSON report contract (`REPORT_SHAPE`) are always added by code → an edit **can't break** report output.
- `prompts.js`: editable block extracted to `DEFAULT_INSTRUCTIONS`; `buildSystemPrompt` takes a 6th `instructions` arg and assembles `persona → Run context → REPORT_SHAPE`.
- New `promptConfig.service.js` → `backend/prompt-config.json` `{versions, activeId}` (max 30 versions). API under `/api/admin/prompt-config` (list / save / set-active / get / delete).
- **Admin → 📝 Prompts**: textarea editor + **Save as new version**, **version history** table (Edit / Restore / Delete, active badge), **Reset to default**. The active version is what every audit uses. Verified end to end.

### 9. Per-tool Markdown report export — Phase 3 (done)
**Request:** Generate per-tool reports as individual Markdown files, strictly scoped to (selected tools) × (selected sections) × (checked checkboxes), one file per tool, no mixing, screenshots under the right section.
- Agreed mapping: **"tool" = audit module**, **"section" = page sections** (Header/Hero/Footer…), build as an app feature in 3 phases. Started with **Phase 3**; screenshots delivered as **separate `.png` files in a ZIP** (render everywhere incl. GitHub).
- Added `jszip` dependency (frontend).
- New `lib/exportMarkdown.js`: `buildModuleMarkdown(report, label)` → markdown structured **Module → Findings & Fixes → Section-by-Section → Positives → Next steps**, with each section showing only the measured aspects mapped to the **checked** checks (`aspectsForChecks`), and `exportMarkdownZip()` → `<module>.md` + `images/*.png` in a ZIP download.
- Wired a **"⬇ Markdown (.zip)"** button into the report Export row ([AuditReport.jsx](frontend/src/components/steps/AuditReport.jsx)). Verified the markdown output on a real stored report.
- **Still to do (later phases):** Phase 1 = multi-module selection (→ several `.md` in one ZIP); Phase 2 = per-page-section picker (scan sections → tick which to test). Until then: one `.md` per run, all scanned sections, checked checks only.

### 12. Meaningful report IDs + cleaner date/time History
**Request:** Maintain history date/time-wise; don't use IDs like `QA-MQ7ZK2MX` — use proper, meaningful, easy-to-understand labels.
- **New report IDs** (`App.jsx`): generated at run time from the URL + module + timestamp → `YYYY-MM-DD_HHMM_<domain>_<module>_<suffix>` (e.g. `2026-06-09_1545_example-com_console_errors_k2x`). Date-time-first so it sorts naturally; filename-safe (passes backend `SAFE_ID`); works for `file://` (uses the filename). Old `QA-…` ids still load fine.
- **History list** (`HistoryPanel.jsx`): each row now shows a readable title **`<Module> · <domain>`** + a prominent **🕒 full date & time**; the raw id is no longer displayed (kept only as a hover tooltip). Listing was already sorted newest-first by `generatedAt` (backend unchanged).
- Frontend-only — just refresh the browser.

### 11. Per-page-section picker — Phase 2 (done)
**Request:** "Where is the option to select section?" — it wasn't built yet.
- Backend: `auditWebSections(url, {withShots})` can now skip screenshots; new fast endpoint **`POST /api/sections`** returns section **names/tags/counts only** (no screenshots), supports `file://`. audit pipeline accepts `sections` (array of selected names): `buildUserMessage` tells the agent "only review these page sections…", and finalize **filters `report.sections`** to the selected names (empty = all).
- Frontend: **ConfigureAudit** has a new "Page Sections (optional)" card — **🔍 Scan page sections** button → lists detected sections as checkboxes (default all selected) with select-all/deselect-all; selection stored in `inputs.sections` and sent with the run. Verified `/api/sections` on the user's site → 11 named sections (header, per-heading sections, footer).
- Scoping: empty selection = whole page (unchanged). The Markdown export (Phase 3) already renders `report.sections`, so it's automatically scoped.
- Remaining: Phase 1 (multi-module selection → one .md per module in one ZIP).

### 10. Ignore HTTP/HTTPS issues on staging/pre-launch sites
**Request:** If the link type is Staging / pre-launch, ignore HTTP-vs-HTTPS — don't report it as an issue.
- Updated the pre-launch framing in `prompts.js` (`buildEnvBlock`): for any non-production environment (Local / Staging / Dev / Maintenance), the agent now **ignores transport security** — no findings/criticalIssues and **no score penalty** for HTTP-instead-of-HTTPS, mixed-content (http:// assets), insecure-resource, or SSL/TLS certificate warnings. At most one "serve over HTTPS before launch" note in Next Steps. Genuine security flaws (exposed secrets, injection) are still reported.
- Prompt-only change → applies to **new** audits after a backend restart. Live audits are still held to full HTTPS standards.

---

### ⚠️ Recurring gotchas noted this session
- **Restart the backend after backend code changes.** Plain `npm start` (node) does **not** auto-reload — use `npm run dev` (nodemon). A stale server shows 404 on new routes and won't pick up logic changes.
- **Port 3001 collisions:** only run one backend at a time. If you see `EADDRINUSE`, an old instance is still listening — stop it first.
- Screenshots/findings only appear on **new** audits (captured at audit time), not on old saved reports.
