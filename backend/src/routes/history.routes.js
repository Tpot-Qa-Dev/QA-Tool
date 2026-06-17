// ─────────────────────────────────────────────────────────────────────────────
//  routes/history.routes.js
//  Route definitions for past-audit retrieval, management and maintenance.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express'
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
router.post('/history/maintenance', postHistoryMaintenance)
router.get('/history/:id', getHistoryItem)
router.put('/history/:id', putHistoryItem)
router.delete('/history/:id', deleteHistoryItem)

export default router
