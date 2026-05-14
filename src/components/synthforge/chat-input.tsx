'use client'

import React, { useState, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Send, StopCircle, Paperclip, X, Upload
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { AgentMode } from './types'

interface ChatInputProps {
  onSend: (message: string, files: { name: string; content: string; type: string }[]) => void
  isLoading: boolean
  agentMode: AgentMode
  onAgentModeChange: (mode: AgentMode) => void
  onAbort: () => void
  disabled?: boolean
}

export const ChatInput = React.memo(function ChatInput({
  onSend,
  isLoading,
  agentMode,
  onAgentModeChange,
  onAbort,
  disabled
}: ChatInputProps) {
  // LOCAL state - doesn't re-render parent on every keystroke!
  const [input, setInput] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<{ name: string; content: string; type: string }[]>([])
  const [isDragOver, setIsDragOver] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = useCallback(() => {
    const text = input.trim()
    if (!text && attachedFiles.length === 0) return
    onSend(text, attachedFiles)
    setInput('')
    setAttachedFiles([])
  }, [input, attachedFiles, onSend])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }, [handleSubmit])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    Array.from(files).forEach(file => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const content = ev.target?.result as string
        const ext = file.name.split('.').pop()?.toLowerCase() || ''
        const type = ext === 'sql' ? 'sql' : ext === 'csv' ? 'csv' : ext === 'json' ? 'json' : ext === 'xml' ? 'xml' : 'text'
        setAttachedFiles(prev => [...prev, { name: file.name, content, type }])
      }
      reader.readAsText(file)
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = e.dataTransfer.files
    if (!files || files.length === 0) return

    Array.from(files).forEach(file => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        const content = ev.target?.result as string
        const ext = file.name.split('.').pop()?.toLowerCase() || ''
        const type = ext === 'sql' ? 'sql' : ext === 'csv' ? 'csv' : ext === 'json' ? 'json' : ext === 'xml' ? 'xml' : 'text'
        setAttachedFiles(prev => [...prev, { name: file.name, content, type }])
      }
      reader.readAsText(file)
    })
  }, [])

  const removeFile = useCallback((index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index))
  }, [])

  return (
    <div
      className={`border-t bg-background p-2.5 shrink-0 ${isDragOver ? 'bg-amber-50/50 border-amber-300' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 bg-amber-50/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <Upload className="h-10 w-10 text-amber-600 mx-auto mb-2" />
            <p className="text-sm font-semibold text-amber-700">Drop files here</p>
            <p className="text-xs text-amber-600">SQL, CSV, JSON, XML</p>
          </div>
        </div>
      )}

      {/* Attached Files */}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {attachedFiles.map((file, i) => (
            <Badge key={i} variant="secondary" className="gap-1 text-[10px] py-0.5 px-1.5">
              <Paperclip className="h-2.5 w-2.5" />
              <span className="truncate max-w-[60px]">{file.name}</span>
              <button onClick={() => removeFile(i)} className="hover:text-destructive transition-colors" aria-label={`Remove ${file.name}`}>
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="flex items-end gap-1.5">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept=".sql,.csv,.json,.txt,.xml"
          onChange={handleFileUpload}
          aria-hidden="true"
        />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 shrink-0 p-0"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach files"
              >
                <Paperclip className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Attach files (or drag & drop)</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="flex-1 relative">
          <Textarea
            key="chat-input"
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Describe data..."
            className="min-h-[34px] max-h-24 resize-none text-xs py-1.5 px-2.5"
            disabled={isLoading || disabled}
            rows={1}
            aria-label="Chat message input"
          />
        </div>

        {/* Send / Stop button */}
        {isLoading ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  className="h-7 w-7 p-0 bg-red-600 hover:bg-red-700 text-white shrink-0"
                  onClick={onAbort}
                  aria-label="Stop generation"
                >
                  <StopCircle className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Stop generation</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              size="sm"
              className="h-7 w-7 p-0 bg-gradient-to-r from-amber-600 to-red-700 hover:from-amber-700 hover:to-red-800 text-white shrink-0"
              onClick={handleSubmit}
              disabled={(!input.trim() && attachedFiles.length === 0) || disabled}
              aria-label="Send message"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  )
})
