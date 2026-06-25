// ─────────────────────────────────────────────────────────────────────────────
//  services/aiModels.service.js
//  AI model profiles. Lets the operator store MANY model profiles — each with a
//  provider, a model id, and its OWN API key — and pick which one audits use.
//  Persisted to backend/ai-models.json as { profiles: [{id,label,provider,
//  model,apiKey,createdAt}], activeId }. Raw keys never leave the backend; the
//  public list masks them. When no profile is active, audits fall back to the
//  model in Settings + the CLAUDE_API_KEY from .env (provider 'anthropic').
//
//  Execution support: 'anthropic' runs today. Other providers can be SAVED and
//  selected, but running an audit against them is gated until their adapter
//  lands (see SUPPORTED_PROVIDERS / runnable flag).
// ─────────────────────────────────────────────────────────────────────────────
import { promises as fs } from 'fs'
import { randomUUID } from 'crypto'
import { fileURLToPath } from 'url'
import { dirname, resolve, join } from 'path'

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const FILE = join(backendRoot, 'ai-models.json')

// Providers the manager accepts. `runnable` = audits can actually execute on it
// today. The rest are stored/selectable but gated at run time until wired.
export const PROVIDERS = {
  anthropic: { label: 'Claude (Anthropic)', runnable: true },
  google: { label: 'Google Gemini', runnable: true },
  openrouter: { label: 'OpenRouter (any model)', runnable: true },
  openai: { label: 'OpenAI', runnable: false },
}

async function readStore() {
  try {
    const parsed = JSON.parse(await fs.readFile(FILE, 'utf8'))
    if (parsed && Array.isArray(parsed.profiles)) {
      return { profiles: parsed.profiles, activeId: parsed.activeId || '' }
    }
  } catch {
    /* ignore — empty store */
  }
  return { profiles: [], activeId: '' }
}
async function writeStore(store) {
  await fs.writeFile(FILE, JSON.stringify(store, null, 2), 'utf8')
}

const maskKey = (k) => {
  const s = String(k || '')
  return s.length <= 4 ? '••••' : '••••' + s.slice(-4)
}

const publicProfile = (p, activeId) => ({
  id: p.id,
  label: p.label,
  provider: p.provider,
  model: p.model,
  keyHint: maskKey(p.apiKey),
  hasKey: !!p.apiKey,
  runnable: !!PROVIDERS[p.provider]?.runnable,
  active: p.id === activeId,
  allowedForUsers: !!p.allowedForUsers, // admin permitted normal users to pick this
})

export async function listProfiles() {
  const store = await readStore()
  return {
    profiles: store.profiles.map((p) => publicProfile(p, store.activeId)),
    activeId: store.activeId,
    providers: PROVIDERS,
  }
}

export async function addProfile({ label, provider, model, apiKey, allowedForUsers } = {}) {
  const cleanLabel = String(label || '')
    .trim()
    .slice(0, 80)
  const prov = String(provider || 'anthropic')
  const cleanModel = String(model || '')
    .trim()
    .slice(0, 120)
  const cleanKey = String(apiKey || '').trim()
  if (!PROVIDERS[prov]) throw new Error('unknown provider')
  if (!cleanLabel) throw new Error('a label is required')
  if (!cleanModel) throw new Error('a model id is required')

  const store = await readStore()
  const profile = {
    id: 'ai_' + randomUUID().slice(0, 8),
    label: cleanLabel,
    provider: prov,
    model: cleanModel,
    apiKey: cleanKey,
    allowedForUsers: !!allowedForUsers,
    createdAt: new Date().toISOString(),
  }
  store.profiles.push(profile)
  if (!store.activeId) store.activeId = profile.id // first becomes active
  await writeStore(store)
  return listProfilesFrom(store)
}

// Edit a profile. label/model/provider updated when a non-empty value is given;
// apiKey updated only when a non-empty value is supplied (blank = keep current,
// so the masked key in the UI doesn't have to be re-typed).
export async function updateProfile(id, { label, model, provider, apiKey, allowedForUsers } = {}) {
  const store = await readStore()
  const p = store.profiles.find((x) => x.id === id)
  if (!p) throw new Error('profile not found')
  if (typeof provider === 'string' && PROVIDERS[provider]) p.provider = provider
  if (typeof label === 'string' && label.trim()) p.label = label.trim().slice(0, 80)
  if (typeof model === 'string' && model.trim()) p.model = model.trim().slice(0, 120)
  if (typeof apiKey === 'string' && apiKey.trim()) p.apiKey = apiKey.trim()
  if (typeof allowedForUsers === 'boolean') p.allowedForUsers = allowedForUsers
  await writeStore(store)
  return listProfilesFrom(store)
}

export async function removeProfile(id) {
  const store = await readStore()
  store.profiles = store.profiles.filter((p) => p.id !== id)
  if (store.activeId === id) store.activeId = store.profiles[0]?.id || ''
  await writeStore(store)
  return listProfilesFrom(store)
}

export async function setActiveProfile(id) {
  const store = await readStore()
  if (id && !store.profiles.some((p) => p.id === id)) throw new Error('profile not found')
  store.activeId = id || ''
  await writeStore(store)
  return listProfilesFrom(store)
}

const listProfilesFrom = (store) => ({
  profiles: store.profiles.map((p) => publicProfile(p, store.activeId)),
  activeId: store.activeId,
  providers: PROVIDERS,
})

// The full active profile (raw key included) for the audit engine, or null when
// none is set (caller falls back to Settings model + .env key).
export async function getActiveProfile() {
  const store = await readStore()
  const p = store.activeId && store.profiles.find((x) => x.id === store.activeId)
  if (!p) return null
  return {
    id: p.id,
    label: p.label,
    provider: p.provider,
    model: p.model,
    apiKey: p.apiKey,
    runnable: !!PROVIDERS[p.provider]?.runnable,
  }
}

// For NORMAL users: only the profiles the admin permitted (allowedForUsers).
// Keys stay masked (publicProfile). The default is the admin's active model,
// but only if that model is itself permitted for users.
export async function listAllowedProfiles() {
  const store = await readStore()
  const allowed = store.profiles.filter((p) => p.allowedForUsers)
  const activeId = allowed.some((p) => p.id === store.activeId) ? store.activeId : ''
  return {
    profiles: allowed.map((p) => publicProfile(p, activeId)),
    activeId,
  }
}

// For the audit engine: the FULL profile (raw key) for a user-chosen id, but
// ONLY if it exists AND the admin permitted it for users. Otherwise null, so the
// caller falls back to the active default. This is the server-side permission
// guard — a client can't run a model the admin didn't allow.
export async function getSelectableProfile(id) {
  if (!id) return null
  const store = await readStore()
  const p = store.profiles.find((x) => x.id === id && x.allowedForUsers)
  if (!p) return null
  return {
    id: p.id,
    label: p.label,
    provider: p.provider,
    model: p.model,
    apiKey: p.apiKey,
    runnable: !!PROVIDERS[p.provider]?.runnable,
  }
}
