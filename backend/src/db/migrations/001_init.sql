-- ─────────────────────────────────────────────────────────────────────────────
--  001_init.sql
--  First migration: creates every table that replaces the old JSON file stores,
--  plus the new RBAC tables (roles, users) for multi-user support.
--
--  Mapping (old JSON file  →  new table):
--    settings.json          → settings          (single row)
--    usage.json             → usage             (single row, cumulative)
--    ai-models.json         → ai_models
--    figma-projects.json    → figma_projects
--    custom-checks.json     → custom_checks  +  builtin_check_overrides
--    prompt-config.json     → prompt_versions
--    reports/<id>.json      → reports           (full report kept in JSONB)
--  New (no JSON equivalent): roles, users
-- ─────────────────────────────────────────────────────────────────────────────

-- ── RBAC ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
  id          SERIAL PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,          -- e.g. 'admin', 'editor', 'viewer'
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,               -- bcrypt/argon hash, never plaintext
  name          TEXT,
  role_id       INTEGER REFERENCES roles(id) ON DELETE SET NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── settings (single row) ────────────────────────────────────────────────────
-- One-row table. The `id` check pins it to a single row so settings.service
-- can always UPDATE/SELECT the row where id = true.
CREATE TABLE IF NOT EXISTS settings (
  id         BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── usage (single row, cumulative token counters) ────────────────────────────
CREATE TABLE IF NOT EXISTS usage (
  id            BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  input_tokens  BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── ai_models ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_models (
  id         TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  provider   TEXT NOT NULL,                  -- 'anthropic' | 'google' | …
  model      TEXT NOT NULL,
  api_key    TEXT,                           -- provider key for this profile
  is_active  BOOLEAN NOT NULL DEFAULT false, -- exactly one active profile
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── figma_projects ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS figma_projects (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  token      TEXT NOT NULL,                  -- Figma personal access token
  is_active  BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── custom_checks (user-added checks, per module) ────────────────────────────
CREATE TABLE IF NOT EXISTS custom_checks (
  id         TEXT PRIMARY KEY,
  module_id  TEXT NOT NULL,                  -- which audit module this belongs to
  data       JSONB NOT NULL,                 -- the check definition (label, body, …)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_custom_checks_module ON custom_checks(module_id);

-- ── builtin_check_overrides (enable/disable shipped checks per module) ───────
-- Replaces the `builtinDisabled` part of custom-checks.json.
CREATE TABLE IF NOT EXISTS builtin_check_overrides (
  module_id  TEXT NOT NULL,
  check_id   TEXT NOT NULL,
  disabled   BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (module_id, check_id)
);

-- ── prompt_versions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prompt_versions (
  id         TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  body       TEXT NOT NULL,                  -- the prompt instructions
  is_active  BOOLEAN NOT NULL DEFAULT false, -- exactly one active version
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── reports (audit history) ──────────────────────────────────────────────────
-- Full report JSON kept in `data`. Common fields are also pulled out into
-- columns so listReports() can filter/sort/search without parsing JSONB.
CREATE TABLE IF NOT EXISTS reports (
  id         TEXT PRIMARY KEY,
  module     TEXT,
  url        TEXT,
  title      TEXT,
  score      INTEGER,
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reports_module     ON reports(module);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
