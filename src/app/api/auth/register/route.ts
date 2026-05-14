import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'
import { db } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      email?: string
      password?: string
      name?: string
      tenantId?: string
    }

    const { email, password, name, tenantId } = body

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    // Check if auth is enabled
    if (process.env.NEXT_PUBLIC_AUTH_ENABLED !== 'true') {
      return NextResponse.json({ error: 'Auth is disabled in dev mode' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    const supabaseId = authData.user.id
    const userTenantId = tenantId || `tenant-${Date.now()}`

    // Create local user record
    const user = await db.user.create({
      data: {
        email,
        name: name || email.split('@')[0],
        supabaseId,
        tenantId: userTenantId,
        role: 'user',
      },
    })

    // Create default workspace for the user
    const workspaceSlug = `${(name || email.split('@')[0]).toLowerCase().replace(/[^a-z0-9]/g, '-')}-workspace`
    const workspace = await db.workspace.create({
      data: {
        name: `${name || email.split('@')[0]}'s Workspace`,
        slug: workspaceSlug,
        userId: user.id,
      },
    })

    // Create default project
    const project = await db.project.create({
      data: {
        name: 'My First Project',
        description: 'Default project for getting started',
        workspaceId: workspace.id,
      },
    })

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        tenantId: user.tenantId,
        role: user.role,
      },
      workspace: { id: workspace.id, name: workspace.name },
      project: { id: project.id, name: project.name },
    }, { status: 201 })
  } catch (error) {
    console.error('[Auth Register] Error:', error)
    const msg = error instanceof Error ? error.message : 'Registration failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
