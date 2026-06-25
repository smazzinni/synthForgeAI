/**
 * In-memory fallback store for synthetic databases & conversations.
 *
 * Used when Supabase is NOT configured (local dev / demo mode). Mirrors the
 * pattern in `db-connections/store.ts`: try Supabase first, fall back to a
 * per-process in-memory Map keyed by user id.
 *
 * The store is intentionally simple — it keeps the app fully functional for
 * a demo session (data survives across requests within the same server
 * process). For production, configure Supabase env vars and the in-memory
 * fallback is bypassed automatically.
 */

export interface SyntheticDatabaseRecord {
  id: string
  name: string
  db_type: string
  schema_json: unknown
  data_json: Record<string, unknown[]>
  row_count: number
  quality_score: number | null
  status: string
  user_id: string
  created_at: string
  updated_at: string
}

export interface ConversationRecord {
  id: string
  database_id: string | null
  title: string
  user_id: string | null
  status: string
  agent_mode: string
  created_at: string
  updated_at: string
  messages: MessageRecord[]
}

export interface MessageRecord {
  id: string
  conversation_id: string
  role: string
  content: string
  agent_name: string | null
  created_at: string
}

// ─── In-memory stores (per-process, keyed by user id) ───
// Use globalThis so the store survives Next.js dev hot-reloads (Turbopack
// re-evaluates modules on file changes, which would reset a plain Map).
// This mirrors the pattern used in src/lib/db.ts for the Prisma client.
const globalForStore = globalThis as unknown as {
  __synthDbStore?: Map<string, SyntheticDatabaseRecord[]>
  __synthConvStore?: Map<string, ConversationRecord[]>
}

const dbStore: Map<string, SyntheticDatabaseRecord[]> =
  globalForStore.__synthDbStore ?? (globalForStore.__synthDbStore = new Map())
const conversationStore: Map<string, ConversationRecord[]> =
  globalForStore.__synthConvStore ?? (globalForStore.__synthConvStore = new Map())

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `rec_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

// ─── Databases ───

export function listDatabasesInMemory(userId: string): SyntheticDatabaseRecord[] {
  return (dbStore.get(userId) || []).slice().sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  )
}

export function getDatabaseInMemory(userId: string, id: string): SyntheticDatabaseRecord | null {
  const list = dbStore.get(userId) || []
  // Also check global (for cross-user lookups by the generate-stream route)
  for (const arr of dbStore.values()) {
    const found = arr.find(d => d.id === id)
    if (found) return found
  }
  return list.find(d => d.id === id) || null
}

export function createDatabaseInMemory(
  userId: string,
  input: Omit<SyntheticDatabaseRecord, 'id' | 'user_id' | 'created_at' | 'updated_at'>
): SyntheticDatabaseRecord {
  const now = new Date().toISOString()
  const record: SyntheticDatabaseRecord = {
    ...input,
    id: generateId(),
    user_id: userId,
    created_at: now,
    updated_at: now,
  }
  const list = dbStore.get(userId) || []
  list.push(record)
  dbStore.set(userId, list)
  return record
}

export function updateDatabaseInMemory(
  userId: string,
  id: string,
  patch: Partial<SyntheticDatabaseRecord>
): SyntheticDatabaseRecord | null {
  // Search across all users (generate-stream may use a different user id
  // than the one that created the DB).
  for (const [uid, list] of dbStore.entries()) {
    const idx = list.findIndex(d => d.id === id)
    if (idx !== -1) {
      const updated: SyntheticDatabaseRecord = {
        ...list[idx],
        ...patch,
        updated_at: new Date().toISOString(),
      }
      list[idx] = updated
      dbStore.set(uid, list)
      return updated
    }
  }
  // Fallback to user-scoped
  const list = dbStore.get(userId) || []
  const idx = list.findIndex(d => d.id === id)
  if (idx === -1) return null
  const updated: SyntheticDatabaseRecord = {
    ...list[idx],
    ...patch,
    updated_at: new Date().toISOString(),
  }
  list[idx] = updated
  dbStore.set(userId, list)
  return updated
}

export function deleteDatabaseInMemory(userId: string, id: string): boolean {
  const list = dbStore.get(userId) || []
  const filtered = list.filter(d => d.id !== id)
  if (filtered.length === list.length) return false
  dbStore.set(userId, filtered)
  return true
}

// ─── Conversations ───

export function listConversationsInMemory(userId: string): ConversationRecord[] {
  return (conversationStore.get(userId) || []).slice().sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at)
  )
}

export function getConversationInMemory(userId: string, id: string): ConversationRecord | null {
  const list = conversationStore.get(userId) || []
  return list.find(c => c.id === id) || null
}

export function createConversationInMemory(
  userId: string,
  input: { database_id?: string | null; title?: string; user_id?: string | null; status?: string; agent_mode?: string }
): ConversationRecord {
  const now = new Date().toISOString()
  const record: ConversationRecord = {
    id: generateId(),
    database_id: input.database_id || null,
    title: input.title || 'New Conversation',
    user_id: input.user_id || userId,
    status: input.status || 'active',
    agent_mode: input.agent_mode || 'orchestrator',
    created_at: now,
    updated_at: now,
    messages: [],
  }
  const uid = input.user_id || userId
  const list = conversationStore.get(uid) || []
  list.push(record)
  conversationStore.set(uid, list)
  return record
}

export function addMessagesInMemory(
  userId: string,
  conversationId: string,
  messages: Array<{ role: string; content: string; agentName?: string }>
): boolean {
  // Search across all users (the conversation may have been created with a
  // different user id than the one adding messages).
  for (const [uid, list] of conversationStore.entries()) {
    const idx = list.findIndex(c => c.id === conversationId)
    if (idx !== -1) {
      const now = new Date().toISOString()
      for (const msg of messages) {
        list[idx].messages.push({
          id: generateId(),
          conversation_id: conversationId,
          role: msg.role,
          content: msg.content,
          agent_name: msg.agentName || null,
          created_at: now,
        })
      }
      list[idx].updated_at = now
      conversationStore.set(uid, list)
      return true
    }
  }
  // Fallback to user-scoped
  const list = conversationStore.get(userId) || []
  const idx = list.findIndex(c => c.id === conversationId)
  if (idx === -1) return false
  const now = new Date().toISOString()
  for (const msg of messages) {
    list[idx].messages.push({
      id: generateId(),
      conversation_id: conversationId,
      role: msg.role,
      content: msg.content,
      agent_name: msg.agentName || null,
      created_at: now,
    })
  }
  list[idx].updated_at = now
  conversationStore.set(userId, list)
  return true
}

export function deleteConversationInMemory(userId: string, id: string): boolean {
  const list = conversationStore.get(userId) || []
  const filtered = list.filter(c => c.id !== id)
  if (filtered.length === list.length) return false
  conversationStore.set(userId, filtered)
  return true
}
