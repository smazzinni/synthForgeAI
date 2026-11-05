/**
 * Prisma-backed durable store for synthetic databases & conversations.
 *
 * Durable persistence layer (Prisma + PostgreSQL). The in-memory store
 * (src/lib/in-memory-store.ts) is the fallback when Prisma is unavailable.
 */

import { db } from '@/lib/db'
import type {
  SyntheticDatabaseRecord,
  ConversationRecord,
  MessageRecord,
} from '@/lib/in-memory-store'

// ─── Helpers: serialize/deserialize JSON fields for SQLite ───
// SQLite (via Prisma) stores JSON as text columns, so we parse/stringify
// at the boundary.

function serializeSchema(schema: unknown): string {
  try {
    return JSON.stringify(schema || [])
  } catch {
    return '[]'
  }
}

function serializeData(data: unknown): string {
  try {
    return JSON.stringify(data || {})
  } catch {
    return '{}'
  }
}

function parseSchema(s: string | null | undefined): unknown {
  if (!s) return []
  try {
    return JSON.parse(s)
  } catch {
    return []
  }
}

function parseData(s: string | null | undefined): Record<string, unknown[]> {
  if (!s) return {}
  try {
    return JSON.parse(s) as Record<string, unknown[]>
  } catch {
    return {}
  }
}

// ─── Databases ───

export async function listDatabasesPrisma(userId: string): Promise<SyntheticDatabaseRecord[]> {
  const rows = await db.syntheticDatabase.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return rows.map(toDbRecord)
}

export async function getDatabasePrisma(userId: string, id: string): Promise<SyntheticDatabaseRecord | null> {
  const row = await db.syntheticDatabase.findFirst({ where: { id, userId } })
  return row ? toDbRecord(row) : null
}

export async function createDatabasePrisma(
  userId: string,
  input: Omit<SyntheticDatabaseRecord, 'id' | 'user_id' | 'created_at' | 'updated_at'>
): Promise<SyntheticDatabaseRecord> {
  const row = await db.syntheticDatabase.create({
    data: {
      name: input.name,
      dbType: input.db_type || 'postgresql',
      schemaJson: serializeSchema(input.schema_json),
      dataJson: serializeData(input.data_json),
      rowCount: input.row_count || 0,
      qualityScore: input.quality_score ?? null,
      status: input.status || 'draft',
      userId,
    },
  })
  return toDbRecord(row)
}

export async function updateDatabasePrisma(
  userId: string,
  id: string,
  patch: Partial<SyntheticDatabaseRecord>
): Promise<SyntheticDatabaseRecord | null> {
  const data: Record<string, unknown> = {}
  if (patch.name !== undefined) data.name = patch.name
  if (patch.db_type !== undefined) data.dbType = patch.db_type
  if (patch.schema_json !== undefined) data.schemaJson = serializeSchema(patch.schema_json)
  if (patch.data_json !== undefined) data.dataJson = serializeData(patch.data_json)
  if (patch.row_count !== undefined) data.rowCount = patch.row_count
  if (patch.quality_score !== undefined) data.qualityScore = patch.quality_score
  if (patch.status !== undefined) data.status = patch.status

  try {
    const res = await db.syntheticDatabase.updateMany({ where: { id, userId }, data })
    if (res.count === 0) return null
    const row = await db.syntheticDatabase.findFirst({ where: { id, userId } })
    return row ? toDbRecord(row) : null
  } catch {
    return null
  }
}

export async function deleteDatabasePrisma(userId: string, id: string): Promise<boolean> {
  try {
    const res = await db.syntheticDatabase.deleteMany({ where: { id, userId } })
    return res.count > 0
  } catch {
    return false
  }
}

// ─── Conversations ───

export async function listConversationsPrisma(userId: string): Promise<ConversationRecord[]> {
  const rows = await db.conversation.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: 50,
    include: { messages: { orderBy: { createdAt: 'asc' }, take: 500 } },
  })
  return rows.map(toConvRecord)
}

export async function createConversationPrisma(
  userId: string,
  input: { database_id?: string | null; title?: string; user_id?: string | null; status?: string; agent_mode?: string }
): Promise<ConversationRecord> {
  const row = await db.conversation.create({
    data: {
      databaseId: input.database_id || null,
      title: input.title || 'New Conversation',
      userId,
      status: input.status || 'active',
      agentMode: input.agent_mode || 'orchestrator',
    },
    include: { messages: true },
  })
  return toConvRecord(row)
}

export async function addMessagesPrisma(
  userId: string,
  conversationId: string,
  messages: Array<{ role: string; content: string; agentName?: string }>
): Promise<boolean> {
  // Errors propagate so callers can fall back to the in-memory store;
  // a missing (or someone else's) conversation returns false.
  const conv = await db.conversation.findFirst({ where: { id: conversationId, userId } })
  if (!conv) return false

  await db.$transaction([
    db.message.createMany({
      data: messages.map(m => ({
        conversationId,
        role: m.role,
        content: m.content,
        agentName: m.agentName || null,
      })),
    }),
    db.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    }),
  ])
  return true
}

export async function deleteConversationPrisma(userId: string, id: string): Promise<boolean> {
  try {
    const res = await db.conversation.deleteMany({ where: { id, userId } })
    return res.count > 0
  } catch {
    return false
  }
}

// ─── Mappers: Prisma row → store record ───

function toDbRecord(row: {
  id: string
  name: string
  dbType: string
  schemaJson: string
  dataJson: string
  rowCount: number
  qualityScore: number | null
  status: string
  userId: string
  createdAt: Date
  updatedAt: Date
}): SyntheticDatabaseRecord {
  return {
    id: row.id,
    name: row.name,
    db_type: row.dbType,
    schema_json: parseSchema(row.schemaJson),
    data_json: parseData(row.dataJson),
    row_count: row.rowCount,
    quality_score: row.qualityScore,
    status: row.status,
    user_id: row.userId,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

function toConvRecord(row: {
  id: string
  databaseId: string | null
  title: string
  userId: string | null
  status: string
  agentMode: string
  createdAt: Date
  updatedAt: Date
  messages: Array<{
    id: string
    conversationId: string
    role: string
    content: string
    agentName: string | null
    createdAt: Date
  }>
}): ConversationRecord {
  return {
    id: row.id,
    database_id: row.databaseId,
    title: row.title,
    user_id: row.userId,
    status: row.status,
    agent_mode: row.agentMode,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    messages: row.messages.map((m): MessageRecord => ({
      id: m.id,
      conversation_id: m.conversationId,
      role: m.role,
      content: m.content,
      agent_name: m.agentName,
      created_at: m.createdAt.toISOString(),
    })),
  }
}
