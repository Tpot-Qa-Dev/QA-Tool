// ─────────────────────────────────────────────────────────────────────────────
//  utils/jwt.js
//  Thin wrapper around jsonwebtoken so the rest of the app never imports the
//  library directly or reaches for the secret. Tokens carry the minimum needed
//  to authorise a request: user id, email, and role name.
// ─────────────────────────────────────────────────────────────────────────────
import jwt from 'jsonwebtoken'
import { config } from '../config/index.js'

// Sign a login token for a user row ({ id, email, role }).
export function signToken({ id, email, role }) {
  return jwt.sign({ sub: id, email, role }, config.auth.jwtSecret, {
    expiresIn: config.auth.jwtExpiresIn,
  })
}

// Verify and decode a token. Throws if invalid/expired — callers catch and 401.
export function verifyToken(token) {
  return jwt.verify(token, config.auth.jwtSecret)
}
