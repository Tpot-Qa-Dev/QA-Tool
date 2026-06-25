// ─────────────────────────────────────────────────────────────────────────────
//  routes/index.js
//  Aggregates every route module under a single router, mounted at /api.
//
//  Auth boundary: health and the login endpoint are public. Everything mounted
//  after `authenticate` requires a valid session (req.user is guaranteed there);
//  individual admin-only endpoints add `requireAdmin` inside their own module.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import healthRoutes from './health.routes.js'
import authRoutes from './auth.routes.js'
import auditRoutes from './audit.routes.js'
import historyRoutes from './history.routes.js'
import settingsRoutes from './settings.routes.js'
import adminRoutes from './admin.routes.js'
import sectionRoutes from './section.routes.js'
import customChecksRoutes from './customchecks.routes.js'
import figmaProjectsRoutes from './figmaProjects.routes.js'

const router = Router()

// ── Public ────────────────────────────────────────────────────────────────────
router.use(healthRoutes)
router.use(authRoutes) // /auth/login is public; /auth/* guards itself

// ── Authenticated ─────────────────────────────────────────────────────────────
router.use(authenticate)
router.use(auditRoutes)
router.use(historyRoutes)
router.use(settingsRoutes)
router.use(adminRoutes)
router.use(sectionRoutes)
router.use(customChecksRoutes)
router.use(figmaProjectsRoutes)

export default router
