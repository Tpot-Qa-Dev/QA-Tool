// ─────────────────────────────────────────────────────────────────────────────
//  db/seed.js
//  Creates the first admin account from environment variables so a fresh install
//  has someone who can log in and manage everyone else. Idempotent: if an admin
//  with ADMIN_EMAIL already exists it is left untouched (password is NOT reset).
//
//  Required in backend/.env:  ADMIN_EMAIL, ADMIN_PASSWORD   (optional: ADMIN_NAME)
//  Run it with:   npm run seed:admin     (from the backend/ folder)
// ─────────────────────────────────────────────────────────────────────────────
import { config } from '../config/index.js'
import pool from '../config/database.js'
import { findByEmail, createUser } from '../services/auth.service.js'

async function run() {
  const { adminEmail, adminPassword, adminName } = config.auth
  if (!adminPassword) {
    console.error('❌ ADMIN_PASSWORD is not set in backend/.env — cannot seed the admin account.')
    process.exit(1)
  }

  // Roles must exist first (migration 002 seeds them).
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM roles WHERE name IN ('admin','user')")
  if ((rows[0]?.n ?? 0) < 2) {
    console.error('❌ Roles not found. Run `npm run migrate` first, then re-run this.')
    process.exit(1)
  }

  const existing = await findByEmail(adminEmail)
  if (existing) {
    console.log(`✅ Admin "${adminEmail}" already exists (id ${existing.id}) — nothing to do.`)
    return
  }

  const user = await createUser({
    email: adminEmail,
    password: adminPassword,
    name: adminName,
    role: 'admin',
  })
  console.log(`🎉 Created admin account "${user.email}" (id ${user.id}).`)
  console.log('   Log in with that email and the ADMIN_PASSWORD you set, then change it.')
}

run()
  .catch((err) => {
    console.error('\n❌ Seed error:', err.message)
    process.exitCode = 1
  })
  .finally(() => pool.end())
