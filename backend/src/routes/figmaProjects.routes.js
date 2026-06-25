// ─────────────────────────────────────────────────────────────────────────────
//  routes/figmaProjects.routes.js
//  Project-wise Figma access tokens (add many, pick which one a run uses).
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express'
import { requireAdmin } from '../middleware/auth.js'
import {
  getFigmaProjects,
  postFigmaProject,
  deleteFigmaProject,
  putActiveFigmaProject,
} from '../controllers/figmaProjects.controller.js'

const router = Router()

// Reads available to any signed-in user (tokens are masked); managing project
// tokens is admin-only.
router.get('/figma-projects', getFigmaProjects)
router.post('/figma-projects', requireAdmin, postFigmaProject)
router.put('/figma-projects/active', requireAdmin, putActiveFigmaProject)
router.delete('/figma-projects/:id', requireAdmin, deleteFigmaProject)

export default router
