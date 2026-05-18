'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Key } from 'lucide-react'

export default function ApiKeysPage() {
  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">API Keys</h1>
          <p className="text-muted-foreground mt-1">Manage API keys for programmatic access</p>
        </div>
      </div>

      <div className="flex items-start gap-3 p-4 mb-6 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/20">
        <p className="text-sm">
          <span className="font-medium text-amber-800 dark:text-amber-400">Keep your API keys secure.</span>{' '}
          <span className="text-amber-700 dark:text-amber-500">Never share your API keys in publicly accessible areas such as GitHub, client-side code, or public forums.</span>
        </p>
      </div>

      <Card>
        <CardContent className="py-12 text-center">
          <Key className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No API keys yet</h3>
          <p className="text-muted-foreground mb-4">API key management is coming soon. Use the AI Studio for now.</p>
        </CardContent>
      </Card>
    </div>
  )
}
