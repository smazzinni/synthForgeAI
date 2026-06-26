'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sparkles,
  Plus,
  History,
  Trash2,
  X,
  Database,
  Clock,
  MessageSquare,
  Brain,
  PlugZap,
  Keyboard,
  PanelRightClose,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── ChatHeader ───
// Top-of-the-chat-panel header: shows the "SynthForge AI" (or live-DB) brand,
// the New Chat / History / Shortcuts / Hide-Panel buttons, plus status badges
// for "LIVE" mode, "Thinking", and generated table count.
//
// This is a purely presentational component — all state and business logic
// lives in the parent studio page. Props are grouped by concern below.

export interface ConversationHistoryItem {
  /** Stable unique id (used as React key). */
  id: string
  /** Auto-generated title (first user message, truncated). */
  title: string
  /** Optional database name to badge in the list. */
  databaseName?: string
  /** ISO timestamp of the last update. */
  updatedAt: string
}

export interface ChatHeaderProps {
  /** True when the studio is connected to an external DB (live mode). */
  isLiveDbMode: boolean
  /** Active connection display name (live mode only). */
  activeConnectionName?: string
  /** Active connection dialect (live mode only). */
  activeConnectionDialect?: 'postgres' | 'mysql'

  /** Conversation history list (most-recently-updated first). */
  conversations: ConversationHistoryItem[]
  /** Currently-active conversation id (highlighted in the dropdown). */
  activeConversationId: string | null
  /** Controlled open state for the history dropdown. */
  historyOpen: boolean
  /** Update the history dropdown open state. */
  onHistoryOpenChange: (open: boolean) => void

  // ─── Action handlers ───
  /** Start a new (empty) chat. */
  onNewChat: () => void
  /** Load a past conversation into the studio. */
  onLoadConversation: (conv: ConversationHistoryItem) => void
  /** Delete a single conversation from history. */
  onDeleteConversation: (id: string) => void
  /** Clear the entire conversation history. */
  onClearAllConversations: () => void
  /** Open the keyboard-shortcuts help dialog. */
  onShowShortcuts: () => void
  /** Toggle (collapse) the right-hand data/SQL/explorer panel. */
  onTogglePanel: () => void

  // ─── Status flags ───
  /** When true the assistant is actively generating/thinking. */
  loading: boolean
  /** Whether the right panel is currently visible (hides the close btn when not). */
  panelVisible: boolean
  /** Whether any schema/data has been generated yet. */
  hasGeneratedData: boolean
  /** Number of tables in the generated dataset (for the badge). */
  tableCount: number
}

// Compact relative time for the history list ("2h ago", "just now", …).
// Duplicated locally to keep this component self-contained (the original
// lives in the studio page; both copies are pure and identical).
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Math.max(0, Date.now() - then)
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  const wk = Math.floor(day / 7)
  if (wk < 5) return `${wk}w ago`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(day / 365)}y ago`
}

export function ChatHeader({
  isLiveDbMode,
  activeConnectionName,
  activeConnectionDialect,
  conversations,
  activeConversationId,
  historyOpen,
  onHistoryOpenChange,
  onNewChat,
  onLoadConversation,
  onDeleteConversation,
  onClearAllConversations,
  onShowShortcuts,
  onTogglePanel,
  loading,
  panelVisible,
  hasGeneratedData,
  tableCount,
}: ChatHeaderProps) {
  return (
    <div className="px-3 py-2.5 border-b flex items-center justify-between bg-card shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <div className={`h-6 w-6 rounded-lg flex items-center justify-center shrink-0 ${isLiveDbMode ? 'bg-gradient-to-br from-sky-500 to-indigo-600' : 'bg-gradient-to-br from-amber-500 to-red-600'}`}>
          {isLiveDbMode ? <PlugZap className="h-3 w-3 text-white" /> : <Sparkles className="h-3 w-3 text-white" />}
        </div>
        <div className="min-w-0">
          <h2 className="text-xs font-semibold truncate">
            {isLiveDbMode ? (activeConnectionName || 'Live DB') : 'SynthForge AI'}
          </h2>
          <p className="text-[9px] text-muted-foreground truncate">
            {isLiveDbMode
              ? `LIVE ${activeConnectionDialect || 'postgres'} · CRUD mode`
              : 'DeepSeek v4 · streaming'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0"
          onClick={onNewChat}
          title="New Chat (⌘K)"
        >
          <Plus className="h-3 w-3" />
        </Button>
        {/* ─── Conversation History dropdown ─── */}
        {/* Controlled so we can close it programmatically after loading a
            conversation. Uses <div> items (not <DropdownMenuItem>) for the
            conversation rows so the nested delete button can stopPropagation
            without dismissing the menu. */}
        <DropdownMenu open={historyOpen} onOpenChange={onHistoryOpenChange}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 relative"
              title="Conversation History"
            >
              <History className="h-3 w-3" />
              {conversations.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[8px] font-bold rounded-full h-3 min-w-3 px-0.5 flex items-center justify-center leading-none">
                  {conversations.length > 99 ? '99+' : conversations.length}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-80">
            {conversations.length === 0 ? (
              <div className="px-2 py-4 text-center text-[11px] text-muted-foreground">
                <History className="h-5 w-5 mx-auto mb-1.5 opacity-40" />
                No saved conversations yet
              </div>
            ) : (
              <>
                <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground flex items-center justify-between">
                  <span>Recent Conversations</span>
                  <Badge variant="secondary" className="text-[9px] h-3.5 px-1 leading-none">
                    {conversations.length}
                  </Badge>
                </div>
                <DropdownMenuSeparator />
                <div className="max-h-80 overflow-y-auto">
                  {conversations.map((conv) => {
                    const isActive = conv.id === activeConversationId
                    return (
                      <div
                        key={conv.id}
                        className={cn(
                          'group flex items-start gap-2 px-2 py-1.5 rounded-sm cursor-pointer mx-0.5',
                          isActive ? 'bg-accent' : 'hover:bg-accent',
                        )}
                        onClick={() => { onLoadConversation(conv); onHistoryOpenChange(false) }}
                      >
                        <MessageSquare className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-medium truncate">{conv.title}</div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <Clock className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                            <span className="text-[9px] text-muted-foreground">{relativeTime(conv.updatedAt)}</span>
                            {conv.databaseName && (
                              <Badge variant="outline" className="text-[8px] h-3 px-1 gap-0.5 leading-none shrink-0">
                                <Database className="h-2 w-2" />
                                {conv.databaseName.length > 12 ? conv.databaseName.slice(0, 12) + '…' : conv.databaseName}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <button
                          className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 transition-opacity shrink-0 p-0.5"
                          onClick={(e) => { e.stopPropagation(); onDeleteConversation(conv.id) }}
                          title="Delete conversation"
                          aria-label="Delete conversation"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )
                  })}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-[11px] text-destructive focus:text-destructive"
                  onClick={onClearAllConversations}
                >
                  <Trash2 className="h-3 w-3 mr-2" />
                  Clear all history
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0"
          onClick={onShowShortcuts}
          title="Keyboard Shortcuts (⌘/)"
        >
          <Keyboard className="h-3 w-3" />
        </Button>
        {panelVisible && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            onClick={onTogglePanel}
            title="Hide Panel (⌘B)"
          >
            <PanelRightClose className="h-3 w-3" />
          </Button>
        )}
        {isLiveDbMode && (
          <Badge variant="outline" className="text-[9px] gap-0.5 text-sky-700 dark:text-sky-400 border-sky-400 h-5 animate-pulse">
            <PlugZap className="h-2.5 w-2.5" />
            LIVE
          </Badge>
        )}
        {loading && (
          <Badge variant="secondary" className="text-[9px] gap-0.5 animate-pulse h-5">
            <Brain className="h-2.5 w-2.5" />
            Thinking
          </Badge>
        )}
        {hasGeneratedData && !loading && (
          <Badge variant="outline" className="text-[9px] gap-0.5 text-emerald-600 border-emerald-300 h-5">
            <Database className="h-2.5 w-2.5" />
            {tableCount} tables
          </Badge>
        )}
      </div>
    </div>
  )
}
