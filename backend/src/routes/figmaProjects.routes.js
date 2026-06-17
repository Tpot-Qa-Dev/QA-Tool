// ─────────────────────────────────────────────────────────────────────────────
//  routes/figmaProjects.routes.js
//  Project-wise Figma access tokens (add many, pick which one a run uses).
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express'
import {
  getFigmaProjects,
  postFigmaProject,
  deleteFigmaProject,
  putActiveFigmaProject,
} from '../controllers/figmaProjects.controller.js'

const router = Router()

router.get('/figma-projects', getFigmaProjects)
router.post('/figma-projects', postFigmaProject)
router.put('/figma-projects/active', putActiveFigmaProject)
router.delete('/figma-projects/:id', deleteFigmaProject)

export default router
