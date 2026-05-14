'use client'

import { useCallback } from 'react'
import { useAppStore } from '@/stores/app-store'
import { useToast } from '@/hooks/use-toast'
import { useDatabase } from './use-database'

export function useQuality() {
  const { toast } = useToast()
  const store = useAppStore()
  const { refreshDatabase } = useDatabase()

  const runQualityCheck = useCallback(async (autoFix = false) => {
    if (!store.activeDb || store.isQualityCheckRunning) return
    store.setIsQualityCheckRunning(true)
    try {
      const res = await fetch('/api/quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ databaseId: store.activeDb.id, autoFix })
      })
      const data = await res.json()
      if (data.report) {
        store.setQualityReport(data.report)
        store.setShowQualityReport(true)
        if (autoFix && data.report.fixesApplied > 0) {
          toast({ title: 'Fixes Applied', description: `${data.report.fixesApplied} issue(s) auto-fixed` })
          await refreshDatabase(store.activeDb.id)
        }
      }
    } catch {
      toast({ title: 'Error', description: 'Quality check failed', variant: 'destructive' })
    } finally {
      store.setIsQualityCheckRunning(false)
    }
  }, [store.activeDb, store.isQualityCheckRunning, toast, refreshDatabase])

  return {
    runQualityCheck,
  }
}
