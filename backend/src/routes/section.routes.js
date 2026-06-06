// ─────────────────────────────────────────────────────────────────────────────
//  routes/section.routes.js
//  Section-by-section live-web audit report.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express'
import { postSectionReport } from '../controllers/section.controller.js'

const router = Router()

router.post('/section-report', postSectionReport)

export default router
