'use client'

import { useRef, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChatMessages } from '@/components/studio/chat-messages'
import { ChatInput } from '@/components/studio/chat-input'
import type { StudioMessage } from '@/components/studio/studio-app'

interface ChatPanelProps {
  messages: StudioMessage[]
  onSendMessage: (content: string) => void
  onOptionSelect: (option: { value: string; label: string }) => void
  isGenerating: boolean
}

export function ChatPanel({ messages, onSendMessage, onOptionSelect, isGenerating }: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  return (
    <Card className="h-full flex flex-col">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mx-auto mb-4">
                <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">Welcome to AI Studio</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Describe the synthetic data you need. I&apos;ll help you design the schema, generate realistic data, and validate quality.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {[
                  'Generate e-commerce data',
                  'Create a healthcare database',
                  'Build ITSM test data',
                ].map(prompt => (
                  <button
                    key={prompt}
                    className="text-xs px-3 py-1.5 rounded-full border hover:bg-accent transition-colors"
                    onClick={() => onSendMessage(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <ChatMessages
            messages={messages}
            onOptionSelect={onOptionSelect}
            isGenerating={isGenerating}
          />
        )}
      </div>

      {/* Input */}
      <ChatInput onSend={onSendMessage} disabled={isGenerating} />
    </Card>
  )
}
