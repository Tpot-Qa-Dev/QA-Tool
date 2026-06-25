// ─────────────────────────────────────────────────────────────────────────────
//  services/auth.service.js
//  User accounts + authentication, backed by the Postgres `users`/`roles`
//  tables (created in 001_init.sql, seeded in 002_…sql). Passwords are stored as
//  bcrypt hashes only — plaintext never touches the database.
// ─────────────────────────────────────────────────────────────────────────────
import bcrypt from 'bcryptjs'
import pool from '../config/database.js'

const SALT_ROUNDS = 10

// Shape a joined user row for API responses — never includes the password hash.
function publicUser(row) {
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role || 'user',
    isActive: row.is_active,
    createdAt: row.created_at,
  }
}

const SELECT_USER = `
  SELECT u.id, u.email, u.name, u.password_hash, u.is_active, u.created_at, r.name AS role
  FROM users u
  LEFT JOIN roles r ON r.id = u.role_id
`

export async function findByEmail(email) {
  const { rows } = await pool.query(`${SELECT_USER} WHERE lower(u.email) = lower($1)`, [email])
  return rows[0] || null
}

export async function findById(id) {
  const { rows } = await pool.query(`${SELECT_USER} WHERE u.id = $1`, [id])
  return rows[0] || null
}

// Verify an email + password against the store. Returns the public user on
// success, or null on bad credentials / inactive account.
export async function verifyCredentials(email, password) {
  const row = await findByEmail(email)
  if (!row || !row.is_active) return null
  const ok = await bcrypt.compare(password, row.password_hash || '')
  return ok ? publicUser(row) : null
}

export async function listUsers() {
  const { rows } = await pool.query(`${SELECT_USER} ORDER BY u.created_at ASC`)
  return rows.map(publicUser)
}

// Resolve a role name ('admin' | 'user') to its id.
async function roleIdByName(name) {
  const { rows } = await pool.query('SELECT id FROM roles WHERE name = $1', [name])
  return rows[0]?.id ?? null
}

export async function createUser({ email, password, name, role = 'user' }) {
  if (!email || !password) throw new Error('email and password are required')
  const password_hash = await bcrypt.hash(password, SALT_ROUNDS)
  const role_id = await roleIdByName(role === 'admin' ? 'admin' : 'user')
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, role_id, is_active)
     VALUES ($1, $2, $3, $4, true)
     RETURNING id`,
    [email, password_hash, name || null, role_id],
  )
  return findById(rows[0].id).then(publicUser)
}

// Update mutable fields. Any of name/role/isActive/password may be omitted.
export async function updateUser(id, { name, role, isActive, password } = {}) {
  const sets = []
  const vals = []
  let i = 1
  if (name !== undefined) { sets.push(`name = $${i++}`); vals.push(name) }
  if (isActive !== undefined) { sets.push(`is_active = $${i++}`); vals.push(!!isActive) }
  if (role !== undefined) {
    const role_id = await roleIdByName(role === 'admin' ? 'admin' : 'user')
    sets.push(`role_id = $${i++}`); vals.push(role_id)
  }
  if (password) {
    sets.push(`password_hash = $${i++}`); vals.push(await bcrypt.hash(password, SALT_ROUNDS))
  }
  if (!sets.length) return findById(id).then(publicUser)
  vals.push(id)
  await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${i}`, vals)
  return findById(id).then(publicUser)
}

export async function deleteUser(id) {
  const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [id])
  return rowCount > 0
}

// How many admins exist — used to stop the last admin from being removed or
// demoted, which would lock everyone out of configuration.
export async function adminCount() {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE r.name = 'admin' AND u.is_active = true`,
  )
  return rows[0]?.n ?? 0
}

export { publicUser }
