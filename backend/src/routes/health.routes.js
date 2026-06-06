// ─────────────────────────────────────────────────────────────────────────────
//  routes/health.routes.js
//  Route definitions for the health-check endpoint.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express'
import { getHealth } from '../controllers/health.controller.js'

const router = Router()

router.get('/health', getHealth)

export default router
