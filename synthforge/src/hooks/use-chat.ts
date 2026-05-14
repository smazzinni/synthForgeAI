import { useCallback, useRef, useEffect } from 'react'
import { useAppStore } from '@/stores/app-store'
import { useToast } from '@/hooks/use-toast'
import { structuredLog } from '@/components/error-boundary'
import type { Message, QualityScore, PIICheck, AgentStepUI } from '@/lib/types'

export function useChat() {
  const toast = useToast().toast
  const messages = useAppStore((s) => s.messages)
  const setMessages = useAppStore((s) => s.setMessages)
  const setIsLoading = useAppStore((s) => s.setIsLoading)
  const isLoading = useAppStore((s) => s.isLoading)
  const activeDb = useAppStore((s) => s.activeDb)
  const conversation = useAppStore((s) => s.conversation)
  const setConversation = useAppStore((s) => s.setConversation)
  const activeWorkspace = useAppStore((s) => s.activeWorkspace)
  const agentMode = useAppStore((s) => s.agentMode)
  const setAgentSteps = useAppStore((s) => s.setAgentSteps)
  const setGenerationStartTime = useAppStore((s) => s.setGenerationStartTime)
  const setGenerationElapsed = useAppStore((s) => s.setGenerationElapsed)
  const setActiveDb = useAppStore((s) => s.setActiveDb)

  const abortControllerRef = useRef<AbortController | null>(null)
  const streamingIdRef = useRef<string | null>(null)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  const refreshDatabase = useCallback(async (dbId: string) => {
    try {
      const res = await fetch('/api/databases')
      const data = await res.json()
      const updated = data.databases?.find((d: { id: string }) => d.id === dbId)
      if (updated) setActiveDb(updated)
    } catch { /* silent */ }
  }, [setActiveDb])

  const sendMessage = useCallback(async (messageText: string, files: { name: string; content: string; type: string }[] = []) => {
    if ((!messageText.trim() && files.length === 0) || isLoading || !activeDb) return

    const msgText = messageText.trim() || 'Generate data from the attached file(s)'
    useAppStore.getState().setInput('')
    setIsLoading(true)

    const tempId = `usr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const tempUserMsg: Message = {
      id: tempId, role: 'user',
      content: msgText + (files.length > 0 ? `\n\n[Attached: ${files.map(f => f.name).join(', ')}]` : ''),
      sqlCode: '', tokensIn: 0, tokensOut: 0, cost: 0,
      createdAt: new Date().toISOString(), agentName: '',
      reasoningSteps: '[]', options: '[]', tablesJson: '{}'
    }
    setMessages((prev: Message[]) => [...prev, tempUserMsg])

    const controller = new AbortController()
    abortControllerRef.current = controller

    const streamId = `asst-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const streamMsg: Message = {
      id: streamId, role: 'assistant', content: '', sqlCode: '',
      tokensIn: 0, tokensOut: 0, cost: 0,
      createdAt: new Date().toISOString(), agentName: agentMode + '-agent',
      reasoningSteps: '[]', options: '[]', tablesJson: '{}',
      isStreaming: true, generationStatus: 'thinking'
    }
    streamingIdRef.current = streamId
    setMessages((prev: Message[]) => [...prev, streamMsg])

    // Retry logic with exponential backoff for 502/503 errors
    const fetchWithRetry = async (url: string, options: RequestInit, maxRetries = 3): Promise<Response> => {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const res = await fetch(url, options)
          if (res.status === 502 || res.status === 503) {
            if (attempt < maxRetries) {
              const delay = Math.pow(2, attempt) * 1000 // 1s, 2s, 4s
              setMessages((prev: Message[]) => prev.map(m =>
                m.id === streamId ? { ...m, content: 'Server is temporarily unavailable. Retrying...' } : m
              ))
              await new Promise(resolve => setTimeout(resolve, delay))
              continue
            }
            throw new Error('Server is temporarily unavailable, please try again.')
          }
          return res
        } catch (err) {
          if (err instanceof TypeError && err.message === 'Failed to fetch' && attempt < maxRetries) {
            const delay = Math.pow(2, attempt) * 1000
            setMessages((prev: Message[]) => prev.map(m =>
              m.id === streamId ? { ...m, content: 'Server is temporarily unavailable. Retrying...' } : m
            ))
            await new Promise(resolve => setTimeout(resolve, delay))
            continue
          }
          throw err
        }
      }
      throw new Error('Server is temporarily unavailable, please try again.')
    }

    try {
      const res = await fetchWithRetry('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: conversation?.id || null,
          databaseId: activeDb.id,
          workspaceId: activeWorkspace?.id,
          message: msgText,
          stream: true,
          agentMode,
          files: files.map(f => ({ name: f.name, content: f.content, type: f.type }))
        }),
        signal: controller.signal
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(errData.error || 'Chat request failed')
      }

      if (!conversation) {
        const convId = res.headers.get('X-Conversation-Id')
        if (convId) setConversation({ id: convId, title: msgText.slice(0, 60), messages: [] })
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response stream')

      const decoder = new TextDecoder()
      let fullContent = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6))
              if (event.type === 'content') {
                fullContent += event.data
                setMessages((prev: Message[]) => prev.map(m =>
                  m.id === streamId ? { ...m, content: fullContent, generationStatus: 'generating' as const } : m
                ))
              } else if (event.type === 'done') {
                const tokensIn = event.data?.tokensIn || 0
                const tokensOut = event.data?.tokensOut || 0
                let parsedTables = '{}'
                let sqlCode = ''
                let agentName = agentMode + '-agent'
                let reasoningSteps = '[]'
                let options = '[]'
                let qualityScore: QualityScore | null = null
                let piiCheck: PIICheck | null = null

                try {
                  const jsonMatch = fullContent.match(/\{[\s\S]*\}/)
                  if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0])
                    if (parsed.tables) parsedTables = JSON.stringify(parsed.tables)
                    if (parsed.sqlCode) sqlCode = parsed.sqlCode
                    if (parsed.agentName) agentName = parsed.agentName
                    if (parsed.reasoningSteps) reasoningSteps = JSON.stringify(parsed.reasoningSteps)
                    if (parsed.options) options = JSON.stringify(parsed.options)
                  }
                } catch { /* use defaults */ }

                setMessages((prev: Message[]) => prev.map(m =>
                  m.id === streamId ? {
                    ...m, isStreaming: false, generationStatus: 'completed' as const,
                    tokensIn, tokensOut,
                    cost: (tokensIn / 1_000_000) * 0.27 + (tokensOut / 1_000_000) * 1.10,
                    tablesJson: parsedTables, sqlCode, agentName, reasoningSteps, options,
                    qualityScore, piiCheck
                  } : m
                ))
              } else if (event.type === 'error') {
                throw new Error(event.data || 'Stream error')
              } else if (event.type === 'agent_step') {
                const stepData = event.data as { stepIndex: number; agent: string; task: string; status: string; output?: string; tables?: string[] }
                setAgentSteps((prev: AgentStepUI[]) => {
                  const updated = [...prev]
                  while (updated.length <= stepData.stepIndex) {
                    updated.push({ agent: '', task: '', status: 'pending' })
                  }
                  updated[stepData.stepIndex] = {
                    agent: stepData.agent, task: stepData.task,
                    status: stepData.status as AgentStepUI['status'],
                    output: stepData.output, tables: stepData.tables
                  }
                  return updated
                })
              }
            } catch (parseErr) {
              if (parseErr instanceof Error && parseErr.message === 'Stream error') throw parseErr
            }
          }
        }
      }

      setMessages((prev: Message[]) => prev.map(m =>
        m.id === streamId ? { ...m, isStreaming: false, generationStatus: 'completed' as const } : m
      ))

      await refreshDatabase(activeDb.id)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        structuredLog('info', 'Chat request aborted by user')
        setMessages((prev: Message[]) => prev.map(m =>
          m.id === streamId ? { ...m, isStreaming: false, isCancelled: true, generationStatus: 'cancelled' as const } : m
        ))
      } else {
        setMessages((prev: Message[]) => prev.filter(m => m.id !== streamId))
        const errMsg = error instanceof Error ? error.message : 'Failed to get response'
        structuredLog('error', 'Chat request failed', errMsg)
        setMessages((prev: Message[]) => prev.map(m => m.id === tempId ? { ...m, isError: true } : m))
        toast({ title: 'Error', description: errMsg, variant: 'destructive' })
      }
    } finally {
      setIsLoading(false)
      abortControllerRef.current = null
      streamingIdRef.current = null
      chatInputRef.current?.focus()
    }
  }, [isLoading, activeDb, conversation, activeWorkspace, agentMode, setMessages, setIsLoading, setConversation, setAgentSteps, toast, refreshDatabase])

  const handleAbort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setIsLoading(false)
      if (streamingIdRef.current) {
        setMessages((prev: Message[]) => prev.map(m =>
          m.id === streamingIdRef.current ? { ...m, isStreaming: false, isCancelled: true, generationStatus: 'cancelled' as const } : m
        ))
        streamingIdRef.current = null
      }
    }
  }, [setIsLoading, setMessages])

  const handleRetry = useCallback((msgId: string) => {
    const msg = useAppStore.getState().messages.find(m => m.id === msgId)
    if (!msg) return
    setMessages((prev: Message[]) => prev.map(m => m.id === msgId ? { ...m, isError: false } : m))
    const originalText = msg.content.replace(/ \(Generate approximately \d+ rows per table\)/, '')
    sendMessage(originalText)
  }, [sendMessage, setMessages])

  const handleRegenerate = useCallback((msgId: string) => {
    const msgs = useAppStore.getState().messages
    const msgIdx = msgs.findIndex(m => m.id === msgId)
    if (msgIdx < 1) return
    const prevMsg = msgs[msgIdx - 1]
    if (prevMsg.role !== 'user') return
    setMessages((prev: Message[]) => prev.filter(m => m.id !== msgId))
    const originalText = prevMsg.content.replace(/ \(Generate approximately \d+ rows per table\)/, '')
    sendMessage(originalText)
  }, [sendMessage, setMessages])

  const regenerateTable = useCallback((tableName: string) => {
    sendMessage(`Regenerate data for the ${tableName} table with different values but same schema`)
  }, [sendMessage])

  const handleSubmit = useCallback(() => {
    const inputVal = useAppStore.getState().input.trim()
    const files = useAppStore.getState().attachedFiles
    if (!inputVal && files.length === 0) return
    sendMessage(inputVal || 'Generate data from the attached file(s)', files)
  }, [sendMessage])

  // Escape key to cancel
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isLoading && abortControllerRef.current) {
        handleAbort()
      }
    }
    window.addEventListener('keydown', handleEscKey)
    return () => window.removeEventListener('keydown', handleEscKey)
  }, [isLoading, handleAbort])

  // Generation time tracking
  useEffect(() => {
    if (!isLoading) {
      setGenerationStartTime(null)
      setGenerationElapsed('')
      return
    }
    const startTime = Date.now()
    setGenerationStartTime(startTime)
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      const mins = Math.floor(elapsed / 60)
      const secs = elapsed % 60
      setGenerationElapsed(mins > 0 ? `${mins}m ${secs}s` : `${secs}s`)
    }, 500)
    return () => clearInterval(interval)
  }, [isLoading, setGenerationStartTime, setGenerationElapsed])

  return {
    sendMessage, handleAbort, handleRetry, handleRegenerate,
    handleSubmit, regenerateTable,
    abortControllerRef, streamingIdRef, chatInputRef,
    refreshDatabase
  }
}
