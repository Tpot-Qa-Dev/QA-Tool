// ─────────────────────────────────────────────────────────────────────────────
//  routes/auth.routes.js
//  /api/auth — login is public; everything else needs a valid session, and the
//  user-management endpoints additionally require an admin.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express'
import { authenticate, requireAdmin } from '../middleware/auth.js'
import {
  login,
  me,
  getUsers,
  postUser,
  putUser,
  removeUser,
} from '../controllers/auth.controller.js'

const router = Router()

// Public.
router.post('/auth/login', login)

// Authenticated.
router.get('/auth/me', authenticate, me)

// Admin-only user management.
router.get('/auth/users', authenticate, requireAdmin, getUsers)
router.post('/auth/users', authenticate, requireAdmin, postUser)
router.put('/auth/users/:id', authenticate, requireAdmin, putUser)
router.delete('/auth/users/:id', authenticate, requireAdmin, removeUser)

export default router
