'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { DashboardSidebar } from '@/components/layout/dashboard-sidebar'
import { Loader2 } from 'lucide-react'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const authEnabled = process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true'

  useEffect(() => {
    // Only redirect if auth is enabled, loading is done, and no user
    if (authEnabled && !loading && !user) {
      // Use router.push for client-side navigation to avoid hard redirect
      // which can cause redirect loops with middleware
      router.push('/login')
    }
  }, [authEnabled, loading, user, router])

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
