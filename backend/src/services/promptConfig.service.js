// ─────────────────────────────────────────────────────────────────────────────
//  services/promptConfig.service.js
//  Editable system-prompt instructions with version history. The operator edits
//  the persona/instructions block in Admin → Prompts; each save is a new version
//  and any previous version (or the built-in default) can be restored. Persisted
//  to backend/prompt-config.json as { versions: [{id,label,body,createdAt}],
//  activeId }. activeId === '' (or 'default') means use the built-in default.
//  The JSON report contract is NOT stored here — it's always added by code, so a
//  prompt edit can never break the structured output.
// ─────────────────────────────────────────────────────────────────────────────
import { promises as fs } from 'fs'
import { randomUUID } from 'crypto'
import { fileURLToPath } from 'url'
import { dirname, resolve, join } from 'path'
import { DEFAULT_INSTRUCTIONS } from './prompts.js'

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const FILE = join(backendRoot, 'prompt-config.json')
const MAX_VERSIONS = 30
const MAX_BODY = 12_000

async function readStore() {
  try {
    const parsed = JSON.parse(await fs.readFile(FILE, 'utf8'))
    if (parsed && Array.isArray(parsed.versions)) {
      return { versions: parsed.versions, activeId: parsed.activeId || '' }
    }
  } catch { /* ignore — fall through to empty store */ }
  return { versions: [], activeId: '' }
}
async function writeStore(store) {
  await fs.writeFile(FILE, JSON.stringify(store, null, 2), 'utf8')
}

// Public view: the version list (with a short preview), which is active, and the
// built-in default body so the UI can show/restore it.
const toPublic = (store) => ({
  versions: store.versions.map(v => ({
    id: v.id, label: v.label, createdAt: v.createdAt,
    preview: (v.body || '').slice(0, 120),
    active: v.id === store.activeId,
  })),
  activeId: store.activeId || '',
  usingDefault: !store.activeId || !store.versions.some(v => v.id === store.activeId),
  defaultBody: DEFAULT_INSTRUCTIONS,
})

export async function getPromptConfig() {
  return toPublic(await readStore())
}

// Full body of a single version (or the default) — for loading into the editor.
export async function getVersionBody(id) {
  if (!id || id === 'default') return { id: 'default', label: 'Built-in default', body: DEFAULT_INSTRUCTIONS }
  const store = await readStore()
  const v = store.versions.find(x => x.id === id)
  if (!v) throw new Error('version not found')
  return { id: v.id, label: v.label, body: v.body }
}

// The instructions the audit should use right now: the active version's body,
// or the built-in default when none is active.
export async function getActiveInstructions() {
  const store = await readStore()
  const v = store.activeId && store.versions.find(x => x.id === store.activeId)
  return v ? v.body : DEFAULT_INSTRUCTIONS
}

// Save the edited body as a NEW version and make it active.
export async function saveVersion({ label, body } = {}) {
  const cleanBody = String(body || '').trim()
  if (!cleanBody) throw new Error('prompt body is required')
  if (cleanBody.length > MAX_BODY) throw new Error(`prompt is too long (max ${MAX_BODY} characters)`)

  const store = await readStore()
  const version = {
    id: 'pv_' + randomUUID().slice(0, 8),
    label: (String(label || '').trim() || `Version ${store.versions.length + 1}`).slice(0, 80),
    body: cleanBody,
    createdAt: new Date().toISOString(),
  }
  store.versions.push(version)
  // Keep only the most recent MAX_VERSIONS (oldest dropped first).
  if (store.versions.length > MAX_VERSIONS) store.versions = store.versions.slice(-MAX_VERSIONS)
  store.activeId = version.id
  await writeStore(store)
  return toPublic(store)
}

// Restore (make active) a previous version, or '' / 'default' for the built-in.
export async function setActiveVersion(id) {
  const store = await readStore()
  if (id && id !== 'default' && !store.versions.some(v => v.id === id)) throw new Error('version not found')
  store.activeId = id && id !== 'default' ? id : ''
  await writeStore(store)
  return toPublic(store)
}

export async function deleteVersion(id) {
  const store = await readStore()
  store.versions = store.versions.filter(v => v.id !== id)
  if (store.activeId === id) store.activeId = '' // fell back to default
  await writeStore(store)
  return toPublic(store)
}
