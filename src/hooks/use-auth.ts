'use client'

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ data: unknown; error: unknown }>
  signUp: (email: string, password: string, fullName: string) => Promise<{ data: unknown; error: unknown }>
  signOut: () => Promise<{ error: unknown }>
  resetPassword: (email: string) => Promise<{ data: unknown; error: unknown }>
}

const AuthContext = createContext<AuthState | null>(null)

// Lazy Supabase client - only created when needed
let supabaseInstance: ReturnType<typeof import('@supabase/supabase-js').createClient> | null = null
function getSupabase() {
  if (!supabaseInstance) {
    const { createClient } = require('@supabase/supabase-js')
    supabaseInstance = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true } }
    )
  }
  return supabaseInstance
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = getSupabase()
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    return getSupabase().auth.signInWithPassword({ email, password })
  }, [])

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    return getSupabase().auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await getSupabase().auth.signOut()
    if (!error) window.location.href = '/login'
    return { error }
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    return getSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    })
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
    // Instead of throwing, return a default state for SSR compatibility
    return {
      user: null,
      session: null,
      loading: true,
      signIn: async () => ({ data: null, error: new Error('Not initialized') }),
      signUp: async () => ({ data: null, error: new Error('Not initialized') }),
      signOut: async () => ({ error: null }),
      resetPassword: async () => ({ data: null, error: new Error('Not initialized') }),
    }
  }
  return context
}
