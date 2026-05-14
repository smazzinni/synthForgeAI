'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { FlaskConical, Database, Upload, FileDown } from 'lucide-react'

const actions = [
  {
    label: 'New Studio Session',
    description: 'Start an AI-powered data generation session',
    icon: FlaskConical,
    href: '/dashboard/studio',
    variant: 'default' as const,
  },
  {
    label: 'Create Database',
    description: 'Define a new synthetic database schema',
    icon: Database,
    href: '/dashboard/studio',
    variant: 'outline' as const,
  },
  {
    label: 'Import Schema',
    description: 'Import an existing database schema',
    icon: Upload,
    href: '/dashboard/studio',
    variant: 'outline' as const,
  },
  {
    label: 'Export Data',
    description: 'Download generated datasets',
    icon: FileDown,
    href: '/dashboard/workspaces',
    variant: 'outline' as const,
  },
]

export function QuickActions() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {actions.map((action) => {
        const Icon = action.icon
        return (
          <Button
            key={action.label}
            variant={action.variant}
            className="h-auto p-4 justify-start text-left"
            asChild
          >
            <Link href={action.href}>
              <div className="flex items-start gap-3">
                <Icon className="h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-medium">{action.label}</div>
                  <div className="text-xs opacity-70 mt-0.5">{action.description}</div>
                </div>
              </div>
            </Link>
          </Button>
        )
      })}
    </div>
  )
}
