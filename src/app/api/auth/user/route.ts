import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, AuthError } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)

    return NextResponse.json({
      user: {
        id: user.userId,
        email: user.email,
        full_name: user.name,
        role: user.role,
      },
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    const body = await request.json() as { name?: string; avatarUrl?: string }

    // For now, return the user with the updated name
    // In production, this would update the Supabase profiles table
    return NextResponse.json({
      user: {
        id: user.userId,
        email: user.email,
        full_name: body.name || user.name,
        role: user.role,
      },
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
