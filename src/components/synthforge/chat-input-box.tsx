'use client'

import React, { useState, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Send, Paperclip, StopCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

export const ChatInputBox = React.memo(function ChatInputBox({
  onSend,
  isLoading,
  onAbort,
  attachedFiles,
  onRemoveFile,
  onFileUpload,
  fileInputRef
}: {
  onSend: (message: string, files: { name: string; content: string; type: string }[]) => void
  isLoading: boolean
  onAbort: () => void
  attachedFiles: { name: string; content: string; type: string }[]
  onRemoveFile: (index: number) => void
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
}) {
  const [inputValue, setInputValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    const msgText = inputValue.trim()
    if (!msgText && attachedFiles.length === 0) return
    onSend(msgText, attachedFiles)
    setInputValue('')
  }, [inputValue, attachedFiles, onSend])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  return (
    <div className="border-t bg-background p-2.5 shrink-0">
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {attachedFiles.map((file, i) => (
            <Badge key={i} variant="secondary" className="gap-1 text-[10px] py-0.5 px-1.5">
              <Paperclip className="h-2.5 w-2.5" />
              <span className="truncate max-w-[60px]">{file.name}</span>
              <button onClick={() => onRemoveFile(i)} className="hover:text-destructive transition-colors" aria-label={`Remove ${file.name}`}>
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
          onChange={onFileUpload}
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
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value)
              e.stopPropagation()
            }}
            onKeyDown={handleKeyDown}
            placeholder="Describe data..."
            className="min-h-[34px] max-h-24 resize-none text-xs py-1.5 px-2.5"
            disabled={isLoading}
            rows={1}
            aria-label="Chat message input"
            onClick={(e) => e.stopPropagation()}
            onFocus={(e) => e.stopPropagation()}
          />
        </div>

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
              onClick={handleSend}
              disabled={!inputValue.trim() && attachedFiles.length === 0}
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
