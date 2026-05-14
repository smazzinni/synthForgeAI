'use client'

import React, { useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Database, Send, ChevronRight, Table2, Upload, X,
  Loader2, Hash, Paperclip, Sparkles, StopCircle,
  WifiOff, ArrowDown, Code2, Clock3
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/stores/app-store'
import { AnimatedDots } from '@/components/common/animated-dots'
import { ChatMessage } from '@/components/chat/chat-message'
import type { Message } from '@/lib/types'
import { staggerContainer, staggerItem } from '@/lib/constants'

interface ChatPanelProps {
  messages: Message[]
  isLoading: boolean
  isOnline: boolean
  isDragOver: boolean
  input: string
  attachedFiles: { name: string; content: string; type: string }[]
  generationElapsed: string
  showScrollToBottom: boolean
  chatScrollRef: React.RefObject<HTMLDivElement | null>
  chatInputRef: React.RefObject<HTMLTextAreaElement | null>
  fileInputRef: React.RefObject<HTMLInputElement | null>
  inputValueRef: React.RefObject<string>
  messagesEndRef: React.RefObject<HTMLDivElement | null>
  onSendMessage: (text: string) => void
  onHandleSubmit: () => void
  onHandleAbort: () => void
  onHandleRetry: (msgId: string) => void
  onHandleRegenerate: (msgId: string) => void
  onSetInput: (input: string) => void
  onSetAttachedFiles: React.Dispatch<React.SetStateAction<{ name: string; content: string; type: string }[]>>
  onSetIsDragOver: (v: boolean) => void
  onCopyToClipboard: (text: string) => void
  onExportData: (tables: Record<string, Record<string, unknown>[]>, format: string) => void
  onCopyAllData: (tables: Record<string, Record<string, unknown>[]>, format: string) => void
  allTables: Record<string, Record<string, unknown>[]>
  onScrollToBottom: () => void
}

export const ChatPanel = React.memo(function ChatPanel({
  messages, isLoading, isOnline, isDragOver, input, attachedFiles,
  generationElapsed, showScrollToBottom,
  chatScrollRef, chatInputRef, fileInputRef, inputValueRef, messagesEndRef,
  onSendMessage, onHandleSubmit, onHandleAbort, onHandleRetry, onHandleRegenerate,
  onSetInput, onSetAttachedFiles, onSetIsDragOver,
  onCopyToClipboard, onExportData, onCopyAllData, allTables, onScrollToBottom
}: ChatPanelProps) {

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      e.stopPropagation()
      onHandleSubmit()
    }
  }, [onHandleSubmit])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    Array.from(files).forEach(file => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const content = ev.target?.result as string
        const ext = file.name.split('.').pop()?.toLowerCase() || ''
        const type = ext === 'sql' ? 'sql' : ext === 'csv' ? 'csv' : ext === 'json' ? 'json' : ext === 'xml' ? 'xml' : 'text'
        onSetAttachedFiles(prev => [...prev, { name: file.name, content, type }])
      }
      reader.readAsText(file)
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [onSetAttachedFiles, fileInputRef])

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); onSetIsDragOver(true) }, [onSetIsDragOver])
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); onSetIsDragOver(false) }, [onSetIsDragOver])
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    onSetIsDragOver(false)
    const files = e.dataTransfer.files
    if (!files || files.length === 0) return
    Array.from(files).forEach(file => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const content = ev.target?.result as string
        const ext = file.name.split('.').pop()?.toLowerCase() || ''
        const type = ext === 'sql' ? 'sql' : ext === 'csv' ? 'csv' : ext === 'json' ? 'json' : ext === 'xml' ? 'xml' : 'text'
        onSetAttachedFiles(prev => [...prev, { name: file.name, content, type }])
      }
      reader.readAsText(file)
    })
  }, [onSetIsDragOver, onSetAttachedFiles])

  const removeFile = useCallback((index: number) => {
    onSetAttachedFiles(prev => prev.filter((_, i) => i !== index))
  }, [onSetAttachedFiles])

  return (
    <div className={`flex flex-col h-full border-r transition-colors min-w-[280px] ${isDragOver ? 'bg-amber-50/50 border-amber-300' : ''}`} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      {isDragOver && (
        <div className="absolute inset-0 z-50 bg-amber-50/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="text-center"><Upload className="h-10 w-10 text-amber-600 mx-auto mb-2" /><p className="text-sm font-semibold text-amber-700">Drop files here</p><p className="text-xs text-amber-600">SQL, CSV, JSON, XML</p></div>
        </div>
      )}
      {!isOnline && (
        <div className="bg-red-50 border-b border-red-200 px-3 py-1.5 flex items-center gap-2 shrink-0" role="alert"><WifiOff className="h-3.5 w-3.5 text-red-600 shrink-0" /><span className="text-xs text-red-700">You are offline. Some features may not work.</span></div>
      )}
      {isLoading && (
        <div className="shrink-0">
          <div className="h-1 bg-muted overflow-hidden">
            <motion.div className="h-full bg-gradient-to-r from-amber-500 via-red-500 to-amber-500" initial={{ width: '0%' }} animate={{ width: '100%' }} transition={{ duration: 30, ease: 'linear', repeat: Infinity }} style={{ backgroundSize: '200% 100%' }} />
          </div>
          <div className="flex items-center justify-between px-3 py-1 bg-amber-50/50 border-b border-amber-100">
            <div className="flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin text-amber-600" /><span className="text-[10px] text-amber-800 font-medium">{messages.some(m => m.isStreaming && m.content) ? 'Generating...' : 'Processing...'}</span></div>
            {generationElapsed && (<span className="text-[10px] text-amber-600 font-mono flex items-center gap-1"><Clock3 className="h-2.5 w-2.5" /> {generationElapsed}</span>)}
          </div>
        </div>
      )}
      <div ref={chatScrollRef} className="flex-1 overflow-y-auto chat-scroll-area" style={{ scrollBehavior: 'smooth', contain: 'layout style' }}>
        <div className="p-3 space-y-3">
          {messages.length === 0 && !isLoading && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center text-center py-10">
              <motion.div initial={{ rotate: -10 }} animate={{ rotate: 0 }} transition={{ type: 'spring', stiffness: 200 }} className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-600 to-red-700 flex items-center justify-center mb-3 shadow-lg"><Sparkles className="h-6 w-6 text-white" /></motion.div>
              <h2 className="text-base font-bold mb-1">SynthForge AI</h2>
              <p className="text-muted-foreground max-w-[200px] mb-4 text-xs">Describe the data you need. AI generates realistic synthetic data.</p>
              <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid grid-cols-1 gap-1.5 w-full">
                {[
                  { icon: <Hash className="h-3 w-3" />, text: 'Generate users' },
                  { icon: <Table2 className="h-3 w-3" />, text: 'E-commerce orders' },
                  { icon: <Database className="h-3 w-3" />, text: 'Hospital DB schema' },
                  { icon: <Code2 className="h-3 w-3" />, text: 'Student enrollment' }
                ].map((suggestion, i) => (
                  <motion.button key={i} variants={staggerItem} whileHover={{ scale: 1.01, y: -1 }} whileTap={{ scale: 0.98 }} className="flex items-center gap-2 p-2 rounded-md border bg-card hover:bg-muted/50 transition-colors text-left text-xs text-muted-foreground hover:text-foreground" onClick={() => onSendMessage(suggestion.text)}>
                    {suggestion.icon}<span>{suggestion.text}</span>
                  </motion.button>
                ))}
              </motion.div>
            </motion.div>
          )}
          {messages.map((msg) => (
            <ChatMessage key={msg.id} msg={msg} onRetry={onHandleRetry} onRegenerate={onHandleRegenerate} onSendMessage={onSendMessage} onCopyToClipboard={onCopyToClipboard} allTables={allTables} onExportData={onExportData} onCopyAllData={onCopyAllData} />
          ))}

          <div ref={messagesEndRef} />
        </div>
        {showScrollToBottom && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10">
            <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="outline" size="sm" className="h-7 w-7 p-0 rounded-full shadow-md bg-background border-amber-200 hover:bg-amber-50" onClick={onScrollToBottom} aria-label="Scroll to bottom"><ArrowDown className="h-3.5 w-3.5 text-amber-700" /></Button></TooltipTrigger><TooltipContent>Scroll to bottom</TooltipContent></Tooltip></TooltipProvider>
          </motion.div>
        )}
      </div>
      <div className="border-t bg-background p-2.5 shrink-0">
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {attachedFiles.map((file, i) => (
              <Badge key={i} variant="secondary" className="gap-1 text-[10px] py-0.5 px-1.5"><Paperclip className="h-2.5 w-2.5" /><span className="truncate max-w-[60px]">{file.name}</span><button onClick={() => removeFile(i)} className="hover:text-destructive transition-colors" aria-label={`Remove ${file.name}`}><X className="h-2.5 w-2.5" /></button></Badge>
            ))}
          </div>
        )}
        <div className="flex items-end gap-1.5">
          <input ref={fileInputRef} type="file" className="hidden" multiple accept=".sql,.csv,.json,.txt,.xml" onChange={handleFileUpload} aria-hidden="true" />
          <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="h-7 w-7 shrink-0 p-0" onClick={() => fileInputRef.current?.click()} aria-label="Attach files"><Paperclip className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent>Attach files (or drag & drop)</TooltipContent></Tooltip></TooltipProvider>
          <div className="flex-1 relative">
            <Textarea ref={chatInputRef} value={input} onChange={(e) => { e.stopPropagation(); onSetInput(e.target.value); if (inputValueRef) inputValueRef.current = e.target.value }} onKeyDown={handleKeyDown} placeholder="Describe data..." className="min-h-[34px] max-h-24 resize-none text-xs py-1.5 px-2.5" disabled={isLoading} rows={1} aria-label="Chat message input" onClick={(e) => e.stopPropagation()} onFocus={(e) => e.stopPropagation()} />
          </div>
          {isLoading ? (
            <TooltipProvider><Tooltip><TooltipTrigger asChild><Button size="sm" className="h-8 px-3 bg-red-600 hover:bg-red-700 text-white shrink-0 gap-1.5 animate-pulse shadow-lg shadow-red-200" onClick={onHandleAbort} aria-label="Stop generation (Esc)"><StopCircle className="h-4 w-4" /><span className="text-[10px]">Stop</span></Button></TooltipTrigger><TooltipContent>Stop generation (Esc)</TooltipContent></Tooltip></TooltipProvider>
          ) : (
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button size="sm" className="h-7 w-7 p-0 bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white shrink-0" onClick={onHandleSubmit} disabled={!input.trim() && attachedFiles.length === 0} aria-label="Send message"><Send className="h-3.5 w-3.5" /></Button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
})
