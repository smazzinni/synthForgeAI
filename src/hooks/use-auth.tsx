'use client'

import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from 'react'

export interface AuthUser {
  id: string
  email: string
  name: string | null
  role: string
}

/** Post-login destination: `?next=` if it is a same-site path, else /dashboard. */
export function safeNext(raw: string | null | undefined): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\') ? raw : '/dashboard'
}

type Result = { data: unknown; error: Error | null }

interface AuthState {
  user: AuthUser | null
  loading: boolean
  authRequired: boolean
  isAuthenticated: boolean
  refresh: () => Promise<void>
  signIn: (email: string, password: string) => Promise<Result>
  signUp: (email: string, password: string, fullName?: string) => Promise<Result>
  signOut: () => Promise<{ error: Error | null }>
  resetPassword: (email: string) => Promise<Result & { devResetUrl?: string }>
  updatePassword: (token: string, password: string) => Promise<Result>
}

const notReady = async () => ({ data: null, error: new Error('Not initialized') })

const defaultAuthState: AuthState = {
  user: null,
  loading: true,
  authRequired: false,
  isAuthenticated: false,
  refresh: async () => {},
  signIn: notReady,
  signUp: notReady,
  signOut: async () => ({ error: null }),
  resetPassword: notReady,
  updatePassword: notReady,
}

const AuthContext = createContext<AuthState | null>(null)

async function call(path: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, data }
}

async function post(path: string, body: unknown): Promise<Result & { data: Record<string, unknown> }> {
  try {
    const { ok, data } = await call(path, body)
    if (!ok) {
      const msg = typeof data.error === 'string' ? data.error : 'Request failed. Please try again.'
      return { data: null as never, error: new Error(msg) }
    }
    return { data, error: null }
  } catch {
    return { data: null as never, error: new Error('Network error. Please try again.') }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authRequired, setAuthRequired] = useState(false)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' })
      const data = await res.json()
      setAuthRequired(!!data.authRequired)
      setUser(data.authenticated ? (data.user ?? null) : null)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
     
    void refresh()
  }, [refresh])

  const signIn = useCallback(async (email: string, password: string) => {
    const r = await post('/api/auth/login', { email, password })
    if (!r.error) setUser((r.data.user as AuthUser) ?? null)
    return r
  }, [])

  const signUp = useCallback(async (email: string, password: string, fullName?: string) => {
    const r = await post('/api/auth/register', { email, password, name: fullName || undefined })
    if (!r.error) setUser((r.data.user as AuthUser) ?? null)
    return r
  }, [])

  const signOut = useCallback(async () => {
    try {
      await call('/api/auth/logout')
    } catch { /* still leave */ }
    setUser(null)
    window.location.href = '/login'
    return { error: null }
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    const r = await post('/api/auth/forgot-password', { email })
    return { ...r, devResetUrl: typeof r.data?.devResetUrl === 'string' ? r.data.devResetUrl : undefined }
  }, [])

  const updatePassword = useCallback((token: string, password: string) => post('/api/auth/reset-password', { token, password }), [])

  const value = useMemo<AuthState>(() => ({
    user, loading, authRequired, isAuthenticated: !!user, refresh,
    signIn, signUp, signOut, resetPassword, updatePassword,
  }), [user, loading, authRequired, refresh, signIn, signUp, signOut, resetPassword, updatePassword])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext) ?? defaultAuthState
}
