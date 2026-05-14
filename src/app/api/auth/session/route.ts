import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, isAuthEnabled } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    // If auth is disabled (dev mode), return dev user
    if (!isAuthEnabled()) {
      return NextResponse.json({
        authenticated: true,
        devMode: true,
        user: {
          id: 'dev',
          email: 'dev@synthforge.ai',
          name: 'Dev User',
          tenantId: 'dev-tenant',
          role: 'admin',
        },
      })
    }

    const user = await requireAuth(request)
    return NextResponse.json({
      authenticated: true,
      user: {
        id: user.userId,
        email: user.email,
        name: user.name,
        tenantId: user.tenantId,
        role: user.role,
      },
    })
  } catch {
    return NextResponse.json({ authenticated: false, user: null }, { status: 200 })
  }
}
