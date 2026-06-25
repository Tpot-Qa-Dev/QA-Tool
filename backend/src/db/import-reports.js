// ─────────────────────────────────────────────────────────────────────────────
//  db/import-reports.js
//  One-time data migration: load any reports left in the old file store
//  (backend/reports/<id>.json) into the Postgres `reports` table. Existing rows
//  are upserted, so re-running is safe. Imported reports have no owner (NULL) and
//  are therefore visible to admins only until reassigned.
//
//  Run it with:   npm run import:reports     (from the backend/ folder)
// ─────────────────────────────────────────────────────────────────────────────
import { promises as fs } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve, join } from 'path'
import '../config/index.js'
import pool from '../config/database.js'
import { saveReport } from '../services/history.service.js'

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const REPORTS_DIR = join(backendRoot, 'reports')

const isReportFile = (f) => f.endsWith('.json') && !f.startsWith('_')

async function run() {
  let files = []
  try {
    files = (await fs.readdir(REPORTS_DIR)).filter(isReportFile)
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('No reports/ directory found — nothing to import.')
      return
    }
    throw err
  }

  if (!files.length) {
    console.log('No report files to import.')
    return
  }

  let ok = 0
  let skipped = 0
  for (const f of files) {
    try {
      const raw = await fs.readFile(join(REPORTS_DIR, f), 'utf8')
      const report = JSON.parse(raw)
      const id = report.id || f.replace(/\.json$/, '')
      await saveReport(id, report, null) // owner unknown → admin-only
      ok++
    } catch (err) {
      console.warn(`  ⚠ skipped ${f}: ${err.message}`)
      skipped++
    }
  }
  console.log(`\n🎉 Imported ${ok} report(s) into Postgres${skipped ? `, skipped ${skipped}` : ''}.`)
}

run()
  .catch((err) => {
    console.error('\n❌ Import error:', err.message)
    process.exitCode = 1
  })
  .finally(() => pool.end())
