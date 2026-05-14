import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, isAuthEnabled } from '@/lib/supabase'
import { db } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      email?: string
      password?: string
    }

    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    // Dev mode: skip Supabase auth, use local user only
    if (!isAuthEnabled()) {
      let localUser = await db.user.findFirst()
      if (!localUser) {
        localUser = await db.user.create({
          data: {
            email: 'dev@synthforge.ai',
            name: 'Dev User',
            supabaseId: 'dev-local',
            tenantId: 'dev-tenant',
            role: 'admin',
          },
        })

        // Create workspace for dev user
        const workspace = await db.workspace.create({
          data: { name: 'Dev Workspace', slug: 'dev-workspace', userId: localUser.id },
        })
        await db.project.create({
          data: { name: 'Default Project', description: 'Default project', workspaceId: workspace.id },
        })
      }

      // Set a dev token cookie
      const response = NextResponse.json({
        user: { id: localUser.id, email: localUser.email, name: localUser.name, tenantId: localUser.tenantId, role: localUser.role },
        accessToken: 'dev-token',
        devMode: true,
      })
      response.cookies.set('sb-access-token', 'dev-token', {
        httpOnly: false,
        secure: false,
        sameSite: 'lax',
        maxAge: 86400,
        path: '/',
      })
      return response
    }

    // Production mode: authenticate with Supabase
    const supabase = getSupabaseAdmin()

    // Try to sign in with Supabase
    const { createClient } = await import('@supabase/supabase-js')
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data: authData, error: authError } = await anonClient.auth.signInWithPassword({ email, password })

    if (authError || !authData.user) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    // Get or create local user
    let localUser = await db.user.findUnique({ where: { supabaseId: authData.user.id } })

    if (!localUser) {
      // Auto-create local user if they exist in Supabase but not locally
      localUser = await db.user.create({
        data: {
          email: authData.user.email || email,
          name: authData.user.user_metadata?.name || email.split('@')[0],
          supabaseId: authData.user.id,
          tenantId: `tenant-${Date.now()}`,
          role: 'user',
        },
      })

      // Create workspace
      const workspace = await db.workspace.create({
        data: { name: `${localUser.name}'s Workspace`, slug: `${localUser.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-workspace`, userId: localUser.id },
      })
      await db.project.create({
        data: { name: 'Default Project', description: 'Default project', workspaceId: workspace.id },
      })
    }

    const response = NextResponse.json({
      user: { id: localUser.id, email: localUser.email, name: localUser.name, tenantId: localUser.tenantId, role: localUser.role },
      accessToken: authData.session?.access_token,
    })

    // Set auth cookie
    if (authData.session?.access_token) {
      response.cookies.set('sb-access-token', authData.session.access_token, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 86400,
        path: '/',
      })
    }

    return response
  } catch (error) {
    console.error('[Auth Login] Error:', error)
    const msg = error instanceof Error ? error.message : 'Login failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
