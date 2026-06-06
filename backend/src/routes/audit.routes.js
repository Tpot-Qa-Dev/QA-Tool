// ─────────────────────────────────────────────────────────────────────────────
//  routes/audit.routes.js
//  Route definitions for the audit endpoint.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express'
import { postAudit } from '../controllers/audit.controller.js'

const router = Router()

router.post('/audit', postAudit)

export default router
