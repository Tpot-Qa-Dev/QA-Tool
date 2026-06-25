// ─────────────────────────────────────────────────────────────────────────────
//  controllers/auth.controller.js
//  HTTP layer for /api/auth — login, current user, and admin user management.
// ─────────────────────────────────────────────────────────────────────────────
import { signToken } from '../utils/jwt.js'
import {
  verifyCredentials,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  findById,
  publicUser,
  adminCount,
} from '../services/auth.service.js'

// POST /api/auth/login  { email, password } → { token, user }
export async function login(req, res) {
  const { email, password } = req.body || {}
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' })
  }
  try {
    const user = await verifyCredentials(email, password)
    if (!user) return res.status(401).json({ error: 'Invalid email or password' })
    const token = signToken(user)
    res.json({ token, user })
  } catch (err) {
    console.error('[auth] login error:', err)
    res.status(500).json({ error: 'Login failed' })
  }
}

// GET /api/auth/me → { user } (the authenticated user)
export function me(req, res) {
  res.json({ user: req.user })
}

// ── Admin: user management ──────────────────────────────────────────────────

export async function getUsers(_req, res) {
  try {
    res.json({ users: await listUsers() })
  } catch (err) {
    console.error('[auth] list users error:', err)
    res.status(500).json({ error: err.message })
  }
}

export async function postUser(req, res) {
  const { email, password, name, role } = req.body || {}
  try {
    const user = await createUser({ email, password, name, role })
    res.status(201).json({ user })
  } catch (err) {
    // Unique-violation on email → 409 rather than a generic 400.
    if (err.code === '23505') return res.status(409).json({ error: 'A user with that email already exists' })
    console.error('[auth] create user error:', err)
    res.status(400).json({ error: err.message })
  }
}

export async function putUser(req, res) {
  const id = Number(req.params.id)
  const { name, role, isActive, password } = req.body || {}
  try {
    const target = await findById(id)
    if (!target) return res.status(404).json({ error: 'User not found' })

    // Guard: never let the last active admin be demoted or deactivated — that
    // would lock everyone out of configuration.
    const wasAdmin = target.role === 'admin'
    const losingAdmin = wasAdmin && ((role !== undefined && role !== 'admin') || isActive === false)
    if (losingAdmin && (await adminCount()) <= 1) {
      return res.status(409).json({ error: 'Cannot remove the last remaining admin' })
    }

    const user = await updateUser(id, { name, role, isActive, password })
    res.json({ user })
  } catch (err) {
    console.error('[auth] update user error:', err)
    res.status(400).json({ error: err.message })
  }
}

export async function removeUser(req, res) {
  const id = Number(req.params.id)
  try {
    const target = await findById(id)
    if (!target) return res.status(404).json({ error: 'User not found' })
    if (req.user.id === id) return res.status(409).json({ error: 'You cannot delete your own account' })
    if (target.role === 'admin' && (await adminCount()) <= 1) {
      return res.status(409).json({ error: 'Cannot delete the last remaining admin' })
    }
    const ok = await deleteUser(id)
    res.json({ ok })
  } catch (err) {
    console.error('[auth] delete user error:', err)
    res.status(400).json({ error: err.message })
  }
}
