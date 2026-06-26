// ─── Conversation history (localStorage persistence) ───
// Extracted from page.tsx. Saves up to MAX_CONVERSATIONS most recent
// conversations so users can reload past sessions from the History dropdown
// in the chat header. Each conversation stores the full message list plus the
// generated schema/data/databaseName/databaseId so the entire studio state
// can be restored on load.

import type { Message, SchemaTable, SavedConversation } from './types'

/** localStorage key under which the SavedConversation[] array is persisted. */
export const CONVERSATION_STORAGE_KEY = 'synthforge_conversations'

/** Hard cap on how many past conversations are retained. */
export const MAX_CONVERSATIONS = 50

/**
 * SSR-safe lazy loader. Guards against malformed JSON, missing fields, and
 * string-vs-Date timestamp mismatches (localStorage serializes Date → string).
 */
export function loadSavedConversations(): SavedConversation[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(CONVERSATION_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((c: unknown): c is Record<string, unknown> => typeof c === 'object' && c !== null)
      .map((c): SavedConversation => {
        const rawMsgs = Array.isArray(c.messages) ? c.messages : []
        const messages: Message[] = rawMsgs.map((m: Record<string, unknown>, i: number) => ({
          id: String(m.id ?? `m-${i}`),
          role: (m.role as Message['role']) || 'assistant',
          content: String(m.content ?? ''),
          reasoningContent: m.reasoningContent != null ? String(m.reasoningContent) : undefined,
          agentName: m.agentName != null ? String(m.agentName) : undefined,
          timestamp: new Date(typeof m.timestamp === 'string' ? m.timestamp : Date.now()),
          isStreaming: false,
        }))
        return {
          id: String(c.id ?? ''),
          title: String(c.title ?? 'New Conversation'),
          messages,
          schema: Array.isArray(c.schema) ? (c.schema as SchemaTable[]) : [],
          data: (c.data && typeof c.data === 'object' && !Array.isArray(c.data))
            ? (c.data as Record<string, unknown[]>)
            : {},
          databaseName: String(c.databaseName ?? ''),
          databaseId: c.databaseId != null ? String(c.databaseId) : null,
          createdAt: String(c.createdAt ?? new Date().toISOString()),
          updatedAt: String(c.updatedAt ?? new Date().toISOString()),
        }
      })
  } catch {
    return []
  }
}

/** Write the full conversation list back to localStorage (no-op on SSR / quota). */
export function persistSavedConversations(convs: SavedConversation[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify(convs))
  } catch { /* localStorage unavailable or quota exceeded */ }
}

/**
 * Find the most recent conversation for a given external DB connection ID.
 * Returns null if no conversation exists for that connection.
 * Used when the user opens a DB connection — we load the previous chat
 * history instead of starting a fresh conversation each time.
 */
export function findConversationByConnectionId(connectionId: string): SavedConversation | null {
  if (typeof window === 'undefined') return null
  const convs = loadSavedConversations()
  // Sort by updatedAt desc to get the most recent first
  const sorted = convs
    .filter(c => c.connectionId === connectionId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  return sorted[0] || null
}

/** Auto-title: first user message truncated to 50 chars, else "New Conversation". */
export function generateConversationTitle(messages: Message[]): string {
  const firstUser = messages.find(m => m.role === 'user')
  if (!firstUser) return 'New Conversation'
  const text = firstUser.content.trim()
  if (!text) return 'New Conversation'
  return text.length > 50 ? text.slice(0, 50) + '…' : text
}

/** Compact relative time for the history list ("2h ago", "just now", …). */
export function relativeTime(iso: string): string {
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
