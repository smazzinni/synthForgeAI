import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/server/auth'
import { enforceRateLimit } from '@/lib/server/rate-limit'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import {
  addMessagesPrisma,
  createConversationPrisma,
  deleteConversationPrisma,
  listConversationsPrisma,
} from '@/lib/prisma-store'
import {
  addMessagesInMemory,
  createConversationInMemory,
  deleteConversationInMemory,
  listConversationsInMemory,
  type ConversationRecord,
} from '@/lib/in-memory-store'

// ─── Conversations (chat history) ───
// GET    /api/conversations[?databaseId=…] → { conversations: [...with messages] }
// POST   { id?, databaseId?, title?, messages? } → { conversationId }
//        Creates the conversation when `id` is absent, then appends messages.
// DELETE /api/conversations?id=…          → { success: true }
// Owner-scoped throughout; a client can never write into another user's chat.

export const dynamic = 'force-dynamic'

const MAX_MESSAGES_PER_POST = 200
const MAX_MESSAGE_CHARS = 100_000

type IncomingMessage = { role: string; content: string; agentName?: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = (): any | null => getSupabaseAdmin()

function sanitizeMessages(raw: unknown): IncomingMessage[] | string {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) return 'messages must be an array'
  if (raw.length > MAX_MESSAGES_PER_POST) return `At most ${MAX_MESSAGES_PER_POST} messages per request`
  const out: IncomingMessage[] = []
  for (const m of raw as Array<Record<string, unknown>>) {
    if (!m || typeof m.content !== 'string' || !['user', 'assistant', 'system'].includes(String(m.role))) continue
    out.push({
      role: String(m.role),
      content: m.content.slice(0, MAX_MESSAGE_CHARS),
      agentName: typeof m.agentName === 'string' ? m.agentName.slice(0, 100) : undefined,
    })
  }
  return out
}

export async function GET(request: NextRequest) {
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth
  const databaseId = request.nextUrl.searchParams.get('databaseId')

  try {
    const client = sb()
    if (client) {
      let q = client
        .from('conversations')
        .select('*, messages(id, role, content, agent_name, created_at)')
        .eq('user_id', auth.userId)
        .order('updated_at', { ascending: false })
        .limit(50)
      if (databaseId) q = q.eq('database_id', databaseId)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      const conversations = (data as Array<ConversationRecord & { messages?: Array<{ created_at: string }> }>).map(c => ({
        ...c,
        messages: (c.messages || []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at)),
      }))
      return NextResponse.json({ conversations })
    }

    let conversations: ConversationRecord[]
    try {
      conversations = await listConversationsPrisma(auth.userId)
    } catch {
      conversations = listConversationsInMemory(auth.userId)
    }
    if (databaseId) conversations = conversations.filter(c => c.database_id === databaseId)
    return NextResponse.json({ conversations })
  } catch (err) {
    console.error('[api/conversations] GET failed:', err)
    return NextResponse.json({ error: 'Could not load conversations' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth
  const limited = enforceRateLimit(auth.userId, 'conversations:write', 120)
  if (limited) return limited

  let body: Record<string, unknown>
  try {
    body = await request.json()
    if (!body || typeof body !== 'object') throw new Error()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const messages = sanitizeMessages(body.messages)
  if (typeof messages === 'string') return NextResponse.json({ error: messages }, { status: 400 })
  const existingId = typeof body.id === 'string' && body.id ? body.id : null
  const databaseId = typeof body.databaseId === 'string' && body.databaseId ? body.databaseId : null
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 200) : 'New Conversation'

  try {
    const client = sb()
    if (client) {
      let conversationId = existingId
      if (conversationId) {
        const { data: owned, error } = await client
          .from('conversations').select('id').eq('id', conversationId).eq('user_id', auth.userId).maybeSingle()
        if (error) throw new Error(error.message)
        if (!owned) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
      } else {
        const { data: created, error } = await client
          .from('conversations')
          .insert({ database_id: databaseId, title, user_id: auth.userId, status: 'active', agent_mode: 'orchestrator' })
          .select('id')
          .single()
        if (error) throw new Error(error.message)
        conversationId = created.id as string
      }
      if (messages.length > 0) {
        const { error } = await client.from('messages').insert(messages.map(m => ({
          conversation_id: conversationId,
          role: m.role,
          content: m.content,
          agent_name: m.agentName || null,
        })))
        if (error) throw new Error(error.message)
        await client.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId).eq('user_id', auth.userId)
      }
      return NextResponse.json({ conversationId })
    }

    // Prisma, then in-memory
    let conversationId = existingId
    try {
      if (!conversationId) {
        conversationId = (await createConversationPrisma(auth.userId, { database_id: databaseId, title })).id
      }
      if (messages.length > 0 && !(await addMessagesPrisma(auth.userId, conversationId, messages))) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
      }
      return NextResponse.json({ conversationId })
    } catch (prismaErr) {
      console.warn('[api/conversations] Prisma unavailable, using in-memory store:', prismaErr)
      if (!conversationId) {
        conversationId = createConversationInMemory(auth.userId, { database_id: databaseId, title }).id
      }
      if (messages.length > 0 && !addMessagesInMemory(auth.userId, conversationId, messages)) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
      }
      return NextResponse.json({ conversationId })
    }
  } catch (err) {
    console.error('[api/conversations] POST failed:', err)
    return NextResponse.json({ error: 'Could not save conversation' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireUser(request)
  if (auth instanceof Response) return auth
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  try {
    const client = sb()
    if (client) {
      const { data: owned, error } = await client
        .from('conversations').select('id').eq('id', id).eq('user_id', auth.userId).maybeSingle()
      if (error) throw new Error(error.message)
      if (!owned) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
      const { error: msgErr } = await client.from('messages').delete().eq('conversation_id', id)
      if (msgErr) throw new Error(msgErr.message)
      const { error: convErr } = await client.from('conversations').delete().eq('id', id).eq('user_id', auth.userId)
      if (convErr) throw new Error(convErr.message)
      return NextResponse.json({ success: true })
    }
    let deleted = false
    try { deleted = await deleteConversationPrisma(auth.userId, id) } catch { /* fall through */ }
    deleted = deleteConversationInMemory(auth.userId, id) || deleted
    if (!deleted) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[api/conversations] DELETE failed:', err)
    return NextResponse.json({ error: 'Could not delete conversation' }, { status: 500 })
  }
}
