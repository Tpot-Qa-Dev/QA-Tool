// ─────────────────────────────────────────────────────────────────────────────
//  components/Login.jsx
//  Sign-in screen shown whenever there is no authenticated user. On success the
//  parent (App) swaps it out for the dashboard.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { Box, Paper, Typography, TextField, Button, Alert, Stack } from '@mui/material'

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await onLogin(email.trim(), password)
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2,
      }}
    >
      <Paper
        component="form"
        onSubmit={submit}
        elevation={0}
        className="card"
        sx={{ width: '100%', maxWidth: 400, p: 4 }}
      >
        <Stack spacing={1} sx={{ mb: 3, textAlign: 'center' }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            QA-Tool
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Sign in to run audits and view your history
          </Typography>
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Stack spacing={2}>
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            autoFocus
            required
            fullWidth
            size="small"
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            fullWidth
            size="small"
          />
          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={busy || !email || !password}
            fullWidth
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </Stack>
      </Paper>
    </Box>
  )
}
