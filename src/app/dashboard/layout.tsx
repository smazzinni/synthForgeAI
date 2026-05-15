'use client'

import { useEffect, useRef } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { DashboardSidebar } from '@/components/layout/dashboard-sidebar'
import { Loader2 } from 'lucide-react'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, loading } = useAuth()
  const authEnabled = process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true'
  const redirectRef = useRef(false)

  useEffect(() => {
    // Only redirect once per mount
    if (authEnabled && !loading && !user && !redirectRef.current) {
      redirectRef.current = true
      // Use replace to avoid adding to history
      window.location.replace('/login')
    }
  }, [authEnabled, loading, user])

  // Show loading while checking auth state
  if (loading && authEnabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  // If auth is enabled and no user, show loading while redirect happens
  if (authEnabled && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
          <p className="text-sm text-muted-foreground">Redirecting to login...</p>
        </div>
      </div>
    )
  }

  // If auth is disabled (dev mode), show dashboard without auth check
  // This allows the app to work even if Supabase keys are misconfigured
  return (
    <div className="flex min-h-screen">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
