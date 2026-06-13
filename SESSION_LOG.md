# Session Log — QA Tool v2

A running, human-readable log of work done with Claude Code: each request and what was built/fixed, newest sections appended at the bottom. For the terse machine-readable resume state, see Claude's memory (`MEMORY.md` / `project_status.md`).

---

## ▶ Resume here (continue next session)

_Last updated: 2026-06-11._

**Where we are:** the tool works end-to-end against live Claude. Built so far: dev-vs-live detection + pre-launch framing (incl. ignoring HTTP/HTTPS on staging), link-type selector (Local/Staging/Live) with `file://` support, project-wise Figma tokens, figma 429 fix, merge-report fix, reliable evidence screenshots, editable prompt + version history (Admin), per-tool **Markdown ZIP export** (Phase 3), **page-section picker** (Phase 2), **meaningful date-time report IDs**, **accurate token usage** (counts failed audits), connection-drop retry, and a **multi-model AI manager** (Admin → AI Models: many models, each with its own API key; Settings dropdown to switch which one runs audits). **Gemini execution adapter** is built and live-reaching Google (last error was just an invalid API key — needs a valid `AIza…` key from aistudio.google.com/apikey). See dated sections below.

**Still pending / next up:**
1. **Gemini — finish validating:** user is adding a valid Google AI Studio key (`AIza…`) via Admin → AI Models → Edit. If a *new* error appears on a real run (function-call/schema/response-format), fix `backend/src/tools/geminiAdapter.js`. (Adapter confirmed working — it reached Gemini; only the key was invalid.)
2. **OpenAI execution adapter** — still gated (`PROVIDERS.openai.runnable=false`); build like the Gemini adapter when wanted (needs a test key).
3. **Markdown export — Phase 1:** multi-module selection (one `.md` per module in one ZIP). Phases 2+3 done.
4. **GitHub push (paused):** committed locally on `main`, no secrets committed; `gh` installed but **not authenticated**. Confirm canonical dir (`c:\projects\qa-tool-v2` vs `C:\projects\QA-Tool`) first, then `gh auth login` → `gh repo create qa-tool-v2 --public --source=. --remote=origin --push`.
5. Optional: group History by day; "Test model" button in Admin (1-call key/model check); Anthropic credits were low (console.anthropic.com → Plans & Billing) — switch active model to a funded key/profile if it recurs.

**How to run:**
```
cd backend  && npm run dev    # http://localhost:3001  (nodemon — auto-reloads)
cd frontend && npm run dev    # http://localhost:5173
```

**Gotchas (keep biting us):**
- After backend code changes, **restart with `npm run dev`** — plain `npm start` (node) does NOT auto-reload, so new routes 404 and the OLD error wording keeps showing (this is how we keep spotting a stale server).
- Only one backend on **port 3001** at a time (`EADDRINUSE` = an old instance still running — stop it first).
- **NEVER run create/edit/DELETE tests against the running backend / its JSON stores** — that's how a real Gemini profile got deleted. GET-only or test pure functions against a temp file.
- Screenshots/findings appear only on **new** audits.
- Secrets to keep gitignored: `.env`, `figma-projects.json`, `ai-models.json`, `prompt-config.json`, `.claude/`.

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

### 17. Gemini (Google) execution support — Phase B (Gemini)
**Request:** admin sets tokens/models, user switches between multiple models in Settings — including Gemini — and they run.
- New `backend/src/tools/geminiAdapter.js`: `makeGeminiClient(apiKey)` returns an object mimicking the Anthropic SDK surface the loop uses (`messages.create(params) → {content, stop_reason, usage}` with Anthropic-shaped text/tool_use blocks). Translates both ways to Google's `generateContent` REST API: system→systemInstruction, messages (user/assistant + tool_result + image blocks)→contents, tools(input_schema)→functionDeclarations, functionCall↔tool_use (tracks id→name per client since Gemini matches by name), usageMetadata→usage. So the agentic loop runs unchanged with `activeClient = makeGeminiClient(key)`.
- `aiModels.service.js`: `PROVIDERS.google.runnable = true` (OpenAI still false). `audit.service.js` resolve block branches on provider: google → makeGeminiClient(profile.apiKey) (errors if no key); anthropic → per-key Anthropic client. Connection/429 retry already covers Gemini (adapter throws status/APIConnectionError-shaped errors).
- ⚠️ **Untested against the live Gemini API** (no key at build). Syntax-checked + adapter shape verified only. Expect to iterate on the real call (schema/function-response format). Did NOT test against the user's live backend (per the no-destructive-tests rule).
- To use: restart backend → Admin → AI Models: set a Gemini profile (provider Google, model e.g. gemini-2.0-flash) + paste key via Edit → set active (Settings dropdown) → run audit.

### 16. Edit AI model token (Admin) + choose model in Settings
**Request:** add option in Admin to edit a model's token; in Settings choose which model runs audits.
- **Admin edit:** new `updateProfile(id, {label,model,provider,apiKey})` (`aiModels.service.js`) — blank apiKey keeps the current key; route `PUT /api/admin/ai-models/:id` (registered after `/active`). AdminPanel AI Models table got an **Edit** button → loads the profile into the form ("Save changes"/"Cancel"); key field blank = keep current.
- **Settings selector:** SettingsPanel loads `listAiModels()`; Audit Run Settings now has an **"AI model used for audits"** dropdown (when profiles exist) → `setActiveAiModel(id)`; the preset **Model** field is labelled as the fallback when a profile is active.
- Frontend builds clean; backend syntax-checked.
- ⚠️ **Incident:** while verifying the edit endpoint, my test backend crashed on `EADDRINUSE` (the user's backend already had :3001), so my `curl` add/delete hit the USER'S live store and **deleted their real "Gemini AI" profile** (key lost). Restored a "Gemini AI" placeholder with an empty key (re-enter via Edit) and cleared the active fake key. Lesson saved to memory: never run create/edit/DELETE tests against the user's running backend/stores; verify my own instance actually bound the port first.

### 15. Accurate ("perfect") token usage in Admin
**Request:** Admin should show perfect/accurate token use.
- Bug: `addUsage` was only called on a **successful** finalize, so tokens spent by audits that **failed** mid-run (credit error, connection drop, max-iterations) were never counted → Admin total under-reported.
- **Fix** (`audit.service.js`): wrapped the agentic loop in `try { … } finally { if (usage.calls > 0) addUsage(usage) }` so cumulative usage is recorded on **every** exit (success or failure), exactly once. Removed the old success-only `addUsage`.
- Admin **Token spend** panel already showed Input/Output/Total/since/reset; added an **"Avg / audit"** row. Backend restart needed to apply.

### 14. AI Models manager (multi-model + per-model API key) — Phase A
**Request:** Admin option to add/select multiple AI models and add a token. Chosen: model + its OWN API key per entry; providers = "other too" (but executed in phases).
- **Phase A (done):** add multiple model profiles in **Admin → 🤖 AI Models**, each with provider + model id + its own API key; pick the **active** one; remove. Keys stored backend-side, shown masked. The active profile **overrides the model and uses its own key** for audits — so you can add a *funded* Claude key (or cheaper Haiku) and switch instantly when one hits "credit too low".
- **Claude (Anthropic) runs today.** OpenAI/Gemini profiles can be saved/selected but are **gated**: selecting one makes an audit refuse up-front (`event: error` before any API call — verified, no credits/browser used) with a clear "provider not wired yet" message.
- Backend: `aiModels.service.js` → `backend/ai-models.json` `{profiles:[{id,label,provider,model,apiKey,createdAt}], activeId}` (gitignored — has keys); `PROVIDERS` map with `runnable` flag; routes under `/api/admin/ai-models` (list/add/active/delete). `audit.service.js` resolves the active profile → overrides `model`, builds a per-key Anthropic client (`activeClient`), gates non-runnable providers. Client/model verified via CRUD + gating tests.
- **Phase B (next, needs your test key):** OpenAI/Gemini adapters so those providers actually run the agentic loop (different function-calling formats + SDKs).

### 13. "Connection error" on a run → now retried
**Symptom:** audit ended on the Report step with "✗ Connection error." (backend was up, network to Anthropic fine).
- Cause: that message is the Anthropic SDK's `APIConnectionError` — the backend's connection to `api.anthropic.com` dropped mid-run (a transient network blip, or the backend restarting mid-audit while files were being edited / `nodemon` reload). The retry logic only retried Anthropic *overload* (429/500/503/529), not connection drops, so one blip killed the whole audit.
- **Fix** (`audit.service.js`): added `isConnectionError()` (APIConnectionError / fetch failed / ECONNRESET / ETIMEDOUT / ENOTFOUND / socket hang up, incl. `err.cause`) and folded it into `isRetryable`, so `createWithRetry` now backs off and retries dropped connections (status: "Connection to Claude dropped — retrying…"). Needs backend restart.

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
