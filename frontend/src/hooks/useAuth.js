// ─────────────────────────────────────────────────────────────────────────────
//  hooks/useAuth.js
//  Authentication state for the whole app: the signed-in user, login/logout, and
//  a one-time session restore from the stored token. Components read `user` and
//  call `login`/`logout`; the API client handles attaching the token to requests.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import { login as apiLogin, getMe, clearToken, getToken } from '../api/client.js'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false) // false until the initial token check finishes

  // On mount, if a token is stored, validate it and restore the session.
  useEffect(() => {
    let alive = true
    async function restore() {
      if (!getToken()) {
        if (alive) setReady(true)
        return
      }
      try {
        const me = await getMe()
        if (alive) setUser(me)
      } catch {
        clearToken()
      } finally {
        if (alive) setReady(true)
      }
    }
    restore()
    return () => {
      alive = false
    }
  }, [])

  // A 401 from any request (expired/revoked token) logs the user out app-wide.
  useEffect(() => {
    const onUnauthorized = () => setUser(null)
    window.addEventListener('auth:unauthorized', onUnauthorized)
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized)
  }, [])

  const login = useCallback(async (email, password) => {
    const { user: u } = await apiLogin(email, password)
    setUser(u)
    return u
  }, [])

  const logout = useCallback(() => {
    clearToken()
    setUser(null)
  }, [])

  const isAdmin = user?.role === 'admin'

  return { user, isAdmin, ready, login, logout }
}
