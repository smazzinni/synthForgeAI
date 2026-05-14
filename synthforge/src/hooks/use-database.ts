import { useCallback, useMemo } from 'react'
import { useAppStore } from '@/stores/app-store'
import { useToast } from '@/hooks/use-toast'
import { useChat } from './use-chat'

export function useDatabase() {
  const toast = useToast().toast
  const refreshDatabase = useChat().refreshDatabase
  const setActiveDb = useAppStore((s) => s.setActiveDb)
  const setWorkspaces = useAppStore((s) => s.setWorkspaces)
  const setActiveWorkspace = useAppStore((s) => s.setActiveWorkspace)
  const setProjects = useAppStore((s) => s.setProjects)
  const setView = useAppStore((s) => s.setView)
  const setConversation = useAppStore((s) => s.setConversation)
  const setMessages = useAppStore((s) => s.setMessages)
  const setRightTab = useAppStore((s) => s.setRightTab)
  const setAgentMode = useAppStore((s) => s.setAgentMode)
  const setSqlQuery = useAppStore((s) => s.setSqlQuery)
  const setSqlResult = useAppStore((s) => s.setSqlResult)
  const setAttachedFiles = useAppStore((s) => s.setAttachedFiles)
  const setMobileStudioTab = useAppStore((s) => s.setMobileStudioTab)
  const activeWorkspace = useAppStore((s) => s.activeWorkspace)
  const projects = useAppStore((s) => s.projects)
  const setShowNewDbDialog = useAppStore((s) => s.setShowNewDbDialog)
  const setNewDbName = useAppStore((s) => s.setNewDbName)
  const setNewDbSchema = useAppStore((s) => s.setNewDbSchema)
  const setAgentSteps = useAppStore((s) => s.setAgentSteps)

  // BUG FIX (was Bug 1 — Infinite Loop):
  // Previously, `useAppStore((s) => s.projects.flatMap(p => p.databases || []))` was used as a
  // Zustand selector. Because `flatMap` always returns a NEW array, the selector returned a new
  // reference on every Zustand state change, causing React to re-render infinitely.
  //
  // Root Cause: Zustand uses Object.is to compare selector results. A new array from flatMap
  // is never === to the previous one, so the component re-renders on every state update,
  // which can trigger more state updates (especially in useEffect), creating an infinite loop.
  //
  // Fix: Subscribe to the stable `projects` array (which Zustand only replaces when actually
  // changed), then derive `allDatabases` via useMemo with a stable dependency. This ensures
  // the derived array only changes when `projects` actually changes.
  const allDatabases = useMemo(
    () => projects.flatMap(p => p.databases || []),
    [projects]
  )

  const loadWorkspaces = useCallback(async () => {
    try {
      const res = await fetch('/api/workspaces')
      const data = await res.json()
      if (data.workspaces?.length > 0) {
        setWorkspaces(data.workspaces)
        setActiveWorkspace(data.workspaces[0])
        loadProjects(data.workspaces[0].id)
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to load workspaces', variant: 'destructive' })
    }
  }, [toast, setWorkspaces, setActiveWorkspace])

  const loadProjects = useCallback(async (workspaceId: string) => {
    try {
      const res = await fetch(`/api/projects?workspaceId=${workspaceId}`)
      const data = await res.json()
      if (data.projects) setProjects(data.projects)
    } catch {
      toast({ title: 'Error', description: 'Failed to load projects', variant: 'destructive' })
    }
  }, [toast, setProjects])

  const openDatabase = useCallback(async (db: { id: string }) => {
    try {
      const dbRes = await fetch('/api/databases')
      const dbData = await dbRes.json()
      const currentDb = dbData.databases?.find((d: { id: string }) => d.id === db.id)
      if (currentDb) setActiveDb(currentDb)
    } catch { /* silent */ }

    setRightTab('preview')
    setAgentMode('auto')
    setSqlQuery('')
    setSqlResult('')
    setAttachedFiles([])
    setMobileStudioTab('chat')
    setAgentSteps([])
    setView('studio')

    try {
      const res = await fetch(`/api/chat?databaseId=${db.id}`)
      const data = await res.json()
      if (data.conversation && data.conversation.messages?.length > 0) {
        setConversation({ id: data.conversation.id, title: data.conversation.title, messages: data.conversation.messages })
        setMessages(data.conversation.messages)
      } else {
        setConversation(null)
        setMessages([])
      }
    } catch {
      setConversation(null)
      setMessages([])
    }
  }, [setActiveDb, setRightTab, setAgentMode, setSqlQuery, setSqlResult, setAttachedFiles, setMobileStudioTab, setAgentSteps, setView, setConversation, setMessages])

  const createDatabase = useCallback(async (name: string, schema: string) => {
    if (!name.trim() || !projects[0]) return

    let schemaObj = {}
    if (schema.trim()) {
      try { schemaObj = JSON.parse(schema) } catch {
        toast({ title: 'Invalid JSON', description: 'Schema must be valid JSON', variant: 'destructive' })
        return
      }
    }

    try {
      const res = await fetch('/api/databases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, dbType: 'postgresql', schemaJson: schemaObj, projectId: projects[0].id })
      })
      const data = await res.json()
      if (data.database) {
        if (activeWorkspace) await loadProjects(activeWorkspace.id)
        setShowNewDbDialog(false)
        setNewDbName('')
        setNewDbSchema('')
        toast({ title: 'Database Created', description: `${name} is ready` })
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to create database', variant: 'destructive' })
    }
  }, [projects, activeWorkspace, toast, loadProjects, setShowNewDbDialog, setNewDbName, setNewDbSchema])

  const deleteDatabase = useCallback(async (dbId: string) => {
    try {
      await fetch(`/api/databases?id=${dbId}`, { method: 'DELETE' })
      const state = useAppStore.getState()
      if (state.activeDb?.id === dbId) {
        setActiveDb(null)
        setView('dashboard')
      }
      if (activeWorkspace) await loadProjects(activeWorkspace.id)
      toast({ title: 'Deleted', description: 'Database removed' })
    } catch {
      toast({ title: 'Error', description: 'Failed to delete database', variant: 'destructive' })
    }
  }, [activeWorkspace, toast, loadProjects, setActiveDb, setView])

  return { allDatabases, loadWorkspaces, loadProjects, openDatabase, createDatabase, deleteDatabase, refreshDatabase }
}
