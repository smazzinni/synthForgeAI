import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { Tables } from '@/lib/supabase/types'

// GET /api/conversations - List conversations for a user
export async function GET(request: NextRequest) {
  try {
    const admin = getSupabaseAdmin()
    if (!admin) {
      return NextResponse.json({ conversations: [] })
    }

    const { searchParams } = new URL(request.url)
    const databaseId = searchParams.get('databaseId')
    const userId = searchParams.get('userId')

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

    const { data, error } = await query as { data: Tables<'conversations'>[] | null; error: any }

    if (error) {
      console.warn('[Conversations API] Query error:', error.message)
      return NextResponse.json({ conversations: [] })
    }

    // For each conversation, also fetch its messages
    const conversationsWithMessages = await Promise.all(
      (data || []).map(async (conv: Tables<'conversations'>) => {
        const { data: messages } = await admin
          .from('messages')
          .select('*')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: true }) as { data: Tables<'messages'>[] | null; error: any }

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
    const body = await request.json()
    const { id, databaseId, title, messages: messageData, userId } = body

    const admin = getSupabaseAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'Database service not configured' }, { status: 503 })
    }

    let conversationId = id

    // Create conversation if no ID
    if (!conversationId) {
      const { data: conv, error: convError } = await admin
        .from('conversations')
        .insert({
          database_id: databaseId || null,
          title: title || 'New Conversation',
          user_id: userId || null,
          status: 'active',
          agent_mode: 'orchestrator',
        } as any)
        .select()
        .single() as { data: Tables<'conversations'> | null; error: any }

      if (convError) {
        console.error('[Conversations API] Insert error:', convError.message)
        return NextResponse.json({ error: convError.message }, { status: 500 })
      }
      if (conv) conversationId = conv.id
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
        .insert(messagesToInsert as any)

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
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Conversation ID is required' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()
    if (!admin) {
      return NextResponse.json({ error: 'Database service not configured' }, { status: 503 })
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
