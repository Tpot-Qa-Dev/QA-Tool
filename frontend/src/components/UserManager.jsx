// ─────────────────────────────────────────────────────────────────────────────
//  components/UserManager.jsx
//  Admin → Users. Create accounts, change role (admin/user), activate/deactivate,
//  reset passwords, and delete users. Rendered inside AdminPanel's "Users"
//  section. All calls go through the admin-only /auth/users endpoints.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Stack,
  Typography,
  TextField,
  MenuItem,
  Button,
  IconButton,
  Chip,
  Alert,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Tooltip,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import KeyIcon from '@mui/icons-material/VpnKey'
import { listUsers, createUser, updateUser, deleteUser } from '../api/client.js'

export default function UserManager({ currentUser }) {
  const [users, setUsers] = useState([])
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)

  // New-user form.
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'user' })
  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const load = useCallback(async () => {
    setError(null)
    try {
      setUsers(await listUsers())
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Wrap a mutating action with shared busy/error/notice handling + reload.
  async function run(fn, okMsg) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await fn()
      await load()
      if (okMsg) setNotice(okMsg)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function submitCreate(e) {
    e.preventDefault()
    run(async () => {
      await createUser({
        name: form.name.trim() || undefined,
        email: form.email.trim(),
        password: form.password,
        role: form.role,
      })
      setForm({ name: '', email: '', password: '', role: 'user' })
    }, 'User created')
  }

  function changeRole(u, role) {
    run(() => updateUser(u.id, { role }), `Role updated for ${u.email}`)
  }
  function toggleActive(u) {
    run(() => updateUser(u.id, { isActive: !u.isActive }), `${u.email} ${u.isActive ? 'deactivated' : 'activated'}`)
  }
  function resetPassword(u) {
    const pw = window.prompt(`New password for ${u.email}:`)
    if (!pw) return
    run(() => updateUser(u.id, { password: pw }), `Password reset for ${u.email}`)
  }
  function removeUser(u) {
    if (!window.confirm(`Delete ${u.email}? This cannot be undone.`)) return
    run(() => deleteUser(u.id), `Deleted ${u.email}`)
  }

  return (
    <Box sx={{ maxWidth: 920 }}>
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        Users
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Admins manage configuration, API keys and accounts. Users can run audits and see only their
        own history.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      {/* Create user */}
      <Box component="form" onSubmit={submitCreate} className="card" sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
          Add a user
        </Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems="flex-start">
          <TextField
            label="Name"
            size="small"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            sx={{ flex: 1 }}
          />
          <TextField
            label="Email"
            type="email"
            size="small"
            required
            value={form.email}
            onChange={(e) => setField('email', e.target.value)}
            sx={{ flex: 1.4 }}
          />
          <TextField
            label="Password"
            type="text"
            size="small"
            required
            value={form.password}
            onChange={(e) => setField('password', e.target.value)}
            sx={{ flex: 1.2 }}
          />
          <TextField
            label="Role"
            select
            size="small"
            value={form.role}
            onChange={(e) => setField('role', e.target.value)}
            sx={{ minWidth: 120 }}
          >
            <MenuItem value="user">User</MenuItem>
            <MenuItem value="admin">Admin</MenuItem>
          </TextField>
          <Button type="submit" variant="contained" disabled={busy} sx={{ height: 40 }}>
            Add
          </Button>
        </Stack>
      </Box>

      {/* User list */}
      <Box className="card" sx={{ p: 0, overflow: 'hidden' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>User</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((u) => {
              const isSelf = currentUser?.id === u.id
              return (
                <TableRow key={u.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {u.name || '—'} {isSelf && <Chip size="small" label="you" sx={{ ml: 0.5 }} />}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {u.email}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <TextField
                      select
                      size="small"
                      value={u.role}
                      disabled={busy || isSelf}
                      onChange={(e) => changeRole(u, e.target.value)}
                      sx={{ minWidth: 110 }}
                    >
                      <MenuItem value="user">User</MenuItem>
                      <MenuItem value="admin">Admin</MenuItem>
                    </TextField>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={u.isActive ? 'active' : 'inactive'}
                      color={u.isActive ? 'success' : 'default'}
                      variant={u.isActive ? 'filled' : 'outlined'}
                      onClick={() => !isSelf && toggleActive(u)}
                      sx={{ cursor: isSelf ? 'default' : 'pointer' }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Reset password">
                      <span>
                        <IconButton size="small" disabled={busy} onClick={() => resetPassword(u)}>
                          <KeyIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title={isSelf ? 'You cannot delete yourself' : 'Delete user'}>
                      <span>
                        <IconButton
                          size="small"
                          color="error"
                          disabled={busy || isSelf}
                          onClick={() => removeUser(u)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              )
            })}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    No users yet.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Box>
    </Box>
  )
}
