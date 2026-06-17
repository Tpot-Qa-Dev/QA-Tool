// ─────────────────────────────────────────────────────────────────────────────
//  frontend/src/api/client.js
//  Backend API client — uses Server-Sent Events for streaming audit progress
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = '/api'

// Check backend health and key status
export async function checkHealth() {
  try {
    const r = await fetch(`${API_BASE}/health`)
    return await r.json()
  } catch {
    return { ok: false, keys: {} }
  }
}

// List past audit reports (lightweight metadata only), with optional search,
// module filter and paging. Returns { reports, total, limit, offset }.
export async function listHistory({ q, module, limit, offset } = {}) {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (module) params.set('module', module)
  if (limit != null) params.set('limit', limit)
  if (offset != null) params.set('offset', offset)
  const qs = params.toString()
  const r = await fetch(`${API_BASE}/history${qs ? `?${qs}` : ''}`)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const data = await r.json()
  return {
    reports: data.reports || [],
    total: data.total ?? (data.reports || []).length,
    limit: data.limit ?? 25,
    offset: data.offset ?? 0,
  }
}

// Load a full past report by id.
export async function getHistoryReport(id) {
  const r = await fetch(`${API_BASE}/history/${encodeURIComponent(id)}`)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const data = await r.json()
  return data.report
}

// Save (upsert) a report to history from the UI — keeps it in the tool without
// downloading a file. Returns the saved metadata row.
export async function saveHistoryReport(id, report) {
  const r = await fetch(`${API_BASE}/history/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ report }),
  })
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw new Error(e.error || `HTTP ${r.status}`)
  }
  return r.json()
}

// Delete a past report by id.
export async function deleteHistoryReport(id) {
  const r = await fetch(`${API_BASE}/history/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return true
}

// ── Settings ──────────────────────────────────────────────────────────────────

// Fetch current tool settings + the tool catalogue. Returns
// { settings, tools, modelPresets }.
export async function getSettings() {
  const r = await fetch(`${API_BASE}/settings`)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

// Persist a settings patch ({ audit?, enabledTools? }). Returns the saved state.
export async function saveSettings(patch) {
  const r = await fetch(`${API_BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw new Error(e.error || `HTTP ${r.status}`)
  }
  return r.json()
}

// Cumulative Claude token usage. Returns { inputTokens, outputTokens, totalTokens, audits, since }.
export async function getUsage() {
  const r = await fetch(`${API_BASE}/usage`)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

export async function resetUsage() {
  const r = await fetch(`${API_BASE}/usage/reset`, { method: 'POST' })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

// Lightweight list of a page's sections (names/tags only, no screenshots) for
// the section picker. Returns { url, sections: [{index, name, tag, counts}] }.
export async function listSections(url) {
  const r = await fetch(`${API_BASE}/sections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw new Error(e.error || `HTTP ${r.status}`)
  }
  return r.json()
}

// ── Admin dashboard ───────────────────────────────────────────────────────────

export async function getAdminOverview({ days, module } = {}) {
  const p = new URLSearchParams()
  if (days) p.set('days', days)
  if (module) p.set('module', module)
  const qs = p.toString()
  const r = await fetch(`${API_BASE}/admin/overview${qs ? `?${qs}` : ''}`)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

export async function getAdminPrompts() {
  const r = await fetch(`${API_BASE}/admin/prompts`)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

// ── Editable prompt instructions + version history ───────────────────────────

// List versions + which is active + the built-in default body.
export async function getPromptConfig() {
  const r = await fetch(`${API_BASE}/admin/prompt-config`)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

// Full body of one version (or 'default') — to load into the editor.
export async function getPromptVersion(id) {
  const r = await fetch(`${API_BASE}/admin/prompt-config/${encodeURIComponent(id)}`)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

// Save the edited body as a new version (becomes active).
export async function savePromptVersion(label, body) {
  const r = await fetch(`${API_BASE}/admin/prompt-config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, body }),
  })
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw new Error(e.error || `HTTP ${r.status}`)
  }
  return r.json()
}

// Restore (make active) a version, or 'default' for the built-in prompt.
export async function setActivePromptVersion(id) {
  const r = await fetch(`${API_BASE}/admin/prompt-config/active`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

export async function deletePromptVersion(id) {
  const r = await fetch(`${API_BASE}/admin/prompt-config/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

// ── AI model profiles (multiple models, each with its own API key) ───────────

export async function listAiModels() {
  const r = await fetch(`${API_BASE}/admin/ai-models`)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json() // { profiles, activeId, providers }
}

export async function addAiModel(profile) {
  const r = await fetch(`${API_BASE}/admin/ai-models`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile), // { label, provider, model, apiKey }
  })
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw new Error(e.error || `HTTP ${r.status}`)
  }
  return r.json()
}

export async function updateAiModel(id, patch) {
  const r = await fetch(`${API_BASE}/admin/ai-models/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch), // { label?, model?, provider?, apiKey? } (blank apiKey = keep)
  })
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw new Error(e.error || `HTTP ${r.status}`)
  }
  return r.json()
}

export async function setActiveAiModel(id) {
  const r = await fetch(`${API_BASE}/admin/ai-models/active`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

export async function deleteAiModel(id) {
  const r = await fetch(`${API_BASE}/admin/ai-models/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

// Active backend config (keys as set/not-set flags, mode, frontend url, etc.).
export async function getAdminConfig() {
  const r = await fetch(`${API_BASE}/admin/config`)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

// Update .env ({ claudeKey?, psiKey?, figmaToken?, nodeEnv?, frontendUrl?, headless? }).
export async function updateAdminConfig(patch) {
  const r = await fetch(`${API_BASE}/admin/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw new Error(e.error || `HTTP ${r.status}`)
  }
  return r.json()
}

// ── Custom checks (operator-defined per module) ──────────────────────────────

// All custom-checks calls return the full store: { customChecks, disabledChecks }.
export async function getCustomChecks() {
  const r = await fetch(`${API_BASE}/custom-checks`)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

export async function addCustomCheck(moduleId, item) {
  const r = await fetch(`${API_BASE}/custom-checks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ moduleId, item }),
  })
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw new Error(e.error || `HTTP ${r.status}`)
  }
  return r.json()
}

export async function updateCustomCheck(moduleId, id, patch) {
  const r = await fetch(
    `${API_BASE}/custom-checks/${encodeURIComponent(moduleId)}/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
  )
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

export async function deleteCustomCheck(moduleId, id) {
  const r = await fetch(
    `${API_BASE}/custom-checks/${encodeURIComponent(moduleId)}/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  )
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

// Enable/disable a BUILT-IN check by id for a module.
export async function setBuiltinDisabled(moduleId, checkId, disabled) {
  const r = await fetch(`${API_BASE}/custom-checks/builtin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ moduleId, checkId, disabled }),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

// ── History maintenance ─────────────────────────────────────────────────────

export async function getHistoryStats() {
  const r = await fetch(`${API_BASE}/history/stats`)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json() // { count, totalBytes }
}

// action: 'clear' | 'rebuild' | 'purge' (purge also needs { days }).
export async function runHistoryMaintenance(action, extra = {}) {
  const r = await fetch(`${API_BASE}/history/maintenance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...extra }),
  })
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw new Error(e.error || `HTTP ${r.status}`)
  }
  return r.json()
}

// ── Figma project tokens (project-wise Figma access tokens) ──────────────────

// List saved Figma projects (tokens masked) + the active project id.
export async function listFigmaProjects() {
  const r = await fetch(`${API_BASE}/figma-projects`)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json() // { projects: [{id,name,tokenHint,active}], activeId }
}

// Add a named project token.
export async function addFigmaProject(name, token) {
  const r = await fetch(`${API_BASE}/figma-projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, token }),
  })
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw new Error(e.error || `HTTP ${r.status}`)
  }
  return r.json()
}

// Delete a project token by id.
export async function deleteFigmaProject(id) {
  const r = await fetch(`${API_BASE}/figma-projects/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

// Set (or clear with '') the active default project.
export async function setActiveFigmaProject(id) {
  const r = await fetch(`${API_BASE}/figma-projects/active`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

// Run a QA audit — streams events via SSE
// onEvent(event: string, data: any) called for each SSE event
// Returns a promise that resolves with the final report
export function runAudit(
  { url, figmaUrl, module, checks, requiredTools, reportId, environmentHint },
  onEvent,
) {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await fetch(`${API_BASE}/audit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          figmaUrl,
          module,
          checks,
          requiredTools,
          reportId,
          environmentHint,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        return reject(new Error(err.error || `HTTP ${res.status}`))
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      // Process one or more complete SSE chunks out of `buffer` (called both
      // mid-stream and once more on stream end to drain any trailing chunk).
      const drain = () => {
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() // keep incomplete chunk between calls

        for (const chunk of chunks) {
          if (!chunk.trim()) continue
          const lines = chunk.split('\n')
          const eventLine = lines.find((l) => l.startsWith('event:'))
          const dataLine = lines.find((l) => l.startsWith('data:'))

          if (!eventLine || !dataLine) continue

          const event = eventLine.replace('event:', '').trim()
          let data = null
          try {
            data = JSON.parse(dataLine.replace('data:', '').trim())
          } catch {}

          onEvent(event, data)

          if (event === 'complete') resolve(data?.report)
          if (event === 'error') reject(new Error(data?.message || 'Audit error'))
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        drain()
      }

      // Final flush: decode any bytes the streaming decoder buffered, then
      // drain the trailing chunk (the final `\n\n` may be missing).
      buffer += decoder.decode()
      if (buffer.trim()) buffer += '\n\n'
      drain()
    } catch (err) {
      reject(err)
    }
  })
}
