// ─────────────────────────────────────────────────────────────────────────────
//  routes/history.routes.js
//  Route definitions for past-audit retrieval, management and maintenance.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express'
import { requireAdmin } from '../middleware/auth.js'
import {
  getHistoryList,
  getHistoryItem,
  putHistoryItem,
  deleteHistoryItem,
  getHistoryStats,
  postHistoryMaintenance,
} from '../controllers/history.controller.js'

const router = Router()

router.get('/history', getHistoryList)
// Static sub-paths must precede the '/:id' param route so they aren't captured.
router.get('/history/stats', getHistoryStats)
// Bulk maintenance (clear / purge everyone's history) is destructive → admin-only.
router.post('/history/maintenance', requireAdmin, postHistoryMaintenance)
router.get('/history/:id', getHistoryItem)
router.put('/history/:id', putHistoryItem)
router.delete('/history/:id', deleteHistoryItem)

export default router
