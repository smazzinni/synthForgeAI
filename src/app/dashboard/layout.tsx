'use client'

import { useEffect, useRef } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { DashboardSidebar } from '@/components/layout/dashboard-sidebar'
import { Loader2 } from 'lucide-react'

// Module-level flag to prevent redirect loops across remounts
let hasTriggeredRedirect = false

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, loading } = useAuth()
  const authEnabled = process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true'
  const localRedirectRef = useRef(false)

  useEffect(() => {
    // Only redirect once, even across remounts
    if (
      authEnabled &&
      !loading &&
      !user &&
      !localRedirectRef.current &&
      !hasTriggeredRedirect
    ) {
      localRedirectRef.current = true
      hasTriggeredRedirect = true
      // Use replace to avoid adding to browser history
      window.location.replace('/login')
    }
  }, [authEnabled, loading, user])

  // Show loading while checking auth state
  if (loading) {
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

  return (
    <div className="flex min-h-screen">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
