'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const SynthForgeApp = dynamic(() => import('@/components/synthforge-app'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="text-center">
        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-600 to-red-700 flex items-center justify-center mx-auto mb-4 animate-pulse">
          <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold mb-2">SynthForge AI</h1>
        <p className="text-sm text-muted-foreground">Loading database...</p>
      </div>
    </div>
  )
})

export default function DatabasePage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState<string | null>(null)

  useEffect(() => {
    params.then(p => setId(p.id))
  }, [params])

  if (!id) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-600 to-red-700 flex items-center justify-center mx-auto mb-4 animate-pulse">
            <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold mb-2">SynthForge AI</h1>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return <SynthForgeApp initialDatabaseId={id} />
}
