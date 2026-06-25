// ─────────────────────────────────────────────────────────────────────────────
//  db/migrate.js
//  Plain SQL migration runner — no ORM, no external migration library.
//
//  It reads every *.sql file in db/migrations/ (in filename order), and runs
//  any that haven't been applied yet. A `schema_migrations` table records which
//  files have already run, so re-running this is always safe (idempotent).
//
//  Run it with:   npm run migrate     (from the backend/ folder)
// ─────────────────────────────────────────────────────────────────────────────

// Load config FIRST so backend/.env is read with an absolute path before the
// pool initialises — this makes `npm run migrate` work from any directory.
import '../config/index.js'
import pool from '../config/database.js'

import { readdir, readFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname, resolve, join } from 'path'

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations')

async function run() {
  const client = await pool.connect()
  try {
    // Bookkeeping table: which migrations have already been applied.
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)

    const all = (await readdir(migrationsDir))
      .filter((f) => f.endsWith('.sql'))
      .sort()

    const { rows } = await client.query('SELECT filename FROM schema_migrations')
    const done = new Set(rows.map((r) => r.filename))

    const pending = all.filter((f) => !done.has(f))
    if (pending.length === 0) {
      console.log('✅ Database is up to date — no migrations to run.')
      return
    }

    for (const file of pending) {
      const sql = await readFile(join(migrationsDir, file), 'utf8')
      console.log(`▶ Applying ${file} …`)
      // Each migration runs in its own transaction: all-or-nothing.
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations(filename) VALUES ($1)', [file])
        await client.query('COMMIT')
        console.log(`  ✅ ${file} applied`)
      } catch (err) {
        await client.query('ROLLBACK')
        console.error(`  ❌ ${file} failed — rolled back. Nothing was changed.`)
        throw err
      }
    }

    console.log(`\n🎉 Done. Applied ${pending.length} migration(s).`)
  } finally {
    client.release()
    await pool.end()
  }
}

run().catch((err) => {
  console.error('\n❌ Migration error:', err.message)
  process.exit(1)
})
