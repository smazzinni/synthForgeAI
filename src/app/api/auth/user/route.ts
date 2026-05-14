import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/supabase'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    // Get full user profile with workspaces
    const fullUser = await db.user.findUnique({
      where: { id: user.userId },
      include: {
        workspaces: {
          include: {
            projects: {
              include: {
                databases: true,
              },
            },
          },
        },
      },
    })

    if (!fullUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({
      user: {
        id: fullUser.id,
        email: fullUser.email,
        name: fullUser.name,
        avatarUrl: fullUser.avatarUrl,
        tenantId: fullUser.tenantId,
        role: fullUser.role,
        createdAt: fullUser.createdAt,
      },
      workspaces: fullUser.workspaces,
    })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    const body = await request.json() as { name?: string; avatarUrl?: string }

    const updated = await db.user.update({
      where: { id: user.userId },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.avatarUrl && { avatarUrl: body.avatarUrl }),
      },
    })

    return NextResponse.json({
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        avatarUrl: updated.avatarUrl,
        tenantId: updated.tenantId,
        role: updated.role,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
