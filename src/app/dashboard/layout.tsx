'use client'

import { useEffect } from 'react'
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
  const shouldRedirect = !loading && !user && authEnabled

  // Middleware handles redirect, but as a fallback - use hard redirect via useEffect
  // to avoid client-side router issues and satisfy immutability lint rule
  useEffect(() => {
    if (shouldRedirect && typeof window !== 'undefined') {
      window.location.href = '/login'
    }
  }, [shouldRedirect])

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

  if (shouldRedirect) {
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
