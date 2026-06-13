// ─────────────────────────────────────────────────────────────────────────────
//  routes/admin.routes.js
//  Admin dashboard — read-only overview stats and prompt inspection.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express'
import {
  getAdminOverview, getAdminPrompts, getAdminConfig, updateAdminConfig,
  getAdminPromptConfig, getAdminPromptVersion, postAdminPromptVersion,
  putAdminPromptActive, deleteAdminPromptVersion,
  getAdminAiModels, postAdminAiModel, putAdminAiModelActive, putAdminAiModel, deleteAdminAiModel,
} from '../controllers/admin.controller.js'

const router = Router()

router.get('/admin/overview', getAdminOverview)
router.get('/admin/prompts',  getAdminPrompts)
router.get('/admin/config',   getAdminConfig)
router.put('/admin/config',   updateAdminConfig)

// Editable prompt instructions + version history.
router.get   ('/admin/prompt-config',          getAdminPromptConfig)
router.post  ('/admin/prompt-config',          postAdminPromptVersion)
router.put   ('/admin/prompt-config/active',   putAdminPromptActive)
router.get   ('/admin/prompt-config/:id',      getAdminPromptVersion)
router.delete('/admin/prompt-config/:id',      deleteAdminPromptVersion)

// AI model profiles (multiple models, each with its own API key).
router.get   ('/admin/ai-models',        getAdminAiModels)
router.post  ('/admin/ai-models',        postAdminAiModel)
router.put   ('/admin/ai-models/active', putAdminAiModelActive)
router.put   ('/admin/ai-models/:id',    putAdminAiModel)
router.delete('/admin/ai-models/:id',    deleteAdminAiModel)

export default router
