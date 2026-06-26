'use client'

import { Loader2, User } from 'lucide-react'
import {
  cleanDisplayText,
  type OptionChoice,
} from '@/lib/ai-agents'
import type { Message } from '../_lib/types'
import { AgentIcon } from './agent-icon'
import { ShowMoreText } from './show-more-text'
import { SqlBlockCard } from './sql-block-card'
import { GenerationProgress as GenerationProgressView } from './generation-progress'

// ─── MessageBubble ───
// A single chat message in the studio's left-panel conversation stream.
// Renders an avatar (AgentIcon for assistants, primary-coloured disc for the
// user), the agent name, the message body (markdown via ShowMoreText,
// generation-progress UI, or plain text for the user), interactive option
// buttons, and any SQL block cards returned by the AI in live-DB mode.
//
// Pure presentational component: all state lives in the parent studio page.
// The parent passes the message plus four callbacks (option click, SQL execute,
// copy, open-in-editor) and the active connection dialect (used by SqlBlockCard
// to label the SQL block).

export interface MessageBubbleProps {
  /** The chat message to render. */
  message: Message

  /** Live-DB dialect label passed through to the SQL block card. */
  activeConnectionDialect?: 'postgres' | 'mysql'

  /** Called when the user clicks an interactive-option button. */
  onOptionClick: (choice: OptionChoice) => void

  /** Execute a SQL block against the live DB (live-DB mode only). */
  onExecuteSqlBlock: (messageId: string, sql: string) => void

  /** Copy arbitrary text to the clipboard (with a toast). */
  onCopy: (text: string) => void

  /** Open the given SQL in the SQL editor and switch to the SQL tab. */
  onOpenInEditor: (sql: string) => void
}

export function MessageBubble({
  message,
  activeConnectionDialect,
  onOptionClick,
  onExecuteSqlBlock,
  onCopy,
  onOpenInEditor,
}: MessageBubbleProps) {
  return (
    <div
      className={`flex gap-1.5 ${message.role === 'user' ? 'justify-end' : ''}`}
    >
      {message.role === 'assistant' && (
        <AgentIcon agentName={message.agentName} size="sm" />
      )}
      <div
        className={`max-w-[88%] rounded-lg px-2.5 py-2 overflow-hidden ${
          message.role === 'user'
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted/70'
        }`}
        style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}
      >
        {message.role === 'assistant' && (
          <p className="text-[9px] font-medium text-amber-600 dark:text-amber-400 mb-0.5 flex items-center gap-1">
            {message.agentName || 'Orchestrator'}
            {message.isStreaming && (
              <span className="flex items-center gap-0.5">
                <span className="inline-block h-1 w-1 rounded-full bg-amber-500 animate-pulse" />
                <span className="inline-block h-1 w-1 rounded-full bg-amber-500 animate-pulse [animation-delay:0.2s]" />
                <span className="inline-block h-1 w-1 rounded-full bg-amber-500 animate-pulse [animation-delay:0.4s]" />
              </span>
            )}
          </p>
        )}
        {renderMessageContent(message)}

        {/* Interactive options buttons - show during streaming too, but disabled */}
        {message.role === 'assistant' && message.interactiveOptions && (
          <div className="mt-2 space-y-1.5">
            <p className="text-[10px] font-medium text-muted-foreground">
              {message.interactiveOptions.question}
            </p>
            <div className="flex flex-wrap gap-1">
              {message.interactiveOptions.choices.map((choice) => (
                <button
                  key={choice.value}
                  onClick={() => onOptionClick(choice)}
                  disabled={message.isStreaming}
                  className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${
                    message.isStreaming ? 'opacity-50 cursor-not-allowed' : ''
                  } ${
                    message.interactiveOptions!.multi
                      ? 'border-violet-300 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-950/50'
                      : 'border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950/50'
                  }`}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ─── SQL block(s) (live DB mode) ─── */}
        {message.role === 'assistant' && message.sqlBlock && (
          <>
            {/* Render the primary SQL block (with execute button + result) */}
            <SqlBlockCard
              sql={message.sqlBlock}
              dialect={activeConnectionDialect}
              executing={message.sqlBlockExecuting}
              result={message.sqlBlockResult}
              onCopy={() => onCopy(message.sqlBlock!)}
              onOpenInEditor={() => onOpenInEditor(message.sqlBlock!)}
              onExecute={() => onExecuteSqlBlock(message.id, message.sqlBlock!)}
            />
            {/* Render any additional SQL blocks as read-only previews
                (the user can copy them into the SQL editor to execute). */}
            {message.sqlBlocks && message.sqlBlocks.length > 1 && (
              <div className="mt-1.5 space-y-1">
                {message.sqlBlocks.slice(1).map((extraSql, idx) => (
                  <SqlBlockCard
                    key={idx}
                    sql={extraSql}
                    dialect={activeConnectionDialect}
                    onCopy={() => onCopy(extraSql)}
                    onOpenInEditor={() => onOpenInEditor(extraSql)}
                    onExecute={() => onExecuteSqlBlock(message.id, extraSql)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
      {message.role === 'user' && (
        <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
          <User className="h-2.5 w-2.5 text-primary-foreground" />
        </div>
      )}
    </div>
  )
}

// ─── Render formatted message content ───
// User messages: plain whitespace-preserving text.
// Assistant messages: GenerationProgress UI if attached, otherwise a "Thinking…"
// spinner while streaming (empty content), otherwise cleaned markdown via
// ShowMoreText (strips <think>/<thinking> tags and residual agent JSON).
//
// Kept as a module-local helper so the parent studio page no longer has to
// thread it through — MessageBubble owns the rendering of message bodies.
function renderMessageContent(message: Message) {
  if (message.role === 'user') {
    return <span className="whitespace-pre-wrap break-words" style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>{message.content}</span>
  }

  // ─── Render generation progress UI ───
  if (message.generationProgress) {
    return <GenerationProgressView progress={message.generationProgress} />
  }

  let content = message.content
  if (!content) {
    if (message.isStreaming) {
      return (
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Thinking...</span>
        </div>
      )
    }
    return null
  }

  // Clean any residual raw JSON blocks — also during streaming
  content = cleanDisplayText(content)
  // Strip <think/> and <thinking/> tags that may appear in streaming
  content = content.replace(/<think[\s\S]*?<\/think>/gi, '')
  content = content.replace(/<thinking[\s\S]*?<\/thinking>/gi, '')
  content = content.trim()

  if (!content) return null

  return <ShowMoreText content={content} isStreaming={message.isStreaming} />
}
