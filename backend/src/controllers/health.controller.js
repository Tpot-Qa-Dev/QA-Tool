// ─────────────────────────────────────────────────────────────────────────────
//  controllers/health.controller.js
//  HTTP layer for GET /api/health — reports server status, run mode, the active
//  audit model + browser mode, and which API keys are configured (without
//  exposing the key values themselves).
// ─────────────────────────────────────────────────────────────────────────────
import { config, hasEnvAiKey } from '../config/index.js'
import { getSettings } from '../services/settings.service.js'
import { getActiveProfile } from '../services/aiModels.service.js'

export async function getHealth(_req, res) {
  let model = null
  try {
    model = (await getSettings()).audit.model
  } catch {
    /* settings unreadable — omit */
  }
  let profileKey = false
  try {
    const profile = await getActiveProfile()
    profileKey = !!(profile?.apiKey && profile.runnable)
  } catch {
    /* omit */
  }
  res.json({
    ok: true,
    version: '1.0.0',
    env: config.env, // 'development' | 'production'
    model, // active audit model
    headless: config.playwright.headless, // browser visibility
    keys: {
      openrouter: !!config.keys.openrouter,
      claude: !!config.keys.claude,
      ai: hasEnvAiKey() || profileKey,
      psi: !!config.keys.psi,
      figma: !!config.keys.figma,
    },
  })
}
