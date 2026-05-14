import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { isAuthEnabled } from '@/lib/supabase'

// POST /api/auth/seed - Create demo user for testing
export async function POST() {
  try {
    const demoEmail = 'demo@synthforge.ai'
    const demoPassword = 'Demo@1234'

    let supabaseId = 'demo-supabase-id'

    // If auth is enabled, create user in Supabase
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

    // Create demo profile in Supabase
    try {
      const supabase = getSupabaseAdmin()
      await supabase.from('profiles').upsert({
        id: supabaseId,
        email: demoEmail,
        full_name: 'Demo User',
        role: 'owner',
      })
    } catch {
      // Profile creation is optional
    }

    return NextResponse.json({
      message: 'Demo user ready',
      credentials: { email: demoEmail, password: demoPassword },
      user: { id: supabaseId, email: demoEmail, name: 'Demo User', tenantId: 'demo-tenant' },
    }, { status: 201 })
  } catch (error) {
    console.error('[Auth Seed] Error:', error)
    return NextResponse.json({ error: 'Failed to create demo user' }, { status: 500 })
  }
}
