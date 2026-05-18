'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function WorkspacesPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/dashboard/databases')
  }, [router])

  return (
    <div className="flex items-center justify-center h-screen">
      <Loader2 className="h-6 w-6 animate-spin text-amber-600" />
    </div>
  )
}
