import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAuthRequired } from '@/lib/server/auth'

// ─── Health check ───
// Public endpoint for uptime monitors / load balancers. It reports only
// coarse status (no error messages, secrets or env-var names) and never calls
// the paid AI API. 200 = healthy/degraded, 503 = unhealthy.

export const dynamic = 'force-dynamic'

type Check = 'ok' | 'not_configured' | 'error'

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))])
}

async function checkStorage(): Promise<{ backend: 'prisma'; status: Check }> {
  try {
    await withTimeout(db.$queryRawUnsafe('SELECT 1'), 3000)
    return { backend: 'prisma', status: 'ok' }
  } catch {
    return { backend: 'prisma', status: process.env.DATABASE_URL ? 'error' : 'not_configured' }
  }
}

export async function GET() {
  const storage = await checkStorage()
  const ai: Check = process.env.DEEPSEEK_API_KEY ? 'ok' : 'not_configured'
  const auth: Check = isAuthRequired() ? 'ok' : 'not_configured'

  const encryption: 'ok' | 'missing' | 'not_configured' = process.env.CONNECTION_ENCRYPTION_KEY
    ? 'ok'
    : process.env.NODE_ENV === 'production' ? 'missing' : 'not_configured'

  const status = storage.status === 'error'
    ? 'unhealthy'
    : ai !== 'ok' || encryption === 'missing' ? 'degraded' : 'healthy'

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'dev',
      uptime: Math.round(process.uptime()),
      checks: { storage: storage.status, storageBackend: storage.backend, ai, auth, encryption },
    },
    { status: status === 'unhealthy' ? 503 : 200, headers: { 'Cache-Control': 'no-store' } },
  )
}
