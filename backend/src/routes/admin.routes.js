// ─────────────────────────────────────────────────────────────────────────────
//  routes/admin.routes.js
//  Admin dashboard — read-only overview stats and prompt inspection.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express'
import { getAdminOverview, getAdminPrompts, getAdminConfig, updateAdminConfig } from '../controllers/admin.controller.js'

const router = Router()

router.get('/admin/overview', getAdminOverview)
router.get('/admin/prompts',  getAdminPrompts)
router.get('/admin/config',   getAdminConfig)
router.put('/admin/config',   updateAdminConfig)

export default router
