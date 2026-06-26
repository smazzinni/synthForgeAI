import { NextResponse } from 'next/server'

// Track API health over time
const healthHistory: Array<{
  timestamp: number
  status: 'healthy' | 'degraded' | 'unhealthy'
  checks: Record<string, { ok: boolean; latencyMs: number; error?: string }>
}> = []

const MAX_HISTORY = 100 // Keep last 100 health checks

async function checkSupabase(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now()
  try {
    const { getSupabaseAdmin } = await import('@/lib/supabase/admin')
    const admin = getSupabaseAdmin()
    if (!admin) {
      return { ok: false, latencyMs: Date.now() - start, error: 'Admin client not initialized - check env vars' }
    }
    // Simple query to test the connection
    const { error } = await admin.from('profiles').select('id').limit(1)
    if (error) {
      return { ok: false, latencyMs: Date.now() - start, error: error.message }
    }
    return { ok: true, latencyMs: Date.now() - start }
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: (err as Error).message }
  }
}

async function checkAI(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now()
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    const zai = await ZAI.create()
    // Simple test call
    const result = await zai.chat.completions.create({
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 5,
    })
    if (!result.choices?.[0]?.message?.content) {
      return { ok: false, latencyMs: Date.now() - start, error: 'No response from AI' }
    }
    return { ok: true, latencyMs: Date.now() - start }
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: (err as Error).message }
  }
}

function checkEnvVars(): { ok: boolean; latencyMs: number; error?: string } {
  const start = Date.now()
  const missing: string[] = []
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  if (!process.env.SUPABASE_SERVICE_KEY) missing.push('SUPABASE_SERVICE_KEY')

  if (missing.length > 0) {
    return { ok: false, latencyMs: Date.now() - start, error: `Missing env vars: ${missing.join(', ')}` }
  }
  return { ok: true, latencyMs: Date.now() - start }
}

export async function GET() {
  try {
    // Run all checks in parallel
    const [supabaseCheck, aiCheck] = await Promise.all([
      checkSupabase(),
      checkAI(),
    ])
    const envCheck = checkEnvVars()

    const checks = {
      supabase: supabaseCheck,
      ai: aiCheck,
      envVars: envCheck,
    }

    // Determine overall status
    const allOk = Object.values(checks).every(c => c.ok)
    const someOk = Object.values(checks).some(c => c.ok)
    const status: 'healthy' | 'degraded' | 'unhealthy' = allOk ? 'healthy' : someOk ? 'degraded' : 'unhealthy'

    // Record health check
    const record = {
      timestamp: Date.now(),
      status,
      checks,
    }
    healthHistory.push(record)
    if (healthHistory.length > MAX_HISTORY) {
      healthHistory.shift()
    }

    // Calculate failure analysis from recent history
    const recentChecks = healthHistory.slice(-10)
    const failureSummary: Record<string, number> = {}
    for (const check of recentChecks) {
      for (const [name, result] of Object.entries(check.checks)) {
        if (!result.ok) {
          failureSummary[name] = (failureSummary[name] || 0) + 1
        }
      }
    }

    const httpStatus = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503

    return NextResponse.json({
      status,
      timestamp: new Date().toISOString(),
      version: '0.2.0',
      uptime: process.uptime(),
      memory: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
      checks,
      failureAnalysis: Object.keys(failureSummary).length > 0
        ? {
            recentFailures: failureSummary,
            recommendation: getRecommendation(failureSummary),
          }
        : null,
    }, { status: httpStatus })
  } catch (err) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: (err as Error).message,
      },
      { status: 503 }
    )
  }
}

function getRecommendation(failures: Record<string, number>): string {
  const recs: string[] = []
  if (failures.supabase) {
    recs.push('Supabase connection failing: Check NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_KEY in .env.local')
  }
  if (failures.ai) {
    recs.push('AI service failing: Check z-ai-web-dev-sdk configuration and network connectivity')
  }
  if (failures.envVars) {
    recs.push('Missing environment variables: Create .env.local with required Supabase keys')
  }
  return recs.join(' | ')
}
