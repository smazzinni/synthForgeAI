'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { mockDatabases } from '@/lib/mock-data'
import { ArrowRight } from 'lucide-react'

export function RecentProjects() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Recent Projects</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/workspaces">
            View all
            <ArrowRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {mockDatabases.map((db) => (
            <div
              key={db.id}
              className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                  <span className="text-sm font-bold">{db.name.charAt(0)}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{db.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {db.row_count} rows • {db.db_type}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge
                  variant={
                    db.status === 'ready'
                      ? 'default'
                      : db.status === 'draft'
                      ? 'secondary'
                      : 'destructive'
                  }
                  className="text-xs"
                >
                  {db.status}
                </Badge>
                {db.quality_score && (
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    {db.quality_score}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
