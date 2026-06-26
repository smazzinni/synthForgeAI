import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import {
  listConversationsInMemory,
  createConversationInMemory,
  addMessagesInMemory,
  deleteConversationInMemory,
} from '@/lib/in-memory-store'
import {
  listConversationsPrisma,
  createConversationPrisma,
  addMessagesPrisma,
  deleteConversationPrisma,
} from '@/lib/prisma-store'

const DEFAULT_USER_ID = '5a784d48-945a-47d3-ae95-d2aa5d9abe8c'

function getUserIdFromCookies(request: NextRequest): string {
  try {
    const supabaseCookies = request.cookies.getAll().filter(c => c.name.includes('-auth-token'))
    for (const cookie of supabaseCookies) {
      try {
        const rawValue = decodeURIComponent(cookie.value)
        let accessToken: string | null = null
        try {
          const parsed = JSON.parse(rawValue)
          accessToken = parsed?.access_token || null
        } catch {
          accessToken = rawValue
        }
        if (!accessToken) continue
        const parts = accessToken.split('.')
        if (parts.length !== 3) continue
        const payload = JSON.parse(atob(parts[1]))
        if (payload?.sub) return payload.sub as string
      } catch {
        continue
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_USER_ID
}

// GET /api/conversations - List conversations for a user
export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromCookies(request)
    const { searchParams } = new URL(request.url)
    const databaseId = searchParams.get('databaseId')

    const admin = getSupabaseAdmin()
    if (!admin) {
      // Prisma-backed durable storage (survives server restarts)
      try {
        let conversations = await listConversationsPrisma(userId)
        if (databaseId) {
          conversations = conversations.filter(c => c.database_id === databaseId)
        }
        return NextResponse.json({ conversations })
      } catch (err) {
        console.warn('[Conversations API] Prisma failed, falling back to in-memory:', err)
        let conversations = listConversationsInMemory(userId)
        if (databaseId) {
          conversations = conversations.filter(c => c.database_id === databaseId)
        }
        return NextResponse.json({ conversations })
      }
    }

    let query = admin
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(50)

    if (databaseId) {
      query = query.eq('database_id', databaseId)
    }
    if (userId) {
      query = query.eq('user_id', userId)
    }

    const { data, error } = await query

    if (error) {
      console.warn('[Conversations API] Query error:', error.message)
      return NextResponse.json({ conversations: [] })
    }

    // For each conversation, also fetch its messages
    const conversationsWithMessages = await Promise.all(
      (data || []).map(async (conv) => {
        const { data: messages } = await admin
          .from('messages')
          .select('*')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: true })

        return { ...conv, messages: messages || [] }
      })
    )

    return NextResponse.json({ conversations: conversationsWithMessages })
  } catch (err) {
    console.error('[Conversations API] Error:', err)
    return NextResponse.json({ conversations: [] })
  }
}

// POST /api/conversations - Create or update conversation with messages
export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromCookies(request)
    const body = await request.json()
    const { id, databaseId, title, messages: messageData, userId: bodyUserId } = body

    const admin = getSupabaseAdmin()
    if (!admin) {
      // Prisma-backed durable storage
      let conversationId = id
      try {
        if (!conversationId) {
          const conv = await createConversationPrisma(userId, {
            database_id: databaseId || null,
            title: title || 'New Conversation',
            user_id: bodyUserId || userId,
            status: 'active',
            agent_mode: 'orchestrator',
          })
          conversationId = conv.id
        }
        if (messageData && Array.isArray(messageData) && messageData.length > 0) {
          await addMessagesPrisma(userId, conversationId, messageData)
        }
        return NextResponse.json({ conversationId })
      } catch (err) {
        console.warn('[Conversations API] Prisma failed, falling back to in-memory:', err)
        // In-memory fallback
        if (!conversationId) {
          const conv = createConversationInMemory(userId, {
            database_id: databaseId || null,
            title: title || 'New Conversation',
            user_id: bodyUserId || userId,
            status: 'active',
            agent_mode: 'orchestrator',
          })
          conversationId = conv.id
        }
        if (messageData && Array.isArray(messageData) && messageData.length > 0) {
          addMessagesInMemory(userId, conversationId, messageData)
        }
        return NextResponse.json({ conversationId })
      }
    }

    let conversationId = id

    // Create conversation if no ID
    if (!conversationId) {
      const { data: conv, error: convError } = await admin
        .from('conversations')
        .insert({
          database_id: databaseId || null,
          title: title || 'New Conversation',
          user_id: bodyUserId || userId,
          status: 'active',
          agent_mode: 'orchestrator',
        })
        .select()
        .single()

      if (convError) {
        console.error('[Conversations API] Insert error:', convError.message)
        return NextResponse.json({ error: convError.message }, { status: 500 })
      }
      conversationId = conv.id
    }

    // Insert messages if provided
    if (messageData && Array.isArray(messageData) && messageData.length > 0) {
      const messagesToInsert = messageData.map((msg: { role: string; content: string; agentName?: string }) => ({
        conversation_id: conversationId,
        role: msg.role,
        content: msg.content,
        agent_name: msg.agentName || null,
      }))

      const { error: msgError } = await admin
        .from('messages')
        .insert(messagesToInsert)

      if (msgError) {
        console.error('[Conversations API] Messages insert error:', msgError.message)
      }
    }

    return NextResponse.json({ conversationId })
  } catch (err) {
    console.error('[Conversations API] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/conversations - Delete a conversation
export async function DELETE(request: NextRequest) {
  try {
    const userId = getUserIdFromCookies(request)
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Conversation ID is required' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()
    if (!admin) {
      // Prisma-backed durable storage
      try {
        const ok = await deleteConversationPrisma(userId, id)
        if (!ok) {
          // Try in-memory as fallback
          const okInMem = deleteConversationInMemory(userId, id)
          if (!okInMem) {
            return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
          }
        }
        return NextResponse.json({ success: true })
      } catch (err) {
        console.warn('[Conversations API] Prisma delete failed, falling back to in-memory:', err)
        const okInMem = deleteConversationInMemory(userId, id)
        if (!okInMem) {
          return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
        }
        return NextResponse.json({ success: true })
      }
    }

    // Delete messages first
    await admin.from('messages').delete().eq('conversation_id', id)

    // Then delete conversation
    const { error } = await admin.from('conversations').delete().eq('id', id)

    if (error) {
      console.error('[Conversations API] Delete error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Conversations API] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
