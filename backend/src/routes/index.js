// ─────────────────────────────────────────────────────────────────────────────
//  routes/index.js
//  Aggregates every route module under a single router, mounted at /api.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express'
import healthRoutes from './health.routes.js'
import auditRoutes from './audit.routes.js'
import historyRoutes from './history.routes.js'
import settingsRoutes from './settings.routes.js'
import adminRoutes from './admin.routes.js'
import sectionRoutes from './section.routes.js'
import customChecksRoutes from './customchecks.routes.js'
import figmaProjectsRoutes from './figmaProjects.routes.js'

const router = Router()

router.use(healthRoutes)
router.use(auditRoutes)
router.use(historyRoutes)
router.use(settingsRoutes)
router.use(adminRoutes)
router.use(sectionRoutes)
router.use(customChecksRoutes)
router.use(figmaProjectsRoutes)

export default router
