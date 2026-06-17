// ─────────────────────────────────────────────────────────────────────────────
//  services/figmaProjects.service.js
//  Project-wise Figma access tokens. Lets the operator store MANY named Figma
//  tokens (one per project) and pick which one an audit uses. Persisted to
//  backend/figma-projects.json as { projects: [{id,name,token,createdAt}],
//  activeId }. Raw tokens never leave the backend — the public list masks them.
//  When no project is chosen for a run, the active project (else the .env
//  FIGMA_TOKEN) is used as the fallback.
// ─────────────────────────────────────────────────────────────────────────────
import { promises as fs } from 'fs'
import { randomUUID } from 'crypto'
import { fileURLToPath } from 'url'
import { dirname, resolve, join } from 'path'
import { config } from '../config/index.js'

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const FILE = join(backendRoot, 'figma-projects.json')

async function readStore() {
  try {
    const parsed = JSON.parse(await fs.readFile(FILE, 'utf8'))
    if (parsed && Array.isArray(parsed.projects)) {
      return { projects: parsed.projects, activeId: parsed.activeId || '' }
    }
  } catch {
    /* ignore — fall through to empty store */
  }
  return { projects: [], activeId: '' }
}
async function writeStore(store) {
  await fs.writeFile(FILE, JSON.stringify(store, null, 2), 'utf8')
}

// Mask a token for display: show only the last 4 characters.
const maskToken = (t) => {
  const s = String(t || '')
  return s.length <= 4 ? '••••' : '••••' + s.slice(-4)
}

// Public view of one project — never includes the raw token.
const publicProject = (p, activeId) => ({
  id: p.id,
  name: p.name,
  tokenHint: maskToken(p.token),
  active: p.id === activeId,
})

// The full public list the UI renders: { projects:[…masked…], activeId }.
export async function listProjects() {
  const store = await readStore()
  return {
    projects: store.projects.map((p) => publicProject(p, store.activeId)),
    activeId: store.activeId,
  }
}

// Add a named project token. Returns the public list.
export async function addProject({ name, token } = {}) {
  const cleanName = String(name || '')
    .trim()
    .slice(0, 80)
  const cleanToken = String(token || '').trim()
  if (!cleanName) throw new Error('project name is required')
  if (!cleanToken) throw new Error('a Figma access token is required')

  const store = await readStore()
  const project = {
    id: 'fp_' + randomUUID().slice(0, 8),
    name: cleanName,
    token: cleanToken,
    createdAt: new Date().toISOString(),
  }
  store.projects.push(project)
  if (!store.activeId) store.activeId = project.id // first one becomes active
  await writeStore(store)
  return {
    projects: store.projects.map((p) => publicProject(p, store.activeId)),
    activeId: store.activeId,
  }
}

// Remove a project. If it was active, the active selection clears (next run
// falls back to the .env token unless another is chosen).
export async function removeProject(id) {
  const store = await readStore()
  store.projects = store.projects.filter((p) => p.id !== id)
  if (store.activeId === id) store.activeId = store.projects[0]?.id || ''
  await writeStore(store)
  return {
    projects: store.projects.map((p) => publicProject(p, store.activeId)),
    activeId: store.activeId,
  }
}

// Mark a project as the active default (used when a run doesn't pick one).
export async function setActiveProject(id) {
  const store = await readStore()
  if (id && !store.projects.some((p) => p.id === id)) throw new Error('project not found')
  store.activeId = id || ''
  await writeStore(store)
  return {
    projects: store.projects.map((p) => publicProject(p, store.activeId)),
    activeId: store.activeId,
  }
}

// Resolve the Figma token to use for a run. Priority: the explicitly chosen
// project → the active project → the .env FIGMA_TOKEN. Returns the raw token
// plus the project name (for display) and where it came from.
export async function resolveToken(projectId) {
  const store = await readStore()
  const pick = (id) => store.projects.find((p) => p.id === id)
  const chosen = (projectId && pick(projectId)) || (store.activeId && pick(store.activeId)) || null
  if (chosen)
    return {
      token: chosen.token,
      projectName: chosen.name,
      source: projectId ? 'selected' : 'active',
    }
  return { token: config.keys.figma || '', projectName: '', source: 'env' }
}
