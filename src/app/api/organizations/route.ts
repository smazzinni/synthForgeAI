import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { mockOrganizations } from '@/lib/mock-data'

export async function GET() {
  try {
    const admin = getSupabaseAdmin()
    const { data, error } = await admin.from('organizations').select('*').limit(50)

    if (error) {
      return NextResponse.json({ data: mockOrganizations, source: 'mock' })
    }

    return NextResponse.json({ data, source: 'supabase' })
  } catch {
    return NextResponse.json({ data: mockOrganizations, source: 'mock' })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name } = body

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    try {
      const admin = getSupabaseAdmin()
      const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

      const { data, error } = await admin
        .from('organizations')
        .insert({ name, slug, plan: 'free' })
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ data })
    } catch {
      return NextResponse.json({
        data: {
          id: 'org-' + Date.now(),
          name,
          slug: name.toLowerCase().replace(/\s+/g, '-'),
          plan: 'free',
        },
        source: 'mock',
      })
    }
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
