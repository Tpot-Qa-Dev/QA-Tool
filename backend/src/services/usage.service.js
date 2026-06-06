// ─────────────────────────────────────────────────────────────────────────────
//  services/usage.service.js
//  Cumulative Claude token usage, persisted to backend/usage.json. Updated once
//  per completed audit; surfaced in the Settings panel so the operator can keep
//  an eye on consumption. Best-effort: failures never break an audit.
// ─────────────────────────────────────────────────────────────────────────────
import { promises as fs } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve, join } from 'path'

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const USAGE_FILE  = join(backendRoot, 'usage.json')

const EMPTY = { inputTokens: 0, outputTokens: 0, audits: 0, since: null }

export async function getUsage() {
  try {
    const parsed = JSON.parse(await fs.readFile(USAGE_FILE, 'utf8'))
    return {
      inputTokens:  Number(parsed.inputTokens)  || 0,
      outputTokens: Number(parsed.outputTokens) || 0,
      totalTokens: (Number(parsed.inputTokens) || 0) + (Number(parsed.outputTokens) || 0),
      audits:       Number(parsed.audits)       || 0,
      since:        parsed.since || null,
    }
  } catch {
    return { ...EMPTY, totalTokens: 0 }
  }
}

// Add one audit's token totals to the cumulative counter.
export async function addUsage({ inputTokens = 0, outputTokens = 0 }) {
  try {
    const cur = await getUsage()
    const next = {
      inputTokens:  cur.inputTokens  + (Number(inputTokens)  || 0),
      outputTokens: cur.outputTokens + (Number(outputTokens) || 0),
      audits:       cur.audits + 1,
      since:        cur.since || new Date().toISOString(),
    }
    await fs.writeFile(USAGE_FILE, JSON.stringify(next, null, 2), 'utf8')
    return next
  } catch (err) {
    console.warn('[usage] update failed:', err.message)
    return null
  }
}

export async function resetUsage() {
  const fresh = { ...EMPTY, since: new Date().toISOString() }
  await fs.writeFile(USAGE_FILE, JSON.stringify(fresh, null, 2), 'utf8')
  return { ...fresh, totalTokens: 0 }
}
