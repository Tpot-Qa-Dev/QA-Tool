// ─────────────────────────────────────────────────────────────────────────────
//  routes/customchecks.routes.js
//  Operator-defined extra checks per module.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express'
import { requireAdmin } from '../middleware/auth.js'
import {
  listCustomChecks,
  postCustomCheck,
  patchCustomCheck,
  deleteCustomCheck,
  setBuiltinDisabledHandler,
} from '../controllers/customchecks.controller.js'

const router = Router()

// Any signed-in user can read the check catalogue (they pick checks per audit);
// defining or disabling checks is admin-only.
router.get('/custom-checks', listCustomChecks)
router.post('/custom-checks', requireAdmin, postCustomCheck)
router.post('/custom-checks/builtin', requireAdmin, setBuiltinDisabledHandler)
router.put('/custom-checks/:moduleId/:id', requireAdmin, patchCustomCheck)
router.delete('/custom-checks/:moduleId/:id', requireAdmin, deleteCustomCheck)

export default router
