# QA_Tool — Project Handoff & Database Migration Status

**For:** Senior review
**Prepared by:** Vatsal
**Date:** 2026-06-18
**Topic:** Project overview, current status, and the JSON → PostgreSQL migration

---

## ⏯ RESUME HERE — latest status (updated 2026-06-25)

> Read this section first if you've switched machines / started a new chat. It
> summarises everything done since the original 2026-06-18 handoff below.

### A. UI "professional overhaul" — ✅ DONE (build passes)
Restyled the whole frontend to a **Neutral / minimal mono** look (near-monochrome,
one muted blue accent `#3b82f6`/`#2563eb`, NO gradients / glow / 3D tilt, mono font
reserved for IDs/code/numbers only). `cd frontend && npm run build` is clean.
- `styles/theme.css` — palette tokens (already done earlier).
- `styles/fx.css` — stripped the entire neon layer (gradients, glows, glass blur,
  3D `preserve-3d`, button glows) → flat surfaces + `var(--border)` + `--shadow-sm`;
  reveal is opacity-only; deleted unused `--glow` vars; `--radius` 14→10.
- `styles/app.css` — de-gradiented header/logo/title, run/ghost buttons, progress
  bar, theme toggle, admin sidebar; switched decorative mono pills to the UI font
  (kept mono for IDs/code).
- `styles/global.css` — display font `Space Grotesk` → **Inter** (kept JetBrains Mono).
- `lib/motion.js` — `attachTilt` is now a no-op.
- `lib/muiTheme.js` — TOKENS = new palette; button radius 20→8; removed forced-mono chips; Inter.
- *Follow-up:* visual QA in the running app (light + dark) — build only checks it compiles.

### B. Code cleanup — partially applied
- ✅ Applied: `db/migrate.js` + `db/import-reports.js` now use side-effect import
  `import '../config/index.js'` (dropped unused binding + eslint-disable).
- ⏭ Skipped (cosmetic, left as-is on purpose): redundant `byModel: {}` in
  `usage.service.js resetUsage`; `publicUser` export style in `auth.service.js`.

### C. AI models / OpenRouter — fixed, needs verify
Symptom seen: audit failed with **`OpenRouter API 402: ... requested up to 8192
tokens, but can only afford 4329`**. That is an OpenRouter *credit* limit, NOT a
bug — it proves the integration works (auth + routing succeeded).
- ✅ `tools/openrouterAdapter.js` — added a one-time **auto-retry**: on a 402
  "can only afford N", it retries clamped to N so low/free-credit keys still run
  (shorter output cap).
- ✅ `components/AdminPanel.jsx` — added OpenRouter `MODEL_PRESETS` (tool-capable
  slugs: `anthropic/claude-3.5-sonnet`, `openai/gpt-4o-mini`,
  `google/gemini-2.0-flash-001`, `deepseek/deepseek-chat`).
- **How OpenRouter differs from Gemini:** Gemini adapter calls Google directly with
  a Gemini id; OpenRouter adapter calls OpenRouter's OpenAI-compatible API with a
  **provider-prefixed slug** (e.g. `anthropic/claude-3.5-sonnet`). ONE OpenRouter
  key unlocks many models — add one profile per model (same key, different slug).
- ⚠️ **Critical:** this is an agentic **tool-calling** loop. Many small/free
  OpenRouter models don't support tools and will fail/loop. Use tool-capable models.
- ▶ TO VERIFY: **restart the backend**, then re-run an audit on the OpenRouter
  profile; for full-length reports add OpenRouter credit. (Optional TODO offered:
  friendlier UI message when a chosen model doesn't support tool calling.)

### D. Backend RBAC + Postgres — built, operational steps may be pending
JWT+bcrypt auth, owner-scoped reports, admin user management all built (see §5–8
below). Reports + users/roles are in Postgres; the other services
(settings/usage/aiModels/figmaProjects/customchecks/promptConfig) are **still
JSON-backed** (mixed data layer by design for now).
- Verify these ran on this machine: `cd backend && npm run migrate` (applies 002),
  `npm run seed:admin` (needs `ADMIN_EMAIL`/`ADMIN_PASSWORD` in `backend/.env`).
  `JWT_SECRET` is set in `backend/.env`.

### E. Git / uncommitted
Large uncommitted working tree on branch **staging** (all of the above). Nothing
has been committed yet — consider committing while builds are green.

---

## 0. What the project is

**QA_Tool** is a real, browser-automation QA suite used as a **company product**
(not a personal/demo tool). It runs automated quality audits on any website URL
and produces a scored report with findings.

**How it works:**
- **Claude AI** orchestrates real browser automation via the **MCP protocol** in
  an agentic loop (the AI decides which tools to run, runs them, reads results).
- **Playwright** drives a real Chromium browser to run 8 audit tools:
  screenshot, console errors, link checking, form audit, web vitals, tracking
  detection, accessibility, and meta/SEO audit.
- Optional integrations: **Google PageSpeed Insights** and **Figma** REST API.

**Architecture (clean layered split):**
- `backend/` — Node.js + Express (port 3001). Routes → Controllers → Services →
  Tools. Holds all API keys; streams progress to the UI via Server-Sent Events.
- `frontend/` — React + Vite (port 5173). No API keys; calls the backend only.
- `backend/mcp/` — standalone MCP server so Claude Desktop can use the same tools.

**Product requirements driving current work:**
- **Multi-user** with **role-based access control** (admin / editor / viewer).
- **Switchable AI models** — each model profile has its own API key (already exists).
- **Token billing / usage tracking** — needs reliable, concurrent-safe counters.
- Must meet production standards: auth, data integrity, concurrent access.

---

## 1. Summary

QA_Tool currently stores all data in flat JSON files. Since it's a real
multi-user product with role-based access (RBAC) and token billing, we are
moving storage to **PostgreSQL** for relational integrity, transactions, and
concurrent-access safety. Nested audit reports will live in a `JSONB` column.

This document is a status snapshot of where the migration stands and what's next.

## 2. Key decisions

| Decision | Choice | Reason |
|---|---|---|
| Database | **PostgreSQL** (over MongoDB) | Relational integrity for users → roles, transactions for usage/billing, JSONB for nested reports |
| Hosting | Native Homebrew install on macOS | No Docker / no cloud — kept simple for a basic project |
| DB layer | **node-postgres (`pg`) + plain `.sql` migrations** | Transparent, no ORM, matches existing hand-written service style |
| Migration approach | Phased, test each phase before next | Lower risk; controllers/routes/frontend stay untouched |

## 3. Target schema

Replacing the 7 JSON stores with tables, plus new RBAC tables:

- `reports` — full audit report stored in a `JSONB` column
- `settings` — single config row
- `usage` — token/usage tracking
- `ai_models` — switchable AI models (each with its own API key)
- `figma_projects`
- `custom_checks`
- `prompt_versions`
- **`users` + `roles`** — new, for multi-user RBAC

## 4. Migration phases

1. **Connect DB + create tables** ← *currently here*
2. Migrate the 7 services from JSON reads/writes → SQL (keep every exported
   function name identical so controllers/routes/frontend don't change)
3. Users + auth (hashed passwords)
4. RBAC route guards

## 5. Progress so far

**Done:**
- PostgreSQL installed and running (`pg_isready` = accepting connections on 5432)
- Database created (`createdb qa_tool`)
- `pg` package installed
- `backend/.env` created with DB connection keys (`DB_USER=apple`, empty password locally)
- Connection pool at `backend/src/config/database.js` (reused existing config file, no duplicate path)
- Migration runner: `backend/src/db/migrate.js` — plain-SQL, idempotent, tracks a `schema_migrations` table
- Schema file: `backend/src/db/migrations/001_init.sql` (all tables above)
- Added `"migrate": "node src/db/migrate.js"` script to `package.json`

**Not yet done / blocking next step:**
- ⏳ Migration has **not been run yet** — `psql -d qa_tool -c "\dt"` currently shows **no tables**. Next action is to run `npm run migrate` from `backend/` and verify tables were created.

## 6. Next action

```bash
cd backend
npm run migrate
psql -d qa_tool -c "\dt"   # verify the 10 tables exist
```

Once tables are confirmed → start **Phase 2** (swap each service in
`backend/src/services/` from JSON-file storage to SQL, keeping all exported
function names identical).

## 7. Overall project status

| Area | Status |
|---|---|
| Core QA engine (Claude + Playwright + MCP) | ✅ Built & working |
| Frontend (React UI, audit run, report view/export) | ✅ Built & working |
| AI model manager (switchable models, per-model keys) | ✅ Working (JSON-backed) |
| Storage | 🔄 Migrating JSON files → PostgreSQL (**Phase 1 ✅ done — 11 tables created**; Phase 2 next) |
| Multi-user + RBAC (users, roles, route guards) | ⏳ Planned — Phases 3 & 4 |
| Auth / hashed passwords | ⏳ Planned — Phase 3 |

**In one line:** the product works today on JSON-file storage; we're partway
through replacing that storage with PostgreSQL so it can safely support
multiple users, roles, and billing at production scale.

## 8. What is required now (immediate next steps)

1. ~~Run the first migration~~ ✅ **Done** — `npm run migrate` succeeded, all 11
   tables exist (10 from the schema + `schema_migrations` tracker).
2. **Phase 2 — rewrite the 7 services** to read/write SQL instead of JSON,
   keeping every exported function name identical so the rest of the app is untouched.
3. **Phase 3 — auth:** seed `roles`, add user signup/login with **hashed**
   passwords (the `users.password_hash` column is already in the schema).
4. **Phase 4 — RBAC guards:** middleware on routes so each role only accesses
   what it's allowed to.
5. **Decision needed from senior on the two open questions below** before Phase 3.

## 9. Open questions for senior

- API keys (AI models + Figma tokens) are currently stored **plaintext**; the
  plan keeps that behaviour for now. Should we encrypt them as part of this
  migration or as a separate follow-up?
- Confirm native (no-Docker) local Postgres is acceptable, or whether a
  containerized / cloud DB is preferred for staging/production parity.

---

*Working directory: `QA_Tool/QA-Tool`. Backend has its own git history.*
