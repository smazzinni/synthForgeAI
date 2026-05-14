import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { mockWorkspaces } from '@/lib/mock-data'

export async function GET() {
  try {
    const admin = getSupabaseAdmin()
    const { data, error } = await admin.from('workspaces').select('*').limit(50)

    if (error) {
      return NextResponse.json({ data: mockWorkspaces, source: 'mock' })
    }

    return NextResponse.json({ data, source: 'supabase' })
  } catch {
    return NextResponse.json({ data: mockWorkspaces, source: 'mock' })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, organization_id, description } = body

    if (!name || !organization_id) {
      return NextResponse.json({ error: 'Name and organization_id are required' }, { status: 400 })
    }

    try {
      const admin = getSupabaseAdmin()
      const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

      const { data, error } = await admin
        .from('workspaces')
        .insert({ name, organization_id, slug, description })
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ data })
    } catch {
      return NextResponse.json({
        data: {
          id: 'ws-' + Date.now(),
          name,
          organization_id,
          slug: name.toLowerCase().replace(/\s+/g, '-'),
          description,
        },
        source: 'mock',
      })
    }
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
