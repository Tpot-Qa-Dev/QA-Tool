// ─────────────────────────────────────────────────────────────────────────────
//  controllers/admin.controller.js
//  HTTP layer for the Admin dashboard — overview stats and prompt inspection.
// ─────────────────────────────────────────────────────────────────────────────
import { getOverview, getPrompts } from '../services/admin.service.js'
import { getEnvStatus, updateEnvConfig } from '../services/envconfig.service.js'
import {
  getPromptConfig, getVersionBody, saveVersion, setActiveVersion, deleteVersion,
} from '../services/promptConfig.service.js'
import {
  listProfiles, addProfile, updateProfile, removeProfile, setActiveProfile,
} from '../services/aiModels.service.js'

export async function getAdminOverview(req, res) {
  try {
    res.json(await getOverview({ days: req.query.days, module: req.query.module }))
  } catch (err) {
    console.error('[admin] overview error:', err)
    res.status(500).json({ error: err.message })
  }
}

export async function getAdminPrompts(_req, res) {
  try {
    res.json(await getPrompts())
  } catch (err) {
    console.error('[admin] prompts error:', err)
    res.status(500).json({ error: err.message })
  }
}

// ── Editable prompt instructions (version history + restore) ─────────────────
export async function getAdminPromptConfig(_req, res) {
  try {
    res.json(await getPromptConfig())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function getAdminPromptVersion(req, res) {
  try {
    res.json(await getVersionBody(req.params.id))
  } catch (err) {
    res.status(404).json({ error: err.message })
  }
}

export async function postAdminPromptVersion(req, res) {
  try {
    const { label, body } = req.body || {}
    res.json(await saveVersion({ label, body }))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
}

export async function putAdminPromptActive(req, res) {
  try {
    res.json(await setActiveVersion((req.body || {}).id))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
}

export async function deleteAdminPromptVersion(req, res) {
  try {
    res.json(await deleteVersion(req.params.id))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
}

// ── AI model profiles (multi-model + per-model API key) ──────────────────────
export async function getAdminAiModels(_req, res) {
  try { res.json(await listProfiles()) }
  catch (err) { res.status(500).json({ error: err.message }) }
}

export async function postAdminAiModel(req, res) {
  try {
    const { label, provider, model, apiKey } = req.body || {}
    res.json(await addProfile({ label, provider, model, apiKey }))
  } catch (err) { res.status(400).json({ error: err.message }) }
}

export async function putAdminAiModelActive(req, res) {
  try { res.json(await setActiveProfile((req.body || {}).id)) }
  catch (err) { res.status(400).json({ error: err.message }) }
}

export async function putAdminAiModel(req, res) {
  try {
    const { label, model, provider, apiKey } = req.body || {}
    res.json(await updateProfile(req.params.id, { label, model, provider, apiKey }))
  } catch (err) { res.status(400).json({ error: err.message }) }
}

export async function deleteAdminAiModel(req, res) {
  try { res.json(await removeProfile(req.params.id)) }
  catch (err) { res.status(400).json({ error: err.message }) }
}

export function getAdminConfig(_req, res) {
  try {
    res.json(getEnvStatus())
  } catch (err) {
    console.error('[admin] config get error:', err)
    res.status(500).json({ error: err.message })
  }
}

export async function updateAdminConfig(req, res) {
  try {
    const result = await updateEnvConfig(req.body || {})
    res.json({ ...result, status: getEnvStatus() })
  } catch (err) {
    console.error('[admin] config update error:', err)
    res.status(400).json({ error: err.message })
  }
}
