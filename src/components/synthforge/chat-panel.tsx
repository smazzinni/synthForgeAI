'use client'

import React, { useRef, useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Database, MessageSquare, Upload, WifiOff, ArrowDown,
  Sparkles, Hash, Table2, Code2, Loader2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ChatInputBox } from './chat-input-box'
import { ChatMessageBubble } from './chat-message-bubble'
import { AnimatedDots } from './animated-dots'
import { staggerContainer, staggerItem } from './types'
import type { Message, AgentStepUI } from './types'

export function ChatPanel({
  messages,
  isLoading,
  isDragOver,
  isOnline,
  onSendMessage,
  onAbort,
  onHandleSendMessage,
  attachedFiles,
  onFileUpload,
  onDragOver,
  onDragLeave,
  onDrop,
  onRemoveFile,
  fileInputRef,
  onRetry,
  onRegenerate,
  onCopyToClipboard,
  onExportData,
  onCopyAllData,
  agentSteps,
  allTables
}: {
  messages: Message[]
  isLoading: boolean
  isDragOver: boolean
  isOnline: boolean
  onSendMessage: (message: string) => void
  onAbort: () => void
  onHandleSendMessage: (messageText: string, files: { name: string; content: string; type: string }[]) => void
  attachedFiles: { name: string; content: string; type: string }[]
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onRemoveFile: (index: number) => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onRetry: (msgId: string) => void
  onRegenerate: (msgId: string) => void
  onCopyToClipboard: (text: string) => void
  onExportData: (tables: Record<string, Record<string, unknown>[]>, format: string) => void
  onCopyAllData: (tables: Record<string, Record<string, unknown>[]>, format: string) => void
  agentSteps: AgentStepUI[]
  allTables: Record<string, Record<string, unknown>[]>
}) {
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [isNearBottom, setIsNearBottom] = useState(true)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)

  // Smart auto-scroll
  useEffect(() => {
    if (isNearBottom && chatScrollRef.current) {
      requestAnimationFrame(() => {
        if (chatScrollRef.current) {
          chatScrollRef.current.scrollTo({
            top: chatScrollRef.current.scrollHeight,
            behavior: 'smooth'
          })
        }
      })
    }
  }, [messages, isLoading, isNearBottom])

  // Track scroll position
  useEffect(() => {
    const scrollContainer = chatScrollRef.current
    if (!scrollContainer) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer
      const nearBottom = scrollHeight - scrollTop - clientHeight < 150
      setIsNearBottom(nearBottom)
      setShowScrollToBottom(!nearBottom)
    }

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true })
    return () => scrollContainer.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div
      className={`flex flex-col h-full border-r transition-colors min-w-[280px] ${isDragOver ? 'bg-amber-50/50 border-amber-300' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
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

      {/* Offline Banner */}
      {!isOnline && (
        <div className="bg-red-50 border-b border-red-200 px-3 py-1.5 flex items-center gap-2 shrink-0" role="alert">
          <WifiOff className="h-3.5 w-3.5 text-red-600 shrink-0" />
          <span className="text-xs text-red-700">You are offline. Some features may not work.</span>
        </div>
      )}

      {/* Messages Area */}
      <div ref={chatScrollRef} className="flex-1 overflow-y-auto chat-scroll-area" style={{ scrollBehavior: 'smooth' }}>
        <div className="p-3 space-y-3">
          {messages.length === 0 && !isLoading && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center text-center py-10"
            >
              <motion.div
                initial={{ rotate: -10 }}
                animate={{ rotate: 0 }}
                transition={{ type: 'spring', stiffness: 200 }}
                className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-600 to-red-700 flex items-center justify-center mb-3 shadow-lg"
              >
                <Sparkles className="h-6 w-6 text-white" />
              </motion.div>
              <h2 className="text-base font-bold mb-1">SynthForge AI</h2>
              <p className="text-muted-foreground max-w-[200px] mb-4 text-xs">
                Describe the data you need. AI generates realistic synthetic data.
              </p>

              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="grid grid-cols-1 gap-1.5 w-full"
              >
                {[
                  { icon: <Hash className="h-3 w-3" />, text: 'Generate sample data' },
                  { icon: <Table2 className="h-3 w-3" />, text: 'Create a data schema' },
                  { icon: <Database className="h-3 w-3" />, text: 'Build relational tables' },
                  { icon: <Code2 className="h-3 w-3" />, text: 'Design a database' }
                ].map((suggestion, i) => (
                  <motion.button
                    key={i}
                    variants={staggerItem}
                    whileHover={{ scale: 1.01, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-2 p-2 rounded-md border bg-card hover:bg-muted/50 transition-colors text-left text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => onSendMessage(suggestion.text)}
                  >
                    {suggestion.icon}
                    <span>{suggestion.text}</span>
                  </motion.button>
                ))}
              </motion.div>
            </motion.div>
          )}

          {messages.map((msg) => (
            <ChatMessageBubble
              key={msg.id}
              msg={msg}
              onRetry={onRetry}
              onRegenerate={onRegenerate}
              onCopyToClipboard={onCopyToClipboard}
              onSendMessage={onSendMessage}
              allTables={allTables}
              onExportData={onExportData}
              onCopyAllData={onCopyAllData}
              isLoading={isLoading}
              agentSteps={agentSteps}
            />
          ))}

          {/* Loading Indicator */}
          {isLoading && !messages.some(m => m.isStreaming) && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="bg-muted/50 rounded-2xl rounded-bl-md px-3 py-2.5 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                <span className="text-sm text-muted-foreground">Thinking<AnimatedDots /></span>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Scroll to Bottom Button */}
        {showScrollToBottom && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10"
          >
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0 rounded-full shadow-md bg-background border-amber-200 hover:bg-amber-50"
                    onClick={() => {
                      if (chatScrollRef.current) {
                        chatScrollRef.current.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' })
                      }
                    }}
                    aria-label="Scroll to bottom"
                  >
                    <ArrowDown className="h-3.5 w-3.5 text-amber-700" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Scroll to bottom</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </motion.div>
        )}
      </div>

      {/* Input Area */}
      <ChatInputBox
        onSend={onHandleSendMessage}
        isLoading={isLoading}
        onAbort={onAbort}
        attachedFiles={attachedFiles}
        onRemoveFile={onRemoveFile}
        onFileUpload={onFileUpload}
        fileInputRef={fileInputRef}
      />
    </div>
  )
}
