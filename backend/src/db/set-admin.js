// ─────────────────────────────────────────────────────────────────────────────
//  db/set-admin.js
//  Create OR update the admin account from environment variables. Unlike
//  seed.js (which only ever CREATES and never touches an existing user), this
//  upserts: if ADMIN_EMAIL already exists its password/name are reset to match
//  .env; otherwise a new admin is created. Use this to change admin credentials
//  "from code" — edit backend/.env, then run `npm run set:admin`.
//
//  Required in backend/.env:  ADMIN_EMAIL, ADMIN_PASSWORD   (optional: ADMIN_NAME)
//  Run it with:   npm run set:admin     (from the backend/ folder)
// ─────────────────────────────────────────────────────────────────────────────
import { config } from '../config/index.js'
import pool from '../config/database.js'
import { findByEmail, createUser, updateUser } from '../services/auth.service.js'

async function run() {
  const { adminEmail, adminPassword, adminName } = config.auth
  if (!adminEmail || !adminPassword) {
    console.error('❌ ADMIN_EMAIL and ADMIN_PASSWORD must both be set in backend/.env.')
    process.exit(1)
  }

  // Roles must exist first (migration 002 seeds them).
  const { rows } = await pool.query(
    "SELECT count(*)::int AS n FROM roles WHERE name IN ('admin','user')",
  )
  if ((rows[0]?.n ?? 0) < 2) {
    console.error('❌ Roles not found. Run `npm run migrate` first, then re-run this.')
    process.exit(1)
  }

  const existing = await findByEmail(adminEmail)
  if (existing) {
    // Reset password (and name) on the existing account, and make sure it is an
    // active admin in case it had been demoted/disabled.
    await updateUser(existing.id, {
      password: adminPassword,
      name: adminName,
      role: 'admin',
      isActive: true,
    })
    console.log(`✅ Updated admin "${adminEmail}" (id ${existing.id}) — password reset from .env.`)
  } else {
    const user = await createUser({
      email: adminEmail,
      password: adminPassword,
      name: adminName,
      role: 'admin',
    })
    console.log(`🎉 Created admin "${user.email}" (id ${user.id}).`)
  }
  console.log('   Log in with ADMIN_EMAIL + ADMIN_PASSWORD from backend/.env.')
}

run()
  .catch((err) => {
    console.error('\n❌ set-admin error:', err.message)
    process.exitCode = 1
  })
  .finally(() => pool.end())
