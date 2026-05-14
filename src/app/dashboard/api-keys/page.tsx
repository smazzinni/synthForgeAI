'use client'

import { useState } from 'react'
import { mockApiKeys } from '@/lib/mock-data'

export default function ApiKeysPage() {
  const [showCreate, setShowCreate] = useState(false)

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">API Keys</h1>
          <p className="text-muted-foreground mt-1">Manage API keys for programmatic access</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="mt-4 md:mt-0 py-2 px-4 rounded-md text-sm font-medium bg-amber-600 text-white hover:bg-amber-700"
        >
          + Create API Key
        </button>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg border p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-1">Create API Key</h2>
            <p className="text-sm text-muted-foreground mb-4">Generate a new API key for programmatic access</p>
            <div className="space-y-3">
              <div>
                <label htmlFor="keyName" className="block text-sm font-medium mb-1">Key Name</label>
                <input id="keyName" placeholder="e.g., Production API Key" className="w-full h-10 rounded-md border bg-background px-3 text-sm" />
              </div>
              <div>
                <p className="text-sm font-medium mb-1">Permissions</p>
                <div className="flex gap-2">
                  {['Read', 'Write', 'Admin'].map((perm) => (
                    <span key={perm} className="border rounded-md px-2 py-1 text-xs cursor-pointer hover:bg-accent">
                      {perm}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowCreate(false)} className="py-2 px-4 rounded-md border text-sm">Cancel</button>
              <button onClick={() => setShowCreate(false)} className="py-2 px-4 rounded-md text-sm font-medium bg-amber-600 text-white hover:bg-amber-700">Generate Key</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-start gap-3 p-4 mb-6 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/20">
        <p className="text-sm">
          <span className="font-medium text-amber-800 dark:text-amber-400">Keep your API keys secure.</span>{' '}
          <span className="text-amber-700 dark:text-amber-500">Never share your API keys in publicly accessible areas such as GitHub, client-side code, or public forums.</span>
        </p>
      </div>

      <div className="space-y-4">
        {mockApiKeys.map((key) => (
          <div key={key.id} className="rounded-lg border p-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-500 flex items-center justify-center text-white font-bold text-sm">
                  K
                </div>
                <div>
                  <p className="font-medium">{key.name}</p>
                  <p className="text-sm text-muted-foreground font-mono">
                    {key.key_prefix}••••••••••••••••
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  {key.permissions.map((perm) => (
                    <span key={perm} className="border rounded px-1.5 py-0.5 text-xs capitalize">{perm}</span>
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">
                  Last used {new Date(key.last_used_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
