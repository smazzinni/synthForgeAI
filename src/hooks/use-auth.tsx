'use client'

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ data: unknown; error: unknown }>
  signUp: (email: string, password: string, fullName: string) => Promise<{ data: unknown; error: unknown }>
  signOut: () => Promise<{ error: unknown }>
  resetPassword: (email: string) => Promise<{ data: unknown; error: unknown }>
}

const defaultAuthState: AuthState = {
  user: null,
  session: null,
  loading: true,
  signIn: async () => ({ data: null, error: new Error('Not initialized') }),
  signUp: async () => ({ data: null, error: new Error('Not initialized') }),
  signOut: async () => ({ error: null }),
  resetPassword: async () => ({ data: null, error: new Error('Not initialized') }),
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()

    if (!supabase) {
      // No Supabase client available - run in dev/demo mode (no auth)
      setLoading(false)
      return
    }

    let mounted = true

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) {
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)
      }
    }).catch(() => {
      if (mounted) setLoading(false)
    })

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return { data: null, error: new Error('Auth not configured') }
    try {
      const result = await supabase.auth.signInWithPassword({ email, password })
      return result
    } catch (err) {
      return { data: null, error: err }
    }
  }, [])

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return { data: null, error: new Error('Auth not configured') }
    try {
      const result = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      })
      return result
    } catch (err) {
      return { data: null, error: err }
    }
  }, [])

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (supabase) {
      const { error } = await supabase.auth.signOut()
      if (!error && typeof window !== 'undefined') {
        window.location.href = '/login'
      }
      return { error }
    }
    if (typeof window !== 'undefined') {
      window.location.href = '/login'
    }
    return { error: null }
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return { data: null, error: new Error('Auth not configured') }
    try {
      const result = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback`,
      })
      return result
    } catch (err) {
      return { data: null, error: err }
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signUp, signOut, resetPassword }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    return defaultAuthState
  }
  return context
}
