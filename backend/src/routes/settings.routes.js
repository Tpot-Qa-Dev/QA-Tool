// ─────────────────────────────────────────────────────────────────────────────
//  routes/settings.routes.js
//  Read and update runtime tool settings.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express'
import {
  getSettingsHandler,
  updateSettingsHandler,
  getUsageHandler,
  resetUsageHandler,
} from '../controllers/settings.controller.js'

const router = Router()

router.get('/settings', getSettingsHandler)
router.put('/settings', updateSettingsHandler)
router.get('/usage', getUsageHandler)
router.post('/usage/reset', resetUsageHandler)

export default router
