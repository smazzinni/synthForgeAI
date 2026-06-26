'use client'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Send, Square } from 'lucide-react'
import type { RefObject } from 'react'

// ─── ChatInput ───
// Bottom-of-the-chat-panel input row. Renders a single-line text input plus a
// Send button. When the parent is busy (streaming a response or generating
// data), the Send button is replaced by a Stop button that aborts the in-flight
// request.
//
// Pure presentational component: all state lives in the parent studio page.
// The parent owns the `value`, the `onChange` setter, the `onSend`/`onStop`
// callbacks, plus a ref to the <input> element (used for keyboard-shortcut
// focus checks elsewhere).

export interface ChatInputProps {
  /** Current input value. */
  value: string
  /** Update the input value as the user types. */
  onChange: (value: string) => void
  /** Send the current message (parent handles trimming / abort of prior request). */
  onSend: () => void
  /** Abort the in-flight request + generation (Stop button). */
  onStop: () => void

  /** Disable the input + send button (true while streaming or loading). */
  disabled?: boolean
  /** Also disable the input (true while an external DB connection is loading). */
  connectionLoading?: boolean

  /** Placeholder text (varies between live-DB and synthetic-data mode). */
  placeholder?: string

  /** Ref to the underlying <input> element so the parent can focus it. */
  inputRef?: RefObject<HTMLInputElement | null>

  /** Custom keydown handler (e.g. Enter to send, Shift+Enter for newline). */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void

  /**
   * Optional quick-prompt chips rendered below the input row. When provided
   * (non-empty), each chip calls `onQuickPromptClick` with its text.
   * The studio currently doesn't pass any (the empty-state panel renders its
   * own prompt chips), but the prop is here so the component can be reused on
   * surfaces where inline suggestions make sense.
   */
  quickPrompts?: readonly string[]
  /** Called when a quick-prompt chip is clicked. */
  onQuickPromptClick?: (prompt: string) => void
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  disabled = false,
  connectionLoading = false,
  placeholder,
  inputRef,
  onKeyDown,
  quickPrompts,
  onQuickPromptClick,
}: ChatInputProps) {
  return (
    <div className="px-2.5 py-2 border-t bg-card shrink-0">
      <div className="flex gap-1.5">
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled || connectionLoading}
          className="flex-1 text-xs h-8"
        />
        {disabled ? (
          <Button
            onClick={onStop}
            size="sm"
            variant="destructive"
            className="h-8 w-8 p-0"
            title="Stop generation"
          >
            <Square className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button
            onClick={onSend}
            disabled={!value.trim()}
            size="sm"
            className="bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white h-8 w-8 p-0"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {quickPrompts && quickPrompts.length > 0 && onQuickPromptClick && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => onQuickPromptClick(prompt)}
              className="text-[10px] px-2 py-0.5 rounded-full border bg-background hover:bg-accent transition-colors"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
