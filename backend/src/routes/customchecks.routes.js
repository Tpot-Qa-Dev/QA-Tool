// ─────────────────────────────────────────────────────────────────────────────
//  routes/customchecks.routes.js
//  Operator-defined extra checks per module.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express'
import { listCustomChecks, postCustomCheck, patchCustomCheck, deleteCustomCheck, setBuiltinDisabledHandler } from '../controllers/customchecks.controller.js'

const router = Router()

router.get   ('/custom-checks',               listCustomChecks)
router.post  ('/custom-checks',               postCustomCheck)
router.post  ('/custom-checks/builtin',       setBuiltinDisabledHandler)
router.put   ('/custom-checks/:moduleId/:id', patchCustomCheck)
router.delete('/custom-checks/:moduleId/:id', deleteCustomCheck)

export default router
