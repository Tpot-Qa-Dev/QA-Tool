// ─────────────────────────────────────────────────────────────────────────────
//  controllers/admin.controller.js
//  HTTP layer for the Admin dashboard — overview stats and prompt inspection.
// ─────────────────────────────────────────────────────────────────────────────
import { getOverview, getPrompts } from '../services/admin.service.js'
import { getEnvStatus, updateEnvConfig } from '../services/envconfig.service.js'

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
