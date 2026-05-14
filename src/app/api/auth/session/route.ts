import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ user: null, authenticated: false })
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name,
      },
      authenticated: true,
    })
  } catch {
    // Dev mode fallback
    return NextResponse.json({
      user: {
        id: 'dev-user-id',
        email: 'demo@synthforge.ai',
        full_name: 'Demo User',
      },
      authenticated: true,
      dev: true,
    })
  }
}
