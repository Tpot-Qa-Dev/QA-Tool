// ─────────────────────────────────────────────────────────────────────────────
//  services/customchecks.service.js
//  Operator-defined extra checks per module + disabled built-in checks, persisted
//  to backend/custom-checks.json as { items: { <moduleId>: [item] },
//  disabled: { <moduleId>: [builtinCheckId] } }. Custom items are checkbox/
//  dropdown; disabled lists built-in check ids hidden from the wizard.
// ─────────────────────────────────────────────────────────────────────────────
import { promises as fs } from 'fs'
import { randomUUID } from 'crypto'
import { fileURLToPath } from 'url'
import { dirname, resolve, join } from 'path'

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const FILE = join(backendRoot, 'custom-checks.json')
const SAFE_MODULE = /^[A-Za-z0-9_-]+$/

// Read the store, migrating the old flat shape ({moduleId:[items]}) if found.
async function readStore() {
  try {
    const parsed = JSON.parse(await fs.readFile(FILE, 'utf8'))
    if (parsed && typeof parsed === 'object') {
      if (parsed.items || parsed.disabled) return { items: parsed.items || {}, disabled: parsed.disabled || {} }
      return { items: parsed, disabled: {} } // old flat map → migrate on next write
    }
  } catch { /* ignore */ }
  return { items: {}, disabled: {} }
}
async function writeStore(store) {
  await fs.writeFile(FILE, JSON.stringify(store, null, 2), 'utf8')
}

function normalizeItem(raw = {}) {
  const label = String(raw.label || '').trim().slice(0, 120)
  if (!label) throw new Error('label is required')
  const type = raw.type === 'dropdown' ? 'dropdown' : 'checkbox'
  const item = {
    id:    typeof raw.id === 'string' && raw.id ? raw.id : 'c_' + randomUUID().slice(0, 8),
    type, label,
    group: (String(raw.group || '').trim() || 'Custom Checks').slice(0, 60),
    enabled: raw.enabled !== false,
    tools: Array.isArray(raw.tools) ? raw.tools.filter(t => typeof t === 'string').slice(0, 10) : [],
  }
  if (type === 'dropdown') {
    item.options = (Array.isArray(raw.options) ? raw.options : []).map(o => String(o).trim().slice(0, 60)).filter(Boolean).slice(0, 20)
    if (item.options.length < 2) throw new Error('a dropdown needs at least 2 options')
    item.default = typeof raw.default === 'string' && item.options.includes(raw.default) ? raw.default : ''
  } else {
    item.default = !!raw.default
  }
  return item
}

// Returns the full store: { items, disabled }.
export async function getCustomChecks() {
  return await readStore()
}

export async function addCustomCheck(moduleId, raw) {
  if (!SAFE_MODULE.test(String(moduleId || ''))) throw new Error('invalid moduleId')
  const item  = normalizeItem(raw)
  const store = await readStore()
  store.items[moduleId] = [...(store.items[moduleId] || []), item]
  await writeStore(store)
  return store
}

export async function updateCustomCheck(moduleId, id, patch = {}) {
  const store = await readStore()
  const item  = (store.items[moduleId] || []).find(x => x.id === id)
  if (!item) throw new Error('check not found')
  if (typeof patch.enabled === 'boolean') item.enabled = patch.enabled
  await writeStore(store)
  return store
}

export async function removeCustomCheck(moduleId, id) {
  const store = await readStore()
  if (store.items[moduleId]) {
    store.items[moduleId] = store.items[moduleId].filter(i => i.id !== id)
    if (!store.items[moduleId].length) delete store.items[moduleId]
    await writeStore(store)
  }
  return store
}

// Enable/disable a BUILT-IN check (by its id) for a module.
export async function setBuiltinDisabled(moduleId, checkId, disabled) {
  if (!SAFE_MODULE.test(String(moduleId || ''))) throw new Error('invalid moduleId')
  const store = await readStore()
  const set   = new Set(store.disabled[moduleId] || [])
  if (disabled) set.add(String(checkId)); else set.delete(String(checkId))
  store.disabled[moduleId] = [...set]
  if (!store.disabled[moduleId].length) delete store.disabled[moduleId]
  await writeStore(store)
  return store
}
