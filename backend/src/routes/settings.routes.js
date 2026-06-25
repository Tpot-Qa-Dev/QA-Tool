// ─────────────────────────────────────────────────────────────────────────────
//  routes/settings.routes.js
//  Read and update runtime tool settings.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express'
import { requireAdmin } from '../middleware/auth.js'
import {
  getSettingsHandler,
  updateSettingsHandler,
  getUsageHandler,
  resetUsageHandler,
  getUserAiModelsHandler,
} from '../controllers/settings.controller.js'

const router = Router()

// Reads are available to any signed-in user; writes are admin-only.
router.get('/settings', getSettingsHandler)
router.put('/settings', requireAdmin, updateSettingsHandler)
router.get('/usage', getUsageHandler)
router.post('/usage/reset', requireAdmin, resetUsageHandler)

// User-facing: AI models the admin permitted users to pick from.
router.get('/ai-models', getUserAiModelsHandler)

export default router
