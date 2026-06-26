'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
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

// Debounce timer for auth state changes
let lastAuthUpdate = 0
const AUTH_UPDATE_COOLDOWN = 2000 // 2 seconds - ignore rapid duplicate updates

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const supabaseRef = useRef<ReturnType<typeof getSupabaseBrowserClient> | null>(null)
  const initRef = useRef(false)

  useEffect(() => {
    // Prevent double initialization
    if (initRef.current) return
    initRef.current = true

    const supabase = getSupabaseBrowserClient()

    if (!supabase) {
      // No Supabase client - run without auth. Defer the setState so we don't
      // trigger a synchronous re-render inside the effect body (React 19 lint).
      queueMicrotask(() => setLoading(false))
      return
    }

    supabaseRef.current = supabase
    let mounted = true

    // Handle code exchange from auth callback (email confirmation, password reset, etc.)
    const handleCodeExchange = async () => {
      if (typeof window === 'undefined') return
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      if (code) {
        try {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) {
            console.warn('[Auth] Code exchange failed:', error.message)
          } else {
            // Clean up the URL by removing the code parameter
            const url = new URL(window.location.href)
            url.searchParams.delete('code')
            window.history.replaceState({}, '', url.pathname)
          }
        } catch (err) {
          console.warn('[Auth] Code exchange error:', err)
        }
      }
    }

    // Exchange code first, then get session
    handleCodeExchange().then(() => {
      // Get initial session ONCE
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (mounted) {
          setSession(session)
          setUser(session?.user ?? null)
          setLoading(false)
          lastAuthUpdate = Date.now()
        }
      }).catch(() => {
        if (mounted) setLoading(false)
      })
    })

    // Listen for auth state changes
    // IMPORTANT: Debounce to prevent re-render cascades from TOKEN_REFRESHED
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return

      // INITIAL_SESSION is already handled by getSession() above
      if (event === 'INITIAL_SESSION') return

      // Debounce TOKEN_REFRESHED events - these fire every few minutes and
      // cause unnecessary re-renders that trigger child useEffect hooks
      if (event === 'TOKEN_REFRESHED') {
        const now = Date.now()
        if (now - lastAuthUpdate < AUTH_UPDATE_COOLDOWN) {
          // Skip this update - too soon after the last one
          return
        }
        // Just update the session silently without triggering loading state
        setSession(session)
        lastAuthUpdate = Date.now()
        return
      }

      // SIGN_IN and SIGN_OUT events should always trigger updates
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
      lastAuthUpdate = Date.now()
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = supabaseRef.current || getSupabaseBrowserClient()
    if (!supabase) return { data: null, error: new Error('Auth not configured') }
    try {
      const result = await supabase.auth.signInWithPassword({ email, password })
      return result
    } catch (err) {
      return { data: null, error: err }
    }
  }, [])

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    const supabase = supabaseRef.current || getSupabaseBrowserClient()
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
    const supabase = supabaseRef.current || getSupabaseBrowserClient()
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
    const supabase = supabaseRef.current || getSupabaseBrowserClient()
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
