// ─────────────────────────────────────────────────────────────────────────────
//  middleware/auth.js
//  Request guards. `authenticate` verifies the Bearer token and loads the user
//  onto req.user; `requireAdmin` gates admin-only endpoints. Routes mounted
//  after authenticate() can assume req.user exists.
// ─────────────────────────────────────────────────────────────────────────────
import { verifyToken } from '../utils/jwt.js'
import { findById, publicUser } from '../services/auth.service.js'

// Pull the JWT out of the Authorization header ("Bearer <token>").
function bearer(req) {
  const h = req.headers.authorization || ''
  const [scheme, token] = h.split(' ')
  return scheme === 'Bearer' && token ? token : null
}

export async function authenticate(req, res, next) {
  const token = bearer(req)
  if (!token) return res.status(401).json({ error: 'Authentication required' })
  try {
    const payload = verifyToken(token)
    // Re-load from the DB so deactivated/deleted accounts lose access immediately
    // and role changes take effect without forcing a new login.
    const row = await findById(payload.sub)
    if (!row || !row.is_active) return res.status(401).json({ error: 'Account is inactive' })
    req.user = publicUser(row)
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' })
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' })
  }
  next()
}
