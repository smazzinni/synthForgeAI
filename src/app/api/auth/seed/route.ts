import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSupabaseAdmin, isAuthEnabled } from '@/lib/supabase'

// POST /api/auth/seed - Create demo user for testing
export async function POST() {
  try {
    const demoEmail = 'demo@synthforge.ai'
    const demoPassword = 'Demo@1234'

    // Check if demo user already exists locally
    const existing = await db.user.findUnique({ where: { email: demoEmail } })

    if (existing) {
      return NextResponse.json({
        message: 'Demo user already exists',
        credentials: { email: demoEmail, password: demoPassword },
        user: { id: existing.id, email: existing.email, name: existing.name, tenantId: existing.tenantId },
      })
    }

    let supabaseId = 'demo-supabase-id'

    // If auth is enabled, create user in Supabase too
    if (isAuthEnabled()) {
      try {
        const supabase = getSupabaseAdmin()
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: demoEmail,
          password: demoPassword,
          email_confirm: true,
        })

        if (authError) {
          console.error('[Auth Seed] Supabase user creation error:', authError.message)
          // Try to find existing user in Supabase
          const { data: { users } } = await supabase.auth.admin.listUsers()
          const existingSupabaseUser = users?.find(u => u.email === demoEmail)
          if (existingSupabaseUser) {
            supabaseId = existingSupabaseUser.id
          } else {
            return NextResponse.json({
              error: 'Failed to create Supabase user: ' + authError.message,
              hint: 'Try disabling auth (NEXT_PUBLIC_AUTH_ENABLED=false) for local development',
            }, { status: 500 })
          }
        } else {
          supabaseId = authData.user.id
        }
      } catch (err) {
        console.error('[Auth Seed] Supabase error:', err)
        return NextResponse.json({
          error: 'Supabase connection failed. Set NEXT_PUBLIC_AUTH_ENABLED=false for local dev.',
        }, { status: 500 })
      }
    }

    // Create demo user locally
    const user = await db.user.create({
      data: {
        email: demoEmail,
        name: 'Demo User',
        supabaseId,
        tenantId: 'demo-tenant',
        role: 'admin',
      },
    })

    // Create demo workspace
    const workspace = await db.workspace.create({
      data: {
        name: 'Demo Workspace',
        slug: 'demo-workspace',
        userId: user.id,
      },
    })

    // Create demo project
    const project = await db.project.create({
      data: {
        name: 'Sample Project',
        description: 'Demo project for testing SynthForge AI',
        workspaceId: workspace.id,
      },
    })

    // Create demo database
    const database = await db.database.create({
      data: {
        name: 'Sample Database',
        dbType: 'postgresql',
        schemaJson: JSON.stringify({
          users: { columns: { id: 'INTEGER', name: 'VARCHAR(255)', email: 'VARCHAR(255)', role: 'VARCHAR(50)', created_at: 'TIMESTAMP' } },
          orders: { columns: { id: 'INTEGER', user_id: 'INTEGER', total: 'DECIMAL(10,2)', status: 'VARCHAR(50)', created_at: 'TIMESTAMP' } },
        }),
        dataJson: '{}',
        projectId: project.id,
      },
    })

    return NextResponse.json({
      message: 'Demo user created successfully',
      credentials: { email: demoEmail, password: demoPassword },
      user: { id: user.id, email: user.email, name: user.name, tenantId: user.tenantId },
      workspace: { id: workspace.id, name: workspace.name },
      project: { id: project.id, name: project.name },
      database: { id: database.id, name: database.name },
    }, { status: 201 })
  } catch (error) {
    console.error('[Auth Seed] Error:', error)
    return NextResponse.json({ error: 'Failed to create demo user' }, { status: 500 })
  }
}
