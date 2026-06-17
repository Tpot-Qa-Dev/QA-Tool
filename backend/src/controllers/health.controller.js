// ─────────────────────────────────────────────────────────────────────────────
//  controllers/health.controller.js
//  HTTP layer for GET /api/health — reports server status, run mode, the active
//  audit model + browser mode, and which API keys are configured (without
//  exposing the key values themselves).
// ─────────────────────────────────────────────────────────────────────────────
import { config } from '../config/index.js'
import { getSettings } from '../services/settings.service.js'

export async function getHealth(_req, res) {
  let model = null
  try {
    model = (await getSettings()).audit.model
  } catch {
    /* settings unreadable — omit */
  }
  res.json({
    ok: true,
    version: '1.0.0',
    env: config.env, // 'development' | 'production'
    model, // active audit model
    headless: config.playwright.headless, // browser visibility
    keys: {
      claude: !!config.keys.claude,
      psi: !!config.keys.psi,
      figma: !!config.keys.figma,
    },
  })
}
