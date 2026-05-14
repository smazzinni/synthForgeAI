'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { StudioMessage } from '@/components/studio/studio-app'
import {
  Bot,
  User,
  ChevronRight,
  CheckCircle2,
  Loader2,
  XCircle,
  Clock,
} from 'lucide-react'

interface ChatMessagesProps {
  messages: StudioMessage[]
  onOptionSelect: (option: { value: string; label: string }) => void
  isGenerating: boolean
}

export function ChatMessages({ messages, onOptionSelect, isGenerating }: ChatMessagesProps) {
  return (
    <div className="space-y-4">
      {messages.map((message) => (
        <div key={message.id} className="space-y-3">
          {/* Message bubble */}
          <div className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : ''}`}>
            {message.role !== 'user' && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Bot className="h-4 w-4" />
              </div>
            )}

            <div className={`max-w-[80%] ${message.role === 'user' ? 'order-first' : ''}`}>
              {/* Agent name */}
              {message.agentName && (
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="secondary" className="text-xs">
                    {message.agentName}
                  </Badge>
                </div>
              )}

              {/* Content */}
              <div
                className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                {message.content}
              </div>

              {/* SQL Code */}
              {message.sqlCode && (
                <Card className="mt-2 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline" className="text-xs">SQL</Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => navigator.clipboard.writeText(message.sqlCode!)}
                    >
                      Copy
                    </Button>
                  </div>
                  <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap bg-muted/50 p-2 rounded">
                    {message.sqlCode}
                  </pre>
                </Card>
              )}

              {/* Reasoning Steps */}
              {message.reasoningSteps && message.reasoningSteps.length > 0 && (
                <Card className="mt-2 p-3">
                  <p className="text-xs font-medium mb-2 text-muted-foreground">Reasoning</p>
                  <div className="space-y-1.5">
                    {message.reasoningSteps.map((step, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        {step.status === 'completed' ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
                        ) : step.status === 'running' ? (
                          <Loader2 className="h-3.5 w-3.5 text-primary animate-spin shrink-0 mt-0.5" />
                        ) : step.status === 'failed' ? (
                          <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                        ) : (
                          <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                        )}
                        <div>
                          <span className="font-medium">{step.label}</span>
                          {step.output && (
                            <span className="text-muted-foreground ml-1">- {step.output}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Options */}
              {message.options && message.options.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {message.options.map((option) => (
                    <Button
                      key={option.id}
                      variant="outline"
                      size="sm"
                      className="w-full justify-between text-left h-auto py-2 px-3"
                      onClick={() => onOptionSelect(option)}
                      disabled={isGenerating}
                    >
                      <div>
                        <span className="text-sm">{option.label}</span>
                        {option.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{option.description}</p>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </Button>
                  ))}
                </div>
              )}

              {/* Timestamp */}
              <p className="text-xs text-muted-foreground mt-1">
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>

            {message.role === 'user' && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Generating indicator */}
      {isGenerating && (
        <div className="flex gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Bot className="h-4 w-4" />
          </div>
          <div className="bg-muted rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Thinking...
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
