// ─────────────────────────────────────────────────────────────────────────────
//  controllers/settings.controller.js
//  HTTP layer for /api/settings — read and update runtime tool settings.
// ─────────────────────────────────────────────────────────────────────────────
import { getSettings, saveSettings, getToolCatalogue, MODEL_PRESETS } from '../services/settings.service.js'
import { getUsage, resetUsage } from '../services/usage.service.js'

export async function getSettingsHandler(_req, res) {
  try {
    const [settings, tools] = await Promise.all([getSettings(), getToolCatalogue()])
    res.json({ settings, tools, modelPresets: MODEL_PRESETS })
  } catch (err) {
    console.error('[settings] get error:', err)
    res.status(500).json({ error: err.message })
  }
}

export async function updateSettingsHandler(req, res) {
  try {
    const settings = await saveSettings(req.body || {})
    const tools    = await getToolCatalogue()
    res.json({ settings, tools, modelPresets: MODEL_PRESETS })
  } catch (err) {
    console.error('[settings] update error:', err)
    res.status(400).json({ error: err.message })
  }
}

export async function getUsageHandler(_req, res) {
  try {
    res.json(await getUsage())
  } catch (err) {
    console.error('[usage] get error:', err)
    res.status(500).json({ error: err.message })
  }
}

export async function resetUsageHandler(_req, res) {
  try {
    res.json(await resetUsage())
  } catch (err) {
    console.error('[usage] reset error:', err)
    res.status(500).json({ error: err.message })
  }
}
