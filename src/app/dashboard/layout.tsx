'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { DashboardSidebar } from '@/components/layout/dashboard-sidebar'
import { NotificationCenter } from '@/components/layout/notification-center'
import { Loader2, PanelLeft, PanelLeftClose, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, loading, authRequired } = useAuth()
  const authEnabled = authRequired
  const redirectRef = useRef(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState<string | null>(null)
  const pathname = usePathname()
  // Drawer is open only for the pathname it was opened on, so it closes on route change
  const drawerOpen = mobileOpen === pathname

  useEffect(() => {
    if (authEnabled && !loading && !user && !redirectRef.current) {
      redirectRef.current = true
      window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`)
    }
  }, [authEnabled, loading, user])

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
    <div className="flex min-h-dvh bg-background">
      {/* Sidebar with collapse support */}
      <div className={`hidden md:block transition-all duration-300 ease-in-out ${sidebarCollapsed ? 'w-0 overflow-hidden' : 'w-64'}`}>
        <DashboardSidebar />
      </div>

      <Sheet open={drawerOpen} onOpenChange={(o) => setMobileOpen(o ? pathname : null)}>
        <SheetContent side="left" className="w-64 max-w-[85vw] p-0 gap-0 md:hidden">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <DashboardSidebar onNavigate={() => setMobileOpen(null)} />
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <div className="min-w-0 flex-1 flex flex-col">
        {/* Top bar with sidebar toggle */}
        <div className="h-11 border-b flex items-center px-3 gap-2 bg-card shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 md:hidden"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(pathname)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex h-7 w-7"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            {sidebarCollapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
          <div className="flex-1" />
          <NotificationCenter />
        </div>
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
