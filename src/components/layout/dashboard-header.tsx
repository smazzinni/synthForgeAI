'use client'

import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Zap } from 'lucide-react'

export function DashboardHeader() {
  const { session } = useAuth()

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/80 backdrop-blur-md px-4 lg:px-6">
      <div className="flex-1" />
      <div className="flex items-center gap-3">
        <Badge variant="secondary" className="hidden sm:flex gap-1">
          <Zap className="h-3 w-3" />
          Pro Plan
        </Badge>
        <Button variant="outline" size="sm" asChild>
          <a href="/dashboard/studio">New Studio Session</a>
        </Button>
      </div>
    </header>
  )
}
