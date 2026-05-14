'use client'

import { useState, useEffect, createContext, useContext, useCallback } from 'react'
import type { AuthUser, AuthSession } from '@/lib/supabase/types'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

interface AuthContextType {
  session: AuthSession
  login: (email: string, password: string) => Promise<{ error: string | null }>
  signup: (email: string, password: string, name: string) => Promise<{ error: string | null }>
  logout: () => Promise<void>
  loading: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession>({
    user: null,
    isAuthenticated: false,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkSession()

    // Listen for auth changes
    const supabase = getSupabaseBrowserClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, supaSession) => {
        if (event === 'SIGNED_IN' && supaSession?.user) {
          setSession({
            user: {
              id: supaSession.user.id,
              email: supaSession.user.email || '',
              full_name: supaSession.user.user_metadata?.full_name || null,
              avatar_url: supaSession.user.user_metadata?.avatar_url || null,
              role: 'member',
              organizationId: null,
              organizationRole: null,
            },
            isAuthenticated: true,
          })
        } else if (event === 'SIGNED_OUT') {
          setSession({ user: null, isAuthenticated: false })
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  async function checkSession() {
    try {
      const res = await fetch('/api/auth/session')
      if (res.ok) {
        const data = await res.json()
        if (data.user) {
          setSession({
            user: data.user,
            isAuthenticated: true,
          })
        }
      }
    } catch {
      // Session check failed, user is not authenticated
    } finally {
      setLoading(false)
    }
  }

  const login = useCallback(async (email: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        return { error: data.error || 'Login failed' }
      }

      setSession({
        user: data.user,
        isAuthenticated: true,
      })

      return { error: null }
    } catch {
      return { error: 'An unexpected error occurred' }
    }
  }, [])

  const signup = useCallback(async (email: string, password: string, name: string) => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      })

      const data = await res.json()

      if (!res.ok) {
        return { error: data.error || 'Registration failed' }
      }

      // If email confirmation is disabled, user is logged in immediately
      if (data.user) {
        setSession({
          user: data.user,
          isAuthenticated: true,
        })
      }

      return { error: null }
    } catch {
      return { error: 'An unexpected error occurred' }
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      setSession({ user: null, isAuthenticated: false })
      window.location.href = '/'
    }
  }, [])

  return (
    <AuthContext.Provider value={{ session, login, signup, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
