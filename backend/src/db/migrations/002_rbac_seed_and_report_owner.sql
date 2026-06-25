-- ─────────────────────────────────────────────────────────────────────────────
--  002_rbac_seed_and_report_owner.sql
--  Activates RBAC: seeds the two roles this product uses (admin / user) and
--  gives every audit report an owner so history can be scoped per-user while
--  admins still see everything.
-- ─────────────────────────────────────────────────────────────────────────────

-- Two roles only: admins manage config/keys/users; users run audits + see their
-- own history. Idempotent — re-running this migration is safe.
INSERT INTO roles (name, description) VALUES
  ('admin', 'Full access: settings, API keys, AI models, prompts, and user management'),
  ('user',  'Can run audits and view their own audit history')
ON CONFLICT (name) DO NOTHING;

-- Report ownership. NULL means "no owner" (legacy reports imported before RBAC,
-- or system-generated); those are visible to admins only.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_reports_owner ON reports(owner_id);
